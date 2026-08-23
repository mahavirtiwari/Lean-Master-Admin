import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BasicInfoItem, DocumentRequirement } from '../../core/models';
import { ConfirmComponent, EmptyComponent, PageIntroComponent } from '../../shared/ui';

/**
 * Basic Information &amp; Documents (super-admin menu 2).
 *
 * Two configurable lists the application collects before ESG, on two tabs:
 * the Basic Information items (site photographs, declarations, energy sources)
 * and the document-upload checklist. Both administered like the other masters —
 * disabled with a reason rather than deleted.
 */
@Component({
  selector: 'app-basic-info-documents',
  imports: [FormsModule, PageIntroComponent, EmptyComponent, ConfirmComponent],
  template: `
    <app-page-intro
      title="Basic Info & Documents"
      subtitle="What the application collects before ESG — basic-information items and the document checklist"
    />

    <div class="tabs">
      <button type="button" [class.is-on]="tab() === 'basic'" (click)="tab.set('basic')">Basic Information</button>
      <button type="button" [class.is-on]="tab() === 'docs'" (click)="tab.set('docs')">Document Upload</button>
    </div>

    <!-- ===================================================== BASIC INFO === -->
    @if (tab() === 'basic') {
      <div class="stack">
        @if (canEdit) {
          <section class="card card-pad">
            <h3 class="card-title">{{ editingBasicId() ? 'Edit item' : 'Add basic-information item' }}</h3>
            <form class="master-form" (ngSubmit)="saveBasic()">
              <div class="field">
                <label class="field-label">CODE<span class="req">*</span></label>
                <input class="input" maxlength="30" placeholder="e.g. PH-SELFIE" name="bc"
                       [ngModel]="basicForm().code" (ngModelChange)="basicForm.set({ ...basicForm(), code: $event })" />
              </div>
              <div class="field">
                <label class="field-label">GROUP<span class="req">*</span></label>
                <input class="input" maxlength="100" placeholder="e.g. Photographs" name="bg"
                       [ngModel]="basicForm().groupName" (ngModelChange)="basicForm.set({ ...basicForm(), groupName: $event })" />
              </div>
              <div class="field span-2">
                <label class="field-label">LABEL<span class="req">*</span></label>
                <input class="input" maxlength="300" placeholder="What the applicant sees, e.g. MSME Representative Selfie" name="bl"
                       [ngModel]="basicForm().label" (ngModelChange)="basicForm.set({ ...basicForm(), label: $event })" />
              </div>
              <div class="field span-2">
                <label class="field-label">HELP TEXT</label>
                <input class="input" maxlength="300" placeholder="Optional guidance" name="bh"
                       [ngModel]="basicForm().helpText" (ngModelChange)="basicForm.set({ ...basicForm(), helpText: $event })" />
              </div>
              <div class="field">
                <label class="field-label">INPUT TYPE<span class="req">*</span></label>
                <select class="select" name="bt" [ngModel]="basicForm().inputType"
                        (ngModelChange)="basicForm.set({ ...basicForm(), inputType: $event })">
                  <option value="photo">Photo (captured on site)</option>
                  <option value="yesno">Yes / No declaration</option>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="checklist">Checklist (tick all that apply)</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label">REQUIRED</label>
                <label class="chk">
                  <input type="checkbox" name="br" [ngModel]="basicForm().isRequired"
                         (ngModelChange)="basicForm.set({ ...basicForm(), isRequired: $event })" />
                  Applicant must complete this
                </label>
              </div>
              <div class="form-actions span-2">
                @if (editingBasicId()) {
                  <button class="btn btn-secondary btn-sm" type="button" (click)="cancelBasicEdit()">Cancel</button>
                }
                <button class="btn btn-primary btn-sm" type="submit" [disabled]="savingBasic()">
                  {{ editingBasicId() ? 'Update' : 'Add item' }}
                </button>
              </div>
              @if (basicError(); as m) { <div class="field-error span-2">{{ m }}</div> }
            </form>
          </section>
        }

        <section class="card">
          <div class="card-head"><div class="row"><h3 class="card-title">Basic-information items</h3>
            <span class="count-chip">{{ basicItems().length }}</span></div></div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Code</th><th>Group</th><th>Label</th><th>Type</th><th>Required</th><th>Status</th>
                @if (canEdit) { <th>Actions</th> }</tr></thead>
              <tbody>
                @for (i of basicItems(); track i.basicInfoItemId) {
                  <tr>
                    <td class="code">{{ i.code }}</td>
                    <td>{{ i.groupName }}</td>
                    <td class="strong">{{ i.label }}</td>
                    <td class="muted nowrap">{{ inputTypeLabel(i.inputType) }}</td>
                    <td>{{ i.isRequired ? 'Yes' : 'No' }}</td>
                    <td><span class="pill" [class]="i.isActive ? 'pill-green' : 'pill-red'">{{ i.isActive ? 'Active' : 'Inactive' }}</span></td>
                    @if (canEdit) {
                      <td class="nowrap">
                        <button class="act act-edit" type="button" (click)="startBasicEdit(i)">Edit</button>
                        <span class="act-sep">|</span>
                        <button class="act" type="button" [class.act-danger]="i.isActive" [class.act-green]="!i.isActive"
                                (click)="confirming.set({ kind: 'basic', id: i.basicInfoItemId, name: i.label, isActive: i.isActive })">
                          {{ i.isActive ? 'Disable' : 'Enable' }}
                        </button>
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr><td [attr.colspan]="canEdit ? 7 : 6"><app-empty title="No items yet" text="Add the site photographs and declarations the application should collect." /></td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>
    }

    <!-- ===================================================== DOCUMENTS ==== -->
    @if (tab() === 'docs') {
      <div class="stack">
        @if (canEdit) {
          <section class="card card-pad">
            <h3 class="card-title">{{ editingDocId() ? 'Edit document' : 'Add required document' }}</h3>
            <form class="master-form" (ngSubmit)="saveDoc()">
              <div class="field">
                <label class="field-label">CODE<span class="req">*</span></label>
                <input class="input" maxlength="30" placeholder="e.g. DOC-WORK" name="dc"
                       [ngModel]="docForm().code" (ngModelChange)="docForm.set({ ...docForm(), code: $event })" />
              </div>
              <div class="field">
                <label class="field-label">CERTIFICATION LEVEL</label>
                <select class="select" name="dlvl" [ngModel]="docForm().certificationLevelId"
                        (ngModelChange)="docForm.set({ ...docForm(), certificationLevelId: $event === '' ? null : +$event })">
                  <option [ngValue]="null">All levels</option>
                  <option [ngValue]="2">Silver</option>
                  <option [ngValue]="3">Gold</option>
                </select>
              </div>
              <div class="field span-2">
                <label class="field-label">DOCUMENT NAME<span class="req">*</span></label>
                <input class="input" maxlength="300" placeholder="e.g. Pictures of Working Area" name="dn"
                       [ngModel]="docForm().name" (ngModelChange)="docForm.set({ ...docForm(), name: $event })" />
              </div>
              <div class="field span-2">
                <label class="field-label">HELP TEXT</label>
                <input class="input" maxlength="300" placeholder="Optional guidance, e.g. Outside and inside view" name="dh"
                       [ngModel]="docForm().helpText" (ngModelChange)="docForm.set({ ...docForm(), helpText: $event })" />
              </div>
              <div class="field">
                <label class="field-label">ACCEPTED TYPES</label>
                <input class="input" maxlength="200" placeholder="image/*,application/pdf" name="dt"
                       [ngModel]="docForm().acceptedTypes" (ngModelChange)="docForm.set({ ...docForm(), acceptedTypes: $event })" />
              </div>
              <div class="field">
                <label class="field-label">MANDATORY</label>
                <label class="chk">
                  <input type="checkbox" name="dm" [ngModel]="docForm().isMandatory"
                         (ngModelChange)="docForm.set({ ...docForm(), isMandatory: $event })" />
                  Applicant must upload this
                </label>
              </div>
              <div class="form-actions span-2">
                @if (editingDocId()) {
                  <button class="btn btn-secondary btn-sm" type="button" (click)="cancelDocEdit()">Cancel</button>
                }
                <button class="btn btn-primary btn-sm" type="submit" [disabled]="savingDoc()">
                  {{ editingDocId() ? 'Update' : 'Add document' }}
                </button>
              </div>
              @if (docError(); as m) { <div class="field-error span-2">{{ m }}</div> }
            </form>
          </section>
        }

        <section class="card">
          <div class="card-head"><div class="row"><h3 class="card-title">Document checklist</h3>
            <span class="count-chip">{{ docs().length }}</span></div></div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Code</th><th>Document</th><th>Level</th><th>Mandatory</th><th>Status</th>
                @if (canEdit) { <th>Actions</th> }</tr></thead>
              <tbody>
                @for (d of docs(); track d.documentRequirementId) {
                  <tr>
                    <td class="code">{{ d.code }}</td>
                    <td class="strong">{{ d.name }}</td>
                    <td class="muted nowrap">{{ levelLabel(d.certificationLevelId) }}</td>
                    <td>{{ d.isMandatory ? 'Yes' : 'No' }}</td>
                    <td><span class="pill" [class]="d.isActive ? 'pill-green' : 'pill-red'">{{ d.isActive ? 'Active' : 'Inactive' }}</span></td>
                    @if (canEdit) {
                      <td class="nowrap">
                        <button class="act act-edit" type="button" (click)="startDocEdit(d)">Edit</button>
                        <span class="act-sep">|</span>
                        <button class="act" type="button" [class.act-danger]="d.isActive" [class.act-green]="!d.isActive"
                                (click)="confirming.set({ kind: 'doc', id: d.documentRequirementId, name: d.name, isActive: d.isActive })">
                          {{ d.isActive ? 'Disable' : 'Enable' }}
                        </button>
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr><td [attr.colspan]="canEdit ? 6 : 5"><app-empty title="No documents yet" text="Add the pictures and certificates applicants must upload." /></td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>
    }

    @if (confirming(); as c) {
      <app-confirm
        [title]="(c.isActive ? 'Disable' : 'Enable') + ' item'"
        [message]="(c.isActive ? 'Disabling ' : 'Enabling ') + c.name + (c.isActive ? ' removes it from new applications.' : ' makes it available again.')"
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
  styleUrl: './basic-info-documents.component.scss',
})
export class BasicInfoDocumentsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly canEdit = this.auth.can('BASIC_INFO_DOCS', 'edit');
  readonly tab = signal<'basic' | 'docs'>('basic');

  readonly basicItems = signal<BasicInfoItem[]>([]);
  readonly editingBasicId = signal<number | null>(null);
  readonly basicForm = signal<{ code: string; groupName: string; label: string; helpText: string; inputType: string; isRequired: boolean }>(
    { code: '', groupName: '', label: '', helpText: '', inputType: 'photo', isRequired: true });
  readonly basicError = signal<string | null>(null);
  readonly savingBasic = signal(false);

  readonly docs = signal<DocumentRequirement[]>([]);
  readonly editingDocId = signal<number | null>(null);
  readonly docForm = signal<{ code: string; name: string; helpText: string; certificationLevelId: number | null; acceptedTypes: string; isMandatory: boolean }>(
    { code: '', name: '', helpText: '', certificationLevelId: null, acceptedTypes: 'image/*,application/pdf', isMandatory: true });
  readonly docError = signal<string | null>(null);
  readonly savingDoc = signal(false);

  readonly confirming = signal<{ kind: 'basic' | 'doc'; id: number; name: string; isActive: boolean } | null>(null);
  readonly reason = signal('');
  readonly reasonError = signal<string | null>(null);

  constructor() {
    this.loadBasic();
    this.loadDocs();
  }

  inputTypeLabel(t: string): string {
    return { photo: 'Photo', yesno: 'Yes / No', text: 'Text', number: 'Number', checklist: 'Checklist' }[t] ?? t;
  }
  levelLabel(id: number | null): string {
    return id === 2 ? 'Silver' : id === 3 ? 'Gold' : 'All levels';
  }

  loadBasic(): void { this.api.basicInfoItems(true).subscribe((r) => this.basicItems.set(r)); }
  loadDocs(): void { this.api.documentRequirements(true).subscribe((r) => this.docs.set(r)); }

  // ---- basic info ----
  startBasicEdit(i: BasicInfoItem): void {
    this.editingBasicId.set(i.basicInfoItemId);
    this.basicForm.set({ code: i.code, groupName: i.groupName, label: i.label, helpText: i.helpText ?? '', inputType: i.inputType, isRequired: i.isRequired });
    this.basicError.set(null);
  }
  cancelBasicEdit(): void {
    this.editingBasicId.set(null);
    this.basicForm.set({ code: '', groupName: '', label: '', helpText: '', inputType: 'photo', isRequired: true });
    this.basicError.set(null);
  }
  saveBasic(): void {
    const f = this.basicForm();
    if (!f.code.trim() || !f.groupName.trim() || !f.label.trim()) return this.basicError.set('Code, group and label are required.');
    this.savingBasic.set(true); this.basicError.set(null);
    const body = { ...f, code: f.code.trim(), groupName: f.groupName.trim(), label: f.label.trim(), helpText: f.helpText.trim() || null };
    const id = this.editingBasicId();
    const done = (): void => { this.savingBasic.set(false); this.cancelBasicEdit(); this.loadBasic(); };
    const fail = (r: ApiError): void => { this.savingBasic.set(false); this.basicError.set(firstError(r)); };
    if (id === null) this.api.createBasicInfoItem(body).subscribe({ next: done, error: fail });
    else this.api.updateBasicInfoItem(id, body).subscribe({ next: done, error: fail });
  }

  // ---- documents ----
  startDocEdit(d: DocumentRequirement): void {
    this.editingDocId.set(d.documentRequirementId);
    this.docForm.set({ code: d.code, name: d.name, helpText: d.helpText ?? '', certificationLevelId: d.certificationLevelId, acceptedTypes: d.acceptedTypes, isMandatory: d.isMandatory });
    this.docError.set(null);
  }
  cancelDocEdit(): void {
    this.editingDocId.set(null);
    this.docForm.set({ code: '', name: '', helpText: '', certificationLevelId: null, acceptedTypes: 'image/*,application/pdf', isMandatory: true });
    this.docError.set(null);
  }
  saveDoc(): void {
    const f = this.docForm();
    if (!f.code.trim() || !f.name.trim()) return this.docError.set('Code and document name are required.');
    this.savingDoc.set(true); this.docError.set(null);
    const body = { ...f, code: f.code.trim(), name: f.name.trim(), helpText: f.helpText.trim() || null };
    const id = this.editingDocId();
    const done = (): void => { this.savingDoc.set(false); this.cancelDocEdit(); this.loadDocs(); };
    const fail = (r: ApiError): void => { this.savingDoc.set(false); this.docError.set(firstError(r)); };
    if (id === null) this.api.createDocumentRequirement(body).subscribe({ next: done, error: fail });
    else this.api.updateDocumentRequirement(id, body).subscribe({ next: done, error: fail });
  }

  // ---- enable/disable ----
  closeConfirm(): void { this.confirming.set(null); this.reason.set(''); this.reasonError.set(null); }
  confirmToggle(): void {
    const c = this.confirming();
    if (!c) return;
    if (this.reason().trim().length === 0) { this.reasonError.set('Give a reason. It is recorded.'); return; }
    const reason = this.reason().trim();
    const done = (): void => { this.closeConfirm(); if (c.kind === 'basic') this.loadBasic(); else this.loadDocs(); };
    const fail = (r: ApiError): void => this.reasonError.set(firstError(r));
    const req = c.kind === 'basic'
      ? this.api.setBasicInfoItemStatus(c.id, !c.isActive, reason)
      : this.api.setDocumentRequirementStatus(c.id, !c.isActive, reason);
    req.subscribe({ next: done, error: fail });
  }
}

interface ApiError { error?: { errors?: Record<string, string[]>; title?: string; message?: string } }

function firstError(r: ApiError): string {
  const errs = r.error?.errors;
  const first = errs ? Object.values(errs)[0]?.[0] : undefined;
  return first ?? r.error?.message ?? r.error?.title ?? 'Could not save. Please try again.';
}
