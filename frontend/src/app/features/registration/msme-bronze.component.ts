import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

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
}

export interface BronzeData {
  lmsUrl: string;
  lmsName: string;
  seats: { total: number; used: number; left: number; certified: number; learning: number; examDue: number };
  courses: { no: number; title: string }[];
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
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent, RouterLink],
  templateUrl: './msme-bronze.component.html',
  styleUrl: './msme-bronze.component.scss',
})
export class MsmeBronzeComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBase;

  readonly data = signal<BronzeData | null>(null);
  readonly loading = signal(true);
  readonly coursesOpen = signal(false);

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

  private load(): void {
    this.http.get<BronzeData>(`${this.base}/msme/bronze`).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
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

  statusLabel(s: string): string {
    switch (s) {
      case 'Certified': return 'Certified';
      case 'ExamDue': return 'Exam due';
      case 'Learning': return 'Learning';
      default: return 'Not started';
    }
  }

  statusNote(p: BronzeParticipant): string {
    switch (p.status) {
      case 'Certified': return 'Exam passed · certificate issued';
      case 'ExamDue': return 'All courses done · exam pending';
      case 'Learning': return 'Courses in progress on the LMS';
      default: return 'Yet to start on the LMS';
    }
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
