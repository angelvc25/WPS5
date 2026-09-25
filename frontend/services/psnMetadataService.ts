export interface PsnSearchResult {
  id: string;
  name: string;
  type: string;
  classification: string | null;
  classificationLabel: string | null;
  description: string | null;
  platforms: string[];
  coverUrl: string;
  backgroundUrl: string | null;
  url: string;
  route: 'product' | 'concept';
}

export interface PsnSearchResponse {
  query: string;
  locale: string;
  count: number;
  results: PsnSearchResult[];
}

export interface PsnProductDetails {
  id: string;
  name: string | null;
  description: string | null;
  genres: string[];
  publisher: string | null;
  releaseDate: string | null;
  communityScore: number | null;
  coverUrl: string | null;
  backgroundUrl: string | null;
  platforms: string[];
  locale: string;
  url: string;
}

export interface PsnMetadata {
  query: string;
  locale: string;
  match: PsnSearchResult | null;
  details: PsnProductDetails | null;
  candidates?: PsnSearchResult[];
}

/**
 * Mapea el idioma de la app al locale del PlayStation Store para que las
 * descripciones y fichas lleguen localizadas. Si el idioma no se reconoce,
 * se usa 'es-CO' (mismo valor que el backend usa por defecto).
 */
export function psnLocaleForLanguage(language?: string | null): string {
  switch (language) {
    case 'en':
      return 'en-US';
    case 'pt':
      return 'pt-BR';
    case 'es':
      return 'es-CO';
    default:
      return 'es-CO';
  }
}

// Plataformas sin ficha fiable en el Store moderno (solo indexa PS4/PS5).
// Buscarlas en PSN trae el juego homónimo equivocado (ej. el Ratchet & Clank
// de PS4 para el Tools of Destruction de PS3), así que se excluyen y se usa
// IGDB en su lugar. Sin plataforma informada se permite (comportamiento actual).
const NON_PSN_PLATFORMS = new Set([
  'ps1', 'psx', 'psone', 'playstation1',
  'ps2', 'playstation2',
  'ps3', 'playstation3',
  'psp', 'playstationportable',
  'psvita', 'vita', 'playstationvita',
  'retro', 'arcade', 'mame', 'neogeo',
  'nes', 'snes', 'n64', 'nintendo64', 'gamecube', 'wii', 'wiiu',
  'switch', 'nintendoswitch', 'gameboy', 'gbc', 'gba', 'ds', '3ds',
  'sega', 'genesis', 'megadrive', 'dreamcast', 'saturn', 'mastersystem',
  'atari', 'amiga', 'commodore',
]);

export function isPsnEligiblePlatform(platform?: string | null): boolean {
  if (!platform?.trim()) return true;
  const normalized = platform.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return !NON_PSN_PLATFORMS.has(normalized);
}

const PSN_API_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_STORE_API_URL) ||
  'http://localhost:3000';

const REQUEST_TIMEOUT_MS = 8000;

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

function isValidPsnSearchResult(value: unknown): value is PsnSearchResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as PsnSearchResult;
  return (
    typeof result.id === 'string' &&
    typeof result.name === 'string' &&
    typeof result.coverUrl === 'string' &&
    typeof result.url === 'string'
  );
}

function isValidPsnProductDetails(value: unknown): value is PsnProductDetails {
  if (!value || typeof value !== 'object') return false;
  const details = value as PsnProductDetails;
  return (
    typeof details.id === 'string' &&
    typeof details.url === 'string' &&
    Array.isArray(details.genres)
  );
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PSN_API_URL}${path}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn('[PsnMetadataService] API respondió con error:', response.status);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.warn('[PsnMetadataService] No se pudo contactar la API de metadatos PSN:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export const searchPsnGames = async (
  query: string,
  options: { locale?: string; limit?: number } = {},
): Promise<PsnSearchResult[]> => {
  try {
    if (!query?.trim()) return [];

    const data = await fetchJson<PsnSearchResponse>(
      `/api/psn/search${buildQuery({ q: query.trim(), locale: options.locale, limit: options.limit })}`,
    );

    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      console.warn('[PsnMetadataService] API devolvió una lista vacía');
      return [];
    }

    return data.results.filter(isValidPsnSearchResult);
  } catch (error) {
    console.error('[PsnMetadataService] Error buscando juegos de PSN:', error);
    return [];
  }
};

export const fetchPsnProductDetails = async (
  id: string,
  options: { locale?: string; route?: 'product' | 'concept' } = {},
): Promise<PsnProductDetails | null> => {
  try {
    if (!id?.trim()) return null;

    const data = await fetchJson<PsnProductDetails>(
      `/api/psn/product/${encodeURIComponent(id.trim())}${buildQuery({
        locale: options.locale,
        route: options.route,
      })}`,
    );

    if (!data || !isValidPsnProductDetails(data)) {
      console.warn('[PsnMetadataService] API devolvió una ficha inválida');
      return null;
    }

    return data;
  } catch (error) {
    console.error('[PsnMetadataService] Error obteniendo ficha de PSN:', error);
    return null;
  }
};

export const fetchPsnMetadata = async (
  name: string,
  options: { locale?: string } = {},
): Promise<PsnMetadata | null> => {
  try {
    if (!name?.trim()) return null;

    const data = await fetchJson<PsnMetadata>(
      `/api/psn/metadata${buildQuery({ name: name.trim(), locale: options.locale })}`,
    );

    if (!data) {
      console.warn('[PsnMetadataService] API devolvió metadatos vacíos');
      return null;
    }

    return data;
  } catch (error) {
    console.error('[PsnMetadataService] Error obteniendo metadatos de PSN:', error);
    return null;
  }
};
