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
export const fetchSteamMedia = async (appid: number): Promise<SteamMediaItem[]> => {
  try {
    const response = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=screenshots,movies&l=spanish`
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
export const fetchSteamMediaByName = async (gameName: string): Promise<{ items: SteamMediaItem[]; appid: number | null }> => {
  try {
    const encoded = encodeURIComponent(gameName);
    const searchRes = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encoded}&l=spanish&cc=US`
    );
    if (!searchRes.ok) return { items: [], appid: null };
    const searchData = await searchRes.json();
    const appid: number | null = searchData?.items?.[0]?.id ?? null;
    if (!appid) return { items: [], appid: null };

    const items = await fetchSteamMedia(appid);
    return { items, appid };
  } catch (error) {
    console.error('[SteamMedia] Error:', error);
    return { items: [], appid: null };
  }
};
