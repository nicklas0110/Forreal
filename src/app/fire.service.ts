import { Injectable } from '@angular/core';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

import * as config from '../../firebaseconfig.js'

@Injectable({
  providedIn: 'root'
})
export class FireService {

  firebaseApplication;
  firestore: firebase.firestore.Firestore;
  messages: any[] = [];

  constructor() {
    this.firebaseApplication = firebase.initializeApp(config.firebaseConfig);
    this.firestore = firebase.firestore();
    this.getMessages();
  }

  sendMessage(sendThisMessage: any) {
    let messageDTO: MessageDTO = {
      messageContent: sendThisMessage,
      timestamp: new Date(),
      user: 'some user'
    }
    this.firestore
      .collection('myChat')
      .add(messageDTO);
  }

  getMessages() {
    this.firestore
      .collection('myChat')
      .orderBy('timestamp')
      .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          if(change.type=="added") {
          this.messages.push({id: change.doc.id, data: change.doc.data()})
          } if (change.type=='modified') {
            const index : number = this.messages.findIndex(document => document.id != change.doc.id);
            this.messages[index] =
            {id: change.doc.id, data: change.doc.data()}

          } if(change.type=="removed") {
           this.messages = this.messages.filter(m => m.id != change.doc.id);
          }
        })
      })
  }

}

export interface  MessageDTO {
  messageContent: string;
  timestamp: Date;
  user: string;
}
