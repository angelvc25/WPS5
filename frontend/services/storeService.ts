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
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2653090/header.jpg',
    type: 'offer',
    url: 'https://store.playstation.com',
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
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1174180/header.jpg', // GTA V as visual proxy
    type: 'release',
    url: 'https://store.playstation.com',
  },
  {
    id: 'death-stranding-2',
    title: 'Death Stranding 2: On The Beach',
    price: 'US$69.99',
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1190460/header.jpg', // Death Stranding 1 as visual proxy
    type: 'release',
    url: 'https://store.playstation.com',
  }
];

export const fetchStoreOffers = async (): Promise<StoreOffer[]> => {
  try {
    // Si estamos en Electron, preferimos usar el proceso principal para evitar bloqueos de red/CORS
    if ((window as any).electronAPI && (window as any).electronAPI.fetchSteamSpecials) {
      const data = await (window as any).electronAPI.fetchSteamSpecials();
      
      if (data && !data.error) {
        const offers: StoreOffer[] = [];
        
        // 1. Procesar Specials (Ofertas)
        if (data.specials && data.specials.items) {
          const specialsItems = data.specials.items.slice(0, 5);
          specialsItems.forEach((item: any) => {
            const finalPrice = item.final_price ? `US$${(item.final_price / 100).toFixed(2)}` : 'Ver precio';
            const originalPrice = item.original_price ? `US$${(item.original_price / 100).toFixed(2)}` : undefined;
            offers.push({
              id: `steam-offer-${item.id}`,
              title: item.name,
              price: finalPrice,
              originalPrice,
              discountPercent: item.discount_percent || undefined,
              image: item.header_image || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`,
              type: 'offer',
              url: `https://store.playstation.com`, // Siempre enrutar al store de Playstation ya que es WPS5
            });
          });
        }
        
        // 2. Procesar Coming Soon o Próximos Lanzamientos
        if (data.coming_soon && data.coming_soon.items) {
          const upcomingItems = data.coming_soon.items.slice(0, 3);
          upcomingItems.forEach((item: any) => {
            offers.push({
              id: `steam-release-${item.id}`,
              title: item.name,
              price: item.price ? `US$${(item.price / 100).toFixed(2)}` : 'Próximamente',
              image: item.header_image || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`,
              type: 'release',
              url: `https://store.playstation.com`,
            });
          });
        }
        
        if (offers.length > 0) {
          return offers;
        }
      }
    }
    
    // Si no estamos en Electron o el fetch falla, devolvemos el fallback local
    console.log('[StoreService] Usando fallback local para ofertas de PlayStation');
    return LOCAL_FALLBACK_OFFERS;
  } catch (error) {
    console.error('[StoreService] Error fetching store offers:', error);
    return LOCAL_FALLBACK_OFFERS;
  }
};
