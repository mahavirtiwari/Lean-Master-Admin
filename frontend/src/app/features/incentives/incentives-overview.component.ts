import { Component, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { EmptyComponent } from '../../shared/ui';
import {
  IncentiveCategory,
  IncentiveRow,
  IncentiveTotals,
  IncentivesService,
  PROVIDER_PROFILES,
} from './incentives.service';

/**
 * Incentives Management — the module's landing screen (artboard 12).
 *
 * Two halves. The five category boxes say what kinds of support exist and how
 * much of each is live; the table beneath is every incentive regardless of
 * category, because an administrator looking for one scheme should not have to
 * guess which box it was filed under.
 *
 * The boxes are categories, not providers. Who funds a benefit is a different
 * question from what it is for, and the sub-menus already answer the first.
 */
@Component({
  selector: 'app-incentives-overview',
  imports: [FormsModule, EmptyComponent],
  templateUrl: './incentives-overview.component.html',
  styleUrl: './incentives.scss',
})
export class IncentivesOverviewComponent {
  private readonly api = inject(IncentivesService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  readonly categories = signal<IncentiveCategory[]>([]);
  readonly rows = signal<IncentiveRow[]>([]);
  readonly totals = signal<IncentiveTotals | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly search = signal('');
  readonly categoryId = signal<number | ''>('');
  readonly activation = signal('All');
  readonly providerCode = signal('');

  readonly canCreate = this.auth.can('INCENTIVES', 'create');
  readonly canEdit = this.auth.can('INCENTIVES', 'edit');
  readonly noteOpen = signal(true);

  readonly providers = Object.values(PROVIDER_PROFILES);

  /**
   * A mark for each of the five boxes.
   *
   * Drawn here rather than pulled from an icon set: five glyphs used in one
   * place do not earn a dependency, and each one has to say what its category
   * is about — a spanner for upgradation, a flask for testing, a pin for state
   * benefits, a bank for lending, a parcel for the rest.
   */
  private static readonly ICONS: Record<string, string> = {
    TECH_UPGRAD:
      '<svg viewBox="0 0 20 20"><path d="M12.4 3.6a3.6 3.6 0 0 0-4.9 4.4l-4 4a1.4 1.4 0 0 0 2 2l4-4a3.6 3.6 0 0 0 4.4-4.9l-2 2-1.5-1.5z" fill="none" stroke="#0F7B45" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    TESTING_CERT:
      '<svg viewBox="0 0 20 20"><path d="M8.4 3v4.2L4.8 14a1.6 1.6 0 0 0 1.4 2.4h7.6A1.6 1.6 0 0 0 15.2 14l-3.6-6.8V3z" fill="none" stroke="#0F7B45" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.4 3h5.2" stroke="#0F7B45" stroke-width="1.4" stroke-linecap="round"/></svg>',
    STATE_BENEFIT:
      '<svg viewBox="0 0 20 20"><path d="M10 17s5.2-4.6 5.2-8.2a5.2 5.2 0 1 0-10.4 0C4.8 12.4 10 17 10 17z" fill="none" stroke="#0F7B45" stroke-width="1.4" stroke-linejoin="round"/><circle cx="10" cy="8.6" r="1.9" fill="none" stroke="#0F7B45" stroke-width="1.4"/></svg>',
    FI_BENEFIT:
      '<svg viewBox="0 0 20 20"><path d="M3.4 8 10 4.2 16.6 8z" fill="none" stroke="#0F7B45" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.4 8.6v5.2M9 8.6v5.2M12.6 8.6v5.2M3.2 15.4h13.6" stroke="#0F7B45" stroke-width="1.4" stroke-linecap="round"/></svg>',
    OTHERS:
      '<svg viewBox="0 0 20 20"><path d="M3.6 7.4h12.8v8.2H3.6z" fill="none" stroke="#0F7B45" stroke-width="1.4" stroke-linejoin="round"/><path d="M3.6 7.4 10 4l6.4 3.4M10 7.4v8.2" stroke="#0F7B45" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  };

  /**
   * The icons are ours, written above — not markup from a request, which is
   * why binding them as HTML is safe here and would not be anywhere else.
   */
  iconFor(code: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      IncentivesOverviewComponent.ICONS[code] ?? IncentivesOverviewComponent.ICONS['OTHERS'],
    );
  }

  /** The segmented control has no room for a category's full name. */
  shortName(category: IncentiveCategory): string {
    return category.name
      .replace('Financial Support for ', '')
      .replace('Financial Institution Benefits', 'Financial Institution')
      .replace('State Specific Benefits', 'State Benefits')
      .replace(' & Product Certification', ' & Certification');
  }

  pickCategory(id: number | ''): void {
    this.categoryId.set(id);
    this.load();
  }

  formatDate(value: string): string {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  toggle(row: IncentiveRow): void {
    this.api.setStatus(row.incentiveId, row.status !== 'Active').subscribe({
      next: () => this.load(),
      error: () => this.error.set('That change could not be saved.'),
    });
  }

  constructor() {
    this.api.overview().subscribe({
      next: (data) => {
        this.categories.set(data.categories);
        this.totals.set(data.totals);
      },
      error: () => this.error.set('The incentive summary could not be loaded.'),
    });

    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.api
      .list({
        search: this.search() || undefined,
        categoryId: this.categoryId() === '' ? undefined : Number(this.categoryId()),
        activation: this.activation(),
        providerCode: this.providerCode() || undefined,
        pageSize: 100,
      })
      .subscribe({
        next: (response) => {
          this.rows.set(response.page.items);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('The incentives could not be loaded.');
        },
      });
  }

  /**
   * A category is not a provider, so the card cannot open one sub-menu with
   * certainty. State benefits belong to the States; financial-institution
   * benefits to the banks; the rest are opened on the whole list, filtered.
   */
  routeFor(category: IncentiveCategory): string {
    switch (category.code) {
      case 'STATE_BENEFIT':
        return '/incentives/state';
      case 'FI_BENEFIT':
        return '/incentives/financial';
      case 'OTHERS':
        return '/incentives/others';
      default:
        return '/incentives/ministry';
    }
  }

  manage(category: IncentiveCategory): void {
    void this.router.navigate([this.routeFor(category)], {
      queryParams: { categoryId: category.categoryId },
    });
  }

  create(): void {
    void this.router.navigate(['/incentives/ministry/new']);
  }

  open(row: IncentiveRow): void {
    void this.router.navigate(['/incentives', this.slugFor(row), row.incentiveId]);
  }

  /** The sub-menu an existing incentive is edited under. */
  private slugFor(row: IncentiveRow): string {
    const owner = (row.stakeholder ?? '').toLowerCase();

    if (owner.includes('state')) return 'state';
    if (owner.includes('bank') || owner.includes('sidbi') || owner.includes('nabard')) {
      return 'financial';
    }

    return row.categoryName === 'Others' ? 'others' : 'ministry';
  }

}
