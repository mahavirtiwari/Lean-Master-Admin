import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';

/**
 * MSME applicant sign-in — the counterpart to the admin login at /login.
 *
 * Deliberately a separate screen rather than a shared one. An applicant signs
 * in with a LEAN ID (LEAN-MH-2025-00456), reaches an enterprise dashboard, and
 * arrives from a public registration flow; an administrator signs in with a
 * staff code and reaches the master portal. Putting both on one form would mean
 * one screen explaining two audiences, and would advertise the admin entry
 * point to every applicant.
 *
 * The frame is the administrator screen's: the same 55/45 split, brand wash and
 * card, so the two entry points read as one portal. Only the content differs.
 *
 * The API is the same and the account type decides what the token can reach, so
 * this is a presentation split, not a security boundary — that lives in the
 * permission matrix.
 */
@Component({
  selector: 'app-msme-login',
  imports: [],
  templateUrl: './msme-login.component.html',
  styleUrl: './msme-login.component.scss',
})
export class MsmeLoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  forgotPassword(): void {
    void this.router.navigate(['/msme/reset-password']);
  }

  readonly leanId = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly captchaInput = signal('');
  readonly captcha = signal(makeCaptcha());

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);


  /** Set when assets/msme-logo.svg is absent, so the text lockup takes over. */
  readonly ministryLogoMissing = signal(false);

  readonly year = new Date().getFullYear();

  /** Shown in the footer. Bumped with each release. */
  readonly appVersion = '1.0.0';
  readonly releasedOn = '20 Aug 2026';

  /**
   * The two gears set into the brand panel, drawn rather than shipped as an
   * asset so they scale with the panel and inherit the wash's colours.
   */
  readonly gears = [
    { path: gearPath(150, 158, 118, 96, 14), hub: { cx: 150, cy: 158, r: 42 }, stroke: '#0F7B45' },
    { path: gearPath(292, 292, 78, 62, 11), hub: { cx: 292, cy: 292, r: 27 }, stroke: '#1B4F8A' },
  ];

  /** One registration covers all three levels; this names what each one is. */
  readonly tiers = [
    { label: 'LEVEL 1', value: 'Bronze', note: 'Basic LEAN tools and 5S', colour: '#C2410C' },
    { label: 'LEVEL 2', value: 'Silver', note: 'Flow, quality and upkeep', colour: '#5D6B62' },
    { label: 'LEVEL 3', value: 'Gold', note: 'Full LEAN maturity', colour: '#A16207' },
  ];

  /**
   * The cards under "New to the scheme?". Each accent colour is used three
   * times: the bar down the leading edge, the glyph, and the chevron.
   *
   * `route` is an in-app destination; `href` leaves for a Government portal and
   * so opens in a new tab with rel="noopener".
   */
  readonly quickLinks = [
    {
      title: 'Register your enterprise',
      text: 'Start a new LEAN application with your Udyam number',
      route: '/register',
      href: '',
      accent: '#0F7B45',
      tint: 'var(--green-50)',
      // award ribbon
      icon: 'M5.6 7 4 1.8h8L10.4 7',
      icon2: 'M8 13.4a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z',
    },
    {
      title: 'Udyam Registration',
      text: 'Get a Udyam number before you apply',
      route: '',
      href: 'https://udyamregistration.gov.in/',
      accent: '#1B4F8A',
      tint: 'var(--blue-50)',
      // building
      icon: 'M3 14V3.2A1.2 1.2 0 0 1 4.2 2h5.6A1.2 1.2 0 0 1 11 3.2V14M11 7h2a1 1 0 0 1 1 1v6M2 14h12',
      icon2: 'M5.4 5h3M5.4 8h3M5.4 11h3',
    },
    {
      title: 'Track an application',
      text: 'Check the status of a registration or assessment',
      route: '',
      href: 'https://lean.msme.gov.in/Home/RegisteredMSME',
      accent: '#1B4F8A',
      tint: 'var(--blue-50)',
      // magnifier
      icon: 'M7.3 12.1a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6ZM13.5 13.5l-2.8-2.8',
      icon2: '',
    },
  ];


  /** Each glyph takes its own colour, as the admin sign-in draws it. */
  captchaChars(): { char: string; colour: string }[] {
    const palette = ['var(--blue)', 'var(--green)', 'var(--text-strong)'];
    return [...this.captcha()].map((char, index) => ({
      char,
      colour: palette[index % palette.length],
    }));
  }

  refreshCaptcha(): void {
    this.captcha.set(makeCaptcha());
    this.captchaInput.set('');
  }

  submit(): void {
    const id = this.leanId().trim().toUpperCase();

    if (!id) return this.error.set('Enter your LEAN ID.');
    if (!this.password()) return this.error.set('Enter your password.');

    if (this.captchaInput().trim().toUpperCase() !== this.captcha()) {
      this.error.set('The security code does not match.');
      this.refreshCaptcha();
      return;
    }

    this.busy.set(true);
    this.error.set(null);

    this.auth.login(id, this.password()).subscribe({
      next: () => {
        // Applicants land on their own dashboard, not the admin one.
        void this.router.navigateByUrl('/msme/dashboard');
      },
      error: (r: { error?: { message?: string } }) => {
        this.busy.set(false);
        this.error.set(r.error?.message ?? 'That LEAN ID or password is not correct.');
        // A fresh code each failure, so a replayed form cannot be resubmitted.
        this.refreshCaptcha();
      },
    });
  }

  register(): void {
    void this.router.navigate(['/register']);
  }

  /** A quick-link card: in-app when it carries a route, external otherwise. */
  go(link: { route: string; href: string }): void {
    if (link.route) void this.router.navigateByUrl(link.route);
    else this.open(link.href);
  }

  private open(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * A gear outline: `teeth` trapezoidal teeth between the outer and root radii.
 *
 * Drawn as a closed polygon rather than arcs — at the opacity the watermark
 * uses, the straight root segments are indistinguishable from circular ones and
 * the path stays short enough to sit in the template.
 */
function gearPath(cx: number, cy: number, outer: number, root: number, teeth: number): string {
  const step = (Math.PI * 2) / teeth;
  const half = step * 0.22; // half the tooth's angular width at the tip
  const flank = step * 0.1; // the slope from tip back down to the root circle

  const at = (angle: number, radius: number): string =>
    `${(cx + Math.cos(angle) * radius).toFixed(1)} ${(cy + Math.sin(angle) * radius).toFixed(1)}`;

  const parts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    parts.push(
      at(a - half, outer),
      at(a + half, outer),
      at(a + half + flank, root),
      at(a + step - half - flank, root),
    );
  }

  return `M${parts[0]}L${parts.slice(1).join('L')}Z`;
}

/**
 * Five characters, ambiguous glyphs (O/0, I/1) left out.
 *
 * Same speed bump as the admin sign-in: it stops a naive script, not a
 * determined one. The real brute-force defence is the API's per-IP rate limiter
 * plus Identity lockout, both of which hold regardless of this field.
 */
function makeCaptcha(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(5);
  crypto.getRandomValues(values);

  let code = '';
  for (const value of values) code += alphabet[value % alphabet.length];
  return code;
}
