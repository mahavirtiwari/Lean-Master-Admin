import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';

interface AppConfig {
  basicInfo: {
    basicInfoItemId: number;
    groupName: string;
    label: string;
    helpText: string | null;
    inputType: 'photo' | 'yesno' | 'text' | 'number' | 'checklist';
    isRequired: boolean;
  }[];
  esgSections: {
    esgSectionId: number;
    name: string;
    questions: {
      esgQuestionId: number;
      text: string;
      helpText: string | null;
      parentQuestionId: number | null;
      showWhenAnswer: 'Yes' | 'No' | null;
    }[];
  }[];
  documents: {
    documentRequirementId: number;
    name: string;
    helpText: string | null;
    acceptedTypes: string;
    isMandatory: boolean;
  }[];
}

interface Submission {
  status: 'Draft' | 'Submitted';
  basicInfo: { basicInfoItemId: number; valueText: string | null }[];
  esg: { esgQuestionId: number; answer: 'Yes' | 'No' | 'NA' }[];
  documents: { documentRequirementId: number; originalFileName: string | null }[];
}

type Answer = 'Yes' | 'No' | 'NA';

/**
 * The LEAN Silver application on the web portal — the same four steps the mobile
 * app collects (basic information, ESG, documents, review), reading the admin-
 * defined checklist and submitting the applicant's answers. Web carries the
 * application through submission and payment; everything after payment, up to
 * consultant selection, is done on the mobile app.
 */
@Component({
  selector: 'app-msme-application',
  imports: [FormsModule],
  templateUrl: './msme-application.component.html',
  styleUrl: './msme-application.component.scss',
})
export class MsmeApplicationComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBase;

  readonly steps = ['Basic information', 'ESG information', 'Documents', 'Review'];
  readonly step = signal(0);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  readonly config = signal<AppConfig | null>(null);
  readonly basic = signal<Record<number, string>>({});
  readonly esg = signal<Record<number, Answer>>({});
  readonly docs = signal<Record<number, string>>({});

  /** Questions visible now — top-level, or a child whose parent carries its trigger. */
  readonly visibleEsg = computed(() => {
    const cfg = this.config();
    const answers = this.esg();
    const shown = new Set<number>();
    if (!cfg) return shown;
    for (const s of cfg.esgSections) {
      for (const q of s.questions) {
        if (q.parentQuestionId == null || answers[q.parentQuestionId] === q.showWhenAnswer) {
          shown.add(q.esgQuestionId);
        }
      }
    }
    return shown;
  });

  readonly visibleSections = computed(() => {
    const cfg = this.config();
    if (!cfg) return [];
    const shown = this.visibleEsg();
    return cfg.esgSections
      .map((s) => ({ ...s, questions: s.questions.filter((q) => shown.has(q.esgQuestionId)) }))
      .filter((s) => s.questions.length);
  });

  constructor() {
    this.http.get<AppConfig>(`${this.base}/msme/application/config`).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.http.get<Submission | null>(`${this.base}/msme/application/silver`).subscribe({
          next: (sub) => {
            if (sub && sub.status !== 'Submitted') {
              this.basic.set(Object.fromEntries(sub.basicInfo.map((b) => [b.basicInfoItemId, b.valueText ?? ''])));
              this.esg.set(Object.fromEntries(sub.esg.map((e) => [e.esgQuestionId, e.answer])));
              this.docs.set(Object.fromEntries(sub.documents.map((d) => [d.documentRequirementId, d.originalFileName ?? ''])));
            }
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
      error: () => {
        this.error.set('The application form could not be loaded.');
        this.loading.set(false);
      },
    });
  }

  // -- grouping helpers for the template --
  groups = computed(() => {
    const cfg = this.config();
    if (!cfg) return [];
    const map = new Map<string, AppConfig['basicInfo']>();
    for (const item of cfg.basicInfo) {
      const list = map.get(item.groupName) ?? [];
      list.push(item);
      map.set(item.groupName, list);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  });

  setBasic(id: number, value: string): void {
    this.basic.set({ ...this.basic(), [id]: value });
  }
  setEsg(id: number, value: Answer): void {
    this.esg.set({ ...this.esg(), [id]: value });
  }
  captureFile(target: 'basic' | 'doc', id: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const name = input.files?.[0]?.name ?? '';
    if (target === 'basic') this.setBasic(id, name);
    else this.docs.set({ ...this.docs(), [id]: name });
  }

  next(): void {
    if (this.step() < 3) this.step.set(this.step() + 1);
  }
  back(): void {
    if (this.step() > 0) this.step.set(this.step() - 1);
  }

  private payload(submit: boolean) {
    const visible = this.visibleEsg();
    return {
      submit,
      basicInfo: Object.entries(this.basic()).map(([id, value]) => ({ basicInfoItemId: +id, value })),
      esg: Object.entries(this.esg())
        .filter(([id]) => visible.has(+id))
        .map(([id, answer]) => ({ esgQuestionId: +id, answer })),
      documents: Object.entries(this.docs()).map(([id, name]) => ({ documentRequirementId: +id, originalFileName: name })),
    };
  }

  saveDraft(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.http.post(`${this.base}/msme/application/silver`, this.payload(false)).subscribe({
      next: () => {
        this.saving.set(false);
        this.notice.set('Draft saved. You can return to finish it later.');
      },
      error: () => {
        this.saving.set(false);
        this.error.set('Could not save the draft.');
      },
    });
  }

  submit(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.http.post(`${this.base}/msme/application/silver`, this.payload(true)).subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/msme/payment']);
      },
      error: (r: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.error.set(r.error?.message ?? 'Please review your answers before submitting.');
      },
    });
  }

  // review tallies
  basicFilled = computed(() => Object.values(this.basic()).filter(Boolean).length);
  esgAnswered = computed(() => {
    const v = this.visibleEsg();
    const a = this.esg();
    return [...v].filter((id) => a[id]).length;
  });
  docsUploaded = computed(() => Object.values(this.docs()).filter(Boolean).length);
}
