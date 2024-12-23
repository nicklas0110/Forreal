import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FireService } from "../fire.service";

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  email: string = "";
  password: string = "";
  username: string = "";
  emailError: string = "";
  passwordError: string = "";
  usernameError: string = "";

  constructor(
    public fireService: FireService,
    private router: Router
  ) {}

  validateForm(): boolean {
    let isValid = true;
    this.emailError = "";
    this.passwordError = "";
    this.usernameError = "";

    // Username validation
    if (!this.username) {
      this.usernameError = "Username is required";
      isValid = false;
    } else if (this.username.length < 3) {
      this.usernameError = "Username must be at least 3 characters";
      isValid = false;
    } else if (this.username.length > 20) {
      this.usernameError = "Username must be less than 20 characters";
      isValid = false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.email) {
      this.emailError = "Email is required";
      isValid = false;
    } else if (!emailRegex.test(this.email)) {
      this.emailError = "Invalid email format. Must be like: name@domain.com";
      isValid = false;
    }

    if (!this.password) {
      this.passwordError = "Password is required";
      isValid = false;
    } else if (this.password.length < 6) {
      this.passwordError = "Password must be at least 6 characters";
      isValid = false;
    }

    return isValid;
  }

  async register() {
    if (this.validateForm()) {
      try {
        await this.fireService.auth.signOut();
        await this.fireService.register(this.email, this.password, this.username);
        sessionStorage.setItem('registeredEmail', this.email);
        sessionStorage.setItem('tempPassword', this.password);
        this.router.navigate(['/verify-email']);
      } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
          this.emailError = "Email already in use";
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