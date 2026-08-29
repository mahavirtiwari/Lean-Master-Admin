import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';

import { environment } from '../../../environments/environment';

interface SidebarData {
  enterprise: {
    leanId: string;
    name: string;
    udyamNumber: string;
    size: string | null;
    registeredOn: string;
    activity: string | null;
    majorActivity: string | null;
    nicTwoDigit: string | null;
    nicFourDigit: string | null;
    nicFiveDigit: string | null;
    nicTwoDigitName: string | null;
    nicFourDigitName: string | null;
    nicFiveDigitName: string | null;
    unit: {
      unitName: string | null;
      address: string | null;
      pincode: string | null;
      state: string | null;
      district: string | null;
    } | null;
  };
}

/**
 * The enterprise column the applicant deck runs down the left of every inside
 * screen (H00, C00, D01, Y00, P01): the enterprise card, then the Selected
 * Unit, Selected Activity and LEAN Pledge cards. It fetches the dashboard
 * summary itself so any screen can drop it in with no wiring, and the four
 * screens stay identical here as the deck draws them.
 */
@Component({
  selector: 'app-msme-sidebar',
  imports: [],
  template: `
    @if (data(); as d) {
      <aside class="sb">
        <div class="sb-card">
          @if (d.enterprise.size) {
            <span class="sb-size"><span class="sb-size-dot">{{ initial() }}</span>{{ d.enterprise.size.toUpperCase() }}</span>
          }
          <div class="sb-name">{{ d.enterprise.name }}</div>
          <div class="sb-kv"><span class="sb-k">UDYAM NUMBER</span><span class="sb-v">{{ d.enterprise.udyamNumber }}</span></div>
          <div class="sb-kv"><span class="sb-k">LEAN ID</span><span class="sb-v">{{ d.enterprise.leanId }}</span></div>
        </div>

        <div class="sb-head">Selected Unit</div>
        <div class="sb-row"><span class="sb-ic sb-ic-unit"></span><span class="sb-row-strong">{{ d.enterprise.unit?.unitName || '—' }}</span></div>
        <div class="sb-row"><span class="sb-ic sb-ic-pin"></span><span>{{ unitAddress(d) }}</span></div>

        <div class="sb-head">Selected Activity</div>
        <div class="sb-row"><span class="sb-ic sb-ic-factory"></span><span>{{ d.enterprise.majorActivity || d.enterprise.activity || 'Manufacturing' }}</span></div>
        @for (n of nicRows(d); track n) {
          <div class="sb-row"><span class="sb-ic sb-ic-layers"></span><span>{{ n }}</span></div>
        }

        <div class="sb-head">LEAN Pledge Certificate</div>
        <div class="sb-row sb-pledge">
          <span class="sb-ic sb-ic-doc"></span>
          <span class="sb-pledge-body">
            <span>Taken {{ formatDate(d.enterprise.registeredOn) }}</span>
            <a class="sb-download" [href]="pledgeUrl()" target="_blank" rel="noopener">Download certificate ›</a>
          </span>
        </div>
      </aside>
    } @else {
      <aside class="sb"><div class="sb-card sb-loading">Loading…</div></aside>
    }
  `,
  styles: [
    `
      :host { display: block; }

      // Measured from the deck: 300 wide, headers 36 tall with a 3px green bar
      // at their left edge, rows 8 below a header and 8 apart, 12 before the
      // next header.
      .sb { display: flex; flex-direction: column; }
      .sb-card {
        background: #fff; border: 1px solid #e8efea; border-radius: 12px;
        padding: 18px 20px; margin-bottom: 12px;
      }
      .sb-loading { color: #93a29a; font-size: 13px; }
      .sb-size {
        display: inline-flex; align-items: center; gap: 8px;
        font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: #c2410c;
      }
      .sb-size-dot {
        width: 22px; height: 22px; border-radius: 6px; background: #fdf3ec; color: #c2410c;
        display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
      }
      .sb-name { font-size: 15px; font-weight: 700; color: #16211a; margin: 12px 0 14px; line-height: 1.3; }
      .sb-kv { display: flex; flex-direction: column; margin-bottom: 12px; }
      .sb-kv:last-child { margin-bottom: 0; }
      .sb-k { font-size: 10.4px; font-weight: 700; letter-spacing: 0.06em; color: #93a29a; }
      .sb-v { font-size: 12.6px; font-weight: 700; color: #16211a; margin-top: 3px; }

      // The section pill: tinted, radius 8, with the artboard's 3px green rail.
      .sb-head {
        position: relative;
        min-height: 36px;
        display: flex; align-items: center;
        background: #e1f0e8; color: #0f7b45;
        font-size: 12.2px; font-weight: 700;
        padding: 0 16px; border-radius: 8px; overflow: hidden;
        margin: 12px 0 8px;
      }
      .sb-head::before {
        content: ''; position: absolute; left: 0; top: 0; bottom: 0;
        width: 3px; background: #0f7b45;
      }

      .sb-row {
        display: flex; gap: 12px; align-items: flex-start;
        background: #fff; border: 1px solid #e8efea; border-radius: 8px;
        padding: 8px 14px 8px 16px; margin-bottom: 8px;
        font-size: 11.6px; color: #16211a; line-height: 1.47;
        min-height: 33px; box-sizing: border-box;
      }
      .sb-row:last-child { margin-bottom: 0; }
      .sb-row-strong { font-weight: 700; }

      // Icons drawn rather than emoji, so they match the deck's line art.
      .sb-ic {
        flex: none; width: 16px; height: 16px; margin-top: 1px;
        background-repeat: no-repeat; background-position: center; background-size: contain;
      }
      .sb-ic-unit {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%230F7B45' stroke-width='1.4' stroke-linejoin='round'%3E%3Crect x='3' y='2.2' width='10' height='11.6' rx='1'/%3E%3Cpath d='M5.4 5h2M5.4 7.6h2M5.4 10.2h2M9 5h1.6M9 7.6h1.6M9 10.2h1.6'/%3E%3C/svg%3E");
      }
      .sb-ic-pin {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%230F7B45' stroke-width='1.4' stroke-linejoin='round'%3E%3Cpath d='M8 14s4.4-4.2 4.4-7A4.4 4.4 0 0 0 3.6 7c0 2.8 4.4 7 4.4 7Z'/%3E%3Ccircle cx='8' cy='6.9' r='1.7'/%3E%3C/svg%3E");
      }
      .sb-ic-factory {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%230F7B45' stroke-width='1.4' stroke-linejoin='round'%3E%3Cpath d='M2.4 13.4V7l4.2 2.6V7l4.2 2.6V4.2h2.8v9.2z'/%3E%3C/svg%3E");
      }
      .sb-ic-layers {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%230F7B45' stroke-width='1.4' stroke-linejoin='round'%3E%3Cpath d='M8 2.4 14 5.6 8 8.8 2 5.6z'/%3E%3Cpath d='m2 8.4 6 3.2 6-3.2'/%3E%3C/svg%3E");
      }
      .sb-ic-doc {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%230F7B45' stroke-width='1.4' stroke-linejoin='round'%3E%3Cpath d='M4.2 2.2h5L12 5v8.8H4.2z'/%3E%3Cpath d='M9 2.2V5h3'/%3E%3C/svg%3E");
      }

      .sb-pledge { min-height: 52px; align-items: center; }
      .sb-pledge-body { display: flex; flex-direction: column; gap: 3px; }
      .sb-pledge-body > span { font-weight: 600; }
      .sb-download { color: #1b4f8a; font-weight: 700; text-decoration: none; font-size: 10.8px; }
      .sb-download:hover { text-decoration: underline; }
    `,
  ],
})
export class MsmeSidebarComponent {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  readonly data = signal<SidebarData | null>(null);

  readonly initial = computed(() => (this.data()?.enterprise.name ?? '?').trim().charAt(0).toUpperCase());

  constructor() {
    this.http.get<SidebarData>(`${this.base}/msme/dashboard`).subscribe({
      next: (d) => this.data.set(d),
      error: () => this.data.set(null),
    });
  }

  /** "25 - Manufacture of fabricated metal products", one row per NIC level. */
  nicRows(d: SidebarData): string[] {
    const e = d.enterprise;
    return ([
      [e.nicTwoDigit, e.nicTwoDigitName],
      [e.nicFourDigit, e.nicFourDigitName],
      [e.nicFiveDigit, e.nicFiveDigitName],
    ] as [string | null, string | null][])
      .filter(([code]) => !!code)
      .map(([code, name]) => (name ? `${code} - ${name}` : code!));
  }

  unitAddress(d: SidebarData): string {
    const u = d.enterprise.unit;
    if (!u) return '—';
    return [u.address, u.district, u.state, u.pincode].filter(Boolean).join(', ') || '—';
  }

  pledgeUrl(): string {
    return `${this.base}/msme/pledge`;
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
}
