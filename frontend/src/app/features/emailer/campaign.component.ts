import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  EmailCampaign,
  EmailTemplate,
  EmailerAudience,
  EmailerSummary,
  Paged,
} from '../../core/models';

/**
 * Emailer → Campaign — 79-emailer-green.svg, with 79-Emailer-no-data.svg as the
 * empty state of the history table.
 *
 * A campaign is addressed by ACCOUNT TYPE rather than by picking individuals:
 * the artboard's ten tiles are the ten account types, and every active user
 * holding one receives the mail. That is why there is no recipient picker —
 * choosing 1,284 people one at a time is not the workflow this screen is for.
 */
@Component({
  selector: 'app-campaign',
  imports: [DecimalPipe],
  templateUrl: './campaign.component.html',
  styleUrl: './campaign.component.scss',
})
export class CampaignComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly summary = signal<EmailerSummary>({
    campaigns: 0,
    templates: 0,
    recipients: 0,
    deliveryRate: 0,
  });

  readonly templates = signal<EmailTemplate[]>([]);
  readonly accountTypes = signal<EmailerAudience[]>([]);
  readonly history = signal<EmailCampaign[]>([]);
  readonly total = signal(0);

  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly page = signal(1);
  readonly pageSize = 10;

  // ---- the compose form -------------------------------------------------
  readonly templateId = signal<string>('');
  readonly subject = signal('');
  readonly body = signal('');
  readonly extraRecipients = signal('');
  readonly selectedTypes = signal<number[]>([]);
  readonly delivery = signal<'now' | 'later'>('now');
  readonly scheduledFor = signal('');

  readonly saving = signal(false);
  readonly message = signal<string | null>(null);
  readonly failed = signal(false);

  readonly canEdit = this.auth.can('EMAILER', 'edit');

  readonly statuses = ['Draft', 'Scheduled', 'Sending', 'Sent', 'Failed'];

  /** Merge tags offered by the chosen template. */
  readonly mergeTags = computed(() => {
    const chosen = this.templates().find((t) => `${t.emailTemplateId}` === this.templateId());
    return (chosen?.availableTags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  });

  /**
   * How many people the current selection reaches. Counted from the account
   * type cards, which already carry an active-user count — the screen must not
   * promise a number it cannot substantiate.
   */
  readonly reach = computed(() =>
    this.accountTypes()
      .filter((t) => this.selectedTypes().includes(t.accountTypeId))
      .reduce((sum, t) => sum + t.activeUsers, 0),
  );

  readonly allSelected = computed(
    () => this.accountTypes().length > 0 && this.selectedTypes().length === this.accountTypes().length,
  );

  readonly rangeFrom = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize + 1,
  );

  readonly rangeTo = computed(() => Math.min(this.page() * this.pageSize, this.total()));

  constructor() {
    this.api.emailerSummary().subscribe((s) => this.summary.set(s));
    this.api.emailTemplates({ isActive: true }).subscribe((t) => this.templates.set(t));
    this.api.emailerAudiences().subscribe((a) => this.accountTypes.set(a));
    this.load();
  }

  load(): void {
    this.api
      .campaigns({
        search: this.search(),
        status: this.statusFilter(),
        pageNumber: this.page(),
        pageSize: this.pageSize,
      })
      .subscribe((r: Paged<EmailCampaign>) => {
        this.history.set(r.items);
        this.total.set(r.totalCount);
      });
  }

  // ------------------------------------------------------------ audience ---

  isSelected(id: number): boolean {
    return this.selectedTypes().includes(id);
  }

  toggleType(id: number): void {
    const current = this.selectedTypes();
    this.selectedTypes.set(
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
    this.message.set(null);
  }

  toggleAll(): void {
    this.selectedTypes.set(
      this.allSelected() ? [] : this.accountTypes().map((t) => t.accountTypeId),
    );
  }

  // -------------------------------------------------------------- compose ---

  chooseTemplate(value: string): void {
    this.templateId.set(value);

    // Loading a template pre-fills subject and body, which is the point of
    // having one — but only into empty fields, so a half-written message is
    // never silently discarded.
    const chosen = this.templates().find((t) => `${t.emailTemplateId}` === value);
    if (!chosen) return;

    if (!this.subject().trim()) this.subject.set(chosen.subject);
    if (!this.body().trim()) this.body.set(stripHtml(chosen.bodyHtml));
  }

  insertTag(tag: string): void {
    this.body.set(`${this.body()}${this.body().endsWith(' ') ? '' : ' '}${tag}`);
  }

  private validate(): string | null {
    if (!this.subject().trim()) return 'A subject is required.';
    if (!this.body().trim()) return 'The message cannot be empty.';

    if (this.selectedTypes().length === 0 && !this.extraRecipients().trim()) {
      return 'Choose at least one account type, or add an individual address.';
    }

    if (this.delivery() === 'later' && !this.scheduledFor()) {
      return 'Pick the date and time to send it.';
    }

    const bad = this.extraRecipients()
      .split(/[,;\s]+/)
      .map((a) => a.trim())
      .filter(Boolean)
      .find((a) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a));

    return bad ? `"${bad}" is not a valid email address.` : null;
  }

  save(send: boolean): void {
    const problem = this.validate();

    if (problem) {
      this.failed.set(true);
      this.message.set(problem);
      return;
    }

    this.saving.set(true);
    this.failed.set(false);

    this.api
      .createCampaign({
        name: this.subject().trim().slice(0, 200),
        subject: this.subject().trim(),
        bodyHtml: this.body(),
        emailTemplateId: this.templateId() ? Number(this.templateId()) : null,
        accountTypeIds: this.selectedTypes(),
        additionalRecipients: this.extraRecipients().trim() || null,
        scheduledForUtc: this.delivery() === 'later' ? this.scheduledFor() : null,
      })
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          const id = (created as { emailCampaignId?: number })?.emailCampaignId;

          if (send && id) {
            this.dispatch(id);
            return;
          }

          this.message.set(
            this.delivery() === 'later'
              ? `Scheduled for ${this.scheduledFor()}. It is saved as a campaign and will go out then.`
              : 'Saved as a draft. Nothing has been sent.',
          );
          this.reset();
        },
        error: (r: { error?: { message?: string; title?: string } }) => {
          this.saving.set(false);
          this.failed.set(true);
          this.message.set(r.error?.message ?? r.error?.title ?? 'Could not save the campaign.');
        },
      });
  }

  private dispatch(id: number): void {
    this.api.sendCampaign(id).subscribe({
      next: (r) => {
        this.message.set(`Campaign queued to ${r.queued.toLocaleString()} recipients.`);
        this.reset();
      },
      error: () => {
        this.failed.set(true);
        this.message.set('The campaign was saved but could not be queued.');
      },
    });
  }

  private reset(): void {
    this.subject.set('');
    this.body.set('');
    this.extraRecipients.set('');
    this.selectedTypes.set([]);
    this.templateId.set('');
    this.delivery.set('now');
    this.scheduledFor.set('');
    this.api.emailerSummary().subscribe((s) => this.summary.set(s));
    this.load();
  }

  sendTest(): void {
    this.failed.set(false);
    this.message.set(
      'A test send goes to the signed-in administrator only. It is not wired to an ' +
        'endpoint yet, so nothing has been sent.',
    );
  }

  manageTemplates(): void {
    void this.router.navigate(['/emailer/transactional']);
  }

  view(campaign: EmailCampaign): void {
    this.failed.set(false);
    this.message.set(
      `${campaign.subject} — ${campaign.recipientCount.toLocaleString()} recipients, ` +
        `${campaign.sentCount.toLocaleString()} delivered, ${campaign.failedCount.toLocaleString()} failed.`,
    );
  }

  resend(campaign: EmailCampaign): void {
    this.failed.set(false);
    this.message.set(
      `Resending "${campaign.subject}" would mail ${campaign.recipientCount.toLocaleString()} ` +
        'people a second time, so it is done from the campaign itself after confirming the audience.',
    );
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Sent':
        return 'pill-ok';
      case 'Failed':
        return 'pill-bad';
      case 'Scheduled':
      case 'Sending':
        return 'pill-info';
      default:
        return 'pill-draft';
    }
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
  }
}

/** Templates are stored as HTML; the composer is plain text. */
function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}
