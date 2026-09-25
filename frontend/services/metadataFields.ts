/**
 * Agregador de fuentes de metadatos por campo. Cada fuente devuelve la misma
 * forma normalizada para que el sync y la ficha la consuman por igual:
 * - rating en escala 0-5
 * - releaseDate como 'YYYY-MM-DD'
 */
import { fetchPsnMetadata, psnLocaleForLanguage } from './psnMetadataService';
import { fetchRawgGameData } from './rawgService';
import { fetchSteamInfo } from './steamDescriptionService';
import type { Language } from '@/i18n/translations';

export interface SourceFieldData {
  description: string | null;
  rating: number | null;
  publisher: string | null;
  genres: string[];
  releaseDate: string | null;
  coverUrl: string | null;
  backgroundUrl: string | null;
  /** Etiqueta de clasificación del Store (solo PSN, ej. "Juego completo"). */
  classification: string | null;
  /** Video de YouTube (solo IGDB). */
  youtubeId: string | null;
}

const emptyData = (): SourceFieldData => ({
  description: null,
  rating: null,
  publisher: null,
  genres: [],
  releaseDate: null,
  coverUrl: null,
  backgroundUrl: null,
  classification: null,
  youtubeId: null,
});

const steamCache = new Map<string, SourceFieldData | null>();
const igdbCache = new Map<string, SourceFieldData | null>();
const rawgCache = new Map<string, SourceFieldData | null>();
const psnCache = new Map<string, SourceFieldData | null>();

function cacheGet(map: Map<string, SourceFieldData | null>, key: string): SourceFieldData | null | undefined {
  if (!map.has(key)) return undefined;
  return map.get(key) ?? null;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value === 'string') {
    const match = value.match(/(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    // IGDB first_release_date viene en segundos Unix.
    const date = new Date(value * 1000);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

export function parseIgdbGenres(game: any): string[] {
  const raw = game?.genres;
  if (!Array.isArray(raw)) return [];
  const names = raw
    .map((g: any) => (typeof g === 'string' ? g : g?.name))
    .filter((n: any): n is string => typeof n === 'string' && n.trim().length > 0);
  return [...new Set(names)];
}

export function parseIgdbPublishers(game: any): string[] {
  const companies = game?.involved_companies;
  if (Array.isArray(companies) && companies.length > 0) {
    const flagged = companies
      .filter((c: any) => c?.publisher)
      .map((c: any) => c?.company?.name ?? c?.name)
      .filter((n: any): n is string => typeof n === 'string' && n.trim().length > 0);
    if (flagged.length > 0) return [...new Set(flagged)];
  }
  const direct = game?.publishers;
  if (Array.isArray(direct) && direct.length > 0) {
    const names = direct
      .map((p: any) => (typeof p === 'string' ? p : p?.name))
      .filter((n: any): n is string => typeof n === 'string' && n.trim().length > 0);
    if (names.length > 0) return [...new Set(names)];
  }
  return [];
}

function httpsCover(url: unknown, sizeFrom: string, sizeTo: string): string | null {
  if (typeof url !== 'string' || !url) return null;
  const full = url.startsWith('//') ? `https:${url}` : url;
  return full.replace(sizeFrom, sizeTo);
}

/** Steam: descripción localizada + rating 0-5. */
export async function fetchSteamFieldData(title: string, language: Language): Promise<SourceFieldData | null> {
  const key = `${language}:${title.toLowerCase().trim()}`;
  const cached = cacheGet(steamCache, key);
  if (cached !== undefined) return cached;
  try {
    const info = await fetchSteamInfo(title, language);
    if (!info.description && info.rating == null) {
      steamCache.set(key, null);
      return null;
    }
    const data: SourceFieldData = {
      ...emptyData(),
      description: info.description,
      rating: info.rating,
    };
    steamCache.set(key, data);
    return data;
  } catch {
    steamCache.set(key, null);
    return null;
  }
}

/** IGDB vía Electron (la API Key vive en el proceso principal). */
export async function fetchIgdbFieldData(title: string): Promise<SourceFieldData | null> {
  const key = title.toLowerCase().trim();
  const cached = cacheGet(igdbCache, key);
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined' || !(window as any).electronAPI?.fetchGameData) {
    return null;
  }
  try {
    const result = await (window as any).electronAPI.fetchGameData(title);
    if (!result?.success || !result.data) {
      igdbCache.set(key, null);
      return null;
    }
    const game = result.data;
    const rating = game.rating
      ? Math.round((game.rating / 20) * 10) / 10
      : (game.aggregated_rating ? Math.round((game.aggregated_rating / 20) * 10) / 10 : null);
    const data: SourceFieldData = {
      description: game.summary || null,
      rating,
      publisher: parseIgdbPublishers(game)[0] || null,
      genres: parseIgdbGenres(game),
      releaseDate: toIsoDate(game.first_release_date),
      coverUrl: httpsCover(game.cover?.url, 't_thumb', 't_cover_big'),
      backgroundUrl:
        httpsCover(game.screenshots?.[0]?.url, 't_thumb', 't_1080p') ||
        httpsCover(game.artworks?.[0]?.url, 't_thumb', 't_1080p'),
      classification: null,
      youtubeId: game.videos?.[0]?.video_id || null,
    };
    igdbCache.set(key, data);
    return data;
  } catch {
    igdbCache.set(key, null);
    return null;
  }
}

/** RAWG: rating 0-5, publicadoras, géneros y fecha tal cual. */
export async function fetchRawgFieldData(title: string): Promise<SourceFieldData | null> {
  const key = title.toLowerCase().trim();
  const cached = cacheGet(rawgCache, key);
  if (cached !== undefined) return cached;
  try {
    const result = await fetchRawgGameData(title);
    if (!result.success || !result.data) {
      rawgCache.set(key, null);
      return null;
    }
    const game = result.data;
    const data: SourceFieldData = {
      description: game.description_raw || game.description || null,
      rating: game.rating || null,
      publisher: game.publishers?.[0]?.name || null,
      genres: (game.genres || []).map((g) => g.name).filter(Boolean),
      releaseDate: toIsoDate(game.released),
      coverUrl: game.background_image || null,
      backgroundUrl: game.background_image_additional || game.background_image || null,
      classification: null,
      youtubeId: null,
    };
    rawgCache.set(key, data);
    return data;
  } catch {
    rawgCache.set(key, null);
    return null;
  }
}

/** PSN (API propia /api/psn) con locale según el idioma de la app. */
export async function fetchPsnFieldData(title: string, language?: string | null): Promise<SourceFieldData | null> {
  const locale = psnLocaleForLanguage(language);
  const key = `${locale}:${title.toLowerCase().trim()}`;
  const cached = cacheGet(psnCache, key);
  if (cached !== undefined) return cached;
  try {
    const result = await fetchPsnMetadata(title, { locale });
    if (!result || (!result.details && !result.match)) {
      psnCache.set(key, null);
      return null;
    }
    const data: SourceFieldData = {
      description: result.details?.description || null,
      rating: result.details?.communityScore != null
        ? Math.round((result.details.communityScore / 20) * 10) / 10
        : null,
      publisher: result.details?.publisher || null,
      genres: result.details?.genres || [],
      releaseDate: toIsoDate(result.details?.releaseDate),
      coverUrl: result.details?.coverUrl || result.match?.coverUrl || null,
      backgroundUrl: result.details?.backgroundUrl || result.match?.backgroundUrl || null,
      classification: result.match?.classificationLabel || result.match?.classification || null,
      youtubeId: null,
    };
    psnCache.set(key, data);
    return data;
  } catch {
    psnCache.set(key, null);
    return null;
  }
}
