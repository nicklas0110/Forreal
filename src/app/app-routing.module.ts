import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MessageAppComponent } from './messageApp/messageApp.component';
import { PucsComponent } from './pucs/pucs.component';  // Assume you have a PucsComponent

const routes: Routes = [
{ path: 'messageApp', component: MessageAppComponent },
{ path: 'pucs', component: PucsComponent },
{ path: '', redirectTo: '/messageApp', pathMatch: 'full' },  // Redirects to messageApp by default
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
