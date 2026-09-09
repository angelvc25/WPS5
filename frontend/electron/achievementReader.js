'use strict';

/**
 * achievementReader.js
 *
 * Lógica portada de AchievementWatcher para leer logros de juegos externos
 * directamente desde el proceso principal de Electron (acceso a Node.js y FS).
 *
 * Fuentes soportadas:
 *  - Steam emuladores de fichero: Codex, Goldberg, EMPRESS, SKIDROW,
 *                                  SmartSteamEmu, CreamAPI, Reloaded/3DM
 *  - GreenLuma (Reborn / 2020) → registro de Windows
 *  - RPCS3 (PlayStation 3)     → TROPCONF.SFM + TROPUSR.DAT
 *
 * API pública:
 *  scanExternalAchievements(appId, steamApiKey, lang)
 *    → Promise<NormalizedSummary | null>
 *
 *  scanRpcs3Trophies(rpcs3Dir, appId)
 *    → Promise<NormalizedSummary | null>
 *
 *  resolveRpcs3GameFromLnk(lnkPath, rpcs3Dir)
 *    → Promise<{ gameId, npCommId, trophyDir } | null>
 *    Resuelve un .lnk de RPCS3 al NPcommID de trofeos buscando en dev_hdd0.
 *
 * NormalizedSummary = {
 *   total, unlocked,
 *   rarityCounts: { platinum, gold, silver, bronze },
 *   achievements: [{ apiName, name, description, icon, lockedIcon,
 *                    achieved, unlockTime, globalPercentage, rarity }]
 * }
 */

const fs      = require('fs');
const path    = require('path');
const { promisify } = require('util');
const parseXml = promisify(require('xml2js').parseString);

// xml2js sólo se usa para RPCS3; requiérelo de forma lazy para no romper
// si no está instalado en entornos que no usan RPCS3.
let _xml2js;
function getXml2js() {
  if (!_xml2js) {
    try { _xml2js = require('xml2js'); }
    catch { _xml2js = null; }
  }
  return _xml2js;
}

const glob    = require('fast-glob');
const { crc32 } = require('crc');
const { parse: parseIni } = require('@xan105/ini');
const regedit = require('regodit');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/** Convierte una ruta Windows a forward-slashes (requerido por fast-glob). */
const normPath = (p) => p.replace(/\\/g, '/');

/**
 * Obtiene el schema de logros de un juego Steam desde la Steam Web API.
 * Devuelve un array de { name, displayName, description, icon, icongray }
 * o [] si el juego no tiene logros / la key no es válida.
 */
async function fetchSteamSchema(appId, apiKey, lang = 'english') {
  try {
    const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${apiKey}&appid=${appId}&l=${lang}&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.game?.availableGameStats?.achievements ?? [];
  } catch {
    return [];
  }
}

/**
 * Construye la URL pública de un icono de logro Steam.
 * El schema devuelve URLs completas (https://steamcdn-a.akamaihd.net/...)
 * así que las devolvemos tal cual.
 */
function iconUrl(raw) {
  if (!raw) return '';
  if (raw.startsWith('http')) return raw;
  return `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${raw}`;
}

/**
 * Rareza en función del porcentaje global de jugadores que tienen el logro.
 * AchievementWatcher no proporciona este dato para juegos externos,
 * así que todos quedan en 'bronze'. La función existe para extensibilidad futura.
 */
function rarityFor(pct) {
  if (pct !== null && pct <= 1)  return 'platinum';
  if (pct !== null && pct <= 5)  return 'gold';
  if (pct !== null && pct <= 15) return 'silver';
  return 'bronze';
}

/**
 * Normaliza el array de logros del schema + estado desbloqueado del usuario
 * al formato común NormalizedSummary que consume GameInfoPanel.
 *
 * @param {Array}  schemaList  - array de logros del schema Steam
 * @param {Map}    unlockedMap - Map<string(upperCase), { achieved, unlockTime }>
 * @param {number} appId       - Steam AppID (para construir iconUrls si hiciera falta)
 */
function buildSummary(schemaList, unlockedMap, appId) {
  const rarityCounts = { platinum: 0, gold: 0, silver: 0, bronze: 0 };

  const achievements = schemaList.map((s) => {
    const key = (s.name || '').toUpperCase();
    const user = unlockedMap.get(key);
    const achieved = user?.achieved ?? false;
    const rarity   = rarityFor(null);
    if (achieved) rarityCounts[rarity]++;

    return {
      apiName:          s.name,
      name:             s.displayName || s.name,
      description:      s.description || '',
      icon:             iconUrl(s.icon),
      lockedIcon:       iconUrl(s.icongray || s.icon),
      achieved,
      unlockTime:       user?.unlockTime ?? 0,
      globalPercentage: null,
      rarity,
    };
  });

  return {
    total:       achievements.length,
    unlocked:    achievements.filter((a) => a.achieved).length,
    rarityCounts,
    achievements,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsers de archivos de logros (Steam emuladores)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Candidatos de nombre de archivo en orden de preferencia.
 * Portado directamente de AchievementWatcher/app/parser/steam.js
 */
const ACH_FILES = [
  'achievements.ini',
  'achievements.json',
  'achiev.ini',
  'stats.ini',
  'Achievements.Bin',
  'achieve.dat',
  'Achievements.ini',
  'stats/achievements.ini',
  'stats.bin',
  'stats/CreamAPI.Achievements.cfg',
];

const INI_TOP_LEVEL_FILTER = ['SteamAchievements', 'Steam64', 'Steam'];

/**
 * Parser del formato SmartSteamEmu (stats.bin).
 * Portado de AchievementWatcher/app/parser/sse.js
 */
function parseSseBin(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('ERR_INVALID_ARGS');
  const ENTRY_SIZE = 24;
  const header = buffer.slice(0, 4);
  const expectedCount = header.readInt32LE();
  const stats = [];
  const body = buffer.slice(4);
  for (let i = 0; i < body.length; i += ENTRY_SIZE) {
    stats.push(body.slice(i, i + ENTRY_SIZE));
  }
  if (stats.length !== expectedCount) throw new Error('ERR_UNEXPECTED_STATS_COUNT');

  const result = [];
  for (const chunk of stats) {
    try {
      const value = chunk.slice(20, 24).readInt32LE();
      if (value > 1) continue; // stat puro, no logro
      result.push({
        crc:        chunk.slice(0, 4).reverse().toString('hex'),
        Achieved:   value,
        UnlockTime: chunk.slice(8, 12).readInt32LE(),
      });
    } catch { continue; }
  }
  return result;
}

/**
 * Lee el archivo de logros de un directorio de emulador Steam y devuelve
 * un Map<string(upperCase apiName), { achieved, unlockTime }>.
 *
 * Portado de AchievementWatcher/app/parser/steam.js → getAchievementsFromFile
 * + la lógica de merging de achievements.js
 */
async function parseAchievementsFromDir(dirPath, schemaList) {
  // Construir lookup CRC → apiName para SmartSteamEmu
  const crcToName = new Map();
  for (const s of schemaList) {
    const hex = crc32(Buffer.from(s.name)).toString(16).toLowerCase();
    crcToName.set(hex, s.name);
  }

  let raw = null;

  for (const filename of ACH_FILES) {
    const fullPath = path.join(dirPath, filename);
    if (!fs.existsSync(fullPath)) continue;
    try {
      if (filename.endsWith('.json')) {
        raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } else if (filename === 'stats.bin') {
        raw = parseSseBin(fs.readFileSync(fullPath));
      } else {
        raw = parseIni(fs.readFileSync(fullPath, 'utf8'));
      }
      break;
    } catch { continue; }
  }

  if (!raw) return null;

  // ── Normalizar los distintos formatos a { apiName → { achieved, unlockTime } } ──
  const result = new Map(); // Map<upperCaseName, { achieved, unlockTime }>

  const addEntry = (apiName, achieved, unlockTime) => {
    const key = apiName.toUpperCase();
    const prev = result.get(key);
    if (!prev || (achieved && !prev.achieved)) {
      result.set(key, { achieved, unlockTime: unlockTime || 0 });
    }
  };

  // Caso: Hoodlum / DARKSiDERS — dos secciones separadas
  if (raw.AchievementsUnlockTimes && raw.Achievements) {
    for (const name of Object.keys(raw.Achievements)) {
      if (raw.Achievements[name] == 1) {
        addEntry(name, true, raw.AchievementsUnlockTimes[name] || 0);
      } else {
        addEntry(name, false, 0);
      }
    }
    return result;
  }

  // Caso: 3DM — State + Time en hex
  if (raw.State && raw.Time) {
    for (const name of Object.keys(raw.State)) {
      if (raw.State[name] === '0101') {
        const timeBuf = Buffer.from(raw.Time[name].toString(), 'hex');
        const unlockTime = timeBuf.length >= 4
          ? new DataView(timeBuf.buffer, timeBuf.byteOffset).getUint32(0, true)
          : 0;
        addEntry(name, true, unlockTime);
      }
    }
    return result;
  }

  // Caso: SmartSteamEmu (array con .crc)
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry.crc) {
        const crcHex = entry.crc.toLowerCase();
        const apiName = crcToName.get(crcHex);
        if (apiName) {
          addEntry(apiName, entry.Achieved === 1, entry.UnlockTime || 0);
        }
      }
    }
    return result;
  }

  // Caso general: objeto plano posiblemente con secciones
  const flat = raw.ACHIEVE_DATA || raw;
  const filtered = {};
  for (const k of Object.keys(flat)) {
    if (!INI_TOP_LEVEL_FILTER.includes(k)) filtered[k] = flat[k];
  }

  for (const [name, val] of Object.entries(filtered)) {
    if (typeof val === 'object' && val !== null) {
      // RLD! — valores en hex little-endian
      let achieved = false;
      let unlockTime = 0;
      if (val.State !== undefined) {
        try {
          const stateBuf = Buffer.from(val.State.toString(), 'hex');
          const stateVal = new DataView(stateBuf.buffer, stateBuf.byteOffset).getUint32(0, true);
          achieved = stateVal === 1;
          if (val.Time !== undefined) {
            const timeBuf = Buffer.from(val.Time.toString(), 'hex');
            unlockTime = new DataView(timeBuf.buffer, timeBuf.byteOffset).getUint32(0, true);
          }
          // CODEX Gears5 edge case: CurProgress == MaxProgress && both nonzero
          if (!achieved && val.CurProgress && val.MaxProgress) {
            try {
              const cpBuf = Buffer.from(val.CurProgress.toString(), 'hex');
              const mpBuf = Buffer.from(val.MaxProgress.toString(), 'hex');
              const cp = new DataView(cpBuf.buffer, cpBuf.byteOffset).getUint32(0, true);
              const mp = new DataView(mpBuf.buffer, mpBuf.byteOffset).getUint32(0, true);
              if (cp > 0 && mp > 0 && cp === mp) achieved = true;
            } catch { /**/ }
          }
        } catch { /**/ }
      } else {
        // Formato estándar Codex / Goldberg / CreamAPI
        achieved =
          val.Achieved == 1 || val.achieved == 1 ||
          val.HaveAchieved == 1 || val.Unlocked == 1 ||
          val.earned == true || val.earned === 'true';

        unlockTime =
          Number(val.UnlockTime || val.unlocktime || val.HaveAchievedTime ||
                 val.HaveHaveAchievedTime || val.Time || val.earned_time || 0);

        // CreamAPI: timestamp incompleto de 7 dígitos
        if (val.unlocktime && String(val.unlocktime).length === 7) {
          unlockTime = Number(val.unlocktime) * 1000;
        }

        // CODEX Gears5 edge case (sin State hex)
        if (!achieved && val.CurProgress && val.MaxProgress) {
          const cp = Number(val.CurProgress);
          const mp = Number(val.MaxProgress);
          if (cp > 0 && mp > 0 && cp === mp) achieved = true;
        }
      }
      addEntry(name, achieved, unlockTime);
    } else {
      // Goldberg simplificado: "ACH_NAME" = "1"
      addEntry(name, val === '1' || val === 1 || val === true, 0);
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan de carpetas de emuladores Steam (fichero)
// ─────────────────────────────────────────────────────────────────────────────

/** Rutas base de cada emulador, con su etiqueta de fuente. */
function getEmulatorSearchPaths() {
  const pub    = process.env.PUBLIC || process.env.Public || 'C:\\Users\\Public';
  const appdata  = process.env.APPDATA    || '';
  const local    = process.env.LOCALAPPDATA || '';
  const progdata = process.env.PROGRAMDATA || 'C:\\ProgramData';

  return [
    { base: path.join(pub,    'Documents', 'Steam', 'CODEX'),          source: 'Codex' },
    { base: path.join(appdata,'Goldberg SteamEmu Saves'),               source: 'Goldberg' },
    { base: path.join(appdata,'EMPRESS'),                               source: 'Goldberg (EMPRESS)', empressStyle: true },
    { base: path.join(pub,    'Documents', 'EMPRESS'),                  source: 'Goldberg (EMPRESS)', empressStyle: true },
    { base: path.join(appdata,'Steam', 'CODEX'),                        source: 'Codex' },
    { base: path.join(progdata,'Steam'),                                source: 'Reloaded - 3DM' },
    { base: path.join(local,  'SKIDROW'),                               source: 'Skidrow' },
    { base: path.join(appdata,'SmartSteamEmu'),                         source: 'SmartSteamEmu' },
    { base: path.join(appdata,'CreamAPI'),                              source: 'CreamAPI' },
  ];
}

/**
 * Busca la carpeta de logros de un appId concreto en todas las rutas de emuladores.
 * Devuelve { dirPath, source } del primero que encuentre, o null.
 */
async function findEmulatorDir(appId) {
  const strId = String(appId);

  for (const { base, source, empressStyle } of getEmulatorSearchPaths()) {
    if (!fs.existsSync(base)) continue;

    // EMPRESS almacena los logros en <base>/<appId>/remote/<appId>/
    const candidatePath = empressStyle
      ? path.join(base, strId, 'remote', strId)
      : path.join(base, strId);

    if (fs.existsSync(candidatePath)) {
      return { dirPath: candidatePath, source };
    }
  }

  // Además, buscar en subcarpetas de ProgramData/Steam que siguen el patrón */<appId>
  const progdata = process.env.PROGRAMDATA || 'C:\\ProgramData';
  const pdSteam  = path.join(progdata, 'Steam');
  if (fs.existsSync(pdSteam)) {
    try {
      const pattern = normPath(path.join(pdSteam, '*', strId));
      const matches = await glob(pattern, { onlyDirectories: true, absolute: true });
      if (matches.length > 0) {
        return { dirPath: matches[0].replace(/\//g, '\\'), source: 'Reloaded - 3DM' };
      }
    } catch { /**/ }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GreenLuma (logros en registro)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee los logros de GreenLuma Reborn / 2020 desde el registro de Windows.
 * Portado de AchievementWatcher/app/parser/greenluma.js
 *
 * @returns {Map<string, {achieved, unlockTime}> | null}
 */
async function readGreenLumaAchievements(appId) {
  const strId = String(appId);
  const variants = [
    { root: 'HKCU', key: `SOFTWARE/GLR/AppID/${strId}`, skipKey: 'SkipStatsAndAchievements', achPath: `SOFTWARE/GLR/AppID/${strId}/Achievements` },
    { root: 'HKCU', key: `SOFTWARE/GL2020/AppID/${strId}`, skipKey: 'SkipStatsAndAchievements', achPath: `SOFTWARE/GL2020/AppID/${strId}/Achievements` },
  ];

  for (const v of variants) {
    try {
      if (!regedit.regKeyExists(v.root, v.key)) continue;
      const skip = parseInt(await regedit.promises.regQueryIntegerValue(v.root, v.key, v.skipKey) || '1');
      if (skip !== 0) continue;

      const valueNames = await regedit.promises.regListAllValues(v.root, v.achPath);
      if (!valueNames || valueNames.length === 0) continue;

      const result = new Map();
      for (const name of valueNames) {
        if (name.endsWith('_Time')) continue;
        const achieved   = parseInt(await regedit.promises.regQueryIntegerValue(v.root, v.achPath, name) || '0') === 1;
        const unlockTime = parseInt(await regedit.promises.regQueryIntegerValue(v.root, v.achPath, name + '_Time') || '0');
        result.set(name.toUpperCase(), { achieved, unlockTime });
      }
      return result;
    } catch { continue; }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública: logros externos (Steam emuladores + GreenLuma)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Punto de entrada principal para logros de juegos externos con AppID Steam.
 *
 * 1. Obtiene el schema de la Steam Web API (nombres, iconos, descripciones).
 * 2. Busca en disco / registro si hay datos de usuario (emuladores).
 * 3. Devuelve un NormalizedSummary o null si no se encuentran datos.
 *
 * @param {number|string} appId
 * @param {string}        steamApiKey
 * @param {string}        [lang='english']
 * @returns {Promise<object|null>}
 */
async function scanExternalAchievements(appId, steamApiKey, lang = 'english') {
  const numId = Number(appId);

  // 1. Schema de logros (Steam API) — necesario para tener nombres e iconos
  const schemaList = await fetchSteamSchema(numId, steamApiKey, lang);
  if (!schemaList || schemaList.length === 0) return null;

  let unlockedMap = null;
  let source      = null;

  // 2a. Buscar en carpetas de emuladores de fichero
  const emulatorInfo = await findEmulatorDir(numId);
  if (emulatorInfo) {
    try {
      unlockedMap = await parseAchievementsFromDir(emulatorInfo.dirPath, schemaList);
      source = emulatorInfo.source;
    } catch (err) {
      console.warn(`[AchievementReader] Error parseando ${emulatorInfo.source}:`, err);
    }
  }

  // 2b. Si no encontramos en disco, intentar GreenLuma
  if (!unlockedMap) {
    try {
      unlockedMap = await readGreenLumaAchievements(numId);
      if (unlockedMap) source = 'GreenLuma';
    } catch (err) {
      console.warn('[AchievementReader] Error leyendo GreenLuma:', err);
    }
  }

  // Si no hay datos de usuario, devolvemos el schema completo con todo bloqueado
  // para que el usuario pueda ver qué logros existen.
  if (!unlockedMap) {
    unlockedMap = new Map();
    source = 'schema-only';
  }

  const summary = buildSummary(schemaList, unlockedMap, numId);
  summary.source = source;
  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública: trofeos RPCS3
// ─────────────────────────────────────────────────────────────────────────────

// Constantes del formato binario TROPUSR.DAT (portado de rpcs3.js)
const TROP_MAGIC     = Buffer.from('818F54AD', 'hex');
const TROP_DELIMITERS = [
  Buffer.from('0400000050', 'hex'),
  Buffer.from('0600000060', 'hex'),
];

function indexOfAny(buffer, values, offset = 0) {
  for (const v of values) {
    const pos = buffer.indexOf(v, offset);
    if (pos > -1) return { pos, len: v.length };
  }
  return { pos: -1, len: 0 };
}

function indexOfNthOccurrence(buffer, search, n) {
  let i = -1;
  while (n-- && i++ < buffer.length) {
    i = buffer.indexOf(search, i);
    if (i < 0) break;
  }
  return i;
}

function bufferSplit(buffer, separators) {
  const result = [];
  let pos   = -1;
  let prev  = 0;
  while (pos++ < buffer.length) {
    const found = indexOfAny(buffer, separators, pos);
    pos = found.pos > 0 ? found.pos : buffer.length;
    result.push(buffer.slice(prev, pos));
    prev = pos + found.len;
  }
  return result;
}

/**
 * Escanea una instalación de RPCS3 y devuelve los trofeos de un juego.
 *
 * @param {string} rpcs3Dir  - Carpeta raíz de RPCS3 (contiene rpcs3.exe y dev_hdd0/)
 * @param {string} npCommId  - NPcommID del juego (ej. "NPWR00001-A")
 * @returns {Promise<object|null>} NormalizedSummary con rarity real (P/G/S/B)
 */
async function scanRpcs3Trophies(rpcs3Dir, npCommId) {
  const xmlLib = getXml2js();
  if (!xmlLib) {
    console.warn('[AchievementReader] xml2js no disponible; instala: npm install xml2js');
    return null;
  }

  // Localizar la carpeta del juego: dev_hdd0/home/<user>/trophy/<npCommId>
  const trophyBase = path.join(rpcs3Dir, 'dev_hdd0', 'home');
  if (!fs.existsSync(trophyBase)) return null;

  let trophyDir = null;
  try {
    const users = fs.readdirSync(trophyBase).filter((u) => /^\d+$/.test(u));
    for (const user of users) {
      const candidate = path.join(trophyBase, user, 'trophy', npCommId);
      if (fs.existsSync(candidate)) {
        trophyDir = candidate;
        break;
      }
    }
  } catch { return null; }

  if (!trophyDir) return null;

  // Leer schema (TROPCONF.SFM — XML)
  const schemaPath = path.join(trophyDir, 'TROPCONF.SFM');
  if (!fs.existsSync(schemaPath)) return null;

  let schema;
  try {
    const xml = fs.readFileSync(schemaPath, 'utf-8');
    schema = await promisify(xmlLib.parseString)(xml, {
      explicitArray: false,
      explicitRoot:  false,
      ignoreAttrs:   false,
      emptyTag:      null,
    });
  } catch { return null; }

  const trophies = Array.isArray(schema.trophy) ? schema.trophy : [schema.trophy];

  // Leer estado de desbloqueo (TROPUSR.DAT — binario)
  const userDataPath = path.join(trophyDir, 'TROPUSR.DAT');
  const unlockedById = new Map(); // Map<id(number), { achieved, unlockTime }>

  if (fs.existsSync(userDataPath)) {
    try {
      const buffer = fs.readFileSync(userDataPath);
      if (buffer.slice(0, TROP_MAGIC.length).equals(TROP_MAGIC)) {
        const headerEndPos =
          indexOfNthOccurrence(buffer, TROP_DELIMITERS[0], 2) + TROP_DELIMITERS[0].length;
        const data  = buffer.slice(headerEndPos);
        const stats = bufferSplit(data, TROP_DELIMITERS);

        if (stats.length % 2 === 0) {
          const half = stats.length / 2;
          for (let i = 0; i < half; i++) {
            try {
              const tsBuf = stats[i].slice(16, 20);
              const valBuf = stats[i + half].slice(12, 16);
              const id        = stats[i].slice(0, 4).readInt32BE();
              const unlockTime = tsBuf.equals(Buffer.from('ffffffff', 'hex'))
                ? 0
                : tsBuf.readInt32BE();
              const achieved   = valBuf.readInt32BE() === 1;
              unlockedById.set(id, { achieved, unlockTime });
            } catch { continue; }
          }
        }
      }
    } catch (err) {
      console.warn('[AchievementReader] Error parseando TROPUSR.DAT:', err);
    }
  }

  // Mapear tipo RPCS3 a rarity
  const rpcs3TypeToRarity = (t) => {
    switch ((t || '').toUpperCase()) {
      case 'P': return 'platinum';
      case 'G': return 'gold';
      case 'S': return 'silver';
      default:  return 'bronze';
    }
  };

  const rarityCounts = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  const achievements = trophies.map((t) => {
    const id       = parseInt(t?.$ ?.id ?? '0', 10);
    const rarity   = rpcs3TypeToRarity(t?.$ ?.ttype);
    const userData = unlockedById.get(id);
    const achieved = userData?.achieved ?? false;
    if (achieved) rarityCounts[rarity]++;

    const iconFile = path.join(trophyDir, `TROP${String(id).padStart(3, '0')}.PNG`);
    const iconUri  = fs.existsSync(iconFile)
      ? `local-file:///${iconFile.replace(/\\/g, '/')}`
      : '';

    return {
      apiName:          String(id),
      name:             t.name  ?? `Trophy ${id}`,
      description:      t.detail ?? '',
      icon:             iconUri,
      lockedIcon:       iconUri,
      achieved,
      unlockTime:       userData?.unlockTime ?? 0,
      globalPercentage: null,
      rarity,
    };
  });

  return {
    total:       achievements.length,
    unlocked:    achievements.filter((a) => a.achieved).length,
    rarityCounts,
    achievements,
    source:      'rpcs3',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolución de .lnk de RPCS3 → NPcommID de trofeos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrae el Game ID de PS3 buscando el patrón RPCS3_GAMEID directamente
 * en los bytes del archivo .lnk (funciona con cualquier formato de .lnk,
 * incluyendo los generados por ES-DE que mezclan target+args en una sola cadena).
 *
 * @param {string} lnkPath - Ruta al .lnk
 * @returns {string|null} Game ID (ej. "BLES00231") o null
 */
function extractGameIdFromLnkBytes(lnkPath) {
  try {
    const buf = fs.readFileSync(lnkPath);

    // Buscar el patrón en UTF-16 LE (Windows usa UTF-16 para .lnk)
    const searchUtf16 = Buffer.from('%RPCS3_GAMEID%:', 'utf16le');
    let idx = buf.indexOf(searchUtf16);
    if (idx !== -1) {
      // Leer los siguientes 10 bytes como UTF-16 (5 chars = formato XXXXXNNNNN)
      const idStart = idx + searchUtf16.length;
      const idStr = buf.toString('utf16le', idStart, idStart + 20).replace(/\0/g, '');
      const m = idStr.match(/^([A-Z]{4}\d{5})/i);
      if (m) return m[1].toUpperCase();
    }

    // Buscar también en ASCII/Latin1 (algunos .lnk usan codificación mixta)
    const searchAscii = '%RPCS3_GAMEID%:';
    const asciiStr = buf.toString('latin1');
    const asciiIdx = asciiStr.indexOf(searchAscii);
    if (asciiIdx !== -1) {
      const after = asciiStr.slice(asciiIdx + searchAscii.length, asciiIdx + searchAscii.length + 15);
      const m = after.match(/^([A-Z]{4}\d{5})/i);
      if (m) return m[1].toUpperCase();
    }

    // Fallback: buscar cualquier Game ID XXXX#####  precedido de ":" en el fichero binario
    // (por si el formato varía entre versiones de ES-DE o RPCS3)
    const allText = buf.toString('utf16le');
    const m2 = allText.match(/:([A-Z]{4}\d{5})["]/i);
    if (m2) return m2[1].toUpperCase();

  } catch { /* ignore */ }
  return null;
}

/**
 * Extrae el Game ID de un PARAM.SFO (formato binario Sony).
 * Busca la clave "TITLE_ID" en la estructura del archivo.
 *
 * @param {string} paramSfoPath - Ruta completa al PARAM.SFO
 * @returns {string|null}
 */
function extractGameIdFromParamSfo(paramSfoPath) {
  try {
    const buf = fs.readFileSync(paramSfoPath);
    // Magic header de PARAM.SFO: 0x00PSF
    if (buf.length < 20) return null;
    const magic = buf.readUInt32LE(0);
    if (magic !== 0x46535000) return null; // "\x00PSF" en little-endian

    const keyTableOffset = buf.readUInt32LE(8);
    const dataTableOffset = buf.readUInt32LE(12);
    const numEntries = buf.readUInt32LE(16);

    for (let i = 0; i < numEntries; i++) {
      const entryBase = 20 + i * 16;
      if (entryBase + 16 > buf.length) break;

      const keyOffset = buf.readUInt16LE(entryBase);
      const dataOffset = buf.readUInt32LE(entryBase + 8);
      const dataLength = buf.readUInt32LE(entryBase + 12);

      const keyStart = keyTableOffset + keyOffset;
      let keyEnd = keyStart;
      while (keyEnd < buf.length && buf[keyEnd] !== 0) keyEnd++;
      const key = buf.toString('ascii', keyStart, keyEnd);

      if (key === 'TITLE_ID') {
        const valStart = dataTableOffset + dataOffset;
        const val = buf.toString('ascii', valStart, valStart + dataLength).replace(/\0/g, '').trim();
        return val || null;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Dado un Game ID de PS3 (ej. "BCES00510"), busca en dev_hdd0/home/<user>/trophy/
 * qué NPcommID de trofeos corresponde leyendo el campo npcommid del TROPCONF.SFM.
 *
 * @param {string} rpcs3Dir  - Carpeta raíz de RPCS3
 * @param {string} gameId    - Game ID (ej. "BCES00510")
 * @returns {Promise<{npCommId: string, trophyDir: string}|null>}
 */
async function findNpCommIdByGameId(rpcs3Dir, gameId) {
  const xmlLib = getXml2js();
  if (!xmlLib) return null;

  const homeDir = path.join(rpcs3Dir, 'dev_hdd0', 'home');
  if (!fs.existsSync(homeDir)) return null;

  let users;
  try {
    users = fs.readdirSync(homeDir).filter((u) => /^\d+$/.test(u));
  } catch { return null; }

  for (const user of users) {
    const trophyBase = path.join(homeDir, user, 'trophy');
    if (!fs.existsSync(trophyBase)) continue;

    let trophyDirs;
    try {
      trophyDirs = fs.readdirSync(trophyBase);
    } catch { continue; }

    for (const tDir of trophyDirs) {
      const confPath = path.join(trophyBase, tDir, 'TROPCONF.SFM');
      if (!fs.existsSync(confPath)) continue;

      try {
        const xml = fs.readFileSync(confPath, 'utf-8');
        const parsed = await promisify(xmlLib.parseString)(xml, {
          explicitArray: false,
          explicitRoot:  false,
          ignoreAttrs:   false,
          emptyTag:      null,
        });

        // El campo <npcommid> en TROPCONF.SFM almacena el NPcommID,
        // y también hay un campo que relaciona con el GameID del disco.
        // Estrategia 1: el nombre de la carpeta del trofeo empieza con el GameID
        //   BCES00510 → trophy/NPWR01234_00 (el TROPCONF tiene <npcommid>NPWR01234_00)
        // Estrategia 2: el campo <title-name> o el gameID en TROPCONF
        const npCommId = parsed?.npcommid || parsed?.['npcommid'] || tDir;

        // Comprobar si este trofeo pertenece al juego buscado.
        // El campo <title-id> o <param-id> del TROPCONF a veces contiene el GameID.
        // Como fallback, verificamos si el GameID existe en dev_hdd0/game/
        // y comparamos con los metadatos del PARAM.SFO del juego.
        const gameParamSfo = path.join(rpcs3Dir, 'dev_hdd0', 'game', gameId, 'PARAM.SFO');
        if (fs.existsSync(gameParamSfo)) {
          // El PARAM.SFO del juego tiene TITLE_ID = GameID y a veces NP_COMMUNICATION_ID
          const buf = fs.readFileSync(gameParamSfo);
          const magic = buf.length >= 4 ? buf.readUInt32LE(0) : 0;

          if (magic === 0x46535000) {
            const keyTableOffset  = buf.readUInt32LE(8);
            const dataTableOffset = buf.readUInt32LE(12);
            const numEntries      = buf.readUInt32LE(16);
            const fields = {};

            for (let i = 0; i < numEntries; i++) {
              const entryBase = 20 + i * 16;
              if (entryBase + 16 > buf.length) break;
              const keyOff  = buf.readUInt16LE(entryBase);
              const dataOff = buf.readUInt32LE(entryBase + 8);
              const dataLen = buf.readUInt32LE(entryBase + 12);
              const ks = keyTableOffset + keyOff;
              let ke = ks;
              while (ke < buf.length && buf[ke] !== 0) ke++;
              const key = buf.toString('ascii', ks, ke);
              const vs = dataTableOffset + dataOff;
              fields[key] = buf.toString('ascii', vs, vs + dataLen).replace(/\0/g, '').trim();
            }

            // NP_COMMUNICATION_ID en el PARAM.SFO del juego coincide con el
            // npcommid del TROPCONF (sin el sufijo "_00").
            const npComm = fields['NP_COMMUNICATION_ID'] || '';
            const npCommIdBase = npCommId.replace(/_\d+$/, '');

            if (npComm && (npComm === npCommIdBase || npComm === npCommId)) {
              return { npCommId, trophyDir: path.join(trophyBase, tDir) };
            }

            // Si el PARAM.SFO del juego no tiene NP_COMMUNICATION_ID,
            // usamos el TITLE_ID del TROPCONF como señal.
            if (!npComm) {
              // Intento: verificar si el TROPCONF menciona el gameId directamente
              const confStr = xml.toUpperCase();
              if (confStr.includes(gameId.toUpperCase())) {
                return { npCommId, trophyDir: path.join(trophyBase, tDir) };
              }
            }
          }
        }

        // Fallback: si no encontramos PARAM.SFO del juego, buscar por el
        // contenido del TROPCONF que mencione el GameID.
        const confStr = xml.toUpperCase();
        if (confStr.includes(gameId.toUpperCase())) {
          return { npCommId, trophyDir: path.join(trophyBase, tDir) };
        }

      } catch { continue; }
    }
  }

  return null;
}

/**
 * Punto de entrada para resolver un .lnk de RPCS3 y obtener los trofeos.
 *
 * Flujo:
 *  1. Lee el .lnk para extraer los argumentos → GameID ("BCES00510")
 *  2. Busca en dev_hdd0/home/<user>/trophy/ el NPcommID correspondiente
 *  3. Llama a scanRpcs3Trophies con el NPcommID encontrado
 *
 * @param {string} lnkPath   - Ruta al .lnk del juego PS3
 * @param {string} rpcs3Dir  - Carpeta raíz de RPCS3 configurada por el usuario
 * @returns {Promise<NormalizedSummary|null>}
 */
async function resolveRpcs3GameFromLnk(lnkPath, rpcs3Dir) {
  if (!lnkPath || !rpcs3Dir) return null;
  if (!fs.existsSync(lnkPath) || !fs.existsSync(rpcs3Dir)) return null;

  // Extraer el GameID directamente de los bytes del .lnk
  // (más fiable que WScript.Shell o parseo del StringData header para .lnk de ES-DE)
  let gameId = extractGameIdFromLnkBytes(lnkPath);

  // Fallback 1: intentar con shell.readShortcutLink de Electron
  if (!gameId) {
    try {
      const { shell: electronShell } = require('electron');
      if (typeof electronShell?.readShortcutLink === 'function') {
        const info = electronShell.readShortcutLink(lnkPath);
        const args = info?.args || info?.arguments || '';
        const m = args.match(/%RPCS3_GAMEID%:([A-Z]{4}\d{5})/i)
               || args.match(/\b([A-Z]{4}\d{5})\b/i);
        if (m) gameId = m[1].toUpperCase();
      }
    } catch { /* ignore */ }
  }

  // Fallback 2: nombre del .lnk con formato "Juego [BCES00510].lnk"
  if (!gameId) {
    const nameMatch = path.basename(lnkPath).match(/\[([A-Z]{4}\d{5})\]/i);
    if (nameMatch) gameId = nameMatch[1].toUpperCase();
  }

  if (!gameId) {
    console.warn('[AchievementReader] No se pudo extraer el GameID del .lnk:', lnkPath);
    return null;
  }

  console.log(`[AchievementReader] GameID extraído: ${gameId} de ${path.basename(lnkPath)}`);

  // Buscar el NPcommID de trofeos en dev_hdd0
  const found = await findNpCommIdByGameId(rpcs3Dir, gameId);
  if (!found) {
    console.warn(`[AchievementReader] No se encontró NPcommID para GameID=${gameId} en ${rpcs3Dir}`);
    return null;
  }

  console.log(`[AchievementReader] NPcommID encontrado: ${found.npCommId}`);
  return scanRpcs3Trophies(rpcs3Dir, found.npCommId);
}

module.exports = { scanExternalAchievements, scanRpcs3Trophies, resolveRpcs3GameFromLnk };
