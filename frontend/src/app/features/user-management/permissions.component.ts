import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { PermissionMatrixRow, UserRow } from '../../core/models';
import { EmptyComponent, PageIntroComponent } from '../../shared/ui';

const RIGHTS = ['view', 'create', 'edit', 'delete', 'export'] as const;

interface ModuleRow {
  moduleId: number;
  moduleCode: string;
  moduleName: string;
  sortOrder: number;
  cells: Record<string, PermissionMatrixRow | undefined>;
}

/**
 * Edit Role & Permissions (2-User-Management edit-permissions.svg,
 * 46-um-edit-permissions-green.svg).
 *
 * A user picker on the left, the 15 modules × 5 rights grid on the right.
 *
 * The API models permissions per *user* (role grant plus optional per-user
 * override), so this screen edits one account at a time. The design's left
 * column is labelled by account type because that is how an administrator
 * navigates to the account, not because the grant is stored against the type.
 *
 * Super Admin is not editable: its permissions are the full 75 by definition,
 * and letting this screen revoke one would lock the portal's only unrestricted
 * account out of the screen that could restore it.
 */
@Component({
  selector: 'app-permissions',
  imports: [FormsModule, PageIntroComponent, EmptyComponent],
  templateUrl: './permissions.component.html',
  styleUrl: './permissions.component.scss',
})
export class PermissionsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly users = signal<UserRow[]>([]);
  readonly selected = signal<UserRow | null>(null);
  readonly matrix = signal<PermissionMatrixRow[]>([]);

  readonly search = signal('');
  readonly loading = signal(true);
  readonly loadingMatrix = signal(false);
  readonly saving = signal(false);
  readonly message = signal<string | null>(null);

  readonly rights = RIGHTS;
  readonly canEdit = this.auth.can('USER_MGMT', 'edit');

  readonly isSuperAdmin = computed(() => this.selected()?.roleName === 'Super Admin');

  /** One row per module, each holding its five right-cells. */
  readonly rows = computed<ModuleRow[]>(() => {
    const byModule = new Map<number, ModuleRow>();

    for (const cell of this.matrix()) {
      let row = byModule.get(cell.moduleId);

      if (!row) {
        row = {
          moduleId: cell.moduleId,
          moduleCode: cell.moduleCode,
          moduleName: cell.moduleName,
          sortOrder: cell.sortOrder,
          cells: {},
        };
        byModule.set(cell.moduleId, row);
      }

      row.cells[cell.rightCode] = cell;
    }

    return [...byModule.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  });

  readonly grantedModules = computed(
    () => this.rows().filter((row) => RIGHTS.some((r) => row.cells[r]?.isGranted)).length,
  );

  constructor() {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);

    this.api.users({ search: this.search(), pageSize: 100 }).subscribe({
      next: (result) => {
        this.users.set(result.items);
        this.loading.set(false);

        if (!this.selected() && result.items.length > 0) {
          this.select(result.items[0]);
        }
      },
      error: () => this.loading.set(false),
    });
  }

  select(user: UserRow): void {
    this.selected.set(user);
    this.message.set(null);
    this.loadingMatrix.set(true);

    this.api.userPermissions(user.userId).subscribe({
      next: (matrix) => {
        this.matrix.set(matrix);
        this.loadingMatrix.set(false);
      },
      error: () => this.loadingMatrix.set(false),
    });
  }

  /** "Access" — the module is open at all, which the design ties to `view`. */
  hasAccess(row: ModuleRow): boolean {
    return !!row.cells['view']?.isGranted;
  }

  toggle(row: ModuleRow, right: string): void {
    if (!this.canEdit || this.isSuperAdmin()) return;

    const cell = row.cells[right];
    if (!cell) return;

    const next = this.matrix().map((entry) =>
      entry.permissionId === cell.permissionId
        ? { ...entry, isGranted: !entry.isGranted }
        : entry,
    );

    this.matrix.set(next);
  }

  /**
   * The Access toggle grants or revokes the whole module. Revoking clears every
   * right — a module you cannot open but can "delete" in is a contradiction the
   * API would have to reject anyway.
   */
  toggleAccess(row: ModuleRow): void {
    if (!this.canEdit || this.isSuperAdmin()) return;

    const turningOn = !this.hasAccess(row);
    const ids = new Set(
      RIGHTS.map((right) => row.cells[right]?.permissionId).filter(
        (id): id is number => id !== undefined,
      ),
    );

    const next = this.matrix().map((entry) => {
      if (!ids.has(entry.permissionId)) return entry;

      // Turning access on grants view only; the other rights stay for the
      // administrator to choose, which is what the design's help text says.
      if (turningOn) {
        return entry.rightCode === 'view' ? { ...entry, isGranted: true } : entry;
      }

      return { ...entry, isGranted: false };
    });

    this.matrix.set(next);
  }

  setAll(granted: boolean): void {
    if (!this.canEdit || this.isSuperAdmin()) return;

    this.matrix.set(this.matrix().map((entry) => ({ ...entry, isGranted: granted })));
  }

  save(): void {
    const user = this.selected();
    if (!user || !this.canEdit || this.isSuperAdmin()) return;

    this.saving.set(true);
    this.message.set(null);

    this.api
      .saveUserPermissions(user.userId, {
        permissions: this.matrix().map((entry) => ({
          permissionId: entry.permissionId,
          isGranted: entry.isGranted,
        })),
        reason: 'Updated from Edit Role & Permissions.',
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.message.set('Permissions saved. They take effect at the user’s next sign-in.');
          this.select(user);
        },
        error: (response: { error?: { title?: string } }) => {
          this.saving.set(false);
          this.message.set(response.error?.title ?? 'Could not save the permissions.');
        },
      });
  }
}
