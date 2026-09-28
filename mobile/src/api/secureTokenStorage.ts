import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { TokenPair, TokenStorage } from './http';

const ACCESS_KEY = 'odh.accessToken';
const REFRESH_KEY = 'odh.refreshToken';
const INSTALL_MARKER = 'odh.installMarker';

// Keychain (iOS) / Keystore (Android). THIS_DEVICE_ONLY: não vai para backup
// nem migra para outro aparelho. AFTER_FIRST_UNLOCK: permite o refetch que o
// app faz ao voltar do background mesmo com a tela recém-bloqueada.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * Tokens no armazenamento seguro do sistema, com cache em memória (o
 * SecureStore é lento para ler a cada requisição).
 */
export function createSecureTokenStorage(): TokenStorage & { init(): Promise<void> } {
  let cache: { access: string | null; refresh: string | null } | null = null;

  async function load() {
    if (!cache) {
      const [access, refresh] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_KEY, OPTIONS),
        SecureStore.getItemAsync(REFRESH_KEY, OPTIONS),
      ]);
      cache = { access, refresh };
    }
    return cache;
  }

  return {
    /**
     * O Keychain do iOS sobrevive à desinstalação do app: sem isto, reinstalar
     * o app "logaria" automaticamente com a sessão antiga. O AsyncStorage é
     * apagado na desinstalação, então a ausência do marcador = instalação nova.
     */
    async init() {
      try {
        const marker = await AsyncStorage.getItem(INSTALL_MARKER);
        if (!marker) {
          await Promise.all([
            SecureStore.deleteItemAsync(ACCESS_KEY, OPTIONS),
            SecureStore.deleteItemAsync(REFRESH_KEY, OPTIONS),
          ]);
          await AsyncStorage.setItem(INSTALL_MARKER, '1');
          cache = { access: null, refresh: null };
        }
      } catch (err) {
        console.warn('Falha ao verificar instalação nova', err);
      }
    },
    async getAccessToken() {
      return (await load()).access;
    },
    async getRefreshToken() {
      return (await load()).refresh;
    },
    async setTokens({ token, refreshToken }: TokenPair) {
      cache = { access: token, refresh: refreshToken };
      await Promise.all([
        SecureStore.setItemAsync(ACCESS_KEY, token, OPTIONS),
        SecureStore.setItemAsync(REFRESH_KEY, refreshToken, OPTIONS),
      ]);
    },
    async clear() {
      cache = { access: null, refresh: null };
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_KEY, OPTIONS),
        SecureStore.deleteItemAsync(REFRESH_KEY, OPTIONS),
      ]);
    },
  };
}
