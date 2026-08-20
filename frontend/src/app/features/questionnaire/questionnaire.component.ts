import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { QuestionnaireManager } from '../../core/models';

/**
 * Questionnaire Manager — 5-green.svg.
 *
 * Serves both sub-menu items: "Lean Silver" and "Lean Gold" are the same screen
 * scoped to a level, which arrives as the :level route parameter. The three
 * level cards still show all three tiers, because the weightages table is a
 * comparison across levels and reads wrongly with two thirds of it hidden.
 *
 * A "question" here is a checkpoint. The assessment content is already
 * Questionnaire -> Requirement -> Checkpoint, so the question bank is that tree
 * flattened rather than a fourth table saying the same thing.
 */
@Component({
  selector: 'app-questionnaire',
  imports: [DecimalPipe],
  templateUrl: './questionnaire.component.html',
  styleUrl: './questionnaire.component.scss',
})
export class QuestionnaireComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** 'silver' or 'gold', from /questionnaire/:level. */
  readonly level = input<string>('silver');

  readonly data = signal<QuestionnaireManager | null>(null);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly bankFilter = signal('');

  readonly levelCode = computed(() => this.level().toUpperCase());

  readonly levelName = computed(
    () => this.data()?.levels.find((l) => l.code === this.levelCode())?.name ?? 'Questionnaire',
  );

  readonly canEdit = this.auth.can('QUES_SILVER', 'edit');

  readonly total = computed(() => this.data()?.bank.totalCount ?? 0);

  readonly rangeFrom = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize + 1,
  );

  readonly rangeTo = computed(() => Math.min(this.page() * this.pageSize, this.total()));

  readonly bankTabs = [
    { label: 'All', value: '' },
    { label: 'Bronze', value: 'BRONZE' },
    { label: 'Silver', value: 'SILVER' },
    { label: 'Gold', value: 'GOLD' },
  ];

  constructor() {
    // Re-runs when the sub-menu switches between Silver and Gold. Untracked
    // for the same reason as the user list: load() reads the page and filter
    // this sets, so tracking them would reload on every paging click.
    effect(() => {
      const scope = this.levelCode();

      untracked(() => {
        this.bankFilter.set(scope);
        this.page.set(1);
        this.load();
      });
    });
  }

  load(): void {
    this.loading.set(true);

    this.api
      .questionnaireManager({
        level: this.bankFilter(),
        search: this.search(),
        pageNumber: this.page(),
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (r) => {
          this.data.set(r);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  setBankFilter(value: string): void {
    this.bankFilter.set(value);
    this.page.set(1);
    this.load();
  }

  levelClass(code: string): string {
    switch (code) {
      case 'BRONZE':
        return 'lvl-bronze';
      case 'SILVER':
        return 'lvl-silver';
      default:
        return 'lvl-gold';
    }
  }

  /** "Yes (-0.25)" / "No", as the weightages table is drawn. */
  negativeMark(rate: number): string {
    return rate > 0 ? `Yes (-${rate})` : 'No';
  }

  addQuestion(): void {
    void this.router.navigate(['/questionnaire', this.level(), 'new']);
  }

  readonly message = signal<string | null>(null);

  /**
   * Publishing moves a level's questionnaire from Draft to Published. The API
   * has POST /questionnaires/{id}/publish, but this screen works at the level
   * rather than at one questionnaire, so it says what it would act on instead
   * of guessing which one.
   */
  publish(): void {
    const level = this.data()?.levels.find((l) => l.code === this.levelCode());
    this.message.set(
      level?.status === 'Published'
        ? `${level.name} is already published; there is nothing pending.`
        : `Publishing ${level?.name ?? this.levelName()} is done from the questionnaire itself, ` +
          'so the version being published is unambiguous.',
    );
  }

  editConfig(): void {
    this.message.set(
      'Pass marks and negative marking are scheme-wide policy — changing them here would ' +
        'affect assessments already in progress, so it is not wired to this button.',
    );
  }

  edit(question: { questionId: string; module: string }): void {
    this.message.set(`${question.questionId} sits under "${question.module}". Open that requirement to edit it.`);
  }

  preview(question: { questionId: string; preview: string }): void {
    this.message.set(`${question.questionId}: ${question.preview}`);
  }

  archive(question: { questionId: string }): void {
    this.message.set(
      `Archiving ${question.questionId} withdraws it from live assessments; that is a ` +
        'content change and is made against the requirement, not from the bank list.',
    );
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
}
