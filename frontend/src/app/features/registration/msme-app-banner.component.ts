import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { environment } from '../../../environments/environment';

/**
 * The mobile app banner.
 *
 * The store badges here are stand-ins drawn in the same shape as the real ones.
 * Apple and Google both require their own supplied artwork under their brand
 * guidelines, so these should be swapped for the official assets before the
 * listings go live.
 *
 * A store with no URL configured yet is shown as coming soon rather than
 * linking nowhere — see environment.mobileApp.
 */
@Component({
  selector: 'app-msme-app-banner',
  standalone: true,
  template: `
    <aside class="mb-band">
      <p class="mb-copy">
        You can now start the <strong>&ldquo;Bronze/Silver/Gold certification&rdquo;</strong>
        from the LEAN MSME Mobile Application
      </p>

      <div class="mb-badges">
        <a
          class="mb-badge"
          [class.is-soon]="!links.ios"
          [attr.href]="links.ios || null"
          [attr.target]="links.ios ? '_blank' : null"
          rel="noopener"
          [attr.aria-disabled]="links.ios ? null : 'true'"
          [title]="links.ios ? 'Download on the App Store' : 'Coming soon to the App Store'"
        >
          <svg class="mb-mark" viewBox="0 0 16 20" aria-hidden="true">
            <path
              d="M12.9 10.6c0-2 1.6-3 1.7-3.1-0.9-1.4-2.4-1.5-2.9-1.6-1.2-0.1-2.4 0.7-3 0.7s-1.6-0.7-2.6-0.7c-1.3 0-2.6 0.8-3.3 2-1.4 2.4-0.4 6 1 8 0.7 1 1.5 2.1 2.5 2 1 0 1.4-0.6 2.6-0.6s1.5 0.6 2.6 0.6c1.1 0 1.8-1 2.4-2 0.8-1.1 1.1-2.2 1.1-2.3-0.1 0-2.1-0.8-2.1-3z"
              fill="currentColor"
            />
            <path
              d="M11 4.6c0.5-0.7 0.9-1.6 0.8-2.6-0.8 0-1.8 0.5-2.4 1.2-0.5 0.6-0.9 1.6-0.8 2.5 0.9 0.1 1.8-0.4 2.4-1.1z"
              fill="currentColor"
            />
          </svg>
          <span class="mb-text">
            <span class="mb-small">{{ links.ios ? 'Download on the' : 'Coming soon to the' }}</span>
            <span class="mb-big">App Store</span>
          </span>
        </a>

        <a
          class="mb-badge"
          [class.is-soon]="!links.android"
          [attr.href]="links.android || null"
          [attr.target]="links.android ? '_blank' : null"
          rel="noopener"
          [attr.aria-disabled]="links.android ? null : 'true'"
          [title]="links.android ? 'Get it on Google Play' : 'Coming soon to Google Play'"
        >
          <svg class="mb-mark" viewBox="0 0 18 20" aria-hidden="true">
            <path d="M1.6 1.1 11 10l-9.4 8.9a1.4 1.4 0 0 1-0.5-1.1V2.2c0-0.4 0.2-0.8 0.5-1.1z" fill="#34A853" />
            <path d="M12.6 8.4 3 0.9l-0.3-0.1 9.1 8.6z" fill="#4285F4" />
            <path d="M12.6 11.6 3.5 20l9.1-7.9 0-0.5z" fill="#EA4335" />
            <path d="m12.4 8.4 3.6 2c0.7 0.4 0.7 1.2 0 1.6l-3.6 2L10.3 10z" fill="#FBBC04" />
          </svg>
          <span class="mb-text">
            <span class="mb-small">{{ links.android ? 'GET IT ON' : 'COMING SOON TO' }}</span>
            <span class="mb-big">Google Play</span>
          </span>
        </a>

        @if (qr(); as svg) {
          <span class="mb-qr" [title]="qrTarget()" [innerHTML]="svg"></span>
        }
      </div>
    </aside>
  `,
  styles: [
    `
      .mb-band {
        display: flex; align-items: center; justify-content: space-between;
        gap: 24px; flex-wrap: wrap;
        margin: 0 0 18px;
        padding: 14px 20px;
        border: 1px solid #cde8d4;
        border-radius: 10px;
        background: #e6f4e6;
      }

      .mb-copy {
        margin: 0; flex: 1 1 320px;
        font-size: 13.5px; line-height: 1.55; color: #1f5c37;
      }
      .mb-copy strong { color: #14532d; font-weight: 700; }

      .mb-badges { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

      .mb-badge {
        display: inline-flex; align-items: center; gap: 9px;
        height: 48px; padding: 0 14px;
        border-radius: 7px; background: #000; color: #fff;
        text-decoration: none;
      }
      .mb-badge:hover { background: #1a1a1a; }
      // Nothing to link to yet: shown, but plainly not a live listing.
      .mb-badge.is-soon { opacity: 0.55; cursor: default; }
      .mb-badge.is-soon:hover { background: #000; }

      .mb-mark { width: 20px; height: 22px; flex: none; }
      .mb-text { display: flex; flex-direction: column; line-height: 1.1; }
      .mb-small { font-size: 8.5px; letter-spacing: 0.04em; text-transform: none; }
      .mb-big { font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }

      // A white card, 95px square once its padding and rule are counted, with
      // a quiet zone around the code so a camera can still find its corners.
      .mb-qr {
        display: block; width: 81px; height: 81px; flex: none;
        padding: 6px; border-radius: 4px;
        background: #fff; border: 1px solid #d7e5da;
      }
      .mb-qr ::ng-deep svg { display: block; width: 100%; height: 100%; }

      // A phone cannot scan its own screen, and that is the only device this
      // width implies — the badges are the way in there.
      @media (max-width: 900px) {
        .mb-band { gap: 14px; }
        .mb-qr { display: none; }
      }
    `,
  ],
})
export class MsmeAppBannerComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly links = environment.mobileApp;
  readonly qr = signal<SafeHtml | null>(null);

  /**
   * The QR points at the direct download first, then whichever store exists.
   * With none of them set it falls back to the portal itself, so scanning
   * still lands somewhere real rather than leaving a blank square.
   */
  readonly qrTarget = computed(
    () => this.links.apk || this.links.android || this.links.ios || window.location.origin,
  );

  constructor() {
    const target = this.qrTarget();

    // Loaded on demand: the encoder is only needed once the links are set, and
    // it has no business in the initial bundle of every applicant screen.
    void import('qrcode').then((qrcode) =>
      qrcode.toString(target, { type: 'svg', margin: 0, width: 120 }).then(
        (svg) => this.qr.set(this.sanitizer.bypassSecurityTrustHtml(svg)),
        () => this.qr.set(null),
      ),
    );
  }
}
