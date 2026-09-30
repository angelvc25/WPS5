/**
 * Sistema de temas WPS5.
 * - Colores de acento (anillos de foco, botones principales, resaltados)
 * - Packs de sonido intercambiables (volúmenes + overrides de ficheros)
 *
 * El wallpaper lo gestiona el usuario (BackgroundPickerModal / home_background),
 * por eso los temas ya no incluyen fondos.
 *
 * Persistencia: `UserSettings.theme = { accentId, soundPackId }`
 * ver `components/UserSelectScreen.tsx`.
 */

export interface AccentTheme {
  id: string;
  label: string;
  /** Color principal (botones, bordes activos, highlights) */
  color: string;
  /** Glow / sombra para foco */
  glow: string;
  /** Versión suave para fondos / badges */
  soft: string;
}

export const ACCENTS: AccentTheme[] = [
  { id: 'ps-white', label: 'PS5', color: 'rgba(180, 210, 255, 0.88)', glow: 'rgba(223, 248, 182, 0.95)', soft: 'rgba(175, 22, 22, 0.14)' },
  { id: 'ps-blue', label: 'PlayStation Blue', color: '#0070D1', glow: 'rgba(0,112,209,0.45)', soft: 'rgba(0,112,209,0.14)' },
  { id: 'cyan', label: 'Cyan', color: '#00D4FF', glow: 'rgba(0,212,255,0.45)', soft: 'rgba(0,212,255,0.14)' },
  { id: 'green', label: 'Green', color: '#4CD964', glow: 'rgba(76,217,100,0.45)', soft: 'rgba(76,217,100,0.14)' },
  { id: 'gold', label: 'Gold', color: '#d9ff00ff', glow: 'rgba(255, 204, 0, 0.45)', soft: 'rgba(255,204,0,0.14)' },
  { id: 'orange', label: 'Orange', color: '#FF9500', glow: 'rgba(255,149,0,0.45)', soft: 'rgba(255,149,0,0.14)' },
  { id: 'red', label: 'Red', color: '#fd0d00ff', glow: 'rgba(255,59,48,0.45)', soft: 'rgba(255,59,48,0.14)' },
  { id: 'purple', label: 'Purple', color: '#AF52DE', glow: 'rgba(175,82,222,0.45)', soft: 'rgba(175,82,222,0.14)' },
  { id: 'pink', label: 'Pink', color: '#FF2D92', glow: 'rgba(255,45,146,0.45)', soft: 'rgba(255,45,146,0.14)' },
];

export const DEFAULT_ACCENT_ID = 'ps-blue';

export function getAccent(id?: string | null): AccentTheme {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

export type SoundName =
  | 'background'
  | 'navigation'
  | 'activation'
  | 'openHome'
  | 'tab'
  | 'back'
  | 'openControlCenter'
  | 'exit'
  | 'notification';

export interface SoundPack {
  id: string;
  label: string;
  description: string;
  backgroundVolume: number;
  uiVolume: number;
  /** Overrides opcionales de ficheros. Clave = SoundName. */
  files?: Partial<Record<SoundName, any>>;
}

export const SOUND_PACKS: SoundPack[] = [
  {
    id: 'ps5-default',
    label: 'PS5 Default',
    description: 'Sonidos originales de WPS5',
    backgroundVolume: 1.0,
    uiVolume: 1.0,
  },
  {
    id: 'soft',
    label: 'Soft',
    description: 'Mismo pack, volumen reducido',
    backgroundVolume: 0.3,
    uiVolume: 0.6,
  },
  {
    id: 'silent-ui',
    label: 'Ambient Only',
    description: 'Solo música de fondo, sin efectos UI',
    backgroundVolume: 0.7,
    uiVolume: 0.0,
  },
];

export const DEFAULT_SOUND_PACK_ID = 'ps5-default';

export function getSoundPack(id?: string | null): SoundPack {
  return SOUND_PACKS.find((p) => p.id === id) ?? SOUND_PACKS[0];
}

export interface UserThemeSettings {
  accentId?: string;
  soundPackId?: string;
  /** @deprecated los temas ya no gestionan fondos (el wallpaper es del usuario). Se ignora si existe en perfiles viejos. */
  backgroundId?: string;
}
