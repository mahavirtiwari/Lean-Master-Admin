import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
import { MsmeMastheadComponent } from './msme-masthead.component';
import { MsmeSectionMenuComponent } from './msme-section-menu.component';
import { MsmeSidebarComponent } from './msme-sidebar.component';

interface PaymentRow {
  kind: 'invoice' | 'receipt';
  title: string;
  amount: number | null;
  reference: string | null;
  paidOn: string | null;
  method?: string | null;
}

/**
 * Payments (Y00) — the applicant's invoices and receipts, over the shared
 * masthead + section menu + sidebar. Nothing shows until a payment has been
 * made; an unpaid enterprise sees the empty state.
 */
@Component({
  selector: 'app-msme-payments',
  imports: [MsmeMastheadComponent, MsmeSectionMenuComponent, MsmeSidebarComponent, DecimalPipe],
  template: `
    <app-msme-masthead mode="app" />
    <app-msme-section-menu />

    <main class="py-ground">
      <div class="py-wrap">
        <div class="py-crumb">Home <span>›</span> Payments</div>
        <h1 class="py-h1">Payments</h1>

        <div class="py-grid">
          <app-msme-sidebar />

          <div class="py-body">
            <h2 class="py-title">Invoices &amp; receipts</h2>

            @if (loading()) {
              <div class="py-card py-loading">Loading…</div>
            } @else if (rows().length === 0) {
              <div class="py-card py-empty">
                No payments yet. Your LEAN Silver invoice and receipt will appear here after you pay.
              </div>
            } @else {
              @for (r of rows(); track r.kind + r.title) {
                <div class="py-card py-row" [class.receipt]="r.kind === 'receipt'">
                  <span class="py-ic" [class.blue]="r.kind === 'invoice'" [class.green]="r.kind === 'receipt'">
                    {{ r.kind === 'receipt' ? '₹' : '🧾' }}
                  </span>
                  <span class="py-row-body">
                    <span class="py-row-title">{{ r.title }}</span>
                    @if (r.amount != null) { <span class="py-amount">Rs {{ r.amount | number:'1.0-0' }}</span> }
                    <span class="py-meta">
                      @if (r.reference) { Ref {{ r.reference }} }
                      @if (r.paidOn) { · {{ formatDate(r.paidOn) }} }
                      @if (r.method) { · {{ r.method }} }
                    </span>
                  </span>
                </div>
              }
            }
          </div>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: #f4f7f5; }
      .py-ground { padding: 24px 40px 64px; }
      .py-wrap { max-width: 1192px; margin: 0 auto; }
      .py-crumb { font-size: 12px; color: #93a29a; }
      .py-crumb span { margin: 0 6px; }
      .py-h1 { font-size: 18.5px; font-weight: 700; color: #16211a; margin: 4px 0 18px; }
      .py-grid { display: grid; grid-template-columns: 292px minmax(0, 1fr); gap: 24px; align-items: start; }
      @media (max-width: 980px) { .py-grid { grid-template-columns: minmax(0, 1fr); } }
      .py-body { display: flex; flex-direction: column; gap: 12px; }
      .py-title { font-size: 16px; font-weight: 700; color: #16211a; margin: 0 0 2px; }
      .py-card { background: #fff; border: 1px solid #e9efeb; border-radius: 14px; padding: 16px; }
      .py-loading, .py-empty { color: #93a29a; font-size: 13px; }
      .py-row { display: flex; align-items: center; gap: 14px; border-left: 3px solid #1b4f8a; }
      .py-row.receipt { border-left-color: #0f7b45; }
      .py-ic { flex: none; width: 36px; height: 36px; border-radius: 9px;
               display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; }
      .py-ic.blue { background: #eaf1f9; color: #1b4f8a; }
      .py-ic.green { background: #eef8f1; color: #0f7b45; }
      .py-row-body { display: flex; flex-direction: column; gap: 2px; }
      .py-row-title { font-size: 14px; font-weight: 700; color: #16211a; }
      .py-amount { font-size: 14px; font-weight: 700; color: #1b4f8a; }
      .py-meta { font-size: 12px; color: #93a29a; }
    `,
  ],
})
export class MsmePaymentsComponent {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  readonly rows = signal<PaymentRow[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.http.get<{ payments: PaymentRow[] }>(`${this.base}/msme/payments`).subscribe({
      next: (r) => { this.rows.set(r.payments ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
}
