import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { StateRef } from '../../core/models';
import { PageIntroComponent } from '../../shared/ui';

interface LevelMis {
  certificationLevelId: number;
  code: string;
  name: string;
  enrolled: number;
  handholding: number;
  assessing: number;
  certified: number;
  rejected: number;
  certificationRate: number;
}

interface StateRow {
  stateId: number;
  name: string;
  applications: number;
  certified: number;
  score: number;
}

interface Conversion {
  from: string;
  to: string;
  holders: number;
  moved: number;
  rate: number;
}

interface ReportDefinition {
  key: string;
  title: string;
  description: string;
}

interface ReportsSummary {
  mis: LevelMis[];
  statePerformance: StateRow[];
  conversions: Conversion[];
  catalogue: ReportDefinition[];
  training: { available: boolean; message: string };
}

/**
 * Reports & Analytics (artboard 8).
 *
 * The figures are what the portal holds — registrations, applications, their
 * statuses and their states. Where the artboard shows something the scheme does
 * not record yet, the panel says so rather than drawing a number nobody can
 * trace back to a record.
 *
 * The downloads are the working part of the screen: each one is a real workbook
 * built from a live query, so what is on screen and what is in the file cannot
 * disagree.
 */
@Component({
  selector: 'app-reports',
  imports: [FormsModule, DecimalPipe, PageIntroComponent],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent {
  private readonly http = inject(HttpClient);
  private readonly reference = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBase}/reports`;

  readonly data = signal<ReportsSummary | null>(null);
  readonly states = signal<StateRef[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<string | null>(null);

  readonly fromDate = signal(firstOfFinancialYear());
  readonly toDate = signal(today());
  readonly stateId = signal<number | ''>('');
  readonly levelId = signal<number | ''>('');

  // The builder's own parameters, separate from the filters above it.
  readonly buildLevels = signal<number[]>([]);
  readonly groupBy = signal('State');

  readonly canExport = this.auth.can('REPORTS', 'export');

  readonly groups = ['State', 'Level', 'Status', 'Agency'];

  constructor() {
    this.reference.states().subscribe((states) => this.states.set(states));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    const params: Record<string, string> = {
      fromDate: this.fromDate(),
      toDate: this.toDate(),
    };

    if (this.stateId() !== '') params['stateId'] = String(this.stateId());
    if (this.levelId() !== '') params['certificationLevelId'] = String(this.levelId());

    this.http.get<ReportsSummary>(`${this.base}/summary`, { params }).subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('The report data could not be loaded.');
      },
    });
  }

  /** The widest bar on the state panel, so the rest are drawn against it. */
  barWidth(row: StateRow): string {
    const top = Math.max(...(this.data()?.statePerformance ?? []).map((s) => s.score), 1);

    return `${Math.max(4, (row.score / top) * 100)}%`;
  }

  toggleLevel(id: number, on: boolean): void {
    const chosen = new Set(this.buildLevels());

    if (on) chosen.add(id);
    else chosen.delete(id);

    this.buildLevels.set([...chosen]);
  }

  /** One of the catalogue's workbooks, with the filters above it applied. */
  download(report: ReportDefinition): void {
    if (this.busy()) return;

    const params: Record<string, string> = {
      fromDate: this.fromDate(),
      toDate: this.toDate(),
    };

    if (this.stateId() !== '') params['stateId'] = String(this.stateId());
    if (this.levelId() !== '') params['certificationLevelId'] = String(this.levelId());

    this.busy.set(report.key);

    this.http
      .get(`${this.base}/export/${report.key}`, { params, responseType: 'blob' })
      .subscribe({
        next: (file) => {
          this.busy.set(null);
          this.save(file, `${report.key}.xlsx`);
        },
        error: () => {
          this.busy.set(null);
          this.error.set(`${report.title} could not be generated.`);
        },
      });
  }

  generate(): void {
    if (this.busy()) return;

    this.busy.set('custom');

    this.http
      .post(
        `${this.base}/custom`,
        {
          fromDate: this.fromDate(),
          toDate: this.toDate(),
          stateId: this.stateId() === '' ? null : Number(this.stateId()),
          levelIds: this.buildLevels(),
          groupBy: this.groupBy(),
        },
        { responseType: 'blob' },
      )
      .subscribe({
        next: (file) => {
          this.busy.set(null);
          this.save(file, `custom-report-by-${this.groupBy().toLowerCase()}.xlsx`);
        },
        error: () => {
          this.busy.set(null);
          this.error.set('The custom report could not be generated.');
        },
      });
  }

  private save(file: Blob, name: string): void {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');

    link.href = url;
    link.download = name;
    link.click();

    URL.revokeObjectURL(url);
  }
}

/** The scheme's year runs April to March, which is the range to open on. */
function firstOfFinancialYear(): string {
  const now = new Date();
  const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();

  return `${year}-04-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
