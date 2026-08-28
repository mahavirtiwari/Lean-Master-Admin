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
    nicTwoDigit: string | null;
    nicFourDigit: string | null;
    nicFiveDigit: string | null;
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
        <div class="sb-row"><span class="sb-ic">🏭</span><span class="sb-row-strong">{{ d.enterprise.unit?.unitName || '—' }}</span></div>
        <div class="sb-row"><span class="sb-ic">📍</span><span>{{ unitAddress(d) }}</span></div>

        <div class="sb-head">Selected Activity</div>
        <div class="sb-row"><span class="sb-ic">🏷️</span><span class="sb-row-strong">{{ d.enterprise.activity || 'Manufacturing' }}</span></div>
        @if (d.enterprise.nicTwoDigit) { <div class="sb-row"><span class="sb-ic">🧩</span><span>NIC {{ d.enterprise.nicTwoDigit }}</span></div> }
        @if (d.enterprise.nicFourDigit) { <div class="sb-row"><span class="sb-ic">🧩</span><span>NIC {{ d.enterprise.nicFourDigit }}</span></div> }
        @if (d.enterprise.nicFiveDigit) { <div class="sb-row"><span class="sb-ic">🧩</span><span>NIC {{ d.enterprise.nicFiveDigit }}</span></div> }

        <div class="sb-head">LEAN Pledge Certificate</div>
        <div class="sb-row sb-pledge">
          <span class="sb-ic">📄</span>
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
      .sb { display: flex; flex-direction: column; gap: 10px; }
      .sb-card { background: #fff; border: 1px solid #e9efeb; border-radius: 12px; padding: 16px; }
      .sb-loading { color: #93a29a; font-size: 13px; }
      .sb-size {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 11px; font-weight: 700; letter-spacing: 0.05em; color: #c2410c;
      }
      .sb-size-dot {
        width: 20px; height: 20px; border-radius: 6px; background: #fdecdf; color: #c2410c;
        display: inline-flex; align-items: center; justify-content: center; font-size: 11px;
      }
      .sb-name { font-size: 15px; font-weight: 700; color: #16211a; margin: 10px 0 12px; }
      .sb-kv { display: flex; flex-direction: column; margin-bottom: 10px; }
      .sb-k { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; color: #93a29a; }
      .sb-v { font-size: 13px; font-weight: 600; color: #16211a; margin-top: 2px; }

      .sb-head {
        background: #e1f0e8; color: #0f7b45; font-size: 12px; font-weight: 700;
        padding: 8px 12px; border-radius: 8px; margin-top: 4px;
      }
      .sb-row {
        display: flex; gap: 10px; align-items: flex-start;
        background: #fff; border: 1px solid #e9efeb; border-radius: 8px; padding: 10px 12px;
        font-size: 12.5px; color: #47554c; line-height: 1.45;
      }
      .sb-ic { flex: none; }
      .sb-row-strong { font-weight: 700; color: #16211a; }
      .sb-pledge-body { display: flex; flex-direction: column; gap: 2px; }
      .sb-download { color: #1b4f8a; font-weight: 700; text-decoration: none; font-size: 12px; }
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
