import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AccountTypeSummary, Role, UserRow } from '../../core/models';
import {
  ConfirmComponent,
  EmptyComponent,
  PageIntroComponent,
  PagerComponent,
} from '../../shared/ui';

/**
 * The user list for one account type — screens 4, 18, 19, 20, 21, 22, 23, 24
 * and 25, plus their no-data variants and the disable/enable dialogs (44, 45,
 * 50, 51, 55–58, 62–65).
 *
 * All nine are one component parameterised by `accountTypeId` from the route.
 * They differ only in heading, description and which reference column the table
 * shows; the grid, filters, tabs and row actions are identical on every
 * artboard, so nine copies would be nine places to fix one bug.
 */
@Component({
  selector: 'app-user-list',
  imports: [
    FormsModule,
    RouterLink,
    DecimalPipe,
    DatePipe,
    PageIntroComponent,
    PagerComponent,
    EmptyComponent,
    ConfirmComponent,
  ],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss',
})
export class UserListComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** Route param: /user-management/type/:accountTypeId */
  readonly accountTypeId = input.required<string>();

  readonly rows = signal<UserRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 25;
  readonly loading = signal(true);

  readonly types = signal<AccountTypeSummary[]>([]);
  readonly roles = signal<Role[]>([]);

  readonly search = signal('');
  readonly roleId = signal('');
  readonly statusTab = signal<'' | '1' | '2'>('');

  readonly confirming = signal<UserRow | null>(null);

  readonly canCreate = this.auth.can('USER_MGMT', 'create');
  readonly canEdit = this.auth.can('USER_MGMT', 'edit');

  readonly typeId = computed(() => Number(this.accountTypeId()));

  readonly accountType = computed(() =>
    this.types().find((t) => t.accountTypeId === this.typeId()),
  );

  /**
   * The reference column changes per account type: an Implementing Agency user
   * belongs to an agency, a State Specific user to a State. The designs show
   * one or the other, never both.
   */
  readonly referenceColumn = computed(() => {
    switch (this.typeId()) {
      case 2:
        return { header: 'Ministry / Department', kind: 'org' as const };
      case 3:
        return { header: 'State / UT', kind: 'state' as const };
      case 1:
      case 4:
        return { header: 'Implementing Agency', kind: 'org' as const };
      case 6:
      case 7:
        return { header: 'Organisation', kind: 'org' as const };
      default:
        return { header: 'Organisation', kind: 'org' as const };
    }
  });

  constructor() {
    this.api.userAccountTypes().subscribe((types) => this.types.set(types));

    // Re-runs when the sub-menu switches account type, which is what makes the
    // nine sidebar links work against one component.
    effect(() => {
      const id = this.typeId();

      this.page.set(1);
      this.search.set('');
      this.roleId.set('');
      this.statusTab.set('');

      this.api.roles(id).subscribe((roles) => this.roles.set(roles));
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);

    this.api
      .users({
        accountTypeId: this.typeId(),
        search: this.search(),
        roleId: this.roleId(),
        statusId: this.statusTab(),
        pageNumber: this.page(),
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (result) => {
          this.rows.set(result.items);
          this.total.set(result.totalCount);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.load();
  }

  setTab(tab: '' | '1' | '2'): void {
    this.statusTab.set(tab);
    this.applyFilters();
  }

  reference(row: UserRow): string {
    return this.referenceColumn().kind === 'state'
      ? (row.stateName ?? row.jurisdiction ?? '—')
      : (row.organisationName ?? '—');
  }

  /** "Today" / "Yesterday" / a date, as the design's Last Login column reads. */
  lastLogin(row: UserRow): string | null {
    if (!row.lastLoginOnUtc) return null;

    const days = Math.floor(
      (Date.now() - new Date(row.lastLoginOnUtc).getTime()) / 86_400_000,
    );

    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;

    return null; // caller falls back to the date pipe
  }

  confirmToggle(): void {
    const row = this.confirming();
    if (!row) return;

    const disabling = row.statusId === 1;

    this.api
      .setUserStatus(row.userId, {
        statusId: disabling ? 2 : 1,
        reason: disabling
          ? 'Disabled from the User Management screen.'
          : 'Re-enabled from the User Management screen.',
      })
      .subscribe({
        next: () => {
          this.confirming.set(null);
          this.api.userAccountTypes().subscribe((types) => this.types.set(types));
          this.load();
        },
        error: () => this.confirming.set(null),
      });
  }
}
