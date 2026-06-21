export interface StoreOffer {
  id: string;
  title: string;
  price: string;
  originalPrice?: string;
  discountPercent?: number;
  image: string;
  type: 'offer' | 'release';
  url: string;
}

const STORE_API_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_STORE_API_URL) ||
  'http://localhost:3000';

// Fallback local con ofertas de PlayStation reales y de alta calidad visual
export const LOCAL_FALLBACK_OFFERS: StoreOffer[] = [
  {
    id: 'gow-ragnarok',
    title: 'God of War Ragnarök',
    price: 'US$39.99',
    originalPrice: 'US$59.99',
    discountPercent: 33,
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2322010/header.jpg',
    type: 'offer',
    url: 'https://store.playstation.com',
  },
  {
    id: 'spiderman-2',
    title: "Marvel's Spider-Man 2",
    price: 'US$45.49',
    originalPrice: 'US$69.99',
    discountPercent: 35,
    image: 'https://cdn2.steamgriddb.com/hero_thumb/74c12bbaa74d13c2b891cd7673d61370.jpg',
    type: 'offer',
    url: 'https://www.playstation.com/es-co/games/marvels-spider-man-2/',
  },
  {
    id: 'ghost-of-tsushima',
    title: "Ghost of Tsushima Director's Cut",
    price: 'US$29.99',
    originalPrice: 'US$59.99',
    discountPercent: 50,
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2215430/header.jpg',
    type: 'offer',
    url: 'https://store.playstation.com',
  },
  {
    id: 'elden-ring-shadow',
    title: 'Elden Ring Shadow of the Erdtree',
    price: 'US$55.99',
    originalPrice: 'US$79.99',
    discountPercent: 30,
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg',
    type: 'offer',
    url: 'https://store.playstation.com',
  },
  {
    id: 'gta-vi',
    title: 'Grand Theft Auto VI',
    price: 'US$69.99',
    image: 'https://cdn2.steamgriddb.com/hero/b80be7960918982fceea91afaf4d5e27.png',
    type: 'release',
    url: 'https://www.playstation.com/es-co/games/grand-theft-auto-vi/',
  },
  {
    id: 'death-stranding-2',
    title: 'Marvel´s Wolverine',
    price: 'US$69.99',
    image: 'https://cdn2.steamgriddb.com/hero_thumb/5fe904eb5337336c64944610132d5e34.jpg',
    type: 'release',
    url: 'https://www.playstation.com/es-co/games/marvels-wolverine/',
  },
];

function isValidStoreOffer(value: unknown): value is StoreOffer {
  if (!value || typeof value !== 'object') return false;
  const offer = value as StoreOffer;
  return (
    typeof offer.id === 'string' &&
    typeof offer.title === 'string' &&
    typeof offer.price === 'string' &&
    typeof offer.image === 'string' &&
    (offer.type === 'offer' || offer.type === 'release') &&
    typeof offer.url === 'string'
  );
}

async function fetchFromStoreApi(): Promise<StoreOffer[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${STORE_API_URL}/api/store/deals`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn('[StoreService] API respondió con error:', response.status);
      return null;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[StoreService] API devolvió una lista vacía');
      return null;
    }

    const offers = data.filter(isValidStoreOffer);
    return offers.length > 0 ? offers : null;
  } catch (error) {
    console.warn('[StoreService] No se pudo contactar la API de ofertas:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export const fetchStoreOffers = async (): Promise<StoreOffer[]> => {
  try {
    const offers = await fetchFromStoreApi();
    if (offers) {
      return offers;
    }

    console.log('[StoreService] Usando fallback local para ofertas de PlayStation');
    return LOCAL_FALLBACK_OFFERS;
  } catch (error) {
    console.error('[StoreService] Error fetching store offers:', error);
    return LOCAL_FALLBACK_OFFERS;
  }
};
