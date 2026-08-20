import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { EmailTemplate, EmailerAudience } from '../../core/models';

/**
 * Emailer → Transactional → Edit Template — 81-emailer-template-edit-green.svg.
 *
 * Code and trigger event are shown but not editable. The code is how the portal
 * looks the template up when sending, and the trigger decides WHEN it is sent —
 * changing either from an edit screen would silently stop a live mail or
 * repoint it at a different moment in the scheme, with nothing to notice it by.
 */
@Component({
  selector: 'app-template-edit',
  imports: [],
  templateUrl: './template-edit.component.html',
  styleUrl: './campaign.component.scss',
})
export class TemplateEditComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** /emailer/transactional/:id */
  readonly id = input<string>();

  readonly template = signal<EmailTemplate | null>(null);
  readonly accountTypes = signal<EmailerAudience[]>([]);
  readonly loading = signal(true);

  readonly name = signal('');
  readonly subject = signal('');
  readonly body = signal('');
  readonly replyTo = signal('');
  readonly copyTo = signal('');
  readonly isActive = signal(true);
  readonly selectedTypes = signal<number[]>([]);

  readonly saving = signal(false);
  readonly message = signal<string | null>(null);
  readonly failed = signal(false);

  readonly canEdit = this.auth.can('EMAILER', 'edit');

  readonly mergeTags = computed(() =>
    (this.template()?.availableTags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  );

  readonly subtitle = computed(() => {
    const t = this.template();
    if (!t) return '';
    const when = t.modifiedOnUtc ? ` — last updated ${this.formatDate(t.modifiedOnUtc)}` : '';
    return `${t.code} — ${t.name}${when}`;
  });

  constructor() {
    this.api.emailerAudiences().subscribe((a) => this.accountTypes.set(a));

    effect(() => {
      const templateId = this.id();
      if (templateId) this.load(Number(templateId));
    });
  }

  private load(templateId: number): void {
    this.loading.set(true);

    this.api.emailTemplate(templateId).subscribe({
      next: (t) => {
        this.template.set(t);
        this.name.set(t.name);
        this.subject.set(t.subject);
        this.body.set(t.bodyHtml);
        this.replyTo.set(t.replyToAddress ?? '');
        this.copyTo.set(t.copyToAddress ?? '');
        this.isActive.set(t.isActive);
        this.selectedTypes.set([...t.accountTypeIds]);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.message.set('Could not load that template.');
        this.loading.set(false);
      },
    });
  }

  isSelected(id: number): boolean {
    return this.selectedTypes().includes(id);
  }

  toggleType(id: number): void {
    const current = this.selectedTypes();
    this.selectedTypes.set(
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  insertTag(tag: string): void {
    this.body.set(`${this.body()}${this.body().endsWith(' ') ? '' : ' '}${tag}`);
  }

  save(): void {
    const template = this.template();
    if (!template) return;

    if (!this.name().trim() || !this.subject().trim() || !this.body().trim()) {
      this.failed.set(true);
      this.message.set('Name, subject and message are all required.');
      return;
    }

    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    if (this.replyTo().trim() && !email.test(this.replyTo().trim())) {
      this.failed.set(true);
      this.message.set('The reply-to address is not a valid email address.');
      return;
    }

    if (this.copyTo().trim() && !email.test(this.copyTo().trim())) {
      this.failed.set(true);
      this.message.set('The copy-to address is not a valid email address.');
      return;
    }

    this.saving.set(true);
    this.failed.set(false);

    this.api
      .updateEmailTemplate(template.emailTemplateId, {
        name: this.name().trim(),
        subject: this.subject().trim(),
        bodyHtml: this.body(),
        bodyText: null,
        replyToAddress: this.replyTo().trim() || null,
        copyToAddress: this.copyTo().trim() || null,
        isActive: this.isActive(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.message.set('Saved. Changes apply to emails sent after now.');
          this.load(template.emailTemplateId);
        },
        error: (r: { error?: { message?: string; title?: string } }) => {
          this.saving.set(false);
          this.failed.set(true);
          this.message.set(r.error?.message ?? r.error?.title ?? 'Could not save the template.');
        },
      });
  }

  sendTest(): void {
    this.failed.set(false);
    this.message.set(
      'A test send goes to the signed-in administrator only. It is not wired to an ' +
        'endpoint yet, so nothing has been sent.',
    );
  }

  cancel(): void {
    void this.router.navigate(['/emailer/transactional']);
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
  }
}

// A template's stored body is shown and saved exactly as it is held. It was
// flattened to text for display and that text written back on save, so
// opening a template and pressing Save destroyed its markup — the
// registration OTP went out as unstyled prose after exactly that.
//
// The letterhead is no longer part of the body: MailShell wraps it as the
// message is queued, so what is edited here is the content, and the frame
// cannot be lost from this screen.
