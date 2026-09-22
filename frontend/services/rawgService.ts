const BASE = 'https://api.rawg.io/api';

// ─── Caché en memoria para RAWG Media ──────────────────────────────────────────

interface RawgCacheEntry<T> {
  data: T;
  timestamp: number;
}

const RAWG_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

const rawgScreenshotsCache = new Map<string, RawgCacheEntry<RawgScreenshot[]>>();
const rawgVideosCache = new Map<string, RawgCacheEntry<RawgMovie[]>>();
const rawgInFlight = new Map<string, Promise<RawgResult<any>>>();

function getCacheKey(title: string, type: 'screenshots' | 'videos'): string {
  return `rawg_${type}_${title.toLowerCase().trim()}`;
}

function getCachedRawgData<T>(cache: Map<string, RawgCacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > RAWG_CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

export interface RawgPlatform {
    id: number;
    name: string;
    slug: string;
}

export interface RawgGameSummary {
    id: number;
    slug: string;
    name: string;
    released: string | null;
    background_image: string | null;
    rating: number;
    metacritic: number | null;
    platforms?: {
        platform: RawgPlatform;
    }[];
}

export interface RawgGameDetails extends RawgGameSummary {
    description?: string;
    description_raw?: string;
    background_image_additional?: string | null;
    website?: string | null;
    genres?: {
        id: number;
        name: string;
        slug: string;
    }[];
    developers?: {
        id: number;
        name: string;
        slug: string;
    }[];
    publishers?: {
        id: number;
        name: string;
        slug: string;
    }[];
}

interface RawgListResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface RawgResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * El proceso principal de Electron proporciona los datos.
 * El servicio no contiene la API Key.
 */
export async function fetchRawgGameData(
    title: string
): Promise<RawgResult<RawgGameDetails>> {
    if (!title?.trim()) {
        return {
            success: false,
            error: 'Título no proporcionado',
        };
    }

    try {
        if (
            typeof window !== 'undefined' &&
            (window as any).electronAPI?.fetchRawgGameData
        ) {
            return await (window as any).electronAPI.fetchRawgGameData(title);
        }

        return {
            success: false,
            error: 'API de RAWG no disponible',
        };
    } catch (error: any) {
        console.error('[RAWG] Error:', error);

        return {
            success: false,
            error: error?.message || 'Error al obtener datos de RAWG',
        };
    }
}

export interface RawgScreenshot {
    id: number;
    image: string;
    width: number;
    height: number;
    is_deleted: boolean;
}

export interface RawgScreenshotsResult {
    count: number;
    next: string | null;
    previous: string | null;
    results: RawgScreenshot[];
}

/**
 * Obtiene las capturas de pantalla de un juego desde RAWG.
 * La API Key se mantiene en el proceso principal de Electron.
 * Usa caché en memoria (10 min) y deduplicación de peticiones.
 */
export async function fetchRawgMediaByName(
    title: string
): Promise<RawgResult<RawgScreenshot[]>> {
    if (!title?.trim()) {
        return {
            success: false,
            error: 'Título no proporcionado',
        };
    }

    const cacheKey = getCacheKey(title, 'screenshots');

    // 1. Caché en memoria
    const cached = getCachedRawgData(rawgScreenshotsCache, cacheKey);
    if (cached !== undefined) {
        return { success: true, data: cached };
    }

    // 2. Deduplicación de peticiones concurrentes
    const inFlight = rawgInFlight.get(cacheKey);
    if (inFlight) return inFlight as Promise<RawgResult<RawgScreenshot[]>>;

    const promise = (async (): Promise<RawgResult<RawgScreenshot[]>> => {
        try {
            let result: RawgResult<RawgScreenshot[]>;
            if (
                typeof window !== 'undefined' &&
                (window as any).electronAPI?.fetchRawgScreenshots
            ) {
                result = await (window as any).electronAPI.fetchRawgScreenshots(title);
            } else {
                result = {
                    success: false,
                    error: 'API de capturas RAWG no disponible',
                };
            }

            if (result.success && result.data) {
                rawgScreenshotsCache.set(cacheKey, { data: result.data, timestamp: Date.now() });
            }
            return result;
        } catch (error: any) {
            console.error('[RAWG Screenshots] Error:', error);
            return {
                success: false,
                error: error?.message || 'Error al obtener capturas desde RAWG',
            };
        } finally {
            rawgInFlight.delete(cacheKey);
        }
    })();

    rawgInFlight.set(cacheKey, promise);
    return promise;
}

export function mapRawgScreenshotsToMedia(
    screenshots: RawgScreenshot[]
) {
    return screenshots.map((screenshot) => ({
        id: `rawg_screenshot_${screenshot.id}`,
        type: 'screenshot' as const,
        thumbnail: screenshot.image,
        full: screenshot.image,
        source: 'rawg',
    }));
}

export interface RawgMovie {
    id: number;
    name: string;
    preview: string;
    mp4_max: string;
    mp4_480: string;
}

/**
 * Obtiene los trailers de gameplay de un juego desde RAWG.
 * Se usan como reemplazo de los trailers de Steam, cuyo mp4 muchas veces
 * no reproduce (URL rota o bloqueada por CORS) aunque la miniatura sí cargue.
 * Usa caché en memoria (10 min) y deduplicación de peticiones.
 */
export async function fetchRawgVideosByName(
    title: string
): Promise<RawgResult<RawgMovie[]>> {
    if (!title?.trim()) {
        return {
            success: false,
            error: 'Título no proporcionado',
        };
    }

    const cacheKey = getCacheKey(title, 'videos');

    // 1. Caché en memoria
    const cached = getCachedRawgData(rawgVideosCache, cacheKey);
    if (cached !== undefined) {
        return { success: true, data: cached };
    }

    // 2. Deduplicación de peticiones concurrentes
    const inFlight = rawgInFlight.get(cacheKey);
    if (inFlight) return inFlight as Promise<RawgResult<RawgMovie[]>>;

    const promise = (async (): Promise<RawgResult<RawgMovie[]>> => {
        try {
            let result: RawgResult<RawgMovie[]>;
            if (
                typeof window !== 'undefined' &&
                (window as any).electronAPI?.fetchRawgVideos
            ) {
                result = await (window as any).electronAPI.fetchRawgVideos(title);
            } else {
                result = {
                    success: false,
                    error: 'API de videos RAWG no disponible',
                };
            }

            if (result.success && result.data) {
                rawgVideosCache.set(cacheKey, { data: result.data, timestamp: Date.now() });
            }
            return result;
        } catch (error: any) {
            console.error('[RAWG Videos] Error:', error);
            return {
                success: false,
                error: error?.message || 'Error al obtener videos de RAWG',
            };
        } finally {
            rawgInFlight.delete(cacheKey);
        }
    })();

    rawgInFlight.set(cacheKey, promise);
    return promise;
}

export function mapRawgMoviesToMedia(movies: RawgMovie[]) {
    return movies.map((movie) => ({
        id: `rawg_movie_${movie.id}`,
        type: 'movie' as const,
        thumbnail: movie.preview,
        full: movie.preview,
        mp4_url: movie.mp4_max || movie.mp4_480,
        source: 'rawg',
    }));
}