import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';
import { MsmeSidebarComponent } from './msme-sidebar.component';

interface Level {
  code: string;
  name: string;
  state: 'Open' | 'Locked' | 'In progress' | 'Certified';
  applicationNo: string | null;
  applicationStatus: string | null;
}

interface Dashboard {
  levels: Level[];
}

/**
 * My Certificates (C00) — the LEAN Pledge and the three certification levels,
 * over the shared masthead + section menu + sidebar. The level state comes from
 * the dashboard summary; the pledge downloads from the applicant pledge
 * endpoint.
 */
@Component({
  selector: 'app-msme-certificates',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent],
  template: `
    <app-msme-masthead mode="app" />
    <app-msme-section-menu />

    <main class="ct-ground">
      <div class="ct-wrap">
        <div class="ct-crumb">Home <span>›</span> My Certificates</div>
        <h1 class="ct-h1">My Certificates</h1>

        <div class="ct-grid">
          <app-msme-sidebar />

          <div class="ct-body">
            <h2 class="ct-title">Certificates</h2>

            @if (loading()) {
              <div class="ct-card ct-loading">Loading…</div>
            } @else {
              <div class="ct-card ct-row ct-pledge">
                <span class="ct-ic green">🏅</span>
                <span class="ct-row-body">
                  <span class="ct-row-title">LEAN Pledge</span>
                  <span class="ct-row-sub">Taken at registration</span>
                </span>
                <a class="ct-dl" [href]="pledgeUrl()" target="_blank" rel="noopener">⬇ Download</a>
              </div>

              @for (l of levels(); track l.code) {
                <div class="ct-card ct-level" [style.borderTopColor]="accent(l.code)">
                  <div class="ct-level-head">
                    <span class="ct-ic" [style.background]="tint(l.code)">🏵️</span>
                    <span class="ct-row-body">
                      <span class="ct-row-title">LEAN {{ l.name }}</span>
                      <span class="ct-row-sub">{{ subtitle(l) }}</span>
                    </span>
                    <span class="ct-state" [class]="stateClass(l.state)">{{ l.state }}</span>
                  </div>
                  @if (l.applicationNo) {
                    <div class="ct-appline">Application {{ l.applicationNo }} · {{ l.applicationStatus }}</div>
                  }
                </div>
              }
            }
          </div>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: #f4f7f5; }
      .ct-ground { padding: 24px 40px 64px; }
      .ct-wrap { max-width: 1192px; margin: 0 auto; }
      .ct-crumb { font-size: 12px; color: #93a29a; }
      .ct-crumb span { margin: 0 6px; }
      .ct-h1 { font-size: 18.5px; font-weight: 700; color: #16211a; margin: 4px 0 18px; }
      .ct-grid { display: grid; grid-template-columns: 292px minmax(0, 1fr); gap: 24px; align-items: start; }
      @media (max-width: 980px) { .ct-grid { grid-template-columns: minmax(0, 1fr); } }
      .ct-body { display: flex; flex-direction: column; gap: 12px; }
      .ct-title { font-size: 16px; font-weight: 700; color: #16211a; margin: 0 0 2px; }
      .ct-card { background: #fff; border: 1px solid #e9efeb; border-radius: 14px; padding: 16px; }
      .ct-loading { color: #93a29a; font-size: 13px; }
      .ct-row { display: flex; align-items: center; gap: 14px; }
      .ct-pledge { border-left: 3px solid #0f7b45; }
      .ct-ic { flex: none; width: 36px; height: 36px; border-radius: 9px; background: #eef8f1;
               display: flex; align-items: center; justify-content: center; font-size: 16px; }
      .ct-ic.green { background: #eef8f1; }
      .ct-row-body { flex: 1; display: flex; flex-direction: column; min-width: 0; }
      .ct-row-title { font-size: 14px; font-weight: 700; color: #16211a; }
      .ct-row-sub { font-size: 12px; color: #93a29a; margin-top: 2px; }
      .ct-dl { color: #0f7b45; font-weight: 700; text-decoration: none; font-size: 13px;
               border: 1px solid #cfe8d8; border-radius: 8px; padding: 8px 12px; background: #f3faf6; }
      .ct-level { border-top: 3px solid #ccc; }
      .ct-level-head { display: flex; align-items: center; gap: 14px; }
      .ct-appline { font-size: 12px; color: #5d6b62; margin-top: 10px; padding-top: 10px; border-top: 1px solid #f0f4f1; }
      .ct-state { font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
      .ct-state.s-cert { background: #eef8f1; color: #0f7b45; }
      .ct-state.s-prog { background: #eaf1f9; color: #1b4f8a; }
      .ct-state.s-lock { background: #f1f4f2; color: #93a29a; }
      .ct-state.s-open { background: #fff4e8; color: #c2410c; }
    `,
  ],
})
export class MsmeCertificatesComponent {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  readonly levels = signal<Level[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.http.get<Dashboard>(`${this.base}/msme/dashboard`).subscribe({
      next: (d) => { this.levels.set(d.levels ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  pledgeUrl(): string {
    return `${this.base}/msme/pledge`;
  }

  subtitle(l: Level): string {
    switch (l.state) {
      case 'Certified': return 'Issued';
      case 'In progress': return 'Application in progress';
      case 'Locked': return 'Needs the level before it';
      default: return 'Ready to apply';
    }
  }

  stateClass(state: Level['state']): string {
    switch (state) {
      case 'Certified': return 's-cert';
      case 'In progress': return 's-prog';
      case 'Locked': return 's-lock';
      default: return 's-open';
    }
  }

  accent(code: string): string {
    switch (code.toUpperCase()) {
      case 'BRONZE': return '#c2410c';
      case 'SILVER': return '#6b7280';
      default: return '#b8860b';
    }
  }

  tint(code: string): string {
    switch (code.toUpperCase()) {
      case 'BRONZE': return '#fdecdf';
      case 'SILVER': return '#eef1f4';
      default: return '#faf1d8';
    }
  }
}
