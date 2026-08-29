import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';
import { MsmeSidebarComponent } from './msme-sidebar.component';

interface DocRow {
  documentId: number;
  title: string;
  description: string | null;
  fileName: string | null;
  category: string | null;
  kind: 'document' | 'video';
  url: string;
}

/**
 * My Documents (D01) — the library the Ministry publishes to MSMEs, split into
 * the downloadable documents and the training videos, over the shared sidebar.
 * Read-only: the applicant consumes these, they are maintained in the admin
 * Documents menu.
 */
@Component({
  selector: 'app-msme-documents',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent],
  template: `
    <app-msme-masthead mode="app" />
    <app-msme-section-menu />

    <main class="dc-ground">
      <div class="dc-wrap">
        <div class="dc-crumb">Home <span>›</span> My Documents</div>
        <h1 class="dc-h1">My Documents</h1>

        <div class="dc-grid">
          <app-msme-sidebar />

          <div class="dc-body">
            @if (loading()) {
              <div class="dc-card dc-loading">Loading documents…</div>
            } @else {
              <div class="dc-block-head">
                <h2 class="dc-title">Documents</h2>
                <p class="dc-sub">Published by the Ministry for your account</p>
              </div>
              <section class="dc-card">
                @for (d of documents(); track d.documentId) {
                  <a class="dc-row" [href]="fullUrl(d)" target="_blank" rel="noopener">
                    <span class="dc-ic blue"><svg class="dc-glyph" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M9 1.5H4.5A1.5 1.5 0 0 0 3 3v10A1.5 1.5 0 0 0 4.5 14.5h7A1.5 1.5 0 0 0 13 13V5.5L9 1.5Z"
                            fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
                      <path d="M9 1.5V5.5H13" fill="none" stroke="currentColor" stroke-width="1.75"
                            stroke-linecap="round" stroke-linejoin="round" />
                    </svg></span>
                    <span class="dc-row-body">
                      <span class="dc-row-title">{{ d.title }}</span>
                      @if (d.description) { <span class="dc-row-sub">{{ d.description }}</span> }
                      @else if (d.fileName) { <span class="dc-row-sub">{{ d.fileName }}</span> }
                    </span>
                    <span class="dc-dl"><svg class="dc-glyph" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3 10.5v1.8A1.7 1.7 0 0 0 4.7 14h6.6A1.7 1.7 0 0 0 13 12.3v-1.8" fill="none"
                            stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
                      <path d="M8 2.5v8M5 7.5 8 10.5l3-3" fill="none" stroke="currentColor" stroke-width="1.75"
                            stroke-linecap="round" stroke-linejoin="round" />
                    </svg></span>
                  </a>
                } @empty {
                  <div class="dc-empty">No documents have been published yet.</div>
                }
              </section>

              @if (videos().length) {
                <div class="dc-block-head">
                  <h2 class="dc-title">Videos</h2>
                  <p class="dc-sub">Training library across all certification levels</p>
                </div>
                <section class="dc-card">
                  @for (v of videos(); track v.documentId) {
                    <a class="dc-row" [href]="v.url" target="_blank" rel="noopener">
                      <span class="dc-ic" [style.background]="tint(v.category)" [style.color]="accent(v.category)"><svg class="dc-glyph" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.75" />
                      <path d="M6.6 5.6 10.6 8l-4 2.4V5.6Z" fill="currentColor" stroke="currentColor"
                            stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round" />
                    </svg></span>
                      <span class="dc-row-body">
                        <span class="dc-row-title">{{ v.title }}</span>
                        <span class="dc-row-sub">{{ videoSub(v) }}</span>
                      </span>
                      <span class="dc-play" [style.color]="accent(v.category)"><svg class="dc-glyph" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.75" />
                      <path d="M6.6 5.6 10.6 8l-4 2.4V5.6Z" fill="currentColor" stroke="currentColor"
                            stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round" />
                    </svg></span>
                    </a>
                  }
                </section>
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
      .dc-ground { padding: 24px 40px 64px; }
      .dc-wrap { max-width: 1192px; margin: 0 auto; }
      .dc-crumb { font-size: 12px; color: #93a29a; }
      .dc-crumb span { margin: 0 6px; }
      .dc-h1 { font-size: 18.5px; font-weight: 700; color: #16211a; margin: 4px 0 18px; }

      .dc-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; align-items: start; }
      @media (max-width: 980px) { .dc-grid { grid-template-columns: minmax(0, 1fr); } }

      .dc-body { display: flex; flex-direction: column; gap: 8px; }
      .dc-block-head { margin: 8px 0 2px; }
      .dc-title { font-size: 16px; font-weight: 700; color: #16211a; margin: 0; }
      .dc-sub { font-size: 12px; color: #93a29a; margin: 3px 0 0; }
      .dc-card { background: #fff; border: 1px solid #e9efeb; border-radius: 14px; padding: 6px 8px; }
      .dc-loading, .dc-empty { color: #93a29a; font-size: 13px; padding: 16px; }

      .dc-row {
        display: flex; align-items: center; gap: 14px; padding: 14px 12px;
        border-bottom: 1px solid #f0f4f1; text-decoration: none;
      }
      .dc-row:last-child { border-bottom: 0; }
      .dc-row:hover { background: #f7faf8; border-radius: 10px; }
      .dc-ic {
        flex: none; width: 36px; height: 36px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
      }
      .dc-ic.blue { background: #eff4fa; color: #1b4f8a; }
      .dc-glyph { width: 16px; height: 16px; display: block; }
      .dc-row-body { flex: 1; display: flex; flex-direction: column; min-width: 0; }
      .dc-row-title { font-size: 13.5px; font-weight: 700; color: #16211a; }
      .dc-row-sub { font-size: 12px; color: #93a29a; margin-top: 2px; }
      .dc-dl, .dc-play { color: #1b4f8a; display: flex; align-items: center; }
    `,
  ],
})
export class MsmeDocumentsComponent {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;
  /** The API origin, so a relative document url resolves outside the dev proxy path. */
  private readonly origin = environment.apiBase.replace(/\/api$/, '');

  readonly rows = signal<DocRow[]>([]);
  readonly loading = signal(true);

  readonly documents = computed(() => this.rows().filter((r) => r.kind === 'document'));
  readonly videos = computed(() => this.rows().filter((r) => r.kind === 'video'));

  constructor() {
    this.http.get<DocRow[]>(`${this.base}/msme/documents`).subscribe({
      next: (r) => { this.rows.set(r ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  /** "General · 09:20" — the level, then whatever the library records. */
  videoSub(v: DocRow): string {
    return [v.category, v.description].filter(Boolean).join(' · ');
  }

  /** The deck tints a video row by its certification level. */
  accent(category: string | null): string {
    const c = (category ?? '').toUpperCase();
    if (c.includes('BRONZE')) return '#c2410c';
    if (c.includes('SILVER')) return '#5d6b62';
    if (c.includes('GOLD')) return '#a16207';
    return '#0f7b45';
  }

  tint(category: string | null): string {
    const c = (category ?? '').toUpperCase();
    if (c.includes('BRONZE')) return '#fdf3ec';
    if (c.includes('SILVER')) return '#edf2ef';
    if (c.includes('GOLD')) return '#fefce8';
    return '#f0faf4';
  }

  fullUrl(d: DocRow): string {
    return d.url.startsWith('http') ? d.url : `${this.origin}${d.url}`;
  }
}
