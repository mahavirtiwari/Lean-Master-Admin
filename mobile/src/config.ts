import Constants from 'expo-constants';

/**
 * Where the API lives.
 *
 * A phone cannot reach the desktop's localhost, so this has to be a host the
 * device can actually see: the machine's LAN address while developing, or the
 * deployed origin. 10.0.2.2 is the Android emulator's alias for the host
 * machine, which makes the default work out of the box on an emulator.
 *
 * Set it in app.json under expo.extra.apiBaseUrl, or override it per build with
 * EXPO_PUBLIC_API_BASE_URL.
 */
const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? fromExtra ?? 'http://10.0.2.2:5199';

/**
 * How long a request waits before it is treated as unreachable.
 *
 * Deliberately short. On a weak connection the point is to fall back to the
 * offline path quickly rather than leave somebody watching a spinner — the work
 * is saved locally either way.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Shown when something needs a human. */
export const SUPPORT_EMAIL = 'consultancy.zed@qcin.org';

/** Matches the server's OTP window, for the countdown on the OTP screen. */
export const OTP_VALID_MINUTES = 10;
