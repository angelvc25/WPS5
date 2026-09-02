import { Platform } from 'react-native';

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

export interface SteamFriend {
  steamid: string;
  personaname: string;
  avatar: string;
  /** 0 = offline, 1 = online, 2 = busy, 3 = away, 4 = snooze, 5 = looking to trade, 6 = looking to play */
  personastate: number;
  gameid?: string;
  gameextrainfo?: string;
}

function buildFetchUrl(url: string) {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const needsProxy = Platform.OS === 'web' && !isElectron;
  return needsProxy ? `${CORS_PROXY}${encodeURIComponent(url)}` : url;
}

/**
 * Obtiene la lista de amigos de Steam del usuario junto con su estado
 * (online/offline/jugando) usando GetFriendList + GetPlayerSummaries.
 * Ordena: jugando > en línea > desconectado.
 */
export const fetchSteamFriends = async (apiKey: string, steamId: string): Promise<SteamFriend[]> => {
  try {
    const listUrl = `http://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${apiKey}&steamid=${steamId}&relationship=friend`;
    const listRes = await fetch(buildFetchUrl(listUrl));
    if (!listRes.ok) return [];
    const listData = await listRes.json();
    const ids: string[] = (listData?.friendslist?.friends || []).map((f: any) => f.steamid);
    if (ids.length === 0) return [];

    // La API permite hasta 100 steamids por llamada
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));

    const results: SteamFriend[] = [];
    for (const chunk of chunks) {
      const summariesUrl = `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${chunk.join(',')}`;
      const res = await fetch(buildFetchUrl(summariesUrl));
      if (!res.ok) continue;
      const data = await res.json();
      const players = data?.response?.players || [];
      players.forEach((p: any) => {
        results.push({
          steamid: p.steamid,
          personaname: p.personaname,
          avatar: p.avatarmedium || p.avatar,
          personastate: p.personastate,
          gameid: p.gameid,
          gameextrainfo: p.gameextrainfo,
        });
      });
    }

    return results.sort((a, b) => {
      const rank = (f: SteamFriend) => (f.gameextrainfo ? 0 : f.personastate > 0 ? 1 : 2);
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return a.personaname.localeCompare(b.personaname);
    });
  } catch (error) {
    console.error('[SteamFriends] Error fetching friends:', error);
    return [];
  }
};
