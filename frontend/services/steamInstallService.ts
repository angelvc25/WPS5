export async function fetchSteamInstalledAppIds(): Promise<Set<string>> {
  if (typeof window === 'undefined' || !(window as any).electronAPI?.getSteamInstalledApps) {
    return new Set();
  }

  try {
    const result = await (window as any).electronAPI.getSteamInstalledApps();
    if (result?.success && Array.isArray(result.appIds)) {
      return new Set(result.appIds.map(String));
    }
  } catch (error) {
    console.error('Error fetching installed Steam apps:', error);
  }

  return new Set();
}

export interface SteamInstalledGameDetailed {
  appId: string;
  name: string;
}

/**
 * Devuelve los juegos de Steam instalados localmente CON su nombre,
 * leído directamente de appmanifest_*.acf. A diferencia de
 * fetchSteamInstalledAppIds(), esto permite reconstruir una tarjeta
 * completa para juegos que GetOwnedGames no devuelve (ej. apps marcadas
 * con "Características del perfil limitadas" en Steam).
 */
export async function fetchSteamInstalledGamesDetailed(): Promise<SteamInstalledGameDetailed[]> {
  if (typeof window === 'undefined' || !(window as any).electronAPI?.getSteamInstalledAppsDetailed) {
    return [];
  }

  try {
    const result = await (window as any).electronAPI.getSteamInstalledAppsDetailed();
    if (result?.success && Array.isArray(result.apps)) {
      return result.apps;
    }
  } catch (error) {
    console.error('Error fetching detailed Steam installed apps:', error);
  }

  return [];
}