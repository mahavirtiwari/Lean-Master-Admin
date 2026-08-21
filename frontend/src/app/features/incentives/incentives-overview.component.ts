import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { EmptyComponent, PageIntroComponent } from '../../shared/ui';
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
  imports: [FormsModule, DecimalPipe, PageIntroComponent, EmptyComponent],
  templateUrl: './incentives-overview.component.html',
  styleUrl: './incentives.scss',
})
export class IncentivesOverviewComponent {
  private readonly api = inject(IncentivesService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

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

  readonly providers = Object.values(PROVIDER_PROFILES);

  /** Which sub-menu a category card leads to when there is no obvious one. */
  readonly manageRoute = computed(() => (category: IncentiveCategory) => this.routeFor(category));

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

  clearFilters(): void {
    this.search.set('');
    this.categoryId.set('');
    this.activation.set('All');
    this.providerCode.set('');
    this.load();
  }
}
