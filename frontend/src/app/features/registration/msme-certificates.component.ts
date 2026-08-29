import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MsmePageNavComponent } from './msme-page-nav.component';
import { MsmeLoadErrorComponent } from './msme-load-error.component';
import { httpErrorMessage } from '../../shared/http-error';

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
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent, RouterLink, MsmePageNavComponent, MsmeLoadErrorComponent],
  template: `
    <app-msme-masthead mode="app" />
    <app-msme-section-menu />

    <main class="ct-ground">
      <div class="ct-wrap">
        <div class="ct-crumb-row">
          <div class="ct-crumb">Home <span>›</span> My Certificates</div>
          <app-msme-page-nav to="/msme/dashboard" (refresh)="load()" [busy]="loading()" />
        </div>
        <h1 class="ct-h1">My Certificates</h1>

        <div class="ct-grid">
          <app-msme-sidebar />

          <div class="ct-body">
            <h2 class="ct-title">Certificates</h2>

            @if (loading()) {
              <div class="ct-card ct-loading">Loading…</div>
            } @else if (loadError(); as msg) {
              <app-msme-load-error [message]="msg" (retry)="load()" />
            } @else {
              <!-- The pledge, taken at registration, is the one certificate
                   every registered enterprise holds. -->
              <section class="ct-card ct-row">
                <span class="ct-rail" style="background:#0F7B45"></span>
                <span class="ct-ic green"><svg class="ct-glyph" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="10.4" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8" />
                    <path d="M5.6 7 4 1.8h8L10.4 7" fill="none" stroke="currentColor" stroke-width="1.8"
                          stroke-linecap="round" stroke-linejoin="round" />
                  </svg></span>
                <span class="ct-row-body">
                  <span class="ct-row-title">LEAN Pledge</span>
                </span>
                <a class="ct-dl" [href]="pledgeUrl()" target="_blank" rel="noopener" aria-label="Download the pledge"><svg class="ct-glyph" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 10.5v1.8A1.7 1.7 0 0 0 4.7 14h6.6A1.7 1.7 0 0 0 13 12.3v-1.8" fill="none"
                        stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M8 2.5v8M5 7.5 8 10.5l3-3" fill="none" stroke="currentColor" stroke-width="1.8"
                        stroke-linecap="round" stroke-linejoin="round" />
                </svg></a>
              </section>

              <!-- Bronze is a certificate per participant, so it appears once
                   somebody has earned one, and opens the people who did. -->
              @if (bronzeLevel(); as l) {
                <section class="ct-card ct-level">
                  <span class="ct-rail" [style.background]="accent(l.code)"></span>
                  <a class="ct-level-head" routerLink="/msme/bronze">
                    <span class="ct-ic" [style.background]="tint(l.code)" [style.color]="accent(l.code)"><svg class="ct-glyph" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="10.4" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8" />
                    <path d="M5.6 7 4 1.8h8L10.4 7" fill="none" stroke="currentColor" stroke-width="1.8"
                          stroke-linecap="round" stroke-linejoin="round" />
                  </svg></span>
                    <span class="ct-row-body">
                      <span class="ct-row-title">
                        {{ l.name }}
                        <span class="ct-count">{{ certifiedCount() }} of {{ seatTotal() }}</span>
                      </span>
                      <span class="ct-row-sub">Issued on passing the exam</span>
                    </span>
                    <span class="ct-go"><svg class="ct-chev" viewBox="0 0 8 12" aria-hidden="true">
                        <path d="M1.4 0.9 6.6 6 1.4 11.1" fill="none" stroke="currentColor" stroke-width="1.7"
                              stroke-linecap="round" stroke-linejoin="round" />
                      </svg></span>
                  </a>

                  @for (p of certifiedPeople(); track p.id) {
                    <div class="ct-person">
                      <span class="ct-avatar">{{ p.initials }}</span>
                      <span class="ct-person-name">{{ p.name }}</span>
                      <span class="ct-person-state">Certified</span>
                      <a class="ct-dl ct-dl-plain" [href]="lmsUrl()" target="_blank" rel="noopener" aria-label="Download certificate"><svg class="ct-glyph" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 10.5v1.8A1.7 1.7 0 0 0 4.7 14h6.6A1.7 1.7 0 0 0 13 12.3v-1.8" fill="none"
                        stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M8 2.5v8M5 7.5 8 10.5l3-3" fill="none" stroke="currentColor" stroke-width="1.8"
                        stroke-linecap="round" stroke-linejoin="round" />
                </svg></a>
                    </div>
                  }

                  @if (stillLearning() > 0) {
                    <p class="ct-more">{{ stillLearning() }} more still on the courses</p>
                  }
                </section>
              }

              <!-- Silver and Gold appear only once they are certified. A level
                   that is merely open to apply for is not a certificate, and
                   listing it here would say the enterprise holds one. -->
              @for (l of earnedLevels(); track l.code) {
                <section class="ct-card ct-row">
                  <span class="ct-rail" [style.background]="accent(l.code)"></span>
                  <span class="ct-ic" [style.background]="tint(l.code)" [style.color]="accent(l.code)"><svg class="ct-glyph" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="10.4" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8" />
                    <path d="M5.6 7 4 1.8h8L10.4 7" fill="none" stroke="currentColor" stroke-width="1.8"
                          stroke-linecap="round" stroke-linejoin="round" />
                  </svg></span>
                  <span class="ct-row-body">
                    <span class="ct-row-title">{{ l.name }}</span>
                    <span class="ct-row-sub">Certified</span>
                  </span>
                  <a class="ct-dl" [href]="pledgeUrl()" target="_blank" rel="noopener" aria-label="Download certificate"><svg class="ct-glyph" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 10.5v1.8A1.7 1.7 0 0 0 4.7 14h6.6A1.7 1.7 0 0 0 13 12.3v-1.8" fill="none"
                        stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M8 2.5v8M5 7.5 8 10.5l3-3" fill="none" stroke="currentColor" stroke-width="1.8"
                        stroke-linecap="round" stroke-linejoin="round" />
                </svg></a>
                </section>
              }

              @if (!bronzeLevel() && earnedLevels().length === 0) {
                <p class="ct-none">
                  No certification earned yet. Bronze, Silver and Gold certificates appear here as
                  they are issued — apply for a level from your dashboard.
                </p>
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
      .ct-crumb-row {
        display: flex; align-items: center;
        gap: 12px; flex-wrap: wrap;
      }
      .ct-crumb { font-size: 12px; color: #93a29a; }
      .ct-crumb span { margin: 0 6px; }
      .ct-h1 { font-size: 18.5px; font-weight: 700; color: #16211a; margin: 4px 0 18px; }
      .ct-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; align-items: start; }
      @media (max-width: 980px) { .ct-grid { grid-template-columns: minmax(0, 1fr); } }
      .ct-body { display: flex; flex-direction: column; gap: 12px; }
      .ct-title { font-size: 14.6px; font-weight: 700; color: #16211a; margin: 0 0 2px; }
      // Cards follow the deck: radius 16 on #E8EFEA, with the rail as a 4px bar
      // inset 8px top and bottom rather than a full-height border — a border
      // runs into the rounded corners and reads as a stripe on the card edge.
      .ct-card {
        position: relative;
        background: #fff; border: 1px solid #e8efea; border-radius: 16px;
        padding: 18px 18px 18px 22px;
      }
      .ct-rail {
        position: absolute; left: 0; top: 8px; bottom: 8px;
        width: 4px; border-radius: 0 3px 3px 0;
      }
      .ct-loading { color: #93a29a; font-size: 13px; }
      .ct-none {
        margin: 0; padding: 22px; border-radius: 16px;
        background: #fff; border: 1px dashed #d7e0da;
        font-size: 12.4px; color: #5d6b62; line-height: 1.55;
      }

      .ct-row { display: flex; align-items: center; gap: 12px; }

      .ct-ic {
        flex: none; width: 40px; height: 40px; border-radius: 11px; background: #f0faf4;
        display: flex; align-items: center; justify-content: center;
      }
      .ct-ic.green { background: #f0faf4; color: #0f7b45; }
      .ct-glyph { width: 17px; height: 17px; display: block; }
      .ct-chev { width: 8px; height: 12px; display: block; }
      .ct-row-body { flex: 1; display: flex; flex-direction: column; min-width: 0; }
      .ct-row-title { font-size: 13.4px; font-weight: 700; color: #16211a; display: flex; align-items: center; gap: 10px; }
      .ct-row-sub { font-size: 10.2px; color: #5d6b62; margin-top: 3px; }
      .ct-count {
        font-size: 9.8px; font-weight: 700; color: #c2410c;
        background: #fdf3ec; border: 1px solid #f6d5be; border-radius: 10px; padding: 3px 10px;
      }

      .ct-level-head { display: flex; align-items: center; gap: 12px; text-decoration: none; }
      .ct-go { color: #c2410c; display: flex; align-items: center; }

      // One certified participant, and the certificate that is theirs.
      .ct-person {
        display: flex; align-items: center; gap: 10px;
        margin-top: 14px; padding-top: 14px; border-top: 1px solid #f0f4f1;
      }
      .ct-avatar {
        flex: none; width: 26px; height: 26px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: #0f7b45; color: #fff; font-size: 8.4px; font-weight: 700;
      }
      .ct-person-name { flex: 1; font-size: 11.4px; font-weight: 600; color: #47554c; }
      .ct-person-state { font-size: 9.8px; font-weight: 700; color: #0f7b45; }
      .ct-more { font-size: 10.4px; color: #93a29a; margin: 12px 0 0; }

      .ct-dl {
        flex: none; width: 56px; height: 34px; border-radius: 9px;
        display: flex; align-items: center; justify-content: center;
        background: #f0faf4; border: 1px solid #b7e4c9; color: #0f7b45; text-decoration: none;
      }
      .ct-dl:hover { background: #e6f5ec; }
      // Beside "Certified" the artboard draws the icon bare, not in a button.
      .ct-dl-plain { width: auto; height: auto; background: none; border: 0; }
      .ct-dl-plain:hover { background: none; opacity: 0.75; }

    `,
  ],
})
export class MsmeCertificatesComponent {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  readonly levels = signal<Level[]>([]);
  readonly bronze = signal<BronzeData | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  /**
   * Bronze appears once at least one participant has earned a certificate —
   * before that the enterprise holds no Bronze certificate to list.
   */
  readonly bronzeLevel = computed(() => {
    if (this.certifiedCount() === 0) return null;
    return this.levels().find((l) => l.code.toUpperCase().includes('BRONZE')) ?? null;
  });

  /**
   * The assessed levels actually certified. A level merely open to apply for is
   * not a certificate, so it has no place on this screen.
   */
  readonly earnedLevels = computed(() =>
    this.levels().filter(
      (l) => l.state === 'Certified' && !l.code.toUpperCase().includes('BRONZE'),
    ),
  );

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
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.http.get<Dashboard>(`${this.base}/msme/dashboard`).subscribe({
      next: (d) => { this.levels.set(d.levels ?? []); this.loading.set(false); },
      error: (e: unknown) => {
        this.loadError.set(httpErrorMessage(e));
        this.loading.set(false);
      },
    });

    // Bronze holds several certificates, one per participant, so its detail
    // comes from the Bronze endpoint rather than the level row.
    this.http.get<BronzeData>(`${this.base}/msme/bronze`).subscribe({
      next: (b) => this.bronze.set(b),
      error: () => this.bronze.set(null),
    });
  }


  lmsUrl(): string {
    return this.bronze()?.lmsUrl ?? '#';
  }

  pledgeUrl(): string {
    return `${this.base}/msme/pledge`;
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
