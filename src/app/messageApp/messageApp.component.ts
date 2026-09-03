import { Component, ViewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { FireService } from "../fire.service";

/** A message prepared for rendering: grouping and day breaks resolved up front. */
export interface ChatEntry {
  id: string;
  userId: string;
  username: string;
  avatarURL: string;
  content: string;
  timestamp: Date | null;
  isOwn: boolean;
  /** False when this message continues the previous author's block. */
  startsGroup: boolean;
  /** Set on the first message of a new day; renders a divider above it. */
  dayLabel: string | null;
}

@Component({
  selector: 'messageApp-root',
  templateUrl: './messageApp.component.html',
  styleUrls: ['./messageApp.component.css']
})
export class MessageAppComponent implements OnInit, OnDestroy {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLElement>;
  @ViewChild('composer') private composer!: ElementRef<HTMLTextAreaElement>;

  sendThisMessage: string = '';
  entries: ChatEntry[] = [];
  sending: boolean = false;
  sendError: string = '';

  isEditingUsername: boolean = false;
  editUsername: string = '';

  /** True while the view is pinned to the newest message. */
  private atBottom: boolean = true;
  showJumpToPresent: boolean = false;

  /** Messages closer together than this from one author render as one block. */
  private readonly GROUP_WINDOW_MS = 5 * 60 * 1000;
  private readonly STICK_THRESHOLD_PX = 120;
  readonly MAX_MESSAGE_LENGTH = 2000;

  private subscription!: Subscription;

  constructor(public fireService: FireService) {}

  ngOnInit(): void {
    this.buildEntries();
    this.subscription = this.fireService.messagesUpdate.subscribe(() => {
      const wasAtBottom = this.atBottom;
      this.buildEntries();
      // Only yank the view down if the reader was already at the bottom —
      // otherwise scrolling back through history is impossible.
      setTimeout(() => {
        if (wasAtBottom) {
          this.scrollToBottom();
        } else {
          this.showJumpToPresent = true;
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  // ----- Message list ---------------------------------------------------------

  private buildEntries(): void {
    const currentUid = this.fireService.auth.currentUser?.uid;
    const entries: ChatEntry[] = [];
    let previous: ChatEntry | null = null;

    for (const message of this.fireService.messages) {
      const timestamp = this.toDate(message.data.timestamp);
      const dayLabel = this.isSameDay(timestamp, previous?.timestamp ?? null)
        ? null
        : this.formatDayLabel(timestamp);

      const startsGroup =
        !previous ||
        !!dayLabel ||
        previous.userId !== message.data.userId ||
        !this.withinGroupWindow(previous.timestamp, timestamp);

      const entry: ChatEntry = {
        id: message.id,
        userId: message.data.userId,
        username: message.data.username || 'Anonymous',
        avatarURL: message.avatarURL || FireService.DEFAULT_AVATAR,
        content: message.data.messageContent,
        timestamp,
        isOwn: message.data.userId === currentUid,
        startsGroup,
        dayLabel
      };

      entries.push(entry);
      previous = entry;
    }

    this.entries = entries;
  }

  private toDate(timestamp: any): Date | null {
    // A message written locally can be read back before the server timestamp
    // resolves, so this has to tolerate a missing value.
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    return null;
  }

  private isSameDay(a: Date | null, b: Date | null): boolean {
    if (!a || !b) return false;
    return a.toDateString() === b.toDateString();
  }

  private withinGroupWindow(previous: Date | null, current: Date | null): boolean {
    if (!previous || !current) return false;
    return current.getTime() - previous.getTime() < this.GROUP_WINDOW_MS;
  }

  private formatDayLabel(date: Date | null): string {
    if (!date) return 'Unknown date';

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString(undefined, {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  /** "Today at 14:32" — the header stamp on the first message of a block. */
  formatStamp(date: Date | null): string {
    if (!date) return 'Sending…';
    return `${this.formatDayLabel(date)} at ${this.formatTime(date)}`;
  }

  /** "14:32" — the hover stamp shown beside grouped messages. */
  formatTime(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  trackByEntry(_index: number, entry: ChatEntry): string {
    return entry.id;
  }

  // ----- Composer -------------------------------------------------------------

  async sendMessage(): Promise<void> {
    const content = this.sendThisMessage.trim();
    if (!content || this.sending) return;

    this.sending = true;
    this.sendError = '';

    try {
      await this.fireService.sendMessage(content);
      this.sendThisMessage = '';
      this.resetComposerHeight();
      this.atBottom = true;
      setTimeout(() => this.scrollToBottom());
    } catch (error) {
      console.error('Could not send message:', error);
      this.sendError = 'Message failed to send. Try again.';
    } finally {
      this.sending = false;
    }
  }

  /** Enter sends, Shift+Enter starts a new line. */
  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  /** Grows the textarea with its content, up to a cap. */
  autoGrow(): void {
    const el = this.composer?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }

  private resetComposerHeight(): void {
    const el = this.composer?.nativeElement;
    if (el) el.style.height = 'auto';
  }

  async deleteMessage(id: string): Promise<void> {
    try {
      await this.fireService.deleteMessage(id);
    } catch (error) {
      console.error('Could not delete message:', error);
    }
  }

  // ----- Scrolling ------------------------------------------------------------

  onScroll(): void {
    const el = this.scrollContainer?.nativeElement;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.atBottom = distanceFromBottom <= this.STICK_THRESHOLD_PX;
    if (this.atBottom) this.showJumpToPresent = false;
  }

  scrollToBottom(): void {
    const el = this.scrollContainer?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    this.atBottom = true;
    this.showJumpToPresent = false;
  }

  // ----- User panel -----------------------------------------------------------

  startEditingUsername(): void {
    this.editUsername = this.fireService.currentUsername;
    this.isEditingUsername = true;
  }

  cancelEditingUsername(): void {
    this.isEditingUsername = false;
  }

  async saveUsername(): Promise<void> {
    const name = this.editUsername.trim();
    if (name && name !== this.fireService.currentUsername) {
      await this.fireService.updateUsername(name);
      this.buildEntries();
    }
    this.isEditingUsername = false;
  }

  signOut(): void {
    this.fireService.signOut();
  }
}
