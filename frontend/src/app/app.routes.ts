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
        path: 'technology-upgradation',
        canActivate: [permissionGuard('TECH_UPGRAD')],
        loadComponent: () =>
          import('./features/masters/technology.component').then((m) => m.TechnologyComponent),
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
