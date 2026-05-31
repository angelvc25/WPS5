export interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  is_external_url: boolean;
  author: string;
  contents: string;
  feedlabel: string;
  date: number;
  feedname: string;
  feed_type: number;
  appid: number;
  image_url?: string;
}

/**
 * Searches Steam's store for a game by name and returns its numeric appid.
 * Uses the public Steam Store search API — no API key required.
 */
export const searchSteamAppId = async (gameName: string): Promise<number | null> => {
  try {
    const encoded = encodeURIComponent(gameName);
    const response = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encoded}&l=spanish&cc=US`
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      return data.items[0].id as number;
    }
    return null;
  } catch (error) {
    console.error('[SteamNews] Error searching Steam App ID:', error);
    return null;
  }
};

/**
 * Fetches the latest news for a specific Steam app ID.
 * Uses the public ISteamNews Web API — no API key required.
 */
export const fetchSteamNewsForApp = async (appid: number): Promise<SteamNewsItem[]> => {
  try {
    const response = await fetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=8&maxlength=5000&format=json`
    );
    if (!response.ok) return [];
    const data = await response.json();
    const items = (data?.appnews?.newsitems as SteamNewsItem[]) || [];

    return items.map(item => {
      let image_url: string | undefined;

      const clanMatch = item.contents?.match(/\{STEAM_CLAN_IMAGE\}\/([^\s"'<>]+)/);
      if (clanMatch) {
        image_url = `https://clan.akamai.steamstatic.com/images/${clanMatch[1]}`;
      } else {
        const imgMatch = item.contents?.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif))/i);
        if (imgMatch) {
          image_url = imgMatch[1];
        }
      }

      if (!image_url) {
        image_url = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
      }

      return {
        ...item,
        image_url
      };
    });
  } catch (error) {
    console.error('[SteamNews] Error fetching Steam news:', error);
    return [];
  }
};

/**
 * High-level helper: search for a game by name on Steam, then fetch its news.
 */
export const fetchSteamNewsByName = async (gameName: string): Promise<SteamNewsItem[]> => {
  const appid = await searchSteamAppId(gameName);
  if (!appid) return [];
  return fetchSteamNewsForApp(appid);
};

/**
 * Formats a Unix timestamp into a human-readable relative string (e.g. "hace 2 días").
 */
export const formatSteamDate = (timestamp: number): string => {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`;
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
};
