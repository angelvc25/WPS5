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

export async function resolveSteamId64(steamId: string): Promise<string> {
    const cleanId = steamId.trim();
    if (!cleanId) return '';
    if (/^\d+$/.test(cleanId)) return cleanId;

    try {
        const url = `https://steamcommunity.com/id/${cleanId}/?xml=1`;
        const res = await fetch(buildFetchUrl(url));
        if (res.ok) {
            const xml = await res.text();
            const match = xml.match(/<steamID64>(\d+)<\/steamID64>/);
            if (match && match[1]) {
                return match[1];
            }
        }
    } catch (e) {
        console.warn('[SteamWishlist] No se pudo resolver la URL personalizada de Steam:', e);
    }
    return cleanId;
}

/** Juegos de la lista de deseados de Steam que están actualmente en oferta. */
export const fetchWishlistDeals = async (steamId: string): Promise<WishlistDeal[]> => {
    if (!steamId) return [];
    try {
        const steamId64 = await resolveSteamId64(steamId);
        if (!steamId64) return [];

        // 1. Consultar la API oficial de lista de deseos de Steam (pública, no requiere cookies de sesión)
        const wishlistUrl = buildFetchUrl(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${steamId64}`);
        const res = await fetch(wishlistUrl);
        
        let appids: number[] = [];

        if (res.ok) {
            const data = await res.json();
            const items = data?.response?.items || [];
            appids = items.map((i: any) => i.appid).filter(Boolean);
        }

        // Fallback: Si IWishlistService no devolvió items, probar con la URL heredada
        if (appids.length === 0) {
            const legacyUrl = buildFetchUrl(`https://store.steampowered.com/wishlist/profiles/${steamId64}/wishlistdata/?p=0`);
            const legacyRes = await fetch(legacyUrl);
            if (legacyRes.ok) {
                const text = await legacyRes.text();
                if (text && !text.trim().startsWith('<')) {
                    try {
                        const legacyData = JSON.parse(text);
                        appids = Object.keys(legacyData).map(Number).filter(Boolean);
                    } catch (e) {
                        console.warn('[SteamWishlist] Error parseando respuesta heredada:', e);
                    }
                }
            }
        }

        if (appids.length === 0) {
            console.log('[SteamWishlist] No se encontraron elementos en la lista de deseos o la cuenta es privada.');
            return [];
        }

        // 2. Consultar los detalles de precio y oferta de cada juego en la tienda
        const deals: WishlistDeal[] = [];
        await Promise.all(
            appids.map(async (appid) => {
                try {
                    const detailsUrl = buildFetchUrl(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=price_overview,basic`);
                    const dRes = await fetch(detailsUrl);
                    if (!dRes.ok) return;

                    const dData = await dRes.json();
                    const appObj = dData?.[appid]?.data;
                    if (appObj) {
                        const priceOverview = appObj.price_overview;
                        const discountPercent = priceOverview?.discount_percent ?? 0;
                        if (discountPercent > 0) {
                            deals.push({
                                appid,
                                title: appObj.name || `App ${appid}`,
                                image: appObj.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`,
                                price: priceOverview.final_formatted || '',
                                originalPrice: priceOverview.initial_formatted || '',
                                discountPercent,
                                url: `https://store.steampowered.com/app/${appid}`,
                            });
                        }
                    }
                } catch (e) {
                    console.warn(`[SteamWishlist] Error consultando appdetails para appid ${appid}:`, e);
                }
            })
        );

        console.log(`[SteamWishlist] Éxito: Se encontraron ${deals.length} juegos en oferta en la lista de deseos.`);
        return deals;
    } catch (error) {
        console.error('[SteamWishlist] Error fetching wishlist deals:', error);
        return [];
    }
};