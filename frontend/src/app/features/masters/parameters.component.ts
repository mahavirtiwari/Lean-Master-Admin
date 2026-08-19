import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Parameter } from '../../core/models';
import {
  ConfirmComponent,
  EmptyComponent,
  PageIntroComponent,
  PagerComponent,
} from '../../shared/ui';

/**
 * Parameters (67-parameter-green, 67-Parameter-no-data, 71-parameter-edit,
 * 72/73-parameter-disable/enable-popup).
 *
 * Same four-state shape as Sectors, with a description field the sector form
 * does not have — it is what the assessor reads when scoring.
 */
@Component({
  selector: 'app-parameters',
  imports: [
    FormsModule,
    DecimalPipe,
    PageIntroComponent,
    PagerComponent,
    EmptyComponent,
    ConfirmComponent,
  ],
  template: `
    <app-page-intro
      title="Parameters"
      subtitle="LEAN assessment parameters used to score MSMEs during assessment"
    />

    <div class="stack">
      @if (canCreate || canEdit) {
        <section class="card card-pad">
          <h3 class="card-title">{{ editingId() ? 'Edit Parameter' : 'Add Parameter' }}</h3>
          <p class="card-sub">
            Parameters are scored by the assessor during the LEAN assessment
          </p>

          <form class="master-form" (ngSubmit)="save()">
            <div class="field">
              <label class="field-label" for="code">PARAMETER CODE<span class="req">*</span></label>
              <input
                id="code"
                class="input"
                placeholder="e.g. LP-11"
                name="code"
                [ngModel]="form().code"
                (ngModelChange)="form.set({ ...form(), code: $event })"
              />
            </div>

            <div class="field">
              <label class="field-label" for="name">PARAMETER NAME<span class="req">*</span></label>
              <input
                id="name"
                class="input"
                placeholder="e.g. Cellular Layout &amp; Line Balancing"
                name="name"
                [ngModel]="form().name"
                (ngModelChange)="form.set({ ...form(), name: $event })"
              />
            </div>

            <div class="field span-2">
              <label class="field-label" for="description">DESCRIPTION</label>
              <textarea
                id="description"
                class="textarea"
                placeholder="Describe what the assessor should look for when scoring this parameter"
                name="description"
                [ngModel]="form().description"
                (ngModelChange)="form.set({ ...form(), description: $event })"
              ></textarea>
            </div>

            <div class="form-actions">
              @if (editingId()) {
                <button class="btn btn-secondary" type="button" (click)="cancelEdit()">Cancel</button>
              }
              <button class="btn btn-primary" type="submit" [disabled]="saving()">
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </form>

          @if (formError()) {
            <div class="field-error form-error-row">{{ formError() }}</div>
          }
        </section>
      }

      <section class="card">
        <div class="card-head">
          <div class="row">
            <h3 class="card-title">LEAN Parameters</h3>
            <span class="count-chip">{{ total() | number }} parameters</span>
          </div>

          <div class="row">
            <div class="search">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <circle cx="6.2" cy="6.2" r="4.4" fill="none" stroke="#93A29A" stroke-width="1.5" />
                <path d="M9.6 9.6 12.5 12.5" stroke="#93A29A" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <input
                class="input"
                type="search"
                placeholder="Search parameter…"
                name="search"
                [ngModel]="search()"
                (ngModelChange)="search.set($event)"
                (keyup.enter)="applyFilters()"
              />
            </div>

            <select
              class="select"
              name="status"
              [ngModel]="status()"
              (ngModelChange)="status.set($event); applyFilters()"
            >
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        @if (loading()) {
          <div class="empty"><div class="empty-text">Loading parameters…</div></div>
        } @else if (rows().length === 0) {
          <app-empty
            title="No parameters found"
            text="No parameter matches the current search and status filter. Clear the filters, or add a parameter above."
          />
        } @else {
          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Parameter Name</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.parameterId) {
                  <tr>
                    <td class="code">{{ row.code }}</td>
                    <td class="strong">{{ row.name }}</td>
                    <td>{{ row.description }}</td>
                    <td>
                      <span class="pill" [class]="row.isActive ? 'pill-green' : 'pill-red'">
                        {{ row.isActive ? 'Active' : 'Inactive' }}
                      </span>
                    </td>
                    <td class="nowrap">
                      @if (canEdit) {
                        <button class="act act-edit" type="button" (click)="startEdit(row)">Edit</button>
                        <span class="act-sep">|</span>
                        <button
                          class="act"
                          type="button"
                          [class.act-danger]="row.isActive"
                          [class.act-green]="!row.isActive"
                          (click)="confirming.set(row)"
                        >
                          {{ row.isActive ? 'Disable' : 'Enable' }}
                        </button>
                      } @else {
                        <span class="muted">—</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <app-pager
            [page]="page()"
            [pageSize]="pageSize"
            [total]="total()"
            noun="parameter"
            nounPlural="parameters"
            (go)="goToPage($event)"
          />
        }
      </section>
    </div>

    @if (confirming(); as row) {
      <app-confirm
        [title]="row.isActive ? 'Disable Parameter' : 'Enable Parameter'"
        [message]="
          row.isActive
            ? 'Disabling ' +
              row.name +
              ' removes it from new questionnaires. Assessments already scored against it keep their scores.'
            : 'Enabling ' + row.name + ' makes it available to new questionnaires again.'
        "
        [confirmLabel]="row.isActive ? 'Disable Parameter' : 'Enable Parameter'"
        [tone]="row.isActive ? 'danger' : 'primary'"
        (confirmed)="confirmToggle()"
        (cancelled)="confirming.set(null)"
      />
    }
  `,
})
export class ParametersComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly rows = signal<Parameter[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 25;
  readonly loading = signal(true);

  readonly search = signal('');
  readonly status = signal<'' | 'true' | 'false'>('');

  readonly editingId = signal<number | null>(null);
  readonly form = signal({ code: '', name: '', description: '' });
  readonly formError = signal<string | null>(null);
  readonly saving = signal(false);

  readonly confirming = signal<Parameter | null>(null);

  readonly canCreate = this.auth.can('PARAMETER', 'create');
  readonly canEdit = this.auth.can('PARAMETER', 'edit');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.api
      .parameters({
        search: this.search(),
        isActive: this.status(),
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

  startEdit(row: Parameter): void {
    this.editingId.set(row.parameterId);
    this.form.set({ code: row.code, name: row.name, description: row.description ?? '' });
    this.formError.set(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.set({ code: '', name: '', description: '' });
    this.formError.set(null);
  }

  save(): void {
    const value = this.form();

    if (!value.code.trim() || !value.name.trim()) {
      this.formError.set('Parameter code and name are both required.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const id = this.editingId();
    const request: Observable<unknown> = id
      ? this.api.updateParameter(id, value)
      : this.api.createParameter(value);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.load();
      },
      error: (response: { error?: { errors?: Record<string, string[]>; title?: string } }) => {
        this.saving.set(false);
        const first = response.error?.errors
          ? Object.values(response.error.errors)[0]?.[0]
          : undefined;
        this.formError.set(first ?? response.error?.title ?? 'Could not save the parameter.');
      },
    });
  }

  confirmToggle(): void {
    const row = this.confirming();
    if (!row) return;

    this.api.setParameterStatus(row.parameterId, !row.isActive).subscribe({
      next: () => {
        this.confirming.set(null);
        this.load();
      },
      error: () => this.confirming.set(null),
    });
  }
}
