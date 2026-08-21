import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { EmptyComponent } from '../../shared/ui';
import {
  IncentiveRow,
  IncentiveTotals,
  IncentivesService,
  PROVIDER_PROFILES,
  ProviderProfile,
} from './incentives.service';

/**
 * One provider's incentives (artboards 29-32).
 *
 * Four artboards, one component: Ministry, State Govt., Financial Institutions
 * and Others differ in their title, their subtitle and what the stakeholder
 * column holds — not in what the screen does. The provider comes from the
 * route, so a fifth would be a route and a profile entry, not a fifth copy of
 * this file.
 */
@Component({
  selector: 'app-incentives-list',
  imports: [FormsModule, DecimalPipe, EmptyComponent],
  templateUrl: './incentives-list.component.html',
  styleUrl: './incentives.scss',
})
export class IncentivesListComponent {
  private readonly api = inject(IncentivesService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly profile = signal<ProviderProfile>(PROVIDER_PROFILES['ministry']);
  readonly rows = signal<IncentiveRow[]>([]);
  readonly totals = signal<IncentiveTotals | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  readonly tab = signal<'All' | 'Active' | 'Draft'>('All');
  readonly categoryId = signal<number | ''>('');

  readonly canCreate = this.auth.can('INCENTIVES', 'create');
  readonly canEdit = this.auth.can('INCENTIVES', 'edit');

  readonly disbursedCrore = computed(() => (this.totals()?.disbursed ?? 0) / 10_000_000);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('provider') ?? 'ministry';

      this.profile.set(PROVIDER_PROFILES[slug] ?? PROVIDER_PROFILES['ministry']);
      this.load();
    });

    // The overview's Manage link arrives with a category already chosen.
    const preset = this.route.snapshot.queryParamMap.get('categoryId');
    if (preset) this.categoryId.set(Number(preset));
  }

  load(): void {
    this.loading.set(true);

    this.api
      .list({
        providerCode: this.profile().code,
        status: this.tab() === 'All' ? undefined : this.tab(),
        categoryId: this.categoryId() === '' ? undefined : Number(this.categoryId()),
        pageSize: 100,
      })
      .subscribe({
        next: (response) => {
          this.rows.set(response.page.items);
          this.totals.set(response.totals);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('The incentives could not be loaded.');
        },
      });
  }

  setTab(tab: 'All' | 'Active' | 'Draft'): void {
    this.tab.set(tab);
    this.load();
  }

  create(): void {
    void this.router.navigate(['/incentives', this.profile().slug, 'new']);
  }

  edit(row: IncentiveRow): void {
    void this.router.navigate(['/incentives', this.profile().slug, row.incentiveId]);
  }

  toggle(row: IncentiveRow): void {
    const activate = row.status !== 'Active';

    this.api.setStatus(row.incentiveId, activate).subscribe({
      next: () => {
        this.message.set(`${row.name} is now ${activate ? 'active' : 'disabled'}.`);
        this.load();
      },
      error: () => this.error.set('That change could not be saved.'),
    });
  }

  /**
   * The list as a CSV, built here rather than asked of the server: it is the
   * rows already on screen, and a second endpoint would only be a second thing
   * to keep in step with the columns.
   */
  exportList(): void {
    const header = [
      'S.No',
      'Incentive title',
      'Category',
      'Activation',
      'Stakeholder',
      'Beneficiaries',
      'Value disbursed',
      'Status',
    ];

    const lines = this.rows().map((row, index) =>
      [
        index + 1,
        row.name,
        row.categoryName ?? '',
        row.activationLevel,
        row.stakeholder,
        row.beneficiaries,
        row.valueDisbursed,
        row.status,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );

    const blob = new Blob([[header.join(','), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `incentives-${this.profile().slug}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }
}
