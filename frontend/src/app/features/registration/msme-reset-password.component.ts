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
    <!-- The public header the registration flow uses, so reset password sits
         in the same shell rather than a bare page. -->
    <header class="pub-head">
      <img class="head-lean" src="assets/mcls-logo.png"
           alt="MSME Competitive (LEAN) Scheme — MCLS" />
      <span class="head-rule"></span>
      <a href="https://www.msme.gov.in/" target="_blank" rel="noopener noreferrer" title="Ministry of MSME">
        <img class="head-logo" src="assets/msme-logo.svg"
             alt="Ministry of Micro, Small &amp; Medium Enterprises" />
      </a>

      <div class="spacer"></div>

      <button class="head-link" type="button" (click)="manualVideo()">User Manual</button>
      <span class="head-sep">|</span>
      <button class="head-link" type="button" (click)="help()">Help</button>

      <button class="head-signin" type="button" (click)="backToLogin()">Sign in</button>
    </header>

    <main class="pub-body">
      <h1 class="page-title">Reset password</h1>
      <p class="page-sub">Recover access to your LEAN account</p>
      <span class="page-rule"></span>

    <div class="wrap">
      @if (sent()) {
        <section class="card">
          <div class="tickwrap"><div class="tick">✓</div></div>
          <p class="p">
            If <b>{{ leanId().trim() }}</b> is a registered account, a reset link has been sent to its
            registered SPOC email address. Open the link to set a new password.
          </p>
          <p class="hint">The link expires shortly. Check your spam folder if it does not arrive.</p>
          <button class="btn-primary block" type="button" (click)="backToLogin()">Back to sign in</button>
        </section>
      } @else {
        <section class="card">
          <label class="field-label" for="leanId">LEAN ID or Udyam number <span class="req">*</span></label>
          <input
            id="leanId"
            class="input"
            type="text"
            autocomplete="username"
            placeholder="Enter here"
            [value]="leanId()"
            (input)="leanId.set($any($event.target).value)"
            (keyup.enter)="submit()"
          />
          <p class="hint">Enter either one — both are accepted</p>

          @if (error()) { <div class="login-error" role="alert">{{ error() }}</div> }

          <button class="btn-primary block" type="button" [disabled]="busy()" (click)="submit()">
            {{ busy() ? 'Sending…' : 'Continue ›' }}
          </button>
        </section>

        <section class="card info">
          <div class="info-row">
            <div class="info-icon green">🪪</div>
            <div class="info-text">
              <span class="it-title">You enter a LEAN ID</span>
              <span class="it-sub">The reset link goes straight to that account's SPOC email.</span>
            </div>
          </div>
          <div class="info-div"></div>
          <div class="info-row">
            <div class="info-icon blue">🗂️</div>
            <div class="info-text">
              <span class="it-title">You enter a Udyam number</span>
              <span class="it-sub">Every LEAN ID under it is listed with its plant; pick one and the link goes to that plant's SPOC email.</span>
            </div>
          </div>
        </section>

        <div class="delivery">The reset link is delivered to the account's registered SPOC email.</div>

        <button class="link-back" type="button" (click)="backToLogin()">‹ Back to sign in</button>
      }
    </div>
    </main>
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

  // Header links, matching the registration flow.
  manualVideo(): void {
    window.open('https://lean.msme.gov.in/Home/RegisteredMSME', '_blank', 'noopener');
  }

  help(): void {
    window.open('https://ndie.qcin.org/contact-us/', '_blank', 'noopener');
  }
}
