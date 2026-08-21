import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { Demographics, DemographicSlice, DistrictRef, StateRef } from '../../core/models';
import { EmptyComponent } from '../../shared/ui';

interface DashboardCounts {
  totalApplications: number;
  registered: number;
  paymentReceived: number;
  handholdingInProgress: number;
  handholdingCompleted: number;
  assessmentScheduled: number;
  assessmentInProgress: number;
  ncRaised: number;
  qualityCheck: number;
  certified: number;
  rejected: number;
  certifiedBronze: number;
  certifiedSilver: number;
  certifiedGold: number;
  registeredLast30Days: number;
  agencies: AgencySplit[];
  levelAgencies: LevelAgencySplit[];

  /** Who brought each MSME in, from the awareness programme it attended. */
  registrationSplit: {
    qci: number;
    npc: number;
    self: number;
    unattributed: number;
  };

  subsidyDisbursed: number;
}

/** A state or a district, with both figures the panels can rank by. */
interface PlaceRow {
  name: string;
  state?: string;
  registered: number;
  certified: number;
}

interface AgencySplit {
  name: string;
  registered: number;
  certified: number;
  paymentReceived: number;
  inProgress: number;
}

interface LevelAgencySplit {
  certificationLevelId: number;
  name: string;
  applied: number;
  certified: number;
  inProgress: number;
}

/**
 * Dashboard (1-Dashboard.svg and 1-Dashboard-no-data.svg).
 *
 * The filter bar, the four KPI cards and the three certification-level cards,
 * driven by /api/applications/dashboard. When the scheme has no applications
 * yet the whole thing collapses to the no-data variant rather than printing a
 * wall of zeroes, which is what the second artboard shows.
 */
@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, DecimalPipe, EmptyComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly api = inject(ApiService);

  readonly counts = signal<DashboardCounts | null>(null);
  readonly states = signal<StateRef[]>([]);
  readonly loading = signal(true);

  // The geography panel: certified MSMEs by state and by district, which the
  // API aggregates rather than the browser — there are 700-odd districts.
  // Named apart from the filter dropdowns' own states/districts: these are the
  // panels' rows, with counts, not the reference lists.
  readonly stateRows = signal<PlaceRow[]>([]);
  readonly districtRows = signal<PlaceRow[]>([]);

  /** Which figure the two geography panels are ranked by. */
  readonly rankBy = signal<'certified' | 'registered'>('certified');

  // Each demographic panel carries its own switch, so the three are read
  // independently. Both readings are fetched together and held here, which
  // makes a switch instant and costs one extra call on load rather than one on
  // every toggle.
  readonly demoRegistered = signal<Demographics | null>(null);
  readonly demoCertified = signal<Demographics | null>(null);

  readonly genderBasis = signal<'registered' | 'certified'>('registered');
  readonly typeBasis = signal<'registered' | 'certified'>('registered');
  readonly socialBasis = signal<'registered' | 'certified'>('registered');

  readonly demographics = signal<Demographics | null>(null);

  readonly districts = signal<DistrictRef[]>([]);
  readonly levels = signal<{ id: number; name: string }[]>([]);
  readonly agencies = signal<{ id: number; name: string }[]>([]);

  // Defaults match the design: the current Indian financial year to date.
  readonly periodFrom = signal(financialYearStart());
  readonly periodTo = signal(today());
  readonly stateId = signal('');
  readonly districtId = signal('');
  readonly level = signal('');
  readonly agency = signal('');

  readonly hasData = computed(() => (this.counts()?.totalApplications ?? 0) > 0);

  /**
   * The three certification-level cards.
   *
   * Each carries the artboard's own accent (Bronze #C2410C, Silver #5D6B62,
   * Gold #A16207), used for the 3 px top rule, the 11 px bullet and the
   * progress ring, plus its Agency Breakdown rows.
   */
  readonly levelCards = computed(() => {
    const c = this.counts();
    if (!c) return [];

    const levels = [
      { id: 1, name: 'LEAN Bronze', accent: '#C2410C', certified: c.certifiedBronze },
      { id: 2, name: 'LEAN Silver', accent: '#5D6B62', certified: c.certifiedSilver },
      { id: 3, name: 'LEAN Gold', accent: '#A16207', certified: c.certifiedGold },
    ];

    return levels.map((level) => {
      const rows = (c.levelAgencies ?? []).filter(
        (a) => a.certificationLevelId === level.id,
      );

      const applied = rows.reduce((sum, r) => sum + r.applied, 0) || c.totalApplications;
      const inProgress = rows.reduce((sum, r) => sum + r.inProgress, 0);
      const percent = applied > 0 ? Math.round((level.certified / applied) * 100) : 0;

      return {
        ...level,
        applied,
        inProgress,
        percent,
        // r=18.5 on the artboard, drawn on a 44-unit box.
        dash: `${(percent / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`,
        agencies: rows,
      };
    });
  });

  /** "QCI: 11,250 | NPC: 8,770" under each KPI card. */
  /** The reading a panel is showing, by its own switch. */
  demoFor(basis: 'registered' | 'certified'): Demographics | null {
    return basis === 'certified' ? this.demoCertified() : this.demoRegistered();
  }

  caption(basis: 'registered' | 'certified'): string {
    return basis === 'certified' ? 'Certified MSMEs' : 'Registered MSMEs';
  }

  /** A donut or bar panel as a PNG: its slices, their counts and their share. */
  exportSlices(
    title: string,
    basis: 'registered' | 'certified',
    slices: { label: string; count: number; percent: number }[],
  ): void {
    if (slices.length === 0) return;

    this.paint(
      title,
      ['Category', 'MSMEs', 'Share'],
      slices.map((s) => [s.label, s.count.toLocaleString('en-IN'), `${s.percent}%`]),
      `${this.caption(basis)} · ${new Date().toLocaleDateString('en-IN')}`,
    );
  }

  readonly rankedStates = computed(() => this.rank(this.stateRows()));
  readonly rankedDistricts = computed(() => this.rank(this.districtRows()));

  /** The state the districts are narrowed to, when one is chosen. */
  districtScope(): string | null {
    const chosen = this.states().find((s) => s.stateId === Number(this.stateId()));

    return chosen?.name ?? null;
  }

  private rank(rows: PlaceRow[]): PlaceRow[] {
    const key = this.rankBy();

    return [...rows].sort((a, b) => b[key] - a[key] || b.certified - a.certified);
  }

  /**
   * The panel as a PNG the reader can paste into a note.
   *
   * Painted from the data onto a canvas rather than screenshotting the DOM:
   * capturing rendered HTML needs a library that ships a whole layout engine,
   * and what is wanted here is a clean table of the same numbers — which the
   * component already holds.
   */
  exportPlaces(title: string, firstColumn: string, rows: PlaceRow[]): void {
    if (rows.length === 0) return;

    this.paint(
      title,
      [firstColumn, 'Registered', 'Certified'],
      rows.map((r) => [
        r.state ? `${r.name}, ${r.state}` : r.name,
        r.registered.toLocaleString('en-IN'),
        r.certified.toLocaleString('en-IN'),
      ]),
      `Ranked by ${this.rankBy()} · ${new Date().toLocaleDateString('en-IN')}`,
    );
  }

  /**
   * Paints a titled table onto a canvas and hands it over as a PNG.
   *
   * Drawn from the data rather than screenshotting the DOM: capturing rendered
   * HTML needs a library that ships a whole layout engine, and what is wanted
   * is a clean table of numbers the component already holds.
   */
  private paint(title: string, headers: string[], rows: string[][], caption: string): void {
    const rowHeight = 30;
    const headerHeight = 96;
    const width = 720;
    const height = headerHeight + (rows.length + 1) * rowHeight + 34;

    const canvas = document.createElement('canvas');
    const scale = 2;  // so the text is not soft on a high-density screen

    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#0f7b45';
    ctx.fillRect(0, 0, width, 4);

    ctx.fillStyle = '#16211a';
    ctx.font = '600 19px "Segoe UI", Inter, system-ui, sans-serif';
    ctx.fillText(title, 28, 44);

    ctx.fillStyle = '#5d6b62';
    ctx.font = '12px "Segoe UI", Inter, system-ui, sans-serif';
    ctx.fillText(`MSME Competitive (LEAN) Scheme · ${caption}`, 28, 66);

    const columns = [28, 470, 600];

    ctx.fillStyle = '#f7faf8';
    ctx.fillRect(20, headerHeight - 20, width - 40, rowHeight);

    ctx.fillStyle = '#5d6b62';
    ctx.font = '600 12px "Segoe UI", Inter, system-ui, sans-serif';
    headers.forEach((header, index) => ctx.fillText(header, columns[index], headerHeight));

    rows.forEach((row, index) => {
      const y = headerHeight + (index + 1) * rowHeight;

      if (index % 2 === 1) {
        ctx.fillStyle = '#fafcfb';
        ctx.fillRect(20, y - 20, width - 40, rowHeight);
      }

      ctx.fillStyle = '#16211a';
      ctx.font = '13px "Segoe UI", Inter, system-ui, sans-serif';
      ctx.fillText(row[0], columns[0], y);

      ctx.fillStyle = '#47554c';
      ctx.fillText(row[1] ?? '', columns[1], y);

      ctx.fillStyle = '#0f7b45';
      ctx.font = '600 13px "Segoe UI", Inter, system-ui, sans-serif';
      ctx.fillText(row[2] ?? '', columns[2], y);
    });

    canvas.toBlob((blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `${title.toLowerCase().replace(/[^a-z]+/g, '-')}.png`;
      link.click();

      URL.revokeObjectURL(url);
    });
  }

  /**
   * The headline card's three-way split.
   *
   * QCI and NPC are the agencies whose awareness programmes brought the MSME
   * in; Self is an applicant who attended none. Enterprises registered before
   * the question was asked are counted in the total but named separately rather
   * than folded into Self, which would say something untrue about them.
   */
  registrationLine(): string {
    const split = this.counts()?.registrationSplit;

    if (!split) return '';

    const parts = [
      `QCI: ${split.qci.toLocaleString('en-IN')}`,
      `NPC: ${split.npc.toLocaleString('en-IN')}`,
      `Self: ${split.self.toLocaleString('en-IN')}`,
    ];

    if (split.unattributed > 0) {
      parts.push(`Not recorded: ${split.unattributed.toLocaleString('en-IN')}`);
    }

    return parts.join('  |  ');
  }

  /** Sanctioned support, in crore, as the card prints it. */
  subsidyCrore(): number {
    return (this.counts()?.subsidyDisbursed ?? 0) / 10_000_000;
  }

  agencyLine(metric: 'registered' | 'certified' | 'paymentReceived' | 'inProgress'): string {
    const rows = this.counts()?.agencies ?? [];
    if (rows.length === 0) return '';

    return rows.map((a) => `${a.name}: ${a[metric].toLocaleString('en-IN')}`).join('  |  ');
  }

  constructor() {
    this.api.states().subscribe((states) => this.states.set(states));

    this.api.dashboardFilters().subscribe((f) => {
      this.levels.set(f.certificationLevels);
      this.agencies.set(f.implementingAgencies);
    });

    this.load();
  }

  /** Every filter feeds both the tiles and the geography panel, so they agree. */
  private filters(): Record<string, unknown> {
    return {
      fromDate: this.periodFrom(),
      toDate: this.periodTo(),
      stateId: this.stateId(),
      districtId: this.districtId(),
      certificationLevelId: this.level(),
      implementingAgencyId: this.agency(),
    };
  }

  load(): void {
    this.loading.set(true);
    const query = this.filters();

    this.api.dashboard(query).subscribe({
      next: (result) => {
        this.counts.set(result as unknown as DashboardCounts);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.api.geography(query).subscribe((geo) => {
      this.stateRows.set(geo.states);
      this.districtRows.set(geo.districts);
    });

    // Both readings, so each panel's switch is instant.
    this.api.demographics({ ...query, basis: 'registered' }).subscribe((d) => {
      this.demoRegistered.set(d);
      this.demographics.set(d);   // the NIC panel reads the registered view
    });

    this.api.demographics({ ...query, basis: 'certified' }).subscribe((d) => this.demoCertified.set(d));
  }

  /**
   * Turns a set of slices into stroke-dasharray offsets for a donut.
   *
   * The ring is drawn as one circle per slice, each dashed to its own arc and
   * rotated to start where the previous ended — cheaper and sharper than
   * generating arc paths, and it scales with the SVG.
   */
  donutSegments(slices: DemographicSlice[]): {
    label: string;
    colour: string;
    dash: string;
    offset: number;
  }[] {
    const circumference = 2 * Math.PI * 54;
    let consumed = 0;

    return slices.map((slice, index) => {
      const length = (slice.percent / 100) * circumference;
      const segment = {
        label: slice.label,
        colour: DONUT_COLOURS[index % DONUT_COLOURS.length],
        dash: `${length} ${circumference - length}`,
        offset: -consumed,
      };
      consumed += length;
      return segment;
    });
  }

  colourFor(index: number): string {
    return DONUT_COLOURS[index % DONUT_COLOURS.length];
  }

  /** Districts depend on the chosen state, so they are fetched on change. */
  onStateChange(value: string): void {
    this.stateId.set(value);
    this.districtId.set('');
    this.districts.set([]);

    if (value) {
      this.api.districts(Number(value)).subscribe((d) => this.districts.set(d));
    }

    this.load();
  }

  resetFilters(): void {
    this.periodFrom.set(financialYearStart());
    this.periodTo.set(today());
    this.stateId.set('');
    this.districtId.set('');
    this.districts.set([]);
    this.level.set('');
    this.agency.set('');
    this.load();
  }
}

// The progress ring is r=18.5 with a 5-unit stroke on the artboard.
const RING_RADIUS = 18.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Green, blue, amber — the three accents the deck uses for categorical splits.
const DONUT_COLOURS = ['#0F7B45', '#1B4F8A', '#A16207', '#C2410C', '#5D6B62'];

/** The Indian financial year runs April to March. */
function financialYearStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  return `${year}-04-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
