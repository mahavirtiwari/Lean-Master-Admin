import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { EsgParentOption, EsgQuestion, EsgSection } from '../../core/models';
import { ConfirmComponent, EmptyComponent, PageIntroComponent } from '../../shared/ui';

/**
 * ESG Checklist builder (super-admin menu 1).
 *
 * A master-detail: sections on the left, the selected section's questions on the
 * right. Every question is answered Yes / No / Not Applicable, so the options are
 * fixed and not edited here. A question may be conditional — shown only when a
 * parent question in the same section is answered Yes or No — which is the
 * dependent-question case the scheme asked for.
 *
 * Nothing is deleted: a section or question in use is disabled with a reason, so
 * an application already answered against it stays readable.
 */
@Component({
  selector: 'app-esg-checklist',
  imports: [FormsModule, PageIntroComponent, EmptyComponent, ConfirmComponent],
  template: `
    <app-page-intro
      title="ESG Checklist"
      subtitle="Environmental, Social and Governance questions for the LEAN Silver application"
    />

    <div class="esg-grid">
      <!-- ------------------------------------------------------- sections -->
      <section class="card">
        <div class="card-head">
          <div class="row">
            <h3 class="card-title">Sections</h3>
            <span class="count-chip">{{ sections().length }}</span>
          </div>
        </div>

        @if (canEdit) {
          <form class="master-form compact" (ngSubmit)="saveSection()">
            <div class="field">
              <label class="field-label">SECTION CODE<span class="req">*</span></label>
              <input class="input" maxlength="30" placeholder="e.g. ENV" name="sc"
                     [ngModel]="sectionForm().code" (ngModelChange)="sectionForm.set({ ...sectionForm(), code: $event })" />
            </div>
            <div class="field">
              <label class="field-label">SECTION NAME<span class="req">*</span></label>
              <input class="input" maxlength="200" placeholder="e.g. Environmental Assessment" name="sn"
                     [ngModel]="sectionForm().name" (ngModelChange)="sectionForm.set({ ...sectionForm(), name: $event })" />
            </div>
            <div class="form-actions">
              @if (editingSectionId()) {
                <button class="btn btn-secondary btn-sm" type="button" (click)="cancelSectionEdit()">Cancel</button>
              }
              <button class="btn btn-primary btn-sm" type="submit" [disabled]="savingSection()">
                {{ editingSectionId() ? 'Update' : 'Add section' }}
              </button>
            </div>
            @if (sectionError(); as m) { <div class="field-error">{{ m }}</div> }
          </form>
        }

        <div class="sec-list">
          @for (s of sections(); track s.esgSectionId) {
            <button type="button" class="sec-item" [class.is-sel]="s.esgSectionId === selectedSectionId()"
                    (click)="selectSection(s.esgSectionId)">
              <span class="sec-main">
                <span class="code">{{ s.code }}</span>
                <span class="sec-name">{{ s.name }}</span>
              </span>
              <span class="sec-meta">
                <span class="pill" [class]="s.isActive ? 'pill-green' : 'pill-red'">{{ s.isActive ? 'Active' : 'Off' }}</span>
                <span class="q-count">{{ s.questionCount }} Q</span>
              </span>
            </button>
          } @empty {
            <app-empty title="No sections yet" text="Add a section — Environmental, Social or Governance — to begin." />
          }
        </div>

        @if (selectedSection(); as s) {
          @if (canEdit) {
            <div class="sec-actions">
              <button class="act act-edit" type="button" (click)="startSectionEdit(s)">Edit section</button>
              <span class="act-sep">|</span>
              <button class="act" type="button" [class.act-danger]="s.isActive" [class.act-green]="!s.isActive"
                      (click)="confirming.set({ kind: 'section', id: s.esgSectionId, name: s.name, isActive: s.isActive })">
                {{ s.isActive ? 'Disable' : 'Enable' }} section
              </button>
            </div>
          }
        }
      </section>

      <!-- ------------------------------------------------------ questions -->
      <section class="card">
        <div class="card-head">
          <div class="row">
            <h3 class="card-title">
              {{ selectedSection() ? selectedSection()!.name + ' — questions' : 'Questions' }}
            </h3>
            @if (selectedSection()) { <span class="count-chip">{{ questions().length }}</span> }
          </div>
        </div>

        @if (!selectedSection()) {
          <app-empty title="Select a section" text="Choose a section on the left to add and arrange its questions." />
        } @else {
          @if (canEdit) {
            <form class="master-form q-form" (ngSubmit)="saveQuestion()">
              <div class="field">
                <label class="field-label">QUESTION CODE<span class="req">*</span></label>
                <input class="input" maxlength="30" placeholder="e.g. ENV-1" name="qc"
                       [ngModel]="questionForm().code" (ngModelChange)="questionForm.set({ ...questionForm(), code: $event })" />
              </div>
              <div class="field span-2">
                <label class="field-label">QUESTION<span class="req">*</span></label>
                <textarea class="textarea" maxlength="1000" rows="2" placeholder="Enter the question exactly as the applicant will read it" name="qt"
                          [ngModel]="questionForm().text" (ngModelChange)="questionForm.set({ ...questionForm(), text: $event })"></textarea>
              </div>
              <div class="field span-2">
                <label class="field-label">HELP TEXT</label>
                <input class="input" maxlength="500" placeholder="Optional guidance shown under the question" name="qh"
                       [ngModel]="questionForm().helpText" (ngModelChange)="questionForm.set({ ...questionForm(), helpText: $event })" />
              </div>

              <!-- conditional / dependent question -->
              <div class="field span-2 conditional">
                <label class="chk">
                  <input type="checkbox" name="qcond" [ngModel]="isConditional()" (ngModelChange)="toggleConditional($event)" />
                  This question is shown only when another question is answered a certain way
                </label>
              </div>

              @if (isConditional()) {
                <div class="field">
                  <label class="field-label">DEPENDS ON<span class="req">*</span></label>
                  <select class="select" name="qparent"
                          [ngModel]="questionForm().parentQuestionId"
                          (ngModelChange)="questionForm.set({ ...questionForm(), parentQuestionId: +$event })">
                    <option [ngValue]="null" disabled>Choose the parent question</option>
                    @for (p of parentOptions(); track p.esgQuestionId) {
                      <option [ngValue]="p.esgQuestionId">{{ p.code }} — {{ p.text }}</option>
                    }
                  </select>
                </div>
                <div class="field">
                  <label class="field-label">SHOW WHEN THE ANSWER IS<span class="req">*</span></label>
                  <div class="rank-toggle">
                    <button type="button" [class.is-on]="questionForm().showWhenAnswer === 'Yes'"
                            (click)="questionForm.set({ ...questionForm(), showWhenAnswer: 'Yes' })">Yes</button>
                    <button type="button" [class.is-on]="questionForm().showWhenAnswer === 'No'"
                            (click)="questionForm.set({ ...questionForm(), showWhenAnswer: 'No' })">No</button>
                  </div>
                </div>
              }

              <div class="form-actions span-2">
                @if (editingQuestionId()) {
                  <button class="btn btn-secondary btn-sm" type="button" (click)="cancelQuestionEdit()">Cancel</button>
                }
                <button class="btn btn-primary btn-sm" type="submit" [disabled]="savingQuestion()">
                  {{ editingQuestionId() ? 'Update question' : 'Add question' }}
                </button>
              </div>
              @if (questionError(); as m) { <div class="field-error span-2">{{ m }}</div> }
            </form>
          }

          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Code</th><th>Question</th><th>Options</th><th>Shown</th><th>Status</th>
                  @if (canEdit) { <th>Actions</th> }
                </tr>
              </thead>
              <tbody>
                @for (q of questions(); track q.esgQuestionId) {
                  <tr [class.is-child]="q.parentQuestionId">
                    <td class="code">{{ q.code }}</td>
                    <td class="strong">{{ q.text }}</td>
                    <td class="muted nowrap">Yes / No / N/A</td>
                    <td class="nowrap">
                      @if (q.parentQuestionId) {
                        <span class="cond-tag">if “{{ q.parentText }}” = {{ q.showWhenAnswer }}</span>
                      } @else {
                        <span class="muted">Always</span>
                      }
                    </td>
                    <td>
                      <span class="pill" [class]="q.isActive ? 'pill-green' : 'pill-red'">{{ q.isActive ? 'Active' : 'Inactive' }}</span>
                    </td>
                    @if (canEdit) {
                      <td class="nowrap">
                        <button class="act act-edit" type="button" (click)="startQuestionEdit(q)">Edit</button>
                        <span class="act-sep">|</span>
                        <button class="act" type="button" [class.act-danger]="q.isActive" [class.act-green]="!q.isActive"
                                (click)="confirming.set({ kind: 'question', id: q.esgQuestionId, name: q.code, isActive: q.isActive })">
                          {{ q.isActive ? 'Disable' : 'Enable' }}
                        </button>
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr><td [attr.colspan]="canEdit ? 6 : 5" class="muted">No questions in this section yet.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>

    @if (confirming(); as c) {
      <app-confirm
        [title]="(c.isActive ? 'Disable ' : 'Enable ') + (c.kind === 'section' ? 'Section' : 'Question')"
        [message]="(c.isActive ? 'Disabling ' : 'Enabling ') + c.name + (c.isActive ? ' removes it from new applications. Applications already answered against it keep their answers.' : ' makes it available to new applications again.')"
        [confirmLabel]="(c.isActive ? 'Disable' : 'Enable')"
        [tone]="c.isActive ? 'danger' : 'primary'"
        (confirmed)="confirmToggle()"
        (cancelled)="closeConfirm()"
      >
        <label class="field-label">REASON<span class="req">*</span></label>
        <textarea class="textarea" maxlength="500" placeholder="Why is this being changed? Recorded against the item."
                  [ngModel]="reason()" (ngModelChange)="reason.set($event)"></textarea>
        @if (reasonError(); as m) { <p class="field-error">{{ m }}</p> }
      </app-confirm>
    }
  `,
  styleUrl: './esg-checklist.component.scss',
})
export class EsgChecklistComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly canEdit = this.auth.can('ESG_CHECKLIST', 'edit');

  readonly sections = signal<EsgSection[]>([]);
  readonly selectedSectionId = signal<number | null>(null);
  readonly questions = signal<EsgQuestion[]>([]);
  readonly parentOptions = signal<EsgParentOption[]>([]);

  readonly selectedSection = computed(() =>
    this.sections().find((s) => s.esgSectionId === this.selectedSectionId()) ?? null);

  readonly editingSectionId = signal<number | null>(null);
  readonly sectionForm = signal<{ code: string; name: string; description: string }>({ code: '', name: '', description: '' });
  readonly sectionError = signal<string | null>(null);
  readonly savingSection = signal(false);

  readonly editingQuestionId = signal<number | null>(null);
  readonly questionForm = signal<{
    code: string; text: string; helpText: string;
    parentQuestionId: number | null; showWhenAnswer: 'Yes' | 'No' | null;
  }>({ code: '', text: '', helpText: '', parentQuestionId: null, showWhenAnswer: null });
  readonly isConditional = signal(false);
  readonly questionError = signal<string | null>(null);
  readonly savingQuestion = signal(false);

  readonly confirming = signal<{ kind: 'section' | 'question'; id: number; name: string; isActive: boolean } | null>(null);
  readonly reason = signal('');
  readonly reasonError = signal<string | null>(null);

  constructor() {
    this.loadSections();
  }

  loadSections(): void {
    this.api.esgSections(true).subscribe((rows) => {
      this.sections.set(rows);
      if (this.selectedSectionId() === null && rows.length) this.selectSection(rows[0].esgSectionId);
    });
  }

  selectSection(id: number): void {
    this.selectedSectionId.set(id);
    this.cancelQuestionEdit();
    this.api.esgQuestions(id, true).subscribe((rows) => this.questions.set(rows));
  }

  // ---- sections ----
  startSectionEdit(s: EsgSection): void {
    this.editingSectionId.set(s.esgSectionId);
    this.sectionForm.set({ code: s.code, name: s.name, description: s.description ?? '' });
    this.sectionError.set(null);
  }

  cancelSectionEdit(): void {
    this.editingSectionId.set(null);
    this.sectionForm.set({ code: '', name: '', description: '' });
    this.sectionError.set(null);
  }

  saveSection(): void {
    const f = this.sectionForm();
    if (!f.code.trim()) return this.sectionError.set('Enter the section code.');
    if (!f.name.trim()) return this.sectionError.set('Enter the section name.');

    this.savingSection.set(true);
    this.sectionError.set(null);
    const id = this.editingSectionId();
    const done = (): void => { this.savingSection.set(false); this.cancelSectionEdit(); this.loadSections(); };
    const fail = (r: ApiError): void => { this.savingSection.set(false); this.sectionError.set(firstError(r)); };

    if (id === null) this.api.createEsgSection(f).subscribe({ next: done, error: fail });
    else this.api.updateEsgSection(id, f).subscribe({ next: done, error: fail });
  }

  // ---- questions ----
  toggleConditional(on: boolean): void {
    this.isConditional.set(on);
    if (!on) {
      this.questionForm.set({ ...this.questionForm(), parentQuestionId: null, showWhenAnswer: null });
    } else {
      this.loadParentOptions();
    }
  }

  private loadParentOptions(): void {
    const sid = this.selectedSectionId();
    if (sid === null) return;
    this.api.esgParentOptions(sid, this.editingQuestionId() ?? undefined)
      .subscribe((rows) => this.parentOptions.set(rows));
  }

  startQuestionEdit(q: EsgQuestion): void {
    this.editingQuestionId.set(q.esgQuestionId);
    this.questionForm.set({
      code: q.code, text: q.text, helpText: q.helpText ?? '',
      parentQuestionId: q.parentQuestionId, showWhenAnswer: q.showWhenAnswer,
    });
    this.isConditional.set(q.parentQuestionId !== null);
    if (q.parentQuestionId !== null) this.loadParentOptions();
    this.questionError.set(null);
  }

  cancelQuestionEdit(): void {
    this.editingQuestionId.set(null);
    this.questionForm.set({ code: '', text: '', helpText: '', parentQuestionId: null, showWhenAnswer: null });
    this.isConditional.set(false);
    this.questionError.set(null);
  }

  saveQuestion(): void {
    const sid = this.selectedSectionId();
    if (sid === null) return;
    const f = this.questionForm();
    if (!f.code.trim()) return this.questionError.set('Enter the question code.');
    if (!f.text.trim()) return this.questionError.set('Enter the question text.');
    if (this.isConditional()) {
      if (!f.parentQuestionId) return this.questionError.set('Choose the parent question this depends on.');
      if (!f.showWhenAnswer) return this.questionError.set('Choose whether it appears on Yes or on No.');
    }

    this.savingQuestion.set(true);
    this.questionError.set(null);
    const body = {
      esgSectionId: sid,
      code: f.code.trim(),
      text: f.text.trim(),
      helpText: f.helpText.trim() || null,
      parentQuestionId: this.isConditional() ? f.parentQuestionId : null,
      showWhenAnswer: this.isConditional() ? f.showWhenAnswer : null,
    };
    const id = this.editingQuestionId();
    const done = (): void => { this.savingQuestion.set(false); this.cancelQuestionEdit(); this.selectSection(sid); this.loadSections(); };
    const fail = (r: ApiError): void => { this.savingQuestion.set(false); this.questionError.set(firstError(r)); };

    if (id === null) this.api.createEsgQuestion(body).subscribe({ next: done, error: fail });
    else this.api.updateEsgQuestion(id, body).subscribe({ next: done, error: fail });
  }

  // ---- enable/disable ----
  closeConfirm(): void { this.confirming.set(null); this.reason.set(''); this.reasonError.set(null); }

  confirmToggle(): void {
    const c = this.confirming();
    if (!c) return;
    if (this.reason().trim().length === 0) {
      this.reasonError.set('Give a reason for this change. It is recorded.');
      return;
    }
    const reason = this.reason().trim();
    const after = (): void => {
      this.closeConfirm();
      const sid = this.selectedSectionId();
      if (c.kind === 'question' && sid !== null) this.selectSection(sid);
      this.loadSections();
    };
    const req = c.kind === 'section'
      ? this.api.setEsgSectionStatus(c.id, !c.isActive, reason)
      : this.api.setEsgQuestionStatus(c.id, !c.isActive, reason);
    req.subscribe({ next: after, error: (r: ApiError) => this.reasonError.set(firstError(r)) });
  }
}

interface ApiError { error?: { errors?: Record<string, string[]>; title?: string; message?: string } }

function firstError(r: ApiError): string {
  const errs = r.error?.errors;
  const first = errs ? Object.values(errs)[0]?.[0] : undefined;
  return first ?? r.error?.message ?? r.error?.title ?? 'Could not save. Please try again.';
}
