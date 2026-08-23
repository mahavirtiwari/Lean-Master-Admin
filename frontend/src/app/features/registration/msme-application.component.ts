import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';

interface AppConfig {
  basicInfo: {
    basicInfoItemId: number;
    groupName: string;
    label: string;
    inputType: 'photo' | 'yesno' | 'text' | 'number' | 'checklist';
  }[];
  esgSections: {
    esgSectionId: number;
    name: string;
    questions: { esgQuestionId: number; text: string; parentQuestionId: number | null; showWhenAnswer: 'Yes' | 'No' | null }[];
  }[];
  documents: { documentRequirementId: number; name: string; isMandatory: boolean }[];
}

interface Submission {
  status: 'Draft' | 'Submitted';
  submittedOnUtc: string | null;
  basicInfo: { basicInfoItemId: number; valueText: string | null }[];
  esg: { esgQuestionId: number; answer: 'Yes' | 'No' | 'NA' }[];
  documents: { documentRequirementId: number; originalFileName: string | null }[];
}

/**
 * The LEAN Silver application on web — read-only. The applicant fills the basic
 * information, ESG and documents on the mobile app; web shows what was submitted
 * and takes the payment. Nothing is edited here, which is why there are no
 * inputs: only the data, then Proceed to payment.
 */
@Component({
  selector: 'app-msme-application',
  imports: [],
  templateUrl: './msme-application.component.html',
  styleUrl: './msme-application.component.scss',
})
export class MsmeApplicationComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBase;

  readonly loading = signal(true);
  readonly config = signal<AppConfig | null>(null);
  readonly submission = signal<Submission | null>(null);

  readonly submitted = computed(() => this.submission()?.status === 'Submitted');

  /** value lookups keyed by id, from the submission. */
  private readonly basicMap = computed(
    () => new Map((this.submission()?.basicInfo ?? []).map((b) => [b.basicInfoItemId, b.valueText])),
  );
  private readonly esgMap = computed(
    () => new Map((this.submission()?.esg ?? []).map((e) => [e.esgQuestionId, e.answer])),
  );
  private readonly docMap = computed(
    () => new Map((this.submission()?.documents ?? []).map((d) => [d.documentRequirementId, d.originalFileName])),
  );

  /** Basic-information items grouped, each with the submitted value. */
  readonly basicGroups = computed(() => {
    const cfg = this.config();
    if (!cfg) return [];
    const values = this.basicMap();
    const map = new Map<string, { label: string; value: string; isPhoto: boolean }[]>();
    for (const item of cfg.basicInfo) {
      const raw = values.get(item.basicInfoItemId) ?? '';
      const value = item.inputType === 'photo' ? (raw ? 'Provided' : 'Not provided') : (raw || '—');
      const list = map.get(item.groupName) ?? [];
      list.push({ label: item.label, value, isPhoto: item.inputType === 'photo' });
      map.set(item.groupName, list);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  });

  /** ESG sections with only the answered questions, each with its answer. */
  readonly esgSections = computed(() => {
    const cfg = this.config();
    if (!cfg) return [];
    const answers = this.esgMap();
    return cfg.esgSections
      .map((s) => ({
        name: s.name,
        questions: s.questions
          .filter((q) => answers.has(q.esgQuestionId))
          .map((q) => ({ text: q.text, answer: answers.get(q.esgQuestionId)!, child: q.parentQuestionId != null })),
      }))
      .filter((s) => s.questions.length);
  });

  /** Documents with whether each was uploaded. */
  readonly documents = computed(() => {
    const cfg = this.config();
    if (!cfg) return [];
    const uploaded = this.docMap();
    return cfg.documents.map((d) => ({
      name: d.name,
      mandatory: d.isMandatory,
      fileName: uploaded.get(d.documentRequirementId) ?? null,
    }));
  });

  answerLabel(a: string): string {
    return a === 'NA' ? 'Not applicable' : a;
  }

  constructor() {
    this.http.get<AppConfig>(`${this.base}/msme/application/config`).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.http.get<Submission | null>(`${this.base}/msme/application/silver`).subscribe({
          next: (sub) => {
            this.submission.set(sub);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
      error: () => this.loading.set(false),
    });
  }

  pay(): void {
    void this.router.navigate(['/msme/payment']);
  }
  dashboard(): void {
    void this.router.navigate(['/msme/dashboard']);
  }
}
