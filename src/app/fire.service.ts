import { Injectable, EventEmitter } from '@angular/core';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/storage';
import { config } from './config';
import { GoogleAuthProvider } from 'firebase/auth';

export interface MessageDTO {
  messageContent: string;
  timestamp: firebase.firestore.Timestamp;
  userId: string;
}

export interface MessageData extends MessageDTO {
  username?: string;
  avatarURL?: string;
}

export interface Message {
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
  static readonly DEFAULT_AVATAR = "https://i.kym-cdn.com/entries/icons/facebook/000/034/213/cover2.jpg";

  currentlySignedInUserAvatarURL: string = FireService.DEFAULT_AVATAR;
  messageUserAvatarURL: string = FireService.DEFAULT_AVATAR;
  currentUsername: string = '';
  messagesUpdate: EventEmitter<void> = new EventEmitter<void>();
  private messageSubscription: any;

  // Profile lookups are cached per uid. Without this, every snapshot refetched
  // a user doc and a storage download URL for *each* message in the channel —
  // 2N network calls on every single new message.
  private usernameCache = new Map<string, string>();
  private avatarCache = new Map<string, string>();

  constructor() {
    this.firebaseApplication = firebase.initializeApp(config.firebaseConfig);
    this.firestore = firebase.firestore();
    this.auth = firebase.auth();
    this.storage = firebase.storage();
    
    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        this.subscribeToMessages();
        this.getImageOfSignedInUser();
        this.currentUsername = await this.getUsernameById(user.uid);
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
        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          data: doc.data() as MessageDTO
        }));

        // Resolve each distinct author once, in parallel, rather than once per
        // message in series.
        const userIds = Array.from(new Set(docs.map(doc => doc.data.userId)));
        await Promise.all(userIds.map(userId => Promise.all([
          this.getUsernameById(userId),
          this.getAvatarURL(userId)
        ])));

        this.messages = docs.map(doc => ({
          id: doc.id,
          data: {
            ...doc.data,
            username: this.usernameCache.get(doc.data.userId) || 'Anonymous'
          },
          avatarURL: this.avatarCache.get(doc.data.userId) || FireService.DEFAULT_AVATAR
        }));

        this.messagesUpdate.emit();
      });
  }

  cleanup(): void {
    if (this.messageSubscription) {
      this.messageSubscription();
      this.messageSubscription = null;
    }
    this.messages = [];
    this.currentUsername = '';
    this.usernameCache.clear();
    this.avatarCache.clear();
    this.currentlySignedInUserAvatarURL = FireService.DEFAULT_AVATAR;
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
      this.currentlySignedInUserAvatarURL = FireService.DEFAULT_AVATAR;
    }
  }

  async updateUserImage($event: any) {
    const img = $event.target.files[0];
    const uploadTask = await this.storage
      .ref('avatars')
      .child(this.auth.currentUser?.uid + "")
      .put(img);
    
    this.currentlySignedInUserAvatarURL = await uploadTask.ref.getDownloadURL();
    if (this.auth.currentUser) {
      this.avatarCache.set(this.auth.currentUser.uid, this.currentlySignedInUserAvatarURL);
    }
    
    // Update all message avatars and emit update
    for (let message of this.messages) {
      if (message.data.userId === this.auth.currentUser?.uid) {
        message.avatarURL = this.currentlySignedInUserAvatarURL;
      }
    }
    this.messagesUpdate.emit();
  }

  async getAvatarURL(userId: string): Promise<string> {
    const cached = this.avatarCache.get(userId);
    if (cached) return cached;

    let url = FireService.DEFAULT_AVATAR;
    try {
      url = await this.storage.ref('avatars').child(userId).getDownloadURL();
    } catch (error) {
      // No avatar uploaded. The default is cached too, so this miss isn't
      // retried on every snapshot.
    }

    this.avatarCache.set(userId, url);
    return url;
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
      
      this.usernameCache.set(this.auth.currentUser.uid, newUsername);
      this.currentUsername = newUsername;

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
    const cached = this.usernameCache.get(userId);
    if (cached) return cached;

    let username = 'Anonymous';
    try {
      const userDoc = await this.firestore.collection('users').doc(userId).get();
      username = (userDoc.data() as UserData)?.username || 'Anonymous';
    } catch (error) {
      console.error('Error fetching username:', error);
    }

    this.usernameCache.set(userId, username);
    return username;
  }
}
