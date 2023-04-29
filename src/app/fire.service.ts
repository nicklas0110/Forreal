import {Injectable} from '@angular/core';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/storage';

import * as config from '../../firebaseconfig.js'

@Injectable({
  providedIn: 'root'
})
export class FireService {

  firebaseApplication;
  firestore: firebase.firestore.Firestore;
  auth: firebase.auth.Auth;
  messages: any[] = [];
  storage: firebase.storage.Storage;
  currentlySignedInUserAvatarURL: string = "https://cdn.discordapp.com/attachments/526767373449953285/1101056394544807976/image.png";
  messageUserAvatarURL: string = "https://cdn.discordapp.com/attachments/526767373449953285/1101056394544807976/image.png";

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
    })
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
    }
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
        snapshot.docChanges().forEach(change => {
          if (change.type == "added") {
            this.messages.push({id: change.doc.id, data: change.doc.data()})
          }
          if (change.type == 'modified') {
            const index: number = this.messages.findIndex(document => document.id != change.doc.id);
            this.messages[index] =
              {id: change.doc.id, data: change.doc.data()}

          }
          if (change.type == "removed") {
            this.messages = this.messages.filter(m => m.id != change.doc.id);

          }
        })
      })
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
