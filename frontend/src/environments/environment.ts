// Dev points at the API through the CLI proxy (proxy.conf.json), so the browser
// sees a same-origin /api and no CORS pre-flight is involved.
export const environment = {
  production: false,
  apiBase: '/api',

  // Where the LEAN MSME mobile app can be had. A badge with no URL is shown
  // as coming soon rather than linking nowhere, so these can be filled in as
  // each listing goes live. `apk` is the direct download the QR points at.
  mobileApp: {
    ios: '',
    android: '',
    apk: '',
  },
};
