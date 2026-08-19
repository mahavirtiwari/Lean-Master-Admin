import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Blocks the shell until there is a session, remembering where to return to. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

/**
 * Module-level gate, e.g. `permissionGuard('SECTORS', 'view')`.
 *
 * A user who reaches a route they cannot open is sent to the dashboard rather
 * than shown an error: the sidebar never offered them the link, so arriving
 * here means a typed URL or a stale bookmark, not a failure worth reporting.
 */
export function permissionGuard(module: string, right = 'view'): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    return auth.can(module, right) ? true : router.createUrlTree(['/dashboard']);
  };
}

/**
 * A guard whose module depends on a route parameter.
 *
 * Questionnaire needs this: one route serves both levels, but Silver and Gold
 * are separate modules in the permission matrix. Guarding the shared route on a
 * single module would either lock a Gold-only user out of Gold, or let a
 * Silver-only user open it.
 */
export function paramPermissionGuard(
  param: string,
  moduleFor: (value: string) => string,
  right = 'view',
): CanActivateFn {
  return (route) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const value = route.paramMap.get(param) ?? '';

    return auth.can(moduleFor(value), right) ? true : router.createUrlTree(['/dashboard']);
  };
}
