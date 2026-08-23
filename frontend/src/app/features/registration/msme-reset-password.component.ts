import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';

/**
 * Applicant password reset (the web counterpart of the mobile A04 → A06 flow).
 * The applicant enters their LEAN ID and a reset link is sent to that account's
 * registered SPOC email. The server answers the same way whether or not the ID
 * exists, so the page cannot be used to discover which IDs are registered.
 */
@Component({
  selector: 'app-msme-reset-password',
  imports: [],
  template: `
    <header class="app-head">
      <img class="head-lean" src="assets/mcls-logo.png" alt="MSME Competitive (LEAN) Scheme" height="34" />
      <div class="head-title">
        <span class="t1">Reset password</span>
        <span class="t2">Recover access to your LEAN account</span>
      </div>
    </header>

    <div class="wrap">
      @if (sent()) {
        <section class="card">
          <div class="tickwrap"><div class="tick">✓</div></div>
          <h2 class="h">Check your email</h2>
          <p class="p">
            If <b>{{ leanId().trim() }}</b> is a registered account, a reset link has been sent to its
            registered email address. Open the link to set a new password.
          </p>
          <p class="hint">The link expires shortly for security. Check your spam folder if it does not arrive.</p>
          <button class="btn-primary block" type="button" (click)="backToLogin()">Back to sign in</button>
        </section>
      } @else {
        <section class="card">
          <label class="field-label" for="leanId">LEAN ID</label>
          <input
            id="leanId"
            class="input"
            type="text"
            autocomplete="username"
            placeholder="LEAN-XX-YYYY-000000"
            [value]="leanId()"
            (input)="leanId.set($any($event.target).value)"
            (keyup.enter)="submit()"
          />
          <p class="hint">The reset link goes to the account's registered email (the SPOC email for enterprise accounts).</p>

          @if (error()) { <div class="login-error" role="alert">{{ error() }}</div> }

          <button class="btn-primary block" type="button" [disabled]="busy()" (click)="submit()">
            {{ busy() ? 'Sending…' : 'Send reset link' }}
          </button>
          <button class="btn-ghost block" type="button" (click)="backToLogin()">Back to sign in</button>
        </section>
      }
    </div>
  `,
  styleUrl: './msme-reset-password.component.scss',
})
export class MsmeResetPasswordComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly leanId = signal('');
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (this.busy()) return;
    if (!this.leanId().trim()) {
      this.error.set('Enter your LEAN ID.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);

    // Always 200 — the confirmation does not depend on whether the ID exists.
    this.http
      .post(`${environment.apiBase}/auth/forgot-password`, { userId: this.leanId().trim() })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.sent.set(true);
        },
        error: () => {
          this.busy.set(false);
          this.error.set('The reset could not be started. Check your connection and try again.');
        },
      });
  }

  backToLogin(): void {
    void this.router.navigate(['/msme/login']);
  }
}
