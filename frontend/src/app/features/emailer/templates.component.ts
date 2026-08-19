import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { EmailTemplate } from '../../core/models';

/**
 * Emailer → Transactional — 80-emailer-templates-green.svg.
 *
 * These are the mails the portal sends by itself when a scheme event occurs.
 * The list is deliberately not paged: the library is a fixed set of a couple of
 * dozen templates, and an administrator looking for one scans rather than
 * pages.
 */
@Component({
  selector: 'app-templates',
  imports: [],
  templateUrl: './templates.component.html',
  styleUrl: './campaign.component.scss',
})
export class TemplatesComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly templates = signal<EmailTemplate[]>([]);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly statusFilter = signal('');

  readonly message = signal<string | null>(null);
  readonly failed = signal(false);

  readonly canEdit = this.auth.can('EMAILER', 'edit');

  readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();

    return this.templates()
      .filter((t) => t.isTransactional)
      .filter((t) =>
        status === '' ? true : status === 'active' ? t.isActive : !t.isActive,
      )
      .filter((t) =>
        !term
          ? true
          : [t.code, t.name, t.subject, t.triggerEvent ?? '']
              .join(' ')
              .toLowerCase()
              .includes(term),
      );
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.emailTemplates().subscribe({
      next: (t) => {
        this.templates.set(t);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  edit(template: EmailTemplate): void {
    void this.router.navigate(['/emailer/transactional', template.emailTemplateId]);
  }

  /**
   * Disabling stops the mail firing without deleting the wording, which is why
   * the screen offers it instead of a delete: the trigger still exists in the
   * scheme, and a deleted template would simply mean silence with no record.
   */
  toggle(template: EmailTemplate): void {
    this.failed.set(false);

    this.api
      .updateEmailTemplate(template.emailTemplateId, {
        name: template.name,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: null,
        replyToAddress: template.replyToAddress,
        copyToAddress: template.copyToAddress,
        isActive: !template.isActive,
      })
      .subscribe({
        next: () => {
          this.message.set(
            `${template.code} ${template.isActive ? 'disabled' : 'enabled'}. ` +
              (template.isActive
                ? 'It will no longer be sent when its trigger fires.'
                : 'It will be sent again from now on.'),
          );
          this.load();
        },
        error: () => {
          this.failed.set(true);
          this.message.set(`Could not change ${template.code}.`);
        },
      });
  }

  newTemplate(): void {
    this.failed.set(false);
    this.message.set(
      'A new transactional template needs a trigger event to fire on, and that list is ' +
        'defined by the scheme workflow rather than typed in here — so creation is not ' +
        'wired to this button.',
    );
  }

  back(): void {
    void this.router.navigate(['/emailer/campaign']);
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
  }
}
