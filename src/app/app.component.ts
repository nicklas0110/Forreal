import { Component, OnInit } from '@angular/core';
import { FireService } from "./fire.service";

interface UserData {
  username: string;
  email: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'ForReal';
  sendThisMessage: string = "";
  email: string = "";
  password: string = "";
  username: string = "";

  constructor(public fireService: FireService) {}

  ngOnInit() {
    this.fireService.auth.onAuthStateChanged(async (user) => {
      if (user) {
        const userDoc = await this.fireService.firestore
          .collection('users')
          .doc(user.uid)
          .get();
        const userData = userDoc.data() as UserData;
        this.username = userData?.username || user.email || '';
      }
    });
  }
}
