export interface EpicInstalledGame {
  id: string;
  appName: string;
  title: string;
  installLocation: string;
  launchExecutable: string;
  launchPath: string;
}

export async function fetchEpicInstalledGames(): Promise<EpicInstalledGame[]> {
  if (typeof window === 'undefined' || !(window as any).electronAPI?.getEpicInstalledGames) {
    return [];
  }

  try {
    const result = await (window as any).electronAPI.getEpicInstalledGames();
    if (result?.success && Array.isArray(result.games)) {
      return result.games;
    }
  } catch (error) {
    console.error('[Epic] Error fetching installed games:', error);
  }

  return [];
}
