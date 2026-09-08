import { Platform } from 'react-native';

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

export interface SteamOwnedGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url: string;
  has_community_visible_stats?: boolean;
}

export interface SteamAchievement {
  apiname: string;
  achieved: number;
  unlocktime: number;
}

export interface SteamPlayerAchievementsResponse {
  playerstats?: {
    steamID: string;
    gameName: string;
    achievements?: SteamAchievement[];
    success: boolean;
  };
}

export interface SteamGameAchievement {
  apiName: string;
  name: string;
  description: string;
  icon: string;
  lockedIcon: string;
  achieved: boolean;
  unlockTime: number;
  globalPercentage: number | null;
  rarity: 'platinum' | 'gold' | 'silver' | 'bronze';
}

export interface SteamGameAchievementsSummary {
  total: number;
  unlocked: number;
  rarityCounts: Record<SteamGameAchievement['rarity'], number>;
  achievements: SteamGameAchievement[];
}

interface SteamSchemaAchievement {
  name: string;
  displayName?: string;
  description?: string;
  icon?: string;
  icongray?: string;
}

const getFetchUrl = (url: string) => {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const needsProxy = Platform.OS === 'web' && !isElectron;
  return needsProxy ? `${CORS_PROXY}${encodeURIComponent(url)}` : url;
};

const rarityForPercentage = (percentage: number | null): SteamGameAchievement['rarity'] => {
  if (percentage !== null && percentage <= 1) return 'platinum';
  if (percentage !== null && percentage <= 5) return 'gold';
  if (percentage !== null && percentage <= 15) return 'silver';
  return 'bronze';
};

export const fetchSteamOwnedGames = async (apiKey: string, steamId: string): Promise<SteamOwnedGame[]> => {
  try {
    const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json&include_appinfo=1&include_played_free_games=1`;
    // Electron doesn't need CORS proxy; only use it for pure browser web
    const fetchUrl = getFetchUrl(url);
    
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Steam games: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.response && data.response.games) {
      return data.response.games;
    }
    return [];
  } catch (error) {
    console.error('Error fetching Steam games:', error);
    return [];
  }
};

export const fetchSteamTrophiesCount = async (apiKey: string, steamId: string, appId: number): Promise<number> => {
  try {
    const url = `http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${apiKey}&steamid=${steamId}`;
    const fetchUrl = getFetchUrl(url);

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Steam achievements: ${response.statusText}`);
    }

    const data: SteamPlayerAchievementsResponse = await response.json();
    
    if (data.playerstats && data.playerstats.success && data.playerstats.achievements) {
      // Return count of achieved trophies
      return data.playerstats.achievements.filter(a => a.achieved === 1).length;
    }
    return 0;
  } catch (error) {
    console.error(`Error fetching Steam trophies for app ${appId}:`, error);
    return 0;
  }
};

// Cache en memoria para evitar solicitudes duplicadas y ralentización en el carrusel
interface AchievementsCacheEntry {
  summary: SteamGameAchievementsSummary | null;
  timestamp: number;
}

const achievementsCache = new Map<string, AchievementsCacheEntry>();
const inFlightAchievements = new Map<string, Promise<SteamGameAchievementsSummary | null>>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos de caché

/** Devuelve los logros en caché si existen y siguen válidos (sincrónico, 0ms). */
export const getCachedSteamGameAchievements = (
  steamId: string,
  appId: number
): SteamGameAchievementsSummary | null | undefined => {
  const cacheKey = `${steamId}_${appId}`;
  const entry = achievementsCache.get(cacheKey);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    achievementsCache.delete(cacheKey);
    return undefined;
  }
  return entry.summary;
};

/** Obtiene progreso, metadatos e índice global de rareza de los logros Steam (con caché y deduplicación). */
export const fetchSteamGameAchievements = async (
  apiKey: string,
  steamId: string,
  appId: number,
  forceRefresh = false
): Promise<SteamGameAchievementsSummary | null> => {
  const cacheKey = `${steamId}_${appId}`;

  if (!forceRefresh) {
    const cached = getCachedSteamGameAchievements(steamId, appId);
    if (cached !== undefined) {
      return cached;
    }
  }

  // Deduplicación de peticiones concurrentes para el mismo juego
  const inFlight = inFlightAchievements.get(cacheKey);
  if (inFlight) return inFlight;

  const fetchPromise = (async () => {
    try {
      const playerUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${apiKey}&steamid=${steamId}`;
      const schemaUrl = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?appid=${appId}&key=${apiKey}`;
      const percentagesUrl = `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appId}`;

      const [playerResponse, schemaResponse, percentagesResponse] = await Promise.all([
        fetch(getFetchUrl(playerUrl)),
        fetch(getFetchUrl(schemaUrl)),
        // La rareza es un enriquecimiento opcional: no debe ocultar los logros
        // si Steam no expone temporalmente este endpoint.
        fetch(getFetchUrl(percentagesUrl)).catch(() => null),
      ]);

      if (!playerResponse.ok || !schemaResponse.ok) {
        achievementsCache.set(cacheKey, { summary: null, timestamp: Date.now() });
        return null;
      }

      const playerData: SteamPlayerAchievementsResponse = await playerResponse.json();
      const schemaData = await schemaResponse.json();
      const percentagesData = percentagesResponse?.ok ? await percentagesResponse.json() : null;
      const playerAchievements = playerData.playerstats?.achievements;
      const schemaAchievements: SteamSchemaAchievement[] = schemaData?.game?.availableGameStats?.achievements ?? [];
      if (!playerData.playerstats?.success || !playerAchievements || schemaAchievements.length === 0) {
        achievementsCache.set(cacheKey, { summary: null, timestamp: Date.now() });
        return null;
      }

      const playerByApiName = new Map(playerAchievements.map(achievement => [achievement.apiname, achievement]));
      const percentageByApiName = new Map<string, number>(
        (percentagesData?.achievementpercentages?.achievements ?? [])
          .map((achievement: { name: string; percent: number | string }) => [achievement.name, Number(achievement.percent)] as const)
          .filter(([, percentage]: readonly [string, number]) => Number.isFinite(percentage))
      );
      const rarityCounts: SteamGameAchievementsSummary['rarityCounts'] = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
      const achievements = schemaAchievements.map((schemaAchievement) => {
        const playerAchievement = playerByApiName.get(schemaAchievement.name);
        const globalPercentage = percentageByApiName.get(schemaAchievement.name) ?? null;
        const rarity = rarityForPercentage(globalPercentage);
        const achieved = playerAchievement?.achieved === 1;
        if (achieved) rarityCounts[rarity] += 1;
        return {
          apiName: schemaAchievement.name,
          name: schemaAchievement.displayName || schemaAchievement.name,
          description: schemaAchievement.description || '',
          icon: schemaAchievement.icon || '',
          lockedIcon: schemaAchievement.icongray || schemaAchievement.icon || '',
          achieved,
          unlockTime: playerAchievement?.unlocktime ?? 0,
          globalPercentage,
          rarity,
        };
      });

      const summary: SteamGameAchievementsSummary = {
        total: achievements.length,
        unlocked: achievements.filter(achievement => achievement.achieved).length,
        rarityCounts,
        achievements,
      };

      achievementsCache.set(cacheKey, { summary, timestamp: Date.now() });
      return summary;
    } catch (error) {
      console.error(`Error fetching Steam achievements for app ${appId}:`, error);
      return null;
    } finally {
      inFlightAchievements.delete(cacheKey);
    }
  })();

  inFlightAchievements.set(cacheKey, fetchPromise);
  return fetchPromise;
};
