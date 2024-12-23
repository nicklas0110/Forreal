import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import {MatButton, MatButtonModule} from "@angular/material/button";
import {MatCardModule} from "@angular/material/card";
import {MatIconModule} from "@angular/material/icon";
import {MatInputModule} from "@angular/material/input";
import {MessageAppComponent} from "./messageApp/messageApp.component";
import {PucsComponent} from "./pucs/pucs.component";
import { AppRoutingModule } from './app-routing.module';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { EmailVerificationComponent } from './email-verification/email-verification.component';
import { GoogleAuthProvider } from 'firebase/auth';
@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    RegisterComponent,
    MessageAppComponent,
    PucsComponent,
    ForgotPasswordComponent,
    EmailVerificationComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    CommonModule,
    BrowserAnimationsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatInputModule
  ],
  providers: [
    GoogleAuthProvider
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
