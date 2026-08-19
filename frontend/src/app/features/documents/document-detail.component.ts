import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DocumentAudience, DocumentDetail } from '../../core/models';
import { PageIntroComponent } from '../../shared/ui';

/**
 * View Document (76) and Edit Document (77).
 *
 * One component in two modes: the artboards are the same three numbered
 * sections — Document Details, File, Role Access — read-only on 76 and editable
 * on 77. Splitting them would duplicate the whole layout to change six fields
 * into inputs.
 */
@Component({
  selector: 'app-document-detail',
  imports: [FormsModule, RouterLink, DatePipe, PageIntroComponent],
  templateUrl: './document-detail.component.html',
  styleUrl: './document-detail.component.scss',
})
export class DocumentDetailComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  /** Set from the route: /documents/:id vs /documents/:id/edit */
  readonly mode = input<'view' | 'edit'>('view');

  readonly doc = signal<DocumentDetail | null>(null);
  readonly audiences = signal<DocumentAudience[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly title = signal('');
  readonly description = signal('');
  readonly selected = signal<Set<number>>(new Set());

  readonly canEdit = this.auth.can('DOCUMENTS', 'edit');
  readonly isEdit = computed(() => this.mode() === 'edit');

  readonly liveVersion = computed(
    () => this.doc()?.versions.find((v) => v.isLive) ?? this.doc()?.versions[0] ?? null,
  );

  readonly grantedCount = computed(() => this.selected().size);

  /** "LEAN Bronze Training Manual · v3.2 · 5 of 10 roles" */
  readonly subtitle = computed(() => {
    const d = this.doc();
    if (!d) return '';

    const parts = [d.title];
    const version = this.liveVersion();
    if (version) parts.push(version.versionLabel);

    parts.push(
      this.isEdit()
        ? `uploaded ${formatDate(version?.uploadedOnUtc)} by ${version?.uploadedByName ?? '—'}`
        : `${this.grantedCount()} of ${this.audiences().length} roles`,
    );

    return parts.join('  ·  ');
  });

  constructor() {
    this.api.documentAudiences().subscribe((a) => this.audiences.set(a));

    effect(() => {
      const documentId = Number(this.id());
      this.loading.set(true);

      this.api.document(documentId).subscribe({
        next: (d) => {
          this.doc.set(d);
          this.title.set(d.title);
          this.description.set(d.description ?? '');
          this.selected.set(new Set(d.accountTypeIds));
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Could not load that document.');
          this.loading.set(false);
        },
      });
    });
  }

  isGranted(accountTypeId: number): boolean {
    return this.selected().has(accountTypeId);
  }

  toggle(accountTypeId: number): void {
    if (!this.isEdit() || !this.canEdit) return;

    const next = new Set(this.selected());
    next.has(accountTypeId) ? next.delete(accountTypeId) : next.add(accountTypeId);
    this.selected.set(next);
  }

  save(): void {
    const d = this.doc();
    if (!d) return;

    if (!this.title().trim()) {
      this.error.set('Enter a document name.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    this.api
      .updateDocument(d.documentId, {
        title: this.title().trim(),
        description: this.description().trim() || null,
        categoryLookupId: d.categoryLookupId,
        isActive: d.isActive,
        accountTypeIds: [...this.selected()],
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          void this.router.navigate(['/documents']);
        },
        error: (response: { error?: { title?: string } }) => {
          this.saving.set(false);
          this.error.set(response.error?.title ?? 'Could not save the document.');
        },
      });
  }

  fileSize(bytes: number | null | undefined): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
