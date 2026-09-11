import { Platform } from 'react-native';
import { StoreOffer } from './storeService';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de la respuesta de Steam (featuredgcategories)
// ─────────────────────────────────────────────────────────────────────────────
interface SteamFeaturedItem {
  id: number;
  type: number;
  name: string;
  discounted: boolean;
  discount_percent: number;
  original_price?: number;
  final_price?: number;
  currency?: string;
  large_capsule_image?: string;
  small_capsule_image?: string;
  header_image?: string;
}

interface SteamFeaturedCategory {
  id: string;
  name: string;
  items: SteamFeaturedItem[];
}

interface SteamFeaturedResponse {
  specials?: SteamFeaturedCategory;
  coming_soon?: SteamFeaturedCategory;
  [key: string]: any;
}

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
const STEAM_FEATURED_URL = 'https://store.steampowered.com/api/featuredgcategories/?l=spanish&cc=US';

function buildFetchUrl(url: string) {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const needsProxy = Platform.OS === 'web' && !isElectron;
  return needsProxy ? `${CORS_PROXY}${encodeURIComponent(url)}` : url;
}

function formatPrice(cents: number | undefined, currency = 'USD'): string {
  if (cents == null) return '';
  const amount = (cents / 100).toFixed(2);
  const symbol = currency === 'USD' ? 'US$' : `${currency} `;
  return `${symbol}${amount}`;
}

function bestImage(item: SteamFeaturedItem): string {
  return item.large_capsule_image || item.small_capsule_image || item.header_image || '';
}

function mapSpecialItem(item: SteamFeaturedItem): StoreOffer {
  return {
    id: `steam_special_${item.id}`,
    title: item.name,
    price: formatPrice(item.final_price, item.currency),
    originalPrice: item.discounted ? formatPrice(item.original_price, item.currency) : undefined,
    discountPercent: item.discounted ? item.discount_percent : undefined,
    image: bestImage(item),
    type: 'offer',
    url: `https://store.steampowered.com/app/${item.id}`,
  };
}

function mapComingSoonItem(item: SteamFeaturedItem): StoreOffer {
  return {
    id: `steam_release_${item.id}`,
    title: item.name,
    price: formatPrice(item.final_price, item.currency) || 'Próximamente',
    image: bestImage(item),
    type: 'release',
    url: `https://store.steampowered.com/app/${item.id}`,
  };
}

function buildOffersFromResponse(data: SteamFeaturedResponse): StoreOffer[] {
  const specials = (data?.specials?.items || [])
    .filter((i) => i.discounted)
    .map(mapSpecialItem);

  const comingSoon = (data?.coming_soon?.items || [])
    .slice(0, 10)
    .map(mapComingSoonItem);

  return [...specials, ...comingSoon];
}

/**
 * Obtiene juegos de Steam en oferta (y próximos lanzamientos) usando el
 * mismo formato `StoreOffer` que ya usa el panel de PlayStation Store
 * (storeService.ts), para poder alternar entre "PS5 Store" y "Steam" con
 * exactamente la misma UI (StoreFrontPanel / widget de tienda).
 *
 * Requiere que preload.js exponga `fetchSteamSpecials` (invoca el handler
 * IPC `fetch-steam-specials` que ya existe en main.js). Si no está
 * disponible (web puro sin Electron), hace fetch directo con proxy CORS.
 */
export const fetchSteamStoreOffers = async (): Promise<StoreOffer[]> => {
  try {
    if (Platform.OS === 'web' && (window as any).electronAPI?.fetchSteamSpecials) {
      const data: SteamFeaturedResponse = await (window as any).electronAPI.fetchSteamSpecials();
      const offers = buildOffersFromResponse(data);
      if (offers.length > 0) return offers;
    }

    const res = await fetch(buildFetchUrl(STEAM_FEATURED_URL));
    if (!res.ok) throw new Error('No se pudo obtener las ofertas de Steam');
    const data: SteamFeaturedResponse = await res.json();
    return buildOffersFromResponse(data);
  } catch (error) {
    console.error('[SteamSpecials] Error fetching Steam store offers:', error);
    return [];
  }
};

export default fetchSteamStoreOffers;
