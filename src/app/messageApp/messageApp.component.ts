import { Component, ViewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { FireService } from "../fire.service";

@Component({
  selector: 'messageApp-root',
  templateUrl: './messageApp.component.html',
  styleUrls: ['./messageApp.component.css']
})
export class MessageAppComponent implements OnInit, OnDestroy {
  title = 'ForReal';
  sendThisMessage: string = "";
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  private subscription!: Subscription;

  constructor(public fireService: FireService) {}

  ngOnInit() {
    this.subscription = this.fireService.messagesUpdate.subscribe(() => {
      setTimeout(() => this.scrollToBottom(), 0);
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  sendMessage() {
    if (this.sendThisMessage.trim()) {
      this.fireService.sendMessage(this.sendThisMessage).then(() => {
        this.sendThisMessage = '';
      });
    }
  }

  deleteMessage(id: any) {
    this.fireService.deleteMessage(id);
  }

  scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch(err) {
      console.error('Scroll to bottom failed:', err);
    }
  }
}
