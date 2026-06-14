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

interface PartnerEventBody {
  gid?: string;
  clanid?: string;
  posterid?: string;       // ✅ hash real de la thumbnail
  headline?: string;
  body?: string;
  posttime?: number;
  updatetime?: number;
  tags?: string;
  hidden?: number;
  forum_topic_id?: string;
  event_gid?: string;
  voteupcount?: number;
  votedowncount?: number;
  ban_check_result?: number;
  banned?: number;
  poster_images?: { url: string }[];
}

interface PartnerEvent {
  gid: string;
  title?: string;
  event_type: number;
  appid: number;
  clan_steamid?: string;
  jsondata?: string;
  announcement_body?: PartnerEventBody;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye la URL de thumbnail del evento en este orden de prioridad:
 * 1. clanid + posterid (cuando el juego sube poster dedicado)
 * 2. poster_images array
 * 3. Primera imagen BBCode/HTML dentro del body del anuncio
 */
const buildThumbnailUrl = (body: PartnerEventBody | undefined): string | undefined => {
  if (!body) return undefined;

  // 1. clanid + posterid (no es "0")
  if (body.clanid && body.posterid &&
    body.posterid !== '0' && body.clanid !== '0') {
    return `https://clan.akamai.steamstatic.com/images//steamcommunity/public/images/clans/${body.clanid}/${body.posterid}.jpg`;
  }

  // 2. poster_images array
  if (body.poster_images && body.poster_images.length > 0 && body.poster_images[0]?.url) {
    return body.poster_images[0].url;
  }

  // 3. Primera imagen dentro del body BBCode/HTML del anuncio
  if (body.body) {
    // [img]{STEAM_CLAN_IMAGE}/clanid/hash.ext[/img]  ← formato de Muse Dash y muchos juegos
    const bbClanMatch = body.body.match(/\[img\]\{STEAM_CLAN_IMAGE\}\/([^\[\]]+)\[\/img\]/i);
    if (bbClanMatch) {
      return `https://clan.akamai.steamstatic.com/images/${bbClanMatch[1].trim()}`;
    }

    // {STEAM_CLAN_IMAGE}/... sin [img]
    const clanImgMatch = body.body.match(/\{STEAM_CLAN_IMAGE\}\/([^\s"'\[\]]+)/);
    if (clanImgMatch) {
      return `https://clan.akamai.steamstatic.com/images/${clanImgMatch[1]}`;
    }

    // [img]https://...[/img]
    const bbMatch = body.body.match(/\[img[^\]]*\](https?:\/\/[^\[]+)\[\/img\]/i);
    if (bbMatch) return bbMatch[1].trim();

    // URL directa de imagen
    const urlMatch = body.body.match(/(https?:\/\/[^\s"'\[\]]+\.(?:jpg|jpeg|png|gif|webp))/i);
    if (urlMatch) return urlMatch[1];
  }

  return undefined;
};

/**
 * Searches Steam's store for a game by name and returns its numeric appid.
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
 * Fetches news via the Steam Partner Events endpoint.
 * Thumbnail: announcement_body.clanid + announcement_body.posterid
 */
const fetchSteamEventsForApp = async (appid: number): Promise<SteamNewsItem[]> => {
  try {
    const url =
      `https://store.steampowered.com/events/ajaxgetadjacentpartnerevents/` +
      `?appid=${appid}&count_before=0&count_after=10&lang_list=0`;

    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();

    const events: PartnerEvent[] = data?.events ?? [];
    if (events.length === 0) return [];

    return events
      .map(ev => {
        const body = ev.announcement_body;

        const title =
          (ev.title && ev.title.trim() !== '')
            ? ev.title
            : (body?.headline?.trim() ?? '');

        if (!title) return null;

        return {
          gid: ev.gid,
          title,
          url: `https://store.steampowered.com/news/app/${appid}/view/${ev.gid}`,
          is_external_url: false,
          author: '',
          contents: body?.body ?? '',
          feedlabel: 'steam_community_announcements',
          date: body?.posttime ?? 0,
          feedname: 'steam_community_announcements',
          feed_type: 1,
          appid,
          image_url: buildThumbnailUrl(body),
        } as SteamNewsItem;
      })
      .filter((item): item is SteamNewsItem => item !== null);
  } catch (error) {
    console.error('[SteamNews] Error fetching partner events:', error);
    return [];
  }
};

/**
 * Extrae la primera imagen del contenido BBCode/HTML (fallback ISteamNews).
 */
const extractImageFromContents = (contents: string): string | undefined => {
  const bbCodeMatch = contents?.match(/\[img\](.*?)\[\/img\]/i);
  if (bbCodeMatch) {
    return bbCodeMatch[1].replace(
      /\{STEAM_CLAN_IMAGE\}/g,
      'https://clan.akamai.steamstatic.com/images'
    );
  }

  const htmlImgMatch = contents?.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
  if (htmlImgMatch) return htmlImgMatch[1];

  const clanMatch = contents?.match(/\{STEAM_CLAN_IMAGE\}\/([^\s"'<>\]\[]+)/);
  if (clanMatch) return `https://clan.akamai.steamstatic.com/images/${clanMatch[1]}`;

  const imgMatch = contents?.match(/(https?:\/\/[^\s"'<>\]\[]+\.(?:jpg|jpeg|png|gif))/i);
  if (imgMatch) return imgMatch[1];

  return undefined;
};

/**
 * Fetches the latest news for a specific Steam app ID.
 * Estrategia 1: Partner Events (thumbnails reales por clanid+posterid).
 * Estrategia 2: ISteamNews RSS clásico con parseo de imágenes.
 */
export const fetchSteamNewsForApp = async (appid: number): Promise<SteamNewsItem[]> => {
  const events = await fetchSteamEventsForApp(appid);
  if (events.length > 0) return events;

  try {
    console.warn('[SteamNews] Partner events vacíos, usando fallback ISteamNews...');
    const response = await fetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=10&maxlength=5000&format=json`
    );
    if (!response.ok) return [];
    const data = await response.json();
    const items = (data?.appnews?.newsitems as SteamNewsItem[]) || [];

    return items.map(item => ({
      ...item,
      image_url: extractImageFromContents(item.contents ?? ''),
    }));
  } catch (error) {
    console.error('[SteamNews] Error fetching Steam news (fallback):', error);
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
 * Formats a Unix timestamp into a human-readable relative string.
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
