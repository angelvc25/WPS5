import type { Language } from '@/i18n/translations';
import { STEAM_API_LANG } from './steamLanguage';
import { fetchRawgMediaByName, mapRawgScreenshotsToMedia } from './rawgService';

export interface SteamMediaItem {
  id: string;
  type: 'screenshot' | 'movie';
  /** URL de la miniatura para mostrar en el row */
  thumbnail: string;
  /** URL de la imagen completa (screenshots) */
  full?: string;
  /** Nombre del trailer (movies) */
  name?: string;
  /** URL del vídeo MP4 480p (movies) */
  mp4_url?: string;
}

// ─── Caché en memoria para Steam media ────────────────────────────────────────
const STEAM_MEDIA_TTL = 30 * 60 * 1000; // 30 minutos
interface SteamMediaCacheEntry {
  items: SteamMediaItem[];
  appid: number | null;
  cachedAt: number;
}
const steamMediaCache = new Map<string, SteamMediaCacheEntry>();
const steamMediaInFlight = new Map<string, Promise<{ items: SteamMediaItem[]; appid: number | null }>>();

/**
 * Obtiene las capturas de pantalla y trailers de un juego en Steam
 * usando el endpoint público de appdetails.
 */
export const fetchSteamMedia = async (appid: number, language: Language = 'es') => {
  try {
    const response = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=screenshots,movies&l=${STEAM_API_LANG[language]}`
    );
    if (!response.ok) return [];
    const json = await response.json();
    const data = json?.[String(appid)]?.data;
    if (!data) return [];

    const items: SteamMediaItem[] = [];

    // Trailers primero (destacados al principio)
    const movies: any[] = data.movies || [];
    movies.forEach((m: any) => {
      const mp4 = m.mp4?.['480'] || m.mp4?.max || '';
      const thumbnail = m.thumbnail || '';
      if (thumbnail) {
        items.push({
          id: `movie_${m.id}`,
          type: 'movie',
          thumbnail,
          name: m.name || 'Trailer',
          mp4_url: mp4,
        });
      }
    });

    // Capturas de pantalla
    const screenshots: any[] = data.screenshots || [];
    screenshots.forEach((s: any) => {
      if (s.path_thumbnail) {
        items.push({
          id: `shot_${s.id}`,
          type: 'screenshot',
          thumbnail: s.path_thumbnail,
          full: s.path_full,
        });
      }
    });

    return items;
  } catch (error) {
    console.error('[SteamMedia] Error fetching media:', error);
    return [];
  }
};

/**
 * Busca el appid de un juego por nombre y luego obtiene sus capturas/trailers.
 * Usa caché en memoria (30 min) y deduplicación de peticiones in-flight.
 */
export const fetchSteamMediaByName = async (gameName: string, language: Language = 'es') => {
  const cacheKey = `${gameName.trim().toLowerCase()}:${language}`;

  // 1. Caché en memoria
  const cached = steamMediaCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < STEAM_MEDIA_TTL) {
    return { items: cached.items, appid: cached.appid };
  }

  // 2. Deduplicación de peticiones concurrentes
  const inFlight = steamMediaInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const encoded = encodeURIComponent(gameName);
      const searchRes = await fetch(
        `https://store.steampowered.com/api/storesearch/?term=${encoded}&l=${STEAM_API_LANG[language]}&cc=US`
      );
      if (!searchRes.ok) return { items: [], appid: null };
      const searchData = await searchRes.json();
      const appid: number | null = searchData?.items?.[0]?.id ?? null;
      if (!appid) {
        steamMediaCache.set(cacheKey, { items: [], appid: null, cachedAt: Date.now() });
        return { items: [], appid: null };
      }

      const items = await fetchSteamMedia(appid, language);
      steamMediaCache.set(cacheKey, { items, appid, cachedAt: Date.now() });
      return { items, appid };
    } catch (error) {
      console.error('[SteamMedia] Error:', error);
      return { items: [], appid: null };
    } finally {
      steamMediaInFlight.delete(cacheKey);
    }
  })();

  steamMediaInFlight.set(cacheKey, promise);
  return promise;
};

// ─── Caché de capturas resueltas (Steam + RAWG + IGDB combinado) ──────────────
const SCREENSHOTS_TTL = 15 * 60 * 1000; // 15 minutos
const screenshotsCache = new Map<string, { items: SteamMediaItem[]; cachedAt: number }>();
const screenshotsInFlight = new Map<string, Promise<SteamMediaItem[]>>();

/**
 * Capturas de un juego con filtro de plataforma: dispara Steam, RAWG e IGDB
 * EN PARALELO (Promise.all) y devuelve la fuente con más resultados.
 * En plataformas distintas de PC se omite Steam para evitar homónimos.
 */
export const resolveGameScreenshots = async (
  title: string,
  opts: { platform?: string | null; language?: Language } = {},
): Promise<SteamMediaItem[]> => {
  const platform = (opts.platform || '').trim().toLowerCase();
  const useSteam = !platform || platform === 'pc';
  const lang = opts.language || 'es';
  const cacheKey = `${title.trim().toLowerCase()}:${platform}:${lang}`;

  // 1. Caché en memoria
  const cached = screenshotsCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < SCREENSHOTS_TTL) {
    return cached.items;
  }

  // 2. Deduplicación in-flight
  const inFlight = screenshotsInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<SteamMediaItem[]> => {
    try {
      // Priorizar Steam si aplica: si Steam devuelve capturas rápidamente (CDN Akamai),
      // no necesitamos esperar por RAWG ni IGDB, evitando saturar el Worker.
      if (useSteam) {
        const steamShots = await fetchSteamMediaByName(title, lang)
          .then(r => (r.items || []).filter(m => m.type === 'screenshot'))
          .catch(() => [] as SteamMediaItem[]);

        if (steamShots.length > 0) {
          screenshotsCache.set(cacheKey, { items: steamShots, cachedAt: Date.now() });
          return steamShots;
        }
      }

      // Fallback a RAWG e IGDB en paralelo solo si Steam no tiene capturas o no aplica
      const rawgPromise = fetchRawgMediaByName(title).then(r =>
        r.success && r.data?.length ? mapRawgScreenshotsToMedia(r.data) : []
      ).catch(() => [] as SteamMediaItem[]);

      const igdbPromise = (typeof window !== 'undefined' && (window as any).electronAPI?.fetchIgdbAssets)
        ? (window as any).electronAPI.fetchIgdbAssets(title).then((igdb: any) => {
          if (!igdb?.success || !igdb.data) return [];
          const shots = [...(igdb.data.artworks || []), ...(igdb.data.screenshots || [])];
          return shots
            .filter((shot: any) => shot?.url)
            .map((shot: any): SteamMediaItem => ({
              id: String(shot.id),
              type: 'screenshot' as const,
              thumbnail: shot.thumb || shot.url,
              full: shot.url,
            }));
        }).catch(() => [] as SteamMediaItem[])
        : Promise.resolve<SteamMediaItem[]>([]);

      const [rawgImages, igdbImages] = await Promise.all([rawgPromise, igdbPromise]);
      const result = rawgImages.length > 0 ? rawgImages : igdbImages;

      screenshotsCache.set(cacheKey, { items: result, cachedAt: Date.now() });
      return result;
    } catch (err) {
      console.error('[SteamMedia] resolveGameScreenshots error:', err);
      return [];
    } finally {
      screenshotsInFlight.delete(cacheKey);
    }
  })();

  screenshotsInFlight.set(cacheKey, promise);
  return promise;
};
