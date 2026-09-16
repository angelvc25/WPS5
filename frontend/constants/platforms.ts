export interface PlatformInfo {
  id: string;
  icon: string;
}

export const PLATFORMS: PlatformInfo[] = [
  { id: 'PC', icon: 'microsoft-windows' },
  { id: 'PS1', icon: 'sony-playstation' },
  { id: 'PS2', icon: 'sony-playstation' },
  { id: 'PS3', icon: 'sony-playstation' },
  { id: 'PS4', icon: 'sony-playstation' },
  { id: 'PS5', icon: 'sony-playstation' },
  { id: 'Xbox', icon: 'microsoft-xbox' },
  { id: 'Switch', icon: 'nintendo-switch' },
  { id: 'Steam', icon: 'steam' },
  { id: 'EA', icon: 'alpha-e-box' },
  { id: 'Epic', icon: 'alpha-e-circle' },
  { id: 'Retro', icon: 'gamepad-variant' },
];

export const PLATFORM_IDS: string[] = PLATFORMS.map((p) => p.id);

export interface RetroSystemInfo {
  id: string;
  label: string;
  group: string;
}

// Sistemas retro soportados por el launcher y RetroAchievements (coincide con RA_PLATFORM_MAP)
export const RETRO_SYSTEMS: RetroSystemInfo[] = [
  // Sony
  { id: 'PSP',           label: 'PSP',           group: 'Sony' },
  // Nintendo
  { id: 'NES',           label: 'NES',           group: 'Nintendo' },
  { id: 'SNES',          label: 'SNES',          group: 'Nintendo' },
  { id: 'N64',           label: 'N64',           group: 'Nintendo' },
  { id: 'GB',            label: 'Game Boy',      group: 'Nintendo' },
  { id: 'GBC',           label: 'GBC',           group: 'Nintendo' },
  { id: 'GBA',           label: 'GBA',           group: 'Nintendo' },
  { id: 'NDS',           label: 'DS',            group: 'Nintendo' },
  { id: 'N3DS',          label: '3DS',           group: 'Nintendo' },
  { id: 'GC',            label: 'GameCube',      group: 'Nintendo' },
  { id: 'WII',           label: 'Wii',           group: 'Nintendo' },
  { id: 'WIIU',          label: 'Wii U',         group: 'Nintendo' },
  // Sega
  { id: 'MASTER SYSTEM', label: 'Master System', group: 'Sega' },
  { id: 'GAME GEAR',     label: 'Game Gear',     group: 'Sega' },
  { id: 'GENESIS',       label: 'Genesis/MD',    group: 'Sega' },
  { id: 'SEGA CD',       label: 'Sega CD',       group: 'Sega' },
  { id: '32X',           label: '32X',           group: 'Sega' },
  { id: 'SATURN',        label: 'Saturn',        group: 'Sega' },
  { id: 'DREAMCAST',     label: 'Dreamcast',     group: 'Sega' },
  // Atari
  { id: 'ATARI 2600',    label: 'Atari 2600',    group: 'Atari' },
  // SNK
  { id: 'NEO GEO',       label: 'Neo Geo',       group: 'SNK' },
];

export const RETRO_SYSTEM_IDS: string[] = RETRO_SYSTEMS.map((s) => s.id);

export const PLATFORM_ICONS: Record<string, string> = {
  ...Object.fromEntries(PLATFORMS.map((p) => [p.id, p.icon])),
  PSP: 'sony-playstation',
};

export function isRetroPlatform(platformOrSystem?: string): boolean {
  if (!platformOrSystem) return false;
  const upper = platformOrSystem.trim().toUpperCase();
  if (upper === 'RETRO') return true;
  return (
    RETRO_SYSTEM_IDS.some((id) => id.toUpperCase() === upper) ||
    RETRO_SYSTEMS.some((s) => s.label.toUpperCase() === upper)
  );
}