/**
 * Preferencias de sincronización de metadatos por campo, estilo Playnite.
 * Cada dato (descripción, puntuación, publicadora, géneros, fecha,
 * portada, fondo, logo) tiene su propia fuente configurable.
 */

export type TextFieldSource = 'steam' | 'igdb' | 'rawg' | 'psn' | 'none';
export type InfoFieldSource = 'psn' | 'igdb' | 'rawg' | 'none';
export type ArtFieldSource = 'steamgrid' | 'igdb' | 'rawg' | 'psn' | 'none';
export type LogoFieldSource = 'steamgrid' | 'psn' | 'none';

export interface FieldSyncPreferences {
  description: TextFieldSource;
  rating: TextFieldSource;
  publisher: InfoFieldSource;
  genres: InfoFieldSource;
  releaseDate: InfoFieldSource;
  cover: ArtFieldSource;
  background: ArtFieldSource;
  logo: LogoFieldSource;
}

/** Forma anterior (por grupos). Se sigue aceptando y se migra. */
export interface LegacySyncPreferences {
  ratingAndSummary?: string;
  cover?: string;
  background?: string;
  logo?: string;
}

export const DEFAULT_FIELD_SYNC_PREFERENCES: FieldSyncPreferences = {
  description: 'steam',
  rating: 'steam',
  publisher: 'psn',
  genres: 'psn',
  releaseDate: 'psn',
  cover: 'steamgrid',
  background: 'steamgrid',
  logo: 'steamgrid',
};

export type SyncFieldKey = keyof FieldSyncPreferences;

/** Fuentes válidas por campo (para la UI y para validar datos guardados). */
export const FIELD_SOURCE_OPTIONS: Record<SyncFieldKey, string[]> = {
  description: ['steam', 'igdb', 'rawg', 'psn', 'none'],
  rating: ['steam', 'igdb', 'rawg', 'psn', 'none'],
  publisher: ['psn', 'igdb', 'rawg', 'none'],
  genres: ['psn', 'igdb', 'rawg', 'none'],
  releaseDate: ['psn', 'igdb', 'rawg', 'none'],
  cover: ['steamgrid', 'igdb', 'rawg', 'psn', 'none'],
  background: ['steamgrid', 'igdb', 'rawg', 'psn', 'none'],
  logo: ['steamgrid', 'psn', 'none'],
};

export const SOURCE_LABELS: Record<string, string> = {
  steam: 'Steam',
  steamgrid: 'SteamGrid',
  igdb: 'IGDB',
  rawg: 'RAWG',
  psn: 'PSN',
};

function pickValid(options: string[], value: unknown, fallback: string): string {
  return typeof value === 'string' && options.includes(value) ? value : fallback;
}

/**
 * Normaliza preferencias guardadas (forma nueva parcial o forma anterior
 * por grupos) a la forma completa por campo.
 */
export function resolveFieldSyncPreferences(raw: unknown): FieldSyncPreferences {
  const defaults = { ...DEFAULT_FIELD_SYNC_PREFERENCES };
  if (!raw || typeof raw !== 'object') return defaults;

  const input = raw as Record<string, unknown>;
  const isNewShape =
    'description' in input || 'rating' in input || 'publisher' in input ||
    'genres' in input || 'releaseDate' in input;

  if (isNewShape) {
    (Object.keys(FIELD_SOURCE_OPTIONS) as SyncFieldKey[]).forEach((key) => {
      (defaults as Record<string, string>)[key] = pickValid(
        FIELD_SOURCE_OPTIONS[key],
        input[key],
        defaults[key],
      );
    });
    return defaults;
  }

  // Migración desde la forma anterior por grupos.
  const legacy = input as LegacySyncPreferences;
  const summary = pickValid(FIELD_SOURCE_OPTIONS.description, legacy.ratingAndSummary, defaults.description);
  defaults.description = summary as FieldSyncPreferences['description'];
  defaults.rating = summary as FieldSyncPreferences['rating'];
  defaults.cover = pickValid(FIELD_SOURCE_OPTIONS.cover, legacy.cover, defaults.cover) as FieldSyncPreferences['cover'];
  defaults.background = pickValid(
    FIELD_SOURCE_OPTIONS.background, legacy.background, defaults.background,
  ) as FieldSyncPreferences['background'];
  defaults.logo = pickValid(FIELD_SOURCE_OPTIONS.logo, legacy.logo, defaults.logo) as FieldSyncPreferences['logo'];
  return defaults;
}
