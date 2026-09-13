'use strict';

/**
 * retroAchievements.js
 *
 * Integración con la API de RetroAchievements para leer logros de
 * juegos clásicos (PS1, PS2, N64, SNES, GBA, etc.)
 *
 * API pública:
 *   fetchRetroAchievements(gameTitle, platform, username, apiKey)
 *     → Promise<NormalizedSummary | null>
 *
 * NormalizedSummary = {
 *   total, unlocked, source: 'retroachievements',
 *   gameTitle, gameId, consoleId, consoleName, gameImageUrl,
 *   rarityCounts: { platinum, gold, silver, bronze },
 *   achievements: [{ apiName, name, description, icon, lockedIcon,
 *                    achieved, unlockTime, globalPercentage, rarity }]
 * }
 */

// Mapeo de nombres de plataforma internos (tal como aparecen en WPS5)
// al Console ID de RetroAchievements.
// Lista completa en: https://retroachievements.org/develop/hashgames.php
const PLATFORM_TO_CONSOLE_ID = {
  // PlayStation
  'ps1': 12,
  'psx': 12,
  'playstation': 12,
  'playstation 1': 12,
  'playstation1': 12,
  'ps2': 21,
  'playstation 2': 21,
  'playstation2': 21,
  'psp': 41,
  'ps portable': 41,
  'playstation portable': 41,

  // Nintendo
  'nes': 7,
  'famicom': 7,
  'snes': 3,
  'super nintendo': 3,
  'super nes': 3,
  'n64': 2,
  'nintendo 64': 2,
  'gb': 4,
  'game boy': 4,
  'gameboy': 4,
  'gbc': 6,
  'game boy color': 6,
  'gba': 5,
  'game boy advance': 5,
  'nds': 18,
  'nintendo ds': 18,
  'ds': 18,
  'gamecube': 16,
  'gc': 16,
  'wii': 38,
  'virtualboy': 28,
  'virtual boy': 28,

  // Sega
  'genesis': 1,
  'mega drive': 1,
  'sega genesis': 1,
  'sega mega drive': 1,
  'sms': 11,
  'master system': 11,
  'sega master system': 11,
  'saturn': 39,
  'sega saturn': 39,
  'dreamcast': 40,
  'sega dreamcast': 40,
  'gamegear': 15,
  'game gear': 15,
  'sega game gear': 15,
  '32x': 10,
  'sega 32x': 10,

  // Atari
  'atari 2600': 25,
  '2600': 25,
  'atari 7800': 51,
  '7800': 51,
  'atari lynx': 13,
  'lynx': 13,
  'jaguar': 17,
  'atari jaguar': 17,

  // PC Engine / TurboGrafx
  'pce': 8,
  'turbografx': 8,
  'turbografx-16': 8,
  'pc engine': 8,

  // Neo Geo
  'neogeo': 36,
  'neo geo': 36,
  'ng': 36,

  // Arcade
  'arcade': 27,
  'mame': 27,

  // Amstrad / MSX / etc.
  'msx': 29,
  'coleco': 44,
  'colecovision': 44,
};

const RA_BASE = 'https://retroachievements.org/API';

/**
 * Resuelve el Console ID a partir del string de plataforma.
 * Prueba coincidencia exacta y parcial (para cubrir variantes como "PlayStation 2 (USA)").
 */
function resolveConsoleId(platform) {
  if (!platform) return null;
  const norm = platform.toLowerCase().trim();
  if (PLATFORM_TO_CONSOLE_ID[norm] !== undefined) {
    return PLATFORM_TO_CONSOLE_ID[norm];
  }
  // Búsqueda parcial
  for (const [key, id] of Object.entries(PLATFORM_TO_CONSOLE_ID)) {
    if (norm.includes(key) || key.includes(norm)) return id;
  }
  return null;
}

/**
 * Normaliza el título del juego eliminando etiquetas de región y disc number.
 * "God of War (USA) [DISC1]" → "God of War"
 */
function normalizeTitle(title) {
  return title
    .replace(/\s*\((usa|eur|jpn|japan|europe|america|pal|ntsc|disc\s*\d+|cd\s*\d+)\)/gi, '')
    .replace(/\s*\[(disc\s*\d+|cd\s*\d+|pal|ntsc)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula la similitud entre dos strings (coeficiente de Dice simplificado).
 */
function similarity(a, b) {
  const setA = new Set(a.toLowerCase().split(''));
  const setB = new Set(b.toLowerCase().split(''));
  let intersection = 0;
  for (const c of setA) if (setB.has(c)) intersection++;
  return (2 * intersection) / (setA.size + setB.size);
}

/**
 * Busca el mejor juego coincidente por título dentro de una lista de juegos de RA.
 */
function findBestMatch(normalizedTitle, gameList) {
  let best = null;
  let bestScore = 0;
  const titleLower = normalizedTitle.toLowerCase();

  for (const game of gameList) {
    const raTitle = normalizeTitle(game.Title || game.title || '').toLowerCase();
    // Coincidencia exacta
    if (raTitle === titleLower) return game;
    // Coincidencia por inclusión
    if (raTitle.includes(titleLower) || titleLower.includes(raTitle)) {
      const score = Math.max(raTitle.length, titleLower.length) > 0
        ? Math.min(raTitle.length, titleLower.length) / Math.max(raTitle.length, titleLower.length)
        : 0;
      if (score > bestScore) {
        bestScore = score;
        best = game;
      }
    } else {
      // Similitud de caracteres
      const score = similarity(raTitle, titleLower);
      if (score > 0.75 && score > bestScore) {
        bestScore = score;
        best = game;
      }
    }
  }
  return bestScore > 0.5 ? best : null;
}

/**
 * Determina la rareza basada en el porcentaje de jugadores que tienen el logro.
 */
function rarityFor(pct) {
  if (pct === null || pct === undefined) return 'bronze';
  if (pct <= 1) return 'platinum';
  if (pct <= 5) return 'gold';
  if (pct <= 15) return 'silver';
  return 'bronze';
}

/**
 * Obtiene la lista de juegos de una consola en RA.
 */
async function fetchGameList(consoleId, username, apiKey) {
  const url = `${RA_BASE}/API_GetGameList.php?z=${encodeURIComponent(username)}&y=${encodeURIComponent(apiKey)}&i=${consoleId}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'WPS5-Launcher/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Obtiene los logros de un juego + el progreso del usuario.
 */
async function fetchGameProgress(gameId, username, apiKey) {
  const url = `${RA_BASE}/API_GetGameInfoAndUserProgress.php?z=${encodeURIComponent(username)}&y=${encodeURIComponent(apiKey)}&u=${encodeURIComponent(username)}&g=${gameId}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'WPS5-Launcher/1.0' } });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Obtiene la info básica de un juego sin progreso de usuario (para casos sin username).
 */
async function fetchGameInfo(gameId, username, apiKey) {
  const url = `${RA_BASE}/API_GetGame.php?z=${encodeURIComponent(username)}&y=${encodeURIComponent(apiKey)}&i=${gameId}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'WPS5-Launcher/1.0' } });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Construye la URL de un icono de logro de RA.
 */
function buildIconUrl(badgeName) {
  if (!badgeName) return '';
  return `https://media.retroachievements.org/Badge/${badgeName}.png`;
}

function buildLockedIconUrl(badgeName) {
  if (!badgeName) return '';
  return `https://media.retroachievements.org/Badge/${badgeName}_lock.png`;
}

/**
 * Normaliza la respuesta de RA al formato NormalizedSummary de WPS5.
 */
function normalizeProgress(gameData, gameId, consoleName) {
  const rarityCounts = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  const rawAchievements = gameData.Achievements
    ? Object.values(gameData.Achievements)
    : [];

  const achievements = rawAchievements.map((ach) => {
    const globalPct = (ach.NumAwardedHardcore && gameData.NumDistinctPlayersHardcore)
      ? (ach.NumAwardedHardcore / gameData.NumDistinctPlayersHardcore) * 100
      : null;

    const rarity = rarityFor(globalPct);

    const dateEarned = ach.DateEarned || ach.DateEarnedHardcore || null;
    const achieved = !!dateEarned;
    if (achieved) rarityCounts[rarity] = (rarityCounts[rarity] || 0) + 1;

    const unlockTime = dateEarned
      ? Math.floor(new Date(dateEarned).getTime() / 1000)
      : 0;

    const iconUrl     = buildIconUrl(ach.BadgeName);
    const lockedUrl   = buildLockedIconUrl(ach.BadgeName);

    return {
      // Campos para GameInfoPanel.tsx (mapeo que espera el frontend)
      id:             String(ach.ID),
      title:          ach.Title || 'Unknown',
      description:    ach.Description || '',
      badgeUrl:       iconUrl,
      badgeLockedUrl: lockedUrl,
      dateEarned:     dateEarned,
      // Campos legacy / adicionales
      apiName:        String(ach.ID),
      name:           ach.Title || 'Unknown',
      icon:           iconUrl,
      lockedIcon:     lockedUrl,
      achieved,
      unlockTime,
      globalPercentage: globalPct,
      rarity,
      points:    ach.Points || 0,
      trueRatio: ach.TrueRatio || 0,
    };
  });

  return {
    total: achievements.length,
    unlocked: achievements.filter((a) => a.achieved).length,
    rarityCounts,
    achievements,
    source: 'retroachievements',
    gameTitle: gameData.Title,
    gameId,
    consoleName: consoleName || gameData.ConsoleName,
    gameImageUrl: gameData.ImageIcon
      ? `https://media.retroachievements.org${gameData.ImageIcon}`
      : null,
  };
}

/**
 * Punto de entrada principal.
 *
 * @param {string}      gameTitle  - Título del juego como aparece en WPS5
 * @param {string|null} platform   - Plataforma (e.g. "ps2", "snes"), o null si se pasa consoleId
 * @param {string}      username   - Usuario de RetroAchievements
 * @param {string}      apiKey     - API Key de RetroAchievements
 * @param {number|null} [consoleId] - Console ID ya resuelto (omite resolución de platform)
 * @returns {Promise<object|null>} NormalizedSummary o null si no se encontró
 */
async function fetchRetroAchievements(gameTitle, platform, username, apiKey, consoleId) {
  if (!gameTitle || !apiKey) return null;

  const resolvedConsoleId = consoleId || resolveConsoleId(platform);
  if (!resolvedConsoleId) {
    console.warn(`[RetroAchievements] Plataforma no soportada: "${platform}"`);
    return null;
  }

  const normalizedTitle = normalizeTitle(gameTitle);
  console.log(`[RetroAchievements] Buscando "${normalizedTitle}" en consola ${resolvedConsoleId}`);

  // 1. Buscar el juego en RA
  let gameList;
  try {
    gameList = await fetchGameList(resolvedConsoleId, username || 'guest', apiKey);
  } catch (err) {
    console.error('[RetroAchievements] Error obteniendo lista de juegos:', err);
    return null;
  }

  if (!gameList || gameList.length === 0) {
    console.warn(`[RetroAchievements] No se encontraron juegos para la consola ${resolvedConsoleId}`);
    return null;
  }

  const matched = findBestMatch(normalizedTitle, gameList);
  if (!matched) {
    console.warn(`[RetroAchievements] No se encontró coincidencia para "${normalizedTitle}"`);
    return null;
  }

  const gameId = matched.ID || matched.id;
  console.log(`[RetroAchievements] Juego encontrado: "${matched.Title}" (ID: ${gameId})`);

  // 2. Obtener logros + progreso del usuario
  let gameData;
  try {
    if (username) {
      gameData = await fetchGameProgress(gameId, username, apiKey);
    } else {
      gameData = await fetchGameInfo(gameId, username || 'guest', apiKey);
    }
  } catch (err) {
    console.error('[RetroAchievements] Error obteniendo progreso del juego:', err);
    return null;
  }

  if (!gameData || !gameData.Achievements) {
    console.warn(`[RetroAchievements] Sin datos de logros para el juego ${gameId}`);
    return null;
  }

  return normalizeProgress(gameData, gameId, matched.ConsoleName);
}

module.exports = { fetchRetroAchievements, resolveConsoleId, PLATFORM_TO_CONSOLE_ID };
