import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';

interface Fee {
  gross: number;
  gstPercent: number;
  subsidyPercent: number;
  subsidyAmount: number;
  payable: number;
}

interface Receipt {
  reference: string;
  amount: number;
  method: string;
  paidOn: string;
}

type Stage = 'loading' | 'methods' | 'processing' | 'success' | 'failed' | 'nothing';

/**
 * The LEAN Silver fee payment on web (item 5 — payment can be done on web). A
 * simulated payment: it shows the fee less the government subsidy, takes a
 * method, and records the payment. Everything after payment, up to consultant
 * selection, is on the mobile app — the success screen says so.
 */
@Component({
  selector: 'app-msme-payment',
  imports: [DatePipe],
  templateUrl: './msme-payment.component.html',
  styleUrl: './msme-payment.component.scss',
})
export class MsmePaymentComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBase;

  readonly methods = [
    { code: 'UPI', label: 'UPI', hint: 'GPay, PhonePe, Paytm, BHIM', tag: 'Instant' },
    { code: 'Card', label: 'Credit / Debit card', hint: 'Visa, Mastercard, RuPay', tag: '' },
    { code: 'NetBanking', label: 'Net banking', hint: 'All major banks', tag: '' },
    { code: 'NEFT', label: 'NEFT / RTGS', hint: 'Takes 1–2 working days', tag: '' },
  ];

  readonly stage = signal<Stage>('loading');
  readonly fee = signal<Fee | null>(null);
  readonly method = signal('UPI');
  readonly receipt = signal<Receipt | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    this.http.get<Fee>(`${this.base}/msme/application/silver/fee`).subscribe({
      next: (f) => {
        this.fee.set(f);
        this.http.get<{ status?: string; paymentStatus?: string; paymentReference?: string; paidAmount?: number; paymentMethod?: string; paidOnUtc?: string } | null>(
          `${this.base}/msme/application/silver`,
        ).subscribe({
          next: (sub) => {
            if (!sub || sub.status !== 'Submitted') this.stage.set('nothing');
            else if (sub.paymentStatus === 'Paid') {
              this.receipt.set({
                reference: sub.paymentReference ?? '',
                amount: sub.paidAmount ?? f.payable,
                method: sub.paymentMethod ?? '',
                paidOn: sub.paidOnUtc ?? new Date().toISOString(),
              });
              this.stage.set('success');
            } else this.stage.set('methods');
          },
          error: () => this.stage.set('methods'),
        });
      },
      error: () => this.stage.set('nothing'),
    });
  }

  inr(n: number): string {
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  pay(simulateFailure: boolean): void {
    this.stage.set('processing');
    this.error.set(null);
    this.http.post<Receipt>(`${this.base}/msme/application/silver/pay`, {
      method: this.method(),
      simulateFailure,
    }).subscribe({
      next: (r) => {
        this.receipt.set(r);
        this.stage.set('success');
      },
      error: (resp: { error?: { message?: string } }) => {
        this.error.set(resp.error?.message ?? 'The payment could not be completed.');
        this.stage.set('failed');
      },
    });
  }

  home(): void {
    void this.router.navigate(['/msme/dashboard']);
  }
}
