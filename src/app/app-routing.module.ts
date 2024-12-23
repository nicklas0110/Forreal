import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { MessageAppComponent } from './messageApp/messageApp.component';
import { PucsComponent } from './pucs/pucs.component';
import { AuthGuard } from './guards/auth.guard';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { EmailVerificationComponent } from './email-verification/email-verification.component';

const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'verify-email', component: EmailVerificationComponent },
  { 
    path: 'messageApp', 
    component: MessageAppComponent,
    canActivate: [AuthGuard]
  },
  { 
    path: 'pucs', 
    component: PucsComponent,
    canActivate: [AuthGuard]
  },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
