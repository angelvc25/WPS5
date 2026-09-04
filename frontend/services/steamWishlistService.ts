import { Platform } from 'react-native';

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

export interface WishlistDeal {
    appid: number;
    title: string;
    image: string;
    price: string;
    originalPrice: string;
    discountPercent: number;
    url: string;
}

function buildFetchUrl(url: string) {
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
    const needsProxy = Platform.OS === 'web' && !isElectron;
    return needsProxy ? `${CORS_PROXY}${encodeURIComponent(url)}` : url;
}

/** Juegos de la lista de deseados de Steam que están actualmente en oferta. */
export const fetchWishlistDeals = async (steamId: string): Promise<WishlistDeal[]> => {
    if (!steamId) return [];
    try {
        const deals: WishlistDeal[] = [];
        let page = 0;

        while (page < 10) {
            const url = `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/?p=${page}`;
            const res = await fetch(buildFetchUrl(url));
            if (!res.ok) break;
            const data = await res.json();
            const entries = Object.entries(data || {});
            if (entries.length === 0) break;

            entries.forEach(([appid, info]: [string, any]) => {
                const sub = info?.subs?.[0];
                const discountPercent = sub?.discount_pct ?? 0;
                if (discountPercent > 0) {
                    deals.push({
                        appid: Number(appid),
                        title: info.name,
                        image: info.capsule || `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`,
                        price: sub.price ? `US$${(sub.price / 100).toFixed(2)}` : '',
                        originalPrice: sub.price_org ? `US$${(sub.price_org / 100).toFixed(2)}` : '',
                        discountPercent,
                        url: `https://store.steampowered.com/app/${appid}`,
                    });
                }
            });

            if (entries.length < 100) break;
            page += 1;
        }
        return deals;
    } catch (error) {
        console.error('[SteamWishlist] Error fetching wishlist deals:', error);
        return [];
    }
};