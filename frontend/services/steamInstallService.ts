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
