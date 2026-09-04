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
    const gameId = await searchGame(title);
    if (!gameId) return { success: false, error: 'Juego no encontrado en SteamGridDB' };

    const [grids1x1Res, grids2x3Res, gridsAllRes, heroesRes, logosRes] = await Promise.all([
      fetch(`${BASE}/grids/game/${gameId}?dimensions=512x512,1024x1024`, { headers }),
      fetch(`${BASE}/grids/game/${gameId}?dimensions=600x900`, { headers }),
      fetch(`${BASE}/grids/game/${gameId}`, { headers }),
      fetch(`${BASE}/heroes/game/${gameId}?limit=1`, { headers }),
      fetch(`${BASE}/logos/game/${gameId}?limit=1`, { headers }),
    ]);

    const [grids1x1, grids2x3, gridsAll, heroes, logos] = await Promise.all([
      grids1x1Res.ok ? grids1x1Res.json() : { success: false, data: [] },
      grids2x3Res.ok ? grids2x3Res.json() : { success: false, data: [] },
      gridsAllRes.ok ? gridsAllRes.json() : { success: false, data: [] },
      heroesRes.ok ? heroesRes.json() : { success: false, data: [] },
      logosRes.ok ? logosRes.json() : { success: false, data: [] },
    ]);

    let chosenGrid: string | null = null;
    if (grids1x1.success && grids1x1.data && grids1x1.data.length > 0) {
      chosenGrid = grids1x1.data[0].url || grids1x1.data[0].thumb;
    } else if (grids2x3.success && grids2x3.data && grids2x3.data.length > 0) {
      chosenGrid = grids2x3.data[0].url || grids2x3.data[0].thumb;
    } else if (gridsAll.success && gridsAll.data && gridsAll.data.length > 0) {
      const square = gridsAll.data.find((g: any) => g.width && g.height && g.width === g.height);
      const vertical2x3 = gridsAll.data.find((g: any) => g.width && g.height && Math.abs((g.width / g.height) - (2 / 3)) < 0.05);
      if (square) {
        chosenGrid = square.url || square.thumb;
      } else if (vertical2x3) {
        chosenGrid = vertical2x3.url || vertical2x3.thumb;
      } else {
        chosenGrid = gridsAll.data[0].url || gridsAll.data[0].thumb;
      }
    }

    return {
      success: true,
      data: {
        grid: chosenGrid,
        hero: heroes.success && heroes.data && heroes.data.length > 0 ? (heroes.data[0].url || heroes.data[0].thumb) : null,
        logo: logos.success && logos.data && logos.data.length > 0 ? (logos.data[0].url || logos.data[0].thumb) : null,
      },
    };
  } catch (err: any) {
    console.error('[SteamGrid] Direct fetch failed:', err);
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

  // 2. Fetch directo a la API (funciona en Electron con webSecurity:false)
  try {
    const gameId = await searchGame(title);
    if (!gameId) return empty;

    const [gridsRes, squaresRes, heroesRes, logosRes, iconsRes] = await Promise.all([
      fetch(`${BASE}/grids/game/${gameId}`, { headers }),
      fetch(`${BASE}/grids/game/${gameId}?dimensions=512x512,1024x1024`, { headers }),
      fetch(`${BASE}/heroes/game/${gameId}`, { headers }),
      fetch(`${BASE}/logos/game/${gameId}`, { headers }),
      fetch(`${BASE}/icons/game/${gameId}`, { headers }),
    ]);

    const [grids, squares, heroes, logos, icons] = await Promise.all([
      gridsRes.ok ? gridsRes.json() : { success: false, data: [] },
      squaresRes.ok ? squaresRes.json() : { success: false, data: [] },
      heroesRes.ok ? heroesRes.json() : { success: false, data: [] },
      logosRes.ok ? logosRes.json() : { success: false, data: [] },
      iconsRes.ok ? iconsRes.json() : { success: false, data: [] },
    ]);

    const list1x1 = (squares.success ? squares.data : []).map(mapAsset);
    const listAll = (grids.success ? grids.data : []).map(mapAsset);
    const list2x3 = listAll.filter((g: SteamGridAsset) => g.width && g.height && Math.abs((g.width / g.height) - (2 / 3)) < 0.05);
    const remaining = listAll.filter((g: SteamGridAsset) => !list1x1.some((s: SteamGridAsset) => s.id === g.id) && !list2x3.some((v: SteamGridAsset) => v.id === g.id));

    const mergedGridsMap = new Map<number, SteamGridAsset>();
    [...list1x1, ...list2x3, ...remaining].forEach(item => {
      if (!mergedGridsMap.has(item.id)) {
        mergedGridsMap.set(item.id, item);
      }
    });

    return {
      grids: Array.from(mergedGridsMap.values()),
      heroes: (heroes.success ? heroes.data : []).map(mapAsset),
      logos: (logos.success ? logos.data : []).map(mapAsset),
      icons: (icons.success ? icons.data : []).map(mapAsset),
    };
  } catch (err) {
    console.error('[SteamGrid] Direct fetch failed:', err);
    return empty;
  }
}
