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

export function buildSteamInstallUrl(appId: string | number): string {
  return `steam://install/${appId}`;
}

export function isSteamGameInstalled(
  item: { id: string },
  installedAppIds: Set<string> | readonly string[] | null | undefined
): boolean {
  const appId = getSteamAppId(item);
  if (!appId || !installedAppIds) return true;
  if (installedAppIds instanceof Set) return installedAppIds.has(appId);
  return installedAppIds.includes(appId);
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

export function resolveSteamLaunchPath(
  item: { id: string; platform?: string; path?: string },
  installedAppIds: Set<string> | readonly string[] | null | undefined
): string | undefined {
  const appId = getSteamAppId(item);
  if (appId && isSteamGame(item) && installedAppIds && !isSteamGameInstalled(item, installedAppIds)) {
    return buildSteamInstallUrl(appId);
  }
  return resolveLaunchPath(item);
}

export type GameActionKind = 'play' | 'playMedia' | 'assignPath' | 'download';

export function getGameActionKind(
  item: { id?: string; title?: string; type?: string; isLastPlayed?: boolean; platform?: string; path?: string } | null | undefined,
  installedSteamAppIds?: Set<string> | null
): GameActionKind {
  if (!item) return 'play';

  const isSpotify = item.title?.toLowerCase()?.includes('spotify');
  const isMedia = isSpotify || item.type === 'media';

  if (item.isLastPlayed) {
    return isMedia ? 'playMedia' : 'play';
  }

  if (!resolveLaunchPath(item as { id: string; platform?: string; path?: string })) {
    return 'assignPath';
  }

  if (isSteamGame(item) && installedSteamAppIds && !isSteamGameInstalled(item as { id: string }, installedSteamAppIds)) {
    return 'download';
  }

  return isMedia ? 'playMedia' : 'play';
}

export function getGameActionLabel(
  item: { id?: string; title?: string; type?: string; isLastPlayed?: boolean; platform?: string; path?: string } | null | undefined,
  installedSteamAppIds?: Set<string> | null,
  labels?: Record<GameActionKind, string>
): string {
  const kind = getGameActionKind(item, installedSteamAppIds);
  if (labels) return labels[kind];

  if (kind === 'playMedia') return 'Reproducir';
  if (kind === 'assignPath') return 'Asignar ruta';
  if (kind === 'download') return 'Descargar';
  return 'Jugar';
}
