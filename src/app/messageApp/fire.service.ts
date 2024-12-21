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

  async updateUserImage($event) {
    const img = $event.target.files[0];
    const uploadTask = await this.storage
      .ref('avatars')
      .child(this.auth.currentUser?.uid+"")
      .put(img);
    this.currentlySignedInUserAvatarURL = await uploadTask.ref.getDownloadURL();
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

  getMessages() {
    this.firestore
      .collection('myChat')
      .orderBy('timestamp')
      .onSnapshot(snapshot => {
        this.messages = [];
        snapshot.docs.forEach(doc => {
          this.messages.push({id: doc.id, data: doc.data()});
        });
        this.messagesUpdate.emit();
      });
  }

  register(email: string, password: string) {
    this.auth.createUserWithEmailAndPassword(email, password);
  }

  signIn(email: string, password: string) {
    this.auth.signInWithEmailAndPassword(email, password);
  }

  signOut() {
    this.auth.signOut();
  }

}

export interface MessageDTO {
  messageContent: string;
  timestamp: Date;
  user: string;
  avatarURL: string;
}
