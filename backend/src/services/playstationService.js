const GRAPHQL_URL = 'https://web.np.playstation.com/api/graphql/v1/op';
const CATEGORY_GRID_HASH = '4ce7d410a4db2c8b635a48c1dcec375906ff63b19dadd87e073f8fd0c0481d35';

const CATEGORIES = {
  PS5_GAMES: '4cbf39e2-5749-4970-ba81-93a489e4570c',
};

const IMAGE_ROLES = [
  'EDITION_KEY_ART',
  'GAMEHUB_COVER_ART',
  'SIXTEEN_BY_NINE_BANNER',
  'MASTER',
  'PORTRAIT_BANNER',
  'BACKGROUND',
];

let cache = null;
let cacheTime = 0;

function getConfig() {
  return {
    locale: process.env.PSN_LOCALE || 'es-CO',
    storePath: process.env.PSN_STORE_PATH || 'es-co',
    cacheDuration: Number(process.env.CACHE_DURATION_MS || 1000 * 60 * 60),
  };
}

async function fetchCategoryProducts(categoryId, sortBy, pageSize = 24, offset = 0) {
  const { locale } = getConfig();

  const variables = {
    filterBy: [],
    facetOptions: [],
    id: categoryId,
    pageArgs: { size: pageSize, offset },
    sortBy: {
      isAscending: sortBy.isAscending ?? false,
      name: sortBy.name,
    },
  };

  const extensions = {
    persistedQuery: {
      version: 1,
      sha256Hash: CATEGORY_GRID_HASH,
    },
  };

  const params = new URLSearchParams({
    operationName: 'categoryGridRetrieve',
    variables: JSON.stringify(variables),
    extensions: JSON.stringify(extensions),
  });

  const response = await fetch(`${GRAPHQL_URL}?${params}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-psn-store-locale-override': locale,
      'x-apollo-operation-name': 'categoryGridRetrieve',
    },
  });

  if (!response.ok) {
    throw new Error(`PlayStation Store respondió con status ${response.status}`);
  }

  const data = await response.json();

  if (data.errors?.length) {
    const reason = data.errors[0]?.error?.reason || data.errors[0]?.message || 'unknown';
    throw new Error(`PlayStation Store GraphQL error: ${reason}`);
  }

  return data?.data?.categoryGridRetrieve?.products || [];
}

function pickProductImage(media = []) {
  for (const role of IMAGE_ROLES) {
    const match = media.find((item) => item.role === role && item.type === 'IMAGE');
    if (match?.url) return match.url;
  }

  const fallback = media.find((item) => item.type === 'IMAGE');
  return fallback?.url || '';
}

function parsePriceValue(priceText) {
  if (!priceText) return null;
  const match = priceText.match(/[\d,.]+/);
  if (!match) return null;
  return Number.parseFloat(match[0].replace(',', ''));
}

function parseDiscountPercent(discountText, basePrice, discountedPrice) {
  if (discountText) {
    const match = discountText.match(/-?(\d+)%/);
    if (match) return Number(match[1]);
  }

  const base = parsePriceValue(basePrice);
  const discounted = parsePriceValue(discountedPrice);

  if (base && discounted && base > discounted) {
    return Math.round(((base - discounted) / base) * 100);
  }

  return undefined;
}

function hasDiscount(product) {
  const price = product?.price;
  if (!price) return false;
  if (price.discountText) return true;
  return price.basePrice && price.discountedPrice && price.basePrice !== price.discountedPrice;
}

function mapProductToOffer(product, type) {
  const { storePath } = getConfig();
  const price = product.price || {};
  const finalPrice = price.discountedPrice || price.basePrice || 'Ver precio';
  const originalPrice = hasDiscount(product) ? price.basePrice : undefined;

  return {
    id: product.id,
    title: product.name,
    price: finalPrice,
    originalPrice,
    discountPercent: parseDiscountPercent(price.discountText, price.basePrice, price.discountedPrice),
    image: pickProductImage(product.media),
    type,
    url: `https://store.playstation.com/${storePath}/product/${encodeURIComponent(product.id)}`,
  };
}

async function fetchDealsFromPlayStation() {
  const [dealsRaw, upcomingRaw] = await Promise.all([
    fetchCategoryProducts(CATEGORIES.PS5_GAMES, { name: 'sales30' }, 30),
    fetchCategoryProducts(CATEGORIES.PS5_GAMES, { name: 'productReleaseDate', isAscending: false }, 12),
  ]);

  const deals = dealsRaw
    .filter(hasDiscount)
    .slice(0, 6)
    .map((product) => mapProductToOffer(product, 'offer'));

  const dealIds = new Set(deals.map((item) => item.id));

  const upcoming = upcomingRaw
    .filter((product) => !dealIds.has(product.id))
    .slice(0, 4)
    .map((product) => mapProductToOffer(product, 'release'));

  return [...deals, ...upcoming];
}

export async function getDeals({ forceRefresh = false } = {}) {
  const { cacheDuration } = getConfig();

  if (!forceRefresh && cache && Date.now() - cacheTime < cacheDuration) {
    return cache;
  }

  const deals = await fetchDealsFromPlayStation();

  if (deals.length === 0) {
    throw new Error('PlayStation Store no devolvió ofertas');
  }

  cache = deals;
  cacheTime = Date.now();
  return deals;
}
