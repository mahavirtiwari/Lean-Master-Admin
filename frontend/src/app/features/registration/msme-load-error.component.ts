import { Component, input, output } from '@angular/core';

/**
 * What a screen shows when its data could not be loaded.
 *
 * The alternative — falling through to the empty state — tells the applicant
 * they have no certificates, no documents or no payments, which is a different
 * and much worse claim than "we could not ask".
 */
@Component({
  selector: 'app-msme-load-error',
  standalone: true,
  template: `
    <div class="le-card">
      <span class="le-ic">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M8 4.8v3.6M8 10.6v.1" fill="none" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" />
        </svg>
      </span>
      <div class="le-text">
        <p class="le-msg">{{ message() }}</p>
        <button class="le-retry" type="button" (click)="retry.emit()">Try again</button>
      </div>
    </div>
  `,
  styles: [
    `
      .le-card {
        display: flex; align-items: flex-start; gap: 11px;
        background: #fdf5f5; border: 1px solid #f0d4d4; border-radius: 12px;
        padding: 16px 18px;
      }
      .le-ic { color: #b91c1c; display: flex; flex: none; margin-top: 1px; }
      .le-ic svg { width: 17px; height: 17px; }
      .le-text { display: flex; flex-direction: column; align-items: flex-start; gap: 9px; }
      .le-msg { margin: 0; font-size: 12.8px; line-height: 1.55; color: #7f1d1d; }
      .le-retry {
        height: 30px; padding: 0 14px; border-radius: 15px;
        border: 1px solid #e3bcbc; background: #fff; color: #b91c1c;
        font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer;
      }
      .le-retry:hover { background: #fdeaea; }
    `,
  ],
})
export class MsmeLoadErrorComponent {
  readonly message = input('');
  readonly retry = output<void>();
}
