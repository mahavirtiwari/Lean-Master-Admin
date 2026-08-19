import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { FeeLevel } from '../../core/models';
import { PageIntroComponent } from '../../shared/ui';

/** The accent each level carries throughout the deck. */
const LEVEL_ACCENT: Record<string, string> = {
  BRONZE: '#C2410C',
  SILVER: '#5D6B62',
  GOLD: '#A16207',
};

/**
 * Fee Structure for one certification level — 26-fee-lean-bronze,
 * 27-fee-lean-silver, 28-fee-lean-gold.
 *
 * Three blocks: the editable Certification Fee &amp; Rates card, the Payment
 * Structure table across every subsidy category, and TDS Deduction &amp; Net
 * Payable.
 *
 * All the money is computed by the API, not here. The split is the scheme's
 * rule rather than a display choice, and the same figures have to appear on an
 * invoice — so there is one implementation of it, server-side.
 */
@Component({
  selector: 'app-fee-level',
  imports: [FormsModule, RouterLink, DecimalPipe, PageIntroComponent],
  templateUrl: './fee-level.component.html',
  styleUrl: './fee-level.component.scss',
})
export class FeeLevelComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** Route param: /fee-structure/bronze | silver | gold */
  readonly level = input.required<string>();

  readonly data = signal<FeeLevel | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal<string | null>(null);

  readonly fee = signal(0);
  readonly gstPercent = signal(18);
  readonly tds194C = signal(0);
  readonly tds194J = signal(0);

  readonly canEdit = this.auth.can('FEE_STRUCTURE', 'edit');

  readonly accent = computed(
    () => LEVEL_ACCENT[this.level().toUpperCase()] ?? 'var(--text-muted)',
  );

  readonly heading = computed(() => {
    const d = this.data();
    return d ? `Fee Structure — ${d.name}` : 'Fee Structure';
  });

  readonly subtitle = computed(() => {
    const d = this.data();
    return d
      ? `Fee, subsidy split, GST and both TDS deductions for ${d.name}`
      : '';
  });

  constructor() {
    effect(() => {
      const code = this.level().toUpperCase();
      this.loading.set(true);

      this.api.feeLevel(code).subscribe({
        next: (d) => {
          this.data.set(d);
          this.fee.set(d.fee);
          this.gstPercent.set(d.gstPercent);
          this.tds194C.set(d.tds194CPercent);
          this.tds194J.set(d.tds194JPercent);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    });
  }

  save(): void {
    const d = this.data();
    if (!d || !this.canEdit) return;

    this.saving.set(true);
    this.message.set(null);

    this.api
      .updateFeeLevel(d.code, {
        fee: Number(this.fee()),
        gstPercent: Number(this.gstPercent()),
        tds194CPercent: Number(this.tds194C()),
        tds194JPercent: Number(this.tds194J()),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.message.set('Saved. The figures below have been recalculated.');
          // Re-fetch so every derived column reflects the new rates.
          this.api.feeLevel(d.code).subscribe((fresh) => this.data.set(fresh));
        },
        error: (response: { error?: { title?: string } }) => {
          this.saving.set(false);
          this.message.set(response.error?.title ?? 'Could not save the rates.');
        },
      });
  }
}
