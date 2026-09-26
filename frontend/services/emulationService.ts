/**
 * Catálogo de consolas emulables + envoltorios IPC para detección de
 * ejecutables, carpetas de BIOS y escaneo de ROMs.
 */
import { resolveFieldSyncPreferences } from './metadataPreferences';
import {
  fetchIgdbFieldData,
  fetchPsnFieldData,
  fetchRawgFieldData,
  fetchSteamFieldData,
} from './metadataFields';
import { isPsnEligiblePlatform } from './psnMetadataService';
import { fetchSteamGridData } from './steamGridService';

export type EmulatorId = 'ps1' | 'ps2' | 'ps3' | 'psp' | 'gcwii' | 'retroarch';

export interface EmulatorDef {
  id: EmulatorId;
  /** Nombre de la consola para la UI. */
  name: string;
  /** Nombre del emulador para la UI. */
  emulatorName: string;
  /** Nombres de ejecutable a buscar (minúsculas). */
  exeNames: string[];
  /** Extensiones de ROM (minúsculas, con punto). */
  romExtensions: string[];
  /** Nombres de archivo especiales que también cuentan como juego (ej. EBOOT.BIN). */
  specialFiles?: string[];
  /** Patrones de BIOS (subcadenas en minúsculas). Vacío = no requiere BIOS. */
  biosPatterns?: string[];
  /** Plataforma con la que se dan de alta los juegos. */
  platform: string;
  /** retroSystem fijo (si aplica). */
  retroSystem?: string;
  /** retroSystem según la extensión (ej. GameCube vs Wii). */
  retroSystemByExt?: Record<string, string>;
  /** Argumentos de lanzamiento para una ROM. */
  launchArgs: (romPath: string) => string;
  /** URL oficial de descarga. */
  downloadUrl: string;
  /** Imagen de la consola (require de assets). */
  image: any;
}

export const EMULATORS: EmulatorDef[] = [
  {
    id: 'ps1',
    name: 'PlayStation 1',
    emulatorName: 'DuckStation',
    exeNames: ['duckstation-qt-x64-releaseltcg.exe', 'duckstation-qt.exe', 'duckstation.exe'],
    romExtensions: ['.cue', '.bin', '.chd', '.iso', '.pbp', '.m3u', '.ecm', '.img', '.ccd', '.mdf', '.mds', '.nrg', '.toc', '.cbn'],
    biosPatterns: ['scph1001', 'scph5500', 'scph5501', 'scph5502'],
    platform: 'PS1',
    launchArgs: (rom) => `-batch -fullscreen "${rom}"`,
    downloadUrl: 'https://www.duckstation.org/',
  image: require('@/assets/images/consolas/psx.png'),
  },
  {
    id: 'ps2',
    name: 'PlayStation 2',
    emulatorName: 'PCSX2',
    exeNames: ['pcsx2-qt.exe', 'pcsx2.exe', 'pcsx2-qt-x64.exe'],
    romExtensions: ['.iso', '.chd', '.cso', '.bin', '.img', '.mdf', '.nrg', '.m2ts', '.gz', '.elf'],
    biosPatterns: ['scph', 'rom1.bin', 'rom2.bin', 'erom.bin'],
    platform: 'PS2',
    launchArgs: (rom) => `-batch -fullscreen "${rom}"`,
    downloadUrl: 'https://pcsx2.net/',
  image: require('@/assets/images/consolas/ps2.png'),
  },
  {
    id: 'ps3',
    name: 'PlayStation 3',
    emulatorName: 'RPCS3',
    exeNames: ['rpcs3.exe'],
    romExtensions: ['.iso'],
    specialFiles: ['eboot.bin'],
    platform: 'PS3',
    launchArgs: (rom) => `"${rom}"`,
    downloadUrl: 'https://rpcs3.net/',
  image: require('@/assets/images/consolas/ps3.png'),
  },
  {
    id: 'psp',
    name: 'PlayStation Portable',
    emulatorName: 'PPSSPP',
    exeNames: ['ppssppwindows64.exe', 'ppssppwindows.exe', 'ppsspp.exe'],
    romExtensions: ['.iso', '.cso', '.pbp', '.elf', '.prx'],
    platform: 'Retro',
    retroSystem: 'PSP',
    launchArgs: (rom) => `"${rom}"`,
    downloadUrl: 'https://www.ppsspp.org/',
  image: require('@/assets/images/consolas/psp.png'),
  },
  {
    id: 'gcwii',
    name: 'GameCube & Wii',
    emulatorName: 'Dolphin',
    exeNames: ['dolphin.exe'],
    romExtensions: ['.iso', '.gcm', '.rvz', '.wbfs', '.wad', '.ciso', '.gcz', '.tgc', '.dff', '.dol'],
    platform: 'Retro',
    retroSystemByExt: { '.rvz': 'WII', '.wbfs': 'WII', '.wad': 'WII', '.iso': 'GC', '.gcm': 'GC', '.ciso': 'GC', '.gcz': 'GC' },
    launchArgs: (rom) => `-e -b "${rom}"`,
    downloadUrl: 'https://dolphin-emu.org/',
  image: require('@/assets/images/consolas/Wii-Console.png'),
  },
  {
    id: 'retroarch',
    name: 'RetroArch',
    emulatorName: 'RetroArch',
    exeNames: ['retroarch.exe'],
    romExtensions: [
      '.nes', '.fds', '.snes', '.smc', '.sfc', '.n64', '.z64', '.v64',
      '.gb', '.gbc', '.gba', '.nds', '.3ds',
      '.smd', '.gen', '.md', '.32x', '.gg', '.sms', '.sg',
      '.cue', '.bin', '.chd', '.iso', '.pbp', '.pce', '.ws', '.wsc',
    ],
    platform: 'Retro',
    launchArgs: (rom) => `-f "${rom}"`,
    downloadUrl: 'https://www.retroarch.com/',
  image: require('@/assets/images/consolas/retroarch.png'),
  },
];

export interface EmulatorConfig {
  exePath: string | null;
  biosPath: string | null;
  biosDetected: boolean;
  romPaths: string[];
  gameCount: number;
  lastScanAt: number | null;
  addedPaths: string[];
  /** Stats por carpeta de ROMs (ruta → conteo/tamaño/fecha). */
  romFolderStats?: Record<string, RomFolderStat>;
  /** Últimas ROMs detectadas (para la pestaña Biblioteca). */
  roms?: StoredRom[];
}

export interface RomFolderStat {
  count: number;
  scannedAt: number | null;
  sizeBytes: number;
}

export interface StoredRom {
  name: string;
  path: string;
  size: number;
}

export const emptyEmulatorConfig = (): EmulatorConfig => ({
  exePath: null,
  biosPath: null,
  biosDetected: false,
  romPaths: [],
  gameCount: 0,
  lastScanAt: null,
  addedPaths: [],
});

export const isEmulatorReady = (config?: EmulatorConfig | null): boolean =>
  !!config?.exePath;

export interface ScannedRom {
  name: string;
  path: string;
  extension: string;
  size: number;
}

const api = () => (typeof window !== 'undefined' ? (window as any).electronAPI : undefined);

/** Busca el ejecutable del emulador en rutas comunes + programas instalados. */
export async function detectEmulatorExe(def: EmulatorDef): Promise<string | null> {
  try {
    const res = await api()?.detectEmulatorExe?.(def.exeNames);
    return typeof res === 'string' && res ? res : null;
  } catch {
    return null;
  }
}

/** Diálogo para elegir el .exe del emulador. */
export async function pickEmulatorExe(): Promise<string | null> {
  try {
    const res = await api()?.selectFile?.();
    return typeof res === 'string' && res ? res : null;
  } catch {
    return null;
  }
}

/** Diálogo para elegir una carpeta (BIOS o ROMs). */
export async function pickFolder(): Promise<string | null> {
  try {
    const res = await api()?.selectCaptureFolder?.();
    return typeof res === 'string' && res ? res : null;
  } catch {
    return null;
  }
}

/** Comprueba si una carpeta contiene archivos de BIOS. */
export async function checkBiosFolder(
  dir: string,
  patterns: string[],
): Promise<{ found: boolean; files: string[] }> {
  try {
    const res = await api()?.checkBios?.(dir, patterns);
    if (res && typeof res === 'object') {
      return { found: !!res.found, files: Array.isArray(res.files) ? res.files : [] };
    }
  } catch {
    /* sin IPC */
  }
  return { found: false, files: [] };
}

export interface ScanResult {
  roms: ScannedRom[];
  foldersScanned: number;
}

/** Escanea carpetas de ROMs (recursivo) y devuelve los juegos encontrados. */
export async function scanRomFolders(def: EmulatorDef, dirs: string[]): Promise<ScanResult> {
  const roms: ScannedRom[] = [];
  let foldersScanned = 0;
  for (const dir of dirs) {
    try {
      const res = await api()?.scanRoms?.(dir, def.romExtensions, def.specialFiles || []);
      if (res && Array.isArray(res.roms)) {
        foldersScanned += 1;
        for (const rom of res.roms) {
          if (rom?.path && !roms.some((r) => r.path.toLowerCase() === String(rom.path).toLowerCase())) {
            roms.push({
              name: String(rom.name || ''),
              path: String(rom.path),
              extension: String(rom.extension || '').toLowerCase(),
              size: Number(rom.size) || 0,
            });
          }
        }
      }
    } catch {
      /* carpeta inaccesible: se ignora */
    }
  }
  return { roms: dedupeCueBins(roms), foldersScanned };
}

/**
 * Evita duplicados cue+bin: si una carpeta tiene "Juego.cue", los "Juego.bin"
 * del mismo nombre no son juegos aparte (son las pistas del mismo disco).
 */
function dedupeCueBins(roms: ScannedRom[]): ScannedRom[] {
  const stripExt = (name: string) => name.replace(/\.[^/.]+$/, '').toLowerCase();
  const dirOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))).toLowerCase();
  const cueBaseNames = new Set<string>();
  for (const rom of roms) {
    if (rom.extension === '.cue') {
      cueBaseNames.add(`${dirOf(rom.path)}|${stripExt(rom.name)}`);
    }
  }
  if (cueBaseNames.size === 0) return roms;
  return roms.filter((rom) => {
    if (rom.extension !== '.bin') return true;
    return !cueBaseNames.has(`${dirOf(rom.path)}|${stripExt(rom.name)}`);
  });
}

/** Tamaño legible: 602.8 MB, 1.1 GB... */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${(Math.round(gb * 10) / 10).toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${(Math.round(mb * 10) / 10).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** GameID de PS3 (BLUSXXXXX, BCESXXXXX...) extraído de la ruta de la ROM. */
export function extractPs3GameId(romPath: string): string | null {
  if (!romPath) return null;
  const match = String(romPath).match(/\b([A-Z]{4}\d{5})\b/i);
  return match ? match[1].toUpperCase() : null;
}
export function romDisplayName(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, '');
  return base.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim() || base;
}

export function retroSystemForRom(def: EmulatorDef, extension: string): string | undefined {
  if (def.retroSystem) return def.retroSystem;
  if (def.retroSystemByExt) {
    const match = def.retroSystemByExt[extension.toLowerCase()];
    if (match) return match;
  }
  return undefined;
}

/** Da de alta en el launcher las ROMs que aún no existen. Devuelve cuántas añadió. */
export async function importRomsToLauncher(
  def: EmulatorDef,
  exePath: string,
  roms: ScannedRom[],
  existingPaths: Set<string>,
  opts: { language?: string | null; rawPrefs?: unknown } = {},
): Promise<{ added: number; addedPaths: string[] }> {
  const prefs = resolveFieldSyncPreferences(opts.rawPrefs);
  const psnEligible = isPsnEligiblePlatform(def.platform);
  const eff = (src: string, isArt: boolean): string =>
    src === 'psn' && !psnEligible ? (isArt ? 'none' : 'igdb') : src;
  const effPrefs = {
    description: eff(prefs.description, false),
    rating: eff(prefs.rating, false),
    publisher: eff(prefs.publisher, false),
    genres: eff(prefs.genres, false),
    releaseDate: eff(prefs.releaseDate, false),
    cover: eff(prefs.cover, true),
    background: eff(prefs.background, true),
    logo: eff(prefs.logo, true),
  };
  const needSteam = effPrefs.description === 'steam' || effPrefs.rating === 'steam';
  const needIgdb = ['description', 'rating', 'publisher', 'genres', 'releaseDate', 'cover', 'background']
    .some((k) => (effPrefs as Record<string, string>)[k] === 'igdb');
  const needRawg = ['description', 'rating', 'publisher', 'genres', 'releaseDate', 'cover', 'background']
    .some((k) => (effPrefs as Record<string, string>)[k] === 'rawg');
  const needPsn = Object.values(effPrefs).includes('psn');
  const needSteamGrid = effPrefs.cover === 'steamgrid' || effPrefs.background === 'steamgrid' || effPrefs.logo === 'steamgrid';
  const language = (opts.language || 'es') as 'es' | 'en' | 'pt';

  const pending = roms.filter((rom) => !existingPaths.has(rom.path.toLowerCase()));

  const buildApp = async (rom: ScannedRom): Promise<{ app: any; path: string } | null> => {
    try {
      const title = romDisplayName(rom.name);
      const retroSystem = retroSystemForRom(def, rom.extension);
      const [steamData, igdbData, rawgData, psnData, steamGridRes] = await Promise.all([
        needSteam ? fetchSteamFieldData(title, language).catch(() => null) : Promise.resolve(null),
        needIgdb ? fetchIgdbFieldData(title).catch(() => null) : Promise.resolve(null),
        needRawg ? fetchRawgFieldData(title).catch(() => null) : Promise.resolve(null),
        needPsn ? fetchPsnFieldData(title, language).catch(() => null) : Promise.resolve(null),
        needSteamGrid
          ? (api()?.fetchSteamGridData
            ? api().fetchSteamGridData(title).catch(() => null)
            : fetchSteamGridData(title).catch(() => null))
          : Promise.resolve(null),
      ]);
      const bySource: Record<string, any> = { steam: steamData, igdb: igdbData, rawg: rawgData, psn: psnData };
      const gameId = def.id === 'ps3' ? extractPs3GameId(rom.path) : null;
      const appToSave: any = {
        title,
        path: exePath,
        launchArgs: def.launchArgs(rom.path),
        type: 'game',
        platform: def.platform,
        ...(retroSystem ? { retroSystem } : {}),
        ...(gameId ? { gameId } : {}),
        image: '',
        playtimeMinutes: 0,
        playtime_forever: 0,
      };
      const desc = bySource[effPrefs.description]?.description;
      if (desc) appToSave.description = desc;
      const rating = bySource[effPrefs.rating]?.rating;
      if (rating != null) appToSave.rating = rating;
      const publisher = bySource[effPrefs.publisher]?.publisher;
      if (publisher) appToSave.publisher = publisher;
      const genres = bySource[effPrefs.genres]?.genres;
      if (genres?.length) appToSave.genres = genres;
      const releaseDate = bySource[effPrefs.releaseDate]?.releaseDate;
      if (releaseDate) appToSave.releaseDate = releaseDate;
      if (effPrefs.description === 'igdb' && igdbData?.youtubeId) appToSave.youtubeId = igdbData.youtubeId;

      if (effPrefs.cover === 'steamgrid') {
        if (steamGridRes?.success && steamGridRes.data?.grid) appToSave.image = steamGridRes.data.grid;
      } else {
        const cover = bySource[effPrefs.cover]?.coverUrl;
        if (cover) appToSave.image = cover;
      }
      if (effPrefs.background === 'steamgrid') {
        if (steamGridRes?.success && steamGridRes.data?.hero) appToSave.backgroundImage = steamGridRes.data.hero;
      } else {
        const bg = bySource[effPrefs.background]?.backgroundUrl;
        if (bg) appToSave.backgroundImage = bg;
      }
      if (effPrefs.logo === 'steamgrid') {
        if (steamGridRes?.success && steamGridRes.data?.logo) appToSave.logo = steamGridRes.data.logo;
      } else if (effPrefs.logo === 'psn' && psnData?.coverUrl) {
        appToSave.logo = psnData.coverUrl;
      }
      return { app: appToSave, path: rom.path };
    } catch {
      return null;
    }
  };

  const built = await Promise.all(pending.map(buildApp));

  let added = 0;
  const addedPaths: string[] = [];
  for (const entry of built) {
    if (!entry) continue;
    const key = entry.path.toLowerCase();
    if (existingPaths.has(key)) continue;
    try {
      await api()?.saveApp?.(entry.app);
      added += 1;
      addedPaths.push(entry.path);
      existingPaths.add(key);
    } catch {
      /* sigue con la siguiente ROM */
    }
  }
  return { added, addedPaths };
}
