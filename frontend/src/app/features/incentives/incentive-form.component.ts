import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { StateRef } from '../../core/models';
import { PageIntroComponent } from '../../shared/ui';
import {
  IncentiveCategory,
  IncentiveDetail,
  IncentiveResource,
  IncentiveSave,
  IncentivesService,
  PROVIDER_PROFILES,
  ProviderProfile,
} from './incentives.service';

/** What the form holds while it is being filled in. */
interface FormState {
  name: string;
  description: string;
  categoryId: number | '';
  schemeCode: string;
  activationLevel: 'Silver' | 'Gold' | 'Both';
  administeringBody: string;
  stateId: number | '';
  budgetHead: string;
  outlayAmount: number | null;
  gazetteNo: string;
  productType: string;
  rateConcessionBps: number | null;
  agencyType: string;
  externalSchemeId: string;
  validFrom: string;
  validTo: string;
  contactName: string;
  contactDesignation: string;
  contactMobile: string;
  contactEmail: string;
  videoUrl: string;
  externalUrl: string;
  visibleBeforeUnlock: boolean;
  notifyOnPublish: boolean;
  requireClaimDocument: boolean;
}

const EMPTY: FormState = {
  name: '',
  description: '',
  categoryId: '',
  schemeCode: '',
  activationLevel: 'Both',
  administeringBody: '',
  stateId: '',
  budgetHead: '',
  outlayAmount: null,
  gazetteNo: '',
  productType: '',
  rateConcessionBps: null,
  agencyType: '',
  externalSchemeId: '',
  validFrom: '',
  validTo: '',
  contactName: '',
  contactDesignation: '',
  contactMobile: '',
  contactEmail: '',
  videoUrl: '',
  externalUrl: '',
  visibleBeforeUnlock: true,
  notifyOnPublish: false,
  requireClaimDocument: false,
};

/**
 * Create or edit an incentive (artboards 37-40).
 *
 * The four forms share every field but three: what the provider needs to know
 * about the body behind the scheme. Ministry asks for a budget head and an
 * outlay, a State for the gazette notification, a bank for the product and the
 * concession, anyone else for an agency type and their own scheme id. The rest
 * — title, description, category, activation, dates, nodal contact, resources —
 * is the same form, so it is the same component.
 *
 * Bronze is not offered anywhere. The scheme activates incentives on Silver or
 * Gold only, and a control that cannot legally be chosen is shown disabled
 * rather than hidden, so the rule is visible where it applies.
 */
@Component({
  selector: 'app-incentive-form',
  imports: [FormsModule, PageIntroComponent],
  templateUrl: './incentive-form.component.html',
  styleUrl: './incentives.scss',
})
export class IncentiveFormComponent {
  private readonly api = inject(IncentivesService);
  private readonly reference = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly profile = signal<ProviderProfile>(PROVIDER_PROFILES['ministry']);
  readonly form = signal<FormState>({ ...EMPTY });
  readonly categories = signal<IncentiveCategory[]>([]);
  readonly states = signal<StateRef[]>([]);
  readonly resources = signal<IncentiveResource[]>([]);

  readonly incentiveId = signal<number | null>(null);
  readonly providerId = signal<number>(1);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  readonly editing = computed(() => this.incentiveId() !== null);
  readonly levels = ['Silver', 'Gold', 'Both'] as const;

  constructor() {
    this.api.categories().subscribe((categories) => this.categories.set(categories));
    this.reference.states().subscribe((states) => this.states.set(states));

    this.route.paramMap.subscribe((params) => {
      const slug = params.get('provider') ?? 'ministry';
      const profile = PROVIDER_PROFILES[slug] ?? PROVIDER_PROFILES['ministry'];

      this.profile.set(profile);

      this.api.providers().subscribe((providers) => {
        const match = providers.find((p) => p.code === profile.code);
        if (match) this.providerId.set(match.providerId);
      });

      const id = params.get('id');

      if (id && id !== 'new') {
        this.incentiveId.set(Number(id));
        this.api.get(Number(id)).subscribe({
          next: (detail) => this.fill(detail),
          error: () => this.error.set('That incentive could not be loaded.'),
        });
      } else {
        this.incentiveId.set(null);
        this.form.set({ ...EMPTY });
        this.resources.set([]);
      }
    });
  }

  patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    this.form.set({ ...this.form(), [key]: value });
  }

  /** Save Incentive publishes it; Save as Draft keeps it to administrators. */
  save(status: 'Active' | 'Draft'): void {
    const form = this.form();

    if (!form.name.trim()) return this.fail('Enter the incentive title.');
    if (!form.description.trim()) return this.fail('Enter a description.');
    if (!form.administeringBody.trim()) {
      return this.fail(`Enter the ${this.profile().ownerLabel.toLowerCase()}.`);
    }

    if (this.profile().code === 'STATE' && form.stateId === '') {
      return this.fail('Choose the notifying State or UT.');
    }

    if (this.profile().code === 'FINANCIAL' && !form.productType.trim()) {
      return this.fail('Enter the product type.');
    }

    if (this.profile().code === 'OTHERS' && !form.agencyType.trim()) {
      return this.fail('Enter the agency type.');
    }

    if (!form.contactName.trim()) return this.fail('Enter the nodal contact person.');

    if (!/^[6-9]\d{9}$/.test(form.contactMobile.trim())) {
      return this.fail('Enter a valid 10-digit mobile number.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.contactEmail.trim())) {
      return this.fail('Enter a valid official email address.');
    }

    const body: IncentiveSave = {
      name: form.name.trim(),
      providerId: this.providerId(),
      categoryId: form.categoryId === '' ? null : Number(form.categoryId),
      schemeCode: form.schemeCode.trim() || null,
      activationLevel: form.activationLevel,
      administeringBody: form.administeringBody.trim(),
      stateId: form.stateId === '' ? null : Number(form.stateId),
      description: form.description.trim(),
      outlayAmount: form.outlayAmount,
      budgetHead: form.budgetHead.trim() || null,
      gazetteNo: form.gazetteNo.trim() || null,
      productType: form.productType.trim() || null,
      rateConcessionBps: form.rateConcessionBps,
      agencyType: form.agencyType.trim() || null,
      externalSchemeId: form.externalSchemeId.trim() || null,
      contactName: form.contactName.trim(),
      contactDesignation: form.contactDesignation.trim() || null,
      contactMobile: form.contactMobile.trim(),
      contactEmail: form.contactEmail.trim(),
      visibleBeforeUnlock: form.visibleBeforeUnlock,
      notifyOnPublish: form.notifyOnPublish,
      requireClaimDocument: form.requireClaimDocument,
      status,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
      externalUrl: form.externalUrl.trim() || null,
      videoUrl: form.videoUrl.trim() || null,
    };

    this.saving.set(true);
    this.error.set(null);

    const id = this.incentiveId();

    const done = (): void => {
      this.saving.set(false);
      void this.router.navigate(['/incentives', this.profile().slug]);
    };

    if (id === null) {
      this.api.create(body).subscribe({
        next: (created) => {
          // A document chosen before the incentive existed has nowhere to go
          // until now, so it is uploaded once the row has an id.
          if (this.pending) {
            this.api.uploadDocument(created.incentiveId, this.pending).subscribe({
              next: () => done(),
              error: () => done(),
            });
          } else {
            done();
          }
        },
        error: (response: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.error.set(response.error?.message ?? 'The incentive could not be saved.');
        },
      });
    } else {
      this.api.update(id, body).subscribe({
        next: () => done(),
        error: (response: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.error.set(response.error?.message ?? 'The incentive could not be saved.');
        },
      });
    }
  }

  cancel(): void {
    void this.router.navigate(['/incentives', this.profile().slug]);
  }

  // ------------------------------------------------------------ resources ---

  /** Held until the incentive exists, on a create. */
  private pending: File | null = null;

  chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    const id = this.incentiveId();

    if (id === null) {
      this.pending = file;
      this.message.set(`${file.name} will be attached when the incentive is saved.`);
      return;
    }

    this.api.uploadDocument(id, file).subscribe({
      next: (resource) => {
        this.resources.set([...this.resources(), resource]);
        this.message.set(`${resource.title} attached.`);
      },
      error: () => this.error.set('That file could not be attached.'),
    });

    input.value = '';
  }

  removeResource(resource: IncentiveResource): void {
    this.api.deleteResource(resource.resourceId).subscribe({
      next: () => this.resources.set(this.resources().filter((r) => r.resourceId !== resource.resourceId)),
      error: () => this.error.set('That attachment could not be removed.'),
    });
  }

  downloadUrl(resource: IncentiveResource): string {
    return this.api.downloadUrl(resource.resourceId);
  }

  // -------------------------------------------------------------- helpers ---

  private fill(detail: IncentiveDetail): void {
    this.providerId.set(detail.providerId);
    this.resources.set(detail.resources);

    this.form.set({
      name: detail.name,
      description: detail.description ?? '',
      categoryId: detail.categoryId ?? '',
      schemeCode: detail.schemeCode ?? '',
      activationLevel: detail.activationLevel ?? 'Both',
      administeringBody: detail.administeringBody ?? '',
      stateId: detail.stateId ?? '',
      budgetHead: detail.budgetHead ?? '',
      outlayAmount: detail.outlayAmount,
      gazetteNo: detail.gazetteNo ?? '',
      productType: detail.productType ?? '',
      rateConcessionBps: detail.rateConcessionBps,
      agencyType: detail.agencyType ?? '',
      externalSchemeId: detail.externalSchemeId ?? '',
      validFrom: detail.validFrom ?? '',
      validTo: detail.validTo ?? '',
      contactName: detail.contactName ?? '',
      contactDesignation: detail.contactDesignation ?? '',
      contactMobile: detail.contactMobile ?? '',
      contactEmail: detail.contactEmail ?? '',
      videoUrl: detail.videoUrl ?? '',
      externalUrl: detail.externalUrl ?? '',
      visibleBeforeUnlock: detail.visibleBeforeUnlock,
      notifyOnPublish: detail.notifyOnPublish,
      requireClaimDocument: detail.requireClaimDocument,
    });
  }

  private fail(text: string): void {
    this.error.set(text);
    this.message.set(null);
  }
}
