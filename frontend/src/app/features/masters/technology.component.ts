import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Sector, Technology, TechnologyCategory } from '../../core/models';
import {
  ConfirmComponent,
  EmptyComponent,
  PageIntroComponent,
  PagerComponent,
} from '../../shared/ui';

/**
 * Technology Upgradation (74-technology-upgradation-green,
 * 74-Technology-Upgradation-no-data, 75-technology-edit).
 *
 * Four counters, the scheme note, the add/edit card and the technology list.
 * The description field is capped at 300 characters with a live counter, which
 * is the limit the API enforces too.
 */
@Component({
  selector: 'app-technology',
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
      title="Technology Upgradation"
      subtitle="Master list of upgradation technologies MSMEs can adopt under the LEAN scheme"
    />

    <div class="stack">
      @if (summary(); as s) {
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-label">Total Technologies</div>
            <div class="stat-value">{{ s.totalTechnologies | number }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Active</div>
            <div class="stat-value">{{ s.active | number }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Categories</div>
            <div class="stat-value">{{ s.categories | number }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">MSMEs Adopted</div>
            <div class="stat-value">{{ s.msmesAdopted | number }}</div>
          </div>
        </div>
      }

      <div class="note">
        Technologies added here become selectable in Handholding, Assessments, Incentives and
        Reports. Disabling one hides it from new records but leaves existing records untouched.
      </div>

      @if (canCreate || canEdit) {
        <section class="card card-pad">
          <h3 class="card-title">{{ editingId() ? 'Edit Technology' : 'Add Technology' }}</h3>
          <p class="card-sub">
            Codes follow the TU-nn series and must be unique across the scheme
          </p>

          <form class="master-form" (ngSubmit)="save()">
            <div class="field">
              <label class="field-label" for="code">TECHNOLOGY CODE<span class="req">*</span></label>
              <input
                id="code"
                class="input"
                placeholder="e.g. TU-11"
                name="code"
                [ngModel]="form().code"
                (ngModelChange)="form.set({ ...form(), code: $event })"
              />
            </div>

            <div class="field">
              <label class="field-label" for="name">TECHNOLOGY NAME<span class="req">*</span></label>
              <input
                id="name"
                class="input"
                placeholder="e.g. Laser Cutting Automation"
                name="name"
                [ngModel]="form().name"
                (ngModelChange)="form.set({ ...form(), name: $event })"
              />
            </div>

            <div class="field">
              <label class="field-label" for="category">CATEGORY<span class="req">*</span></label>
              <select
                id="category"
                class="select"
                name="category"
                [ngModel]="form().technologyCategoryId"
                (ngModelChange)="form.set({ ...form(), technologyCategoryId: $event })"
              >
                <option value="">Select category</option>
                @for (category of categories(); track category.technologyCategoryId) {
                  <option [value]="category.technologyCategoryId">{{ category.name }}</option>
                }
              </select>
            </div>

            <div class="field">
              <label class="field-label" for="sector">SECTOR</label>
              <select
                id="sector"
                class="select"
                name="sector"
                [ngModel]="form().sectorId"
                (ngModelChange)="form.set({ ...form(), sectorId: $event })"
              >
                <option value="">Select sector</option>
                @for (sector of sectors(); track sector.sectorId) {
                  <option [value]="sector.sectorId">{{ sector.name }}</option>
                }
              </select>
            </div>

            <div class="field span-2">
              <label class="field-label" for="description">DESCRIPTION</label>
              <textarea
                id="description"
                class="textarea"
                maxlength="300"
                placeholder="Describe what the technology does and the improvement an MSME should expect"
                name="description"
                [ngModel]="form().description"
                (ngModelChange)="form.set({ ...form(), description: $event })"
              ></textarea>
              <div class="char-count">{{ form().description.length }} / 300</div>
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
            <h3 class="card-title">Technology List</h3>
            <span class="count-chip">{{ total() | number }} technologies</span>
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
                placeholder="Search technology…"
                name="search"
                [ngModel]="search()"
                (ngModelChange)="search.set($event)"
                (keyup.enter)="applyFilters()"
              />
            </div>

            <select
              class="select"
              name="category"
              [ngModel]="categoryFilter()"
              (ngModelChange)="categoryFilter.set($event); applyFilters()"
            >
              <option value="">All Categories</option>
              @for (category of categories(); track category.technologyCategoryId) {
                <option [value]="category.technologyCategoryId">{{ category.name }}</option>
              }
            </select>

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
          <div class="empty"><div class="empty-text">Loading technologies…</div></div>
        } @else if (rows().length === 0) {
          <app-empty
            title="No technologies found"
            text="No technology matches the current filters. Clear them, or add a technology above."
          />
        } @else {
          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Technology Name</th>
                  <th>Category</th>
                  <th>Sector</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.technologyId) {
                  <tr>
                    <td class="code">{{ row.code }}</td>
                    <td class="strong">{{ row.name }}</td>
                    <td>{{ row.categoryName }}</td>
                    <td>{{ row.sectorName || '—' }}</td>
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
            noun="technology"
            nounPlural="technologies"
            (go)="goToPage($event)"
          />
        }
      </section>
    </div>

    @if (confirming(); as row) {
      <app-confirm
        [title]="row.isActive ? 'Disable Technology' : 'Enable Technology'"
        [message]="
          row.isActive
            ? 'Disabling ' +
              row.name +
              ' hides it from new Handholding, Assessment and Incentive records. Existing records are left untouched.'
            : 'Enabling ' + row.name + ' makes it selectable again across the scheme.'
        "
        [confirmLabel]="row.isActive ? 'Disable Technology' : 'Enable Technology'"
        [tone]="row.isActive ? 'danger' : 'primary'"
        (confirmed)="confirmToggle()"
        (cancelled)="confirming.set(null)"
      />
    }
  `,
})
export class TechnologyComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly rows = signal<Technology[]>([]);
  readonly categories = signal<TechnologyCategory[]>([]);
  readonly sectors = signal<Sector[]>([]);
  readonly summary = signal<{
    totalTechnologies: number;
    active: number;
    categories: number;
    msmesAdopted: number;
  } | null>(null);

  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 25;
  readonly loading = signal(true);

  readonly search = signal('');
  readonly categoryFilter = signal('');
  readonly status = signal<'' | 'true' | 'false'>('');

  readonly editingId = signal<number | null>(null);
  readonly form = signal({
    code: '',
    name: '',
    description: '',
    technologyCategoryId: '' as string | number,
    sectorId: '' as string | number,
  });
  readonly formError = signal<string | null>(null);
  readonly saving = signal(false);

  readonly confirming = signal<Technology | null>(null);

  readonly canCreate = this.auth.can('TECH_UPGRAD', 'create');
  readonly canEdit = this.auth.can('TECH_UPGRAD', 'edit');

  constructor() {
    this.api.technologyCategories().subscribe((c) => this.categories.set(c));
    this.api.sectors({ pageSize: 200, isActive: true }).subscribe((s) => this.sectors.set(s.items));
    this.api.technologySummary().subscribe((s) => this.summary.set(s));
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.api
      .technologies({
        search: this.search(),
        categoryId: this.categoryFilter(),
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

  startEdit(row: Technology): void {
    this.editingId.set(row.technologyId);
    this.form.set({
      code: row.code,
      name: row.name,
      description: row.description ?? '',
      technologyCategoryId: row.technologyCategoryId,
      sectorId: row.sectorId ?? '',
    });
    this.formError.set(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.set({ code: '', name: '', description: '', technologyCategoryId: '', sectorId: '' });
    this.formError.set(null);
  }

  save(): void {
    const value = this.form();

    if (!value.code.trim() || !value.name.trim() || !value.technologyCategoryId) {
      this.formError.set('Technology code, name and category are required.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const body = {
      code: value.code,
      name: value.name,
      description: value.description,
      technologyCategoryId: Number(value.technologyCategoryId),
      sectorId: value.sectorId === '' ? null : Number(value.sectorId),
    };

    const id = this.editingId();
    const request: Observable<unknown> = id
      ? this.api.updateTechnology(id, body)
      : this.api.createTechnology(body);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.api.technologySummary().subscribe((s) => this.summary.set(s));
        this.load();
      },
      error: (response: { error?: { errors?: Record<string, string[]>; title?: string } }) => {
        this.saving.set(false);
        const first = response.error?.errors
          ? Object.values(response.error.errors)[0]?.[0]
          : undefined;
        this.formError.set(first ?? response.error?.title ?? 'Could not save the technology.');
      },
    });
  }

  confirmToggle(): void {
    const row = this.confirming();
    if (!row) return;

    this.api.setTechnologyStatus(row.technologyId, !row.isActive).subscribe({
      next: () => {
        this.confirming.set(null);
        this.api.technologySummary().subscribe((s) => this.summary.set(s));
        this.load();
      },
      error: () => this.confirming.set(null),
    });
  }
}
