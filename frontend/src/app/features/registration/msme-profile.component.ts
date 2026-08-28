import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';
import { MsmeSidebarComponent } from './msme-sidebar.component';

interface Profile {
  enterprise: {
    name: string;
    leanId: string;
    udyamRegistrationNo: string;
    ownerName: string | null;
    gender: string | null;
    socialCategory: string | null;
    addressLine: string | null;
    pan: string | null;
    registeredOn: string;
    enterpriseSize: string | null;
    organisationType: string | null;
    activity: string | null;
    totalEmployees: number | null;
  };
  spoc: {
    name: string | null;
    designation: string | null;
    email: string | null;
    mobile: string | null;
  };
}

/**
 * View Profile (P01) — read-only. The enterprise fields come from the MSME
 * registry, so they are shown but not editable here; SPOC contact and the plant
 * activity are the parts the applicant maintains (on the mobile app), noted as
 * such. The enterprise column on the left is the shared sidebar.
 */
@Component({
  selector: 'app-msme-profile',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent],
  template: `
    <app-msme-masthead mode="app" />
    <app-msme-section-menu />

    <main class="pf-ground">
      <div class="pf-wrap">
        <div class="pf-crumb">Home <span>›</span> View Profile</div>
        <h1 class="pf-h1">View Profile</h1>
        <p class="pf-h1-sub">Enterprise &amp; SPOC</p>

        <div class="pf-grid">
          <app-msme-sidebar />

          <div class="pf-body">
            @if (loading()) {
              <div class="pf-card pf-loading">Loading your profile…</div>
            } @else if (data(); as p) {
              <h2 class="pf-section-title">Profile</h2>

              <section class="pf-card">
                <div class="pf-card-head">
                  <div>
                    <h3 class="pf-h">Enterprise Details</h3>
                    <p class="pf-sub">Validated from the MSME database, Ministry of MSME — these fields are read-only</p>
                  </div>
                  <span class="pf-lock" title="Read-only">🔒</span>
                </div>

                <div class="pf-field"><span class="pf-label">ENTERPRISE NAME</span><div class="pf-ro">{{ p.enterprise.name }}</div></div>
                <div class="pf-field"><span class="pf-label">UDYAM REGISTRATION NUMBER</span><div class="pf-ro">{{ p.enterprise.udyamRegistrationNo }}</div></div>
                <div class="pf-field"><span class="pf-label">NAME OF ENTREPRENEUR</span><div class="pf-ro">{{ p.enterprise.ownerName || '—' }}</div></div>
                <div class="pf-two">
                  <div class="pf-field"><span class="pf-label">GENDER</span><div class="pf-ro">{{ p.enterprise.gender || '—' }}</div></div>
                  <div class="pf-field"><span class="pf-label">SOCIAL CATEGORY</span><div class="pf-ro">{{ p.enterprise.socialCategory || '—' }}</div></div>
                </div>
                <div class="pf-field"><span class="pf-label">REGISTERED ADDRESS (AS PER UDYAM)</span><div class="pf-ro">{{ p.enterprise.addressLine || '—' }}</div></div>
                <div class="pf-field"><span class="pf-label">DATE OF UDYAM REGISTRATION</span><div class="pf-ro">{{ formatDate(p.enterprise.registeredOn) }}</div></div>
                <div class="pf-two">
                  <div class="pf-field"><span class="pf-label">ENTERPRISE TYPE</span><div class="pf-ro">{{ p.enterprise.enterpriseSize || '—' }}</div></div>
                  <div class="pf-field"><span class="pf-label">MAJOR ACTIVITY</span><div class="pf-ro">{{ p.enterprise.activity || '—' }}</div></div>
                </div>
                <div class="pf-field"><span class="pf-label">ORGANISATION TYPE</span><div class="pf-ro">{{ p.enterprise.organisationType || '—' }}</div></div>
                <div class="pf-two">
                  <div class="pf-field"><span class="pf-label">PAN</span><div class="pf-ro">{{ p.enterprise.pan || '—' }}</div></div>
                  <div class="pf-field"><span class="pf-label">NUMBER OF EMPLOYEES</span><div class="pf-ro">{{ p.enterprise.totalEmployees ?? '—' }}</div></div>
                </div>
              </section>

              <section class="pf-card">
                <div class="pf-card-head">
                  <h3 class="pf-h">SPOC Contact Details</h3>
                  <span class="pf-editnote">Edited on the mobile app</span>
                </div>
                <div class="pf-kv"><span class="pf-k">Name</span><span class="pf-v">{{ p.spoc.name || '—' }}</span></div>
                <div class="pf-kv"><span class="pf-k">Designation</span><span class="pf-v">{{ p.spoc.designation || '—' }}</span></div>
                <div class="pf-kv"><span class="pf-k">Email</span><span class="pf-v">{{ p.spoc.email || '—' }}</span></div>
                <div class="pf-kv"><span class="pf-k">Mobile</span><span class="pf-v">{{ p.spoc.mobile || '—' }}</span></div>
              </section>
            } @else {
              <div class="pf-card pf-loading">Your profile could not be loaded. Please try again.</div>
            }
          </div>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: #f4f7f5; }
      .pf-ground { padding: 24px 40px 64px; }
      .pf-wrap { max-width: 1192px; margin: 0 auto; }
      .pf-crumb { font-size: 12px; color: #93a29a; }
      .pf-crumb span { margin: 0 6px; }
      .pf-h1 { font-size: 18.5px; font-weight: 700; color: #16211a; margin: 4px 0 2px; }
      .pf-h1-sub { font-size: 13px; color: #5d6b62; margin: 0 0 18px; }

      .pf-grid { display: grid; grid-template-columns: 292px minmax(0, 1fr); gap: 24px; align-items: start; }
      @media (max-width: 980px) { .pf-grid { grid-template-columns: minmax(0, 1fr); } }

      .pf-body { display: flex; flex-direction: column; gap: 14px; }
      .pf-section-title { font-size: 16px; font-weight: 700; color: #16211a; margin: 0; }
      .pf-card { background: #fff; border: 1px solid #e9efeb; border-radius: 14px; padding: 22px; }
      .pf-loading { color: #93a29a; font-size: 13px; }
      .pf-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .pf-h { font-size: 15px; font-weight: 700; color: #16211a; margin: 0; }
      .pf-sub { font-size: 12px; color: #93a29a; margin: 4px 0 0; }
      .pf-lock { opacity: 0.5; }
      .pf-editnote { font-size: 11.5px; color: #93a29a; }

      .pf-field { margin-bottom: 12px; }
      .pf-label { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; color: #93a29a; margin-bottom: 5px; }
      .pf-ro { background: #eef3f0; border-radius: 8px; padding: 11px 13px; font-size: 13.5px; color: #16211a; }
      .pf-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      @media (max-width: 560px) { .pf-two { grid-template-columns: 1fr; } }

      .pf-kv { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid #f0f4f1; }
      .pf-kv:last-child { border-bottom: 0; }
      .pf-k { font-size: 13px; color: #5d6b62; }
      .pf-v { font-size: 13px; font-weight: 600; color: #16211a; text-align: right; }
    `,
  ],
})
export class MsmeProfileComponent {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  readonly data = signal<Profile | null>(null);
  readonly loading = signal(true);

  constructor() {
    this.http.get<Profile>(`${this.base}/msme/profile`).subscribe({
      next: (p) => { this.data.set(p); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
}
