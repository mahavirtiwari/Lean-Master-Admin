import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MsmeAppBannerComponent } from './msme-app-banner.component';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';
import { MsmeSidebarComponent } from './msme-sidebar.component';
import type { BronzeData, BronzeParticipant } from './msme-bronze.component';

/** What the dashboard endpoint returns. */
export interface MsmeDashboard {
  enterprise: {
    leanId: string;
    name: string;
    udyamNumber: string;
    entrepreneur: string | null;
    size: string | null;
    registeredOn: string;
    isActive: boolean;
    nicTwoDigit: string | null;
    nicFourDigit: string | null;
    nicFiveDigit: string | null;
    activity: string | null;
    unit: {
      unitName: string | null;
      address: string | null;
      pincode: string | null;
      state: string | null;
      district: string | null;
    } | null;
  };
  levels: {
    code: string;
    name: string;
    sortOrder: number;
    delivery: string;
    cost: string;
    state: 'Open' | 'Locked' | 'In progress' | 'Certified';
    requiresBefore: string | null;
    applicationNo: string | null;
    applicationStatus: string | null;
    seated: number | null;
    certified: number | null;
    seats: number | null;
  }[];
  incentives: {
    unlocked: boolean;

    /**
     * The five boxes, each carrying its own incentives. Every box is listed
     * whether or not this enterprise has earned it — the scheme shows them from
     * the start and locks only the benefit behind them.
     */
    groups: {
      categoryId: number;
      code: string;
      name: string;
      description: string | null;
      partners: string | null;
      accent: string;
      count: number;
      unlockedCount: number;
      items: {
        incentiveId: number;
        name: string;
        description: string | null;
        activation: string;
        stakeholder: string;
        externalUrl: string | null;
        videoUrl: string | null;
        unlocked: boolean;
      }[];
    }[];
  };
}

/**
 * D1 — where an applicant lands after signing in.
 *
 * Outside the admin shell, like the rest of the applicant screens: no sidebar,
 * no permission matrix, one enterprise. The account issued at registration is
 * what identifies it, so nothing here takes an id.
 */
@Component({
  selector: 'app-msme-dashboard',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent, RouterLink, MsmeAppBannerComponent],
  templateUrl: './msme-dashboard.component.html',
  styleUrl: './msme-dashboard.component.scss',
})
export class MsmeDashboardComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly data = signal<MsmeDashboard | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly user = this.auth.user;
  readonly year = new Date().getFullYear();
  readonly appVersion = '1.0.0';
  readonly releasedOn = '20 Aug 2026';

  /** The enterprise's initials, for the avatar the artboard draws. */
  readonly initials = computed(() => {
    const name = this.data()?.enterprise.name ?? '';

    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
  });

  readonly downloading = signal(false);

  /**
   * The pledge certificate accepted at registration.
   *
   * The server renders it on request and streams it back; no copy is kept, so
   * the certificate always reflects the enterprise as it stands.
   */
  downloadPledge(): void {
    if (this.downloading()) return;

    this.downloading.set(true);

    this.http
      .get(`${environment.apiBase}/msme/pledge`, { responseType: 'blob' })
      .subscribe({
        next: (pdf) => {
          this.downloading.set(false);

          const url = URL.createObjectURL(pdf);
          const link = document.createElement('a');

          link.href = url;
          link.download = `lean-pledge-${this.data()?.enterprise.udyamNumber ?? 'certificate'}.pdf`;
          link.click();

          URL.revokeObjectURL(url);
        },
        error: () => {
          this.downloading.set(false);
          this.error.set('The pledge certificate could not be prepared. Please try again.');
        },
      });
  }

  /** The level the applicant is invited to start with — the first one open. */
  readonly nextLevel = computed(
    () => this.data()?.levels.find((l) => l.state === 'Open') ?? null,
  );

  /**
   * Start the application for the given level. Silver runs on web through
   * submission and payment; Bronze (courses) and Gold open on the mobile app.
   */
  apply(level: { code: string; name: string }): void {
    const code = level.code.toUpperCase();
    if (code.includes('SILVER')) {
      void this.router.navigate(['/msme/application']);
    } else if (code.includes('BRONZE')) {
      // Bronze is e-learning: it opens its own screen, where the enterprise
      // seats participants and follows them on the LMS.
      void this.router.navigate(['/msme/bronze']);
    } else {
      window.alert(`${level.name} opens once Silver is certified.`);
    }
  }

  // ---- certification card presentation (deck H00/H02) ----

  /** The tier lockup the artboard uses on each card. */
  badge(code: string): string {
    const c = (code || '').toUpperCase();
    const file = c.includes('BRONZE') ? 'lean-bronze' : c.includes('GOLD') ? 'lean-gold' : 'lean-silver';
    return `assets/${file}.png`;
  }

  /**
   * How many of the five milestone dots are filled. The dashboard summary does
   * not carry per-milestone progress yet, so this reads what it does know: a
   * certified level is complete, anything else has not started.
   */
  /**
   * One dot per Bronze seat: solid once that participant is certified, filled in
   * as soon as somebody is sitting in it. Seating five people and seeing five
   * empty circles reads as no progress at all, when in fact the seats are the
   * progress.
   */
  dotClass(level: { state: string; seated: number | null; certified: number | null; seats: number | null }, i: number): string {
    if (level.seats === null) return level.state === 'Certified' ? 'is-on' : '';
    if (i < (level.certified ?? 0)) return 'is-on';
    if (i < (level.seated ?? 0)) return 'is-seated';
    return '';
  }

  stateClass(state: string): string {
    switch (state) {
      case 'Certified': return 's-done';
      case 'In progress': return 's-prog';
      case 'Locked': return 's-lock';
      default: return 's-open';
    }
  }

  stateIcon(state: string): string {
    return state === 'Certified' ? '✓' : state === 'Locked' ? '🔒' : '→';
  }

  stateLabel(state: string): string {
    switch (state) {
      case 'Certified': return 'Completed';
      case 'In progress': return 'In progress';
      case 'Locked': return 'Locked';
      default: return 'Not started';
    }
  }

  levelNote(level: { state: string; requiresBefore: string | null; cost: string; seated: number | null; certified: number | null; seats: number | null }): string {
    if (level.state === 'Locked' && level.requiresBefore) return `Needs a valid ${level.requiresBefore} certificate`;

    // Bronze says where its seats have got to, which is the only progress it has.
    if (level.seats !== null && (level.seated ?? 0) > 0) {
      return `${level.certified ?? 0} of ${level.seated} certified · ${level.seats} seats`;
    }

    return level.cost === 'FREE' ? 'Five self-paced courses, exam each' : 'Handholding, then assessment';
  }

  // ---- the participants behind the Bronze card (VIEW DETAILS) ----

  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);
  readonly detail = signal<BronzeData | null>(null);

  /**
   * VIEW DETAILS on Bronze opens the people, because the level is only ever as
   * far along as they are. The other levels have no participants, so it opens
   * the level itself.
   */
  viewDetails(level: { code: string; name: string; seats: number | null }): void {
    if (level.seats === null) return this.apply(level);

    this.detailOpen.set(true);

    if (this.detail() === null) {
      this.detailLoading.set(true);
      this.http.get<BronzeData>(`${environment.apiBase}/msme/bronze`).subscribe({
        next: (d) => { this.detail.set(d); this.detailLoading.set(false); },
        error: () => this.detailLoading.set(false),
      });
    }
  }

  progressOf(p: BronzeParticipant): number {
    return p.coursesTotal === 0 ? 0 : Math.round((p.coursesDone / p.coursesTotal) * 100);
  }

  participantState(p: BronzeParticipant): string {
    switch (p.status) {
      case 'Certified': return 'Certified';
      case 'ExamDue': return 'Exam due';
      case 'Learning': return 'Learning';
      default: return 'Not started';
    }
  }

  /** A glyph for an incentive group, from its code — matching the deck's icons. */
  groupGlyph(code: string): string {
    const c = (code || '').toUpperCase();
    if (c.includes('TECH')) return '⚙️';
    if (c.includes('TEST') || c.includes('CERT') || c.includes('PROD')) return '🧪';
    if (c.includes('STATE')) return '🏛️';
    if (c.includes('MARKET')) return '📣';
    return '★';
  }

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<MsmeDashboard>(`${environment.apiBase}/msme/dashboard`).subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: (response: { status?: number }) => {
        this.loading.set(false);
        this.error.set(
          response.status === 404
            ? 'No enterprise is linked to this account. Please contact the helpline.'
            : 'Your dashboard could not be loaded. Please try again.',
        );
      },
    });
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';

    const date = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  unitLine(): string {
    const unit = this.data()?.enterprise.unit;
    if (!unit) return '—';

    return [unit.unitName, unit.address, unit.district, unit.state, unit.pincode]
      .filter(Boolean)
      .join(', ');
  }

  signOut(): void {
    this.auth.logout();
    void this.router.navigate(['/msme/login']);
  }

  help(): void {
    window.open('https://ndie.qcin.org/contact-us/', '_blank', 'noopener,noreferrer');
  }
}
