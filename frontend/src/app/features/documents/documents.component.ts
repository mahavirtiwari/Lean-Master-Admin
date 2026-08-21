import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DocumentAudience, DocumentRow } from '../../core/models';
import { EmptyComponent, PageIntroComponent, PagerComponent } from '../../shared/ui';

/**
 * Upload Documents (9-green.svg, 9-Upload-Documents-no-data.svg,
 * 78-upload-delete-document-popup-green.svg).
 *
 * Three blocks: the upload card with its drag-and-drop target, the role matrix
 * that assigns each document to audiences, and the Document Library.
 *
 * The matrix has ten columns, one more than User Management's nine account
 * types — the extra one is MSME Enterprise. An MSME is somebody a training
 * manual is published *to*, not an administrative account the Ministry issues,
 * which is why it comes from /documents/audiences rather than the
 * user-management list.
 */
@Component({
  selector: 'app-documents',
  imports: [
    FormsModule,
    RouterLink,
    DecimalPipe,
    DatePipe,
    PageIntroComponent,
    PagerComponent,
    EmptyComponent,
  ],
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.scss',
})
export class DocumentsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly rows = signal<DocumentRow[]>([]);
  readonly audiences = signal<DocumentAudience[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  /** Chosen from the pager; 20 is what the scheme's other portals open on. */
  readonly pageSize = signal(20);
  readonly loading = signal(true);

  readonly search = signal('');
  readonly audienceFilter = signal('');

  // Upload card
  readonly title = signal('');
  readonly description = signal('');
  readonly file = signal<File | null>(null);
  readonly dragging = signal(false);
  readonly selectedAudiences = signal<Set<number>>(new Set());
  readonly saving = signal(false);

  /** A document is either an uploaded file or a video hosted elsewhere. */
  readonly kind = signal<'file' | 'video'>('file');
  readonly videoUrl = signal('');
  readonly formError = signal<string | null>(null);

  readonly deleting = signal<DocumentRow | null>(null);
  readonly deleteReason = signal('');

  readonly canCreate = this.auth.can('DOCUMENTS', 'create');
  readonly canEdit = this.auth.can('DOCUMENTS', 'edit');
  readonly canDelete = this.auth.can('DOCUMENTS', 'delete');

  readonly descriptionLeft = computed(() => 300 - this.description().length);

  constructor() {
    this.api.documentAudiences().subscribe((a) => this.audiences.set(a));
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.api
      .documents({
        search: this.search(),
        accountTypeId: this.audienceFilter(),
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

  // ------------------------------------------------------------ upload ---

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);

    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) this.file.set(dropped);
  }

  onFileChosen(event: Event): void {
    const chosen = (event.target as HTMLInputElement).files?.[0];
    if (chosen) this.file.set(chosen);
  }

  toggleAudience(accountTypeId: number): void {
    const next = new Set(this.selectedAudiences());
    next.has(accountTypeId) ? next.delete(accountTypeId) : next.add(accountTypeId);
    this.selectedAudiences.set(next);
  }

  isAudienceSelected(accountTypeId: number): boolean {
    return this.selectedAudiences().has(accountTypeId);
  }

  /** Whether a listed document is published to an audience — the library matrix. */
  rowHasAudience(row: DocumentRow, accountTypeId: number): boolean {
    return row.accountTypeIds.includes(accountTypeId);
  }

  upload(): void {
    this.formError.set(null);

    if (!this.title().trim()) {
      this.formError.set('Enter a document name.');
      return;
    }

    if (this.kind() === 'file' && !this.file()) {
      this.formError.set('Choose a file to upload.');
      return;
    }

    if (this.selectedAudiences().size === 0) {
      this.formError.set('Tick at least one role that should be able to download this.');
      return;
    }

    if (this.kind() === 'video' && this.videoUrl().trim().length === 0) {
      this.formError.set('Paste the video link, or switch to uploading a file.');
      return;
    }

    // Multipart, because the file travels with the metadata in one request.
    // A video carries no file — just its address.
    const form = new FormData();
    form.append('title', this.title().trim());
    form.append('description', this.description().trim());

    if (this.kind() === 'video') {
      form.append('videoUrl', this.videoUrl().trim());
    } else {
      form.append('file', this.file()!);
    }
    for (const id of this.selectedAudiences()) {
      form.append('accountTypeIds', String(id));
    }

    this.saving.set(true);

    this.api.uploadDocument(form).subscribe({
      next: () => {
        this.saving.set(false);
        this.resetForm();
        this.load();
      },
      error: (response: { error?: { errors?: Record<string, string[]>; title?: string } }) => {
        this.saving.set(false);
        const first = response.error?.errors
          ? Object.values(response.error.errors)[0]?.[0]
          : undefined;
        this.formError.set(first ?? response.error?.title ?? 'Could not upload the document.');
      },
    });
  }

  private resetForm(): void {
    this.kind.set('file');
    this.videoUrl.set('');
    this.title.set('');
    this.description.set('');
    this.file.set(null);
    this.selectedAudiences.set(new Set());
    this.formError.set(null);
  }

  // ------------------------------------------------------------ delete ---

  confirmDelete(): void {
    const row = this.deleting();
    if (!row) return;

    this.api.deleteDocument(row.documentId).subscribe({
      next: () => {
        this.deleting.set(null);
        this.deleteReason.set('');
        this.load();
      },
      error: () => this.deleting.set(null),
    });
  }

  /** 5033164 -> "4.8 MB", as the Size column reads. */
  fileSize(bytes: number | null): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.load();
  }

}
