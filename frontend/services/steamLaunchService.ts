export function getSteamAppIdFromGameId(id: string): string | null {
  const match = id.toString().match(/^steam_(\d+)$/);
  return match ? match[1] : null;
}

export function getSteamAppIdFromPath(path: string): string | null {
  const match = path.match(/^steam:\/\/rungameid\/(\d+)$/i);
  return match ? match[1] : null;
}

export function buildSteamRunUrl(appId: string | number): string {
  return `steam://rungameid/${appId}`;
}

export function isSteamGame(item: { id?: string; platform?: string } | null | undefined): boolean {
  if (!item?.id) return false;
  if (item.platform === 'Steam') return true;
  return item.id.toString().startsWith('steam_');
}

export function getSteamAppId(item: { id: string; path?: string }): string | null {
  return getSteamAppIdFromGameId(item.id) ?? (item.path ? getSteamAppIdFromPath(item.path) : null);
}

export function getSteamLaunchPath(item: { id: string; platform?: string; path?: string }): string | null {
  if (!isSteamGame(item)) return null;
  const appId = getSteamAppId(item);
  return appId ? buildSteamRunUrl(appId) : null;
}

export function resolveLaunchPath(item: { id: string; platform?: string; path?: string }): string | undefined {
  const steamPath = getSteamLaunchPath(item);
  if (steamPath && getSteamAppIdFromGameId(item.id)) {
    return steamPath;
  }
  if (item.path) return item.path;
  return steamPath ?? undefined;
}
