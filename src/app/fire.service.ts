import { Injectable, EventEmitter } from '@angular/core';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/storage';
import { config } from './config';
import { GoogleAuthProvider } from 'firebase/auth';

interface MessageDTO {
  messageContent: string;
  timestamp: firebase.firestore.Timestamp;
  userId: string;
}

interface MessageData extends MessageDTO {
  username?: string;
  avatarURL?: string;
}

interface Message {
  id: string;
  data: MessageData;
  avatarURL?: string;
}

interface UserData {
  username: string;
  email: string;
}

@Injectable({
  providedIn: 'root'
})
export class FireService {
  firebaseApplication;
  firestore: firebase.firestore.Firestore;
  auth: firebase.auth.Auth;
  messages: Message[] = [];
  storage: firebase.storage.Storage;
  currentlySignedInUserAvatarURL: string = "https://i.kym-cdn.com/entries/icons/facebook/000/034/213/cover2.jpg";
  messageUserAvatarURL: string = "https://i.kym-cdn.com/entries/icons/facebook/000/034/213/cover2.jpg";
  messagesUpdate: EventEmitter<void> = new EventEmitter<void>();
  private messageSubscription: any;

  constructor() {
    this.firebaseApplication = firebase.initializeApp(config.firebaseConfig);
    this.firestore = firebase.firestore();
    this.auth = firebase.auth();
    this.storage = firebase.storage();
    
    this.auth.onAuthStateChanged((user) => {
      if (user) {
        this.subscribeToMessages();
        this.getImageOfSignedInUser();
      } else {
        this.cleanup();
      }
    });
  }

  async register(email: string, password: string, username: string) {
    try {
      await this.auth.signOut();
      const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
      if (userCredential.user) {
        await this.firestore.collection('users').doc(userCredential.user.uid).set({
          username: username,
          email: email
        });
        await userCredential.user.sendEmailVerification();
        await this.auth.signOut();
      }
    } catch (error) {
      await this.auth.signOut();
      throw error;
    }
  }

  async signIn(email: string, password: string) {
    const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
    if (userCredential.user && !userCredential.user.emailVerified) {
      await this.auth.signOut();
      throw new Error('Please verify your email before logging in.');
    }
  }

  async signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      const result = await this.auth.signInWithPopup(provider);
      if (result.user) {
        // Check if user document exists, if not create it
        const userDoc = await this.firestore.collection('users').doc(result.user.uid).get();
        if (!userDoc.exists) {
          await this.firestore.collection('users').doc(result.user.uid).set({
            username: result.user.email,
            email: result.user.email
          });
        }
      }
    } catch (error: any) {
      throw error;
    }
  }

  async resetPassword(email: string) {
    await this.auth.sendPasswordResetEmail(email);
  }

  async resendVerificationEmail() {
    if (this.auth.currentUser) {
      await this.auth.currentUser.sendEmailVerification();
    }
  }

  signOut() {
    this.auth.signOut();
  }

  private subscribeToMessages(): void {
    this.messageSubscription = this.firestore
      .collection('myChat')
      .orderBy('timestamp', 'asc')
      .onSnapshot(async (snapshot) => {
        const tempMessages: Message[] = [];
        
        for (const doc of snapshot.docs) {
          const messageData = doc.data() as MessageDTO;
          const username = await this.getUsernameById(messageData.userId);
          const avatarURL = await this.getAvatarURL(messageData.userId);
          
          tempMessages.push({
            id: doc.id,
            data: {
              ...messageData,
              username: username
            },
            avatarURL: avatarURL
          });
        }
        
        this.messages = tempMessages;
        this.messagesUpdate.emit();
      });
  }

  cleanup(): void {
    if (this.messageSubscription) {
      this.messageSubscription();
    }
  }

  async sendMessage(sendThisMessage: string) {
    let messageDTO: MessageDTO = {
      messageContent: sendThisMessage,
      timestamp: firebase.firestore.Timestamp.now(),
      userId: this.auth.currentUser?.uid + ''
    };

    await this.firestore
      .collection('myChat')
      .add(messageDTO);
  }

  async deleteMessage(id: string) {
    await this.firestore
      .collection('myChat')
      .doc(id)
      .delete();
  }

  async getImageOfSignedInUser() {
    try {
      this.currentlySignedInUserAvatarURL = await this.storage
        .ref('avatars')
        .child(this.auth.currentUser?.uid + "")
        .getDownloadURL();
    } catch (error) {
      this.currentlySignedInUserAvatarURL = "https://i.kym-cdn.com/entries/icons/facebook/000/034/213/cover2.jpg";
    }
  }

  async updateUserImage($event: any) {
    const img = $event.target.files[0];
    const uploadTask = await this.storage
      .ref('avatars')
      .child(this.auth.currentUser?.uid + "")
      .put(img);
    
    this.currentlySignedInUserAvatarURL = await uploadTask.ref.getDownloadURL();
    
    // Update all message avatars and emit update
    for (let message of this.messages) {
      if (message.data.userId === this.auth.currentUser?.uid) {
        message.avatarURL = this.currentlySignedInUserAvatarURL;
      }
    }
    this.messagesUpdate.emit();
  }

  async getAvatarURL(userId: string): Promise<string> {
    try {
      return await this.storage
        .ref('avatars')
        .child(userId)
        .getDownloadURL();
    } catch (error) {
      return "https://i.kym-cdn.com/entries/icons/facebook/000/034/213/cover2.jpg";
    }
  }

  async updateUsername(newUsername: string) {
    if (this.auth.currentUser) {
      await this.firestore
        .collection('users')
        .doc(this.auth.currentUser.uid)
        .set({ 
          username: newUsername,
          email: this.auth.currentUser.email
        }, { merge: true });
      
      // After updating username, refresh messages to show new username
      const tempMessages = [...this.messages];
      for (let message of tempMessages) {
        if (message.data.userId === this.auth.currentUser.uid) {
          message.data.username = newUsername;
        }
      }
      this.messages = tempMessages;
      this.messagesUpdate.emit();
    }
  }

  async getUsernameById(userId: string): Promise<string> {
    try {
      const userDoc = await this.firestore
        .collection('users')
        .doc(userId)
        .get();
      
      const userData = userDoc.data() as UserData;
      return userData?.username || 'Anonymous';
    } catch (error) {
      console.error('Error fetching username:', error);
      return 'Anonymous';
    }
  }
}
