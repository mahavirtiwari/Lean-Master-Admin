import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * The applicant web section menu — the flat top bar the msme-web deck uses in
 * place of a sidebar. Six entries, taken from the phone drawer so the two never
 * drift; the active entry gets the soft green pill and the 3px green underline.
 */
@Component({
  selector: 'app-msme-section-menu',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="sm">
      <div class="sm-inner">
        @for (t of tabs; track t.label) {
          @if (t.external) {
            <a class="sm-tab" [href]="t.external" target="_blank" rel="noopener">{{ t.label }}</a>
          } @else {
            <a
              class="sm-tab"
              [routerLink]="t.path"
              routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: false }"
            >
              {{ t.label }}
            </a>
          }
        }
      </div>
    </nav>
  `,
  styles: [
    `
      :host { display: block; }
      .sm {
        background: #f0f8f3;
        border-bottom: 1px solid #d9ebe1;
      }
      .sm-inner {
        display: flex;
        gap: 6px;
        padding: 0 40px;
        overflow-x: auto;
      }
      .sm-tab {
        position: relative;
        display: inline-flex;
        align-items: center;
        height: 54px;
        padding: 0 16px;
        font-size: 14px;
        font-weight: 500;
        color: #33453b;
        text-decoration: none;
        white-space: nowrap;
        border-radius: 8px 8px 0 0;
      }
      .sm-tab:hover { color: #0f7b45; }
      .sm-tab.is-active {
        color: #0f7b45;
        font-weight: 700;
        background: #e1f0e8;
      }
      .sm-tab.is-active::after {
        content: '';
        position: absolute;
        left: 8px; right: 8px; bottom: 0;
        height: 3px; border-radius: 3px 3px 0 0;
        background: #0f7b45;
      }
    `,
  ],
})
export class MsmeSectionMenuComponent {
  readonly tabs: { label: string; path?: string; external?: string }[] = [
    { label: 'Dashboard', path: '/msme/dashboard' },
    { label: 'My Certificates', path: '/msme/certificates' },
    { label: 'My Documents', path: '/msme/documents' },
    { label: 'Payments', path: '/msme/payments' },
    { label: 'View Profile', path: '/msme/profile' },
    { label: 'Help & Support', external: 'https://ndie.qcin.org/contact-us/' },
  ];
}
