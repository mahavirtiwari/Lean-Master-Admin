import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { UserDetail } from '../../core/models';
import { PageIntroComponent } from '../../shared/ui';

/** Module order as the sidebar and the permission matrix present it. */
const MODULE_LABELS: Record<string, string> = {
  DASHBOARD: 'Dashboard',
  HANDHOLDING: 'Handholding',
  ASSESSMENTS: 'Assessments',
  USER_MGMT: 'User Management',
  SECTORS: 'Sectors',
  PARAMETER: 'Parameter',
  QUES_SILVER: 'Questionnaire Silver',
  QUES_GOLD: 'Questionnaire Gold',
  FEE_STRUCTURE: 'Fee Structure',
  INCENTIVES: 'Incentives',
  TECH_UPGRAD: 'Technology Upgradation',
  DOCUMENTS: 'Upload Documents',
  REPORTS: 'Reports',
  EMAILER: 'Emailer',
  SETTINGS: 'Settings',
};

const RIGHTS = ['view', 'create', 'edit', 'delete', 'export'];

/**
 * View User (42-um-view-user, 53-min-view-user, 60-state-view-user).
 *
 * Profile block plus the effective permission grid — what this account can
 * actually do, which is the question the screen exists to answer.
 */
@Component({
  selector: 'app-user-detail',
  imports: [RouterLink, DatePipe, PageIntroComponent],
  templateUrl: './user-detail.component.html',
  styleUrl: './user-detail.component.scss',
})
export class UserDetailComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  readonly user = signal<UserDetail | null>(null);
  readonly loading = signal(true);

  readonly rights = RIGHTS;
  readonly canEdit = this.auth.can('USER_MGMT', 'edit');

  /**
   * Turns the flat `MODULE.right` list into one row per module, which is how
   * the design shows it — a list of 75 keys is unreadable.
   */
  readonly grid = computed(() => {
    const granted = new Set(this.user()?.permissions ?? []);

    return Object.entries(MODULE_LABELS).map(([code, label]) => ({
      code,
      label,
      cells: RIGHTS.map((right) => granted.has(`${code}.${right}`)),
      any: RIGHTS.some((right) => granted.has(`${code}.${right}`)),
    }));
  });

  readonly moduleCount = computed(() => this.grid().filter((row) => row.any).length);

  constructor() {
    effect(() => {
      const userId = Number(this.id());
      this.loading.set(true);

      this.api.user(userId).subscribe({
        next: (user) => {
          this.user.set(user);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    });
  }
}
