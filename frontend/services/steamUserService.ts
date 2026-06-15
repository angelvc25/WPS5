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

export const fetchSteamOwnedGames = async (apiKey: string, steamId: string): Promise<SteamOwnedGame[]> => {
  try {
    const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json&include_appinfo=1&include_played_free_games=1`;
    const fetchUrl = Platform.OS === 'web' ? `${CORS_PROXY}${encodeURIComponent(url)}` : url;
    
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
    const fetchUrl = Platform.OS === 'web' ? `${CORS_PROXY}${encodeURIComponent(url)}` : url;

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
