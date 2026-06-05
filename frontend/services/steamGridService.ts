/**
 * Servicio para obtener assets (grids, heroes, logos, iconos) de SteamGridDB.
 * Funciona directamente desde el frontend — en Electron con webSecurity:false
 * no hay problemas de CORS.  Si se ejecuta en el navegador normal y la API
 * rechaza la petición, se devuelven arrays vacíos.
 */

const STEAMGRID_API_KEY = '6abd5716fa6f6cb81eaed8426560c5eb';
const BASE = 'https://www.steamgriddb.com/api/v2';

export interface SteamGridAsset {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
  author: { name: string; avatar: string };
}

export interface SteamGridAssetsResult {
  grids: SteamGridAsset[];
  heroes: SteamGridAsset[];
  logos: SteamGridAsset[];
  icons: SteamGridAsset[];
}

const headers = { Authorization: `Bearer ${STEAMGRID_API_KEY}` };

/**
 * Busca el gameId de SteamGridDB por nombre.
 */
async function searchGame(title: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${BASE}/search/autocomplete/${encodeURIComponent(title)}`,
      { headers }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      return json.data[0].id;
    }
    return null;
  } catch (err) {
    console.error('[SteamGrid] Error searching game:', err);
    return null;
  }
}

/**
 * Mapea un item crudo de la API a nuestro tipo SteamGridAsset.
 */
function mapAsset(raw: any): SteamGridAsset {
  return {
    id: raw.id,
    url: raw.url || raw.thumb || '',
    thumb: raw.thumb || raw.url || '',
    width: raw.width || 0,
    height: raw.height || 0,
    author: {
      name: raw.author?.name || 'Anonymous',
      avatar: raw.author?.avatar || '',
    },
  };
}

/**
 * Obtiene TODOS los assets de un juego dado su nombre.
 */
export async function fetchSteamGridAssets(
  title: string
): Promise<SteamGridAssetsResult> {
  const empty: SteamGridAssetsResult = {
    grids: [],
    heroes: [],
    logos: [],
    icons: [],
  };

  if (!title) return empty;

  // 1. Intentar vía electronAPI (proceso principal de Electron)
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    try {
      const res = await (window as any).electronAPI.fetchSteamGridAssets(title);
      if (res.success) {
        return {
          grids: (res.data.grids || []).map(mapAsset),
          heroes: (res.data.heroes || []).map(mapAsset),
          logos: (res.data.logos || []).map(mapAsset),
          icons: (res.data.icons || []).map(mapAsset),
        };
      }
    } catch (err) {
      console.warn('[SteamGrid] electronAPI call failed, trying direct fetch:', err);
    }
  }

  // 2. Fetch directo a la API (funciona en Electron con webSecurity:false)
  try {
    const gameId = await searchGame(title);
    if (!gameId) return empty;

    const [gridsRes, heroesRes, logosRes, iconsRes] = await Promise.all([
      fetch(`${BASE}/grids/game/${gameId}`, { headers }),
      fetch(`${BASE}/heroes/game/${gameId}`, { headers }),
      fetch(`${BASE}/logos/game/${gameId}`, { headers }),
      fetch(`${BASE}/icons/game/${gameId}`, { headers }),
    ]);

    const [grids, heroes, logos, icons] = await Promise.all([
      gridsRes.ok ? gridsRes.json() : { success: false, data: [] },
      heroesRes.ok ? heroesRes.json() : { success: false, data: [] },
      logosRes.ok ? logosRes.json() : { success: false, data: [] },
      iconsRes.ok ? iconsRes.json() : { success: false, data: [] },
    ]);

    return {
      grids: (grids.success ? grids.data : []).map(mapAsset),
      heroes: (heroes.success ? heroes.data : []).map(mapAsset),
      logos: (logos.success ? logos.data : []).map(mapAsset),
      icons: (icons.success ? icons.data : []).map(mapAsset),
    };
  } catch (err) {
    console.error('[SteamGrid] Direct fetch failed:', err);
    return empty;
  }
}
