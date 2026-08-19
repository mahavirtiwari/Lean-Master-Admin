import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { readPreferred } from '../../core/bhashini';

/**
 * The 22 scheduled languages plus English, keyed by the code Bhashini stores in
 * localStorage. Used only to name the current selection next to the picker —
 * the plugin's own button shows a glyph and not which language is active.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  as: 'Assamese',
  bn: 'Bengali',
  brx: 'Bodo',
  doi: 'Dogri',
  gom: 'Konkani',
  gu: 'Gujarati',
  hi: 'Hindi',
  kn: 'Kannada',
  ks: 'Kashmiri',
  mai: 'Maithili',
  ml: 'Malayalam',
  mni: 'Manipuri',
  mr: 'Marathi',
  ne: 'Nepali',
  or: 'Odia',
  pa: 'Punjabi',
  sa: 'Sanskrit',
  sat: 'Santali',
  sd: 'Sindhi',
  ta: 'Tamil',
  te: 'Telugu',
  ur: 'Urdu',
};

/**
 * The sign-in screen (0-Login Screen.svg / 0a-Login Entered.svg).
 *
 * Two panels on a 1512 artboard: the scheme's story and certification pipeline
 * on the left, the credential form on the right.
 *
 * The security-check code is generated and compared in the browser. That is
 * honestly a speed bump, not a CAPTCHA — it stops a naive script, not a
 * determined one. The real brute-force defence is the API's per-IP rate limiter
 * on /api/auth/login plus Identity lockout after five failures, both of which
 * hold regardless of what this field does.
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** The language Bhashini is currently showing the page in. */
  readonly currentLanguage = signal(languageName(readPreferred()));

  /** Set when assets/msme-logo.svg is absent, so the text lockup takes over. */
  readonly ministryLogoMissing = signal(false);




  readonly userId = signal('');
  readonly password = signal('');
  readonly captchaInput = signal('');
  readonly keepSignedIn = signal(false);
  readonly showPassword = signal(false);

  readonly captcha = signal(makeCaptcha());
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly year = new Date().getFullYear();

  /**
   * The left panel's content is fixed marketing copy on the design rather than
   * anything the API serves, so it is declared here instead of fetched. The
   * pipeline figures are the deck's illustrative numbers for FY 2026-27.
   */
  readonly tiers = [
    { label: 'LEAN BRONZE', value: '12,450', delta: '+8.2%' },
    { label: 'LEAN SILVER', value: '5,680', delta: '+12.4%' },
    { label: 'LEAN GOLD', value: '1,890', delta: '+5.1%' },
  ];

  /**
   * The three cards under "New to the scheme?". Each carries an accent colour
   * used three times on the artboard: the 3.5 px bar down its left edge, the
   * glyph, and the chevron in its trailing button.
   *
   * All three point at Government portals outside this application, so they
   * open in a new tab and carry rel="noopener" — the admin session must not be
   * left reachable through window.opener from another origin.
   */
  readonly quickLinks = [
    {
      title: 'Udyam Registration',
      text: 'Register your enterprise on the Udyam portal',
      href: 'https://udyamregistration.gov.in/',
      accent: '#1B4F8A',
      tint: 'var(--blue-50)',
      // building
      icon: 'M3 14V3.2A1.2 1.2 0 0 1 4.2 2h5.6A1.2 1.2 0 0 1 11 3.2V14M11 7h2a1 1 0 0 1 1 1v6M2 14h12',
      icon2: 'M5.4 5h3M5.4 8h3M5.4 11h3',
    },
    {
      title: 'LEAN Scheme Registration',
      text: 'For MSMEs applying to the LEAN scheme',
      href: 'https://lean.msme.gov.in/VerifyUdyam/Register',
      accent: '#0F7B45',
      tint: 'var(--green-50)',
      // award ribbon
      icon: 'M5.6 7 4 1.8h8L10.4 7',
      icon2: 'M8 13.4a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z',
    },
    {
      title: 'Track an Application',
      text: 'Check the status of a registration or assessment',
      href: 'https://lean.msme.gov.in/Home/RegisteredMSME',
      accent: '#1B4F8A',
      tint: 'var(--blue-50)',
      // magnifier
      icon: 'M7.3 12.1a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6ZM13.5 13.5l-2.8-2.8',
      icon2: '',
    },
  ];

  /** The three trust marks under the card, each with its own glyph. */
  readonly assurances = [
    {
      title: '256-bit TLS',
      text: 'Encrypted session',
      icon: 'M3.6 7.2h8.8v6.4H3.6zM5.6 7.2V5.2a2.4 2.4 0 0 1 4.8 0v2',
    },
    {
      title: 'Audit logged',
      text: 'Every action recorded',
      icon: 'M5.4 3H4.2A1.2 1.2 0 0 0 3 4.2v9.4A1.2 1.2 0 0 0 4.2 14.8h7.6a1.2 1.2 0 0 0 1.2-1.2V4.2A1.2 1.2 0 0 0 11.8 3h-1.2M5.8 1.8h4.4v2.6H5.8zM5.8 9.4 7.2 10.8 10.4 7.6',
    },
    {
      title: 'Government of India',
      text: 'Ministry of MSME',
      icon: 'M1.8 6.2 8 2.6l6.2 3.6M3.2 6.6v6M6.4 6.6v6M9.6 6.6v6M12.8 6.6v6M2 13.4h12',
    },
  ];

  /** Bullet colours on the three pipeline tiers. */
  readonly tierColours = ['#C2410C', '#5D6B62', '#A16207'];

  /** Each character gets its own colour in the design, so it renders per glyph. */
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
    this.error.set(null);

    if (!this.userId().trim() || !this.password()) {
      this.error.set('Enter your User ID and password.');
      return;
    }

    if (this.captchaInput().trim().toUpperCase() !== this.captcha()) {
      this.error.set('The security code does not match.');
      this.refreshCaptcha();
      return;
    }

    this.busy.set(true);

    this.auth.login(this.userId().trim(), this.password()).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl || '/dashboard');
      },
      error: (response: { error?: { message?: string } }) => {
        this.busy.set(false);
        this.error.set(response.error?.message ?? 'Unable to sign in. Please try again.');
        this.refreshCaptcha();
      },
    });
  }
}

/** Five characters, ambiguous glyphs (O/0, I/1) left out. */
function makeCaptcha(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const values = new Uint32Array(5);
  crypto.getRandomValues(values);

  for (const value of values) {
    code += alphabet[value % alphabet.length];
  }

  return code;
}


function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}
