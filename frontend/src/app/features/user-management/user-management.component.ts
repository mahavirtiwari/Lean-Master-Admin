import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AccountTypeSummary, PermissionMatrix } from '../../core/models';
import { EmptyComponent, PageIntroComponent } from '../../shared/ui';

/**
 * User Management landing (2-green.svg, 2-User-Management-no-data.svg).
 *
 * The artboard is four blocks, not one: a search bar over the whole user base,
 * the nine account-type cards, a two-step Export panel, and the Role &
 * Permission Matrix showing which modules each account type may open.
 *
 * The cards are banded in threes on the design — blue for the three types the
 * portal issues directly, green for the delivery partners, amber for the
 * assessment side. Only the first three offer "Create New User": an OEM,
 * consultant or assessor account is raised by the organisation that empanels
 * them, not by the Ministry.
 */
@Component({
  selector: 'app-user-management',
  imports: [RouterLink, FormsModule, DecimalPipe, PageIntroComponent, EmptyComponent],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss',
})
export class UserManagementComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly types = signal<AccountTypeSummary[]>([]);
  readonly matrix = signal<PermissionMatrix | null>(null);
  readonly loading = signal(true);

  // Search box across the whole user base; Enter hands off to the list screen.
  readonly search = signal('');
  readonly filterAccountType = signal('');
  readonly filterRole = signal('');
  readonly filterStatus = signal('');

  // Export panel — step 1 is the account-type selection, step 2 the filters.
  readonly selectedTypes = signal<Set<number>>(new Set());
  readonly exportStatus = signal('');
  readonly exportFrom = signal(financialYearStart());
  readonly exportTo = signal(today());
  readonly exportFormat = signal('xlsx');

  readonly canCreate = this.auth.can('USER_MGMT', 'create');
  readonly canEdit = this.auth.can('USER_MGMT', 'edit');
  readonly canExport = this.auth.can('USER_MGMT', 'export');

  readonly totalUsers = computed(() =>
    this.types().reduce((sum, type) => sum + type.totalUsers, 0),
  );

  /**
   * OEMs, PSUs and IAs as one card.
   *
   * They are three account types in auth.AccountType because a user belongs to
   * exactly one of them, but the deck shows them as a single industry-partner
   * group everywhere — the cards, the export list and the permission matrix.
   * Nine cards, which is what the subtitle has always claimed.
   */
  readonly cards = computed(() => {
    const partnerTypes = new Set([4, 11, 12]);
    const partners = this.types().filter((t) => partnerTypes.has(t.accountTypeId));
    const rest = this.types().filter((t) => !partnerTypes.has(t.accountTypeId));

    if (partners.length === 0) return rest;

    const merged: AccountTypeSummary = {
      ...partners[0],
      name: 'OEMs / PSUs / IAs',
      description: 'Sector-mapped industry partners and anchor enterprises',
      totalUsers: partners.reduce((n, t) => n + t.totalUsers, 0),
      activeUsers: partners.reduce((n, t) => n + t.activeUsers, 0),
      inactiveUsers: partners.reduce((n, t) => n + t.inactiveUsers, 0),
      // Every type in the group, so selecting the card selects all three.
      groupedTypeIds: partners.map((t) => t.accountTypeId),
    };

    return [...rest, merged].sort((a, b) => a.sortOrder - b.sortOrder);
  });

  readonly selectedCount = computed(() =>
    this.types()
      .filter((type) => this.selectedTypes().has(type.accountTypeId))
      .reduce((sum, type) => sum + type.totalUsers, 0),
  );

  /** Every underlying account type a card stands for. */
  typeIdsOf(card: AccountTypeSummary): number[] {
    return card.groupedTypeIds ?? [card.accountTypeId];
  }

  isCardSelected(card: AccountTypeSummary): boolean {
    return this.typeIdsOf(card).every((id) => this.selectedTypes().has(id));
  }

  toggleCard(card: AccountTypeSummary): void {
    const next = new Set(this.selectedTypes());
    const ids = this.typeIdsOf(card);
    const on = this.isCardSelected(card);

    for (const id of ids) {
      if (on) next.delete(id);
      else next.add(id);
    }
    this.selectedTypes.set(next);
  }

  constructor() {
    this.api.userAccountTypes().subscribe({
      next: (types) => {
        this.types.set([...types].sort((a, b) => a.sortOrder - b.sortOrder));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.api.permissionMatrix().subscribe({
      next: (matrix) => this.matrix.set(matrix),
      error: () => this.matrix.set(null),
    });
  }

  /** Rows of three, banded as on the design. */
  toneFor(index: number): 'blue' | 'green' | 'amber' {
    if (index < 3) return 'blue';
    if (index < 6) return 'green';
    return 'amber';
  }

  toggleSelected(accountTypeId: number): void {
    const next = new Set(this.selectedTypes());
    next.has(accountTypeId) ? next.delete(accountTypeId) : next.add(accountTypeId);
    this.selectedTypes.set(next);
  }

  isSelected(accountTypeId: number): boolean {
    return this.selectedTypes().has(accountTypeId);
  }

  selectAll(): void {
    this.selectedTypes.set(new Set(this.types().map((t) => t.accountTypeId)));
  }

  clearSelection(): void {
    this.selectedTypes.set(new Set());
  }

  /** Hands the search to the per-type list, which is where results are shown. */
  runSearch(): void {
    const typeId = this.filterAccountType() || this.types()[0]?.accountTypeId;
    if (!typeId) return;

    void this.router.navigate(['/user-management/type', typeId], {
      queryParams: {
        search: this.search() || null,
        roleId: this.filterRole() || null,
        statusId: this.filterStatus() || null,
      },
    });
  }
}

/** The Indian financial year runs April to March. */
function financialYearStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
