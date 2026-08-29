import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';
import { MsmeSidebarComponent } from './msme-sidebar.component';
import type { BronzeData } from './msme-bronze.component';

/**
 * Add a LEAN Bronze participant (C01c).
 *
 * Seats a named person against the enterprise. The address matters twice over —
 * it is both the LMS sign-in and where that person's certificate goes — so it is
 * required and validated here rather than left to the server to reject.
 */
@Component({
  selector: 'app-msme-add-participant',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent],
  template: `
    <app-msme-masthead mode="app" />
    <app-msme-section-menu />

    <main class="ap-ground">
      <div class="ap-wrap">
        <div class="ap-crumb">Home <span>›</span> Dashboard <span>›</span> Add Participant</div>
        <h1 class="ap-h1">Add Participant</h1>
        <p class="ap-h1-sub">LEAN Bronze</p>

        <div class="ap-grid">
          <app-msme-sidebar />

          <div class="ap-body">
            <div class="ap-banner">
              <span class="ap-banner-h">LEAN BRONZE</span>
              <span class="ap-banner-s">
                @if (seats(); as s) {
                  Participant {{ s.used + 1 }} of {{ s.total }} · {{ s.left }} seat{{ s.left === 1 ? '' : 's' }} left
                } @else {
                  Seating a participant
                }
              </span>
            </div>

            <section class="ap-card">
              <h2 class="ap-h">Participant details</h2>

              <label class="ap-label" for="name">FULL NAME <span class="ap-req">*</span></label>
              <input id="name" class="ap-input" type="text" placeholder="Participant full name"
                     [value]="name()" (input)="name.set($any($event.target).value)" />

              <label class="ap-label" for="designation">DESIGNATION <span class="ap-req">*</span></label>
              <input id="designation" class="ap-input" type="text" placeholder="e.g. Plant Head"
                     [value]="designation()" (input)="designation.set($any($event.target).value)" />
              <p class="ap-hint">Their role in the unit</p>

              <label class="ap-label" for="email">EMAIL ADDRESS <span class="ap-req">*</span></label>
              <input id="email" class="ap-input" type="email" placeholder="Enter here"
                     [value]="email()" (input)="email.set($any($event.target).value)" />
              <p class="ap-hint">LMS sign-in and the certificate go to this address</p>

              <label class="ap-label" for="mobile">MOBILE NUMBER</label>
              <input id="mobile" class="ap-input" type="tel" inputmode="numeric" placeholder="Enter here"
                     [value]="mobile()" (input)="mobile.set(digits($any($event.target).value))" />
              <p class="ap-hint">SMS alerts and reminders</p>

              @if (error()) { <div class="ap-error" role="alert">{{ error() }}</div> }
            </section>

            <div class="ap-note">
              <span class="ap-note-ic">ⓘ</span>
              An LMS account is created for this person. They take all
              {{ courseCount() }} courses and then the single exam.
            </div>

            <div class="ap-actions">
              <button class="ap-btn ap-cancel" type="button" (click)="cancel()">Cancel</button>
              <button class="ap-btn ap-save" type="button" [disabled]="busy()" (click)="submit()">
                {{ busy() ? 'Adding…' : 'Add Participant' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: #f4f7f5; }
      .ap-ground { padding: 24px 40px 64px; }
      .ap-wrap { max-width: 1192px; margin: 0 auto; }
      .ap-crumb { font-size: 12px; color: #93a29a; }
      .ap-crumb span { margin: 0 6px; }
      .ap-h1 { font-size: 18.5px; font-weight: 700; color: #16211a; margin: 4px 0 2px; }
      .ap-h1-sub { font-size: 12px; color: #5d6b62; margin: 0 0 18px; }

      .ap-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; align-items: start; }
      @media (max-width: 980px) { .ap-grid { grid-template-columns: minmax(0, 1fr); } }
      .ap-body { display: flex; flex-direction: column; gap: 14px; }

      .ap-banner {
        display: flex; flex-direction: column; gap: 3px;
        background: #f0faf4; border-left: 3px solid #0f7b45; border-radius: 8px; padding: 12px 16px;
      }
      .ap-banner-h { font-size: 10.4px; font-weight: 700; letter-spacing: 0.6px; color: #0f7b45; }
      .ap-banner-s { font-size: 11.4px; color: #5d6b62; }

      .ap-card { background: #fff; border: 1px solid #e8efea; border-radius: 12px; padding: 22px; }
      .ap-h { font-size: 14.6px; font-weight: 700; color: #16211a; margin: 0 0 16px; }
      .ap-label { display: block; font-size: 10.4px; font-weight: 700; letter-spacing: 0.06em; color: #47554c; margin-bottom: 7px; }
      .ap-req { color: #d64545; }
      .ap-input {
        width: 100%; box-sizing: border-box; padding: 12px 14px;
        border: 1px solid #d7e0da; border-radius: 8px; background: #fff;
        font-size: 13px; color: #16211a; font-family: inherit;
      }
      .ap-input:focus { outline: none; border-color: #1b4f8a; }
      .ap-hint { font-size: 10.8px; color: #93a29a; margin: 7px 0 16px; }
      .ap-input + .ap-label { margin-top: 16px; }

      .ap-error {
        background: #fdf1f1; color: #b91c1c; border-radius: 8px;
        padding: 11px 14px; font-size: 12.4px; margin-top: 14px;
      }

      .ap-note {
        display: flex; gap: 9px; align-items: flex-start;
        background: #eff4fa; border: 1px solid #cfe0f1; border-radius: 10px;
        padding: 13px 16px; font-size: 11.6px; color: #385e86; line-height: 1.5;
      }
      .ap-note-ic { color: #1b4f8a; }

      .ap-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .ap-btn {
        border-radius: 8px; padding: 12px 30px; font-size: 13px; font-weight: 700; cursor: pointer;
      }
      .ap-cancel { background: #fff; border: 1px solid #d7e0da; color: #16211a; }
      .ap-cancel:hover { background: #f7faf8; }
      .ap-save { background: #1b4f8a; border: none; color: #fff; }
      .ap-save:hover { background: #163f6f; }
      .ap-save:disabled { opacity: 0.6; cursor: default; }
    `,
  ],
})
export class MsmeAddParticipantComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBase;

  readonly name = signal('');
  readonly designation = signal('');
  readonly email = signal('');
  readonly mobile = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly seats = signal<BronzeData['seats'] | null>(null);
  readonly courseCount = signal(11);

  constructor() {
    // The banner counts the seat this person will take, so it reads the same
    // numbers the Bronze screen just showed.
    this.http.get<BronzeData>(`${this.base}/msme/bronze`).subscribe({
      next: (d) => { this.seats.set(d.seats); this.courseCount.set(d.courseCount); },
      error: () => { /* the form still works without the count */ },
    });
  }

  digits(v: string): string {
    return v.replace(/\D+/g, '').slice(0, 10);
  }

  submit(): void {
    if (this.busy()) return;
    if (!this.name().trim()) return this.error.set('Enter the participant’s full name.');
    if (!this.designation().trim()) return this.error.set('Enter their designation.');
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(this.email().trim())) {
      return this.error.set('Enter a valid email address — the certificate goes there.');
    }
    if (this.mobile() && this.mobile().length !== 10) return this.error.set('A mobile number is 10 digits.');

    this.busy.set(true);
    this.error.set(null);

    this.http.post(`${this.base}/msme/bronze/participants`, {
      fullName: this.name().trim(),
      designation: this.designation().trim(),
      email: this.email().trim(),
      mobile: this.mobile() || null,
    }).subscribe({
      next: () => { this.busy.set(false); void this.router.navigate(['/msme/bronze']); },
      error: (r: { error?: { message?: string; errors?: unknown } }) => {
        this.busy.set(false);
        const errs = r.error?.errors;
        const first = Array.isArray(errs) ? String(errs[0])
          : errs && typeof errs === 'object' ? Object.values(errs as Record<string, string[]>)[0]?.[0]
          : undefined;
        this.error.set(first ?? r.error?.message ?? 'The participant could not be added. Please try again.');
      },
    });
  }

  cancel(): void {
    void this.router.navigate(['/msme/bronze']);
  }
}
