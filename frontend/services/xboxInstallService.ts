export interface XboxInstalledGame {
  id: string;
  title: string;
  installLocation: string;
  contentDir?: string;
  launchPath: string;
  aumid?: string;
  logoPath?: string;
  icon?: string | null;
  packageName?: string;
  source: 'xbox';
}

export async function fetchXboxInstalledGames(): Promise<XboxInstalledGame[]> {
  if (typeof window === 'undefined' || !(window as any).electronAPI?.getXboxInstalledGames) {
    return [];
  }

  try {
    const result = await (window as any).electronAPI.getXboxInstalledGames();
    if (result?.success && Array.isArray(result.games)) {
      return result.games;
    }
  } catch (error) {
    console.error('[Xbox] Error fetching installed games:', error);
  }

  return [];
}
