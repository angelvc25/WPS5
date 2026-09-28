/**
 * Trofeos online WPS5: resumen por juego (con tiers platino/oro/plata/bronce)
 * y amigos en común. Solo se suben resúmenes, nunca el detalle por logro.
 */
import { authedOnlineRequest, getOnlineSession, type OnlineUser } from './onlineAccountService';
import { fetchSteamGameAchievements } from './steamUserService';

export interface TrophyGameSummary {
  gameId: string;
  gameName: string;
  total: number;
  unlocked: number;
  platinum: number;
  gold: number;
  silver: number;
  bronze: number;
}

export interface UserTrophiesResult {
  visible: boolean;
  reason?: string;
  userId?: string;
  username?: string;
  trophies: TrophyGameSummary[];
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await authedOnlineRequest<T>(path, init);
  } catch (error: any) {
    if (error?.status) throw error;
    const err: any = new Error('network');
    err.status = 0;
    throw err;
  }
}

function toIntCount(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function fetchUserTrophies(userId: string): Promise<UserTrophiesResult> {
  const data = await call<{
    visible: boolean;
    reason?: string;
    userId?: string;
    username?: string;
    trophies: any[];
  }>(`/trophies/${encodeURIComponent(userId)}`);
  const list = Array.isArray(data.trophies) ? data.trophies : [];
  return {
    visible: data.visible !== false,
    reason: data.reason,
    userId: data.userId,
    username: data.username,
    trophies: list
      .map((g) => ({
        gameId: String(g.gameId || g.game_id || ''),
        gameName: String(g.gameName || g.game_name || ''),
        total: toIntCount(g.total),
        unlocked: toIntCount(g.unlocked),
        platinum: toIntCount(g.platinum),
        gold: toIntCount(g.gold),
        silver: toIntCount(g.silver),
        bronze: toIntCount(g.bronze),
      }))
      .filter((g) => g.gameId && g.gameName),
  };
}

export async function uploadTrophySummaries(games: TrophyGameSummary[]): Promise<number> {
  const data = await call<{ upserted?: number }>('/trophies', {
    method: 'PUT',
    body: JSON.stringify({ games }),
  });
  return typeof data.upserted === 'number' ? data.upserted : 0;
}

export async function fetchMutualFriends(userId: string): Promise<OnlineUser[]> {
  const data = await call<{ mutual: OnlineUser[] }>(
    `/users/${encodeURIComponent(userId)}/mutual-friends`,
  );
  return Array.isArray(data.mutual) ? data.mutual : [];
}

/** Extrae el AppID de Steam del juego (`steam_<appid>` o campo steamAppId). */
export function extractSteamAppId(game: any): number | null {
  const fromId = typeof game?.id === 'string' ? game.id.match(/^steam_(\d+)$/) : null;
  if (fromId) return Number(fromId[1]);
  const n = Number(game?.steamAppId ?? game?.appid);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface LocalTrophyGame {
  id: string;
  title?: string;
  steamAppId?: unknown;
}

/**
 * Calcula el resumen de trofeos de los juegos Steam de la biblioteca local.
 * Secuencial para no saturar la API de Steam; omite juegos sin logros.
 */
export async function computeLocalTrophySummaries(
  games: LocalTrophyGame[],
  opts: {
    apiKey: string;
    steamId: string;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<TrophyGameSummary[]> {
  const steamGames = (games || []).filter(
    (g) => g && typeof g.title === 'string' && g.title.trim().length > 0 && extractSteamAppId(g),
  );
  const out: TrophyGameSummary[] = [];
  let done = 0;
  for (const game of steamGames) {
    const appId = extractSteamAppId(game);
    if (appId) {
      try {
        const summary = await fetchSteamGameAchievements(opts.apiKey, opts.steamId, appId);
        if (summary && summary.total > 0 && summary.unlocked > 0) {
          out.push({
            gameId: game.id,
            gameName: game.title!.trim().slice(0, 200),
            total: summary.total,
            unlocked: summary.unlocked,
            platinum: summary.rarityCounts?.platinum || 0,
            gold: summary.rarityCounts?.gold || 0,
            silver: summary.rarityCounts?.silver || 0,
            bronze: summary.rarityCounts?.bronze || 0,
          });
        }
      } catch {
        /* juego sin logros visibles: se omite */
      }
    }
    done += 1;
    opts.onProgress?.(done, steamGames.length);
  }
  return out;
}

/**
 * Sincroniza los trofeos locales (Steam) al perfil online. Best-effort:
 * nunca lanza si no hay sesión o falla la red.
 */
export async function syncLocalTrophiesToOnline(
  games: LocalTrophyGame[],
  opts: { apiKey: string; steamId: string },
): Promise<{ uploaded: number; games: number }> {
  if (!getOnlineSession()) return { uploaded: 0, games: 0 };
  const summaries = await computeLocalTrophySummaries(games, opts);
  if (summaries.length === 0) return { uploaded: 0, games: 0 };
  const uploaded = await uploadTrophySummaries(summaries);
  return { uploaded, games: summaries.length };
}
