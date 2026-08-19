import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { CurrentUser, LoginResponse, MenuItem } from './models';

const TOKEN_KEY = 'mcls.access';
const REFRESH_KEY = 'mcls.refresh';
const USER_KEY = 'mcls.user';

/**
 * Session state for the portal.
 *
 * The signed-in user is held in a signal rather than fetched per screen: the
 * shell needs the menu, every guard needs the permission set, and the topbar
 * needs the name, so re-requesting it would mean three calls on every
 * navigation.
 *
 * The session is restored from sessionStorage on boot so a refresh does not
 * bounce the user to the sign-in screen mid-demo. sessionStorage rather than
 * localStorage: closing the tab ends the session, which is the behaviour a
 * government portal is expected to have.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<CurrentUser | null>(restore());

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly menu = computed<MenuItem[]>(() => this._user()?.menu ?? []);

  get accessToken(): string | null {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  login(userId: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiBase}/auth/login`, { userId, password })
      .pipe(tap((response) => this.store(response)));
  }

  /**
   * Clears the session. The API call is fire-and-forget: if the refresh token
   * cannot be revoked because the network is down, the local session must still
   * end — leaving the user apparently signed in would be worse.
   */
  logout(): void {
    const refreshToken = sessionStorage.getItem(REFRESH_KEY);

    if (refreshToken) {
      this.http
        .post(`${environment.apiBase}/auth/logout`, { refreshToken })
        .subscribe({ error: () => undefined });
    }

    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(USER_KEY);
    this._user.set(null);
    void this.router.navigate(['/login']);
  }

  /** True when the user holds `MODULE.right`, e.g. `SECTORS.edit`. */
  can(module: string, right: string): boolean {
    return this._user()?.permissions.includes(`${module}.${right}`) ?? false;
  }

  private store(response: LoginResponse): void {
    sessionStorage.setItem(TOKEN_KEY, response.accessToken);
    sessionStorage.setItem(REFRESH_KEY, response.refreshToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this._user.set(response.user);
  }
}

function restore(): CurrentUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CurrentUser;
  } catch {
    // A corrupt entry would otherwise throw on every boot and leave the app
    // stuck on a blank page.
    sessionStorage.removeItem(USER_KEY);
    return null;
  }
}
