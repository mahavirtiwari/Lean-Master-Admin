import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmComponent, EmptyComponent, PageIntroComponent } from '../../shared/ui';

export interface TechnologyCategoryRow {
  technologyCategoryId: number;
  code: string;
  name: string;
  isActive: boolean;
  technologyCount: number;
}

/**
 * Technology Upgradation &gt; Category.
 *
 * The categories the technology form's dropdown offers. They were master data
 * with no screen — a name and a sort order, seeded and never touched — and are
 * now maintained like sectors and parameters: a code, a name, and a reason
 * whenever one is retired or brought back.
 *
 * A category in use is not deleted, only retired. Technologies already filed
 * under it keep pointing at it, and their history has to stay readable.
 */
@Component({
  selector: 'app-technology-categories',
  imports: [FormsModule, PageIntroComponent, EmptyComponent, ConfirmComponent],
  template: `
    <app-page-intro
      title="Technology Categories"
      subtitle="The categories technologies are filed under, shown in the Add Technology form"
    />

    <div class="stack">
      @if (canEdit) {
        <section class="card card-pad">
          <h3 class="card-title">{{ editingId() ? 'Edit Category' : 'Add Category' }}</h3>
          <p class="card-sub">The code and name appear together wherever a category is chosen</p>

          <form class="master-form" (ngSubmit)="save()">
            <div class="field">
              <label class="field-label" for="code">CATEGORY CODE<span class="req">*</span></label>
              <input
                id="code"
                class="input"
                maxlength="20"
                placeholder="e.g. TC-08"
                name="code"
                [ngModel]="form().code"
                (ngModelChange)="form.set({ ...form(), code: $event })"
              />
              <div class="char-count">{{ form().code.length }} / 20</div>
            </div>

            <div class="field">
              <label class="field-label" for="name">CATEGORY NAME<span class="req">*</span></label>
              <input
                id="name"
                class="input"
                maxlength="120"
                placeholder="Enter category name here"
                name="name"
                [ngModel]="form().name"
                (ngModelChange)="form.set({ ...form(), name: $event })"
              />
              <div class="char-count">{{ form().name.length }} / 120</div>
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

          @if (formError(); as message) {
            <div class="field-error form-error-row">{{ message }}</div>
          }
        </section>
      }

      <section class="card">
        <div class="card-head">
          <div class="row">
            <h3 class="card-title">Categories</h3>
            <span class="count-chip">{{ rows().length }} categories</span>
          </div>
        </div>

        @if (loading()) {
          <div class="empty"><div class="empty-text">Loading categories…</div></div>
        } @else if (rows().length === 0) {
          <app-empty
            title="No categories yet"
            text="Add the first category; technologies are filed under one when they are created."
          />
        } @else {
          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Category Name</th>
                  <th class="num">Technologies</th>
                  <th>Status</th>
                  @if (canEdit) { <th>Actions</th> }
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.technologyCategoryId) {
                  <tr>
                    <td class="code">{{ row.code }}</td>
                    <td class="strong">{{ row.name }}</td>
                    <td class="num">{{ row.technologyCount }}</td>
                    <td>
                      <span class="pill" [class]="row.isActive ? 'pill-green' : 'pill-red'">
                        {{ row.isActive ? 'Active' : 'Inactive' }}
                      </span>
                    </td>
                    @if (canEdit) {
                      <td class="nowrap">
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
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>

    @if (confirming(); as row) {
      <app-confirm
        [title]="row.isActive ? 'Disable Category' : 'Enable Category'"
        [message]="
          row.isActive
            ? 'Disabling ' + row.name + ' removes it from the Add Technology form. Technologies already filed under it are not affected.'
            : 'Enabling ' + row.name + ' makes it selectable again when adding a technology.'
        "
        [confirmLabel]="row.isActive ? 'Disable Category' : 'Enable Category'"
        [tone]="row.isActive ? 'danger' : 'primary'"
        (confirmed)="confirmToggle()"
        (cancelled)="closeConfirm()"
      >
        <label class="field-label" for="reason">REASON<span class="req">*</span></label>
        <textarea
          id="reason"
          class="textarea"
          maxlength="500"
          placeholder="Why is this being changed? Recorded against the category."
          [ngModel]="reason()"
          (ngModelChange)="reason.set($event)"
        ></textarea>
        <div class="char-count">{{ reason().length }} / 500</div>

        @if (reasonError(); as message) {
          <p class="field-error">{{ message }}</p>
        }
      </app-confirm>
    }
  `,
})
export class TechnologyCategoriesComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly rows = signal<TechnologyCategoryRow[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly editingId = signal<number | null>(null);
  readonly form = signal({ code: '', name: '' });

  readonly confirming = signal<TechnologyCategoryRow | null>(null);
  readonly reason = signal('');
  readonly reasonError = signal<string | null>(null);

  readonly canEdit = this.auth.can('TECH_UPGRAD', 'edit');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    // Retired categories included: this is the screen that brings them back.
    this.api.technologyCategories(true).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.formError.set('The categories could not be loaded.');
      },
    });
  }

  startEdit(row: TechnologyCategoryRow): void {
    this.editingId.set(row.technologyCategoryId);
    this.form.set({ code: row.code, name: row.name });
    this.formError.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.set({ code: '', name: '' });
    this.formError.set(null);
  }

  save(): void {
    const form = this.form();

    if (!form.code.trim()) return this.formError.set('Enter the category code.');
    if (!form.name.trim()) return this.formError.set('Enter the category name.');

    this.saving.set(true);
    this.formError.set(null);

    const id = this.editingId();

    const done = (): void => {
      this.saving.set(false);
      this.cancelEdit();
      this.load();
    };

    const failed = (response: { error?: { errors?: Record<string, string[]>; title?: string } }): void => {
      this.saving.set(false);
      const first = Object.values(response.error?.errors ?? {})[0]?.[0];
      this.formError.set(first ?? response.error?.title ?? 'Could not save the category.');
    };

    if (id === null) {
      this.api.createTechnologyCategory(form).subscribe({ next: done, error: failed });
    } else {
      this.api.updateTechnologyCategory(id, form).subscribe({ next: done, error: failed });
    }
  }

  closeConfirm(): void {
    this.confirming.set(null);
    this.reason.set('');
    this.reasonError.set(null);
  }

  confirmToggle(): void {
    const row = this.confirming();
    if (!row) return;

    if (this.reason().trim().length === 0) {
      this.reasonError.set('Give a reason for this change. It is recorded against the category.');
      return;
    }

    this.api
      .setTechnologyCategoryStatus(row.technologyCategoryId, !row.isActive, this.reason().trim())
      .subscribe({
        next: () => {
          this.closeConfirm();
          this.load();
        },
        error: () => this.closeConfirm(),
      });
  }
}
