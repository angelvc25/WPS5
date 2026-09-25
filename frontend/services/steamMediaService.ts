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
 */
export const fetchSteamMediaByName = async (gameName: string, language: Language = 'es') => {
  try {
    const encoded = encodeURIComponent(gameName);
    const searchRes = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encoded}&l=${STEAM_API_LANG[language]}&cc=US`
    );
    if (!searchRes.ok) return { items: [], appid: null };
    const searchData = await searchRes.json();
    const appid: number | null = searchData?.items?.[0]?.id ?? null;
    if (!appid) return { items: [], appid: null };

    const items = await fetchSteamMedia(appid, language);
    return { items, appid };
  } catch (error) {
    console.error('[SteamMedia] Error:', error);
    return { items: [], appid: null };
  }
};

/**
 * Capturas de un juego con filtro de plataforma: la búsqueda de Steam por
 * nombre trae el juego homónimo equivocado en plataformas que no son PC
 * (ej. el "Puppet Master" de Steam para el Puppeteer de PS3), así que solo
 * se usa Steam en PC (o sin plataforma). En el resto se va directo a las
 * fuentes de respaldo: RAWG y luego capturas/artworks de IGDB.
 */
export const resolveGameScreenshots = async (
  title: string,
  opts: { platform?: string | null; language?: Language } = {},
): Promise<SteamMediaItem[]> => {
  const platform = (opts.platform || '').trim().toLowerCase();
  const useSteam = !platform || platform === 'pc';

  if (useSteam) {
    const steamResult = await fetchSteamMediaByName(title, opts.language || 'es');
    const steamImages = (steamResult.items || []).filter((m) => m.type === 'screenshot');
    if (steamImages.length > 0) return steamImages;
  }

  const rawgImagesResult = await fetchRawgMediaByName(title);
  if (rawgImagesResult.success && rawgImagesResult.data?.length) {
    return mapRawgScreenshotsToMedia(rawgImagesResult.data);
  }

  if (typeof window !== 'undefined' && (window as any).electronAPI?.fetchIgdbAssets) {
    try {
      const igdb = await (window as any).electronAPI.fetchIgdbAssets(title);
      const shots = igdb?.success && igdb.data
        ? [...(igdb.data.artworks || []), ...(igdb.data.screenshots || [])]
        : [];
      const mapped = shots
        .filter((shot: any) => shot?.url)
        .map((shot: any) => ({
          id: String(shot.id),
          type: 'screenshot' as const,
          thumbnail: shot.thumb || shot.url,
          full: shot.url,
        }));
      if (mapped.length > 0) return mapped;
    } catch {
      /* sin respaldo de IGDB */
    }
  }

  return [];
};
