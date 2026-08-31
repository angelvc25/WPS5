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
];

export const PLATFORM_IDS: string[] = PLATFORMS.map((p) => p.id);

export const PLATFORM_ICONS: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.icon])
);