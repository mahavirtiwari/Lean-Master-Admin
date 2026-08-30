import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { httpErrorMessage } from '../../shared/http-error';

interface AccountRow {
  accountTypeId: number | null;
  name: string;
  locked: boolean;
  modules: number;
  moduleTotal: number;
}

interface GridRow {
  kind: 'module' | 'child';
  moduleId?: number;
  parentModuleId?: number;
  code?: string;
  name: string;
  managedAccountTypeId?: number | null;
  grantable?: boolean;
  /** The scheme's own configuration — shown, but the Super Admin's alone. */
  locked?: boolean;
  access: boolean;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  export: boolean;
}

interface Grid {
  accountTypeId: number;
  name: string;
  rows: GridRow[];
  moduleCount: number;
  moduleTotal: number;
  scopeCount: number;
  scopeTotal: number;
}

type Right = 'view' | 'create' | 'edit' | 'delete' | 'export';

/**
 * Edit Role & Permissions (2-User-Management edit-permissions.svg).
 *
 * Role-wise: what a kind of account may reach. One person's exceptions are a
 * different thing and are edited on that user's own screen — changing a role
 * here moves everybody on it who has no override of their own.
 *
 * The grid lists every module with the menu items underneath it, so it reads
 * like the sidebar it governs. Only the User Management children carry a grant
 * of their own (which account types this one may administer); the rest are
 * navigation inside a single module and follow the module above them.
 */
@Component({
  selector: 'app-role-permissions',
  imports: [],
  templateUrl: './role-permissions.component.html',
  styleUrl: './role-permissions.component.scss',
})
export class RolePermissionsComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly base = environment.apiBase;

  readonly accounts = signal<AccountRow[]>([]);
  readonly grid = signal<Grid | null>(null);
  readonly selected = signal<number | null>(null);

  readonly loading = signal(true);
  readonly gridLoading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly canEdit = this.auth.can('USER_MGMT', 'edit');

  readonly rights: Right[] = ['view', 'create', 'edit', 'delete', 'export'];

  readonly moduleRows = computed(() => this.grid()?.rows.filter((r) => r.kind === 'module') ?? []);

  readonly grantedModules = computed(() => this.moduleRows().filter((r) => r.access).length);

  readonly grantedScopes = computed(
    () => this.grid()?.rows.filter((r) => r.kind === 'child' && r.grantable && r.access).length ?? 0,
  );

  constructor() {
    this.http.get<{ rows: AccountRow[] }>(`${this.base}/role-permissions`).subscribe({
      next: (r) => {
        this.accounts.set(r.rows ?? []);
        this.loading.set(false);

        // Opens on the first editable account type, because Super Admin is
        // read-only and an empty right-hand pane reads as a broken screen.
        const first = (r.rows ?? []).find((a) => !a.locked);
        if (first?.accountTypeId != null) this.select(first.accountTypeId);
      },
      error: (e: unknown) => {
        this.loadError.set(httpErrorMessage(e));
        this.loading.set(false);
      },
    });
  }

  select(accountTypeId: number | null): void {
    if (accountTypeId === null) return;

    this.selected.set(accountTypeId);
    this.gridLoading.set(true);
    this.saved.set(false);
    this.saveError.set(null);

    this.http.get<Grid>(`${this.base}/role-permissions/${accountTypeId}`).subscribe({
      next: (g) => {
        this.grid.set(g);
        this.gridLoading.set(false);
      },
      error: (e: unknown) => {
        this.saveError.set(httpErrorMessage(e));
        this.gridLoading.set(false);
      },
    });
  }

  /** A row the administrator can actually change. */
  editable(row: GridRow): boolean {
    if (!this.canEdit || row.locked) return false;

    return row.kind === 'module' || row.grantable === true;
  }

  toggleAccess(row: GridRow): void {
    if (!this.editable(row)) return;

    const on = !row.access;
    this.apply(row, (r) => {
      r.access = on;
      // Turning a module on grants View, which is the least it can usefully
      // mean; turning it off clears every right rather than leaving orphans.
      for (const right of this.rights) r[right] = on && right === 'view';
    });
  }

  toggleRight(row: GridRow, right: Right): void {
    if (!this.editable(row)) return;

    this.apply(row, (r) => {
      r[right] = !r[right];
      // A right without access is unreachable, so ticking one turns the module
      // on and clearing the last one turns it off.
      if (r[right]) r.access = true;
      else if (!this.rights.some((x) => r[x])) r.access = false;
    });
  }

  /** Rewrites one row, and mirrors a module's state onto its inheriting children. */
  private apply(row: GridRow, change: (r: GridRow) => void): void {
    const g = this.grid();
    if (!g) return;

    const rows = g.rows.map((r) => ({ ...r }));
    const target = rows.find(
      (r) => r.kind === row.kind && r.name === row.name && r.parentModuleId === row.parentModuleId
             && r.moduleId === row.moduleId,
    );
    if (!target) return;

    change(target);

    if (target.kind === 'module') {
      for (const child of rows) {
        if (child.kind !== 'child' || child.parentModuleId !== target.moduleId) continue;
        if (child.grantable) continue;

        child.access = target.access;
        for (const right of this.rights) child[right] = target[right];
      }
    }

    this.grid.set({ ...g, rows });
  }

  grantAll(on: boolean): void {
    const g = this.grid();
    if (!g || !this.canEdit) return;

    const rows = g.rows.map((r) =>
      r.locked
        ? r
        : { ...r, access: on, view: on, create: on, edit: on, delete: on, export: on },
    );

    this.grid.set({ ...g, rows });
  }

  save(): void {
    const g = this.grid();
    if (!g || !this.canEdit) return;

    this.saving.set(true);
    this.saved.set(false);
    this.saveError.set(null);

    this.http.put(`${this.base}/role-permissions/${g.accountTypeId}`, {
      modules: g.rows
        .filter((r) => r.kind === 'module')
        .map((r) => ({
          moduleId: r.moduleId,
          access: r.access,
          view: r.view, create: r.create, edit: r.edit, delete: r.delete, export: r.export,
        })),
      managedAccountTypeIds: g.rows
        .filter((r) => r.kind === 'child' && r.grantable && r.access)
        .map((r) => r.managedAccountTypeId),
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.select(g.accountTypeId);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.saveError.set(httpErrorMessage(e, 'The permissions could not be saved.'));
      },
    });
  }

  cancel(): void {
    void this.router.navigate(['/user-management']);
  }
}
