import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FireService } from "../fire.service";

@Component({
  selector: 'app-email-verification',
  templateUrl: './email-verification.component.html',
  styleUrls: ['./email-verification.component.css']
})
export class EmailVerificationComponent implements OnInit {
  email: string = '';

  constructor(
    public fireService: FireService,
    private router: Router
  ) {}

  ngOnInit() {
    this.email = sessionStorage.getItem('registeredEmail') || '';
    if (!this.email) {
      this.router.navigate(['/']);
    }
  }

  goToLogin() {
    sessionStorage.removeItem('registeredEmail');
    sessionStorage.removeItem('tempPassword');
    this.router.navigate(['/']);
  }
} 