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
  readonly topStates = signal<{ name: string; certified: number; percent: number }[]>([]);
  readonly topDistricts = signal<{ name: string; state: string; certified: number }[]>([]);

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
      this.topStates.set(geo.states);
      this.topDistricts.set(geo.districts);
    });

    this.api.demographics(query).subscribe((d) => this.demographics.set(d));
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
