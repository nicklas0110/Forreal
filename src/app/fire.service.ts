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

export interface PucScoreEntry {
  uid: string;
  username: string;
  bestScore: number;
  date: string;
}

export interface PucLevelProgress {
  id: number;
  stars: number;
  unlocked: boolean;
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

  // ----- Puc Puc persistence -------------------------------------------------

  get currentUid(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }

  /**
   * Writes the run's score to pucScores/{uid}, keeping only the player's best.
   * Runs in a transaction so a lower score can never clobber a higher one.
   * Returns true when this run became the new personal best.
   */
  async savePucScore(score: number): Promise<boolean> {
    const uid = this.currentUid;
    if (!uid) return false;

    const username = await this.getUsernameById(uid);
    const docRef = this.firestore.collection('pucScores').doc(uid);

    return this.firestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(docRef);
      const previousBest = (snapshot.data() as PucScoreEntry | undefined)?.bestScore ?? 0;

      if (snapshot.exists && score <= previousBest) {
        // Keep the best score, but refresh the username in case it changed.
        transaction.set(docRef, { uid, username }, { merge: true });
        return false;
      }

      transaction.set(docRef, {
        uid,
        username,
        bestScore: score,
        date: new Date().toISOString().split('T')[0],
        updatedAt: firebase.firestore.Timestamp.now()
      }, { merge: true });
      return true;
    });
  }

  async getPucLeaderboard(max: number = 10): Promise<PucScoreEntry[]> {
    const snapshot = await this.firestore
      .collection('pucScores')
      .orderBy('bestScore', 'desc')
      .limit(max)
      .get();

    return snapshot.docs.map(doc => {
      const data = doc.data() as Partial<PucScoreEntry>;
      return {
        uid: data.uid || doc.id,
        username: data.username || 'Anonymous',
        bestScore: data.bestScore || 0,
        date: data.date || ''
      };
    });
  }

  async getPucPersonalBest(): Promise<number> {
    const uid = this.currentUid;
    if (!uid) return 0;

    const doc = await this.firestore.collection('pucScores').doc(uid).get();
    return (doc.data() as PucScoreEntry | undefined)?.bestScore ?? 0;
  }

  async savePucStoryProgress(levels: PucLevelProgress[]): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;

    await this.firestore.collection('pucProgress').doc(uid).set({
      levels,
      updatedAt: firebase.firestore.Timestamp.now()
    }, { merge: true });
  }

  async loadPucStoryProgress(): Promise<PucLevelProgress[] | null> {
    const uid = this.currentUid;
    if (!uid) return null;

    const doc = await this.firestore.collection('pucProgress').doc(uid).get();
    const levels = (doc.data() as { levels?: PucLevelProgress[] } | undefined)?.levels;
    return levels ?? null;
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
