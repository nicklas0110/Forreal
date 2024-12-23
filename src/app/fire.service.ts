import { Injectable, EventEmitter } from '@angular/core';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/storage';
import { config } from './config';
import { GoogleAuthProvider } from 'firebase/auth';

export interface MessageDTO {
  messageContent: string;
  timestamp: Date;
  user: string;
  userId: string;
}

@Injectable({
  providedIn: 'root'
})
export class FireService {
  firebaseApplication;
  firestore: firebase.firestore.Firestore;
  auth: firebase.auth.Auth;
  messages: any[] = [];
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

  async register(email: string, password: string) {
    try {
      await this.auth.signOut();
      const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
      if (userCredential.user) {
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
      await this.auth.signInWithPopup(provider);
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
        this.messages = snapshot.docs.map(doc => ({
          id: doc.id,
          data: doc.data()
        }));

        // Update avatar URLs for all messages
        for (let message of this.messages) {
          try {
            message.avatarURL = await this.getAvatarURL(message.data.userId);
          } catch (error) {
            message.avatarURL = "https://i.kym-cdn.com/entries/icons/facebook/000/034/213/cover2.jpg";
          }
        }

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
      timestamp: new Date(),
      user: this.auth.currentUser?.email + '',
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
}
