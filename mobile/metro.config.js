// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * expo-sqlite runs on WebAssembly in a browser, and Metro does not treat .wasm
 * as an asset by default — the web preview fails to bundle without this. The
 * native builds are unaffected; they use the platform's own SQLite.
 */
config.resolver.assetExts.push('wasm');

// The SQLite worker needs cross-origin isolation to use SharedArrayBuffer.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return middleware(req, res, next);
};

module.exports = config;
