// Dev points at the API through the CLI proxy (proxy.conf.json), so the browser
// sees a same-origin /api and no CORS pre-flight is involved.
export const environment = {
  production: false,
  apiBase: '/api',
};
