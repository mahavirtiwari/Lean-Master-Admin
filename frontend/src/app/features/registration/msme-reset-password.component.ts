import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { httpErrorMessage } from '../../shared/http-error';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';

interface ResetAccount {
  leanId: string;
  unitName: string;
  address: string;
  maskedEmail: string;
}

interface AccountsResponse {
  udyam: string | null;
  accounts: ResetAccount[];
}

/**
 * Applicant password reset — the web A04 → A05 → A06 flow.
 *
 * A04: enter a LEAN ID or a Udyam number. A Udyam that covers more than one
 * plant fans out to A05, the account picker, so the applicant chooses which
 * plant's password to reset; a LEAN ID (or a single-plant Udyam) goes straight
 * on. A06 confirms the SPOC mailbox the link was sent to.
 */
@Component({
  selector: 'app-msme-reset-password',
  imports: [MsmeMastheadComponent],
  template: `
    <app-msme-masthead mode="auth" />

    <main class="rp-ground">
      @switch (stage()) {
        <!-- ============================================ A06 — link sent -->
        @case ('sent') {
          <section class="rp-card">
            <img class="rp-mcls" src="assets/mcls-logo.png" alt="MCLS" />
            <div class="rp-tick"><span>✓</span></div>
            <h1 class="rp-title">Check your email</h1>
            <p class="rp-sub">Reset link sent to the SPOC mailbox</p>

            <div class="rp-inner">
              <div class="rp-delivered">DELIVERED TO</div>
              <div class="rp-email">{{ chosen()?.maskedEmail || 'the SPOC email on file' }}</div>
              <div class="rp-inner-div"></div>
              <div class="rp-kv"><span class="rp-k">LEAN ID</span><span class="rp-v">{{ chosen()?.leanId || identifier().trim() }}</span></div>
              @if (chosen()?.unitName) {
                <div class="rp-kv"><span class="rp-k">Plant</span><span class="rp-v">{{ chosen()?.unitName }}</span></div>
              }
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
                <button class="rp-resend-link" type="button" (click)="resend()">Resend</button>
              }
            </div>
          </section>
        }

        <!-- ============================================ A05 — choose account -->
        @case ('choose') {
          <section class="rp-card">
            <img class="rp-mcls" src="assets/mcls-logo.png" alt="MCLS" />
            <h1 class="rp-title">Choose account</h1>
            <p class="rp-sub">Reset password</p>
            <span class="rp-rule"></span>

            <div class="rp-info">
              <span class="rp-info-ic">ⓘ</span>
              {{ accounts().length }} LEAN IDs are registered against {{ udyam() }}. Pick the plant whose password you want to reset.
            </div>

            @for (a of accounts(); track a.leanId) {
              <button
                type="button"
                class="rp-acct"
                [class.is-sel]="selected() === a.leanId"
                (click)="selected.set(a.leanId)"
              >
                <span class="rp-radio" [class.on]="selected() === a.leanId"></span>
                <span class="rp-acct-body">
                  <span class="rp-acct-id">{{ a.leanId }}</span>
                  @if (a.unitName) { <span class="rp-acct-unit">{{ a.unitName }}</span> }
                  @if (a.address) { <span class="rp-acct-addr">{{ a.address }}</span> }
                  <span class="rp-acct-mail">✉ {{ a.maskedEmail }}</span>
                </span>
              </button>
            }

            @if (error()) { <div class="rp-error" role="alert">{{ error() }}</div> }

            <button class="rp-btn" type="button" [disabled]="busy() || !selected()" (click)="sendReset(selected())">
              {{ busy() ? 'Sending…' : 'Send reset link ›' }}
            </button>
            <button class="rp-backlink" type="button" (click)="stage.set('enter')">‹ Back</button>
          </section>
        }

        <!-- ============================================ A04 — enter id -->
        @default {
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
                  [value]="identifier()"
                  (input)="identifier.set($any($event.target).value)"
                  (keyup.enter)="lookup()"
                />
              </div>
              <p class="rp-hint">Enter either one — both are accepted</p>

              @if (error()) { <div class="rp-error" role="alert">{{ error() }}</div> }

              <button class="rp-btn" type="button" [disabled]="busy()" (click)="lookup()">
                {{ busy() ? 'Checking…' : 'Continue ›' }}
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
      }
    </main>
  `,
  styleUrl: './msme-reset-password.component.scss',
})
export class MsmeResetPasswordComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBase;

  readonly stage = signal<'enter' | 'choose' | 'sent'>('enter');
  readonly identifier = signal('');
  readonly udyam = signal<string | null>(null);
  readonly accounts = signal<ResetAccount[]>([]);
  readonly selected = signal<string>('');

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly countdown = signal(0);

  private timer: ReturnType<typeof setInterval> | null = null;

  /** The account behind the current selection, for the A05 note and A06 summary. */
  chosen(): ResetAccount | undefined {
    return this.accounts().find((a) => a.leanId === this.selected());
  }

  /**
   * A04 → resolves the entered value. A Udyam that covers several plants opens
   * the picker (A05); anything else goes straight to sending the link.
   */
  lookup(): void {
    if (this.busy()) return;
    const value = this.identifier().trim();
    if (!value) {
      this.error.set('Enter your LEAN ID or Udyam number.');
      return;
    }

    const isUdyam = value.toUpperCase().startsWith('UDYAM');
    this.busy.set(true);
    this.error.set(null);

    this.http.post<AccountsResponse>(`${this.base}/auth/forgot-password/accounts`, { userId: value }).subscribe({
      next: (res) => {
        this.busy.set(false);
        const list = res.accounts ?? [];
        this.accounts.set(list);
        this.udyam.set(res.udyam);

        if (isUdyam) {
          if (list.length === 0) {
            this.error.set('No LEAN account is registered against that Udyam number.');
            return;
          }
          if (list.length === 1) {
            this.selected.set(list[0].leanId);
            this.sendReset(list[0].leanId);
            return;
          }
          this.selected.set(list[0].leanId);
          this.stage.set('choose');
          return;
        }

        // A LEAN ID (or anything non-Udyam): send straight away. If the account
        // was found we keep it, so A06 can name its plant and masked email.
        if (list.length === 1) this.selected.set(list[0].leanId);
        this.sendReset(value);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        // "could not be checked" for every failure told people their Udyam
        // number was the problem when the portal simply could not reach the API.
        this.error.set(httpErrorMessage(e, 'That could not be checked. Try again in a moment.'));
      },
    });
  }

  /** Sends the reset link for one LEAN ID and moves to A06. */
  sendReset(leanId: string): void {
    if (this.busy() || !leanId) return;
    this.busy.set(true);
    this.error.set(null);

    this.http.post(`${this.base}/auth/forgot-password`, { userId: leanId }).subscribe({
      next: () => {
        this.busy.set(false);
        this.stage.set('sent');
        this.startCountdown();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(httpErrorMessage(e, 'The reset could not be started. Please try again.'));
      },
    });
  }

  resend(): void {
    this.sendReset(this.selected() || this.identifier().trim());
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
