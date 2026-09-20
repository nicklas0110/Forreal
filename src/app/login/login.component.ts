import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FireService } from "../fire.service";

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['../auth/auth.css']
})
export class LoginComponent implements OnInit {
  email: string = "";
  password: string = "";
  emailError: string = "";
  passwordError: string = "";
  showPassword: boolean = false;
  /** Blocks double submits and drives the button's pending label. */
  busy: boolean = false;

  constructor(
    public fireService: FireService,
    private router: Router
  ) {}

  ngOnInit() {
    this.fireService.auth.onAuthStateChanged((user) => {
      if (user) {
        this.router.navigate(['/messageApp']);
      }
    });
  }

  validateForm(): boolean {
    let isValid = true;
    this.emailError = "";
    this.passwordError = "";

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.email) {
      this.emailError = "Email is required";
      isValid = false;
    } else if (!this.email.includes('@')) {
      this.emailError = "Email must contain @";
      isValid = false;
    } else if (!this.email.includes('.')) {
      this.emailError = "Email must contain a domain (e.g., .com)";
      isValid = false;
    } else if (!emailRegex.test(this.email)) {
      this.emailError = "Invalid email format. Must be like: name@domain.com";
      isValid = false;
    }

    // Password validation
    if (!this.password) {
      this.passwordError = "Password is required";
      isValid = false;
    } else if (this.password.length < 6) {
      this.passwordError = "Password must be at least 6 characters";
      isValid = false;
    }

    return isValid;
  }

  async signIn() {
    if (this.busy || !this.validateForm()) return;

    this.busy = true;
    try {
      await this.fireService.signIn(this.email, this.password);
    } catch (error: any) {
      // Newer Firebase collapses both cases into invalid-credential.
      if (error.code === 'auth/user-not-found') {
        this.emailError = "User not found";
      } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        this.passwordError = "Incorrect email or password";
      } else if (error.code === 'auth/too-many-requests') {
        this.emailError = "Too many attempts. Try again later.";
      } else {
        this.emailError = error.message;
      }
    } finally {
      this.busy = false;
    }
  }

  async signInWithGoogle() {
    if (this.busy) return;

    this.busy = true;
    this.emailError = "";
    this.passwordError = "";
    try {
      await this.fireService.signInWithGoogle();
      this.router.navigate(['/messageApp']);
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        this.emailError = error.message;
      }
    } finally {
      this.busy = false;
    }
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }

  goToForgotPassword() {
    this.router.navigate(['/forgot-password']);
  }
} 