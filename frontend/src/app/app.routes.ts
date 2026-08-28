import { Routes } from '@angular/router';

import { authGuard, paramPermissionGuard, permissionGuard } from './core/auth.guard';

/**
 * Silver and Gold are separate modules in the permission matrix, so the shared
 * /questionnaire/:level route resolves its module from the level in the URL.
 */
const questionnaireModule = (level: string): string =>
  level.toLowerCase() === 'gold' ? 'QUES_GOLD' : 'QUES_SILVER';

/**
 * Route paths mirror `auth.MenuItem.RoutePath` in the database, because the
 * sidebar is built from those rows — a path that differs here would render a
 * menu entry that navigates nowhere.
 *
 * Every screen is lazily loaded. With fifteen modules the initial bundle would
 * otherwise carry the whole portal to the sign-in page.
 */
export const routes: Routes = [
  // The applicant registration wizard. Deliberately OUTSIDE the shell route:
  // it has no sidebar, no admin layout and no authGuard — the applicant has no
  // account until the last step creates one. It is served on its own domain in
  // production; the routes stay distinct so the two never share a screen.
  {
    path: 'register',
    loadComponent: () =>
      import('./features/registration/registration.component').then((m) => m.RegistrationComponent),
  },

  // What the QR on a pledge certificate opens. Public and outside every guard:
  // it is scanned by whoever is holding the certificate — a buyer, an auditor —
  // and a verification page that asks the reader to sign in verifies nothing.
  {
    path: 'pledge/:reference',
    loadComponent: () =>
      import('./features/registration/pledge-verify.component').then(
        (m) => m.PledgeVerifyComponent,
      ),
  },

  // The applicant portal lands on its sign-in, with Register offered from
  // there — someone returning to check an application should not have to step
  // past the registration wizard to reach it.
  { path: 'msme', pathMatch: 'full', redirectTo: 'msme/login' },

  // The applicant's own sign-in. Separate from /login, which is the master
  // administration entry point — different audience, different credential
  // (LEAN ID vs staff code) and a different landing screen.
  // Where an applicant lands after signing in. Outside the shell, like the
  // rest of the applicant screens — msme-login sent people here before the
  // route existed, so sign-in ended on the admin wildcard and looked broken.
  {
    path: 'msme/dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/registration/msme-dashboard.component').then(
        (m) => m.MsmeDashboardComponent,
      ),
  },

  {
    path: 'msme/login',
    loadComponent: () =>
      import('./features/registration/msme-login.component').then((m) => m.MsmeLoginComponent),
  },

  {
    path: 'msme/reset-password',
    loadComponent: () =>
      import('./features/registration/msme-reset-password.component').then(
        (m) => m.MsmeResetPasswordComponent,
      ),
  },

  // The post-registration Silver application and its payment, on web. Guarded
  // like the applicant dashboard — an MSME session reaches them.
  {
    path: 'msme/application',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/registration/msme-application.component').then((m) => m.MsmeApplicationComponent),
  },
  {
    path: 'msme/payment',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/registration/msme-payment.component').then((m) => m.MsmePaymentComponent),
  },

  // Section-menu destinations whose full web screens are not built yet. They
  // carry the same masthead + section menu so the chrome is complete and no tab
  // is a dead link, and point people at where the data lives (the mobile app,
  // for LEAN Silver).
  {
    path: 'msme/certificates',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/registration/msme-certificates.component').then((m) => m.MsmeCertificatesComponent),
  },
  {
    path: 'msme/documents',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/registration/msme-documents.component').then((m) => m.MsmeDocumentsComponent),
  },
  {
    path: 'msme/payments',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/registration/msme-payments.component').then((m) => m.MsmePaymentsComponent),
  },
  {
    path: 'msme/profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/registration/msme-profile.component').then((m) => m.MsmeProfileComponent),
  },
  {
    path: 'msme/help',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/registration/msme-help.component').then((m) => m.MsmeHelpComponent),
  },

  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },

  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

      {
        path: 'dashboard',
        canActivate: [permissionGuard('DASHBOARD')],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },

      // ----------------------------------------------- user management ---
      // The static 'permissions' path is declared before 'users/:id' so it is
      // never swallowed by the id parameter.
      {
        path: 'user-management',
        pathMatch: 'full',
        canActivate: [permissionGuard('USER_MGMT')],
        loadComponent: () =>
          import('./features/user-management/user-management.component').then(
            (m) => m.UserManagementComponent,
          ),
      },
      {
        path: 'user-management/permissions',
        canActivate: [permissionGuard('USER_MGMT', 'edit')],
        loadComponent: () =>
          import('./features/user-management/permissions.component').then(
            (m) => m.PermissionsComponent,
          ),
      },
      {
        path: 'user-management/type/:accountTypeId',
        pathMatch: 'full',
        canActivate: [permissionGuard('USER_MGMT')],
        loadComponent: () =>
          import('./features/user-management/user-list.component').then((m) => m.UserListComponent),
      },
      {
        path: 'user-management/type/:accountTypeId/new',
        canActivate: [permissionGuard('USER_MGMT', 'create')],
        loadComponent: () =>
          import('./features/user-management/user-form.component').then((m) => m.UserFormComponent),
      },
      {
        path: 'user-management/users/:id',
        pathMatch: 'full',
        canActivate: [permissionGuard('USER_MGMT')],
        loadComponent: () =>
          import('./features/user-management/user-detail.component').then(
            (m) => m.UserDetailComponent,
          ),
      },
      {
        path: 'user-management/users/:id/edit',
        canActivate: [permissionGuard('USER_MGMT', 'edit')],
        loadComponent: () =>
          import('./features/user-management/user-form.component').then((m) => m.UserFormComponent),
      },

      // --------------------------------------------- upload documents ---
      {
        path: 'documents',
        pathMatch: 'full',
        canActivate: [permissionGuard('DOCUMENTS')],
        loadComponent: () =>
          import('./features/documents/documents.component').then((m) => m.DocumentsComponent),
      },
      {
        path: 'documents/:id',
        pathMatch: 'full',
        canActivate: [permissionGuard('DOCUMENTS')],
        data: { mode: 'view' },
        loadComponent: () =>
          import('./features/documents/document-detail.component').then(
            (m) => m.DocumentDetailComponent,
          ),
      },
      {
        path: 'documents/:id/edit',
        canActivate: [permissionGuard('DOCUMENTS', 'edit')],
        data: { mode: 'edit' },
        loadComponent: () =>
          import('./features/documents/document-detail.component').then(
            (m) => m.DocumentDetailComponent,
          ),
      },

      // ------------------------------------------------------- masters ---
      {
        path: 'sectors',
        canActivate: [permissionGuard('SECTORS')],
        loadComponent: () =>
          import('./features/masters/sectors.component').then((m) => m.SectorsComponent),
      },
      {
        path: 'parameters',
        canActivate: [permissionGuard('PARAMETER')],
        loadComponent: () =>
          import('./features/masters/parameters.component').then((m) => m.ParametersComponent),
      },
      {
        path: 'technology-upgradation/categories',
        canActivate: [permissionGuard('TECH_UPGRAD')],
        loadComponent: () =>
          import('./features/masters/technology-categories.component').then(
            (m) => m.TechnologyCategoriesComponent,
          ),
      },
      {
        path: 'technology-upgradation',
        canActivate: [permissionGuard('TECH_UPGRAD')],
        loadComponent: () =>
          import('./features/masters/technology.component').then((m) => m.TechnologyComponent),
      },

      // ------------------------------------------- ESG & application forms ---
      {
        path: 'esg-checklist',
        canActivate: [permissionGuard('ESG_CHECKLIST')],
        loadComponent: () =>
          import('./features/masters/esg-checklist.component').then((m) => m.EsgChecklistComponent),
      },
      {
        path: 'basic-info-documents',
        canActivate: [permissionGuard('BASIC_INFO_DOCS')],
        loadComponent: () =>
          import('./features/masters/basic-info-documents.component').then(
            (m) => m.BasicInfoDocumentsComponent,
          ),
      },

      // --------------------------------------------------- fee structure ---
      {
        path: 'fee-structure',
        canActivate: [permissionGuard('FEE_STRUCTURE')],
        loadComponent: () =>
          import('./features/fee/fee-structure.component').then((m) => m.FeeStructureComponent),
      },
      {
        path: 'fee-structure/:level',
        canActivate: [permissionGuard('FEE_STRUCTURE')],
        loadComponent: () =>
          import('./features/fee/fee-level.component').then((m) => m.FeeLevelComponent),
      },

      // ------------------------------------------------------- incentives ---
      // One overview and four provider sub-menus, each with a create form. The
      // provider is a route parameter rather than four sets of components: the
      // screens differ in three fields and their wording, not in what they do.
      {
        path: 'incentives',
        pathMatch: 'full',
        canActivate: [permissionGuard('INCENTIVES')],
        loadComponent: () =>
          import('./features/incentives/incentives-overview.component').then(
            (m) => m.IncentivesOverviewComponent,
          ),
      },
      {
        path: 'incentives/:provider/new',
        canActivate: [permissionGuard('INCENTIVES', 'create')],
        loadComponent: () =>
          import('./features/incentives/incentive-form.component').then(
            (m) => m.IncentiveFormComponent,
          ),
      },
      {
        path: 'incentives/:provider/:id',
        canActivate: [permissionGuard('INCENTIVES', 'edit')],
        loadComponent: () =>
          import('./features/incentives/incentive-form.component').then(
            (m) => m.IncentiveFormComponent,
          ),
      },
      {
        path: 'incentives/:provider',
        canActivate: [permissionGuard('INCENTIVES')],
        loadComponent: () =>
          import('./features/incentives/incentives-list.component').then(
            (m) => m.IncentivesListComponent,
          ),
      },

      // --------------------------------------------------- questionnaire ---
      // One menu, two levels. The parent lands on Silver rather than showing a
      // chooser, because the sub-menu already is the chooser.
      { path: 'questionnaire', pathMatch: 'full', redirectTo: 'questionnaire/silver' },
      {
        path: 'questionnaire/:level/new',
        canActivate: [paramPermissionGuard('level', questionnaireModule)],
        loadComponent: () =>
          import('./features/questionnaire/question-form.component').then(
            (m) => m.QuestionFormComponent,
          ),
      },
      {
        path: 'questionnaire/:level',
        canActivate: [paramPermissionGuard('level', questionnaireModule)],
        loadComponent: () =>
          import('./features/questionnaire/questionnaire.component').then(
            (m) => m.QuestionnaireComponent,
          ),
      },

      // -------------------------------------------------------------- reports ---
      {
        path: 'reports',
        canActivate: [permissionGuard('REPORTS')],
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },

      // -------------------------------------------------------------- emailer ---
      // One menu, two halves: Campaign is a bulk send, Transactional is the
      // library of templates the portal fires by itself.
      { path: 'emailer', pathMatch: 'full', redirectTo: 'emailer/campaign' },
      {
        path: 'emailer/campaign',
        canActivate: [permissionGuard('EMAILER')],
        loadComponent: () =>
          import('./features/emailer/campaign.component').then((m) => m.CampaignComponent),
      },
      {
        path: 'emailer/transactional',
        pathMatch: 'full',
        canActivate: [permissionGuard('EMAILER')],
        loadComponent: () =>
          import('./features/emailer/templates.component').then((m) => m.TemplatesComponent),
      },
      {
        path: 'emailer/transactional/:id',
        canActivate: [permissionGuard('EMAILER', 'edit')],
        loadComponent: () =>
          import('./features/emailer/template-edit.component').then((m) => m.TemplateEditComponent),
      },

      // -------------------------------------------------------- settings ---
      { path: 'settings', pathMatch: 'full', redirectTo: 'settings/system' },
      {
        path: 'settings/system',
        canActivate: [permissionGuard('SETTINGS')],
        data: { section: 'system' },
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'settings/audit-logs',
        canActivate: [permissionGuard('SETTINGS')],
        data: { section: 'audit-logs' },
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'settings/error-logs',
        canActivate: [permissionGuard('SETTINGS')],
        data: { section: 'error-logs' },
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'settings/apis',
        canActivate: [permissionGuard('SETTINGS')],
        data: { section: 'apis' },
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },

      { path: '**', redirectTo: 'dashboard' },
    ],
  },

  { path: '**', redirectTo: '' },
];
