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
    background: require('@/assets/temas/background astrobot.webp'),
    foreground: require('@/assets/temas/foreground astrobot.webp'),
  },
  {
    id: 'background wolverine',
    label: "Marvel's Wolverine",
    background: require('@/assets/temas/background wolverine.webp'),
    foreground: require('@/assets/temas/foreground wolverine.webp'),
  },
  {
    id: 'background fc27',//
    label: "FC 27",
    background: require('@/assets/temas/background fc27.webp'),
    foreground: require('@/assets/temas/foreground fc27.webp'),
  },
  {
    id: 'background spiderman',
    label: "Marvel's Spider-Man alternative",
    background: require('@/assets/temas/background spiderman.webp'),
    foreground: require('@/assets/temas/foreground spiderman.webp'),
  },
  {
    id: 'Grand Theft Auto VI',
    label: 'Grand Theft Auto VI',
    background: require('@/assets/temas/background gta6.webp'),
    foreground: require('@/assets/temas/foreground gta6.webp'),
  },
  {
    id: 'background gta 6 alt',
    label: 'Grand Theft Auto VI - alternative',
    background: require('@/assets/temas/back grand theft auto 6.webp'),
    foreground: require('@/assets/temas/fore grand theft auto 6.webp'),
  },
  {
    id: 'Lucia',
    label: 'Grand Theft Auto VI - Lucia',
    background: require('@/assets/temas/background lucia.webp'),
    foreground: require('@/assets/temas/foreground lucia.webp'),
  },
  {
    id: 'Lucia alternative',
    label: 'Grand Theft Auto VI - Lucia alternative',
    background: require('@/assets/temas/background lucia2.webp'),
    foreground: require('@/assets/temas/foreground lucia2.webp'),
  },
  {
    id: 'background jason',
    label: 'Grand Theft Auto VI - Jason',
    background: require('@/assets/temas/background jason.webp'),
    foreground: require('@/assets/temas/foreground jason.webp'),
  },
  {
    id: 'background jason2',
    label: 'Grand Theft Auto VI - Jason alternative',
    background: require('@/assets/temas/background jason2.webp'),
    foreground: require('@/assets/temas/foreground jason2.webp'),
  },
  {
    id: 'background 007',
    label: '007: First Light',
    background: require('@/assets/temas/background 007 first light.webp'),
    foreground: require('@/assets/temas/foreground 007 first light.webp'),
  },
  {
    id: 'ellie',
    label: 'Ellie',
    background: require('@/assets/temas/background ellie.webp'),
    foreground: require('@/assets/temas/foreground ellie.webp'),
  },
  {
    id: 'background god of war',
    label: 'God of War Ragnarok',
    background: require('@/assets/temas/background god of war.webp'),
    foreground: require('@/assets/temas/foreground god of war.webp'),
  }, {
    id: 'background laufey',
    label: 'God of War: Laufey',
    background: require('@/assets/temas/background laufey.webp'),
    foreground: require('@/assets/temas/foreground laufey.webp'),
  },
  {
    id: 'background forza horizon 6',
    label: 'Forza Horizon 6',
    background: require('@/assets/temas/background forza horizon 6.webp'),
    foreground: require('@/assets/temas/foreground forza horizon 6.webp'),
  },
  {
    id: 'background forza horizon 6 alternative',
    label: 'Forza Horizon 6 alternative',
    background: require('@/assets/temas/background nissan sports.webp'),
    foreground: require('@/assets/temas/foreground nissan sports.webp'),
  },
  {
    id: 'background marvelspiderman2',
    label: "Marvel's Spider-Man 2",
    background: require('@/assets/temas/background marvelspiderman2.webp'),
    foreground: require('@/assets/temas/foreground marvelspiderman2.webp'),
  },
  {
    id: 'background halo',
    label: "Halo",
    background: require('@/assets/temas/background halo.webp'),
    foreground: require('@/assets/temas/foreground halo.webp'),
  },
  {
    id: 'background grace',
    label: 'Resident Evil Requiem - Grace',
    background: require('@/assets/temas/background grace.webp'),
    foreground: require('@/assets/temas/foreground grace.webp'),
  },
  {
    id: 'background leonre9',
    label: 'Resident Evil Requiem - Leon',
    background: require('@/assets/temas/background leon re9.webp'),
    foreground: require('@/assets/temas/foreground leon re9.webp'),
  },
  {
    id: 'background residenteviljill',
    label: 'Resident Evil 3 Remake - Jill alternative',
    background: require('@/assets/temas/background residenteviljill.webp'),
    foreground: require('@/assets/temas/foreground residenteviljill.webp'),
  },
  {
    id: 'background control resonant',
    label: 'Control Resonant',
    background: require('@/assets/temas/background control resonant.webp'),
    foreground: require('@/assets/temas/foreground control resonant.webp'),
  },
  {
    id: 'background control resonant alternative',
    label: 'Control Resonant alternative',
    background: require('@/assets/temas/background control resonant2.webp'),
    foreground: require('@/assets/temas/foreground control resonant2.webp'),
  },
  {
    id: 'background pragmata',
    label: 'Pragmata',
    background: require('@/assets/temas/background pragmata.webp'),
    foreground: require('@/assets/temas/foreground pragmata.webp'),
  },
  {
    id: 'background stellar blade',
    label: 'Stellar Blade',
    background: require('@/assets/temas/background stellar blade.webp'),
    foreground: require('@/assets/temas/foreground stellar blade.webp'),
  },
  {
    id: 'background stellar blade 3',
    label: 'Stellar Blade playa',
    background: require('@/assets/temas/stellar blade 3 background.webp'),
    foreground: require('@/assets/temas/stellar blade 3 foreground.webp'),
  },
  {
    id: 'background stellar blade 4',
    label: 'Stellar Blade Ive',
    background: require('@/assets/temas/stellar blade 4 background.webp'),
    foreground: require('@/assets/temas/stellar blade 4 foreground.webp'),
  },
  {
    id: 'background stellar blade lentes',
    label: 'Stellar Blade lentes',
    background: require('@/assets/temas/stellar blade lentes 2 background.webp'),
    foreground: require('@/assets/temas/stellar blade lentes 2 foreground.webp'),
  },
  {
    id: 'background stellar blade traje',
    label: 'Stellar Blade traje',
    background: require('@/assets/temas/stellar blade traje background.webp'),
    foreground: require('@/assets/temas/stellar blade traje foreground.webp'),
  },
  {
    id: 'background stellar blade vestido',
    label: 'Stellar Blade vestido',
    background: require('@/assets/temas/stellar blade vestido background.webp'),
    foreground: require('@/assets/temas/stellar blade vestido foreground.webp'),
  },
  {
    id: 'background cyberpunk 2077',
    label: 'Cyberpunk 2077',
    background: require('@/assets/temas/background cyberpunk 2077.webp'),
    foreground: require('@/assets/temas/foreground cyberpunk 2077.webp'),
  },
  {
    id: 'background cyberpunk 2077 alternative',
    label: 'Cyberpunk 2077 alternative',
    background: require('@/assets/temas/background cyberpunk 2077 alternative.webp'),
    foreground: require('@/assets/temas/foreground cyberpunk 2077 alternative.webp'),
  },
  {
    id: 'background modern warfare 4',
    label: 'Modern Warfare 4',
    background: require('@/assets/temas/background modern warfare 4.webp'),
    foreground: require('@/assets/temas/foreground modern warfare 4.webp'),
  },
  {
    id: 'background cod emma kagan',
    label: 'Call of Duty - Emma Kagan',
    background: require('@/assets/temas/background emma kagan cod.webp'),
    foreground: require('@/assets/temas/foreground emma kagan cod.webp'),
  },
  {
    id: 'background gta v',
    label: 'Grand Theft Auto V',
    background: require('@/assets/temas/background gta v.webp'),
    foreground: require('@/assets/temas/foreground gta v.webp'),
  },
  {
    id: 'camellya',
    label: 'Camellya',
    background: require('@/assets/temas/background camellya.webp'),
    foreground: require('@/assets/temas/foregroud camellya.webp'),
  },
  {
    id: 'background xenoverse 2',
    label: 'Dragon Ball Xenoverse 2',
    background: require('@/assets/temas/background xenoverse 2.webp'),
    foreground: require('@/assets/temas/foreground xenoverse 2.webp'),
  },
  {
    id: 'background naruto padres',
    label: 'Naruto',
    background: require('@/assets/temas/background naruto padres.webp'),
    foreground: require('@/assets/temas/foreground naruto padres.webp'),
  },
  {
    id: 'background kakashi',
    label: 'Naruto - Kakashi',
    background: require('@/assets/temas/background kakashi.webp'),
    foreground: require('@/assets/temas/foreground kakashi.webp'),
  },
  {
    id: 'background itachi',
    label: 'Naruto - Itachi',
    background: require('@/assets/temas/background itachi.webp'),
    foreground: require('@/assets/temas/foreground itachi.webp'),
  },
  {
    id: 'background itachi alternative',
    label: 'Naruto - Itachi alternative',
    background: require('@/assets/temas/background itachi alternative.webp'),
    foreground: require('@/assets/temas/foreground itachi alternative.webp'),
  },
  {
    id: 'background itachi 3',
    label: 'Naruto - Itachi 3',
    background: require('@/assets/temas/background itachi 3.webp'),
    foreground: require('@/assets/temas/foreground itachi 3.webp'),
  },
  {
    id: 'background goku y vegeta',
    label: 'Goku y Vegeta',
    background: require('@/assets/temas/background goku y vegeta.webp'),
    foreground: require('@/assets/temas/foreground goku y vegeta.webp'),
  },
  {
    id: 'background gohan',
    label: 'Gohan',
    background: require('@/assets/temas/background gohan.webp'),
    foreground: require('@/assets/temas/foreground gohan.webp'),
  },
  {
    id: 'background daima',
    label: 'Dragon Ball Daima',
    background: require('@/assets/temas/background daima.webp'),
    foreground: require('@/assets/temas/foreground daima.webp'),
  },
  {
    id: 'background zzz ellen2',
    label: 'Zenless Zone Zero - Ellen',
    background: require('@/assets/temas/background zzz ellen2.webp'),
    foreground: require('@/assets/temas/foreground zzz ellen2.webp'),
  },
  {
    id: 'background zzz burnice',
    label: 'Zenless Zone Zero - Burnice',
    background: require('@/assets/temas/background zzz burnice.webp'),
    foreground: require('@/assets/temas/foreground zzz burnice.webp'),
  },
  {
    id: 'background zzz jane',
    label: 'Zenless Zone Zero - Jane',
    background: require('@/assets/temas/background zzz jane.webp'),
    foreground: require('@/assets/temas/foreground zzz jane.webp'),
  },
  {
    id: 'background zzz',
    label: 'Zenless Zone Zero',
    background: require('@/assets/temas/background zzz.webp'),
    foreground: require('@/assets/temas/foreground zzz.webp'),
  },
  {
    id: 'background zzz lucy',
    label: 'Zenless Zone Zero - Lucy',
    background: require('@/assets/temas/background zzz lucy.webp'),
    foreground: require('@/assets/temas/foreground zzz lucy.webp'),
  },
  {
    id: 'background zzz yuzuha',
    label: 'Zenless Zone Zero - Yuzuha',
    background: require('@/assets/temas/background zzz yuzuha.webp'),
    foreground: require('@/assets/temas/foreground zzz yuzuha.webp'),
  },
  {
    id: 'background warhammer 40k',
    label: 'Warhammer 40k',
    background: require('@/assets/temas/background warhammer 40k.webp'),
    foreground: require('@/assets/temas/foreground warhammer 40k.webp'),
  },
  {
    id: 'background warhammer 40k alternative',
    label: 'Warhammer 40k alternative',
    background: require('@/assets/temas/background warhammer 40k alternative.webp'),
    foreground: require('@/assets/temas/foreground warhammer 40k alternative.webp'),
  },
  {
    id: 'background fallout 4',
    label: 'Fallout 4',
    background: require('@/assets/temas/background fallout 4.webp'),
    foreground: require('@/assets/temas/foreground fallout 4.webp'),
  },
  {
    id: 'background fornite',
    label: 'Fornite',
    background: require('@/assets/temas/fornite back.webp'),
    foreground: require('@/assets/temas/fornite fore.webp'),
  },
  {
    id: 'background phantom blade zero',
    label: 'Phantom Blade Zero',
    background: require('@/assets/temas/phantom blade zero background.webp'),
    foreground: require('@/assets/temas/phantom blade zero foreground.webp'),
  },
  {
    id: 'background lollipop chainsaw',
    label: 'Lollipop Chainsaw',
    background: require('@/assets/temas/lollipop chainsaw background.webp'),
    foreground: require('@/assets/temas/lollipop chainsaw foreground.webp'),
  },
  {
    id: 'background lollipop chainsaw alt',
    label: 'lollipop chainsaw alternative',
    background: require('@/assets/temas/lollipop chainsaw alternative 2 background.webp'),
    foreground: require('@/assets/temas/lollipop chainsaw alternative 2 foreground.webp'),
  },
  {
    id: 'background lollipop chainsaw alt 2',
    label: 'Lollipop Chainsaw Alternative 2',
    background: require('@/assets/temas/lollipop chainsaw alternative 3 background.webp'),
    foreground: require('@/assets/temas/lollipop chainsaw alternative 3 foreground.webp'),
  },
  {
    id: 'background Geralt',
    label: 'The Witcher - Geralt',
    background: require('@/assets/temas/Geralt back.webp'),
    foreground: require('@/assets/temas/Geralt fore.webp'),
  },
  {
    id: 'background the division',
    label: 'The Division',
    background: require('@/assets/temas/background the division.webp'),
    foreground: require('@/assets/temas/foreground the division.webp'),
  },
  {
    id: 'background the legend of zelda',
    label: 'The Legend of Zelda',
    background: require('@/assets/temas/background the legend of zelda.webp'),
    foreground: require('@/assets/temas/foreground the legend of zelda.webp'),
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
