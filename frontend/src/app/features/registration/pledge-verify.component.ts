import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { environment } from '../../../environments/environment';

/** What the verification endpoint returns for one certificate. */
export interface PledgeVerification {
  certificateNo: string;
  unitName: string;
  enterpriseName: string;
  udyamNumber: string;
  address: string;
  pledgedOn: string;
  leanId: string | null;
  status: string;
}

/**
 * Pledge certification details — the page behind the QR on a certificate.
 *
 * Public, and deliberately plain: it is read on a phone, held next to the
 * printed certificate, by somebody checking that the two agree. So it shows
 * the same fields in the same order as the paper and nothing else — no
 * navigation into the portal, no sign-in, nothing to get lost in.
 */
@Component({
  selector: 'app-pledge-verify',
  imports: [],
  templateUrl: './pledge-verify.component.html',
  styleUrl: './pledge-verify.component.scss',
})
export class PledgeVerifyComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly data = signal<PledgeVerification | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly year = new Date().getFullYear();
  readonly appVersion = '1.0.0';

  constructor() {
    const reference = this.route.snapshot.paramMap.get('reference') ?? '';

    this.http
      .get<PledgeVerification>(`${environment.apiBase}/pledge/${encodeURIComponent(reference)}`)
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.loading.set(false);
        },
        error: (response: { error?: { message?: string } }) => {
          this.loading.set(false);
          this.error.set(
            response.error?.message ??
              'This certificate could not be verified. Please check the number and try again.',
          );
        },
      });
  }

  /** The long date the certificate itself carries, e.g. 20 August 2026. */
  formatDate(value: string | undefined): string {
    if (!value) return '—';

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
