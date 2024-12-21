import { Component} from '@angular/core';
import {FireService} from "./messageApp/fire.service";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'ForReal';
  sendThisMessage: string = "";
  email: string = "";
  password: string = "";


  constructor(public fireService: FireService) {}

}
