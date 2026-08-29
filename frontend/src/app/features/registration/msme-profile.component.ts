import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { istDate, istDateTime } from '../../shared/when';
import { MsmePageNavComponent } from './msme-page-nav.component';

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
    udyamSyncedOn: string | null;
  };
  spoc: { name: string | null; designation: string | null; email: string | null; mobile: string | null };
  awareness: {
    attended: boolean | null;
    agency: string | null;
    programCode: string | null;
    venue: string | null;
    heldOn: string | null;
  };
  associations: {
    implementingAgency: string | null;
    industryAssociation: string | null;
    associationMemberId: string | null;
    oemPsuName: string | null;
    vendorId: string | null;
  };
  plant: {
    unitName: string | null;
    address: string | null;
    pincode: string | null;
    state: string | null;
    district: string | null;
  } | null;
  selectedActivity: {
    enterpriseActivityId: number;
    activity: string | null;
    nicTwoDigit: string | null; nicTwoDigitName: string | null;
    nicFourDigit: string | null; nicFourDigitName: string | null;
    nicFiveDigit: string | null; nicFiveDigitName: string | null;
  } | null;
}

interface HistoryRow {
  section: string;
  /** "NIC sector updated" — the edit, not the individual columns it moved. */
  label: string;
  changedOnUtc: string;
  changedBy: string | null;
  fields: number;
}

/**
 * View Profile (P01) — read-only. The enterprise fields come from the MSME
 * registry, so they are shown but not editable here; SPOC contact and the plant
 * activity are the parts the applicant maintains (on the mobile app), noted as
 * such. The enterprise column on the left is the shared sidebar.
 */
@Component({
  selector: 'app-msme-profile',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent, MsmePageNavComponent],
  template: `
    <app-msme-masthead mode="app" />
    <app-msme-section-menu />

    <main class="pf-ground">
      <div class="pf-wrap">
        <div class="pf-crumb-row">
          <div class="pf-crumb">Home <span>›</span> View Profile</div>
          <app-msme-page-nav to="/msme/dashboard" (refresh)="load()" [busy]="loading()" />
        </div>
        <h1 class="pf-h1">View Profile</h1>
        <p class="pf-h1-sub">Enterprise &amp; SPOC</p>

        <div class="pf-grid">
          <app-msme-sidebar />

          <div class="pf-body">
            @if (loading()) {
              <div class="pf-card pf-loading">Loading your profile…</div>
            } @else if (data(); as p) {
              <h2 class="pf-section-title">Profile</h2>

              <!-- Udyam's record. Shown, never edited here: changing it in the
                   portal would put the two out of step. -->
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

              <!-- The SPOC receives everything the scheme sends, so it is the
                   applicant's to keep current. -->
              <section class="pf-card">
                <div class="pf-card-head">
                  <h3 class="pf-h">SPOC Contact Details</h3>
                  @if (!editSpoc()) {
                    <button class="pf-edit" type="button" (click)="startSpoc(p)">Edit</button>
                  }
                </div>

                @if (editSpoc()) {
                  <div class="pf-two">
                    <div class="pf-field"><span class="pf-label">NAME</span>
                      <input class="pf-in" [value]="spocName()" (input)="spocName.set($any($event.target).value)" /></div>
                    <div class="pf-field"><span class="pf-label">DESIGNATION</span>
                      <input class="pf-in" [value]="spocDesignation()" (input)="spocDesignation.set($any($event.target).value)" /></div>
                  </div>
                  <div class="pf-two">
                    <div class="pf-field"><span class="pf-label">EMAIL</span>
                      <input class="pf-in" type="email" [value]="spocEmail()" (input)="spocEmail.set($any($event.target).value)" /></div>
                    <div class="pf-field"><span class="pf-label">MOBILE</span>
                      <input class="pf-in" inputmode="numeric" [value]="spocMobile()" (input)="spocMobile.set(digits($any($event.target).value))" /></div>
                  </div>
                  @if (spocError()) { <p class="pf-err">{{ spocError() }}</p> }
                  <div class="pf-row-actions">
                    <button class="pf-btn pf-ghost" type="button" (click)="editSpoc.set(false)">Cancel</button>
                    <button class="pf-btn pf-primary" type="button" [disabled]="saving()" (click)="saveSpoc()">
                      {{ saving() ? 'Saving…' : 'Save' }}
                    </button>
                  </div>
                } @else {
                  <div class="pf-kv"><span class="pf-k">Name</span><span class="pf-v">{{ p.spoc.name || '—' }}</span></div>
                  <div class="pf-kv"><span class="pf-k">Designation</span><span class="pf-v">{{ p.spoc.designation || '—' }}</span></div>
                  <div class="pf-kv"><span class="pf-k">Email</span><span class="pf-v">{{ p.spoc.email || '—' }}</span></div>
                  <div class="pf-kv"><span class="pf-k">Mobile</span><span class="pf-v">{{ p.spoc.mobile || '—' }}</span></div>
                }
              </section>

              <section class="pf-card">
                <div class="pf-card-head">
                  <h3 class="pf-h">Awareness Program Participation</h3>
                </div>
                <div class="pf-kv"><span class="pf-k">Participated</span><span class="pf-v">{{ p.awareness.attended ? 'Yes' : 'No' }}</span></div>
                @if (p.awareness.programCode) {
                  <div class="pf-kv"><span class="pf-k">Program ID</span><span class="pf-v">{{ p.awareness.programCode }}</span></div>
                }
                @if (p.awareness.venue) {
                  <div class="pf-kv"><span class="pf-k">Venue</span><span class="pf-v">{{ p.awareness.venue }}</span></div>
                }
                @if (p.awareness.heldOn) {
                  <div class="pf-kv"><span class="pf-k">Held on</span><span class="pf-v">{{ formatDate(p.awareness.heldOn) }}</span></div>
                }
              </section>

              <!-- Read-only: these come from the scheme's own records, not
                   from the applicant. -->
              <section class="pf-card">
                <div class="pf-card-head"><h3 class="pf-h">Association/OEM/PSU Details</h3></div>
                <div class="pf-kv"><span class="pf-k">Implementing agency</span><span class="pf-v">{{ p.associations.implementingAgency || '—' }}</span></div>
                <div class="pf-kv"><span class="pf-k">Industry association</span><span class="pf-v">{{ p.associations.industryAssociation || '—' }}</span></div>
                <div class="pf-kv"><span class="pf-k">Member ID</span><span class="pf-v">{{ p.associations.associationMemberId || '—' }}</span></div>
                <div class="pf-kv"><span class="pf-k">OEM / PSU</span><span class="pf-v">{{ p.associations.oemPsuName || '—' }}</span></div>
                <div class="pf-kv"><span class="pf-k">Vendor ID</span><span class="pf-v">{{ p.associations.vendorId || '—' }}</span></div>
              </section>

              <section class="pf-card">
                <div class="pf-card-head"><h3 class="pf-h">Selected Plant Location</h3></div>
                <div class="pf-kv"><span class="pf-k">Plant name</span><span class="pf-v">{{ p.plant?.unitName || '—' }}</span></div>
                <div class="pf-field"><span class="pf-label">PLANT ADDRESS</span><div class="pf-ro">{{ plantAddress(p) }}</div></div>
              </section>

              <!-- Sector and NIC are Udyam's, so this opens the screen that
                   re-picks from the Udyam record rather than a text box. -->
              <section class="pf-card">
                <div class="pf-card-head">
                  <h3 class="pf-h">Selected Plant Activity</h3>
                  <button class="pf-edit" type="button" (click)="editSectorNic()">Edit</button>
                </div>
                @if (p.selectedActivity; as a) {
                  <!-- The major activity, not the 5-digit name: that already has its own
                       row below, and repeating it here says nothing new. -->
                  <div class="pf-field"><span class="pf-label">ACTIVITY</span><div class="pf-ro">{{ a.activity || a.nicFiveDigitName || '—' }}</div></div>
                  <div class="pf-kv"><span class="pf-k">NIC 2-digit</span><span class="pf-v">{{ pair(a.nicTwoDigit, a.nicTwoDigitName) }}</span></div>
                  <div class="pf-kv"><span class="pf-k">NIC 4-digit</span><span class="pf-v">{{ pair(a.nicFourDigit, a.nicFourDigitName) }}</span></div>
                  <div class="pf-kv"><span class="pf-k">NIC 5-digit</span><span class="pf-v">{{ pair(a.nicFiveDigit, a.nicFiveDigitName) }}</span></div>
                } @else {
                  <p class="pf-none">No activity selected yet.</p>
                }
              </section>

              <!-- What has been changed, so an edit can be explained later. -->
              @if (history().length > 0) {
                <section class="pf-card">
                  <div class="pf-card-head"><h3 class="pf-h">Change history</h3></div>
                  <ul class="pf-hist-list">
                    @for (h of history(); track $index) {
                      <li class="pf-hist-item">
                        <span class="pf-hist-text">{{ h.label }} on {{ formatWhen(h.changedOnUtc) }}</span>
                        @if (h.changedBy) { <span class="pf-hist-by">by {{ h.changedBy }}</span> }
                      </li>
                    }
                  </ul>
                </section>
              }
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
      .pf-crumb-row {
        display: flex; align-items: center;
        gap: 12px; flex-wrap: wrap;
      }
      .pf-crumb { font-size: 12px; color: #93a29a; }
      .pf-crumb span { margin: 0 6px; }
      .pf-h1 { font-size: 18.5px; font-weight: 700; color: #16211a; margin: 4px 0 2px; }
      .pf-h1-sub { font-size: 13px; color: #5d6b62; margin: 0 0 18px; }

      .pf-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; align-items: start; }
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
      .pf-none { font-size: 12.4px; color: #93a29a; margin: 0; }

      .pf-edit {
        background: none; border: none; padding: 0; cursor: pointer;
        font-size: 12px; font-weight: 700; color: #1b4f8a;
      }
      .pf-edit:hover { text-decoration: underline; }

      .pf-in {
        width: 100%; box-sizing: border-box; padding: 10px 12px;
        border: 1px solid #d7e0da; border-radius: 8px; background: #fff;
        font-size: 13px; color: #16211a; font-family: inherit;
      }
      .pf-in:focus { outline: none; border-color: #1b4f8a; }
      .pf-err { font-size: 12px; color: #b91c1c; margin: 6px 0 0; }

      .pf-row-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
      .pf-btn { border-radius: 8px; padding: 10px 22px; font-size: 12.6px; font-weight: 700; cursor: pointer; }
      .pf-ghost { background: #fff; border: 1px solid #d7e0da; color: #16211a; }
      .pf-primary { background: #1b4f8a; border: none; color: #fff; }
      .pf-primary:disabled { opacity: 0.55; cursor: default; }

      // One bullet per edit. The old and new values of every field are kept in
      // msme.EnterpriseChangeLog; this only says that something moved, and when.
      .pf-hist-list { margin: 0; padding-left: 18px; }
      .pf-hist-item { font-size: 12.6px; color: #16211a; line-height: 1.6; padding: 3px 0; }
      .pf-hist-item::marker { color: #0f7b45; }
      .pf-hist-by { font-size: 11px; color: #93a29a; margin-left: 6px; }
    `,
  ],
})
export class MsmeProfileComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBase;

  readonly data = signal<Profile | null>(null);
  readonly history = signal<HistoryRow[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly editSpoc = signal(false);
  readonly spocName = signal('');
  readonly spocDesignation = signal('');
  readonly spocEmail = signal('');
  readonly spocMobile = signal('');
  readonly spocError = signal<string | null>(null);


  constructor() {
    this.load();
  }

  load(): void {
    this.http.get<Profile>(`${this.base}/msme/profile`).subscribe({
      next: (p) => { this.data.set(p); this.loading.set(false); },
      error: () => this.loading.set(false),
    });

    this.http.get<HistoryRow[]>(`${this.base}/msme/profile/history`).subscribe({
      next: (h) => this.history.set(h ?? []),
      error: () => this.history.set([]),
    });
  }

  digits(v: string): string {
    return v.replace(/\D+/g, '').slice(0, 10);
  }

  pair(code: string | null, name: string | null): string {
    if (!code) return '—';
    return name ? `${code} — ${name}` : code;
  }

  plantAddress(p: Profile): string {
    const q = p.plant;
    if (!q) return '—';
    return [q.address, q.district, q.state, q.pincode].filter(Boolean).join(', ') || '—';
  }

  startSpoc(p: Profile): void {
    this.spocName.set(p.spoc.name ?? '');
    this.spocDesignation.set(p.spoc.designation ?? '');
    this.spocEmail.set(p.spoc.email ?? '');
    this.spocMobile.set(p.spoc.mobile ?? '');
    this.spocError.set(null);
    this.editSpoc.set(true);
  }

  saveSpoc(): void {
    if (this.saving()) return;
    if (!this.spocName().trim()) return this.spocError.set('Enter the SPOC name.');
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(this.spocEmail().trim())) {
      return this.spocError.set('Enter a valid email — the scheme writes to this address.');
    }
    if (this.spocMobile() && this.spocMobile().length !== 10) {
      return this.spocError.set('A mobile number is 10 digits.');
    }

    this.saving.set(true);
    this.http.put(`${this.base}/msme/profile/spoc`, {
      name: this.spocName().trim(),
      designation: this.spocDesignation().trim() || null,
      email: this.spocEmail().trim(),
      mobile: this.spocMobile() || null,
    }).subscribe({
      next: () => { this.saving.set(false); this.editSpoc.set(false); this.load(); },
      error: (e: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.spocError.set(e.error?.message ?? 'The SPOC could not be saved.');
      },
    });
  }


  editSectorNic(): void {
    void this.router.navigate(['/msme/profile/sector-nic']);
  }

  formatDate(iso: string): string {
    return istDate(iso);
  }

  formatWhen(iso: string): string {
    return istDateTime(iso);
  }
}
