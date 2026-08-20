import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { RegistrationService } from './registration.service';
import {
  AwarenessProgram,
  RegistrationActivity,
  RegistrationDraft,
  RegistrationPlant,
} from './registration.models';

/** The eight markers across the top of every screen (R1-R9). */
const STEPS = [
  'Register',
  'Udyam Validation',
  'Enterprise Details',
  'Unit & Activity',
  'SPOC & Awareness',
  'Summary',
  'LEAN Pledge',
  'Complete',
] as const;

/**
 * MSME applicant registration — R1 to R9.
 *
 * One component for the whole wizard rather than nine. The steps share a single
 * draft, a single step rail and one public frame; splitting them across routed
 * components would mean re-fetching the draft on every step and re-deriving
 * which step is legal to be on. The URL still carries the step so Back works.
 *
 * Every step is validated again on the server. Nothing here is a security
 * control — it exists so the applicant is told what is wrong before a round
 * trip, not to decide what is allowed.
 */
@Component({
  selector: 'app-registration',
  imports: [],
  templateUrl: './registration.component.html',
  styleUrl: './registration.component.scss',
})
export class RegistrationComponent {
  private readonly api = inject(RegistrationService);
  private readonly router = inject(Router);

  /**
   * The "What you'll need" list on R1. Icons are drawn rather than shipped so
   * they inherit the artboard's blue at whatever size the card renders.
   */
  readonly needs = [
    {
      name: 'Udyam Registration Number',
      hint: 'Format UDYAM-XX-00-XXXXXXX',
      // document
      icon: 'M4.2 2.4h5L12 5.2v8.4H4.2z',
      icon2: 'M9.2 2.4v3h3M6.2 8.6h3.6M6.2 11h2.4',
    },
    {
      name: 'Udyam-registered mobile number',
      hint: 'Validated against Udyam records',
      // handset
      icon: 'M5.4 1.8h5.2v12.4H5.4z',
      icon2: 'M7.2 12.4h1.6',
    },
    {
      name: 'SPOC email address',
      hint: 'Receives the OTP, LEAN ID and password',
      // envelope
      icon: 'M2.4 3.8h11.2v8.4H2.4z',
      icon2: 'm2.8 4.6 5.2 4 5.2-4',
    },
    {
      name: 'Plant / unit address & NIC code',
      hint: '2-digit, 4-digit and 5-digit classification',
      // map pin
      icon: 'M8 14.2S3.2 9.8 3.2 6.6a4.8 4.8 0 0 1 9.6 0c0 3.2-4.8 7.6-4.8 7.6Z',
      icon2: 'M8 8.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z',
    },
  ];

  /** The three certification levels, capped in the colours the artboard uses. */
  readonly levels = [
    { name: 'LEAN Bronze', note: 'Entry level — foundation LEAN tools', colour: '#C2410C' },
    { name: 'LEAN Silver', note: 'Intermediate — unlocks incentives', colour: '#5D6B62' },
    { name: 'LEAN Gold', note: 'Advanced — full incentive catalogue', colour: '#A16207' },
  ];

  readonly steps = STEPS;

  /** 1-based, matching the rail. */
  readonly step = signal(1);

  readonly draft = signal<RegistrationDraft | null>(null);
  readonly programs = signal<AwarenessProgram[]>([]);

  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly failed = signal(false);

  // ---- R2 ---------------------------------------------------------------
  readonly udyamNo = signal('');
  readonly udyamMobile = signal('');
  readonly authorised = signal(false);

  // ---- R4 ---------------------------------------------------------------
  // Held as an index, not an id. Udyam repeats UnitIdNo across units and can
  // leave it empty; matching on it lit up every unit that shared a value.
  readonly selectedPlantIndex = signal<number | null>(null);
  readonly selectedActivityIndex = signal<number | null>(null);

  /** Set when the applicant taps an activity the scheme does not cover. */
  readonly ineligible = signal<RegistrationActivity | null>(null);

  // ---- R5 ---------------------------------------------------------------
  readonly spocName = signal('');
  readonly spocDesignation = signal('');
  readonly spocMobile = signal('');
  readonly spocEmail = signal('');
  readonly attendedAwareness = signal<boolean | null>(null);
  readonly awarenessProgramId = signal('');

  // ---- R6 ---------------------------------------------------------------
  readonly otp = signal(['', '', '', '', '', '']);
  readonly resendIn = signal(0);

  // ---- R8 / R9 ----------------------------------------------------------
  readonly pledgeAccepted = signal(false);
  readonly result = signal<{ leanId: string; enterpriseName: string; spocEmail: string } | null>(null);

  readonly year = new Date().getFullYear();

  /** Shown in the footer. Bumped with each release. */
  readonly appVersion = '1.0.0';
  readonly releasedOn = '20 Aug 2026';

  readonly today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  readonly plants = computed<RegistrationPlant[]>(() => this.draft()?.plants ?? []);
  readonly activities = computed<RegistrationActivity[]>(() => this.draft()?.activities ?? []);

  readonly chosenPlant = computed(() => {
    const i = this.selectedPlantIndex();
    return i === null ? null : (this.plants()[i] ?? null);
  });

  readonly chosenActivity = computed(() => {
    const i = this.selectedActivityIndex();
    return i === null ? null : (this.activities()[i] ?? null);
  });

  /** No covered activity at all — the enterprise cannot proceed. */
  readonly noEligibleActivity = computed(
    () => this.activities().length > 0 && !this.activities().some((a) => a.isEligible),
  );

  readonly chosenProgram = computed(() =>
    this.programs().find((p) => `${p.awarenessProgramId}` === this.awarenessProgramId()) ?? null,
  );

  constructor() {
    this.api.awarenessPrograms().subscribe((p) => this.programs.set(p));
  }

  // ------------------------------------------------------------ navigation ---

  goTo(step: number): void {
    // Only backwards, and never before Udyam validation: a later step's data
    // depends on the draft the earlier one created.
    if (step < this.step() && step >= 2 && this.draft()) {
      this.step.set(step);
      this.message.set(null);
    }
  }

  back(): void {
    if (this.step() > 1) {
      this.step.set(this.step() - 1);
      this.message.set(null);
    }
  }

  private fail(text: string): void {
    this.failed.set(true);
    this.message.set(text);
  }

  private ok(text: string | null): void {
    this.failed.set(false);
    this.message.set(text);
  }

  // ------------------------------------------------------------- R1 -> R2 ---

  start(): void {
    this.ok(null);
    this.step.set(2);
  }

  signIn(): void {
    // The applicant's sign-in, not the master administration one.
    void this.router.navigate(['/msme/login']);
  }

  // ------------------------------------------------------ R2: verify Udyam ---

  verifyUdyam(): void {
    const no = this.udyamNo().trim().toUpperCase();

    if (!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(no)) {
      return this.fail('Enter the Udyam number in the form UDYAM-XX-00-0000000.');
    }

    if (!/^[6-9]\d{9}$/.test(this.udyamMobile().replace(/\D/g, '').slice(-10))) {
      return this.fail('Enter the 10-digit mobile registered against this Udyam number.');
    }

    if (!this.authorised()) {
      return this.fail('Please confirm you are authorised to register this enterprise.');
    }

    this.busy.set(true);
    this.ok(null);

    this.api
      .verifyUdyam({
        udyamRegistrationNo: no,
        mobile: this.udyamMobile().replace(/\D/g, '').slice(-10),
        authorised: true,
      })
      .subscribe({
        next: (d) => {
          this.busy.set(false);
          this.draft.set(d);

          // Nothing is pre-selected: the applicant must choose, which is what
          // "PLEASE SELECT ANY ONE PLANT LOCATION" asks for.
          this.selectedPlantIndex.set(null);
          this.selectedActivityIndex.set(null);
          this.step.set(3);
        },
        error: (r: { error?: { message?: string } }) => {
          this.busy.set(false);
          this.fail(r.error?.message ?? 'We could not verify those details. Please try again.');
        },
      });
  }

  // ------------------------------------------------- R4: unit and activity ---

  pickPlant(index: number): void {
    this.selectedPlantIndex.set(index);
    // The activity belongs to the chosen location, so changing the location
    // clears it rather than silently keeping the previous one.
    this.selectedActivityIndex.set(null);
    this.ok(null);
  }

  pickActivity(a: RegistrationActivity): void {
    if (!a.isEligible) {
      this.ineligible.set(a);
      return;
    }

    this.selectedActivityIndex.set(a.index);
    this.ok(null);
  }

  dismissIneligible(): void {
    this.ineligible.set(null);
  }

  saveUnit(): void {
    const plant = this.chosenPlant();
    const activity = this.chosenActivity();

    if (!plant) return this.fail('Select the plant location to be assessed.');
    if (!activity) return this.fail('Select the activity carried out at that location.');

    this.busy.set(true);

    this.api
      .saveUnit(this.token, {
        unitIdNo: plant.unitIdNo ?? '',
        nicFiveDigit: activity.nicFiveDigit ?? '',
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.ok(null);
          this.step.set(5);
        },
        error: (r: { error?: { message?: string; code?: string } }) => {
          this.busy.set(false);

          if (r.error?.code === 'SECTOR_NOT_ELIGIBLE') {
            this.ineligible.set(activity);
            return;
          }

          this.fail(r.error?.message ?? 'Could not save that selection.');
        },
      });
  }

  // ------------------------------------------------ R5: SPOC and awareness ---

  saveSpoc(): void {
    if (!this.spocName().trim()) return this.fail('Enter the SPOC name.');
    if (!this.spocDesignation().trim()) return this.fail('Enter the SPOC designation.');

    if (!/^[6-9]\d{9}$/.test(this.spocMobile().replace(/\D/g, '').slice(-10))) {
      return this.fail('Enter a 10-digit mobile number for the SPOC.');
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.spocEmail().trim())) {
      return this.fail('Enter a valid e-mail address — the OTP and LEAN ID go to it.');
    }

    if (this.attendedAwareness() === null) {
      return this.fail('Tell us whether an awareness programme was attended.');
    }

    if (this.attendedAwareness() && !this.awarenessProgramId()) {
      return this.fail('Select which awareness programme was attended.');
    }

    this.busy.set(true);

    this.api
      .saveSpoc(this.token, {
        fullName: this.spocName().trim(),
        designation: this.spocDesignation().trim(),
        mobile: this.spocMobile().replace(/\D/g, '').slice(-10),
        email: this.spocEmail().trim(),
        attendedAwareness: this.attendedAwareness() === true,
        awarenessProgramId: this.attendedAwareness() ? Number(this.awarenessProgramId()) : null,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.sendOtp();
        },
        error: (r: { error?: { message?: string } }) => {
          this.busy.set(false);
          this.fail(r.error?.message ?? 'Could not save the SPOC details.');
        },
      });
  }

  // ---------------------------------------------------------- R6: the OTP ---

  sendOtp(): void {
    this.busy.set(true);

    this.api.sendOtp(this.token).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.otp.set(['', '', '', '', '', '']);
        this.step.set(6);
        this.startResendTimer();
        this.ok(`A 6-digit code has been sent to ${r.sentTo}. It is valid for ${r.validForMinutes} minutes.`);
      },
      error: (r: { error?: { message?: string } }) => {
        this.busy.set(false);
        this.fail(r.error?.message ?? 'Could not send the OTP.');
      },
    });
  }

  setOtpDigit(index: number, value: string): void {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...this.otp()];
    next[index] = digit;
    this.otp.set(next);

    // Move on as the applicant types, which is what a six-box control implies.
    if (digit && index < 5) {
      const box = document.getElementById(`otp-${index + 1}`) as HTMLInputElement | null;
      box?.focus();
    }
  }

  verifyOtp(): void {
    const code = this.otp().join('');

    if (code.length !== 6) return this.fail('Enter all six digits.');

    this.busy.set(true);

    this.api.verifyOtp(this.token, code).subscribe({
      next: () => {
        this.busy.set(false);
        this.ok(null);
        this.step.set(7);
      },
      error: (r: { error?: { message?: string; attemptsLeft?: number } }) => {
        this.busy.set(false);
        const left = r.error?.attemptsLeft;
        this.fail(
          (r.error?.message ?? 'That code is not correct.') +
            (left !== undefined ? ` ${left} attempts left.` : ''),
        );
      },
    });
  }

  private startResendTimer(): void {
    this.resendIn.set(45);

    const tick = setInterval(() => {
      const left = this.resendIn() - 1;
      this.resendIn.set(left);
      if (left <= 0) clearInterval(tick);
    }, 1000);
  }

  get resendLabel(): string {
    const s = this.resendIn();
    if (s <= 0) return 'Resend OTP';
    return `Resend OTP in 00:${`${s}`.padStart(2, '0')}`;
  }

  // ---------------------------------------------------- R7 -> R8 -> R9 ---

  toPledge(): void {
    this.ok(null);
    this.step.set(8);
  }

  complete(): void {
    if (!this.pledgeAccepted()) {
      return this.fail('The LEAN Pledge must be accepted to complete registration.');
    }

    this.busy.set(true);

    this.api.complete(this.token).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.result.set(r);
        this.ok(null);
        this.step.set(9);
      },
      error: (r: { error?: { message?: string; detail?: string } }) => {
        this.busy.set(false);
        this.fail(r.error?.detail ?? r.error?.message ?? 'Could not complete the registration.');
      },
    });
  }

  copyLeanId(): void {
    const id = this.result()?.leanId;
    if (!id) return;

    void navigator.clipboard?.writeText(id);
    this.ok(`${id} copied.`);
  }

  downloadPledge(): void {
    const d = this.draft();
    const text = [
      'LEAN PLEDGE',
      '',
      `${d?.enterprise?.enterpriseName ?? ''}  ·  ${d?.udyamRegistrationNo ?? ''}`,
      this.chosenPlant()?.address ?? '',
      '',
      this.pledgeBody.join('\n\n'),
      '',
      `Accepted by ${this.spocName()}, ${this.spocDesignation()}`,
      `Date: ${this.today}`,
    ].join('\n');

    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lean-pledge-${d?.udyamRegistrationNo ?? 'draft'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** The pledge wording from R8, held here so the PDF and the screen agree. */
  readonly pledgeBody = [
    'We hereby pledge to adopt LEAN manufacturing practices in our enterprise and to work ' +
      'towards eliminating waste, improving quality and raising productivity on a continuous basis.',
    'We commit to depute our workforce for LEAN training, to implement the recommendations of ' +
      'the LEAN consultant, and to sustain the improvements achieved after certification.',
    'We further declare that the information furnished in this registration is true to the best of ' +
      'our knowledge and that we shall extend full cooperation to the implementing agency, ' +
      'consultants and assessors deputed under the MSME Competitive (LEAN) Scheme.',
  ];

  private get token(): string {
    return this.draft()?.sessionToken ?? '';
  }

  help(): void {
    this.open('https://ndie.qcin.org/contact-us/');
  }

  ministry(): void {
    this.open('https://www.msme.gov.in/');
  }

  /** The registration walkthrough. Both open in a new tab, away from the form. */
  manualVideo(): void {
    this.open('https://lean.msme.gov.in/Home/RegisteredMSME');
  }

  manualDocument(): void {
    this.open('https://lean.msme.gov.in/Home/RegisteredMSME');
  }

  private open(url: string): void {
    // noopener: these leave for another origin, and the destination must not
    // reach back into this tab through window.opener.
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
