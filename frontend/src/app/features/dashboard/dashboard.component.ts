import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { Demographics, DemographicSlice, DistrictRef, StateRef } from '../../core/models';
import { EmptyComponent } from '../../shared/ui';
import { INDIA_STATES, INDIA_VIEWBOX, IndiaState } from './india-map';

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

  /**
   * Who brought each MSME in, from the awareness programme it attended: one
   * entry per implementing agency the scheme holds, in the order it keeps
   * them, and Self last. The API decides the list, not this card.
   */
  registrationSplit: { name: string; count: number }[];

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

  // ------------------------------------------------------------- the map ---

  readonly mapStates = INDIA_STATES;
  readonly mapViewBox = INDIA_VIEWBOX;

  /** The state under the pointer, with the figures the tooltip prints. */
  readonly hovered = signal<
    { name: string; registered: number; certified: number; x: number; y: number } | null
  >(null);

  /**
   * The map's rows, keyed by state name with case and a leading "The" set
   * aside — master.State says "The Dadra And Nagar Haveli And Daman And Diu"
   * where the boundary file says "Dadra and Nagar Haveli and Daman and Diu".
   */
  private readonly byState = computed(() => {
    const index = new Map<string, PlaceRow>();

    for (const row of this.stateRows()) index.set(mapKey(row.name), row);

    return index;
  });

  /** The largest figure on the map, which the shading is scaled against. */
  private readonly mapPeak = computed(() => {
    const key = this.rankBy();

    return Math.max(1, ...this.stateRows().map((r) => r[key]));
  });

  figuresFor(name: string): PlaceRow {
    return this.byState().get(mapKey(name)) ?? { name, registered: 0, certified: 0 };
  }

  /**
   * Five bands rather than a continuous ramp: a reader compares a shade
   * against the legend, and cannot tell 62% of a green from 68% of it.
   */
  mapFill(name: string): string {
    const value = this.figuresFor(name)[this.rankBy()];

    if (value <= 0) return MAP_SHADES[0];

    const band = Math.ceil((value / this.mapPeak()) * (MAP_SHADES.length - 1));

    return MAP_SHADES[Math.min(band, MAP_SHADES.length - 1)];
  }

  /** The legend's bands, with the range of figures each one covers. */
  readonly mapLegend = computed(() => {
    const peak = this.mapPeak();
    const steps = MAP_SHADES.length - 1;

    return MAP_SHADES.slice(1).map((shade, index) => ({
      shade,
      upper: Math.round(((index + 1) / steps) * peak),
    }));
  });

  showState(state: IndiaState, event: MouseEvent): void {
    const box = (event.currentTarget as SVGElement).ownerSVGElement?.parentElement;
    const bounds = box?.getBoundingClientRect();
    const figures = this.figuresFor(state.name);

    this.hovered.set({
      name: state.name,
      registered: figures.registered,
      certified: figures.certified,
      x: bounds ? event.clientX - bounds.left : 0,
      y: bounds ? event.clientY - bounds.top : 0,
    });
  }

  clearState(): void {
    this.hovered.set(null);
  }

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

  /**
   * A donut or bar panel as a PNG: the ring the panel draws, then its slices,
   * their counts and their share.
   */
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
      (ctx, top, width) => this.paintDonut(ctx, top, width, slices),
    );
  }

  /**
   * The panel's leaders. The API now returns every state, because the map
   * shades all of them; the list keeps to ten, which is what its heading says
   * and as many as the panel can show without scrolling past the map.
   */
  readonly rankedStates = computed(() => this.rank(this.stateRows()).slice(0, 10));
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
      // The chart takes the leaders only. Six hundred districts do not make a
      // bar chart, and the table below carries every one of them anyway.
      (ctx, top, width) => this.paintBars(ctx, top, width, rows.slice(0, 10)),
    );
  }

  /**
   * Paints a titled table onto a canvas and hands it over as a PNG.
   *
   * Drawn from the data rather than screenshotting the DOM: capturing rendered
   * HTML needs a library that ships a whole layout engine, and what is wanted
   * is a clean table of numbers the component already holds.
   */
  private paint(
    title: string,
    headers: string[],
    rows: string[][],
    caption: string,
    chart?: (ctx: CanvasRenderingContext2D | null, top: number, width: number) => number,
  ): void {
    const rowHeight = 30;
    const titleHeight = 96;
    const width = 720;

    // The chart is measured before anything is drawn, because the canvas has
    // to be sized before it can be painted on — so each painter reports the
    // height it will take when handed a null context.
    const chartHeight = chart ? chart(MEASURE, titleHeight, width) : 0;
    const headerHeight = titleHeight + chartHeight;
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

    if (chart) chart(ctx, titleHeight, width);

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
   * The panel's donut, painted arc by arc in the same order and the same
   * colours the screen draws it, with the total in the middle and the legend
   * beside it — so the exported image is the panel, not a bare table.
   */
  private paintDonut(
    ctx: CanvasRenderingContext2D | null,
    top: number,
    width: number,
    slices: { label: string; count: number; percent: number }[],
  ): number {
    const size = 150;
    const height = Math.max(size + 24, slices.length * 24 + 40);

    if (!ctx) return height;

    const cx = 110;
    const cy = top + size / 2;
    const radius = 56;
    const total = slices.reduce((sum, s) => sum + s.count, 0);

    ctx.lineWidth = 24;
    ctx.strokeStyle = '#EDF2EF';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    let from = -Math.PI / 2;

    slices.forEach((slice, index) => {
      if (slice.count <= 0 || total <= 0) return;

      const sweep = (slice.count / total) * Math.PI * 2;

      ctx.strokeStyle = DONUT_COLOURS[index % DONUT_COLOURS.length];
      ctx.beginPath();
      ctx.arc(cx, cy, radius, from, from + sweep);
      ctx.stroke();
      from += sweep;
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#5D6B62';
    ctx.font = '600 10px "Segoe UI", Inter, system-ui, sans-serif';
    ctx.fillText('TOTAL', cx, cy - 4);
    ctx.fillStyle = '#16211A';
    ctx.font = '600 20px "Segoe UI", Inter, system-ui, sans-serif';
    ctx.fillText(total.toLocaleString('en-IN'), cx, cy + 18);
    ctx.textAlign = 'left';

    slices.forEach((slice, index) => {
      const y = top + 26 + index * 24;

      ctx.fillStyle = DONUT_COLOURS[index % DONUT_COLOURS.length];
      ctx.beginPath();
      ctx.arc(232, y - 4, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#16211A';
      ctx.font = '13px "Segoe UI", Inter, system-ui, sans-serif';
      ctx.fillText(slice.label, 248, y);

      ctx.fillStyle = '#47554C';
      ctx.fillText(slice.count.toLocaleString('en-IN'), 470, y);

      ctx.fillStyle = '#0F7B45';
      ctx.font = '600 13px "Segoe UI", Inter, system-ui, sans-serif';
      ctx.fillText(`${slice.percent}%`, 600, y);
    });

    return height;
  }

  /**
   * The leaders as paired bars — registered above certified, in that order,
   * which is the order every panel on this dashboard reads in.
   */
  private paintBars(
    ctx: CanvasRenderingContext2D | null,
    top: number,
    width: number,
    rows: PlaceRow[],
  ): number {
    const bandHeight = 34;
    const height = rows.length * bandHeight + 46;

    if (!ctx) return height;

    const left = 168;
    const right = width - 76;
    const span = right - left;
    const peak = Math.max(1, ...rows.map((r) => Math.max(r.registered, r.certified)));

    ctx.fillStyle = '#5D6B62';
    ctx.font = '600 11px "Segoe UI", Inter, system-ui, sans-serif';
    ctx.fillText('REGISTERED', left, top + 12);
    ctx.fillStyle = '#0F7B45';
    ctx.fillText('CERTIFIED', left + 96, top + 12);

    rows.forEach((row, index) => {
      const y = top + 26 + index * bandHeight;
      const label = row.state ? `${row.name}, ${row.state}` : row.name;

      ctx.fillStyle = '#16211A';
      ctx.font = '12px "Segoe UI", Inter, system-ui, sans-serif';
      ctx.fillText(trim(label, 24), 28, y + 12);

      ctx.fillStyle = '#9DD1B7';
      ctx.fillRect(left, y + 1, (row.registered / peak) * span, 10);

      ctx.fillStyle = '#0F7B45';
      ctx.fillRect(left, y + 15, (row.certified / peak) * span, 10);

      ctx.fillStyle = '#47554C';
      ctx.font = '11px "Segoe UI", Inter, system-ui, sans-serif';
      ctx.fillText(row.registered.toLocaleString('en-IN'), right + 8, y + 10);
      ctx.fillStyle = '#0F7B45';
      ctx.fillText(row.certified.toLocaleString('en-IN'), right + 8, y + 24);
    });

    return height;
  }

  /**
   * The headline card's three-way split.
   *
   * The agencies whose awareness programmes brought the MSME in, then Self for
   * an applicant who attended none. Enterprises registered before the question
   * was asked carry no attribution: they are in the card's total but on none of
   * these figures, rather than folded into Self, which would say something
   * untrue about them.
   */
  registrationLine(): string {
    const split = this.counts()?.registrationSplit ?? [];

    return split
      .map((entry) => `${entry.name}: ${entry.count.toLocaleString('en-IN')}`)
      .join('  |  ');
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

/**
 * The map's five bands: unshaded for a state with none, then the portal green
 * deepening to the accent. Light enough at the bottom that the boundaries
 * still read against the card.
 */
const MAP_SHADES = ['#EEF3F0', '#CDE7D9', '#9DD1B7', '#5CB48D', '#0F7B45'];

/**
 * Handed to a chart painter when the caller only wants its height. A painter
 * takes a nullable context and draws nothing when it is null, so measuring and
 * painting are the same code and cannot drift apart.
 */
const MEASURE: CanvasRenderingContext2D | null = null;

/** A long district name, cut to fit the label column. */
function trim(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Case, punctuation and a leading "The" set aside, for matching state names. */
function mapKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z]/g, '');
}

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
