import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Sector } from '../../core/models';
import {
  ConfirmComponent,
  EmptyComponent,
  PageIntroComponent,
  PagerComponent,
} from '../../shared/ui';

/**
 * Sectors (66-sectors-green, 66-Sectors-no-data, 68-sector-edit,
 * 69/70-sector-disable/enable-popup).
 *
 * All four are one component because they are one screen in four states: the
 * add card doubles as the edit form, the empty list is the no-data variant, and
 * the popups are the same dialog with different wording. Splitting them into
 * four routes would mean four copies of the list.
 */
@Component({
  selector: 'app-sectors',
  imports: [
    FormsModule,
    DecimalPipe,
    PageIntroComponent,
    PagerComponent,
    EmptyComponent,
    ConfirmComponent,
  ],
  templateUrl: './sectors.component.html',
})
export class SectorsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly rows = signal<Sector[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  /** Chosen from the pager; 20 is what the scheme's other portals open on. */
  readonly pageSize = signal(20);
  readonly loading = signal(true);

  readonly search = signal('');
  readonly status = signal<'' | 'true' | 'false'>('');

  // The add card and the edit screen are the same form; editingId decides which.
  readonly editingId = signal<number | null>(null);
  readonly form = signal({ nicCode: '', name: '', description: '' });
  readonly formError = signal<string | null>(null);
  readonly saving = signal(false);

  readonly confirming = signal<Sector | null>(null);

  readonly canCreate = this.auth.can('SECTORS', 'create');
  readonly canEdit = this.auth.can('SECTORS', 'edit');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.api
      .sectors({
        search: this.search(),
        isActive: this.status(),
        pageNumber: this.page(),
        pageSize: this.pageSize(),
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

  startEdit(row: Sector): void {
    this.editingId.set(row.sectorId);
    this.form.set({
      nicCode: row.nicCode,
      name: row.name,
      description: row.description ?? '',
    });
    this.formError.set(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.set({ nicCode: '', name: '', description: '' });
    this.formError.set(null);
  }

  save(): void {
    const value = this.form();

    if (!value.nicCode.trim() || !value.name.trim()) {
      this.formError.set('Sector code and name are both required.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const id = this.editingId();

    // Typed as unknown because create returns the new sector and update returns
    // no content; the component only cares that it completed.
    const request: Observable<unknown> = id
      ? this.api.updateSector(id, value)
      : this.api.createSector(value);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.load();
      },
      error: (response: { error?: { errors?: Record<string, string[]>; title?: string } }) => {
        this.saving.set(false);
        // ValidationProblem returns a per-field map; the duplicate-code case is
        // the one users actually hit, so it is surfaced verbatim.
        const first = response.error?.errors
          ? Object.values(response.error.errors)[0]?.[0]
          : undefined;
        this.formError.set(first ?? response.error?.title ?? 'Could not save the sector.');
      },
    });
  }

  readonly reason = signal('');
  readonly reasonError = signal<string | null>(null);

  closeConfirm(): void {
    this.confirming.set(null);
    this.reason.set('');
    this.reasonError.set(null);
  }

  confirmToggle(): void {
    const row = this.confirming();
    if (!row) return;

    if (this.reason().trim().length === 0) {
      this.reasonError.set('Give a reason for this change. It is recorded against the sector.');
      return;
    }

    this.api.setSectorStatus(row.sectorId, !row.isActive, this.reason().trim()).subscribe({
      next: () => {
        this.closeConfirm();
        this.load();
      },
      error: () => this.closeConfirm(),
    });
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.load();
  }

}
