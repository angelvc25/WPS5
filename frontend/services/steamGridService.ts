/**
 * Servicio para obtener assets (grids, heroes, logos, iconos) de SteamGridDB.
 * Funciona directamente desde el frontend — en Electron con webSecurity:false
 * no hay problemas de CORS.  Si se ejecuta en el navegador normal y la API
 * rechaza la petición, se devuelven arrays vacíos.
 */

const WORKER_API_BASE = 'https://wps5-api.wps5-api.workers.dev';

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

export interface SteamGridDataResult {
  success: boolean;
  data?: {
    grid: string | null;
    hero: string | null;
    logo: string | null;
  };
  error?: string;
}

/**
  * Obtiene la portada (priorizando 1:1, luego 2:3, luego cualquiera), el fondo (hero) y el logo de un juego desde SteamGridDB.
  */
export async function fetchSteamGridData(
  title: string
): Promise<SteamGridDataResult> {
  if (!title) return { success: false, error: 'Título no proporcionado' };

  if (typeof window !== 'undefined' && (window as any).electronAPI?.fetchSteamGridData) {
    try {
      const res = await (window as any).electronAPI.fetchSteamGridData(title);
      if (res.success) return res;
    } catch (err) {
      console.warn('[SteamGrid] electronAPI fetchSteamGridData failed, trying direct fetch:', err);
    }
  }

  try {
    const res = await fetch(`${WORKER_API_BASE}/api/steamgrid?title=${encodeURIComponent(title)}`);
    if (!res.ok) return { success: false, error: `Worker API respondió ${res.status}` };
    const json = await res.json();
    if (!json.success || !json.game) {
      return { success: false, error: json.error || 'Juego no encontrado en SteamGridDB' };
    }

    const chosenGrid = json.grids?.[0]?.url || json.grids?.[0]?.thumb || null;
    const hero = json.heroes?.[0]?.url || json.heroes?.[0]?.thumb || null;
    const logo = json.logos?.[0]?.url || json.logos?.[0]?.thumb || null;

    return {
      success: true,
      data: {
        grid: chosenGrid,
        hero,
        logo,
      },
    };
  } catch (err: any) {
    console.error('[SteamGrid] Direct Worker fetch failed:', err);
    return { success: false, error: err?.message || 'Error al obtener datos de SteamGridDB' };
  }
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

  // 2. Fetch directo al Worker API
  try {
    const res = await fetch(`${WORKER_API_BASE}/api/steamgrid?title=${encodeURIComponent(title)}`);
    if (!res.ok) return empty;
    const json = await res.json();
    if (!json.success || !json.game) return empty;

    return {
      grids: (json.grids || []).map(mapAsset),
      heroes: (json.heroes || []).map(mapAsset),
      logos: (json.logos || []).map(mapAsset),
      icons: [],
    };
  } catch (err) {
    console.error('[SteamGrid] Direct Worker fetch failed:', err);
    return empty;
  }
}
