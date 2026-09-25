// WPS5 PSN Metadata API — implementación propia.
// Inspirada en la lógica del plugin metadata-psn-universal (búsqueda GraphQL
// getSearchResults + ficha de producto), reescrita desde cero para Node/Express.
//
// Expone:
//   - searchGames(query, { locale, limit }) -> lista de resultados del Store
//   - getProductDetails(productId, { locale, route }) -> ficha con
//     descripción, géneros, publisher, fecha, score, imágenes y link.

const GRAPHQL_URL = 'https://web.np.playstation.com/api/graphql/v1/op';
const SEARCH_HASH = '4df6284f982e57bec70f23c77e2c219dc792eb19af7fb3d3a81767aa3f1958aa';
const APP_NAME = '@sie-ppr-web-store/app';
const APP_VERSION = '0.113.0';
const REQUEST_TIMEOUT_MS = 30000;

const COVER_ROLES = ['MASTER', 'PORTRAIT_BANNER', 'EDITION_KEY_ART', 'GAMEHUB_COVER_ART'];
const BACKGROUND_ROLES = ['BACKGROUND', 'SIXTEEN_BY_NINE_BANNER'];

const searchCache = new Map();
const detailsCache = new Map();

function getConfig() {
  return {
    locale: process.env.PSN_LOCALE || 'es-CO',
    storePath: (process.env.PSN_STORE_PATH || 'es-co').toLowerCase(),
    cacheMs: Number(process.env.PSN_METADATA_CACHE_MS || process.env.CACHE_DURATION_MS || 1000 * 60 * 60),
  };
}

function cacheGet(map, key, ttlMs) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > ttlMs) {
    map.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(map, key, data) {
  map.set(key, { data, time: Date.now() });
  if (map.size > 200) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
}

// ─── Locales ────────────────────────────────────────────────────────────────
// Acepta "es-CO", "es-co", "en-us"... Normaliza a "xx-YY" para headers y
// a "xx-yy" para URLs.

function normalizeLocale(input) {
  const fallback = getConfig().locale;
  const raw = (input || fallback || 'es-CO').trim();
  const parts = raw.split('-');
  if (parts.length < 2) return fallback;
  return `${parts[0].toLowerCase()}-${parts.slice(1).join('-').toUpperCase()}`;
}

function localeForUrl(locale) {
  return normalizeLocale(locale).toLowerCase();
}

function splitLocale(locale) {
  const normalized = normalizeLocale(locale);
  const parts = normalized.split('-');
  const countryCode = parts[parts.length - 1].toUpperCase();
  let languageCode = parts[0].toLowerCase();
  // El Store usa "ch" para chino tradicional (zh-hant-tw).
  if (languageCode === 'zh' && parts.length > 2 && parts[1].toLowerCase() === 'hant') {
    languageCode = 'ch';
  }
  return { countryCode, languageCode };
}

function newRequestId() {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function storeHeaders(locale) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    Origin: 'https://store.playstation.com',
    Referer: 'https://store.playstation.com/',
    'apollographql-client-name': APP_NAME,
    'apollographql-client-version': APP_VERSION,
    'X-PSN-App-Ver': `${APP_NAME}/${APP_VERSION}-`,
    'X-PSN-Correlation-ID': newRequestId(),
    'X-PSN-Request-ID': newRequestId(),
    'X-PSN-Store-Locale-Override': normalizeLocale(locale),
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Search ─────────────────────────────────────────────────────────────────

function buildSearchUrl(searchTerm, locale, pageSize = 24) {
  const { countryCode, languageCode } = splitLocale(locale);
  const variables = {
    countryCode,
    languageCode,
    nextCursor: '',
    pageOffset: 0,
    pageSize,
    searchTerm,
  };
  const extensions = { persistedQuery: { version: 1, sha256Hash: SEARCH_HASH } };
  const params = new URLSearchParams({
    operationName: 'getSearchResults',
    variables: JSON.stringify(variables),
    extensions: JSON.stringify(extensions),
  });
  return `${GRAPHQL_URL}?${params.toString()}`;
}

function pickMediaUrl(media = [], roles) {
  for (const role of roles) {
    const match = media.find(
      (m) => m?.type === 'IMAGE' && m?.role === role && m?.url,
    );
    if (match?.url) return match.url;
  }
  return null;
}

function pickAnyImage(media = []) {
  return media.find((m) => m?.type === 'IMAGE' && m?.url)?.url || null;
}

function mapSearchItem(item, locale) {
  const storePath = localeForUrl(locale);
  const coverUrl =
    pickMediaUrl(item.media, COVER_ROLES) || pickAnyImage(item.media);
  if (!item?.id || !item?.name || !coverUrl) return null;

  const route = String(item.__typename || '').toLowerCase() === 'concept' ? 'concept' : 'product';
  const labels = [];
  if (item.localizedStoreDisplayClassification) labels.push(item.localizedStoreDisplayClassification);
  if (Array.isArray(item.platforms) && item.platforms.length > 0) {
    labels.push(item.platforms.join(', '));
  }

  return {
    id: item.id,
    name: item.name,
    type: item.__typename || 'Product',
    classification: item.storeDisplayClassification || null,
    classificationLabel: item.localizedStoreDisplayClassification || null,
    description: labels.join(' · ') || null,
    platforms: Array.isArray(item.platforms) ? item.platforms : [],
    coverUrl,
    backgroundUrl: pickMediaUrl(item.media, BACKGROUND_ROLES),
    url: `https://store.playstation.com/${storePath}/${route}/${item.id}`,
    route,
  };
}

export async function searchGames(query, { locale, limit = 24 } = {}) {
  const q = String(query || '').trim();
  if (!q) {
    const err = new Error('Parámetro "q" requerido');
    err.status = 400;
    throw err;
  }
  const resolvedLocale = normalizeLocale(locale);
  const pageSize = Math.min(Math.max(Number(limit) || 24, 1), 24);
  const { cacheMs } = getConfig();
  const cacheKey = `search:${resolvedLocale}:${q.toLowerCase()}:${pageSize}`;
  const cached = cacheGet(searchCache, cacheKey, cacheMs);
  if (cached) return cached;

  const url = buildSearchUrl(q, resolvedLocale, pageSize);
  const response = await fetchWithTimeout(url, { headers: storeHeaders(resolvedLocale) });
  if (!response.ok) {
    const err = new Error(`PlayStation Store respondió con status ${response.status}`);
    err.status = 502;
    throw err;
  }
  const data = await response.json();
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    const msg = data.errors.map((e) => e?.message).filter(Boolean).join('; ');
    const err = new Error(`PlayStation Store GraphQL error: ${msg || 'unknown'}`);
    err.status = 502;
    throw err;
  }
  const results = data?.data?.universalSearch?.results || [];
  const mapped = results
    .map((item) => mapSearchItem(item, resolvedLocale))
    .filter(Boolean)
    .slice(0, pageSize);

  const payload = { query: q, locale: resolvedLocale, count: mapped.length, results: mapped };
  cacheSet(searchCache, cacheKey, payload);
  return payload;
}

// ─── Details (ficha de producto) ────────────────────────────────────────────
// Descarga el HTML de la ficha y extrae metadatos con regex sobre:
//  - JSON-LD / __NEXT_DATA__ (descripción, publisher, fecha, rating, imagen)
//  - atributos data-qa del storefront (mismo enfoque que el plugin C#)
//  - meta tags como fallback.

function htmlUnescape(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function stripTags(html) {
  return htmlUnescape(String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
}

function matchFirst(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return htmlUnescape(m[1]);
  }
  return null;
}

function parseDetailsHtml(html, { id, locale, route, pageUrl }) {
  const storePath = localeForUrl(locale);

  const description =
    matchFirst(html, [
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
    ]) ?
      extractJsonLdDescription(html) ||
      matchFirst(html, [
        /data-qa="mfe-game-overview#description"[^>]*>([\s\S]*?)<\/[a-z]+>/i,
        /<meta name="description" content="([^"]+)"/i,
        /<meta property="og:description" content="([^"]+)"/i,
      ]) :
      matchFirst(html, [
        /data-qa="mfe-game-overview#description"[^>]*>([\s\S]*?)<\/[a-z]+>/i,
        /<meta name="description" content="([^"]+)"/i,
        /<meta property="og:description" content="([^"]+)"/i,
      ]);

  const publisher = matchFirst(html, [
    /data-qa="gameInfo#releaseInformation#publisher-value"[^>]*>([^<]+)</i,
    /data-qa="mfe-game-title#publisher"[^>]*>([^<]+)</i,
    /"publisher"\s*:\s*\{\s*"[^"]*"\s*:\s*"([^"]+)"/i,
    /"publisher"\s*:\s*"([^"]+)"/i,
  ]);

  const rawGenres = matchFirst(html, [
    /data-qa="gameInfo#releaseInformation#genre-value"[^>]*>([^<]+)</i,
    /"genre"\s*:\s*\[([^\]]+)\]/i,
  ]);
  // El storefront nuevo embebe géneros como "localizedGenres":[{"value":"Acción"}]
  const localizedGenres = [...html.matchAll(/"localizedGenres"\s*:\s*\[([^\]]*?)\]/gi)]
    .flatMap((m) => [...m[1].matchAll(/"value"\s*:\s*"([^"]+)"/g)].map((g) => g[1]))
    .filter(Boolean);
  const genres = [...new Set((localizedGenres.length > 0
    ? localizedGenres
    : rawGenres
      ? rawGenres.split(/[,|]/).map((g) => stripTags(g).replace(/["[\]]/g, '').trim())
      : []
  ))].filter(Boolean);

  const releaseDate = matchFirst(html, [
    /"releaseDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/i,
    /data-qa="gameInfo#releaseInformation#releaseDate-value"[^>]*>([^<]+)</i,
  ]);

  const ratingRaw = matchFirst(html, [
    /data-qa="mfe-game-title#average-rating"[^>]*>([^<]+)</i,
    /"ratingValue"\s*:\s*"([\d.]+)"/i,
    /"averageRating"\s*:\s*([\d.]+)/i,
  ]);
  let communityScore = null;
  if (ratingRaw) {
    const rating = Number.parseFloat(ratingRaw.replace(',', '.'));
    if (Number.isFinite(rating) && rating >= 0 && rating <= 5) {
      communityScore = Math.round(rating * 20);
    }
  }

  const name =
    matchFirst(html, [
      /<meta property="og:title" content="([^"]+)"/i,
      /data-qa="mfe-game-title#title"[^>]*>([^<]+)</i,
      /<title>([^<]+)<\/title>/i,
    ]) || null;

  const coverUrl = matchFirst(html, [
    /<meta property="og:image" content="([^"]+)"/i,
  ]);

  const backgroundUrl = matchFirst(html, [
    /img[^>]*data-qa="gameBackgroundImage#heroImage#image-no-js"[^>]*src="([^"]+)"/i,
    /img[^>]*data-qa="gameBackgroundImage#heroImage#preview"[^>]*src="([^"]+)"/i,
  ]);

  return {
    id,
    name,
    description: description ? stripTags(description) : null,
    genres,
    publisher,
    releaseDate,
    communityScore,
    coverUrl: coverUrl ? coverUrl.split('?')[0] : null,
    backgroundUrl: backgroundUrl ? backgroundUrl.split('?')[0] : null,
    platforms: [],
    locale: normalizeLocale(locale),
    url: pageUrl || `https://store.playstation.com/${storePath}/${route}/${encodeURIComponent(id)}`,
  };
}

function extractJsonLdDescription(html) {
  try {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const [, jsonText] of blocks) {
      const parsed = JSON.parse(jsonText);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of candidates) {
        const desc = node?.description;
        if (typeof desc === 'string' && desc.trim()) return desc.trim();
        // Algunos grafos anidan en @graph
        const graph = node?.['@graph'];
        if (Array.isArray(graph)) {
          for (const g of graph) {
            if (typeof g?.description === 'string' && g.description.trim()) return g.description.trim();
          }
        }
      }
    }
  } catch {
    // Si el JSON-LD no parsea, se usan los fallbacks de data-qa/meta.
  }
  return null;
}

export async function getProductDetails(productId, { locale, route = 'product' } = {}) {
  const id = String(productId || '').trim();
  if (!id) {
    const err = new Error('Parámetro "id" requerido');
    err.status = 400;
    throw err;
  }
  const resolvedLocale = normalizeLocale(locale);
  const storePath = localeForUrl(resolvedLocale);
  const safeRoute = route === 'concept' ? 'concept' : 'product';
  const { cacheMs } = getConfig();
  const cacheKey = `details:${resolvedLocale}:${safeRoute}:${id}`;
  const cached = cacheGet(detailsCache, cacheKey, cacheMs);
  if (cached) return cached;

  const pageUrl = `https://store.playstation.com/${storePath}/${safeRoute}/${encodeURIComponent(id)}`;
  const response = await fetchWithTimeout(
    pageUrl,
    {
      headers: {
        ...storeHeaders(resolvedLocale),
        Accept: 'text/html,application/xhtml+xml',
      },
    },
    REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) {
    const err = new Error(`Ficha de PlayStation Store respondió con status ${response.status}`);
    err.status = response.status === 404 ? 404 : 502;
    throw err;
  }
  const html = await response.text();
  const details = parseDetailsHtml(html, { id, locale: resolvedLocale, route: safeRoute, pageUrl });
  cacheSet(detailsCache, cacheKey, details);
  return details;
}

// Búsqueda + ficha en una sola llamada (útil para "Sync" de un juego local).
export async function getMetadataForName(name, { locale } = {}) {
  const search = await searchGames(name, { locale, limit: 10 });
  if (search.results.length === 0) {
    return { query: name, locale: search.locale, match: null, details: null };
  }
  const best = search.results[0];
  const details = await getProductDetails(best.id, { locale: search.locale, route: best.route }).catch(() => null);
  return {
    query: name,
    locale: search.locale,
    match: best,
    details: details || {
      id: best.id,
      name: best.name,
      description: best.description,
      genres: [],
      publisher: null,
      releaseDate: null,
      communityScore: null,
      coverUrl: best.coverUrl,
      backgroundUrl: best.backgroundUrl,
      platforms: best.platforms,
      locale: search.locale,
      url: best.url,
    },
    candidates: search.results,
  };
}

export function clearPsnCaches() {
  searchCache.clear();
  detailsCache.clear();
}
