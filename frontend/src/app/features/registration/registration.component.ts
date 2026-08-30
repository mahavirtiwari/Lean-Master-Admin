import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { RegistrationService } from './registration.service';
import {
  ApplicantDocument,
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
  /**
   * Keeps a numeric field numeric and capped as it is typed.
   *
   * maxlength alone does not stop a paste of non-digits, and the fields were
   * accepting any length — an 18-digit mobile number reached the server and
   * only failed there.
   */
  digitsOnly(value: string, max: number): string {
    return value.replace(/\D+/g, '').slice(0, max);
  }

  /**
   * The guides offered on R1. Empty until the admin module publishes a
   * document to the MSME Enterprise audience, in which case the block simply
   * does not render — better than a link to a manual that does not exist.
   */
  readonly guides = signal<ApplicantDocument[]>([]);

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

  /**
   * Validation failures are shown as a dialog rather than as a line above the
   * form: on the longer steps the notice sat off-screen, so a rejected submit
   * looked like nothing had happened.
   */
  readonly dialog = signal<{ title: string; text: string } | null>(null);

  /**
   * R7's confirmation. The pledge PDF is generated from exactly what the
   * summary shows, so the applicant states that it is right rather than being
   * advised to check it.
   */
  readonly summaryConfirmed = signal(false);

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

  /**
   * The Implementing Agency the applicant is working with.
   *
   * Named here rather than assigned later by an administrator: the applicant
   * already knows, and the choice is what decides whose caseload this becomes.
   */
  readonly agencies = signal<{ organisationId: number; name: string; scope: string | null }[]>([]);
  readonly implementingAgencyId = signal<string | number>('');

  // ---- R6 ---------------------------------------------------------------
  readonly otp = signal(['', '', '', '', '', '']);
  readonly resendIn = signal(0);

  // ---- R8 / R9 ----------------------------------------------------------

  /**
   * Whether the whole pledge has gone past the reader.
   *
   * The pledge is an undertaking about regulatory compliance, and it is taken
   * rather than ticked: the text carries itself through its frame, and the
   * button that makes it opens only once the end has been reached. Reading
   * ahead by hand counts too — the point is that the whole text was shown, not
   * that anybody was made to wait.
   */
  readonly pledgeRead = signal(false);

  private readonly pledgeBox = viewChild<ElementRef<HTMLElement>>('pledgeBox');

  /**
   * How fast the pledge rises through its frame, in pixels a millisecond.
   *
   * Speed rather than duration, because the distance varies enormously: the
   * same words are a few dozen pixels taller than the frame on a wide screen
   * and several hundred on a phone. A fixed duration made the wide case creep
   * imperceptibly and the narrow case race.
   */
  private static readonly CrawlPxPerMs = 0.055;

  /** Never faster than this, so short text still reads as moving. */
  private static readonly CrawlMinMs = 3_000;

  /** Never slower than this, so long text does not become a wait. */
  private static readonly CrawlMaxMs = 12_000;

  private crawl = 0;

  /** The frame the running crawl belongs to, so a re-run does not restart it. */
  private crawlFor: HTMLElement | null = null;
  /**
   * Field-level validity for R5. The submit path already rejected a bad mobile
   * or e-mail, but only after the round trip and only as one banner — these
   * mark the offending field as it is typed.
   *
   * Empty is not "invalid" here: a field the applicant has not reached yet
   * should not be shouting at them. Required-ness is enforced on submit.
   */
  readonly mobileError = computed(() => {
    const value = this.spocMobile();
    if (!value) return null;
    if (value.length < 10) return 'Enter all 10 digits.';
    // India's mobile numbering plan: ten digits opening 6-9.
    return /^[6-9]\d{9}$/.test(value) ? null : 'A mobile number starts with 6, 7, 8 or 9.';
  });

  readonly emailError = computed(() => {
    const value = this.spocEmail().trim();
    if (!value) return null;
    return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value) ? null : 'Enter a valid e-mail address.';
  });

  // ----------------------------------------------------- programme picker ---
  // The list comes from the API; it is filtered here rather than server-side
  // because it is small and the applicant is matching against a code they are
  // reading off a certificate.
  readonly programQuery = signal('');
  readonly programOpen = signal(false);

  readonly filteredPrograms = computed(() => {
    const q = this.programQuery().trim().toLowerCase();
    const all = this.programs();
    if (!q) return all;

    return all.filter((p) =>
      [p.programCode, p.venue, p.name, p.heldOn]
        .some((field) => (field ?? '').toLowerCase().includes(q)),
    );
  });

  /** What the closed control shows once a programme is chosen. */
  readonly selectedProgram = computed(() =>
    this.programs().find((p) => String(p.awarenessProgramId) === this.awarenessProgramId()) ?? null,
  );

  /** "LAP-27-202508-001 — MCCIA, Pune" — the ID and the venue address. */
  programLabel(p: { programCode: string | null; awarenessProgramId: number; venue: string | null }): string {
    const id = p.programCode || `AP-${p.awarenessProgramId}`;
    return p.venue ? `${id} — ${p.venue}` : id;
  }

  chooseProgram(id: number): void {
    this.awarenessProgramId.set(String(id));
    this.programOpen.set(false);
    this.programQuery.set('');
  }

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
    // The pledge moves whenever its step is on screen — including on the way
    // back from a later step, which is a different frame from the one the
    // first crawl was given. Leaving the step stops it: a stray animation
    // frame on a detached element is a leak.
    effect(() => {
      const box = this.pledgeBox()?.nativeElement ?? null;
      const onPledgeStep = this.step() === 8;

      untracked(() => {
        if (!onPledgeStep || !box) {
          cancelAnimationFrame(this.crawl);
          this.crawlFor = null;
          return;
        }

        if (this.crawlFor === box) return;

        this.crawlFor = box;
        this.startCrawl(box);
      });
    });

    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.crawl));

    this.api.applicantDocuments().subscribe({
      next: (docs) => this.guides.set(docs),
      // A missing guide must not stop somebody registering.
      error: () => this.guides.set([]),
    });

    this.api.awarenessPrograms().subscribe((p) => this.programs.set(p));

    // Anonymous, like the rest of registration — the applicant has no account
    // yet, and the list is public information.
    this.api.implementingAgencies().subscribe({
      next: (a) => this.agencies.set(a ?? []),
      error: () => this.agencies.set([]),
    });
  }

  // ------------------------------------------------------------ navigation ---

  goTo(step: number): void {
    // Only backwards, and never before Udyam validation: a later step's data
    // depends on the draft the earlier one created.
    if (step < this.step() && step >= 2 && this.draft()) {
      this.step.set(step);
      this.message.set(null);
      this.dialog.set(null);
    }
  }

  back(): void {
    if (this.step() > 1) {
      this.step.set(this.step() - 1);
      this.message.set(null);
      this.dialog.set(null);
    }
  }

  /**
   * A message fit to show an applicant.
   *
   * ProblemDetails.Detail carries the exception dump outside production, and
   * the completion handler read it first — so an unhandled database error put
   * a full EF stack trace, file paths and all, into the applicant's dialog.
   * Detail is only used when it reads like a sentence written for a person.
   */
  private humanError(error: unknown, fallback: string): string {
    const body = (error ?? {}) as { message?: unknown; detail?: unknown };

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message) return message;

    const detail = typeof body.detail === 'string' ? body.detail.trim() : '';
    const isDump =
      detail.includes('\n') ||
      detail.includes('Exception') ||
      / at [A-Z]/.test(detail);

    return detail && !isDump && detail.length <= 400 ? detail : fallback;
  }

  private fail(text: string, title = 'Please check'): void {
    this.failed.set(true);
    this.message.set(text);
    this.dialog.set({ title, text });
  }

  closeDialog(): void {
    this.dialog.set(null);
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
    const plant = this.plants().find((p) => p.index === index);

    // The server rejects it too; this is so the applicant is told at the tap
    // rather than after filling in the SPOC details.
    if (plant?.isRegistered) {
      this.fail(
        `${plant.unitName ?? 'That plant'} is already registered under ${plant.registeredLeanId}. ` +
          'Choose another plant, or sign in with that LEAN ID.',
        'Plant already registered',
      );
      return;
    }

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
        plantIdNo: plant.plantIdNo,
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

    if (!this.implementingAgencyId()) {
      return this.fail('Select the implementing agency you are working with.');
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
        implementingAgencyOrgId: Number(this.implementingAgencyId()),
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
    if (!this.summaryConfirmed()) {
      this.fail(
        'Confirm that the details above are correct before proceeding to the pledge.',
        'Please confirm',
      );
      return;
    }

    this.ok(null);
    this.step.set(8);
  }

  /**
   * Carries the pledge through its frame.
   *
   * A pledge short enough not to scroll — a tall window, a large screen — has
   * been read as soon as it is shown: there is nothing to carry, and waiting
   * for a scroll that cannot happen would leave the button shut for good.
   */
  private startCrawl(box: HTMLElement): void {
    cancelAnimationFrame(this.crawl);

    const range = box.scrollHeight - box.clientHeight;

    if (range <= 4) {
      this.pledgeRead.set(true);
      return;
    }

    // Somebody who has asked for less motion gets none. The pledge sits still
    // and is read by scrolling, which opens the button just the same.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const duration = Math.min(
      Math.max(range / RegistrationComponent.CrawlPxPerMs, RegistrationComponent.CrawlMinMs),
      RegistrationComponent.CrawlMaxMs,
    );

    const perMs = range / duration;

    // The end tolerance has to scale with the distance: four pixels is nothing
    // across a phone's worth of text and a third of the way across a wide
    // screen's, where it would stop the pledge before it finished.
    const tolerance = Math.min(4, range * 0.05);

    // The position is kept here rather than read back off the element. A frame
    // advances it by a third of a pixel, and scrollTop rounds what it is given
    // to whole device pixels — so writing the fraction back and reading it
    // again would discard the movement every frame, and the pledge would sit
    // at zero for ever.
    let position = box.scrollTop;
    let written = position;
    let previous = 0;

    const step = (now: number): void => {
      // The frame is gone once the step changes; stop rather than scroll a
      // node that is no longer on the page.
      if (!box.isConnected) return;

      // Animation frames stop while the tab is in the background. Without a
      // ceiling, coming back after a minute away would advance the pledge to
      // the end in one jump and open the button on text nobody saw.
      const elapsed = previous ? Math.min(now - previous, 250) : 0;
      previous = now;

      // A reader scrolling by hand takes over from here.
      if (Math.abs(box.scrollTop - written) > 1) position = box.scrollTop;

      position += perMs * elapsed;
      box.scrollTop = position;
      written = box.scrollTop;

      if (position + box.clientHeight >= box.scrollHeight - tolerance) {
        this.pledgeRead.set(true);
        return;
      }

      this.crawl = requestAnimationFrame(step);
    };

    this.crawl = requestAnimationFrame(step);
  }

  /** Watches the pledge frame for the reader reaching the bottom. */
  onPledgeScroll(event: Event): void {
    const box = event.target as HTMLElement;

    // A few pixels of tolerance: fractional scroll heights on scaled displays
    // mean scrollTop + clientHeight rarely lands exactly on scrollHeight.
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) {
      this.pledgeRead.set(true);
    }
  }

  complete(): void {
    if (!this.pledgeRead()) {
      return this.fail('Please let the pledge finish before pledging.');
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
        this.fail(this.humanError(r.error, 'Could not complete the registration.'));
      },
    });
  }

  copyLeanId(): void {
    const id = this.result()?.leanId;
    if (!id) return;

    void navigator.clipboard?.writeText(id);
    this.ok(`${id} copied.`);
  }

  /**
   * The pledge certificate.
   *
   * Generated by the server on request and streamed back; nothing is kept on
   * either side. The applicant can take a copy before accepting and again from
   * the completion screen, and both come from the same registration.
   */
  downloadPledge(): void {
    if (!this.token || this.downloading()) return;

    this.downloading.set(true);

    this.api.pledgeCertificate(this.token).subscribe({
      next: (pdf) => {
        this.downloading.set(false);
        this.save(pdf, `lean-pledge-${this.draft()?.udyamRegistrationNo ?? 'certificate'}.pdf`);
      },
      error: () => {
        this.downloading.set(false);
        this.fail('The pledge certificate could not be prepared. Please try again.');
      },
    });
  }

  readonly downloading = signal(false);

  private save(file: Blob, name: string): void {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');

    link.href = url;
    link.download = name;
    link.click();

    URL.revokeObjectURL(url);
  }

  /**
   * The pledge wording, as supplied by the Ministry.
   *
   * Held verbatim: it is an undertaking the applicant is asked to make, so it
   * is not paraphrased, re-wrapped or shortened for the screen.
   */
  readonly pledgeBody = [
    'I/We understand that the MSME Competitive (Lean) Scheme is voluntary and recognize the ' +
      'authority of the Ministry of MSME, Government of India, in issuance of any Level.',
    'I/We hereby give our commitment to complete the entire Lean Scheme journey as per the ' +
      'guidelines. By proceeding I/We certify that my/our Enterprise/Unit complies with & ' +
      'fulfils all relevant & applicable regulatory & statutory norms/licenses pertaining to ' +
      'the functioning of this manufacturing unit. If not, then efforts will be taken to fulfil ' +
      'those regulatory/statutory requirements by me/us. If at any stage the Enterprise/Unit is ' +
      'found to be non-compliant with any relevant/applicable regulatory & statutory norms, the ' +
      'competent authority will have the right to recall/withdraw any or all reports or Level Issued.',
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
