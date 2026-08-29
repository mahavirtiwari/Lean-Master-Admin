import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/**
 * Whether the portal has navigated within itself yet.
 *
 * A Back button that calls history.back() blindly will walk out of the portal
 * when the screen was opened from a bookmark, an email link, or a fresh tab —
 * the applicant lands wherever they were before, which is not "back" in any
 * sense they meant. Counting the app's own navigations tells the two cases
 * apart: one entry means this screen is where they came in, so Back has to be
 * a route rather than a history step.
 */
@Injectable({ providedIn: 'root' })
export class AppHistory {
  private readonly router = inject(Router);
  private navigations = 0;

  constructor() {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) this.navigations += 1;
    });
  }

  /** True once there is a previous portal screen to step back to. */
  get canGoBack(): boolean {
    return this.navigations > 1;
  }
}
