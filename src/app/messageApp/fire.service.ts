import { Injectable, EventEmitter } from '@angular/core';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/storage';
import * as config from '../../../firebaseconfig.js';

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
  messagesUpdate: EventEmitter<void> = new EventEmitter<void>();  // EventEmitter to notify component of updates

  constructor() {
    this.firebaseApplication = firebase.initializeApp(config.firebaseConfig);
    this.firestore = firebase.firestore();
    this.auth = firebase.auth();
    this.storage = firebase.storage();
    this.auth.onAuthStateChanged((user) => {
      if (user) {
        this.getMessages();
        this.getImageOfSignedInUser();
      }
    });
  }

  async getImageOfSignedInUser() {
    this.currentlySignedInUserAvatarURL = await this.storage
      .ref('avatars')
      .child(this.auth.currentUser?.uid+"")
      .getDownloadURL();
  }

  async updateUserImage($event: any) {
    const img = $event.target.files[0];
    const uploadTask = await this.storage
      .ref('avatars')
      .child(this.auth.currentUser?.uid + "")
      .put(img);
    
    this.currentlySignedInUserAvatarURL = await uploadTask.ref.getDownloadURL();
    
    // Refresh messages to update avatars
    await this.getMessages();
  }

  async sendMessage(sendThisMessage: any) {
    let messageDTO: MessageDTO = {
      messageContent: sendThisMessage,
      timestamp: new Date(),
      user: this.auth.currentUser?.email + '',
      avatarURL: this.currentlySignedInUserAvatarURL+''
    };
    await this.firestore
      .collection('myChat')
      .add(messageDTO);
  }

  deleteMessage(id: any) {
    this.firestore
      .collection('myChat')
      .doc(id).delete();
  }

  async getMessages() {
    const snapshot = await this.firestore
      .collection('myChat')
      .orderBy('timestamp', 'asc')
      .get();

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
  }

  async register(email: string, password: string) {
    try {
      // Sign out first to ensure clean state
      await this.auth.signOut();
      const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
      if (userCredential.user) {
        await userCredential.user.sendEmailVerification();
        // Ensure we sign out after registration
        await this.auth.signOut();
      }
    } catch (error) {
      await this.auth.signOut(); // Sign out even if there's an error
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

  signOut() {
    this.auth.signOut();
  }

  async resetPassword(email: string) {
    await this.auth.sendPasswordResetEmail(email);
  }

  async resendVerificationEmail() {
    if (this.auth.currentUser) {
      await this.auth.currentUser.sendEmailVerification();
    }
  }

  async signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await this.auth.signInWithPopup(provider);
    } catch (error: any) {
      throw error;
    }
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

export interface MessageDTO {
  messageContent: string;
  timestamp: Date;
  user: string;
  avatarURL: string;
}
