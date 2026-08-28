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
                    <span class="dc-ic blue">📄</span>
                    <span class="dc-row-body">
                      <span class="dc-row-title">{{ d.title }}</span>
                      @if (d.description) { <span class="dc-row-sub">{{ d.description }}</span> }
                      @else if (d.fileName) { <span class="dc-row-sub">{{ d.fileName }}</span> }
                    </span>
                    <span class="dc-dl">⬇</span>
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
                      <span class="dc-ic green">▶</span>
                      <span class="dc-row-body">
                        <span class="dc-row-title">{{ v.title }}</span>
                        @if (v.description) { <span class="dc-row-sub">{{ v.description }}</span> }
                      </span>
                      <span class="dc-play">▶</span>
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

      .dc-grid { display: grid; grid-template-columns: 292px minmax(0, 1fr); gap: 24px; align-items: start; }
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
        flex: none; width: 34px; height: 34px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center; font-size: 15px;
      }
      .dc-ic.blue { background: #eaf1f9; }
      .dc-ic.green { background: #eef8f1; color: #0f7b45; }
      .dc-row-body { flex: 1; display: flex; flex-direction: column; min-width: 0; }
      .dc-row-title { font-size: 13.5px; font-weight: 700; color: #16211a; }
      .dc-row-sub { font-size: 12px; color: #93a29a; margin-top: 2px; }
      .dc-dl, .dc-play { color: #1b4f8a; font-size: 15px; }
      .dc-ic.green + .dc-row-body + .dc-play { color: #0f7b45; }
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

  fullUrl(d: DocRow): string {
    return d.url.startsWith('http') ? d.url : `${this.origin}${d.url}`;
  }
}
