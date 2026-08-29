import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { environment } from '../../../environments/environment';
import { httpErrorMessage } from '../../shared/http-error';
import { istDateTime } from '../../shared/when';

interface PartnerOption {
  id: number;
  name: string;
  code: string;
  scope: string | null;
}

interface Options {
  implementingAgencies: PartnerOption[];
  associations: PartnerOption[];
  oemPsus: PartnerOption[];
}

interface Claim {
  kind: 'Association' | 'OemPsu';
  organisationId: number;
  partnerName: string;
  referenceNo: string | null;
  status: 'Pending' | 'Approved' | 'Disputed';
  decidedOnUtc: string | null;
  decisionRemark: string | null;
}

interface Intake {
  answered: boolean;
  answeredOnUtc: string | null;
  implementingAgencyOrgId: number | null;
  implementingAgency: string | null;
  claims: Claim[];
  canProceed: boolean;
}

type Picker = 'agency' | 'association' | 'oemPsu';

/**
 * Apply for LEAN Silver — C02a to C02e, over the dashboard.
 *
 * Three questions decide who verifies the application: the Implementing Agency
 * that will run the handholding, and whether the enterprise belongs to an
 * Industry Association or supplies an OEM/PSU. The last two are claims, put to
 * the bodies named rather than taken on trust, which is what C02d/C02e then
 * report on.
 *
 * Either approval opens payment. An enterprise that named two bodies is not
 * held up because one is slow, and one that named neither waits for nothing.
 */
@Component({
  selector: 'app-msme-silver-intake',
  imports: [FormsModule],
  templateUrl: './msme-silver-intake.component.html',
  styleUrl: './msme-silver-intake.component.scss',
})
export class MsmeSilverIntakeComponent {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  readonly enterpriseName = input('');

  readonly closed = output<void>();
  /** Raised when the applicant is clear to pay, so the host can route on. */
  readonly proceed = output<void>();

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly options = signal<Options | null>(null);
  readonly intake = signal<Intake | null>(null);

  /** Which list the search panel (C02c) is showing, or null when it is shut. */
  readonly picker = signal<Picker | null>(null);
  readonly pickerSearch = signal('');

  readonly agencyId = signal<number | null>(null);
  readonly hasAssociation = signal<boolean | null>(null);
  readonly associationId = signal<number | null>(null);
  readonly memberId = signal('');
  readonly hasOemPsu = signal<boolean | null>(null);
  readonly oemPsuId = signal<number | null>(null);
  readonly vendorId = signal('');

  /** Answered already: the screen is the verification status, not the form. */
  readonly showStatus = computed(() => this.intake()?.answered === true);

  readonly agencyName = computed(() => this.nameOf('agency', this.agencyId()));
  readonly associationName = computed(() => this.nameOf('association', this.associationId()));
  readonly oemPsuName = computed(() => this.nameOf('oemPsu', this.oemPsuId()));

  readonly pickerTitle = computed(() => {
    switch (this.picker()) {
      case 'agency': return 'Implementing Agency';
      case 'association': return 'Industry Association';
      default: return 'OEM / PSU';
    }
  });

  readonly pickerRows = computed(() => {
    const o = this.options();
    if (!o) return [];

    const list =
      this.picker() === 'agency' ? o.implementingAgencies
      : this.picker() === 'association' ? o.associations
      : o.oemPsus;

    const term = this.pickerSearch().trim().toLowerCase();
    if (!term) return list;
    return list.filter((r) => r.name.toLowerCase().includes(term)
                           || (r.scope ?? '').toLowerCase().includes(term));
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.http.get<Options>(`${this.base}/msme/application/silver/intake/options`).subscribe({
      next: (o) => {
        this.options.set(o);

        this.http.get<Intake>(`${this.base}/msme/application/silver/intake`).subscribe({
          next: (i) => {
            this.intake.set(i);
            this.prefill(i);
            this.loading.set(false);
          },
          error: (e: unknown) => {
            this.loadError.set(httpErrorMessage(e));
            this.loading.set(false);
          },
        });
      },
      error: (e: unknown) => {
        this.loadError.set(httpErrorMessage(e));
        this.loading.set(false);
      },
    });
  }

  /** Reopening the form shows what was answered last time, not a blank page. */
  private prefill(i: Intake): void {
    this.agencyId.set(i.implementingAgencyOrgId);

    const association = i.claims.find((c) => c.kind === 'Association');
    const oemPsu = i.claims.find((c) => c.kind === 'OemPsu');

    if (i.answered) {
      this.hasAssociation.set(association !== undefined);
      this.hasOemPsu.set(oemPsu !== undefined);
    }

    if (association) {
      this.associationId.set(association.organisationId);
      this.memberId.set(association.referenceNo ?? '');
    }
    if (oemPsu) {
      this.oemPsuId.set(oemPsu.organisationId);
      this.vendorId.set(oemPsu.referenceNo ?? '');
    }
  }

  private nameOf(picker: Picker, id: number | null): string {
    if (id === null) return '';
    const o = this.options();
    if (!o) return '';

    const list =
      picker === 'agency' ? o.implementingAgencies
      : picker === 'association' ? o.associations
      : o.oemPsus;

    return list.find((r) => r.id === id)?.name ?? '';
  }

  openPicker(which: Picker): void {
    this.picker.set(which);
    this.pickerSearch.set('');
  }

  choose(row: PartnerOption): void {
    switch (this.picker()) {
      case 'agency': this.agencyId.set(row.id); break;
      case 'association': this.associationId.set(row.id); break;
      case 'oemPsu': this.oemPsuId.set(row.id); break;
    }
    this.picker.set(null);
  }

  submit(): void {
    if (this.agencyId() === null) {
      this.formError.set('Choose the implementing agency that will run your handholding.');
      return;
    }
    if (this.hasAssociation() === null || this.hasOemPsu() === null) {
      this.formError.set('Answer both questions — Yes or No.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    this.http.post(`${this.base}/msme/application/silver/intake`, {
      implementingAgencyOrgId: this.agencyId(),
      hasAssociation: this.hasAssociation(),
      associationOrgId: this.hasAssociation() ? this.associationId() : null,
      memberId: this.hasAssociation() ? this.memberId() : null,
      hasOemPsu: this.hasOemPsu(),
      oemPsuOrgId: this.hasOemPsu() ? this.oemPsuId() : null,
      vendorId: this.hasOemPsu() ? this.vendorId() : null,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        // Straight to the status view: the applicant has just told two bodies
        // they have been named, and the next thing they want is where that got to.
        this.load();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.formError.set(httpErrorMessage(e, 'The answers could not be saved.'));
      },
    });
  }

  /** Back to the questions from the status view, to change an answer. */
  reopen(): void {
    const i = this.intake();
    if (i) this.intake.set({ ...i, answered: false });
  }

  // ---- the status view (C02d / C02e) ----

  claimOf(kind: 'Association' | 'OemPsu'): Claim | undefined {
    return this.intake()?.claims.find((c) => c.kind === kind);
  }

  statusHeadline(): string {
    const i = this.intake();
    if (!i) return '';
    if (i.claims.length === 0) return 'You can proceed';

    const approved = i.claims.filter((c) => c.status === 'Approved').length;
    if (approved === i.claims.length) return 'Verification complete';
    if (approved > 0) return 'You can proceed';
    return 'Sent for verification';
  }

  statusSub(): string {
    const i = this.intake();
    if (!i) return '';
    if (i.claims.length === 0) return 'You named no association or OEM, so there is nothing to wait for';

    const approved = i.claims.filter((c) => c.status === 'Approved').length;
    if (approved === i.claims.length) {
      return i.claims.length === 1
        ? 'The body you named has confirmed your association'
        : 'Both bodies have confirmed your association';
    }
    if (approved > 0) return 'One body has confirmed your association';
    return 'Waiting on the bodies you named';
  }

  statusNote(): string {
    const i = this.intake();
    if (!i) return '';
    if (i.claims.length === 0) {
      return 'Nothing is outstanding. You can accept the disclaimer and pay the balance fee.';
    }

    const approved = i.claims.filter((c) => c.status === 'Approved').length;
    if (approved === i.claims.length) {
      return 'Every approval is in. You can now accept the disclaimer and pay the balance fee.';
    }
    if (approved > 0) {
      return 'One approval is enough. You can accept the disclaimer and pay now; the other body can still answer.';
    }
    return 'Payment opens as soon as EITHER body approves — you do not have to wait for both.';
  }

  when(iso: string | null): string {
    return iso ? istDateTime(iso) : '';
  }
}
