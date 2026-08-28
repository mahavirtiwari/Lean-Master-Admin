import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';

interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
}

/** "a, b and c" — for the requirements line. */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Set-a-new-password screen — where the emailed reset link lands
 * (/reset-password?userId=…&token=…). The request form (msme-reset-password)
 * only starts the flow; this completes it against POST /auth/reset-password,
 * shared by applicant and staff accounts. Without this route the link fell
 * through to the wildcard and bounced to the landing page.
 */
@Component({
  selector: 'app-msme-reset-complete',
  imports: [MsmeMastheadComponent],
  template: `
    <app-msme-masthead mode="auth" />

    <main class="rp-ground">
      @if (done()) {
        <section class="rp-card">
          <img class="rp-mcls" src="assets/mcls-logo.png" alt="MCLS" />
          <div class="rp-tick"><span>✓</span></div>
          <h1 class="rp-title">Password updated</h1>
          <p class="rp-sub">You can now sign in with your new password.</p>
          <button class="rp-btn" type="button" (click)="goSignIn()">Go to sign in</button>
        </section>
      } @else {
        <section class="rp-card">
          <img class="rp-mcls" src="assets/mcls-logo.png" alt="MCLS" />
          <h1 class="rp-title">Set a new password</h1>
          <p class="rp-sub">for {{ userId() || 'your LEAN account' }}</p>
          <span class="rp-rule"></span>

          @if (!hasToken()) {
            <div class="rp-error" role="alert">
              This reset link is incomplete or has expired. Request a new one from the sign-in screen.
            </div>
            <button class="rp-btn" type="button" (click)="goReset()">Request a new link</button>
          } @else {
            <div class="rp-inner">
              <label class="rp-label" for="pw">NEW PASSWORD <span class="rp-req">*</span></label>
              <div class="rp-field">
                <input id="pw" class="rp-input" [type]="show() ? 'text' : 'password'"
                       autocomplete="new-password" [placeholder]="'At least ' + minLength() + ' characters'"
                       [value]="password()" (input)="password.set($any($event.target).value)" />
                <button class="rp-eye" type="button" (click)="show.set(!show())">{{ show() ? 'Hide' : 'Show' }}</button>
              </div>
              <p class="rp-hint">{{ policyHint() }}</p>

              <label class="rp-label" for="cpw">CONFIRM PASSWORD <span class="rp-req">*</span></label>
              <div class="rp-field">
                <input id="cpw" class="rp-input" [type]="show() ? 'text' : 'password'"
                       autocomplete="new-password" placeholder="Re-enter the password"
                       [value]="confirm()" (input)="confirm.set($any($event.target).value)"
                       (keyup.enter)="submit()" />
              </div>

              @if (error()) { <div class="rp-error" role="alert">{{ error() }}</div> }

              <button class="rp-btn" type="button" [disabled]="busy()" (click)="submit()">
                {{ busy() ? 'Saving…' : 'Set password' }}
              </button>
            </div>
          }
        </section>
      }
    </main>
  `,
  styleUrl: './msme-reset-password.component.scss',
  styles: [
    `
      .rp-eye { background: none; border: none; cursor: pointer; color: #1b4f8a; font-size: 12px; font-weight: 700; }
    `,
  ],
})
export class MsmeResetCompleteComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly base = environment.apiBase;

  readonly userId = signal(this.route.snapshot.queryParamMap.get('userId') ?? '');
  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  readonly password = signal('');
  readonly confirm = signal('');
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly done = signal(false);

  // The policy comes from the server (GET /auth/password-policy), so the screen
  // guides and validates from the same rule Identity enforces — no number is
  // hardcoded here. Defaults keep the form usable until it loads.
  readonly policy = signal<PasswordPolicy>({
    minLength: 8, requireUppercase: true, requireLowercase: true, requireDigit: true, requireSymbol: true,
  });

  constructor() {
    this.http.get<PasswordPolicy>(`${this.base}/auth/password-policy`).subscribe({
      next: (p) => this.policy.set(p),
      error: () => { /* keep the defaults */ },
    });
  }

  minLength(): number {
    return this.policy().minLength;
  }

  /** The requirements line under the field, built from the live policy. */
  policyHint(): string {
    const p = this.policy();
    const bits: string[] = [];
    if (p.requireUppercase && p.requireLowercase) bits.push('an uppercase and a lowercase letter');
    else if (p.requireUppercase) bits.push('an uppercase letter');
    else if (p.requireLowercase) bits.push('a lowercase letter');
    if (p.requireDigit) bits.push('a number');
    if (p.requireSymbol) bits.push('a symbol');

    const base = `At least ${p.minLength} characters`;
    return bits.length ? `${base}, with ${joinAnd(bits)}.` : `${base}.`;
  }

  hasToken(): boolean {
    return this.token.length > 0 && this.userId().length > 0;
  }

  submit(): void {
    if (this.busy()) return;
    const pw = this.password();
    const p = this.policy();

    // Validate against the server-supplied policy, so it always matches what the
    // API will accept.
    if (pw.length < p.minLength) { this.error.set(`Use at least ${p.minLength} characters.`); return; }
    if (p.requireUppercase && !/[A-Z]/.test(pw)) { this.error.set('Include an uppercase letter.'); return; }
    if (p.requireLowercase && !/[a-z]/.test(pw)) { this.error.set('Include a lowercase letter.'); return; }
    if (p.requireDigit && !/\d/.test(pw)) { this.error.set('Include a number.'); return; }
    if (p.requireSymbol && !/[^A-Za-z0-9]/.test(pw)) { this.error.set('Include a symbol.'); return; }
    if (pw !== this.confirm()) { this.error.set('The two passwords do not match.'); return; }

    this.busy.set(true);
    this.error.set(null);

    this.http.post(`${this.base}/auth/reset-password`, {
      userId: this.userId(),
      token: this.token,
      newPassword: pw,
    }).subscribe({
      next: () => { this.busy.set(false); this.done.set(true); },
      error: (r: { error?: { message?: string; errors?: unknown } }) => {
        this.busy.set(false);
        this.error.set(this.firstError(r.error));
      },
    });
  }

  /**
   * Surfaces the real reason. The API answers with either the controller's
   * { message, errors: string[] } or ASP.NET's ProblemDetails
   * { errors: { Field: string[] } }; the old code read neither, so a
   * too-short password showed the misleading "invalid or expired" instead.
   */
  private firstError(e?: { message?: string; errors?: unknown }): string {
    const errs = e?.errors;
    if (Array.isArray(errs) && errs.length) return String(errs[0]);
    if (errs && typeof errs === 'object') {
      const first = Object.values(errs as Record<string, string[]>)[0];
      if (Array.isArray(first) && first.length) return first[0];
    }
    return e?.message ?? 'The reset link is invalid or has expired. Request a new one.';
  }

  /** LEAN IDs sign in on the applicant portal; staff codes on the admin login. */
  private isApplicant(): boolean {
    return this.userId().toUpperCase().startsWith('LEAN');
  }

  goSignIn(): void {
    void this.router.navigate([this.isApplicant() ? '/msme/login' : '/login']);
  }

  goReset(): void {
    void this.router.navigate([this.isApplicant() ? '/msme/reset-password' : '/login']);
  }
}
