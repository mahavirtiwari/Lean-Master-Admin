import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { downloadCsv, stamp } from '../../shared/csv';
import { ConfirmComponent, EmptyComponent, PageIntroComponent } from '../../shared/ui';

interface Course {
  bronzeCourseId: number;
  sortOrder: number;
  title: string;
  description: string | null;
  isActive: boolean;
}

/**
 * E-Learning — the LEAN Bronze course list.
 *
 * One shared list rather than one per enterprise: every participant studies
 * every active course and then sits the single exam on the LMS. The order here
 * is the order they are studied in, so the list is not paged or sorted by
 * anything else — an administrator needs to see the whole sequence at once.
 */
@Component({
  selector: 'app-e-learning',
  imports: [FormsModule, PageIntroComponent, EmptyComponent, ConfirmComponent],
  templateUrl: './e-learning.component.html',
})
export class ELearningComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = environment.apiBase;

  readonly rows = signal<Course[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly search = signal('');
  readonly showInactive = signal(true);

  // The add card doubles as the edit form; editingId decides which.
  readonly editingId = signal<number | null>(null);
  readonly form = signal({ title: '', description: '' });
  readonly formError = signal<string | null>(null);
  readonly saving = signal(false);

  readonly confirming = signal<Course | null>(null);

  readonly canCreate = this.auth.can('E_LEARNING', 'create');
  readonly canEdit = this.auth.can('E_LEARNING', 'edit');
  readonly canExport = this.auth.can('E_LEARNING', 'export');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);

    const params = new URLSearchParams({ includeInactive: String(this.showInactive()) });
    if (this.search().trim()) params.set('search', this.search().trim());

    this.http.get<{ courses: Course[] }>(`${this.base}/e-learning/courses?${params}`).subscribe({
      next: (r) => {
        this.rows.set(r.courses ?? []);
        this.loading.set(false);
      },
      error: (e: { error?: { message?: string } }) => {
        this.loadError.set(e.error?.message ?? 'The course list could not be loaded.');
        this.loading.set(false);
      },
    });
  }

  edit(course: Course): void {
    this.editingId.set(course.bronzeCourseId);
    this.form.set({ title: course.title, description: course.description ?? '' });
    this.formError.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.set({ title: '', description: '' });
    this.formError.set(null);
  }

  save(): void {
    const { title, description } = this.form();

    if (title.trim().length < 3) {
      this.formError.set('Enter a course name of at least three characters.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const body = { title: title.trim(), description: description.trim() || null };
    const id = this.editingId();

    const request = id
      ? this.http.put(`${this.base}/e-learning/courses/${id}`, body)
      : this.http.post(`${this.base}/e-learning/courses`, body);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.load();
      },
      error: (e: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.formError.set(e.error?.message ?? 'The course could not be saved.');
      },
    });
  }

  toggleStatus(): void {
    const course = this.confirming();
    if (!course) return;

    this.http
      .post(`${this.base}/e-learning/courses/${course.bronzeCourseId}/status`, {
        isActive: !course.isActive,
      })
      .subscribe({
        next: () => {
          this.confirming.set(null);
          this.load();
        },
        error: () => this.confirming.set(null),
      });
  }

  export(): void {
    downloadCsv(
      `e-learning-courses-${stamp()}`,
      ['#', 'Course', 'Description', 'Status'],
      this.rows().map((c) => [
        String(c.sortOrder),
        c.title,
        c.description ?? '',
        c.isActive ? 'Active' : 'Inactive',
      ]),
    );
  }
}
