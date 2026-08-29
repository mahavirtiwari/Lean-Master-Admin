import { Location } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';

import { AppHistory } from '../../shared/app-history';

/**
 * Back and Refresh for the applicant's internal screens.
 *
 * Refresh re-fetches the screen's own data rather than reloading the browser:
 * a full reload throws away the whole application to answer a question about
 * one panel, and on these screens it also costs the sign-in round trip.
 */
@Component({
  selector: 'app-msme-page-nav',
  standalone: true,
  template: `
    <div class="pg-nav">
      <button class="pg-btn" type="button" (click)="goBack()" title="Back" aria-label="Back">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M9.6 3.2 4.8 8l4.8 4.8" fill="none" stroke="currentColor"
                stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>Back</span>
      </button>

      @if (showRefresh()) {
        <button
          class="pg-btn"
          type="button"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="refresh.emit()"
          title="Refresh"
          aria-label="Refresh"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M13.2 8a5.2 5.2 0 1 1-1.53-3.68" fill="none" stroke="currentColor"
                  stroke-width="1.9" stroke-linecap="round" />
            <path d="M13.4 2.1v3.1h-3.1" fill="none" stroke="currentColor"
                  stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>Refresh</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      // Fills the rest of the breadcrumb row, so Back lands immediately after
      // the crumb and Refresh is pushed out to the far right.
      .pg-nav {
        display: flex; align-items: center; gap: 8px;
        flex: 1 1 auto; justify-content: space-between;
      }

      .pg-btn {
        display: inline-flex; align-items: center; gap: 6px;
        height: 30px; padding: 0 12px;
        border: 1px solid #e8efea; border-radius: 15px;
        background: #fff; color: #16211a;
        font-size: 12px; font-weight: 600; font-family: inherit;
        cursor: pointer; transition: border-color 0.15s, background 0.15s;
      }
      .pg-btn:hover:not(:disabled) { border-color: #0f7b45; background: #f4faf6; color: #0f7b45; }
      .pg-btn:disabled { cursor: default; color: #93a29a; }
      .pg-btn svg { width: 14px; height: 14px; flex: none; }

      // While a refresh is in flight the icon turns, so a fast response still
      // reads as something having happened.
      .pg-btn.is-busy svg { animation: pg-spin 0.8s linear infinite; }
      @keyframes pg-spin { to { transform: rotate(360deg); } }

      @media (prefers-reduced-motion: reduce) {
        .pg-btn.is-busy svg { animation: none; }
      }
    `,
  ],
})
export class MsmePageNavComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly appHistory = inject(AppHistory);

  /** Where Back goes when this screen is the one the applicant arrived on. */
  readonly to = input('/msme/dashboard');
  /** Off for screens holding typed input, where re-fetching would discard it. */
  readonly showRefresh = input(true);
  readonly busy = input(false);

  readonly refresh = output<void>();

  goBack(): void {
    if (this.appHistory.canGoBack) {
      this.location.back();
      return;
    }
    void this.router.navigate([this.to()]);
  }
}
