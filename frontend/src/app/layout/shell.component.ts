import { Component, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../core/auth.service';
import { MenuItem } from '../core/models';

/**
 * The portal frame: collapsible sidebar, topbar with breadcrumb and user chip,
 * and the routed content area.
 *
 * The sidebar is driven by the menu the API returns rather than a hard-coded
 * list, because the menu a user sees is part of the authorisation model — a
 * role that cannot open Assessments is not sent that branch. Hard-coding it
 * would show every module to everyone and rely on the route guard to slam the
 * door, which is a worse experience and a worse disclosure.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly menu = this.auth.menu;

  readonly collapsed = signal(false);
  readonly openGroups = signal<Set<string>>(new Set());
  readonly userMenuOpen = signal(false);

  /** Current URL, tracked so the active item and breadcrumb stay in step. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Breadcrumb built from the menu tree, matching the design's
   * "Home › User Management › Implementing Agency".
   */
  readonly breadcrumb = computed<string[]>(() => {
    const current = this.url();

    for (const parent of this.menu()) {
      for (const child of parent.children) {
        if (child.routePath && isOn(current, child.routePath)) {
          return [parent.label, child.label];
        }
      }

      if (parent.routePath && isOn(current, parent.routePath)) {
        return [parent.label];
      }
    }

    return [];
  });

  readonly pageTitle = computed(() => {
    const trail = this.breadcrumb();
    return trail.length > 0 ? trail[trail.length - 1] : 'MSME Competitive (LEAN) Scheme';
  });

  constructor() {
    effect(() => {
      const current = this.url();
      const open = new Set(this.openGroups());

      for (const parent of this.menu()) {
        if (parent.children.some((c) => c.routePath && isOn(current, c.routePath))) {
          open.add(parent.code);
        }
      }

      if (open.size !== this.openGroups().size) this.openGroups.set(open);
    });
  }

  isGroupOpen(item: MenuItem): boolean {
    return this.openGroups().has(item.code);
  }

  /** A parent counts as active while any of its children is the open route. */
  isGroupActive(item: MenuItem): boolean {
    const current = this.url();

    if (item.routePath && isOn(current, item.routePath)) return true;
    return item.children.some((child) => child.routePath && isOn(current, child.routePath));
  }

  isActive(item: MenuItem): boolean {
    return !!item.routePath && isOn(this.url(), item.routePath);
  }

  /** Opens a group without closing it if the user clicks the parent again. */
  openGroup(item: MenuItem): void {
    const next = new Set(this.openGroups());
    next.add(item.code);
    this.openGroups.set(next);
  }

  toggleGroup(item: MenuItem): void {
    const next = new Set(this.openGroups());
    next.has(item.code) ? next.delete(item.code) : next.add(item.code);
    this.openGroups.set(next);
  }

  /** Splits "/x?y=z" so routerLink gets the path and the query separately. */
  linkOf(item: MenuItem): unknown[] {
    return [item.routePath?.split('?')[0] ?? '/'];
  }

  queryOf(item: MenuItem): Record<string, string> {
    const query = item.routePath?.split('?')[1];
    if (!query) return {};

    return Object.fromEntries(new URLSearchParams(query));
  }

  logout(): void {
    this.auth.logout();
  }
}

/**
 * Route matching that ignores the query string but respects segment
 * boundaries — without the boundary check `/parameters` would light up while
 * `/parameters-archive` was open.
 */
function isOn(currentUrl: string, routePath: string): boolean {
  const current = currentUrl.split('?')[0];
  const target = routePath.split('?')[0];

  return current === target || current.startsWith(`${target}/`);
}
