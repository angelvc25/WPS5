export interface GameVideoResult {
  videoId: string;
  name: string;
  id?: string;
  type?: 'movie';
  thumbnail?: string;
  full?: string;
  youtube_id?: string;
  youtube_url?: string;
  embed_url?: string;
  source?: string;
  [key: string]: any;
}

interface CacheEntry {
  data: GameVideoResult[] | null;
  cachedAt: number;
}

const CACHE_PREFIX = 'game_video_cache_v2_';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días — los trailers no cambian seguido

function cacheKey(title: string) {
  return `${CACHE_PREFIX}${title.trim().toLowerCase()}`;
}

function readCache(title: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(cacheKey(title));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > TTL_MS) return null; // expirado
    return entry;
  } catch {
    return null;
  }
}

function writeCache(title: string, data: GameVideoResult[] | null) {
  try {
    localStorage.setItem(cacheKey(title), JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {
    /* localStorage lleno o no disponible — no es crítico, seguimos sin caché */
  }
}

/**
 * Devuelve los videos/trailers de un juego, cacheados en localStorage.
 * Solo llama a electronAPI.fetchIgdbVideos (proceso principal) si:
 *  - no hay entrada en caché o expiró, y
 *  - la API está disponible (Electron desktop, no build web puro).
 */
export async function fetchGameVideosByName(title: string): Promise<GameVideoResult[]> {
  if (!title?.trim()) return [];

  const cached = readCache(title);
  if (cached) return cached.data ?? [];

  const api = (window as any).electronAPI;
  if (!api?.fetchIgdbVideos) {
    // Sin Electron (o versión sin el handler) no hay forma de llamar a IGDB
    // desde aquí por CORS. Cacheamos "vacío" para no reintentar en cada render.
    writeCache(title, null);
    return [];
  }

  try {
    const res = await api.fetchIgdbVideos(title);
    const videos: GameVideoResult[] = res?.success ? res.data : [];
    writeCache(title, videos);
    return videos;
  } catch (err) {
    console.warn('[gameVideoService] Error fetching IGDB videos:', err);
    writeCache(title, null); // evita martillar la API si está fallando
    return [];
  }
}

export function invalidateGameVideoCache(title: string) {
  try {
    localStorage.removeItem(cacheKey(title));
  } catch { /* noop */ }
}
