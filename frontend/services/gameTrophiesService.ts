/**
 * gameTrophiesService.ts
 *
 * Resuelve los trofeos/logros de un juego concreto y los normaliza al mismo
 * tipo (`SteamGameAchievementsSummary`) sea cual sea la fuente:
 *
 *   - 'steam' → Steam Web API (cuenta de Steam configurada)
 *   - 'aw'    → AchievementWatcher (juegos PC/emulados leídos del disco)
 *   - 'rpcs3' → trofeos de PS3 leídos de RPCS3
 *   - 'retro' → RetroAchievements.org (juegos clásicos)
 *
 * Antes esta lógica vivía dentro del efecto de `GameInfoPanel`, que solo
 * podía resolver el juego que estaba en pantalla. Se extrajo aquí para que
 * la vista de Trofeos pueda listar los logros de CUALQUIER juego de la
 * biblioteca, no solo del que está en pantalla.
 */
import {
  fetchAwGameAchievements,
  fetchPcGameAchievements,
  fetchRpcs3Trophies,
  fetchRpcs3TrophiesFromLnk,
  fetchRpcs3TrophiesFromRom,
  getCachedAwAchievements,
  getRpcs3AppId,
} from './achievementWatcherService';
import {
  fetchRetroAchievements,
  getRaCredentialsFromSettings,
  isRetroAchievementsSupported,
  type RaCredentials,
} from './retroAchievementsService';
import { getSteamAppId } from './steamLaunchService';
import {
  fetchSteamGameAchievements,
  getCachedSteamGameAchievements,
  type SteamGameAchievementsSummary,
} from './steamUserService';

export type TrophySource = 'steam' | 'aw' | 'rpcs3' | 'retro' | null;

export interface GameTrophiesResult {
  summary: SteamGameAchievementsSummary | null;
  source: TrophySource;
}

/** Datos mínimos del juego necesarios para resolver sus trofeos. */
export interface TrophyGameRef {
  id: string;
  title?: string;
  platform?: string;
  path?: string | null;
  launchArgs?: string | null;
  retroSystem?: string;
  raGameId?: number | string;
}

export interface TrophyContext {
  /** SteamID64 del usuario (si hay cuenta de Steam configurada). */
  steamId?: string | null;
  /** API key de Steam. */
  steamApiKey?: string | null;
  /** Idioma del schema de logros en formato Steam ('english', 'spanish'...). */
  lang?: string;
  /** Carpeta raíz de RPCS3 configurada por el usuario. */
  rpcs3Path?: string | null;
  /** Credenciales de RetroAchievements. */
  raCredentials?: RaCredentials | null;
  /** El lector de logros externos (AchievementWatcher) está disponible. */
  awAvailable?: boolean;
}

export const DEFAULT_STEAM_API_KEY = 'B1F361EA3C07B455DC8B0D06ED179B00';

/** Construye el contexto de resolución a partir del perfil activo. */
export function getTrophyContextFromUser(
  activeUser: any,
  lang: string,
  awAvailable: boolean,
): TrophyContext {
  return {
    steamId: activeUser?.settings?.steamId ?? null,
    steamApiKey:
      activeUser?.settings?.steamApiKey ||
      process.env.EXPO_PUBLIC_STEAM_API_KEY ||
      DEFAULT_STEAM_API_KEY,
    lang: lang || 'english',
    rpcs3Path: activeUser?.settings?.rpcs3Path ?? null,
    raCredentials: getRaCredentialsFromSettings(activeUser?.settings),
    awAvailable,
  };
}

function hasPcAchievementsApi(): boolean {
  return typeof (window as any)?.electronAPI?.getPcGameAchievements === 'function';
}

function isPcPlatform(platform?: string): boolean {
  const p = platform?.toUpperCase();
  return p === 'PC' || p === 'WINDOWS';
}

function isExecutablePath(path?: string | null): boolean {
  return typeof path === 'string' && (path.endsWith('.exe') || path.endsWith('.bat'));
}

/** AppID de Steam del juego (null si no es un juego de Steam). */
export function getGameSteamAppId(game: TrophyGameRef | null | undefined): string | null {
  if (!game) return null;
  return getSteamAppId(game as { id: string; path?: string });
}

/**
 * ¿El juego puede tener trofeos? Sirve para no intentar resolver juegos
 * que claramente no los tienen (fotos, vídeos, carpetas...).
 */
export function canHaveTrophies(game: TrophyGameRef | null | undefined): boolean {
  if (!game || !game.id) return false;
  if (getRpcs3AppId(game)) return true;
  if (getGameSteamAppId(game)) return true;
  if (isPcPlatform(game.platform) && isExecutablePath(game.path)) return true;
  if (isRetroAchievementsSupported(game as any)) return true;
  return false;
}

/**
 * Resumen cacheado en memoria del juego (instantáneo, sin red).
 * Devuelve null si no hay nada cacheado todavía.
 */
export function getCachedGameTrophies(
  game: TrophyGameRef | null | undefined,
  ctx: TrophyContext,
): GameTrophiesResult | null {
  if (!game) return null;
  const lang = ctx.lang || 'english';

  // RPCS3 no tiene caché síncrono exposed (la clave depende de la ruta).
  if (getRpcs3AppId(game)) return null;

  const appId = getGameSteamAppId(game);

  if (ctx.steamId && appId) {
    const cached = getCachedSteamGameAchievements(ctx.steamId, Number(appId), lang);
    if (cached !== undefined) {
      return { summary: cached, source: cached ? 'steam' : null };
    }
    return null;
  }

  if (ctx.awAvailable && appId) {
    const cached = getCachedAwAchievements(appId, 'local', lang);
    if (cached !== undefined) {
      return { summary: cached, source: cached ? 'aw' : null };
    }
  }

  return null;
}

/**
 * Resuelve (con red o disco) los trofeos del juego. Mantiene el mismo orden
 * de preferencia que usa el panel de información del juego.
 */
export async function fetchGameTrophies(
  game: TrophyGameRef | null | undefined,
  ctx: TrophyContext,
): Promise<GameTrophiesResult> {
  if (!game) return { summary: null, source: null };

  const lang = ctx.lang || 'english';
  const apiKey = ctx.steamApiKey || DEFAULT_STEAM_API_KEY;

  // ── RPCS3: trofeos de PS3 ────────────────────────────────────────────────
  const rpcs3AppId = getRpcs3AppId(game);
  if (rpcs3AppId) {
    const rpcs3Dir = ctx.rpcs3Path ?? null;
    if (!rpcs3Dir) return { summary: null, source: null };

    const gamePath: string | null = game.path ?? null;
    const isLnk = typeof gamePath === 'string' && gamePath.toLowerCase().endsWith('.lnk');
    // ROM añadida por escaneo: el exe está en `path` y la ROM citada en `launchArgs`.
    const launchArgs: string | null = game.launchArgs ?? null;
    const romMatch = typeof launchArgs === 'string' ? launchArgs.match(/"([^"]+)"/g) : null;
    const romPath: string | null =
      romMatch && romMatch.length > 0 ? romMatch[romMatch.length - 1].replace(/"/g, '') : null;

    const summary = isLnk
      ? await fetchRpcs3TrophiesFromLnk(gamePath!, rpcs3Dir)
      : romPath
        ? await fetchRpcs3TrophiesFromRom(romPath, rpcs3Dir, game.title || '')
        : await fetchRpcs3Trophies(rpcs3Dir, rpcs3AppId);

    return { summary, source: summary ? 'rpcs3' : null };
  }

  const appId = getGameSteamAppId(game);
  const isPcGame = isPcPlatform(game.platform);
  const gamePath = game.path ?? null;
  const hasExePath = isExecutablePath(gamePath);

  // Un juego PC sin AppID de Steam solo puede aportar logros si el lector
  // externo está disponible.
  if (!appId && !(isPcGame && hasExePath && hasPcAchievementsApi())) {
    // ...pero antes de salir, se comprueba el caso RetroAchievements.
    return fetchRetroTrophies(game, ctx);
  }

  // ── Steam legítimo (cuenta configurada) ─────────────────────────────────
  if (ctx.steamId && appId) {
    const cached = getCachedSteamGameAchievements(ctx.steamId, Number(appId), lang);
    if (cached !== undefined) {
      return { summary: cached, source: cached ? 'steam' : null };
    }
    const summary = await fetchSteamGameAchievements(apiKey, ctx.steamId, Number(appId), false, lang);
    // Sin datos no se cae a AchievementWatcher: mostraría datos incorrectos
    // para juegos oficiales de Steam (perfil privado, sin estadísticas...).
    return { summary, source: summary ? 'steam' : null };
  }

  // ── AchievementWatcher (emuladores, sin cuenta de Steam) ─────────────────
  if (ctx.awAvailable && appId) {
    const cached = getCachedAwAchievements(appId, 'local', lang);
    if (cached !== undefined) {
      return { summary: cached, source: cached ? 'aw' : null };
    }
    const summary = await fetchAwGameAchievements(Number(appId), 'local', lang, apiKey);
    return { summary, source: summary ? 'aw' : null };
  }

  // ── Juego PC manual (lee el AppID del exe) ─────────────────────────────
  if (isPcGame && hasExePath && hasPcAchievementsApi()) {
    const summary = await fetchPcGameAchievements(gamePath!, apiKey, lang);
    return { summary, source: summary ? 'aw' : null };
  }

  // ── RetroAchievements (juegos clásicos) ─────────────────────────────────
  return fetchRetroTrophies(game, ctx);
}

async function fetchRetroTrophies(
  game: TrophyGameRef,
  ctx: TrophyContext,
): Promise<GameTrophiesResult> {
  const creds = ctx.raCredentials;
  if (!creds || !game.title || !isRetroAchievementsSupported(game as any)) {
    return { summary: null, source: null };
  }

  const raGame = {
    id: game.id,
    title: game.title ?? '',
    platform: game.platform,
    retroSystem: game.retroSystem,
    raGameId: game.raGameId,
  };

  const summary = await fetchRetroAchievements(raGame, creds, {
    // Guarda el GameID de RA en el juego para no volver a buscarlo por título.
    onResolved: ({ raGameId }) => {
      if (!game.raGameId) {
        (window as any).electronAPI?.updateApp?.({ id: game.id, raGameId });
      }
    },
  });

  const valid = summary && summary.total > 0 ? summary : null;
  return { summary: valid, source: valid ? 'retro' : null };
}
