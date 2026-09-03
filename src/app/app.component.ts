import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
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
  isEditingUsername: boolean = false;
  editUsername: string = "";
  // The game and the chat both provide their own full-viewport chrome, so the
  // global top bar is hidden on those routes.
  private readonly CHROMELESS_ROUTES = ['/pucs', '/messageApp'];
  /** Routes behind AuthGuard — leaving them on sign-out has to be forced. */
  private readonly GUARDED_ROUTES = ['/pucs', '/messageApp'];
  hideChrome: boolean = false;

  constructor(public fireService: FireService, private router: Router) {}

  ngOnInit() {
    this.hideChrome = this.isChromeless(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.hideChrome = this.isChromeless(event.urlAfterRedirects);
      });

    this.fireService.auth.onAuthStateChanged(async (user) => {
      if (user) {
        const userDoc = await this.fireService.firestore
          .collection('users')
          .doc(user.uid)
          .get();
        const userData = userDoc.data() as UserData;
        this.username = userData?.username || user.email || '';
        this.editUsername = this.username;
      } else {
        this.username = '';
        this.editUsername = '';
        // AuthGuard only runs on activation, so signing out while already on a
        // guarded route would otherwise leave a blank page with no way back.
        if (this.GUARDED_ROUTES.some(route => this.router.url.startsWith(route))) {
          this.router.navigate(['/']);
        }
      }
    });
  }

  private isChromeless(url: string): boolean {
    return this.CHROMELESS_ROUTES.some(route => url.startsWith(route));
  }

  startEditingUsername() {
    this.isEditingUsername = true;
    this.editUsername = this.username;
  }

  async saveUsername() {
    if (this.editUsername.trim() && this.editUsername !== this.username) {
      await this.fireService.updateUsername(this.editUsername);
      this.username = this.editUsername;
    }
    this.isEditingUsername = false;
  }
}
