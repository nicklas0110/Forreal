import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FireService } from "../fire.service";

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css']
})
export class ForgotPasswordComponent {
  email: string = "";
  emailError: string = "";
  successMessage: string = "";

  constructor(
    public fireService: FireService,
    private router: Router
  ) {}

  validateEmail(): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.email) {
      this.emailError = "Email is required";
      return false;
    } else if (!emailRegex.test(this.email)) {
      this.emailError = "Invalid email format. Must be like: name@domain.com";
      return false;
    }
    return true;
  }

  async resetPassword() {
    this.emailError = "";
    this.successMessage = "";
    
    if (this.validateEmail()) {
      try {
        await this.fireService.resetPassword(this.email);
        this.successMessage = "Password reset email sent! Check your inbox.";
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          this.emailError = "No account found with this email";
        } else {
          this.emailError = error.message;
        }
      }
    }
  }

  goToLogin() {
    this.router.navigate(['/']);
  }
} 