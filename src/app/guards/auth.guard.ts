import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { FireService } from '../fire.service';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private fireService: FireService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    return new Observable<boolean>(observer => {
      this.fireService.auth.onAuthStateChanged(user => {
        if (user) {
          observer.next(true);
        } else {
          this.router.navigate(['/']);
          observer.next(false);
        }
        observer.complete();
      });
    });
  }
} 