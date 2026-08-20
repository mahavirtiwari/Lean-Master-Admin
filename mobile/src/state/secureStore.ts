import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the session token is kept.
 *
 * On a device this is expo-secure-store — the Keychain on iOS, EncryptedSharedPreferences
 * on Android. That module has no web implementation and throws if it is called
 * there, which took the whole app down when the browser preview started.
 *
 * The web build exists so the screens can be reviewed on a desktop without a
 * phone. localStorage stands in for it there. That is deliberately NOT secure
 * storage, and it is only acceptable because the web target is a preview: it
 * is never shipped, and Play Store and App Store builds take the native path.
 */
const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  if (web) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Private browsing can refuse storage; the session then lasts the tab.
    }
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (web) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Nothing to do — see setItem.
    }
    return;
  }

  await SecureStore.deleteItemAsync(key);
}
