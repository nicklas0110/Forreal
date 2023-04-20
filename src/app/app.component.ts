import { Component } from '@angular/core';
import {FireService} from "./fire.service";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'fbboss';
  sendThisMessage: any;
  email: string = "";
  password: string ="";
  deleteThisMessage: any;

  constructor(public fireService: FireService) {
  }

  sendMessage(){
    this.fireService.sendMessage(this.sendThisMessage).then(()=>{
      this.sendThisMessage= '';
    });
  }

  deleteMessage(id: any){
    this.fireService.deleteMessage(id);
  }
}
