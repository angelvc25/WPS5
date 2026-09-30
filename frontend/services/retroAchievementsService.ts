/**
 * retroAchievementsService.ts
 *
 * Logros de RetroAchievements (retroachievements.org) para juegos de
 * emuladores (PSP, SNES, GBA, PS1, Genesis, etc.).
 *
 * Devuelve el mismo tipo `SteamGameAchievementsSummary` que Steam y RPCS3,
 * por lo que GameInfoPanel / GameDetailView pueden pintarlo sin cambios.
 *
 * Cada usuario pone su propio usuario + Web API Key
 * (retroachievements.org -> Control Panel -> Keys). Se guardan en
 * activeUser.settings.raUsername / raApiKey.
 *
 * Resolución del GameID de RA:
 *   1. item.raGameId (si ya se resolvió y se guardó).
 *   2. Coincidencia por título contra la lista de juegos de la consola
 *      (cacheada 7 días en localStorage).
 *   3. (Fase 2, recomendado) hash de la ROM calculado en Electron; ver nota
 *      al final del archivo.
 */

import type { SteamGameAchievementsSummary, SteamGameAchievement } from './steamUserService';

const RA_API = 'https://retroachievements.org/API';
const RA_BADGE = 'https://media.retroachievements.org/Badge';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RaCredentials {
  username: string;
  apiKey: string;
}

export interface RaGameRef {
  id: string;
  title: string;
  platform?: string;
  retroSystem?: string;
  raGameId?: number | string;
}

export interface RaResolvedGame {
  raGameId: number;
  raTitle: string;
}

interface RaGameListEntry {
  ID: number;
  Title: string;
  ConsoleID: number;
  NumAchievements?: number;
}

interface RaAchievementRaw {
  ID: number;
  Title: string;
  Description: string;
  Points: number;
  TrueRatio?: number;
  BadgeName: string;
  NumAwarded: number;
  NumAwardedHardcore?: number;
  DateEarned?: string;
  DateEarnedHardcore?: string;
}

interface RaGameProgressRaw {
  ID: number;
  Title: string;
  NumDistinctPlayers?: number;
  NumDistinctPlayersCasual?: number;
  NumDistinctPlayersHardcore?: number;
  Achievements?: Record<string, RaAchievementRaw> | RaAchievementRaw[];
}

// ─── Consolas ─────────────────────────────────────────────────────────────────
// IDs oficiales de RA. Verifícalos con API_GetConsoleIDs.php si añades más.

const RA_CONSOLE_BY_RETRO_SYSTEM: Record<string, number> = {
  'GENESIS': 1,
  'N64': 2,
  'SNES': 3,
  'GB': 4,
  'GBA': 5,
  'GBC': 6,
  'NES': 7,
  'SEGA CD': 9,
  '32X': 10,
  'MASTER SYSTEM': 11,
  'GAME GEAR': 15,
  'GC': 16,
  'NDS': 18,
  'WII': 19,
  'WIIU': 20,
  'ATARI 2600': 25,
  'SATURN': 39,
  'DREAMCAST': 40,
  'PSP': 41,
  'N3DS': 62,
  'NEO GEO': 56, // Neo Geo CD (RA no tiene Neo Geo AES)
};

const RA_CONSOLE_BY_PLATFORM: Record<string, number> = {
  PS1: 12,
  PS2: 21,
};

/** Devuelve el ConsoleID de RA para el juego, o null si no está soportado. */
export function getRaConsoleId(item: Pick<RaGameRef, 'platform' | 'retroSystem'>): number | null {
  const sys = item.retroSystem?.trim().toUpperCase();
  if (sys && RA_CONSOLE_BY_RETRO_SYSTEM[sys]) return RA_CONSOLE_BY_RETRO_SYSTEM[sys];
  const plat = item.platform?.trim().toUpperCase();
  if (plat && RA_CONSOLE_BY_PLATFORM[plat]) return RA_CONSOLE_BY_PLATFORM[plat];
  return null;
}

export function isRetroAchievementsSupported(item: Pick<RaGameRef, 'platform' | 'retroSystem'>): boolean {
  return getRaConsoleId(item) !== null;
}

export function hasRaCredentials(creds?: Partial<RaCredentials> | null): creds is RaCredentials {
  return !!creds?.username?.trim() && !!creds?.apiKey?.trim();
}

/** Lee las credenciales desde activeUser.settings. */
export function getRaCredentialsFromSettings(settings: any): RaCredentials | null {
  const creds = { username: settings?.raUsername ?? '', apiKey: settings?.raApiKey ?? '' };
  return hasRaCredentials(creds) ? { username: creds.username.trim(), apiKey: creds.apiKey.trim() } : null;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 12000;

async function raGet<T>(endpoint: string, creds: RaCredentials, params: Record<string, string | number> = {}): Promise<T | null> {
  const query = new URLSearchParams({
    z: creds.username,
    y: creds.apiKey,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${RA_API}/${endpoint}?${query.toString()}`, { signal: controller.signal });
    if (!res.ok) {
      console.warn('[RetroAchievements]', endpoint, 'respondió', res.status);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn('[RetroAchievements] Error en', endpoint, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Comprueba usuario + API key (para el botón "Probar conexión" de Ajustes). */
export async function testRaCredentials(creds: RaCredentials): Promise<{ ok: boolean; points?: number }> {
  const profile = await raGet<{ User?: string; TotalPoints?: number }>(
    'API_GetUserProfile.php',
    creds,
    { u: creds.username },
  );
  return profile?.User ? { ok: true, points: profile.TotalPoints } : { ok: false };
}

// ─── Coincidencia por título ──────────────────────────────────────────────────

function normalizeTitle(raw: string): string {
  let t = (raw || '').toLowerCase();
  t = t.replace(/^~[^~]*~\s*/, '');        // "~Hack~ Juego" -> "Juego"
  t = t.replace(/\[[^\]]*\]/g, ' ');       // [Subset - Bonus], [!]
  t = t.replace(/\([^)]*\)/g, ' ');        // (USA), (Rev 1)
  t = t.replace(/,\s*(the|a|an)\b/g, '');  // "Legend of Zelda, The" -> "Legend of Zelda"
  t = t.replace(/&/g, ' and ');
  t = t.replace(/^(the|a|an)\s+/, '');
  t = t.replace(/[^a-z0-9]+/g, ' ').trim();
  return t;
}

function tokenSimilarity(a: string, b: string): number {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach((tok) => { if (B.has(tok)) inter += 1; });
  return inter / (A.size + B.size - inter);
}

function pickBestMatch(title: string, list: RaGameListEntry[]): RaGameListEntry | null {
  const target = normalizeTitle(title);
  if (!target) return null;

  // Subsets ("[Subset - ...]") comparten título base: se prefiere el juego base.
  const base = list.filter((g) => !/\[subset/i.test(g.Title));
  const pool = base.length > 0 ? base : list;

  const exact = pool.find((g) => normalizeTitle(g.Title) === target);
  if (exact) return exact;

  let best: RaGameListEntry | null = null;
  let bestScore = 0;
  for (const g of pool) {
    const score = tokenSimilarity(target, normalizeTitle(g.Title));
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return bestScore >= 0.75 ? best : null;
}

// ─── Caché ────────────────────────────────────────────────────────────────────

const LIST_CACHE_PREFIX = 'ra_gamelist_v1_';
const LIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROGRESS_TTL_MS = 10 * 60 * 1000;

interface ProgressCacheEntry {
  summary: SteamGameAchievementsSummary | null;
  timestamp: number;
}

const progressCache = new Map<string, ProgressCacheEntry>();
const inFlight = new Map<string, Promise<SteamGameAchievementsSummary | null>>();
const listInFlight = new Map<number, Promise<RaGameListEntry[]>>();
const listMemory = new Map<number, RaGameListEntry[]>();

async function getConsoleGameList(consoleId: number, creds: RaCredentials): Promise<RaGameListEntry[]> {
  const mem = listMemory.get(consoleId);
  if (mem) return mem;

  try {
    const raw = localStorage.getItem(`${LIST_CACHE_PREFIX}${consoleId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; games: RaGameListEntry[] };
      if (Date.now() - parsed.at < LIST_TTL_MS && Array.isArray(parsed.games)) {
        listMemory.set(consoleId, parsed.games);
        return parsed.games;
      }
    }
  } catch { /* sin caché local */ }

  const pending = listInFlight.get(consoleId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      // f=1: solo juegos con logros. h=0: sin hashes (respuesta mucho más ligera).
      const data = await raGet<RaGameListEntry[]>('API_GetGameList.php', creds, { i: consoleId, f: 1, h: 0 });
      const games = Array.isArray(data)
        ? data.map((g) => ({ ID: g.ID, Title: g.Title, ConsoleID: g.ConsoleID, NumAchievements: g.NumAchievements }))
        : [];
      if (games.length > 0) {
        listMemory.set(consoleId, games);
        try {
          localStorage.setItem(`${LIST_CACHE_PREFIX}${consoleId}`, JSON.stringify({ at: Date.now(), games }));
        } catch { /* localStorage lleno: no es crítico */ }
      }
      return games;
    } finally {
      listInFlight.delete(consoleId);
    }
  })();

  listInFlight.set(consoleId, promise);
  return promise;
}

/** Resuelve el GameID de RA. Guarda el resultado en `raGameId` del juego para no repetir. */
export async function resolveRaGame(item: RaGameRef, creds: RaCredentials): Promise<RaResolvedGame | null> {
  const known = Number(item.raGameId);
  if (Number.isFinite(known) && known > 0) return { raGameId: known, raTitle: item.title };

  const consoleId = getRaConsoleId(item);
  if (!consoleId) return null;

  const list = await getConsoleGameList(consoleId, creds);
  const match = pickBestMatch(item.title, list);
  return match ? { raGameId: match.ID, raTitle: match.Title } : null;
}

// ─── Logros ───────────────────────────────────────────────────────────────────

function rarityForPercentage(p: number | null): SteamGameAchievement['rarity'] {
  if (p !== null && p <= 1) return 'platinum';
  if (p !== null && p <= 5) return 'gold';
  if (p !== null && p <= 15) return 'silver';
  return 'bronze';
}

/** RA devuelve fechas "YYYY-MM-DD HH:mm:ss" en UTC. */
function parseRaDate(value?: string): number {
  if (!value) return 0;
  const ms = Date.parse(`${value.replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function buildSummary(data: RaGameProgressRaw): SteamGameAchievementsSummary | null {
  const rawList = Array.isArray(data.Achievements)
    ? data.Achievements
    : Object.values(data.Achievements ?? {});
  if (rawList.length === 0) return null;

  const players = data.NumDistinctPlayers ?? data.NumDistinctPlayersCasual ?? 0;
  const rarityCounts: SteamGameAchievementsSummary['rarityCounts'] = { platinum: 0, gold: 0, silver: 0, bronze: 0 };

  const achievements: SteamGameAchievement[] = rawList
    .map((a) => {
      const earnedDate = a.DateEarnedHardcore || a.DateEarned;
      const achieved = !!earnedDate;
      const globalPercentage = players > 0 ? Math.round((a.NumAwarded / players) * 1000) / 10 : null;
      const rarity = rarityForPercentage(globalPercentage);
      if (achieved) rarityCounts[rarity] += 1;
      return {
        apiName: String(a.ID),
        name: a.Title,
        description: a.Description || '',
        icon: `${RA_BADGE}/${a.BadgeName}.png`,
        lockedIcon: `${RA_BADGE}/${a.BadgeName}_lock.png`,
        achieved,
        unlockTime: parseRaDate(earnedDate),
        globalPercentage,
        rarity,
      };
    })
    // Igual que en Steam: primero los desbloqueados más recientes, luego los pendientes.
    .sort((x, y) => {
      if (x.achieved !== y.achieved) return x.achieved ? -1 : 1;
      return y.unlockTime - x.unlockTime;
    });

  return {
    total: achievements.length,
    unlocked: achievements.filter((a) => a.achieved).length,
    rarityCounts,
    achievements,
  };
}

/**
 * Obtiene los logros de un juego retro para el usuario de RA configurado.
 * Devuelve null si: no hay credenciales, la consola no está soportada,
 * el juego no tiene set de logros en RA, o falla la red.
 */
export async function fetchRetroAchievements(
  item: RaGameRef,
  creds: RaCredentials | null | undefined,
  opts: { forceRefresh?: boolean; onResolved?: (r: RaResolvedGame) => void } = {},
): Promise<SteamGameAchievementsSummary | null> {
  if (!hasRaCredentials(creds)) return null;
  if (!isRetroAchievementsSupported(item)) return null;

  const cacheKey = `ra_${creds.username}_${item.id}`;

  if (!opts.forceRefresh) {
    const cached = progressCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp <= PROGRESS_TTL_MS) return cached.summary;
  }

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const promise = (async (): Promise<SteamGameAchievementsSummary | null> => {
    try {
      const resolved = await resolveRaGame(item, creds);
      if (!resolved) {
        progressCache.set(cacheKey, { summary: null, timestamp: Date.now() });
        return null;
      }
      opts.onResolved?.(resolved);

      const data = await raGet<RaGameProgressRaw>('API_GetGameInfoAndUserProgress.php', creds, {
        g: resolved.raGameId,
        u: creds.username,
      });
      const summary = data ? buildSummary(data) : null;
      progressCache.set(cacheKey, { summary, timestamp: Date.now() });
      return summary;
    } catch (err) {
      console.warn('[RetroAchievements] fetchRetroAchievements error:', err);
      return null;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

export function getCachedRetroAchievements(
  item: Pick<RaGameRef, 'id'>,
  creds: RaCredentials | null | undefined,
): SteamGameAchievementsSummary | null | undefined {
  if (!creds) return undefined;
  const entry = progressCache.get(`ra_${creds.username}_${item.id}`);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > PROGRESS_TTL_MS) return undefined;
  return entry.summary;
}

export function invalidateRetroAchievements(item: Pick<RaGameRef, 'id'>, creds: RaCredentials): void {
  progressCache.delete(`ra_${creds.username}_${item.id}`);
}

/*
 * ─── FASE 2: coincidencia exacta por hash de ROM ──────────────────────────────
 * La coincidencia por título falla con ROMs de nombre raro ("SMW_final2.sfc").
 * RA identifica los juegos por hash. En main.js (Electron) expón, por ejemplo,
 * `electronAPI.hashRomForRA(romPath, consoleId)`, y aquí usa
 * API_GetGameList.php?i=<consoleId>&h=1 (trae los hashes) para buscar la ROM.
 * Para NES/SNES/GB/GBA/Genesis suele bastar el MD5 del archivo (SNES/NES con
 * cabecera: quitarla antes). PS1/PS2/Saturn/DC/PSP hashean la imagen de disco
 * de forma específica; ver github.com/RetroAchievements/rcheevos (rc_hash).
 */