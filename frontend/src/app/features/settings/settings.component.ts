import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  ApiEndpointRow,
  ApiKeyRow,
  ApiRateLimitRow,
  ApiRegistryRow,
  AuditFilters,
  AuditLog,
  AuditSummary,
  ErrorFilters,
  ErrorGroup,
  ErrorLog,
  ErrorSummary,
  ErrorVolume,
  PaymentGateway,
  SettingGroup,
  SystemSetting,
  WebhookRow,
} from '../../core/models';
import { EmptyComponent } from '../../shared/ui';

type Section = 'system' | 'audit-logs' | 'error-logs' | 'apis';

/** yyyy-MM-dd, which is what a native date input reads and writes. */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * The 28x28 tiles the group cards carry. Drawn as flat single-colour glyphs on
 * a #EFF4FA ground, so they are inlined rather than pulled from a sprite.
 */
const TILE_ICONS: Record<string, string> = {
  sliders:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
  award:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/></svg>',
  bell:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  shield:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  wrench:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3z"/></svg>',
  card:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  headset:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="14" width="5" height="6" rx="1.5"/><rect x="17" y="14" width="5" height="6" rx="1.5"/></svg>',
  list:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  grid:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  users:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/></svg>',
  alert:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  check:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  key:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.8-8.8M17 5l2.5 2.5M14.5 7.5 17 10"/></svg>',
  plug:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/></svg>',
  pulse:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-8 6 16 3-8h4"/></svg>',
};

const FALLBACK_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/></svg>';

/**
 * Settings (33-settings-system, 34-settings-audit-logs, 35-settings-error-logs,
 * 36-settings-apis).
 *
 * One component for the four sub-routes: they share the frame and differ only
 * in the panel below it. `section` arrives as a route input.
 *
 * System Settings edits into a draft keyed by setting id and posts the whole
 * screen on "Save Changes", which is what the artboard's single save button
 * implies — a per-field PUT would leave the screen half-applied if one field
 * were rejected.
 *
 * Sensitive settings come back masked from the API and are rendered as such —
 * the screen can replace a secret but never displays one.
 */
@Component({
  selector: 'app-settings',
  imports: [DecimalPipe, EmptyComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);

  /** Bound from the route data via withComponentInputBinding. */
  readonly section = input<Section>('system');

  readonly groups = signal<SettingGroup[]>([]);
  readonly maintenance = signal<SystemSetting[]>([]);
  readonly audit = signal<AuditLog[]>([]);
  readonly errors = signal<ErrorLog[]>([]);
  readonly apis = signal<ApiRegistryRow[]>([]);

  readonly gateways = signal<PaymentGateway[]>([]);
  readonly gwActive = signal(0);
  readonly gwTotal = signal(0);
  readonly defaultGateway = signal<string | null>(null);
  readonly autoFailover = signal(true);
  readonly retryAttempts = signal(2);

  readonly total = signal(0);
  readonly page = signal(1);
  /** Ten rows a page, as "Showing 1-10 of 2,340 entries" is drawn. */
  readonly pageSize = 10;

  readonly search = signal('');
  readonly resolvedFilter = signal('');

  // ---- Audit Logs filter bar -------------------------------------------
  readonly auditSummary = signal<AuditSummary>({
    totalEntries: 0,
    modulesTracked: 0,
    distinctUsers: 0,
    failedActions: 0,
  });

  readonly filters = signal<AuditFilters | null>(null);

  readonly fromDate = signal(isoDaysAgo(30));
  readonly toDate = signal(isoDaysAgo(0));
  readonly userFilter = signal('');
  readonly moduleFilter = signal('');
  readonly actionFilter = signal('');
  readonly outcomeFilter = signal('');

  readonly outcomeTabs = [
    { label: 'All', value: '' },
    { label: 'Success', value: 'Success' },
    { label: 'Failed', value: 'Failed' },
  ];

  // ---- Error Logs -------------------------------------------------------
  /** Eight faults a page, as "Showing 1-8 of 1,420 events" is drawn. */
  readonly errorPageSize = 8;

  readonly errorGroups = signal<ErrorGroup[]>([]);
  readonly errorFilters = signal<ErrorFilters | null>(null);
  readonly volume = signal<ErrorVolume>({ series: [], peak: 0 });

  readonly errorSummary = signal<ErrorSummary>({
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
    resolvedLast7Days: 0,
    totalEvents: 0,
  });

  readonly severityFilter = signal('');
  readonly statusFilter = signal('');

  // ---- API management ---------------------------------------------------
  readonly apiKeys = signal<ApiKeyRow[]>([]);
  readonly apiEndpoints = signal<ApiEndpointRow[]>([]);
  readonly rateLimits = signal<ApiRateLimitRow[]>([]);
  readonly webhooks = signal<WebhookRow[]>([]);

  readonly apiSummary = signal({
    activeEndpoints: 0,
    liveKeys: 0,
    calls24h: 0,
    errorRate: 0,
  });

  readonly endpointFilter = signal('');

  readonly endpointTabs = [
    { label: 'All', value: '' },
    { label: 'Live', value: 'Live' },
    { label: 'Deprecated', value: 'Deprecated' },
  ];

  readonly visibleEndpoints = computed(() => {
    const status = this.endpointFilter();
    return status ? this.apiEndpoints().filter((e) => e.status === status) : this.apiEndpoints();
  });

  readonly severityTabs = [
    { label: 'All', value: '' },
    { label: 'Critical', value: 'Critical' },
    { label: 'Error', value: 'Error' },
    { label: 'Warning', value: 'Warning' },
  ];

  /** The two screens page at different sizes, so the range follows the screen. */
  private readonly rows = computed(() =>
    this.section() === 'error-logs' ? this.errorPageSize : this.pageSize,
  );

  readonly rangeFrom = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.rows() + 1,
  );

  readonly rangeTo = computed(() => Math.min(this.page() * this.rows(), this.total()));

  /** Edited values, keyed by setting id. Only what differs is sent. */
  readonly draft = signal<Record<number, string>>({});
  private original: Record<number, string> = {};

  readonly saving = signal(false);
  readonly message = signal<string | null>(null);
  readonly failed = signal(false);

  readonly canEdit = this.auth.can('SETTINGS', 'edit');

  readonly dirty = computed(() =>
    Object.entries(this.draft()).some(([id, value]) => this.original[+id] !== value),
  );

  readonly enabledGateways = computed(() => this.gateways().filter((g) => g.isEnabled));

  readonly maintenanceEnabled = computed(
    () => this.maintenance().find((s) => s.key === 'Maintenance.Enabled') ?? null,
  );

  readonly maintenanceBanner = computed(
    () => this.maintenance().find((s) => s.key === 'Maintenance.Banner') ?? null,
  );

  readonly titles: Record<Section, string> = {
    system: 'System Settings',
    'audit-logs': 'Audit Logs',
    'error-logs': 'Error Logs',
    apis: 'API Management',
  };

  readonly subtitles: Record<Section, string> = {
    system: 'Portal-wide configuration for the MCLS Master Administration environment',
    'audit-logs': 'Every administrative action recorded against the record it changed',
    'error-logs': 'Unhandled errors captured by the API, with their correlation ids',
    apis: 'Keys, endpoints and integration health for external systems consuming MCLS data',
  };

  constructor() {
    // Re-runs whenever the route input changes, which is what makes the four
    // sub-menu links work without four components.
    queueMicrotask(() => this.reload());
  }

  reload(): void {
    switch (this.section()) {
      case 'system':
        this.api.systemSettings().subscribe((r) => {
          this.groups.set(r.groups);
          this.maintenance.set(r.maintenance);

          const draft: Record<number, string> = {};
          for (const s of [...r.groups.flatMap((g) => g.settings), ...r.maintenance]) {
            draft[s.systemSettingId] = s.value ?? '';
          }
          this.original = { ...draft };
          this.draft.set(draft);
        });

        this.api.paymentGateways().subscribe((r) => {
          this.gateways.set(r.gateways);
          this.gwActive.set(r.activeCount);
          this.gwTotal.set(r.totalCount);
          this.defaultGateway.set(r.defaultGateway);
        });
        break;

      case 'audit-logs': {
        const period = { fromUtc: this.fromDate(), toUtc: this.toDate() };

        this.api
          .auditLogs({
            ...period,
            search: this.search(),
            userId: this.userFilter(),
            moduleId: this.moduleFilter(),
            action: this.actionFilter(),
            outcome: this.outcomeFilter(),
            pageNumber: this.page(),
            pageSize: this.pageSize,
          })
          .subscribe((r) => {
            this.audit.set(r.items);
            this.total.set(r.totalCount);
          });

        // The tiles count over the same period as the table, so the two can
        // never disagree about what is being shown.
        this.api.auditSummary(period).subscribe((s) => this.auditSummary.set(s));

        if (!this.filters()) {
          this.api.auditFilters().subscribe((f) => this.filters.set(f));
        }
        break;
      }

      case 'error-logs': {
        const period = { fromUtc: this.fromDate(), toUtc: this.toDate() };

        this.api
          .errorLogs({
            ...period,
            severity: this.severityFilter(),
            status: this.statusFilter(),
            moduleId: this.moduleFilter(),
            pageNumber: this.page(),
            pageSize: this.errorPageSize,
          })
          .subscribe((r) => {
            this.errorGroups.set(r.items);
            this.total.set(r.totalCount);
          });

        this.api.errorSummary(period).subscribe((s) => this.errorSummary.set(s));
        this.api.errorVolume(14).subscribe((v) => this.volume.set(v));

        if (!this.errorFilters()) {
          this.api.errorFilters().subscribe((f) => this.errorFilters.set(f));
        }
        break;
      }

      case 'apis':
        this.api.apiManagement().subscribe((r) => {
          this.apiKeys.set(r.keys);
          this.apiEndpoints.set(r.endpoints);
          this.rateLimits.set(r.rateLimits);
          this.webhooks.set(r.webhooks);
          this.apiSummary.set(r.summary);
        });
        break;
    }
  }

  // ---------------------------------------------------------- system tab ---

  tileIcon(key: string | null): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      (key && TILE_ICONS[key]) || TILE_ICONS['sliders'] || FALLBACK_ICON,
    );
  }

  isOn(setting: SystemSetting): boolean {
    return (this.draft()[setting.systemSettingId] ?? '').toLowerCase() === 'true';
  }

  toggle(setting: SystemSetting): void {
    this.edit(setting, this.isOn(setting) ? 'false' : 'true');
  }

  edit(setting: SystemSetting, value: string): void {
    this.draft.set({ ...this.draft(), [setting.systemSettingId]: value });
    this.message.set(null);
  }

  saveAll(): void {
    const changed = Object.entries(this.draft())
      .filter(([id, value]) => this.original[+id] !== value)
      .map(([id, value]) => ({ systemSettingId: +id, value }));

    if (changed.length === 0) return;

    this.saving.set(true);
    this.failed.set(false);

    this.api.saveSystemSettings(changed).subscribe({
      next: () => {
        this.saving.set(false);
        this.original = { ...this.draft() };
        this.message.set(
          `${changed.length} setting${changed.length === 1 ? '' : 's'} saved. The change is audit-logged.`,
        );
      },
      error: (response: { error?: { message?: string; detail?: string; title?: string } }) => {
        this.saving.set(false);
        this.failed.set(true);
        this.message.set(
          response.error?.detail ??
            response.error?.message ??
            response.error?.title ??
            'Could not save the settings.',
        );
      },
    });
  }

  resetToDefault(): void {
    this.saving.set(true);
    this.failed.set(false);

    this.api.resetSystemSettings().subscribe({
      next: (r) => {
        this.saving.set(false);
        this.message.set(`${r.reset} settings returned to their shipped defaults.`);
        this.reload();
      },
      error: () => {
        this.saving.set(false);
        this.failed.set(true);
        this.message.set('Could not reset the settings.');
      },
    });
  }

  // ------------------------------------------------------ payment panel ---

  rateClass(rate: number): string {
    if (rate >= 97) return 'rate-good';
    return rate >= 95 ? 'rate-warn' : 'rate-bad';
  }

  /** "2 hours ago" / "3 days ago", as the LAST TXN column is drawn. */
  relative(iso: string): string {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 60) return `${Math.max(minutes, 1)} minutes ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  toggleGateway(gateway: PaymentGateway): void {
    this.failed.set(false);

    this.api.updatePaymentGateway(gateway.paymentGatewayId, !gateway.isEnabled).subscribe({
      next: () => this.reload(),
      error: (response: { error?: { detail?: string; title?: string } }) => {
        this.failed.set(true);
        this.message.set(
          response.error?.detail ?? response.error?.title ?? 'Could not change that gateway.',
        );
      },
    });
  }

  setDefaultGateway(name: string): void {
    this.defaultGateway.set(name);
  }

  // The three below are drawn but have no endpoint behind them yet; they say so
  // rather than doing nothing when clicked.
  addGateway(): void {
    this.failed.set(false);
    this.message.set('Adding a gateway is handled by the payments team, not from this screen.');
  }

  configureGateway(gateway: PaymentGateway): void {
    this.failed.set(false);
    this.message.set(
      `${gateway.name} credentials live in server configuration, not in the database — ` +
        'they are changed on the host, not here.',
    );
  }

  testGateway(gateway: PaymentGateway): void {
    this.failed.set(false);
    this.message.set(`A test transaction against ${gateway.name} has not been wired up yet.`);
  }

  scheduleWindow(): void {
    this.failed.set(false);
    this.message.set(
      `The maintenance window is ${this.settingValue('Maintenance.WindowFrom') || '02:00'}–` +
        `${this.settingValue('Maintenance.WindowTo') || '04:00'} IST.`,
    );
  }

  private settingValue(key: string): string {
    const setting = this.maintenance().find((s) => s.key === key);
    return setting ? (this.draft()[setting.systemSettingId] ?? '') : '';
  }

  // ---------------------------------------------------------- audit logs ---

  /** "2026-07-25 09:12:44", as the TIMESTAMP column is drawn. */
  stamp(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => `${n}`.padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }

  actionClass(action: string): string {
    switch (action) {
      case 'Login':
      case 'Logout':
        return 'act-login';
      case 'Create':
      case 'Insert':
        return 'act-create';
      case 'Update':
      case 'StatusChange':
        return 'act-update';
      case 'Delete':
      case 'Remove':
        return 'act-delete';
      default:
        return 'act-other';
    }
  }

  showDetail(row: AuditLog): void {
    this.failed.set(false);
    this.message.set(
      `${row.action} on ${row.entityName}` +
        `${row.entityKey ? ' #' + row.entityKey : ''} by ${row.userName ?? 'system'}` +
        `${row.affectedColumns ? ' — changed: ' + row.affectedColumns : ''}.`,
    );
  }

  /** Exports what the filters currently select, not the whole trail. */
  exportAudit(): void {
    const header = ['Timestamp', 'User', 'Role', 'Action', 'Module', 'IP Address', 'Status'];

    const lines = this.audit().map((r) =>
      [
        this.stamp(r.occurredOnUtc),
        r.userName ?? '',
        r.roleName ?? '',
        r.action,
        r.moduleName ?? r.entityName,
        r.ipAddress ?? '',
        r.outcome,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );

    const blob = new Blob([[header.join(','), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${this.fromDate()}-to-${this.toDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    this.failed.set(false);
    this.message.set(`Exported ${this.audit().length} entries from this page.`);
  }

  // ---------------------------------------------------------- error logs ---

  severityClass(severity: string): string {
    switch (severity) {
      case 'Critical':
      case 'Error':
        return 'state-bad';
      case 'Warning':
        return 'state-warn';
      default:
        return 'state-info';
    }
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Open':
        return 'state-bad';
      case 'Acknowledged':
        return 'state-info';
      default:
        return 'state-ok';
    }
  }

  /** Bar height as a share of the worst day, so the chart is always full-scale. */
  volHeight(count: number): number {
    const peak = this.volume().peak;
    return peak === 0 ? 4 : Math.max((count / peak) * 100, 4);
  }

  volClass(count: number): string {
    const peak = this.volume().peak;
    if (peak === 0) return '';
    const share = count / peak;
    if (share >= 0.8) return 'vol-high';
    return share >= 0.55 ? 'vol-mid' : '';
  }

  /** "12 Jul", as the chart axis is labelled. */
  dayLabel(iso: string): string {
    const d = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

  triage(row: ErrorGroup, status: string): void {
    this.failed.set(false);

    this.api.setErrorStatus(row.errorCode, status, 'Triaged from the portal').subscribe({
      next: (r) => {
        this.message.set(`${row.errorCode}: ${r.updated} occurrences marked ${status}.`);
        this.reload();
      },
      error: () => {
        this.failed.set(true);
        this.message.set(`Could not change the status of ${row.errorCode}.`);
      },
    });
  }

  exportErrors(): void {
    const header = ['Last seen', 'Error code', 'Severity', 'Module', 'Message', 'Count', 'Status'];

    const lines = this.errorGroups().map((r) =>
      [
        this.stamp(r.lastSeenUtc),
        r.errorCode,
        r.severity,
        r.moduleName ?? '',
        r.message,
        r.occurrences,
        r.status,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );

    const blob = new Blob([[header.join(','), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `error-logs-${this.fromDate()}-to-${this.toDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    this.failed.set(false);
    this.message.set(`Exported ${this.errorGroups().length} faults from this page.`);
  }

  // ------------------------------------------------------ api management ---

  /** "482K", as the CALLS (24H) tile is drawn. */
  compact(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return `${value}`;
  }

  year(iso: string): string {
    return `${new Date(iso).getFullYear()}`;
  }

  errRateClass(rate: number): string {
    if (rate < 0.5) return 'rate-good';
    return rate < 1 ? 'rate-warn' : 'rate-bad';
  }

  limitClass(percent: number): string {
    if (percent >= 75) return 'limit-high';
    return percent >= 50 ? 'limit-mid' : '';
  }

  revokeKey(key: ApiKeyRow): void {
    this.failed.set(false);

    this.api.revokeApiKey(key.apiKeyId).subscribe({
      next: (r) => {
        this.message.set(r.message);
        this.reload();
      },
      error: () => {
        this.failed.set(true);
        this.message.set(`Could not revoke ${key.name}.`);
      },
    });
  }

  // Rotation and generation both mint a secret, which has to be shown once and
  // then never again. That belongs in a dialog with a copy-once field rather
  // than in a table row, so the screen says where it happens instead of
  // pretending to do it.
  rotateKey(key: ApiKeyRow): void {
    this.failed.set(false);
    this.message.set(
      `Rotating ${key.name} issues a new secret that is displayed once. ` +
        'That is done from the key dialog, not from this row.',
    );
  }

  generateKey(): void {
    this.failed.set(false);
    this.message.set(
      'A new key is minted with its secret shown once and never again. ' +
        'The generation dialog is not wired up yet.',
    );
  }

  openApiDocs(): void {
    this.failed.set(false);
    this.message.set('The OpenAPI description is served at /openapi/v1.json.');
  }

  endpointLogs(endpoint: ApiEndpointRow): void {
    this.failed.set(false);
    this.message.set(
      `${endpoint.method} ${endpoint.route}: ${endpoint.calls24h.toLocaleString()} calls in the ` +
        `last 24 hours at a ${endpoint.errorRate}% error rate.`,
    );
  }

  // ------------------------------------------------------- other screens ---

  resolve(row: ErrorLog): void {
    this.api
      .resolveErrorLog(row.errorLogId, 'Reviewed from the portal')
      .subscribe(() => this.reload());
  }

  toggleApi(row: ApiRegistryRow): void {
    this.api
      .updateApi(row.apiRegistryId, {
        name: row.name,
        description: row.description,
        baseUrl: row.baseUrl,
        authType: row.authType,
        timeoutSeconds: row.timeoutSeconds,
        isEnabled: !row.isEnabled,
      })
      .subscribe(() => this.reload());
  }
}
