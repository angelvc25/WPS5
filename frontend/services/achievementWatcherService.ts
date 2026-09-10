/**
 * achievementWatcherService.ts
 *
 * Servicio para leer logros de juegos externos (emuladores Steam: Codex,
 * Goldberg, EMPRESS, SKIDROW, SmartSteamEmu, CreamAPI, GreenLuma, RPCS3)
 * directamente desde el proceso principal de Electron vía IPC.
 *
 * Ya NO depende del servidor HTTP externo de AchievementWatcher.
 * La lógica de lectura de archivos/registro vive en electron/achievementReader.js
 * y se invoca a través de electronAPI.getExternalAchievements / .getRpcs3Trophies.
 *
 * El resultado se normaliza al mismo tipo SteamGameAchievementsSummary que usa
 * el flujo de Steam legítimo, por lo que GameInfoPanel no necesita ningún
 * cambio para mostrarlos.
 */

import { SteamGameAchievementsSummary } from './steamUserService';

// ─── Acceso a la API de Electron (contextBridge) ──────────────────────────────

function getElectronAPI(): any | null {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return (window as any).electronAPI;
  }
  return null;
}

/**
 * Devuelve true si el entorno es Electron y los métodos de logros externos
 * están disponibles.  Se usa para decidir si mostrar la sección de logros
 * en GameInfoPanel cuando no hay cuenta Steam configurada.
 */
export function isExternalAchievementsAvailable(): boolean {
  const api = getElectronAPI();
  return typeof api?.getExternalAchievements === 'function';
}

/**
 * Devuelve true si el canal de trofeos RPCS3 está disponible.
 */
export function isRpcs3Available(): boolean {
  const api = getElectronAPI();
  return typeof api?.getRpcs3Trophies === 'function';
}

/**
 * Detecta si hay logros disponibles para un juego PC mediante scan del exe.
 * Solo disponible en Electron.
 */
export function isPcAchievementsAvailable(): boolean {
  const api = getElectronAPI();
  return typeof api?.getPcGameAchievements === 'function';
}

// ─── Caché en memoria ─────────────────────────────────────────────────────────

interface CacheEntry {
  summary: SteamGameAchievementsSummary | null;
  timestamp: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

const awCache    = new Map<string, CacheEntry>();
const awInFlight = new Map<string, Promise<SteamGameAchievementsSummary | null>>();

/** Retorna la entrada cacheada si es válida, undefined si expiró o no existe. */
export function getCachedAwAchievements(
  appId: string | number,
  userId: string,
): SteamGameAchievementsSummary | null | undefined {
  const key   = `aw_${userId}_${appId}`;
  const entry = awCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    awCache.delete(key);
    return undefined;
  }
  return entry.summary;
}

// ─── Obtención de logros externos (emuladores Steam) ─────────────────────────

/**
 * Obtiene los logros de un juego externo (emulado) invocando el proceso
 * principal de Electron, que lee los archivos/registro locales.
 *
 * @param appId        - Steam AppID numérico del juego
 * @param steamApiKey  - API key de Steam (para obtener el schema de logros)
 * @param userId       - Clave de caché (puede ser steamId o 'local')
 * @param lang         - Idioma del schema (default: 'english')
 */
export async function fetchAwGameAchievements(
  appId: number,
  userId: string,
  lang = 'english',
  steamApiKey?: string,
): Promise<SteamGameAchievementsSummary | null> {
  const cacheKey = `aw_${userId}_${appId}`;

  // 1. Caché en memoria
  const cached = getCachedAwAchievements(appId, userId);
  if (cached !== undefined) return cached;

  // 2. Deduplicación de peticiones concurrentes
  const inFlight = awInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const api = getElectronAPI();
  if (!api?.getExternalAchievements) {
    // No estamos en Electron o el canal no está disponible
    awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
    return null;
  }

  const resolvedKey = steamApiKey
    ?? (process.env as any).EXPO_PUBLIC_STEAM_API_KEY
    ?? 'B1F361EA3C07B455DC8B0D06ED179B00';

  const promise = (async (): Promise<SteamGameAchievementsSummary | null> => {
    try {
      const response = await api.getExternalAchievements(appId, resolvedKey, lang);

      if (!response?.success || !response.data) {
        awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
        return null;
      }

      // El reader devuelve el mismo shape que SteamGameAchievementsSummary
      // más un campo `source` extra que ignoramos en el tipo.
      const summary = response.data as SteamGameAchievementsSummary;
      awCache.set(cacheKey, { summary, timestamp: Date.now() });
      return summary;
    } catch (err) {
      console.warn('[AchievementWatcherService] fetchAwGameAchievements error:', err);
      awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
      return null;
    } finally {
      awInFlight.delete(cacheKey);
    }
  })();

  awInFlight.set(cacheKey, promise);
  return promise;
}

// ─── Detección del appId de RPCS3 ────────────────────────────────────────────

/**
 * Devuelve un identificador para el juego si es un juego de RPCS3/PS3.
 * Retorna item.id (que puede ser un timestamp) cuando platform indica PS3/RPCS3.
 * El valor devuelto se usa solo para activar la rama RPCS3 en GameInfoPanel;
 * el NPcommID real se obtiene leyendo el .lnk en el proceso principal.
 */
export function getRpcs3AppId(item: { id: string; platform?: string }): string | null {
  const p = item.platform?.toUpperCase() ?? '';
  // Detectar cualquier variante de nombre de plataforma PS3 / RPCS3
  if (p === 'RPCS3' || p === 'PS3' || p === 'PLAYSTATION 3' || p === 'PLAYSTATION3') {
    return item.id;
  }
  // ID con formato NPcommID real (NPWR01234-A)
  if (/^NP[A-Z]{2}\d{5}-[A-Z]$/.test(item.id)) return item.id;
  return null;
}

// ─── Obtención de trofeos RPCS3 ───────────────────────────────────────────────

/**
 * Lee los trofeos de un juego RPCS3 desde el proceso principal de Electron.
 *
 * @param rpcs3Dir  - Carpeta raíz de RPCS3 (la que contiene rpcs3.exe y dev_hdd0/)
 * @param npCommId  - NPcommID del juego (ej. "NPWR00001-A")
 */
export async function fetchRpcs3Trophies(
  rpcs3Dir: string,
  npCommId: string,
): Promise<SteamGameAchievementsSummary | null> {
  const cacheKey = `rpcs3_${npCommId}`;

  const cached = awCache.get(cacheKey);
  if (cached) {
    if (Date.now() - cached.timestamp <= CACHE_TTL_MS) return cached.summary;
    awCache.delete(cacheKey);
  }

  const inFlight = awInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const api = getElectronAPI();
  if (!api?.getRpcs3Trophies) {
    awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
    return null;
  }

  const promise = (async (): Promise<SteamGameAchievementsSummary | null> => {
    try {
      const response = await api.getRpcs3Trophies(rpcs3Dir, npCommId);

      if (!response?.success || !response.data) {
        awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
        return null;
      }

      const summary = response.data as SteamGameAchievementsSummary;
      awCache.set(cacheKey, { summary, timestamp: Date.now() });
      return summary;
    } catch (err) {
      console.warn('[AchievementWatcherService] fetchRpcs3Trophies error:', err);
      awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
      return null;
    } finally {
      awInFlight.delete(cacheKey);
    }
  })();

  awInFlight.set(cacheKey, promise);
  return promise;
}

// ─── Logros de juegos PC manuales ────────────────────────────────────────────

/**
 * Detecta el Steam AppID del juego desde su exe y obtiene sus logros.
 * Funciona con Codex (steam_emu.ini), Goldberg (steam_appid.txt), CreamAPI, etc.
 *
 * @param exePath     - Ruta absoluta al ejecutable del juego
 * @param steamApiKey - API key de Steam
 * @param lang        - Idioma del schema (default: 'english')
 */
export async function fetchPcGameAchievements(
  exePath: string,
  steamApiKey?: string,
  lang = 'english',
): Promise<SteamGameAchievementsSummary | null> {
  const cacheKey = `pc_${exePath}`;

  const cached = awCache.get(cacheKey);
  if (cached) {
    if (Date.now() - cached.timestamp <= CACHE_TTL_MS) return cached.summary;
    awCache.delete(cacheKey);
  }

  const inFlight = awInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const api = getElectronAPI();
  if (!api?.getPcGameAchievements) {
    awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
    return null;
  }

  const resolvedKey = steamApiKey
    ?? (process.env as any).EXPO_PUBLIC_STEAM_API_KEY
    ?? 'B1F361EA3C07B455DC8B0D06ED179B00';

  const promise = (async (): Promise<SteamGameAchievementsSummary | null> => {
    try {
      const response = await api.getPcGameAchievements(exePath, resolvedKey, lang);
      if (!response?.success || !response.data) {
        awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
        return null;
      }
      const summary = response.data as SteamGameAchievementsSummary;
      awCache.set(cacheKey, { summary, timestamp: Date.now() });
      return summary;
    } catch (err) {
      console.warn('[AchievementWatcherService] fetchPcGameAchievements error:', err);
      awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
      return null;
    } finally {
      awInFlight.delete(cacheKey);
    }
  })();

  awInFlight.set(cacheKey, promise);
  return promise;
}

// ─── Resolución de trofeos RPCS3 desde un .lnk ───────────────────────────────

/**
 * Resuelve un juego RPCS3 añadido como .lnk y lee sus trofeos.
 *
 * El .lnk apunta a rpcs3.exe con el GameID como argumento
 * (ej. --no-gui "%RPCS3_GAMEID%:BCES00510"). El proceso principal
 * localiza el NPcommID correspondiente en dev_hdd0/home/<user>/trophy/.
 *
 * @param lnkPath  - Ruta absoluta al .lnk del juego
 * @param rpcs3Dir - Carpeta raíz de RPCS3 configurada por el usuario
 */
export async function fetchRpcs3TrophiesFromLnk(
  lnkPath: string,
  rpcs3Dir: string,
): Promise<SteamGameAchievementsSummary | null> {
  // La clave incluye rpcs3Dir para que cambiar la carpeta en Settings invalide la caché
  const cacheKey = `rpcs3_lnk_${lnkPath}_${rpcs3Dir}`;

  const cached = awCache.get(cacheKey);
  if (cached) {
    if (Date.now() - cached.timestamp <= CACHE_TTL_MS) return cached.summary;
    awCache.delete(cacheKey);
  }

  const inFlight = awInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const api = getElectronAPI();
  if (!api?.resolveRpcs3LnkTrophies) {
    awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
    return null;
  }

  const promise = (async (): Promise<SteamGameAchievementsSummary | null> => {
    try {
      const response = await api.resolveRpcs3LnkTrophies(lnkPath, rpcs3Dir);
      if (!response?.success || !response.data) {
        awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
        return null;
      }
      const summary = response.data as SteamGameAchievementsSummary;
      awCache.set(cacheKey, { summary, timestamp: Date.now() });
      return summary;
    } catch (err) {
      console.warn('[AchievementWatcherService] fetchRpcs3TrophiesFromLnk error:', err);
      awCache.set(cacheKey, { summary: null, timestamp: Date.now() });
      return null;
    } finally {
      awInFlight.delete(cacheKey);
    }
  })();

  awInFlight.set(cacheKey, promise);
  return promise;
}

// ─── Normalización legacy ─────────────────────────────────────────────────────

/**
 * Normaliza un array de trofeos RPCS3 en formato raw al tipo
 * SteamGameAchievementsSummary.  Ya no se necesita en el flujo principal
 * (el reader de Electron lo hace) pero se conserva por si algún componente
 * la usa directamente.
 */
export function normalizeRpcs3Trophies(trophies: Array<{
  name: string;
  displayName?: string;
  description?: string;
  icon?: string;
  icongray?: string;
  type?: string;
  Achieved?: boolean | number;
  UnlockTime?: number;
}>): SteamGameAchievementsSummary {
  const rarityCounts = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  const rpcs3Rarity = (t: string | undefined): 'platinum' | 'gold' | 'silver' | 'bronze' => {
    switch ((t ?? '').toUpperCase()) {
      case 'P': return 'platinum';
      case 'G': return 'gold';
      case 'S': return 'silver';
      default:  return 'bronze';
    }
  };

  const achievements = trophies.map((t) => {
    const rarity  = rpcs3Rarity(t.type);
    const achieved = t.Achieved === true || t.Achieved === 1;
    if (achieved) rarityCounts[rarity]++;
    return {
      apiName:          t.name,
      name:             t.displayName || t.name,
      description:      t.description || '',
      icon:             t.icon || '',
      lockedIcon:       t.icongray || t.icon || '',
      achieved,
      unlockTime:       t.UnlockTime ?? 0,
      globalPercentage: null as null,
      rarity,
    };
  });

  return {
    total:       achievements.length,
    unlocked:    achievements.filter((a) => a.achieved).length,
    rarityCounts,
    achievements,
  };
}
