import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';

/**
 * The applicant web masthead, as the msme-web deck draws it (A04–A06, H00…):
 * the MCLS mark and the Ministry lockup at the left over a 3px green rule, then
 * Help and the language control at the right. Before sign-in it ends in a
 * "Sign in ›" link (`mode="auth"`); once signed in it shows the notification
 * bell and the enterprise chip (`mode="app"`), the chip opening a Sign-out menu.
 *
 * Kept as one component so every applicant screen carries the identical bar and
 * the two never drift.
 */
@Component({
  selector: 'app-msme-masthead',
  imports: [],
  template: `
    <header class="mh">
      <div class="mh-inner">
        <img class="mh-mcls" src="assets/mcls-logo.png" alt="MSME Competitive (LEAN) Scheme — MCLS" />
        <span class="mh-div"></span>
        <img class="mh-min" src="assets/msme-logo.svg" alt="Ministry of Micro, Small & Medium Enterprises" />

        <span class="mh-spacer"></span>

        <button class="mh-link" type="button" (click)="help()">Help</button>

        @if (mode() === 'app') {
          <button class="mh-bell" type="button" aria-label="Notifications">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M9 2.5a4.2 4.2 0 0 0-4.2 4.2v3l-1.3 2.3h11L13.2 9.7v-3A4.2 4.2 0 0 0 9 2.5ZM7.3 14a1.8 1.8 0 0 0 3.4 0"
                    fill="none" stroke="#33453B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="mh-dot"></span>
          </button>

          <div class="mh-user">
            <button class="mh-chip" type="button" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()">
              <span class="mh-chip-text">
                <span class="mh-name">{{ effName() || 'Enterprise' }}</span>
                <span class="mh-id">{{ effLeanId() }}</span>
              </span>
              <span class="mh-avatar">{{ effInitials() }}</span>
            </button>
            @if (menuOpen()) {
              <div class="mh-menu">
                <div class="mh-menu-head">
                  <div class="mh-menu-name">{{ effName() }}</div>
                  <div class="mh-menu-id">{{ effLeanId() }}</div>
                </div>
                <button class="mh-signout" type="button" (click)="signOut()">Sign out</button>
              </div>
            }
          </div>
        } @else {
          <a class="mh-signin" (click)="signIn()">Sign in ›</a>
        }
      </div>
    </header>
  `,
  styles: [
    `
      :host { display: block; }
      /* Geometry matched to the registration header (.pub-head) so the logos
         sit in the same place and switching screens does not make them jump:
         full width, 88px tall, MCLS 54px, Ministry 46px, a 44px divider. */
      .mh {
        background: #fff;
        border-bottom: 3px solid #0f7b45;
      }
      .mh-inner {
        display: flex;
        align-items: center;
        gap: 22px;
        height: 88px;
        /* Extra right room so Help / Sign in / the user chip clear the floating
           Bhashini language widget that sits fixed in the top-right corner. */
        padding: 0 150px 0 40px;
      }
      .mh-mcls { height: 54px; width: auto; object-fit: contain; }
      .mh-div { width: 1px; height: 44px; background: #c6d3cb; }
      .mh-min { height: 46px; width: auto; object-fit: contain; }
      .mh-spacer { flex: 1; }

      .mh-link {
        background: none; border: none; cursor: pointer;
        font-size: 13px; color: #5d6b62; padding: 6px 4px;
      }
      .mh-lang { color: #1b4f8a; }
      .mh-link:hover { color: #16211a; }

      .mh-bell { position: relative; background: none; border: none; cursor: pointer; padding: 6px; line-height: 0; }
      .mh-dot { position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 50%; background: #d64545; border: 1.5px solid #fff; }

      .mh-user { position: relative; }
      .mh-chip { display: flex; align-items: center; gap: 10px; background: none; border: none; cursor: pointer; padding: 4px; }
      .mh-chip-text { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.25; }
      .mh-name { font-size: 13px; font-weight: 700; color: #16211a; }
      .mh-id { font-size: 11px; color: #5d6b62; }
      .mh-avatar {
        width: 38px; height: 38px; border-radius: 50%; background: #1b4f8a; color: #fff;
        display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700;
      }
      .mh-menu {
        position: absolute; right: 0; top: 52px; z-index: 30; width: 220px;
        background: #fff; border: 1px solid #e4ebe7; border-radius: 10px;
        box-shadow: 0 12px 30px rgba(16, 33, 26, 0.12); overflow: hidden;
      }
      .mh-menu-head { padding: 14px 16px; border-bottom: 1px solid #eef3f0; }
      .mh-menu-name { font-size: 13px; font-weight: 700; color: #16211a; }
      .mh-menu-id { font-size: 11px; color: #5d6b62; margin-top: 2px; }
      .mh-signout { width: 100%; text-align: left; padding: 12px 16px; background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 600; color: #b91c1c; }
      .mh-signout:hover { background: #fdf1f1; }

      .mh-signin { cursor: pointer; font-size: 14px; font-weight: 700; color: #1b4f8a; padding: 6px 4px; }

      @media (max-width: 700px) {
        .mh-inner { padding: 0 120px 0 16px; gap: 12px; height: 72px; }
        .mh-mcls { height: 38px; }
        .mh-min { display: none; }
        .mh-name, .mh-id { display: none; }
      }
    `,
  ],
})
export class MsmeMastheadComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** 'auth' before sign-in (ends in "Sign in ›"); 'app' once signed in. */
  readonly mode = input<'auth' | 'app'>('auth');
  readonly name = input<string>('');
  readonly leanId = input<string>('');
  readonly initials = input<string>('');

  readonly menuOpen = signal(false);

  // Screens pass the enterprise identity explicitly; when they don't, fall back
  // to the signed-in user so the chip is never blank on a placeholder screen.
  readonly effName = computed(() => this.name() || this.auth.user()?.fullName || '');
  readonly effLeanId = computed(() => this.leanId() || this.auth.user()?.userCode || '');
  readonly effInitials = computed(
    () => this.initials() || this.auth.user()?.initials || (this.effName().slice(0, 2).toUpperCase()),
  );

  help(): void {
    window.open('https://ndie.qcin.org/contact-us/', '_blank', 'noopener,noreferrer');
  }

  signIn(): void {
    void this.router.navigate(['/msme/login']);
  }

  signOut(): void {
    this.menuOpen.set(false);
    this.auth.logout();
    void this.router.navigate(['/msme/login']);
  }
}
