/**
 * Sistema de temas WPS5.
 * - Colores de acento (anillos de foco, botones principales, resaltados)
 * - Packs de sonido intercambiables (volúmenes + overrides de ficheros)
 *
 * El wallpaper lo gestiona el usuario (BackgroundPickerModal / home_background)
 * salvo cuando hay un tema visual con personaje: entonces el fondo del tema
 * sustituye al wallpaper y el PNG del personaje se pinta encima del carrusel.
 *
 * Persistencia: `UserSettings.theme = { accentId, soundPackId, visualThemeId }`
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
  widgets: string;
}

export const ACCENTS: AccentTheme[] = [
  { id: 'ps-white', label: 'PS5', color: 'rgba(180, 210, 255, 0.88)', glow: 'rgba(223, 248, 182, 0.95)', soft: 'rgba(170, 170, 170, 0.14)', widgets: '#0d1015', },
  { id: 'ps-black', label: 'PS5 Black', color: 'rgba(19, 22, 27, 0.88)', glow: 'rgba(223, 248, 182, 0.95)', soft: 'rgba(20, 20, 20, 0.5)', widgets: 'rgba(0, 0, 0, 1)', },
  { id: 'ps-blue', label: 'PlayStation Blue', color: '#0070D1', glow: 'rgba(0,112,209,0.45)', soft: 'rgba(0,112,209,0.14)', widgets: 'rgba(0, 1, 59, 0.94)', },
  { id: 'cyan', label: 'Cyan', color: '#00D4FF', glow: 'rgba(0,212,255,0.45)', soft: 'rgba(0,212,255,0.14)', widgets: '#003a46e7', },
  { id: 'green', label: 'Green', color: '#4CD964', glow: 'rgba(76,217,100,0.45)', soft: 'rgba(76,217,100,0.14)', widgets: '#09240cef', },
  { id: 'gold', label: 'Gold', color: '#d9ff00ff', glow: 'rgba(255, 204, 0, 0.45)', soft: 'rgba(255,204,0,0.14)', widgets: 'rgba(141, 139, 0, 0.76)', },
  { id: 'orange', label: 'Orange', color: '#FF9500', glow: 'rgba(255,149,0,0.45)', soft: 'rgba(255,149,0,0.14)', widgets: 'rgba(175, 114, 0, 0.87)', },
  { id: 'red', label: 'Red', color: '#fd0d00ff', glow: 'rgba(255,59,48,0.45)', soft: 'rgba(255,59,48,0.14)', widgets: 'rgba(53, 4, 4, 0.93)', },
  { id: 'purple', label: 'Purple', color: '#AF52DE', glow: 'rgba(175,82,222,0.45)', soft: 'rgba(175,82,222,0.14)', widgets: '#14051def', },
  { id: 'pink', label: 'Pink', color: '#FF2D92', glow: 'rgba(255,45,146,0.45)', soft: 'rgba(255,45,146,0.14)', widgets: '#36041cef', },
];

export const DEFAULT_ACCENT_ID = 'ps-white';

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

export interface VisualTheme {
  id: string;
  label: string;
  /** Fondo a pantalla completa (detrás del carrusel). */
  background: any;
  /** Personaje recortado, alineado con el fondo (encima del carrusel). */
  foreground: any;
}

export const VISUAL_THEMES: VisualTheme[] = [
  {
    id: 'background astrobot',
    label: "Astro Bot",
    background: require('@/assets/temas/background astrobot.jpg'),
    foreground: require('@/assets/temas/foreground astrobot.png'),
  },
  {
    id: 'background wolverine',
    label: "Marvel's Wolverine",
    background: require('@/assets/temas/background wolverine.jpg'),
    foreground: require('@/assets/temas/foreground wolverine.png'),
  },
  {
    id: 'background fc27',//
    label: "FC 27",
    background: require('@/assets/temas/background fc27.jpg'),
    foreground: require('@/assets/temas/foreground fc27.png'),
  },
  {
    id: 'background spiderman',
    label: "Marvel's Spider-Man alternative",
    background: require('@/assets/temas/background spiderman.jpg'),
    foreground: require('@/assets/temas/foreground spiderman.png'),
  },
  {
    id: 'Grand Theft Auto VI',
    label: 'Grand Theft Auto VI',
    background: require('@/assets/temas/background gta6.jpg'),
    foreground: require('@/assets/temas/foreground gta6.png'),
  },
  {
    id: 'Lucia',
    label: 'Grand Theft Auto VI - Lucia',
    background: require('@/assets/temas/background lucia.jpg'),
    foreground: require('@/assets/temas/foreground lucia.png'),
  },
  {
    id: 'Lucia alternative',
    label: 'Grand Theft Auto VI - Lucia alternative',
    background: require('@/assets/temas/background lucia2.jpg'),
    foreground: require('@/assets/temas/foreground lucia2.png'),
  },
  {
    id: 'background jason',
    label: 'Grand Theft Auto VI - Jason',
    background: require('@/assets/temas/background jason.jpg'),
    foreground: require('@/assets/temas/foreground jason.png'),
  },
  {
    id: 'background jason2',
    label: 'Grand Theft Auto VI - Jason alternative',
    background: require('@/assets/temas/background jason2.jpg'),
    foreground: require('@/assets/temas/foreground jason2.png'),
  },
  {
    id: 'background 007',
    label: '007: First Light',
    background: require('@/assets/temas/background 007 first light.jpg'),
    foreground: require('@/assets/temas/foreground 007 first light.png'),
  },
  {
    id: 'ellie',
    label: 'Ellie',
    background: require('@/assets/temas/background ellie.jpg'),
    foreground: require('@/assets/temas/foreground ellie.png'),
  },
  {
    id: 'background god of war',
    label: 'God of War Ragnarok',
    background: require('@/assets/temas/background god of war.jpeg'),
    foreground: require('@/assets/temas/foreground god of war.png'),
  }, {
    id: 'background laufey',
    label: 'God of War: Laufey',
    background: require('@/assets/temas/background laufey.jpg'),
    foreground: require('@/assets/temas/foreground laufey.png'),
  },
  {
    id: 'background forza horizon 6',
    label: 'Forza Horizon 6',
    background: require('@/assets/temas/background forza horizon 6.jpg'),
    foreground: require('@/assets/temas/foreground forza horizon 6.png'),
  },
  {
    id: 'background forza horizon 6 alternative',
    label: 'Forza Horizon 6 alternative',
    background: require('@/assets/temas/background nissan sports.jpg'),
    foreground: require('@/assets/temas/foreground nissan sports.png'),
  },
  {
    id: 'background marvelspiderman2',
    label: "Marvel's Spider-Man 2",
    background: require('@/assets/temas/background marvelspiderman2.jpg'),
    foreground: require('@/assets/temas/foreground marvelspiderman2.png'),
  },
  {
    id: 'background halo',
    label: "Halo",
    background: require('@/assets/temas/background halo.jpg'),
    foreground: require('@/assets/temas/foreground halo.png'),
  },
  {
    id: 'background grace',
    label: 'Resident Evil Requiem - Grace',
    background: require('@/assets/temas/background grace.jpg'),
    foreground: require('@/assets/temas/foreground grace.png'),
  },
  {
    id: 'background leonre9',
    label: 'Resident Evil Requiem - Leon',
    background: require('@/assets/temas/background leon re9.png'),
    foreground: require('@/assets/temas/foreground leon re9.png'),
  },
  {
    id: 'background residenteviljill',
    label: 'Resident Evil 3 Remake - Jill alternative',
    background: require('@/assets/temas/background residenteviljill.jpg'),
    foreground: require('@/assets/temas/foreground residenteviljill.png'),
  },
  {
    id: 'background control resonant',
    label: 'Control Resonant',
    background: require('@/assets/temas/background control resonant.jpg'),
    foreground: require('@/assets/temas/foreground control resonant.png'),
  },
  {
    id: 'background control resonant alternative',
    label: 'Control Resonant alternative',
    background: require('@/assets/temas/background control resonant2.jpg'),
    foreground: require('@/assets/temas/foreground control resonant2.png'),
  },
  {
    id: 'background pragmata',
    label: 'Pragmata',
    background: require('@/assets/temas/background pragmata.jpg'),
    foreground: require('@/assets/temas/foreground pragmata.png'),
  },
  {
    id: 'background stellar blade',
    label: 'Stellar Blade',
    background: require('@/assets/temas/background stellar blade.jpg'),
    foreground: require('@/assets/temas/foreground stellar blade.png'),
  },
  {
    id: 'background cyberpunk 2077',
    label: 'Cyberpunk 2077',
    background: require('@/assets/temas/background cyberpunk 2077.jpg'),
    foreground: require('@/assets/temas/foreground cyberpunk 2077.png'),
  },
  {
    id: 'background cyberpunk 2077 alternative',
    label: 'Cyberpunk 2077 alternative',
    background: require('@/assets/temas/background cyberpunk 2077 alternative.jpg'),
    foreground: require('@/assets/temas/foreground cyberpunk 2077 alternative.png'),
  },
  {
    id: 'background modern warfare 4',
    label: 'Modern Warfare 4',
    background: require('@/assets/temas/background modern warfare 4.jpg'),
    foreground: require('@/assets/temas/foreground modern warfare 4.png'),
  },
  {
    id: 'background gta v',
    label: 'Grand Theft Auto V',
    background: require('@/assets/temas/background gta v.jpg'),
    foreground: require('@/assets/temas/foreground gta v.png'),
  },
  {
    id: 'camellya',
    label: 'Camellya',
    background: require('@/assets/temas/background camellya.jpg'),
    foreground: require('@/assets/temas/foregroud camellya.png'),
  },
  {
    id: 'background xenoverse 2',
    label: 'Dragon Ball Xenoverse 2',
    background: require('@/assets/temas/background xenoverse 2.png'),
    foreground: require('@/assets/temas/foreground xenoverse 2.png'),
  },
  {
    id: 'background naruto padres',
    label: 'Naruto',
    background: require('@/assets/temas/background naruto padres.jpg'),
    foreground: require('@/assets/temas/foreground naruto padres.png'),
  },
  {
    id: 'background kakashi',
    label: 'Naruto - Kakashi',
    background: require('@/assets/temas/background kakashi.png'),
    foreground: require('@/assets/temas/foreground kakashi.png'),
  },
  {
    id: 'background itachi',
    label: 'Naruto - Itachi',
    background: require('@/assets/temas/background itachi.png'),
    foreground: require('@/assets/temas/foreground itachi.png'),
  },
  {
    id: 'background itachi alternative',
    label: 'Naruto - Itachi alternative',
    background: require('@/assets/temas/background itachi alternative.jpg'),
    foreground: require('@/assets/temas/foreground itachi alternative.png'),
  },
  {
    id: 'background itachi 3',
    label: 'Naruto - Itachi 3',
    background: require('@/assets/temas/background itachi 3.jpg'),
    foreground: require('@/assets/temas/foreground itachi 3.png'),
  },
  {
    id: 'background goku y vegeta',
    label: 'Goku y Vegeta',
    background: require('@/assets/temas/background goku y vegeta.jpg'),
    foreground: require('@/assets/temas/foreground goku y vegeta.png'),
  },
  {
    id: 'background gohan',
    label: 'Gohan',
    background: require('@/assets/temas/background gohan.png'),
    foreground: require('@/assets/temas/foreground gohan.png'),
  },

  {
    id: 'background daima',
    label: 'Dragon Ball Daima',
    background: require('@/assets/temas/background daima.jpg'),
    foreground: require('@/assets/temas/foreground daima.png'),
  },
  {
    id: 'background zzz ellen2',
    label: 'Zenless Zone Zero - Ellen',
    background: require('@/assets/temas/background zzz ellen2.jpg'),
    foreground: require('@/assets/temas/foreground zzz ellen2.png'),
  },
  {
    id: 'background zzz burnice',
    label: 'Zenless Zone Zero - Burnice',
    background: require('@/assets/temas/background zzz burnice.jpg'),
    foreground: require('@/assets/temas/foreground zzz burnice.png'),
  },
  {
    id: 'background zzz jane',
    label: 'Zenless Zone Zero - Jane',
    background: require('@/assets/temas/background zzz jane.jpg'),
    foreground: require('@/assets/temas/foreground zzz jane.png'),
  },
  {
    id: 'background zzz',
    label: 'Zenless Zone Zero',
    background: require('@/assets/temas/background zzz.jpg'),
    foreground: require('@/assets/temas/foreground zzz.png'),
  },

  {
    id: 'background zzz lucy',
    label: 'Zenless Zone Zero - Lucy',
    background: require('@/assets/temas/background zzz lucy.jpg'),
    foreground: require('@/assets/temas/foreground zzz lucy.png'),
  },
  {
    id: 'background zzz yuzuha',
    label: 'Zenless Zone Zero - Yuzuha',
    background: require('@/assets/temas/background zzz yuzuha.jpg'),
    foreground: require('@/assets/temas/foreground zzz yuzuha.png'),
  },

];

export const DEFAULT_VISUAL_THEME_ID = 'none';

export function getVisualTheme(id?: string | null): VisualTheme | null {
  if (!id || id === DEFAULT_VISUAL_THEME_ID) return null;
  return VISUAL_THEMES.find((t) => t.id === id) ?? null;
}

export interface UserThemeSettings {
  accentId?: string;
  soundPackId?: string;
  /** Tema visual con fondo + personaje 3D. `none` = wallpaper del usuario. */
  visualThemeId?: string;
  /** Si true, el fondo y personaje 3D solo se muestran en la pantalla de inicio (tarjeta de bienvenida). */
  visualThemeOnlyHome?: boolean;
  /** Si el personaje (foreground) se dibuja por encima de los widgets de la tarjeta de bienvenida. */
  foregroundOverWidgets?: boolean;
  audioPackId?: string | null;
  musicPackId?: string | null;
  /** @deprecated los temas ya no gestionan fondos sueltos. Se ignora si existe en perfiles viejos. */
  backgroundId?: string;
}
