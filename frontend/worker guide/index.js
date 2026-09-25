export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ============================================
    // MÉTODOS PERMITIDOS
    // ============================================
    if (request.method !== "GET" && request.method !== "OPTIONS") {
      return jsonResponse(
        {
          success: false,
          error: "Method not allowed",
        },
        405,
        {
          Allow: "GET, OPTIONS",
        }
      );
    }


    // ============================================
    // CORS PREFLIGHT
    // ============================================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // ============================================
    // RATE LIMITING (40 req / min por IP)
    // ============================================
    const clientIP =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "unknown";

    const rateLimitResult = checkRateLimit(clientIP);

    if (!rateLimitResult.allowed) {
      return jsonResponse(
        {
          success: false,
          error: "Too many requests",
          message: "Please try again later.",
        },
        429,
        {
          "Retry-After": String(rateLimitResult.retryAfter),
        }
      );
    }

    // ============================================
    // HEALTH CHECK
    // ============================================
    if (url.pathname === "/" || url.pathname === "/api") {
      const kv = env.CACHE || globalThis.CACHE;
      return jsonResponse({
        success: true,
        message: "WConsole API is running with L1 (Memory) + L2 (KV) Cache",
        kvConnected: Boolean(kv),
        envKeys: Object.keys(env || {}),
        cachedItemsInMemory: memoryCache.size,
        endpoints: [
          "/api/game?title=...",
          "/api/steamgrid?title=...",
          "/api/rawg?title=...",
          "/api/news",
        ],
      });
    }

    // ============================================
    // IGDB
    // ============================================
    if (url.pathname === "/api/game") {
      return handleGameRequest(url, env);
    }

    // ============================================
    // STEAMGRIDDB
    // ============================================
    if (url.pathname === "/api/steamgrid") {
      return handleSteamGridRequest(url, env);
    }

    // ============================================
    // RAWG
    // ============================================
    if (url.pathname === "/api/rawg") {
      return handleRawgRequest(url, env);
    }

    // ============================================
    // NOTICIAS (NEWS)
    // ============================================
    if (url.pathname === "/api/news") {
      return handleNewsRequest(url, env);
    }

    // ============================================
    // 404
    // ============================================
    return jsonResponse(
      {
        success: false,
        error: "Endpoint not found",
      },
      404
    );
  },
};

// ======================================================
// DUAL CACHE: L1 (MEMORIA) + L2 (KV PERSISTENTE)
// ======================================================

const memoryCache = new Map();

async function withCache(env, cacheKey, ttlSeconds, fetcherFn) {
  const now = Date.now();

  // 1. Memoria rápida del isolate (L1 Cache - ~1ms)
  const mem = memoryCache.get(cacheKey);
  if (mem && (now - mem.timestamp < ttlSeconds * 1000)) {
    return { data: mem.data, hit: true, source: "MEMORY" };
  }

  // 2. KV persistente de Cloudflare (L2 Cache - ~10ms)
  const kv = env.CACHE || globalThis.CACHE;
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, { type: "json" });
      if (cached) {
        memoryCache.set(cacheKey, { data: cached, timestamp: now });
        return { data: cached, hit: true, source: "KV" };
      }
    } catch (err) {
      console.warn("KV read error:", err);
    }
  }

  // 3. Ejecutar llamada externa si no estaba en caché
  const freshData = await fetcherFn();

  if (freshData && freshData.success !== false && freshData.status !== "error") {
    // Guardar en memoria L1
    memoryCache.set(cacheKey, { data: freshData, timestamp: now });

    // Guardar en KV L2
    if (kv) {
      try {
        await kv.put(cacheKey, JSON.stringify(freshData), {
          expirationTtl: ttlSeconds,
        });
      } catch (err) {
        console.warn("KV write error:", err);
      }
    }
  }

  return { data: freshData, hit: false, source: "NETWORK" };
}

// ======================================================
// CONFIGURACIÓN DE RATE LIMIT
// ======================================================

const RATE_LIMIT = {
  maxRequests: 40,
  windowMs: 60 * 1000,
};

const rateLimitStore = new Map();

function checkRateLimit(identifier) {
  const now = Date.now();
  let entry = rateLimitStore.get(identifier);

  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    entry = { start: now, count: 0 };
    rateLimitStore.set(identifier, entry);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT.maxRequests) {
    const retryAfter = Math.max(
      1,
      Math.ceil((RATE_LIMIT.windowMs - (now - entry.start)) / 1000)
    );
    return { allowed: false, retryAfter };
  }

  return { allowed: true, retryAfter: 0 };
}

// ======================================================
// VALIDACIÓN DEL TITLE
// ======================================================

function getValidatedTitle(url) {
  const rawTitle = url.searchParams.get("title");
  if (!rawTitle) return { valid: false, error: "Missing title parameter" };
  const title = rawTitle.trim();
  if (!title) return { valid: false, error: "Title cannot be empty" };
  if (title.length > 150) return { valid: false, error: "Title is too long" };
  return { valid: true, title };
}

// ======================================================
// IGDB
// ======================================================

async function handleGameRequest(url, env) {
  const validation = getValidatedTitle(url);
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error }, 400);
  }

  const title = validation.title;
  if (!env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET) {
    return jsonResponse({ success: false, error: "IGDB credentials are not configured" }, 500);
  }

      const cacheKey = `igdb:v2:${title.toLowerCase()}`;
  // 7 días de caché
  const { data, hit, source } = await withCache(env, cacheKey, 60 * 60 * 24 * 7, async () => {
    try {
      const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.IGDB_CLIENT_ID,
          client_secret: env.IGDB_CLIENT_SECRET,
          grant_type: "client_credentials",
        }),
      });

      if (!tokenResponse.ok) {
        return { success: false, error: "Failed to obtain IGDB access token" };
      }

      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token) {
        return { success: false, error: "IGDB access token was not returned" };
      }

      const igdbQuery = `
        search "${escapeIGDBString(title)}";
        fields
          id,
          name,
          summary,
          storyline,
          first_release_date,
          rating,
          aggregated_rating,
          cover.url,
          genres.name,
          platforms.name,
          involved_companies.company.name,
          involved_companies.publisher,
          involved_companies.developer,
          screenshots.url,
          artworks.url,
          websites.url,
          websites.category,
          videos.video_id,
          videos.name;
        limit 10;
      `;

      const gameResponse = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": env.IGDB_CLIENT_ID,
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "text/plain",
        },
        body: igdbQuery,
      });

      if (!gameResponse.ok) {
        return { success: false, error: "IGDB request failed" };
      }

      const games = await gameResponse.json();
      return {
        success: true,
        query: title,
        count: Array.isArray(games) ? games.length : 0,
        games,
      };
    } catch (error) {
      console.error("IGDB error:", error);
      return { success: false, error: "Failed to communicate with IGDB" };
    }
  });

  return jsonResponse(data, 200, {
    "X-Cache-Status": hit ? `HIT (${source})` : "MISS",
    "Cache-Control": "public, max-age=86400",
  });
}

// ======================================================
// STEAMGRIDDB
// ======================================================

async function handleSteamGridRequest(url, env) {
  const validation = getValidatedTitle(url);
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error }, 400);
  }

  const title = validation.title;
  if (!env.STEAMGRID_API_KEY) {
    return jsonResponse({ success: false, error: "SteamGridDB API key is not configured" }, 500);
  }

  const cacheKey = `steamgrid:v2:${title.toLowerCase()}`;
  // 7 días de caché
  const { data, hit, source } = await withCache(env, cacheKey, 60 * 60 * 24 * 7, async () => {
    try {
      const searchResponse = await fetch(
        `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(title)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${env.STEAMGRID_API_KEY}`,
            Accept: "application/json",
          },
        }
      );

      if (!searchResponse.ok) {
        return { success: false, error: "SteamGridDB search failed" };
      }

      const searchData = await searchResponse.json();
      const games = Array.isArray(searchData.data) ? searchData.data : [];

      if (games.length === 0 || !games[0].id) {
        return {
          success: true,
          query: title,
          game: games[0] || null,
          grids: [],
          heroes: [],
          logos: [],
        };
      }

      const game = games[0];
      const headers = {
        Authorization: `Bearer ${env.STEAMGRID_API_KEY}`,
        Accept: "application/json",
      };

      // Grids en todas las dimensiones que usan los filtros del frontend
      // (cápsula vertical 2:3/22:31, cuadrada 1:1 y ancha 92:43). Pedir solo
      // 600x900 dejaba vacíos los filtros de cuadradas y la pestaña ancha.
      const gridDimensions = "600x900,342x482,660x930,512x512,1024x1024,920x430,460x215";
      const [gridsResponse, heroesResponse, logosResponse] = await Promise.all([
        fetch(`https://www.steamgriddb.com/api/v2/grids/game/${game.id}?dimensions=${gridDimensions}`, { headers }),
        fetch(`https://www.steamgriddb.com/api/v2/heroes/game/${game.id}`, { headers }),
        fetch(`https://www.steamgriddb.com/api/v2/logos/game/${game.id}`, { headers }),
      ]);

      const [gridsData, heroesData, logosData] = await Promise.all([
        safeJson(gridsResponse),
        safeJson(heroesResponse),
        safeJson(logosResponse),
      ]);

      return {
        success: true,
        query: title,
        game,
        grids: Array.isArray(gridsData?.data) ? gridsData.data : [],
        heroes: Array.isArray(heroesData?.data) ? heroesData.data : [],
        logos: Array.isArray(logosData?.data) ? logosData.data : [],
      };
    } catch (error) {
      console.error("SteamGridDB error:", error);
      return { success: false, error: "Failed to communicate with SteamGridDB" };
    }
  });

  return jsonResponse(data, 200, {
    "X-Cache-Status": hit ? `HIT (${source})` : "MISS",
    "Cache-Control": "public, max-age=86400",
  });
}

// ======================================================
// RAWG
// ======================================================

async function handleRawgRequest(url, env) {
  const validation = getValidatedTitle(url);
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error }, 400);
  }

  const title = validation.title;
  if (!env.RAWG_API_KEY) {
    return jsonResponse({ success: false, error: "RAWG API key is not configured" }, 500);
  }

  const cacheKey = `rawg:${title.toLowerCase()}`;
  // 7 días de caché
  const { data, hit, source } = await withCache(env, cacheKey, 60 * 60 * 24 * 7, async () => {
    try {
      const searchRes = await fetch(
        `https://api.rawg.io/api/games?search=${encodeURIComponent(
          title
        )}&search_precise=true&page_size=1&key=${encodeURIComponent(env.RAWG_API_KEY)}`
      );

      if (!searchRes.ok) {
        return { success: false, error: "RAWG search failed" };
      }

      const searchData = await searchRes.json();
      const game = searchData?.results?.[0];

      if (!game?.id) {
        return {
          success: true,
          query: title,
          game: null,
          screenshots: [],
          movies: [],
        };
      }

      const [detailsRes, screenshotsRes, moviesRes] = await Promise.all([
        fetch(`https://api.rawg.io/api/games/${game.id}?key=${encodeURIComponent(env.RAWG_API_KEY)}`),
        fetch(`https://api.rawg.io/api/games/${game.id}/screenshots?page_size=20&key=${encodeURIComponent(env.RAWG_API_KEY)}`),
        fetch(`https://api.rawg.io/api/games/${game.id}/movies?key=${encodeURIComponent(env.RAWG_API_KEY)}`),
      ]);

      const [details, screenshotsData, moviesData] = await Promise.all([
        safeJson(detailsRes),
        safeJson(screenshotsRes),
        safeJson(moviesRes),
      ]);

      const screenshots = Array.isArray(screenshotsData?.results)
        ? screenshotsData.results
          .filter((s) => s?.image)
          .map((s) => ({
            id: s.id,
            image: s.image,
            width: s.width || 0,
            height: s.height || 0,
            is_deleted: Boolean(s.is_deleted),
          }))
        : [];

      const movies = Array.isArray(moviesData?.results)
        ? moviesData.results
          .filter((m) => m?.data?.max || m?.data?.["480"])
          .map((m) => ({
            id: m.id,
            name: m.name || "",
            preview: m.preview || "",
            mp4_max: m.data?.max || "",
            mp4_480: m.data?.["480"] || "",
          }))
        : [];

      return {
        success: true,
        query: title,
        game: details || null,
        screenshots,
        movies,
      };
    } catch (error) {
      console.error("RAWG error:", error);
      return { success: false, error: "Failed to communicate with RAWG" };
    }
  });

  return jsonResponse(data, 200, {
    "X-Cache-Status": hit ? `HIT (${source})` : "MISS",
    "Cache-Control": "public, max-age=86400",
  });
}

// ======================================================
// NOTICIAS (NEWSAPI)
// ======================================================

async function handleNewsRequest(url, env) {
  if (!env.NEWS_API_KEY) {
    return jsonResponse({ status: "error", message: "News API key is not configured" }, 500);
  }

  const q = url.searchParams.get("q") || "videojuegos gaming";
  const pageSize = url.searchParams.get("pageSize") || "10";
  const cacheKey = `news:${q.toLowerCase()}:${pageSize}`;

  // 1 hora de caché
  const { data, hit, source } = await withCache(env, cacheKey, 3600, async () => {
    try {
      const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
        q
      )}&sortBy=publishedAt&pageSize=${encodeURIComponent(
        pageSize
      )}&apiKey=${encodeURIComponent(env.NEWS_API_KEY)}`;

      const response = await fetch(newsUrl, {
        headers: { "User-Agent": "WPS5-Console/1.0" },
      });

      if (!response.ok) {
        return { status: "error", message: `NewsAPI request failed: ${response.status}` };
      }

      return await response.json();
    } catch (error) {
      console.error("NewsAPI error:", error);
      return { status: "error", message: "Failed to communicate with NewsAPI" };
    }
  });

  return jsonResponse(data, 200, {
    "X-Cache-Status": hit ? `HIT (${source})` : "MISS",
    "Cache-Control": "public, max-age=3600",
  });
}

// ======================================================
// HELPERS
// ======================================================

async function safeJson(response) {
  try {
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function escapeIGDBString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

function jsonResponse(data, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...additionalHeaders,
    },
  });
}
