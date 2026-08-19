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

  readonly selectedCount = computed(() =>
    this.types()
      .filter((type) => this.selectedTypes().has(type.accountTypeId))
      .reduce((sum, type) => sum + type.totalUsers, 0),
  );

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
