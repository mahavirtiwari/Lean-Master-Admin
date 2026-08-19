import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { FeeStructure, SubsidyCategory, TdsSection } from '../../core/models';
import { PageIntroComponent } from '../../shared/ui';

/**
 * Fee Structure (14-green, 26/27/28-fee-lean-*, 82-fee-tds-edit).
 *
 * The three level sub-routes are this screen with a row highlighted, so they
 * share one component rather than repeating the table three times.
 *
 * The arithmetic on show is the scheme's, not a display choice: the fee is
 * split by subsidy category first, then GST and TDS apply to the MSME share
 * only. Because the stored fee is GST-inclusive, the taxable value is the MSME
 * share divided by 1 + GST%, and the API returns both so the screen never
 * recomputes money client-side.
 */
@Component({
  selector: 'app-fee-structure',
  imports: [FormsModule, RouterLink, DecimalPipe, PageIntroComponent],
  template: `
    <app-page-intro
      title="Fee Structure"
      subtitle="Certification fees, GoI subsidy categories and TDS rates for the LEAN scheme"
    />

    <div class="stack">
      @if (fee(); as f) {
        <div class="stat-grid">
          @for (row of f.rows; track row.feeRateId) {
            <div class="stat kpi" [style.--kpi]="accentFor(row.levelName)">
              <div class="stat-label">{{ row.levelName }}</div>
              <div class="stat-value">
                {{ row.amountInclusiveGst > 0 ? ('₹ ' + (row.amountInclusiveGst | number)) : 'Free' }}
              </div>
            </div>
          }
          <div class="stat">
            <div class="stat-label">GST (%)</div>
            <div class="stat-value">{{ f.gstPercent | number: '1.0-0' }}</div>
          </div>
        </div>

        <div class="note">
          <div>
            Certification fees are inclusive of {{ f.gstPercent | number: '1.0-0' }}% GST. The fee is
            split by subsidy category first.<br />
            GST and TDS then apply to the MSME share only — the Government share carries neither.<br />
            The scheme has no coupon or discount code.
          </div>
        </div>

        <section class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">Certification Fee by Level</h3>
              <p class="card-sub">
                Shares shown at the {{ f.subsidyCategory.name }} rate of
                {{ f.subsidyCategory.goiPercent | number: '1.0-0' }}%. GST is computed on the MSME
                share.
              </p>
            </div>

            <select
              class="select"
              name="category"
              [ngModel]="categoryCode()"
              (ngModelChange)="categoryCode.set($event); loadFee()"
            >
              @for (category of categories(); track category.subsidyCategoryId) {
                <option [value]="category.code">
                  {{ category.name }} ({{ category.totalSubsidyPercent | number: '1.0-0' }}%)
                </option>
              }
            </select>
          </div>

          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Level</th>
                  <th class="num">Fee (incl. GST)</th>
                  <th class="num">
                    GoI Share @ {{ f.subsidyCategory.goiPercent | number: '1.0-0' }}%
                  </th>
                  <th class="num">
                    MSME Share @ {{ f.subsidyCategory.msmePercent | number: '1.0-0' }}%
                  </th>
                  <th class="num">MSME Taxable</th>
                  <th class="num">GST @ {{ f.gstPercent | number: '1.0-0' }}%</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (row of f.rows; track row.feeRateId) {
                  <tr [class.is-highlight]="highlight() === row.levelName">
                    <td>
                      <a
                        class="level-pill"
                        [style.--accent]="accentFor(row.levelName)"
                        [routerLink]="['/fee-structure', slugFor(row.levelName)]"
                      >{{ row.levelName }}</a>
                    </td>
                    <td class="num strong">₹ {{ row.amountInclusiveGst | number }}</td>
                    <td class="num text-green">₹ {{ row.goiShare | number }}</td>
                    <td class="num strong">₹ {{ row.msmeShare | number }}</td>
                    <td class="num">₹ {{ row.msmeTaxable | number: '1.2-2' }}</td>
                    <td class="num">₹ {{ row.gstAmount | number: '1.2-2' }}</td>
                    <td><span class="pill pill-green">Active</span></td>
                    <td>
                      <a class="act act-edit" [routerLink]="['/fee-structure', slugFor(row.levelName)]">
                        {{ canEdit ? 'Edit' : 'View' }}
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

      }

      <!-- --------------------------------------------------- TDS rates -->
      <section class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">TDS Rates</h3>
            <p class="card-sub">Deducted from the MSME share only, by section of the Income Tax Act</p>
          </div>
        </div>

        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Section</th>
                <th>Description</th>
                <th>Applicable To</th>
                <th class="num">Rate</th>
                <th>Effective From</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (row of tds(); track row.tdsSectionId) {
                <tr>
                  <td class="code">{{ row.sectionCode }}</td>
                  <td>{{ row.description }}</td>
                  <td>{{ row.applicableTo }}</td>
                  <td class="num strong">{{ row.ratePercent | number: '1.0-2' }}%</td>
                  <td>{{ row.effectiveFrom }}</td>
                  <td>
                    @if (canEdit) {
                      <button class="act act-edit" type="button" (click)="startEditTds(row)">Edit</button>
                    } @else {
                      <span class="muted">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      @if (editingTds(); as row) {
        <div class="modal-backdrop" (click)="editingTds.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-body">
              <h3 class="modal-title">Edit TDS Rate — {{ row.sectionCode }}</h3>
              <div class="stack">
                <div class="field">
                  <label class="field-label" for="rate">RATE (%)<span class="req">*</span></label>
                  <input
                    id="rate"
                    class="input"
                    type="number"
                    name="rate"
                    [ngModel]="tdsRate()"
                    (ngModelChange)="tdsRate.set($event)"
                  />
                </div>
                <div class="field">
                  <label class="field-label" for="applicable">APPLICABLE TO</label>
                  <input
                    id="applicable"
                    class="input"
                    name="applicable"
                    [ngModel]="tdsApplicable()"
                    (ngModelChange)="tdsApplicable.set($event)"
                  />
                </div>
              </div>
            </div>
            <div class="modal-foot">
              <button class="btn btn-secondary" type="button" (click)="editingTds.set(null)">
                Cancel
              </button>
              <button class="btn btn-primary" type="button" (click)="saveTds(row)">Save</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .is-highlight {
      background: var(--green-50) !important;
    }
  `,
})
export class FeeStructureComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly fee = signal<FeeStructure | null>(null);
  readonly categories = signal<SubsidyCategory[]>([]);
  readonly tds = signal<TdsSection[]>([]);
  readonly categoryCode = signal('GEN');

  /** Set from the route so /fee-structure/silver lands on that row. */
  readonly highlight = signal<string | null>(null);

  readonly editingTds = signal<TdsSection | null>(null);
  readonly tdsRate = signal(0);
  readonly tdsApplicable = signal('');

  readonly canEdit = this.auth.can('FEE_STRUCTURE', 'edit');

  constructor() {
    this.api.subsidyCategories().subscribe((c) => {
      this.categories.set(c);
      if (c.length > 0 && !c.some((x) => x.code === this.categoryCode())) {
        this.categoryCode.set(c[0].code);
        this.loadFee();
      }
    });

    this.loadFee();
    this.api.tdsSections().subscribe((t) => this.tds.set(t));

    // /fee-structure/bronze | silver | gold
    const leaf = location.pathname.split('/').pop() ?? '';
    if (['bronze', 'silver', 'gold'].includes(leaf)) {
      this.highlight.set(`LEAN ${leaf[0].toUpperCase()}${leaf.slice(1)}`);
    }
  }

  loadFee(): void {
    this.api.feeStructure(this.categoryCode()).subscribe((f) => this.fee.set(f));
  }

  /** Bronze #C2410C, Silver #5D6B62, Gold #A16207 — the deck's own accents. */
  accentFor(levelName: string): string {
    if (levelName.includes('Bronze')) return '#C2410C';
    if (levelName.includes('Gold')) return '#A16207';
    return '#5D6B62';
  }

  /** /fee-structure/bronze | silver | gold */
  slugFor(levelName: string): string {
    if (levelName.includes('Bronze')) return 'bronze';
    if (levelName.includes('Gold')) return 'gold';
    return 'silver';
  }

  startEditTds(row: TdsSection): void {
    this.editingTds.set(row);
    this.tdsRate.set(row.ratePercent);
    this.tdsApplicable.set(row.applicableTo);
  }

  saveTds(row: TdsSection): void {
    this.api
      .updateTdsSection(row.tdsSectionId, {
        ratePercent: Number(this.tdsRate()),
        description: row.description,
        applicableTo: this.tdsApplicable(),
      })
      .subscribe(() => {
        this.editingTds.set(null);
        this.api.tdsSections().subscribe((t) => this.tds.set(t));
      });
  }
}
