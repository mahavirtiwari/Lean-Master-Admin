import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MsmePageNavComponent } from './msme-page-nav.component';
import { MsmeLoadErrorComponent } from './msme-load-error.component';
import { httpErrorMessage } from '../../shared/http-error';
import { istDateTime } from '../../shared/when';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';
import { MsmeSidebarComponent } from './msme-sidebar.component';

export interface BronzeParticipant {
  id: number;
  name: string;
  designation: string | null;
  email: string;
  initials: string;
  coursesDone: number;
  coursesTotal: number;
  status: 'NotStarted' | 'Learning' | 'ExamDue' | 'Certified';
  certifiedOn: string | null;
  certificateNo: string | null;
  leanId: string | null;
  attemptsUsed: number;
  attemptsAllowed: number;
  attemptsLeft: number;
  accountState: 'Active' | 'Completed' | 'Locked';
}

export interface BronzeData {
  lmsUrl: string;
  lmsName: string;
  seats: { total: number; used: number; left: number; certified: number; learning: number; examDue: number };
  courses: { no: number; title: string; description: string | null }[];
  courseCount: number;
  participants: BronzeParticipant[];
}

/**
 * LEAN Bronze (C01a / C01b, with the course list of C01d as a dialog).
 *
 * Bronze is e-learning, not an assessment: the enterprise seats up to five
 * people, each takes every course and one final exam on the LMS, and each earns
 * their own certificate. The courses and the exam run on the LMS — this screen
 * holds the seats and shows the progress the LMS reports, which is why every
 * action here opens the LMS rather than pretending to teach.
 */
@Component({
  selector: 'app-msme-bronze',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent, RouterLink, MsmePageNavComponent, MsmeLoadErrorComponent],
  templateUrl: './msme-bronze.component.html',
  styleUrl: './msme-bronze.component.scss',
})
export class MsmeBronzeComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBase;

  readonly data = signal<BronzeData | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly coursesOpen = signal(false);

  /** Which participant's details are being sent, and how it went. */
  readonly resending = signal<number | null>(null);
  readonly detailFor = signal<BronzeParticipant | null>(null);
  readonly resentFor = signal<number | null>(null);
  readonly resentNote = signal<string | null>(null);
  readonly resentBad = signal(false);

  readonly hasParticipants = computed(() => (this.data()?.participants.length ?? 0) > 0);

  /** "Just applied" until somebody is seated, then the running subtitle. */
  readonly subtitle = computed(() => (this.hasParticipants() ? 'E-Learning on the LMS' : 'Just applied'));

  /** The five seat segments, coloured by the participant sitting in each. */
  readonly seatBar = computed(() => {
    const d = this.data();
    const total = d?.seats.total ?? 5;
    return Array.from({ length: total }, (_, i) => d?.participants[i]?.status ?? null);
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.http.get<BronzeData>(`${this.base}/msme/bronze`).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (e: unknown) => {
        this.loadError.set(httpErrorMessage(e));
        this.loading.set(false);
      },
    });
  }

  /**
   * Sends the participant their LEAN ID and a fresh password.
   *
   * The old password cannot be read back — only its hash is kept — so this
   * issues a new one rather than repeating the original. Their LEAN ID stays as
   * it was, since the LMS may already know it.
   */
  resendLogin(p: BronzeParticipant): void {
    if (this.resending() !== null) return;

    this.resending.set(p.id);
    this.resentFor.set(p.id);
    this.resentNote.set(null);
    this.resentBad.set(false);

    this.http.post<{ leanId: string }>(`${this.base}/msme/bronze/participants/${p.id}/credentials`, {}).subscribe({
      next: (r) => {
        this.resending.set(null);
        this.resentBad.set(false);
        this.resentNote.set(`Sent to ${p.email} — LEAN ID ${r.leanId} with a new password.`);
        // The id is issued on the first send, so reload to show it on the card.
        this.load();
      },
      error: (e: { error?: { message?: string } }) => {
        this.resending.set(null);
        this.resentBad.set(true);
        this.resentNote.set(e.error?.message ?? 'The details could not be sent. Please try again.');
      },
    });
  }

  openLms(): void {
    const url = this.data()?.lmsUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  addParticipant(): void {
    void this.router.navigate(['/msme/bronze/add-participant']);
  }

  /** The bar under a participant, as a percentage of their courses done. */
  progress(p: BronzeParticipant): number {
    return p.coursesTotal === 0 ? 0 : Math.round((p.coursesDone / p.coursesTotal) * 100);
  }

  seatClass(status: string | null): string {
    switch (status) {
      case 'Certified': return 'is-certified';
      case 'ExamDue': return 'is-exam';
      case 'Learning':
      case 'NotStarted': return 'is-learning';
      default: return '';
    }
  }

  /**
   * Three states, as the scheme talks about them: nothing begun, under way, or
   * finished. Learning and ExamDue are both "in progress" - the participant has
   * started and has not finished, which is what the enterprise needs to see.
   */
  statusLabel(s: string): string {
    switch (s) {
      case 'Certified': return 'Completed';
      case 'ExamDue':
      case 'Learning': return 'In progress';
      default: return 'Yet to start';
    }
  }

  accountLabel(state: string): string {
    switch (state) {
      case 'Completed': return 'Closed - course finished';
      case 'Locked': return 'Locked - all exam attempts used';
      default: return 'Active';
    }
  }

  /** A certification date, in Indian time. */
  when(iso: string): string {
    return istDateTime(iso);
  }

  statusNote(p: BronzeParticipant): string {
    if (p.accountState === 'Completed') return 'Exam passed · certificate e-mailed · account closed';
    if (p.accountState === 'Locked') return `All ${p.attemptsAllowed} attempts used · account locked`;

    switch (p.status) {
      case 'ExamDue': return this.attemptNote(p, 'All courses done · exam pending');
      case 'Learning': return 'Courses in progress on the LMS';
      default: return 'Signed up · yet to start on the LMS';
    }
  }

  /** Appends the attempts left once at least one has been spent. */
  private attemptNote(p: BronzeParticipant, base: string): string {
    return p.attemptsUsed > 0
      ? `${base} · ${p.attemptsLeft} of ${p.attemptsAllowed} attempts left`
      : base;
  }

  /** The line under the seat bar: what the seats are actually doing. */
  seatNote(): string {
    const s = this.data()?.seats;
    if (!s) return '';
    if (s.used === 0) return 'A seat is held for its participant until they finish.';
    const bits: string[] = [];
    if (s.certified) bits.push(`${s.certified} certified`);
    const running = s.learning + s.examDue;
    if (running) bits.push(`${running} still on the courses`);
    return bits.join(' · ');
  }
}
