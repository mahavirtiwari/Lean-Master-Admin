import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MsmePageNavComponent } from './msme-page-nav.component';
import { MsmeLoadErrorComponent } from './msme-load-error.component';
import { httpErrorMessage } from '../../shared/http-error';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';
import { MsmeSidebarComponent } from './msme-sidebar.component';

interface ActivityOption {
  id: number;
  activity: string | null;
  nicTwoDigit: string | null;
  nicTwoDigitName: string | null;
  nicFourDigit: string | null;
  nicFourDigitName: string | null;
  nicFiveDigit: string | null;
  nicFiveDigitName: string | null;
  selected: boolean;
  /** Whether the scheme covers this activity's sector — Sectors master data. */
  eligible: boolean;
  sectorName: string | null;
}

interface ActivitiesResponse {
  udyamNumber: string;
  lastSyncedOn: string | null;
  selectedActivityId: number | null;
  activities: ActivityOption[];
}

/**
 * Sector &amp; NIC (P04).
 *
 * The codes belong to Udyam — the applicant never types them. What they choose
 * is which of the activities on their Udyam record this registration is against,
 * shown the same way the registration wizard showed them, so the screen is one
 * they have already used. Changing it is written to the profile's change log.
 */
@Component({
  selector: 'app-msme-sector-nic',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent, MsmePageNavComponent, MsmeLoadErrorComponent],
  template: `
    <app-msme-masthead mode="app" />
    <app-msme-section-menu />

    <main class="sn-ground">
      <div class="sn-wrap">
        <div class="sn-crumb-row">
          <div class="sn-crumb">Home <span>›</span> View Profile <span>›</span> Sector &amp; NIC</div>
          <app-msme-page-nav to="/msme/profile" [showRefresh]="false" />
        </div>
        <h1 class="sn-h1">Sector &amp; NIC</h1>
        <p class="sn-h1-sub">Read-only from Udyam</p>

        <div class="sn-grid">
          <app-msme-sidebar />

          <div class="sn-body">
            <div class="sn-warn">
              <span class="sn-warn-ic">⚠</span>
              Sector and NIC codes are owned by Udyam. You choose which of the activities on your
              Udyam record this registration is against; the codes themselves cannot be typed over.
            </div>

            @if (loading()) {
              <div class="sn-card sn-loading">Loading…</div>
            } @else if (loadError(); as msg) {
              <app-msme-load-error [message]="msg" (retry)="load()" />
            } @else if (data(); as d) {
              <section class="sn-card">
                <h2 class="sn-h">Source of record</h2>
                <div class="sn-kv"><span class="sn-k">Udyam number</span><span class="sn-v">{{ d.udyamNumber }}</span></div>
                <div class="sn-kv"><span class="sn-k">Last synced</span><span class="sn-v">{{ d.lastSyncedOn ? formatDate(d.lastSyncedOn) : 'Not recorded' }}</span></div>
              </section>

              <div class="sn-block-head">
                <h2 class="sn-h">Select the activity</h2>
                <p class="sn-sub">
                  {{ d.activities.length }} activit{{ d.activities.length === 1 ? 'y is' : 'ies are' }}
                  recorded against this Udyam number.
                </p>
              </div>

              @for (a of d.activities; track a.id) {
                <button
                  type="button"
                  class="sn-opt"
                  [class.is-sel]="chosen() === a.id"
                  [class.is-blocked]="!a.eligible"
                  [disabled]="!a.eligible"
                  (click)="chosen.set(a.id)"
                >
                  <span class="sn-radio" [class.on]="chosen() === a.id"></span>
                  <span class="sn-opt-body">
                    <span class="sn-opt-head">
                      <span class="sn-opt-name">{{ a.nicFiveDigitName || a.activity || 'Activity' }}</span>
                      @if (a.selected) { <span class="sn-tag">Current</span> }
                      @if (!a.eligible) { <span class="sn-tag is-bad">Not covered</span> }
                    </span>

                    @if (a.activity) {
                      <span class="sn-major">Major activity: {{ a.activity }}</span>
                    }

                    <span class="sn-nic"><span class="sn-nic-k">NIC 2-DIGIT</span><span class="sn-nic-v">{{ pair(a.nicTwoDigit, a.nicTwoDigitName) }}</span></span>
                    <span class="sn-nic"><span class="sn-nic-k">NIC 4-DIGIT</span><span class="sn-nic-v">{{ pair(a.nicFourDigit, a.nicFourDigitName) }}</span></span>
                    <span class="sn-nic"><span class="sn-nic-k">NIC 5-DIGIT</span><span class="sn-nic-v">{{ pair(a.nicFiveDigit, a.nicFiveDigitName) }}</span></span>

                    @if (!a.eligible) {
                      <span class="sn-blocked">
                        NIC {{ a.nicTwoDigit }} is not a sector the LEAN Scheme currently covers,
                        so this activity cannot be selected.
                      </span>
                    }
                  </span>
                </button>
              } @empty {
                <div class="sn-card sn-loading">
                  No activity is recorded against this Udyam number yet.
                </div>
              }

              @if (note()) {
                <div class="sn-note" [class.is-bad]="noteBad()">{{ note() }}</div>
              }

              <div class="sn-actions">
                <button class="sn-btn sn-cancel" type="button" (click)="back()">Cancel</button>
                <button
                  class="sn-btn sn-save"
                  type="button"
                  [disabled]="saving() || chosen() === null || chosen() === d.selectedActivityId"
                  (click)="save()"
                >
                  {{ saving() ? 'Saving…' : 'Save selection' }}
                </button>
              </div>
            } @else {
              <div class="sn-card sn-loading">The sector and NIC could not be loaded. Please try again.</div>
            }
          </div>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: #f4f7f5; }
      .sn-ground { padding: 24px 40px 64px; }
      .sn-wrap { max-width: 1192px; margin: 0 auto; }
      .sn-crumb-row {
        display: flex; align-items: center;
        gap: 12px; flex-wrap: wrap;
      }
      .sn-crumb { font-size: 12px; color: #93a29a; }
      .sn-crumb span { margin: 0 6px; }
      .sn-h1 { font-size: 18.5px; font-weight: 700; color: #16211a; margin: 4px 0 2px; }
      .sn-h1-sub { font-size: 12px; color: #5d6b62; margin: 0 0 18px; }

      .sn-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; align-items: start; }
      @media (max-width: 980px) { .sn-grid { grid-template-columns: minmax(0, 1fr); } }
      .sn-body { display: flex; flex-direction: column; gap: 12px; }

      .sn-warn {
        display: flex; gap: 10px; align-items: flex-start;
        background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px;
        padding: 13px 16px; font-size: 11.8px; color: #7c6f52; line-height: 1.5;
      }
      .sn-warn-ic { color: #a16207; }

      .sn-card { background: #fff; border: 1px solid #e8efea; border-radius: 12px; padding: 18px 20px; }
      .sn-loading { color: #93a29a; font-size: 13px; }
      .sn-h { font-size: 14px; font-weight: 700; color: #16211a; margin: 0 0 12px; }
      .sn-kv { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f0f4f1; }
      .sn-kv:last-child { border-bottom: 0; }
      .sn-k { font-size: 12.4px; color: #5d6b62; }
      .sn-v { font-size: 12.4px; font-weight: 600; color: #16211a; }

      .sn-block-head { margin: 8px 0 0; }
      .sn-sub { font-size: 11.6px; color: #93a29a; margin: 3px 0 0; }

      // The activity cards the registration wizard uses, so the choice is made
      // the same way it was made the first time.
      .sn-opt {
        display: flex; gap: 12px; align-items: flex-start; width: 100%; text-align: left;
        background: #fff; border: 1.5px solid #e8efea; border-radius: 12px;
        padding: 16px; cursor: pointer;
        transition: border-color 120ms ease, background 120ms ease;
      }
      .sn-opt:hover { border-color: #b9ccc2; }
      .sn-opt.is-sel { border-color: #1b4f8a; background: #f6f9fc; }
      // Outside a covered sector: shown, so the applicant can see it was
      // considered, but not selectable.
      .sn-opt.is-blocked { background: #fafcfb; cursor: default; opacity: 0.75; }
      .sn-opt.is-blocked:hover { border-color: #e8efea; }
      .sn-tag.is-bad { color: #b91c1c; background: #fdf1f1; border-color: #f3cfcf; }
      .sn-blocked { font-size: 11px; font-weight: 600; color: #b91c1c; line-height: 1.45; }

      .sn-radio {
        flex: none; width: 18px; height: 18px; border-radius: 50%;
        border: 2px solid #c6d3cb; margin-top: 2px; position: relative;
      }
      .sn-radio.on { border-color: #1b4f8a; }
      .sn-radio.on::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: #1b4f8a; }

      .sn-opt-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
      .sn-opt-head { display: flex; align-items: center; gap: 10px; }
      .sn-opt-name { font-size: 13.4px; font-weight: 700; color: #16211a; line-height: 1.35; }
      .sn-tag {
        font-size: 10px; font-weight: 700; color: #0f7b45;
        background: #eef8f1; border: 1px solid #cfe8d8; border-radius: 999px; padding: 2px 9px;
      }
      .sn-major {
        align-self: flex-start; font-size: 11px; font-weight: 600; color: #1b4f8a;
        background: #eff4fa; border: 1px solid #cfe0f1; border-radius: 6px; padding: 2px 8px;
      }
      .sn-nic {
        display: flex; flex-direction: column; gap: 2px;
        background: #fafcfb; border: 1px solid #eef3f0; border-radius: 8px; padding: 8px 10px;
      }
      .sn-nic-k { font-size: 9.6px; font-weight: 700; letter-spacing: 0.4px; color: #93a29a; }
      .sn-nic-v { font-size: 11.4px; font-weight: 600; color: #16211a; line-height: 1.4; }

      .sn-note {
        background: #eef8f1; border: 1px solid #cfe8d8; color: #216a41;
        border-radius: 10px; padding: 11px 14px; font-size: 12px;
      }
      .sn-note.is-bad { background: #fdf1f1; border-color: #f3cfcf; color: #b91c1c; }

      .sn-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px; }
      .sn-btn { border-radius: 8px; padding: 12px 28px; font-size: 13px; font-weight: 700; cursor: pointer; }
      .sn-cancel { background: #fff; border: 1px solid #d7e0da; color: #16211a; }
      .sn-cancel:hover { background: #f7faf8; }
      .sn-save { background: #1b4f8a; border: none; color: #fff; }
      .sn-save:hover { background: #163f6f; }
      .sn-save:disabled { opacity: 0.55; cursor: default; }
    `,
  ],
})
export class MsmeSectorNicComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBase;

  readonly data = signal<ActivitiesResponse | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly chosen = signal<number | null>(null);
  readonly saving = signal(false);
  readonly note = signal<string | null>(null);
  readonly noteBad = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.http.get<ActivitiesResponse>(`${this.base}/msme/profile/activities`).subscribe({
      next: (d) => {
        this.data.set(d);
        this.chosen.set(d.selectedActivityId);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.loadError.set(httpErrorMessage(e));
        this.loading.set(false);
      },
    });
  }

  pair(code: string | null, name: string | null): string {
    if (!code) return '—';
    return name ? `${code} — ${name}` : code;
  }

  save(): void {
    const id = this.chosen();
    if (id === null || this.saving()) return;

    this.saving.set(true);
    this.note.set(null);
    this.noteBad.set(false);

    this.http.post<{ message: string }>(`${this.base}/msme/profile/activity`, { activityId: id }).subscribe({
      next: () => {
        this.saving.set(false);
        // The change is made; the place to see it is the profile, so go there
        // rather than leaving the applicant on a form they have finished with.
        void this.router.navigate(['/msme/profile']);
      },
      error: (e: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.noteBad.set(true);
        this.note.set(e.error?.message ?? 'The selection could not be saved. Please try again.');
      },
    });
  }

  back(): void {
    void this.router.navigate(['/msme/profile']);
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
