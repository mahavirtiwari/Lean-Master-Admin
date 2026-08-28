import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';

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
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent],
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
    if (level.code === 'SILVER') {
      void this.router.navigate(['/msme/application']);
    } else {
      window.alert(`${level.name} is completed on the MSME LEAN mobile app.`);
    }
  }

  constructor() {
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
