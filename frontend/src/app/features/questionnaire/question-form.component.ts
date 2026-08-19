import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { Parameter, Sector } from '../../core/models';

interface Checkpoint {
  text: string;
  evidence: string;
  kpi: string;
  unit: string;
  frequency: string;
  response: string;
}

interface Requirement {
  title: string;
  narrative: string;
  bullets: string[];
  purpose: string;
  benefits: string;
  checkpoints: Checkpoint[];
}

/**
 * Create New Question — 6-green.svg (Single Question) and 7-green.svg (Bulk
 * Upload via Excel), which are two tabs of one screen.
 *
 * A "question" is a parameter's requirement plus its checkpoints, which is
 * exactly the shape assess.Requirement / assess.Checkpoint already have — the
 * form builds that tree rather than a flat question record.
 */
@Component({
  selector: 'app-question-form',
  imports: [],
  templateUrl: './question-form.component.html',
  styleUrl: './question-form.component.scss',
})
export class QuestionFormComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  /** 'silver' or 'gold', from /questionnaire/:level/new. */
  readonly level = input<string>('silver');

  readonly tab = signal<'single' | 'bulk'>('single');

  readonly sectors = signal<Sector[]>([]);
  readonly parameters = signal<Parameter[]>([]);

  readonly sectorId = signal<string>('');
  readonly parameterId = signal<string>('');

  /**
   * Computed, not set in the constructor: a route input is not bound yet when
   * the constructor runs, so the Gold form would show the Silver prefix.
   * The real id is issued by the server on save.
   */
  readonly questionId = computed(
    () => `Q-${this.level().charAt(0).toUpperCase()}-NEW`,
  );

  readonly message = signal<string | null>(null);
  readonly failed = signal(false);

  readonly levelName = computed(() =>
    this.level().toLowerCase() === 'gold' ? 'LEAN Gold' : 'LEAN Silver',
  );

  /** Two requirements, as the artboard shows, each with its own checkpoints. */
  readonly requirements = signal<Requirement[]>([blankRequirement()]);

  readonly checkpointCount = computed(() =>
    this.requirements().reduce((sum, r) => sum + r.checkpoints.length, 0),
  );

  readonly responses = ['Yes', 'Partial', 'No'];
  readonly frequencies = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Half-yearly', 'Annually'];

  /** Recent bulk uploads, as drawn on 7-green. */
  readonly recentUploads = signal<
    { fileName: string; uploadedOn: string; questions: number; status: string }[]
  >([]);

  constructor() {
    this.api.sectors({ pageSize: 200 }).subscribe((r) => this.sectors.set(r.items));
    this.api.parameters({ pageSize: 200 }).subscribe((r) => this.parameters.set(r.items));
  }

  // ------------------------------------------------------- requirements ---

  addRequirement(): void {
    this.requirements.set([...this.requirements(), blankRequirement()]);
  }

  removeRequirement(index: number): void {
    const list = [...this.requirements()];
    list.splice(index, 1);
    this.requirements.set(list.length ? list : [blankRequirement()]);
  }

  patchRequirement(index: number, patch: Partial<Requirement>): void {
    const list = [...this.requirements()];
    list[index] = { ...list[index], ...patch };
    this.requirements.set(list);
  }

  addBullet(index: number): void {
    const req = this.requirements()[index];
    this.patchRequirement(index, { bullets: [...req.bullets, ''] });
  }

  setBullet(reqIndex: number, bulletIndex: number, value: string): void {
    const bullets = [...this.requirements()[reqIndex].bullets];
    bullets[bulletIndex] = value;
    this.patchRequirement(reqIndex, { bullets });
  }

  removeBullet(reqIndex: number, bulletIndex: number): void {
    const bullets = [...this.requirements()[reqIndex].bullets];
    bullets.splice(bulletIndex, 1);
    this.patchRequirement(reqIndex, { bullets });
  }

  // -------------------------------------------------------- checkpoints ---

  addCheckpoint(index: number): void {
    const req = this.requirements()[index];
    this.patchRequirement(index, { checkpoints: [...req.checkpoints, blankCheckpoint()] });
  }

  patchCheckpoint(reqIndex: number, cpIndex: number, patch: Partial<Checkpoint>): void {
    const checkpoints = [...this.requirements()[reqIndex].checkpoints];
    checkpoints[cpIndex] = { ...checkpoints[cpIndex], ...patch };
    this.patchRequirement(reqIndex, { checkpoints });
  }

  removeCheckpoint(reqIndex: number, cpIndex: number): void {
    const checkpoints = [...this.requirements()[reqIndex].checkpoints];
    checkpoints.splice(cpIndex, 1);
    this.patchRequirement(reqIndex, { checkpoints });
  }

  // -------------------------------------------------------------- save ---

  save(): void {
    this.failed.set(false);

    if (!this.sectorId() || !this.parameterId()) {
      this.failed.set(true);
      this.message.set('Sector and parameter are both required — the question is scoped to them.');
      return;
    }

    const empty = this.requirements().find((r) => !r.title.trim());
    if (empty) {
      this.failed.set(true);
      this.message.set('Every requirement needs a title.');
      return;
    }

    if (this.checkpointCount() === 0) {
      this.failed.set(true);
      this.message.set('Add at least one checkpoint — a requirement with none cannot be scored.');
      return;
    }

    // Saving writes a requirement and its checkpoints against the level's
    // questionnaire. That endpoint takes a questionnaire id, which this screen
    // does not choose, so the form validates and reports rather than posting to
    // a guess.
    this.message.set(
      `Ready to save: ${this.requirements().length} requirement(s) and ` +
        `${this.checkpointCount()} checkpoint(s) against ${this.levelName()}. ` +
        'Saving is wired to the questionnaire version this belongs to, which this screen ' +
        'does not yet pick.',
    );
  }

  preview(): void {
    this.failed.set(false);
    this.message.set(
      `${this.levelName()} — ${this.requirements().length} requirement(s), ` +
        `${this.checkpointCount()} checkpoint(s), each scored Yes, Partial or No.`,
    );
  }

  cancel(): void {
    void this.router.navigate(['/questionnaire', this.level()]);
  }

  // -------------------------------------------------------- bulk upload ---

  onFile(files: FileList | null): void {
    const file = files?.[0];
    if (!file) return;

    const allowed = ['.xlsx', '.xls', '.csv'];
    const name = file.name.toLowerCase();

    if (!allowed.some((ext) => name.endsWith(ext))) {
      this.failed.set(true);
      this.message.set('Only .xlsx, .xls and .csv files are accepted.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.failed.set(true);
      this.message.set(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB; the limit is 10 MB.`);
      return;
    }

    this.failed.set(false);
    this.message.set(
      `${file.name} (${(file.size / 1024).toFixed(0)} KB) is ready. Bulk import is not wired to an ` +
        'endpoint yet, so nothing has been read from it.',
    );
  }

  downloadTemplate(): void {
    // Built here rather than fetched: the columns are the ones this form
    // writes, so the template cannot drift from what the importer expects.
    const header = [
      'Sector', 'Certification Tier', 'Parameter', 'Requirement Title', 'Requirement Narrative',
      'Sub-points (one per line)', 'Purpose', 'Benefits',
      'Checkpoint', 'Evidence', 'KPI', 'Unit', 'Frequency', 'Expected Response',
    ];

    const example = [
      '13 - Manufacture of textiles', this.levelName(), 'LP-01 - Workplace Organisation',
      'Sort (Seiri) - remove what is not needed',
      'All items in the work area are classified as needed or not needed.',
      'Red-tag area defined with a named owner',
      'Free up floor space and remove clutter.',
      'Shorter search time and safer gangways.',
      'Red-tag area is marked and in use', 'Photograph of the red-tag area',
      'Red-tagged items cleared', '%', 'Monthly', 'Yes',
    ];

    const csv = [header, example]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `question-template-${this.level()}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    this.failed.set(false);
    this.message.set('Template downloaded. Fill one row per checkpoint.');
  }

  formatGuide(): void {
    this.failed.set(false);
    this.message.set(
      'One row per checkpoint. Repeat the requirement columns on each of its rows — rows ' +
        'sharing a requirement title are grouped into one requirement on import.',
    );
  }
}

function blankCheckpoint(): Checkpoint {
  return { text: '', evidence: '', kpi: '', unit: '%', frequency: 'Monthly', response: 'Yes' };
}

function blankRequirement(): Requirement {
  return {
    title: '',
    narrative: '',
    bullets: [''],
    purpose: '',
    benefits: '',
    checkpoints: [blankCheckpoint()],
  };
}
