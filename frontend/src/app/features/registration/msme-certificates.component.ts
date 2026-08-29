import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';
import { MsmeSidebarComponent } from './msme-sidebar.component';
import type { BronzeData } from './msme-bronze.component';

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
 * My Certificates (C00).
 *
 * The LEAN Pledge sits at the top, then one row per certification level. Bronze
 * is the exception worth knowing about: it is e-learning taken by up to five
 * nominated people, and a certificate is issued to each of them — so the Bronze
 * row opens into its participants rather than holding a single certificate. The
 * "1 of 5" chip counts how many have earned theirs.
 */
@Component({
  selector: 'app-msme-certificates',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent, RouterLink],
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
              <!-- The pledge taken at registration. -->
              <section class="ct-card ct-row ct-pledge">
                <span class="ct-ic green">🏅</span>
                <span class="ct-row-body">
                  <span class="ct-row-title">LEAN Pledge</span>
                </span>
                <a class="ct-dl" [href]="pledgeUrl()" target="_blank" rel="noopener" aria-label="Download the pledge">⬇</a>
              </section>

              @for (l of levels(); track l.code) {
                @if (isBronze(l)) {
                  <!-- Bronze: a certificate per participant, so the row opens
                       the people rather than one file. -->
                  <section class="ct-card ct-level" [style.borderLeftColor]="accent(l.code)">
                    <a class="ct-level-head" routerLink="/msme/bronze">
                      <span class="ct-ic" [style.background]="tint(l.code)">🏵️</span>
                      <span class="ct-row-body">
                        <span class="ct-row-title">
                          {{ l.name }}
                          @if (certifiedCount() > 0) {
                            <span class="ct-count">{{ certifiedCount() }} of {{ seatTotal() }}</span>
                          }
                        </span>
                        <span class="ct-row-sub">Issued on passing the exam</span>
                      </span>
                      <span class="ct-go">›</span>
                    </a>

                    @for (p of certifiedPeople(); track p.id) {
                      <div class="ct-person">
                        <span class="ct-avatar">{{ p.initials }}</span>
                        <span class="ct-person-name">{{ p.name }}</span>
                        <span class="ct-person-state">Certified</span>
                        <a class="ct-dl" [href]="lmsUrl()" target="_blank" rel="noopener" aria-label="Download certificate">⬇</a>
                      </div>
                    }

                    @if (stillLearning() > 0) {
                      <p class="ct-more">{{ stillLearning() }} more still on the courses</p>
                    } @else if (certifiedCount() === 0) {
                      <p class="ct-more">
                        No certificates yet — each participant earns one when they pass the exam.
                      </p>
                    }
                  </section>
                } @else {
                  <section class="ct-card ct-row ct-level" [style.borderLeftColor]="accent(l.code)">
                    <span class="ct-ic" [style.background]="tint(l.code)">🏵️</span>
                    <span class="ct-row-body">
                      <span class="ct-row-title">{{ l.name }}</span>
                      <span class="ct-row-sub">{{ subtitle(l) }}</span>
                    </span>
                    <span class="ct-state" [class]="stateClass(l.state)">{{ l.state }}</span>
                  </section>
                }
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
      .ct-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; align-items: start; }
      @media (max-width: 980px) { .ct-grid { grid-template-columns: minmax(0, 1fr); } }
      .ct-body { display: flex; flex-direction: column; gap: 12px; }
      .ct-title { font-size: 14.6px; font-weight: 700; color: #16211a; margin: 0 0 2px; }
      .ct-card { background: #fff; border: 1px solid #e8efea; border-radius: 12px; padding: 16px 18px; }
      .ct-loading { color: #93a29a; font-size: 13px; }

      .ct-row { display: flex; align-items: center; gap: 14px; }
      .ct-pledge { border-left: 3px solid #0f7b45; }
      .ct-level { border-left: 3px solid #c6d3cb; }

      .ct-ic {
        flex: none; width: 36px; height: 36px; border-radius: 9px; background: #eef8f1;
        display: flex; align-items: center; justify-content: center; font-size: 16px;
      }
      .ct-ic.green { background: #eef8f1; }
      .ct-row-body { flex: 1; display: flex; flex-direction: column; min-width: 0; }
      .ct-row-title { font-size: 13.4px; font-weight: 700; color: #16211a; display: flex; align-items: center; gap: 8px; }
      .ct-row-sub { font-size: 11.4px; color: #93a29a; margin-top: 2px; }
      .ct-count {
        font-size: 10.4px; font-weight: 700; color: #c2410c;
        background: #fdf3ec; border: 1px solid #f3ddc4; border-radius: 999px; padding: 2px 9px;
      }

      .ct-level-head { display: flex; align-items: center; gap: 14px; text-decoration: none; }
      .ct-go { color: #c2410c; font-size: 17px; font-weight: 700; }

      // One certified participant, and the certificate that is theirs.
      .ct-person {
        display: flex; align-items: center; gap: 12px;
        margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f4f1;
      }
      .ct-avatar {
        flex: none; width: 28px; height: 28px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: #eef8f1; color: #0f7b45; font-size: 10.4px; font-weight: 700;
      }
      .ct-person-name { flex: 1; font-size: 12.4px; font-weight: 600; color: #16211a; }
      .ct-person-state { font-size: 11px; font-weight: 700; color: #0f7b45; }
      .ct-more { font-size: 11px; color: #93a29a; margin: 10px 0 0; }

      .ct-dl {
        flex: none; width: 32px; height: 32px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        background: #f3faf6; border: 1px solid #cfe8d8; color: #0f7b45;
        font-size: 14px; text-decoration: none;
      }
      .ct-dl:hover { background: #eaf5ee; }

      .ct-state { font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 999px; }
      .ct-state.s-cert { background: #eef8f1; color: #0f7b45; }
      .ct-state.s-prog { background: #eff4fa; color: #1b4f8a; }
      .ct-state.s-lock { background: #f1f4f2; color: #93a29a; }
      .ct-state.s-open { background: #fdf3ec; color: #c2410c; }
    `,
  ],
})
export class MsmeCertificatesComponent {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  readonly levels = signal<Level[]>([]);
  readonly bronze = signal<BronzeData | null>(null);
  readonly loading = signal(true);

  readonly certifiedPeople = computed(
    () => this.bronze()?.participants.filter((p) => p.status === 'Certified') ?? [],
  );
  readonly certifiedCount = computed(() => this.certifiedPeople().length);
  readonly seatTotal = computed(() => this.bronze()?.seats.total ?? 5);
  readonly stillLearning = computed(() => {
    const b = this.bronze();
    return b ? b.participants.length - this.certifiedCount() : 0;
  });

  constructor() {
    this.http.get<Dashboard>(`${this.base}/msme/dashboard`).subscribe({
      next: (d) => { this.levels.set(d.levels ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });

    // Bronze holds several certificates, one per participant, so its detail
    // comes from the Bronze endpoint rather than the level row.
    this.http.get<BronzeData>(`${this.base}/msme/bronze`).subscribe({
      next: (b) => this.bronze.set(b),
      error: () => this.bronze.set(null),
    });
  }

  isBronze(l: Level): boolean {
    return l.code.toUpperCase().includes('BRONZE');
  }

  lmsUrl(): string {
    return this.bronze()?.lmsUrl ?? '#';
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
      case 'SILVER': return '#5d6b62';
      default: return '#a16207';
    }
  }

  tint(code: string): string {
    switch (code.toUpperCase()) {
      case 'BRONZE': return '#fdf3ec';
      case 'SILVER': return '#eef1f4';
      default: return '#faf1d8';
    }
  }
}
