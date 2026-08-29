import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MsmePageNavComponent } from './msme-page-nav.component';

import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';

/**
 * A destination for the applicant section-menu tabs whose full screens are not
 * built for the web yet (My Certificates, My Documents, Payments list, View
 * Profile, Help & Support). It carries the same masthead and menu so the chrome
 * is complete and no tab is a dead link; the body says where that data lives.
 *
 * For LEAN Silver, that data is captured on the mobile app and shown read-only
 * on the web, so this is also the honest place to point people at the app until
 * the read-only web views land.
 */
@Component({
  selector: 'app-msme-coming-soon',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, RouterLink, MsmePageNavComponent],
  template: `
    <app-msme-masthead mode="app" />
    <app-msme-section-menu />

    <main class="cs-ground">
      <div class="cs-wrap">
        <div class="cs-crumb-row">
          <div class="cs-crumb">Home <span>›</span> {{ title() }}</div>
          <app-msme-page-nav to="/msme/dashboard" [showRefresh]="false" />
        </div>
        <h1 class="cs-title">{{ title() }}</h1>

        <section class="cs-card">
          <div class="cs-mark">{{ glyph() }}</div>
          <h2 class="cs-h">{{ title() }} is coming to the web</h2>
          <p class="cs-p">
            This section is being brought to the web. For LEAN Silver, this data is captured in the
            MCLS mobile app and will appear here read-only. Bronze works on both web and mobile.
          </p>
          <a class="cs-btn" routerLink="/msme/dashboard">Back to dashboard</a>
        </section>
      </div>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: #f4f7f5; }
      .cs-ground { padding: 28px 40px 64px; }
      .cs-wrap { max-width: 1192px; margin: 0 auto; }
      .cs-crumb-row {
        display: flex; align-items: center;
        gap: 12px; flex-wrap: wrap;
      }
      .cs-crumb { font-size: 12px; color: #93a29a; }
      .cs-crumb span { margin: 0 6px; }
      .cs-title { font-size: 18.5px; font-weight: 700; color: #16211a; margin: 4px 0 20px; }
      .cs-card {
        background: #fff; border: 1px solid #e9efeb; border-radius: 14px;
        padding: 48px; text-align: center; max-width: 640px;
      }
      .cs-mark { font-size: 34px; margin-bottom: 10px; }
      .cs-h { font-size: 18px; font-weight: 700; color: #16211a; margin: 0 0 8px; }
      .cs-p { font-size: 14px; color: #5d6b62; line-height: 1.6; margin: 0 auto 22px; max-width: 460px; }
      .cs-btn {
        display: inline-block; padding: 11px 20px; border-radius: 8px;
        background: #0f7b45; color: #fff; font-size: 14px; font-weight: 700; text-decoration: none;
      }
    `,
  ],
})
export class MsmeComingSoonComponent {
  private readonly route = inject(ActivatedRoute);

  readonly title = toSignal(this.route.data.pipe(map((d) => (d['title'] as string) ?? 'Section')), {
    initialValue: 'Section',
  });
  readonly glyph = toSignal(this.route.data.pipe(map((d) => (d['glyph'] as string) ?? '📄')), {
    initialValue: '📄',
  });
}
