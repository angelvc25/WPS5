import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_PREFIX = '@wps5:';
const APPS_STORAGE_KEY = 'wps5_apps_v1';
const USERS_STORAGE_KEY = 'console_users';

// Caché sincrónico en memoria para soportar llamadas síncronas estilo localStorage
const memoryCache = new Map<string, string>();
let isInitialized = false;

// Datos iniciales de apps y emuladores para Android
const DEFAULT_ANDROID_GAMES = [
  {
    id: 'android_retroarch',
    title: 'RetroArch',
    time: 'Emulador Multi-sistema',
    type: 'game',
    platform: 'Retro',
    path: 'com.retroarch',
    description: 'Frontend multisistema para emulación de NES, SNES, GBA, PS1, Arcade y más.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co29qg.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc73j1.jpg',
    rating: 4.8,
  },
  {
    id: 'android_ppsspp',
    title: 'PPSSPP',
    time: 'Sony PSP',
    type: 'game',
    platform: 'PSP',
    path: 'org.ppsspp.ppsspp',
    description: 'El mejor emulador de PlayStation Portable para disfrutar de juegos de PSP con alta resolución.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co28sm.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc72y5.jpg',
    rating: 4.9,
  },
  {
    id: 'android_minecraft',
    title: 'Minecraft',
    time: 'Aventura / Sandbox',
    type: 'game',
    platform: 'Android',
    path: 'com.mojang.minecraftpe',
    description: 'Explora mundos infinitos y construye todo tipo de cosas, desde la casa más sencilla hasta el castillo más grandioso.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co811o.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc8cwy.jpg',
    rating: 4.7,
  },
  {
    id: 'android_nether_sx2',
    title: 'NetherSX2 / AetherSX2',
    time: 'PlayStation 2',
    type: 'game',
    platform: 'PS2',
    path: 'xyz.aethersx2.android',
    description: 'Emulador de PlayStation 2 de alto rendimiento para arquitectura ARM64.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc72y4.jpg',
    rating: 4.8,
  },
];

const DEFAULT_ANDROID_MEDIA = [
  {
    id: 'spotify_default',
    title: 'Spotify',
    time: 'Música & Podcasts',
    type: 'media',
    platform: 'Android',
    path: 'com.spotify.music',
    description: 'Reproduce millones de canciones y podcasts en tu dispositivo.',
    image: require('@/assets/images/spotify_portada.png'),
    logo: require('@/assets/images/spotify_logo.png'),
    backgroundImage: require('@/assets/images/spotify_fondo.png'),
  },
  {
    id: 'android_youtube',
    title: 'YouTube',
    time: 'Video & Streaming',
    type: 'media',
    platform: 'Android',
    path: 'com.google.android.youtube',
    description: 'Videos, gameplays, música y emisiones en vivo.',
    image: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&auto=format&fit=crop&q=80',
    backgroundImage: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1920&auto=format&fit=crop&q=80',
  },
];

const DEFAULT_USERS_DATA = [
  {
    id: '1',
    name: 'Player 1',
    avatar: 'assets/images/userDefault.jpeg',
    color: '#FF3B30',
    settings: {
      autoPlayVideo: true,
      syncPreferences: {
        description: 'igdb',
        rating: 'igdb',
        publisher: 'psn',
        genres: 'psn',
        releaseDate: 'psn',
        cover: 'steamgrid',
        background: 'steamgrid',
        logo: 'steamgrid',
      },
      language: 'es',
    },
  },
];

// Polyfill de localStorage seguro para React Native / Hermes
export function installLocalStoragePolyfill() {
  const polyfill = {
    getItem(key: string): string | null {
      const v = memoryCache.get(key);
      return v !== undefined ? v : null;
    },
    setItem(key: string, value: string): void {
      const valStr = String(value);
      memoryCache.set(key, valStr);
      AsyncStorage.setItem(STORAGE_PREFIX + key, valStr).catch((err) => {
        console.warn('[NativeStorage] Error al persistir clave:', key, err);
      });
    },
    removeItem(key: string): void {
      memoryCache.delete(key);
      AsyncStorage.removeItem(STORAGE_PREFIX + key).catch(() => {});
    },
    clear(): void {
      memoryCache.clear();
      AsyncStorage.getAllKeys()
        .then((keys) => {
          const appKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
          return AsyncStorage.multiRemove(appKeys);
        })
        .catch(() => {});
    },
    key(index: number): string | null {
      const keys = Array.from(memoryCache.keys());
      return keys[index] || null;
    },
    get length(): number {
      return memoryCache.size;
    },
  };

  const targetGlobal = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : window as any);
  if (targetGlobal) {
    if (!targetGlobal.localStorage || Platform.OS !== 'web') {
      try {
        Object.defineProperty(targetGlobal, 'localStorage', {
          value: polyfill,
          writable: true,
          configurable: true,
        });
      } catch {
        (targetGlobal as any).localStorage = polyfill;
      }
    }
    if (typeof window !== 'undefined' && !window.localStorage) {
      try {
        (window as any).localStorage = polyfill;
      } catch {}
    }
  }
}

// Inicializar polyfill inmediatamente al importar este archivo
installLocalStoragePolyfill();

export const nativeStorage = {
  /**
   * Carga todo el almacenamiento asíncrono en memoria para que
   * el acceso subsiguiente sea 100% síncrono y rápido.
   */
  async init(): Promise<void> {
    if (isInitialized) return;
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const relevantKeys = allKeys.filter((k) => k.startsWith(STORAGE_PREFIX));
      if (relevantKeys.length > 0) {
        const pairs = await AsyncStorage.multiGet(relevantKeys);
        for (const [fullKey, val] of pairs) {
          if (val !== null) {
            const rawKey = fullKey.slice(STORAGE_PREFIX.length);
            memoryCache.set(rawKey, val);
          }
        }
      }

      // Si no hay usuarios iniciales, sembrar DEFAULT_USERS
      if (!memoryCache.has(USERS_STORAGE_KEY)) {
        const strUsers = JSON.stringify(DEFAULT_USERS_DATA);
        memoryCache.set(USERS_STORAGE_KEY, strUsers);
        await AsyncStorage.setItem(STORAGE_PREFIX + USERS_STORAGE_KEY, strUsers);
      }

      // Si no hay apps iniciales, sembrar las recomendadas para Android
      if (!memoryCache.has(APPS_STORAGE_KEY)) {
        const initialApps = { games: DEFAULT_ANDROID_GAMES, media: DEFAULT_ANDROID_MEDIA };
        const strApps = JSON.stringify(initialApps);
        memoryCache.set(APPS_STORAGE_KEY, strApps);
        await AsyncStorage.setItem(STORAGE_PREFIX + APPS_STORAGE_KEY, strApps);
      }

      isInitialized = true;
      console.log('[NativeStorage] Almacenamiento nativo inicializado con éxito.');
    } catch (err) {
      console.error('[NativeStorage] Error al inicializar:', err);
    }
  },

  getItem(key: string): string | null {
    const val = memoryCache.get(key);
    return val !== undefined ? val : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryCache.set(key, value);
    await AsyncStorage.setItem(STORAGE_PREFIX + key, value);
  },

  async removeItem(key: string): Promise<void> {
    memoryCache.delete(key);
    await AsyncStorage.removeItem(STORAGE_PREFIX + key);
  },

  /** Obtener lista de apps (juegos y medios) */
  async getApps(): Promise<{ games: any[]; media: any[] }> {
    await this.init();
    const raw = memoryCache.get(APPS_STORAGE_KEY);
    if (!raw) return { games: DEFAULT_ANDROID_GAMES, media: DEFAULT_ANDROID_MEDIA };
    try {
      const parsed = JSON.parse(raw);
      return {
        games: Array.isArray(parsed.games) ? parsed.games : DEFAULT_ANDROID_GAMES,
        media: Array.isArray(parsed.media) ? parsed.media : DEFAULT_ANDROID_MEDIA,
      };
    } catch {
      return { games: DEFAULT_ANDROID_GAMES, media: DEFAULT_ANDROID_MEDIA };
    }
  },

  /** Guardar una app o juego nuevo */
  async saveApp(app: any): Promise<void> {
    const current = await this.getApps();
    const isMedia = app.type === 'media';
    const list = isMedia ? [...current.media] : [...current.games];

    const existingIdx = list.findIndex((x) => x.id === app.id || (app.path && x.path === app.path));
    if (existingIdx !== -1) {
      list[existingIdx] = { ...list[existingIdx], ...app };
    } else {
      const newId = app.id || `app_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      list.unshift({ ...app, id: newId });
    }

    if (isMedia) {
      current.media = list;
    } else {
      current.games = list;
    }

    const json = JSON.stringify(current);
    memoryCache.set(APPS_STORAGE_KEY, json);
    await AsyncStorage.setItem(STORAGE_PREFIX + APPS_STORAGE_KEY, json);
  },

  /** Actualizar un juego existente */
  async updateApp(id: string, updates: any): Promise<void> {
    const current = await this.getApps();
    let found = false;

    current.games = current.games.map((g) => {
      if (g.id === id) {
        found = true;
        return { ...g, ...updates };
      }
      return g;
    });

    if (!found) {
      current.media = current.media.map((m) => (m.id === id ? { ...m, ...updates } : m));
    }

    const json = JSON.stringify(current);
    memoryCache.set(APPS_STORAGE_KEY, json);
    await AsyncStorage.setItem(STORAGE_PREFIX + APPS_STORAGE_KEY, json);
  },

  /** Eliminar un juego o app por ID */
  async deleteApp(id: string): Promise<void> {
    const current = await this.getApps();
    current.games = current.games.filter((g) => g.id !== id);
    current.media = current.media.filter((m) => m.id !== id);

    const json = JSON.stringify(current);
    memoryCache.set(APPS_STORAGE_KEY, json);
    await AsyncStorage.setItem(STORAGE_PREFIX + APPS_STORAGE_KEY, json);
  },

  /** Obtener lista de usuarios */
  async getUsers(): Promise<any[]> {
    await this.init();
    const raw = memoryCache.get(USERS_STORAGE_KEY);
    if (!raw) return DEFAULT_USERS_DATA;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_USERS_DATA;
    } catch {
      return DEFAULT_USERS_DATA;
    }
  },

  /** Guardar lista de usuarios */
  async saveUsers(users: any[]): Promise<void> {
    const json = JSON.stringify(users);
    memoryCache.set(USERS_STORAGE_KEY, json);
    await AsyncStorage.setItem(STORAGE_PREFIX + USERS_STORAGE_KEY, json);
  },
};

// Exportación por defecto para compatibilidad con import nativeStorage from '...'
export default nativeStorage;
