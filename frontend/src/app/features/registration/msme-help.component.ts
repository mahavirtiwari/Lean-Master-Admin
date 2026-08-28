import { Component } from '@angular/core';

import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';
import { MsmeSidebarComponent } from './msme-sidebar.component';

/**
 * Help & Support — where the applicant reaches the scheme's helpdesk. Static
 * contact information over the shared chrome; no per-account data, so it needs
 * no fetch.
 */
@Component({
  selector: 'app-msme-help',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent],
  template: `
    <app-msme-masthead mode="app" />
    <app-msme-section-menu />

    <main class="hp-ground">
      <div class="hp-wrap">
        <div class="hp-crumb">Home <span>›</span> Help &amp; Support</div>
        <h1 class="hp-h1">Help &amp; Support</h1>

        <div class="hp-grid">
          <app-msme-sidebar />

          <div class="hp-body">
            <section class="hp-card">
              <h2 class="hp-h">Contact the LEAN helpdesk</h2>
              <p class="hp-p">
                For questions about registration, certification, incentives or payments, reach the
                National Productivity Council / QCI helpdesk that runs the scheme.
              </p>

              <div class="hp-rows">
                <div class="hp-row">
                  <span class="hp-ic">✉️</span>
                  <span class="hp-row-body">
                    <span class="hp-k">Email</span>
                    <a class="hp-v" href="mailto:lean@qcin.org">lean&#64;qcin.org</a>
                  </span>
                </div>
                <div class="hp-row">
                  <span class="hp-ic">📞</span>
                  <span class="hp-row-body">
                    <span class="hp-k">Helpline</span>
                    <span class="hp-v">011-2469 0100 · Mon–Fri, 9:30–18:00</span>
                  </span>
                </div>
                <div class="hp-row">
                  <span class="hp-ic">🌐</span>
                  <span class="hp-row-body">
                    <span class="hp-k">Website</span>
                    <a class="hp-v" href="https://ndie.qcin.org/contact-us/" target="_blank" rel="noopener">ndie.qcin.org/contact-us</a>
                  </span>
                </div>
              </div>
            </section>

            <section class="hp-card">
              <h2 class="hp-h">Before you write in</h2>
              <ul class="hp-list">
                <li>Have your LEAN ID ready — it is shown on the left and in every email from the scheme.</li>
                <li>For the mobile app steps (basic information, ESG, documents), check My Documents for the guides and videos.</li>
                <li>Forgot your password? Use the reset link on the sign-in screen; it goes to your registered SPOC email.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: #f4f7f5; }
      .hp-ground { padding: 24px 40px 64px; }
      .hp-wrap { max-width: 1192px; margin: 0 auto; }
      .hp-crumb { font-size: 12px; color: #93a29a; }
      .hp-crumb span { margin: 0 6px; }
      .hp-h1 { font-size: 18.5px; font-weight: 700; color: #16211a; margin: 4px 0 18px; }
      .hp-grid { display: grid; grid-template-columns: 292px minmax(0, 1fr); gap: 24px; align-items: start; }
      @media (max-width: 980px) { .hp-grid { grid-template-columns: minmax(0, 1fr); } }
      .hp-body { display: flex; flex-direction: column; gap: 14px; }
      .hp-card { background: #fff; border: 1px solid #e9efeb; border-radius: 14px; padding: 22px; }
      .hp-h { font-size: 15px; font-weight: 700; color: #16211a; margin: 0 0 8px; }
      .hp-p { font-size: 13.5px; color: #5d6b62; line-height: 1.6; margin: 0 0 16px; }
      .hp-rows { display: flex; flex-direction: column; gap: 14px; }
      .hp-row { display: flex; gap: 12px; align-items: flex-start; }
      .hp-ic { flex: none; width: 34px; height: 34px; border-radius: 8px; background: #eef8f1;
               display: flex; align-items: center; justify-content: center; font-size: 15px; }
      .hp-row-body { display: flex; flex-direction: column; }
      .hp-k { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: #93a29a; }
      .hp-v { font-size: 13.5px; font-weight: 600; color: #16211a; text-decoration: none; margin-top: 2px; }
      a.hp-v:hover { color: #1b4f8a; text-decoration: underline; }
      .hp-list { margin: 0; padding-left: 18px; }
      .hp-list li { font-size: 13px; color: #47554c; line-height: 1.6; margin-bottom: 8px; }
    `,
  ],
})
export class MsmeHelpComponent {}
