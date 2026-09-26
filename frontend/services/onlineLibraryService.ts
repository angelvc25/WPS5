/**
 * Biblioteca online WPS5: catálogo propio y de otros usuarios
 * (según visibilidad public/friends/private).
 */
import { authedOnlineRequest } from './onlineAccountService';

export interface OnlineLibraryGame {
  id: string;
  game_id: string;
  game_name: string;
  cover_url: string | null;
  metadata_json: string | null;
  added_at: string;
}

export interface OnlineLibraryResult {
  visible: boolean;
  reason?: string;
  userId?: string;
  username?: string;
  library: OnlineLibraryGame[];
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

export async function fetchOwnOnlineLibrary(): Promise<OnlineLibraryGame[]> {
  const data = await call<OnlineLibraryResult>('/library');
  return Array.isArray(data.library) ? data.library : [];
}

export async function addOnlineLibraryGame(input: {
  gameId: string;
  gameName: string;
  coverUrl?: string;
  metadata?: unknown;
}): Promise<OnlineLibraryGame | null> {
  const data = await call<{ game: OnlineLibraryGame }>('/library', {
    method: 'POST',
    body: JSON.stringify({
      gameId: input.gameId,
      gameName: input.gameName,
      ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    }),
  });
  return data.game || null;
}

export interface OnlineLibraryGameInput {
  gameId: string;
  gameName: string;
  coverUrl?: string;
  metadata?: unknown;
}

/**
 * Subida en lote: 1 sola petición para toda la biblioteca.
 * Lanza error con .batchUnsupported=true si el Worker aún no lo soporta.
 */
export async function uploadOnlineLibraryBatch(games: OnlineLibraryGameInput[]): Promise<number> {
  try {
    const data = await call<{ upserted?: number }>('/library', {
      method: 'POST',
      body: JSON.stringify({ games }),
    });
    if (typeof data.upserted !== 'number') {
      const err: any = new Error('batchUnsupported');
      err.batchUnsupported = true;
      throw err;
    }
    return data.upserted;
  } catch (error: any) {
    if (error?.status === 404 || error?.status === 405) {
      const err: any = new Error('batchUnsupported');
      err.batchUnsupported = true;
      err.status = error.status;
      throw err;
    }
    throw error;
  }
}

export async function removeOnlineLibraryGame(gameId: string): Promise<void> {
  await call('/library', {
    method: 'DELETE',
    body: JSON.stringify({ gameId }),
  });
}

export async function fetchOnlineUserLibrary(userId: string): Promise<OnlineLibraryResult> {
  const data = await call<OnlineLibraryResult>(`/library/${encodeURIComponent(userId)}`);
  return data;
}

const SYSTEM_IDS = new Set(['1', '5', 'last_played', 'more_library', 'media_gallery']);

function httpCoverOf(game: any): string | null {
  const img = game?.image;
  const url = typeof img === 'string' ? img : img?.uri;
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

export interface LocalLibraryGame {
  id: string;
  title?: string;
  type?: string;
  isFolder?: boolean;
  isGrid?: boolean;
  platform?: string;
  playtimeMinutes?: number;
  playtime_forever?: number;
  rating?: number;
  image?: unknown;
  lastPlayed?: number;
}

export interface LibrarySyncResult {
  uploaded: number;
  removed: number;
  total: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reintenta 429 (rate limit del Worker: 40 req/min) respetando Retry-After. */
async function withRateLimitRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error: any) {
      if (error?.status === 429 && attempt < maxRetries) {
        attempt += 1;
        await sleep(typeof error.retryAfterMs === 'number' ? error.retryAfterMs + 500 : 5000 * attempt);
        continue;
      }
      throw error;
    }
  }
}

/**
 * Sube la biblioteca local (upsert por gameId) y elimina del servidor los
 * juegos que ya no están en local. Secuencial para no saturar el Worker.
 */
export async function syncLocalLibraryToOnline(
  games: LocalLibraryGame[],
  onProgress?: (done: number, total: number) => void,
): Promise<LibrarySyncResult> {
  const locals = (games || []).filter(
    (g) =>
      g &&
      typeof g.id === 'string' &&
      !SYSTEM_IDS.has(g.id) &&
      !g.isFolder &&
      !g.isGrid &&
      g.type !== 'media' &&
      g.type !== 'web' &&
      typeof g.title === 'string' &&
      g.title.trim().length > 0,
  );
  let done = 0;
  const totalSteps = locals.length + 1;
  const report = () => {
    done += 1;
    onProgress?.(Math.min(done, totalSteps), totalSteps);
  };

  // Catálogo remoto primero: lo idéntico no se reenvía (el upsert del Worker
  // no duplicaría, pero cada POST consume rate limit).
  let remoteById = new Map<string, { game_name: string; cover_url: string | null; metadata_json: string | null }>();
  try {
    const remote = await withRateLimitRetry(() => fetchOwnOnlineLibrary());
    remoteById = new Map(remote.map((e) => [e.game_id, e]));
  } catch {
    /* sin lectura remota se sube todo */
  }

  let uploaded = 0;
  const changed = locals
    .map((game) => {
      const name = game.title!.trim().slice(0, 200);
      const cover = httpCoverOf(game);
      const metadata = {
        platform: game.platform || null,
        playtimeMinutes: Number(game.playtimeMinutes ?? game.playtime_forever ?? 0) || 0,
        ...(typeof game.rating === 'number' ? { rating: game.rating } : {}),
      };
      return { game, name, cover, metadata };
    })
    .filter(({ game, name, cover, metadata }) => {
      const remoteEntry = remoteById.get(game.id);
      return !(
        remoteEntry &&
        remoteEntry.game_name === name &&
        (remoteEntry.cover_url || null) === cover &&
        (remoteEntry.metadata_json || null) === JSON.stringify(metadata)
      );
    });

  if (changed.length > 0) {
    // Los idénticos ya cuentan como sincronizados.
    const changedIds = new Set(changed.map((c) => c.game.id));
    locals.forEach((g) => {
      if (!changedIds.has(g.id)) {
        uploaded += 1;
        report();
      }
    });
    try {
      // Un solo POST con todo: evita el rate limit por completo.
      uploaded = await withRateLimitRetry(() =>
        uploadOnlineLibraryBatch(
          changed.map(({ game, name, cover, metadata }) => ({
            gameId: game.id,
            gameName: name,
            ...(cover ? { coverUrl: cover } : {}),
            metadata,
          })),
        ),
      );
      changed.forEach(report);
    } catch (error: any) {
      if (!error?.batchUnsupported) throw error;
      // Worker antiguo: subir uno por uno.
      for (const { game, name, cover, metadata } of changed) {
        try {
          await withRateLimitRetry(() =>
            addOnlineLibraryGame({
              gameId: game.id,
              gameName: name,
              ...(cover ? { coverUrl: cover } : {}),
              metadata,
            }),
          );
          uploaded += 1;
        } catch {
          /* se reintenta la próxima vez */
        }
        report();
      }
    }
  } else {
    report();
  }

  let removed = 0;
  try {
    const remote = remoteById.size > 0 ? [...remoteById.keys()] : (await withRateLimitRetry(() => fetchOwnOnlineLibrary())).map((e) => e.game_id);
    const localIds = new Set(locals.map((g) => g.id));
    for (const gameId of remote) {
      if (!localIds.has(gameId)) {
        try {
          await withRateLimitRetry(() => removeOnlineLibraryGame(gameId));
          removed += 1;
        } catch {
          /* se reintenta la próxima vez */
        }
      }
    }
  } catch {
    /* sin lectura remota no se poda */
  }
  report();

  return { uploaded, removed, total: locals.length };
}
