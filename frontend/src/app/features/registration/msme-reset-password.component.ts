import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';

/**
 * Applicant password reset — the web counterpart of the deck's A04 → A06 flow.
 * The applicant enters a LEAN ID or Udyam number and a reset link is sent to the
 * account's registered SPOC email. The server answers the same way whether or
 * not the ID exists, so the page cannot be used to discover which are registered
 * — which is why the confirmation names "the SPOC email on file" rather than
 * echoing a real address back.
 */
@Component({
  selector: 'app-msme-reset-password',
  imports: [MsmeMastheadComponent],
  template: `
    <app-msme-masthead mode="auth" />

    <main class="rp-ground">
      @if (sent()) {
        <!-- A06 — reset link sent -->
        <section class="rp-card">
          <img class="rp-mcls" src="assets/mcls-logo.png" alt="MCLS" />
          <div class="rp-tick"><span>✓</span></div>
          <h1 class="rp-title">Check your email</h1>
          <p class="rp-sub">Reset link sent to the SPOC mailbox</p>

          <div class="rp-inner">
            <div class="rp-delivered">DELIVERED TO</div>
            <div class="rp-email">the SPOC email on file</div>
            <div class="rp-inner-div"></div>
            <div class="rp-kv"><span class="rp-k">Entered</span><span class="rp-v">{{ leanId().trim() }}</span></div>
          </div>

          <div class="rp-note">
            <span class="rp-note-ic">ⓘ</span>
            The link is valid for a short time and can be used once. Check your spam folder if it has not arrived.
          </div>

          <button class="rp-btn" type="button" (click)="backToLogin()">Back to sign in</button>

          <div class="rp-resend">
            Didn't get it?
            @if (countdown() > 0) {
              <span class="rp-resend-off">Resend in {{ mmss() }}</span>
            } @else {
              <button class="rp-resend-link" type="button" (click)="submit(true)">Resend</button>
            }
          </div>
        </section>
      } @else {
        <!-- A04 — enter LEAN ID / Udyam -->
        <section class="rp-card">
          <img class="rp-mcls" src="assets/mcls-logo.png" alt="MCLS" />
          <h1 class="rp-title">Reset password</h1>
          <p class="rp-sub">Recover access to your LEAN account</p>
          <span class="rp-rule"></span>

          <div class="rp-inner">
            <label class="rp-label" for="leanId">LEAN ID OR UDYAM NUMBER <span class="rp-req">*</span></label>
            <div class="rp-field">
              <span class="rp-field-ic" aria-hidden="true">🪪</span>
              <input
                id="leanId"
                class="rp-input"
                type="text"
                autocomplete="username"
                placeholder="Enter here"
                [value]="leanId()"
                (input)="leanId.set($any($event.target).value)"
                (keyup.enter)="submit()"
              />
            </div>
            <p class="rp-hint">Enter either one — both are accepted</p>

            @if (error()) { <div class="rp-error" role="alert">{{ error() }}</div> }

            <button class="rp-btn" type="button" [disabled]="busy()" (click)="submit()">
              {{ busy() ? 'Sending…' : 'Continue ›' }}
            </button>
          </div>
        </section>

        <section class="rp-help">
          <div class="rp-help-row">
            <span class="rp-help-ic green">🪪</span>
            <span class="rp-help-text">
              <span class="rp-help-t">You enter a LEAN ID</span>
              <span class="rp-help-s">The reset link goes straight to that account's SPOC email.</span>
            </span>
          </div>
          <div class="rp-help-div"></div>
          <div class="rp-help-row">
            <span class="rp-help-ic blue">🗂️</span>
            <span class="rp-help-text">
              <span class="rp-help-t">You enter a Udyam number</span>
              <span class="rp-help-s">Every LEAN ID under it is listed with its plant; pick one and the link goes to that plant's SPOC email.</span>
            </span>
          </div>
        </section>

        <div class="rp-deliver">
          <span class="rp-deliver-ic">✉</span>
          Reset link will be delivered to the account's registered SPOC email.
        </div>

        <button class="rp-backlink" type="button" (click)="backToLogin()">‹ Back to sign in</button>
      }
    </main>
  `,
  styleUrl: './msme-reset-password.component.scss',
})
export class MsmeResetPasswordComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly leanId = signal('');
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);
  readonly countdown = signal(0);

  private timer: ReturnType<typeof setInterval> | null = null;

  submit(resend = false): void {
    if (this.busy()) return;
    if (!this.leanId().trim()) {
      this.error.set('Enter your LEAN ID or Udyam number.');
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
          this.startCountdown();
          if (resend) this.error.set(null);
        },
        error: () => {
          this.busy.set(false);
          this.error.set('The reset could not be started. Check your connection and try again.');
        },
      });
  }

  private startCountdown(): void {
    this.countdown.set(45);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      const n = this.countdown() - 1;
      this.countdown.set(n);
      if (n <= 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
    }, 1000);
  }

  mmss(): string {
    const s = this.countdown();
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  backToLogin(): void {
    void this.router.navigate(['/msme/login']);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
