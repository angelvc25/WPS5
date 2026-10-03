export interface StoreOffer {
  id: string;
  title: string;
  price: string;
  originalPrice?: string;
  discountPercent?: number;
  image: string;
  backgroundImage?: string;
  logo?: string;
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
    backgroundImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2322010/capsule_616x353.jpg',
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
    backgroundImage: 'https://cdn2.steamgriddb.com/hero_thumb/74c12bbaa74d13c2b891cd7673d61370.jpg',
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
    backgroundImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2215430/capsule_616x353.jpg',
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
    backgroundImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/capsule_616x353.jpg',
    type: 'offer',
    url: 'https://store.playstation.com',
  },
  {
    id: 'gta-vi',
    title: 'Grand Theft Auto VI',
    price: 'US$69.99',
    image: 'https://cdn2.steamgriddb.com/hero/b80be7960918982fceea91afaf4d5e27.png',
    backgroundImage: 'https://cdn2.steamgriddb.com/hero/b80be7960918982fceea91afaf4d5e27.png',
    type: 'release',
    url: 'https://www.playstation.com/es-co/games/grand-theft-auto-vi/',
  },
  {
    id: 'death-stranding-2',
    title: 'Marvel´s Wolverine',
    price: 'US$69.99',
    image: 'https://cdn2.steamgriddb.com/hero_thumb/5fe904eb5337336c64944610132d5e34.jpg',
    backgroundImage: 'https://cdn2.steamgriddb.com/hero_thumb/5fe904eb5337336c64944610132d5e34.jpg',
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

export function extractSteamAppId(offer?: StoreOffer | null): number | null {
  if (!offer) return null;
  const matchId = offer.id?.match?.(/^steam_(?:release|special)_(\d+)$/);
  if (matchId) return Number(matchId[1]);
  const matchUrl = offer.url?.match?.(/\/app\/(\d+)/);
  if (matchUrl) return Number(matchUrl[1]);
  return null;
}

/**
 * Enriquece las ofertas de la tienda con imágenes hero y logos de SteamGridDB o Steam API/CDN.
 * Uso: fuente "Steam". Para la fuente "PS5 Store" usar
 * `enrichOffersWithPsnBackgrounds` (fondos PSN, logos SteamGrid).
 */
export const enrichOffersWithHeroes = async (offers: StoreOffer[]): Promise<StoreOffer[]> => {
  try {
    const { fetchSteamGridData } = await import('./steamGridService');

    const enriched = await Promise.allSettled(
      offers.map(async (offer) => {
        const appId = extractSteamAppId(offer);
        let backgroundImage = offer.backgroundImage;
        let logo = offer.logo;

        // Para próximos lanzamientos o juegos de Steam: inicializar con assets oficiales de Steam
        if (appId) {
          if (!backgroundImage) {
            backgroundImage = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`;
          }
          if (!logo) {
            logo = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/logo.png`;
          }
        }

        // Si aún falta alguno, consultar SteamGridDB
        if (!backgroundImage || !logo) {
          try {
            const result = await fetchSteamGridData(offer.title);
            if (result.success && result.data) {
              if (!backgroundImage && result.data.hero) backgroundImage = result.data.hero;
              if (!logo && result.data.logo) logo = result.data.logo;
            }
          } catch {
            // Continuar con los valores de Steam
          }
        }

        // Si SteamGrid no lo tiene (común en próximos lanzamientos), asegurar fallbacks de Steam
        if (!backgroundImage && appId) {
          backgroundImage = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`;
        }
        if (!logo && appId) {
          logo = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/logo.png`;
        }

        return {
          ...offer,
          backgroundImage: backgroundImage || offer.image,
          logo: logo || undefined,
        };
      })
    );

    return enriched.map((r, i) =>
      r.status === 'fulfilled' ? r.value : offers[i]
    );
  } catch {
    return offers;
  }
};

/**
 * Enriquece las ofertas de PS5 Store con fondos de PSN en lugar de SteamGridDB.
 * - backgroundImage: solo PSN (`/api/psn/metadata` → details.backgroundUrl ||
 *   match.backgroundUrl). Nunca usa SteamGrid para el fondo.
 * - logo: PSN no provee logos, así que se mantiene SteamGridDB como fallback.
 */
export const enrichOffersWithPsnBackgrounds = async (
  offers: StoreOffer[],
  locale?: string,
): Promise<StoreOffer[]> => {
  try {
    const [{ fetchPsnMetadata }, { fetchSteamGridData }] = await Promise.all([
      import('./psnMetadataService'),
      import('./steamGridService'),
    ]);

    const enriched = await Promise.allSettled(
      offers.map(async (offer) => {
        let backgroundImage = offer.backgroundImage;
        let logo = offer.logo;

        if (!backgroundImage) {
          try {
            const psn = await fetchPsnMetadata(
              offer.title,
              locale ? { locale } : {},
            );
            const psnBg =
              psn?.details?.backgroundUrl || psn?.match?.backgroundUrl || null;
            if (psnBg) backgroundImage = psnBg;
          } catch {
            // Sin fondo PSN: se conserva el valor original (sin fallback a SteamGrid).
          }
        }

        if (!logo) {
          try {
            const result = await fetchSteamGridData(offer.title);
            if (result.success && result.data?.logo) logo = result.data.logo;
          } catch {
            // Sin logo: se conserva el valor original.
          }
        }

        return { ...offer, backgroundImage, logo };
      })
    );

    return enriched.map((r, i) =>
      r.status === 'fulfilled' ? r.value : offers[i]
    );
  } catch {
    return offers;
  }
};
