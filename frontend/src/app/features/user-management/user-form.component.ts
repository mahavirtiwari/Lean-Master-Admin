import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

import { ApiService } from '../../core/api.service';
import {
  AccountTypeSummary,
  DistrictRef,
  LookupValue,
  Organisation,
  Role,
  StateRef,
} from '../../core/models';
import { PageIntroComponent } from '../../shared/ui';

/**
 * The wording of section 2 and 3 per account type, taken from the artboards:
 * 49 (Implementing Agency), 52 (Ministry of MSME) and 59 (State Specific).
 *
 * The three screens are the same form with different labels — an Implementing
 * Agency has an "Organisation Name" and a "Contact Person", a Ministry office a
 * "Department Name" and an "Officer". Only the IA form carries a registration
 * number and an agency category.
 */
const TYPE_COPY: Record<
  number,
  {
    section: string;
    orgLabel: string;
    addressLabel: string;
    personLabel: string;
    showRegistration: boolean;
    showCategory: boolean;
  }
> = {
  1: {
    section: 'Implementing Agency Details',
    orgLabel: 'ORGANISATION NAME',
    addressLabel: 'REGISTERED ADDRESS',
    personLabel: 'CONTACT PERSON NAME',
    showRegistration: true,
    showCategory: true,
  },
  2: {
    section: 'Ministry of MSME Details',
    orgLabel: 'DEPARTMENT NAME',
    addressLabel: 'OFFICE ADDRESS',
    personLabel: 'OFFICER NAME',
    showRegistration: false,
    showCategory: false,
  },
  3: {
    section: 'State Specific Details',
    orgLabel: 'STATE DEPARTMENT',
    addressLabel: 'OFFICE ADDRESS',
    personLabel: 'OFFICER NAME',
    showRegistration: false,
    showCategory: false,
  },
};

/**
 * Create / Edit User — 2a, 41, 47, 48, 49, 52, 59 (create) and 43, 54, 61 (edit).
 *
 * Three numbered sections, as drawn: Account Type, {type} Details, and Nodal
 * Contact &amp; Access.
 *
 * The middle section captures the organisation rather than picking one from a
 * list. That is the point of these screens: an Implementing Agency is
 * registered at the moment its first nodal contact is, so until then there is
 * nothing to pick. On edit the organisation already exists, so it is shown
 * read-only — renaming a department is not what this screen is for.
 */
/** A module this caller holds, and the rights on it they may pass on. */
interface GrantableModule {
  moduleId: number;
  name: string;
  rights: { permissionId: number; right: string }[];
}

@Component({
  selector: 'app-user-form',
  imports: [FormsModule, PageIntroComponent],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.scss',
})
export class UserFormComponent {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** /user-management/type/:accountTypeId/new */
  readonly accountTypeId = input<string>();
  /** /user-management/users/:id/edit */
  readonly id = input<string>();

  readonly types = signal<AccountTypeSummary[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly states = signal<StateRef[]>([]);
  readonly districts = signal<DistrictRef[]>([]);
  readonly categories = signal<LookupValue[]>([]);
  readonly existingOrg = signal<Organisation | null>(null);

  /** Modules this caller may pass on, and the ones ticked for the sub-user. */
  readonly grantable = signal<GrantableModule[]>([]);
  readonly grantedIds = signal<Set<number>>(new Set());

  /**
   * Section 4 — the states and districts a State Specific officer covers.
   *
   * A state ticked with no districts named means the whole state, which is
   * what gets stored: a state gains districts over time, and "all of
   * Maharashtra" written out as today's districts stops meaning that the day
   * a new one is created.
   */
  readonly allDistricts = signal<DistrictRef[]>([]);
  readonly coveredStates = signal<Set<number>>(new Set());
  readonly coveredDistricts = signal<Set<number>>(new Set());
  readonly expandedState = signal<number | null>(null);

  readonly saving = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly selectedType = signal(1);

  /** Section 2 — the organisation. */
  readonly org = signal({
    name: '',
    registrationNo: '',
    categoryLookupId: '' as string | number,
    addressLine: '',
    stateId: '' as string | number,
    districtId: '' as string | number,
    pincode: '',
  });

  /** Section 3 — the person. */
  readonly person = signal({
    fullName: '',
    designation: '',
    email: '',
    mobile: '',
    roleId: '' as string | number,
    jurisdiction: '',
  });

  readonly isEdit = computed(() => !!this.id());

  readonly copy = computed(
    () => TYPE_COPY[this.selectedType()] ?? TYPE_COPY[1],
  );

  /** Only the three the Ministry issues directly. */
  readonly creatableTypes = computed(() =>
    this.types()
      .filter((t) => t.canCreateDirectly)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  readonly heading = computed(() => (this.isEdit() ? 'Edit User' : 'Create New User'));

  /** Only State Specific officers cover a list of places. */
  readonly showJurisdictions = computed(() => this.selectedType() === 3);

  readonly allStatesCovered = computed(
    () => this.states().length > 0 && this.coveredStates().size === this.states().length,
  );

  readonly coverageSummary = computed(() => {
    const states = this.coveredStates().size;
    const districts = this.coveredDistricts().size;

    if (states === 0) return 'Nothing selected yet';

    const whole = [...this.coveredStates()]
      .filter((id) => !this.allDistricts().some(
        (d) => d.stateId === id && this.coveredDistricts().has(d.districtId)))
      .length;

    const parts = [`${states} state${states === 1 ? '' : 's'}`];
    if (districts > 0) parts.push(`${districts} named district${districts === 1 ? '' : 's'}`);
    if (whole > 0) parts.push(`${whole} in full`);

    return parts.join(' · ');
  });

  /**
   * A firm creating a colleague rather than an agency creating a firm.
   *
   * Both are the same account type, so what tells them apart is whether an
   * organisation is being raised alongside the account. A Consultant
   * Organisation or Assessment Manager already has one — its own — so it is
   * creating a sub-user, and the form asks which modules they get instead of
   * asking for an address.
   */
  readonly isSubUser = computed(() => {
    if (this.isEdit()) return false;

    const me = this.auth.user();
    return me?.accountTypeId === this.selectedType()
        && (me?.accountTypeId === 6 || me?.accountTypeId === 7);
  });

  constructor() {
    this.api.userAccountTypes().subscribe((types) => this.types.set(types));

    // What this caller may hand on. Fetched once: a firm grants out of its own
    // access and no further, so the list does not change while the form is open.
    this.http.get<{ modules: GrantableModule[] }>(`${environment.apiBase}/users/grantable-permissions`)
      .subscribe({
        next: (r) => this.grantable.set(r.modules ?? []),
        error: () => this.grantable.set([]),
      });
    this.api.states().subscribe((states) => this.states.set(states));

    // Every district at once rather than one fetch per state opened: it is a
    // single list of a few hundred, and expanding a state should not wait.
    this.api.districts().subscribe({
      next: (d) => this.allDistricts.set(d),
      error: () => this.allDistricts.set([]),
    });
    this.api.lookupValues('AGENCY_CATEGORY').subscribe((v) => this.categories.set(v));

    // The effect depends on the route inputs and nothing else. The work it
    // triggers is untracked because both branches write signals they also
    // read — changeType() rewrites `person` from its own current value, which
    // re-triggered this effect and spun the component in a loop that locked
    // the tab on /user-management/type/:id/new.
    effect(() => {
      const editId = this.id();
      const typeId = Number(this.accountTypeId() ?? 1);

      untracked(() => {
        if (editId) this.loadUser(Number(editId));
        else this.changeType(typeId);
      });
    });
  }

  private loadUser(userId: number): void {
    this.loading.set(true);

    this.api.user(userId).subscribe({
      next: (u) => {
        this.selectedType.set(u.accountTypeId);
        this.api.roles(u.accountTypeId).subscribe((r) => this.roles.set(r));

        if (u.stateId) this.loadDistricts(u.stateId);

        this.person.set({
          fullName: u.fullName,
          designation: u.designation ?? '',
          email: u.email,
          mobile: u.mobile ?? '',
          roleId: u.roleId,
          jurisdiction: u.jurisdiction ?? '',
        });

        // The organisation is fixed once issued, so it is shown rather than
        // edited. Fetching it by account type is enough to name it.
        if (u.organisationId) {
          this.api.organisations(u.accountTypeId).subscribe((orgs) => {
            this.existingOrg.set(
              orgs.find((o) => o.organisationId === u.organisationId) ?? null,
            );
          });
        }

        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load that user.');
        this.loading.set(false);
      },
    });
  }

  changeType(typeId: number): void {
    if (this.isEdit()) return; // the account type is fixed once issued

    this.selectedType.set(typeId);
    this.person.set({ ...this.person(), roleId: '' });
    this.api.roles(typeId).subscribe((r) => this.roles.set(r));
  }

  onStateChange(value: string): void {
    this.org.set({ ...this.org(), stateId: value, districtId: '' });
    this.districts.set([]);

    if (value) this.loadDistricts(Number(value));
  }

  private loadDistricts(stateId: number): void {
    this.api.districts(stateId).subscribe((d) => this.districts.set(d));
  }

  save(): void {
    this.error.set(null);
    const p = this.person();
    const o = this.org();

    if (!p.fullName.trim()) {
      this.error.set('A name is required.');
      return;
    }

    // Only the edit screen asks for a role. A new account starts on its
    // account type's default, so requiring one here would block creation.
    if (this.isEdit() && !p.roleId) {
      this.error.set('A portal role is required.');
      return;
    }

    if (!this.isEdit()) {
      if (!p.email.trim()) {
        this.error.set('An e-mail address is required — the activation link is sent to it.');
        return;
      }

      if (!o.name.trim() || !o.addressLine.trim() || !o.stateId || !o.pincode.trim()) {
        this.error.set(
          `${this.copy().orgLabel.toLowerCase()}, address, state and pincode are all required.`,
        );
        return;
      }

      if (!/^\d{6}$/.test(o.pincode.trim())) {
        this.error.set('Enter a 6-digit pincode.');
        return;
      }
    }

    this.saving.set(true);

    const common = {
      ...(this.showJurisdictions() ? { jurisdictions: this.jurisdictionPayload() } : {}),
      fullName: p.fullName.trim(),
      mobile: p.mobile.trim() || null,
      designation: p.designation.trim() || null,
    };

    const editId = this.id();

    const request: Observable<unknown> = editId
      ? this.api.updateUser(Number(editId), {
          ...common,
          roleId: Number(p.roleId),
          organisationId: this.existingOrg()?.organisationId ?? null,
          stateId: this.org().stateId === '' ? null : Number(this.org().stateId),
          districtId: this.org().districtId === '' ? null : Number(this.org().districtId),
        })
      : this.isSubUser()
      ? this.api.createUser({
          ...common,
          email: p.email.trim(),
          accountTypeId: this.selectedType(),
          // The colleague joins the firm that is creating them; no new
          // organisation is raised, which is what marks this a sub-user.
          organisationId: this.auth.user()?.organisationId ?? null,
          permissions: [...this.grantedIds()],
        })
      : this.api.createUser({
          ...common,
          email: p.email.trim(),
          accountTypeId: this.selectedType(),
          // The organisation is created with the user, in one request.
          organisation: {
            name: o.name.trim(),
            addressLine: o.addressLine.trim(),
            stateId: Number(o.stateId),
            districtId: o.districtId === '' ? null : Number(o.districtId),
            pincode: o.pincode.trim(),
          },
        });

    request.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/user-management/type', this.selectedType()]);
      },
      error: (response: {
        error?: { errors?: Record<string, string[]>; title?: string; message?: string };
      }) => {
        this.saving.set(false);
        const first = response.error?.errors
          ? Object.values(response.error.errors)[0]?.[0]
          : undefined;
        this.error.set(
          first ?? response.error?.message ?? response.error?.title ?? 'Could not save the user.',
        );
      },
    });
  }

  // ---- section 4: applicable states and districts ----

  districtsOf(stateId: number): DistrictRef[] {
    return this.allDistricts().filter((d) => d.stateId === stateId);
  }

  stateCovered(stateId: number): boolean {
    return this.coveredStates().has(stateId);
  }

  districtCovered(districtId: number): boolean {
    return this.coveredDistricts().has(districtId);
  }

  /** Ticking a state covers all of it; unticking it drops its districts too. */
  toggleState(stateId: number): void {
    const states = new Set(this.coveredStates());
    const districts = new Set(this.coveredDistricts());

    if (states.has(stateId)) {
      states.delete(stateId);
      for (const d of this.districtsOf(stateId)) districts.delete(d.districtId);
    } else {
      states.add(stateId);
    }

    this.coveredStates.set(states);
    this.coveredDistricts.set(districts);
  }

  /**
   * Naming a district implies the state, and clearing the last one leaves the
   * state covered in full rather than covered by nothing.
   */
  toggleDistrict(stateId: number, districtId: number): void {
    const districts = new Set(this.coveredDistricts());
    const states = new Set(this.coveredStates());

    if (districts.has(districtId)) districts.delete(districtId);
    else {
      districts.add(districtId);
      states.add(stateId);
    }

    this.coveredStates.set(states);
    this.coveredDistricts.set(districts);
  }

  toggleAllStates(): void {
    if (this.allStatesCovered()) {
      this.coveredStates.set(new Set());
      this.coveredDistricts.set(new Set());
      return;
    }

    this.coveredStates.set(new Set(this.states().map((s) => s.stateId)));
    this.coveredDistricts.set(new Set());
  }

  /** Every district of one state at once. */
  toggleAllDistricts(stateId: number): void {
    const all = this.districtsOf(stateId);
    const districts = new Set(this.coveredDistricts());
    const on = all.every((d) => districts.has(d.districtId));

    for (const d of all) {
      if (on) districts.delete(d.districtId);
      else districts.add(d.districtId);
    }

    const states = new Set(this.coveredStates());
    if (!on) states.add(stateId);

    this.coveredStates.set(states);
    this.coveredDistricts.set(districts);
  }

  expand(stateId: number): void {
    this.expandedState.set(this.expandedState() === stateId ? null : stateId);
  }

  /** The selection as the API takes it: a state, and the districts named in it. */
  private jurisdictionPayload(): { stateId: number; districtIds: number[] }[] {
    return [...this.coveredStates()].map((stateId) => ({
      stateId,
      districtIds: this.districtsOf(stateId)
        .filter((d) => this.coveredDistricts().has(d.districtId))
        .map((d) => d.districtId),
    }));
  }

  toggleGrant(permissionId: number): void {
    const next = new Set(this.grantedIds());

    if (next.has(permissionId)) next.delete(permissionId);
    else next.add(permissionId);

    this.grantedIds.set(next);
  }

  isGranted(permissionId: number): boolean {
    return this.grantedIds().has(permissionId);
  }

  /** Ticks or clears every right on one module at once. */
  toggleModule(module: GrantableModule): void {
    const next = new Set(this.grantedIds());
    const on = module.rights.every((r) => next.has(r.permissionId));

    for (const right of module.rights) {
      if (on) next.delete(right.permissionId);
      else next.add(right.permissionId);
    }

    this.grantedIds.set(next);
  }

  moduleOn(module: GrantableModule): boolean {
    return module.rights.some((r) => this.grantedIds().has(r.permissionId));
  }

  cancel(): void {
    void this.router.navigate(['/user-management/type', this.selectedType()]);
  }
}
