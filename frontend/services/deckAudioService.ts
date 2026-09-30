/**
 * Packs de sonido de DeckThemes (AudioLoader) para WPS5.
 *
 * - Efectos del sistema ("Audio" en DeckThemes): zips con pack.json
 *   { music: false } y ficheros deck_ui_*.wav que se mapean a los 8 roles
 *   de sonido de WPS5 (ver ROLE_FILE_PRIORITY).
 * - Música ambiente ("Music" en DeckThemes): zips con pack.json
 *   { music: true } y un .mp3 que se usa como música de fondo.
 *
 * La API es la misma que usa la web de DeckThemes:
 *   GET https://api.deckthemes.com/themes?page=&perPage=&filters=AUDIO&search=
 *   GET https://api.deckthemes.com/blobs/{id}  (preview o zip de descarga)
 *
 * La instalación en producción se hace vía Electron
 * (`download-deck-audio-pack` en main.js): descarga el zip, lo extrae a
 * userData/WConsole/audio/<packId>/ y devuelve la lista de ficheros.
 * Aquí solo se resuelve el mapeo fichero→rol y el registro local.
 */

import type { SoundName } from '@/constants/themes';

const DECK_THEMES_API = 'https://api.deckthemes.com';

export type DeckAudioKind = 'audio' | 'music';

export type DeckAudioSort = 'downloads' | 'likes' | 'newest' | 'name';

export interface DeckAudioPack {
  id: string;
  name: string;
  author: string;
  version: string;
  /** 'Audio' = efectos del sistema, 'Music' = música ambiente. */
  target: 'Audio' | 'Music';
  downloads: number;
  stars: number;
  imageUrl: string | null;
  downloadUrl: string;
  description: string;
  updatedAt: string;
}

export interface DeckAudioSearchOptions {
  query?: string;
  kind?: DeckAudioKind | 'all';
  sort?: DeckAudioSort;
  page?: number;
  limit?: number;
}

export interface DeckAudioSearchResult {
  items: DeckAudioPack[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function deckBlobUrl(blobId: string): string {
  return `${DECK_THEMES_API}/blobs/${blobId}`;
}

// ─── API (con caché de 5 min, igual que splash videos) ────────────────────

let packsCache: DeckAudioPack[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;
let fetchPromise: Promise<DeckAudioPack[]> | null = null;

function normalizePack(post: any): DeckAudioPack | null {
  try {
    if (!post?.id || !post?.download?.id) return null;
    const target = post.target === 'Music' ? 'Music' : 'Audio';
    const images = Array.isArray(post.images) ? post.images : [];
    return {
      id: String(post.id),
      name: post.displayName || post.name || 'Untitled',
      author: post.specifiedAuthor || post.author?.username || 'Unknown',
      version: post.version || '',
      target,
      downloads: Number(post.download?.downloadCount || 0),
      stars: Number(post.starCount || 0),
      imageUrl: images[0]?.id ? deckBlobUrl(images[0].id) : null,
      downloadUrl: deckBlobUrl(post.download.id),
      description: post.description || '',
      updatedAt: post.updated || post.submitted || '',
    };
  } catch {
    return null;
  }
}

async function fetchAllDeckAudioPacks(forceRefresh = false): Promise<DeckAudioPack[]> {
  const now = Date.now();
  if (!forceRefresh && packsCache && now - lastFetchTime < CACHE_DURATION) return packsCache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const all: DeckAudioPack[] = [];
      const perPage = 100;
      let page = 1;
      // 277 packs aprox: 3 páginas. Cortamos cuando una página venga incompleta.
      for (; page <= 10; page++) {
        const url = `${DECK_THEMES_API}/themes?page=${page}&perPage=${perPage}&filters=AUDIO`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (res.status === 429) throw new Error('DeckThemes rate limit. Inténtalo más tarde.');
        if (!res.ok) throw new Error(`DeckThemes respondió ${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        for (const raw of items) {
          const pack = normalizePack(raw);
          if (pack) all.push(pack);
        }
        if (items.length < perPage) break;
      }
      packsCache = all;
      lastFetchTime = Date.now();
      return all;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export function clearDeckAudioCache(): void {
  packsCache = null;
  lastFetchTime = 0;
}

export async function searchDeckAudioPacks(
  options: DeckAudioSearchOptions = {}
): Promise<DeckAudioSearchResult> {
  const { query = '', kind = 'all', sort = 'downloads', page = 1, limit = 12 } = options;
  const packs = await fetchAllDeckAudioPacks();

  const q = query.trim().toLowerCase();
  let results = packs.filter((p) => {
    if (kind === 'audio' && p.target !== 'Audio') return false;
    if (kind === 'music' && p.target !== 'Music') return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.author.toLowerCase().includes(q);
  });

  results = [...results].sort((a, b) => {
    switch (sort) {
      case 'likes': return b.stars - a.stars;
      case 'newest': return +new Date(b.updatedAt || 0) - +new Date(a.updatedAt || 0);
      case 'name': return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      case 'downloads':
      default: return b.downloads - a.downloads;
    }
  });

  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const start = (safePage - 1) * safeLimit;

  return {
    items: results.slice(start, start + safeLimit),
    page: safePage,
    limit: safeLimit,
    total,
    totalPages,
  };
}

// ─── Mapeo ficheros DeckThemes → roles WPS5 ───────────────────────────────
// Cada rol tiene una lista de subcadenas por prioridad: gana el primer
// fichero (orden alfabético) que contenga alguna, en orden de prioridad.

const ROLE_FILE_PRIORITY: Record<SoundName, string[]> = {
  navigation: ['navigation', 'tile_scroll', 'slider_up', 'slider_down', 'misc_10', 'typing'],
  activation: ['default_activation', 'confirmation_positive', 'switch_toggle_on', 'bumper_end_02', 'bumper_end'],
  openHome: ['into_game_detail', 'launch_game'],
  tab: ['tab_transition', 'bumper'],
  back: ['out_of_game_detail', 'confirmation_negative'],
  openControlCenter: ['show_modal', 'side_menu_fly_in', 'switch_toggle'],
  exit: ['hide_modal', 'side_menu_fly_out', 'switch_toggle_off'],
  notification: ['message_toast', 'achievement_toast', 'toast'],
  background: ['menu_music', 'music', 'background'],
};

const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac'];

function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function baseName(p: string): string {
  return p.split('/').pop() || p;
}

export interface DeckAudioFile {
  name: string;
  /** Ruta relativa dentro de la carpeta del pack (puede incluir subcarpeta). */
  rel?: string;
  size?: number;
}

/**
 * Mapea los ficheros de un pack de EFECTOS a roles WPS5.
 * `ignore` viene del pack.json del pack (ficheros a saltar).
 * Devuelve rutas relativas (rel) listas para reproducir.
 */
export function mapDeckFilesToRoles(
  files: (DeckAudioFile | string)[],
  ignore: string[] = []
): Partial<Record<SoundName, string>> {
  const ignored = new Set(ignore.map((n) => baseName(n).toLowerCase()));
  const candidates = files
    .map((f) => typeof f === 'string' ? { name: baseName(f), rel: baseName(f) } : { name: baseName(f.name), rel: f.rel ?? baseName(f.name) })
    .filter((f) => isAudioFile(f.name) && !ignored.has(f.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const used = new Set<string>();
  const roles: Partial<Record<SoundName, string>> = {};

  const roleOrder: SoundName[] = [
    'navigation', 'activation', 'openHome', 'tab',
    'back', 'openControlCenter', 'exit', 'notification',
  ];
  for (const role of roleOrder) {
    for (const needle of ROLE_FILE_PRIORITY[role]) {
      const match = candidates.find(
        (f) => !used.has(f.rel) && f.name.toLowerCase().includes(needle)
      );
      if (match) {
        roles[role] = match.rel;
        used.add(match.rel);
        break;
      }
    }
  }
  return roles;
}

/**
 * Elige el fichero de MÚSICA ambiente de un pack (el .mp3 principal).
 * Evita intros de packs que traen intro + loop por separado.
 * Devuelve la ruta relativa (rel) lista para reproducir.
 */
export function pickDeckMusicFile(
  files: (DeckAudioFile & { size: number })[],
  ignore: string[] = []
): string | null {
  const ignored = new Set(ignore.map((n) => baseName(n).toLowerCase()));
  const cands = files
    .map((f) => ({ name: baseName(f.name), rel: f.rel ?? baseName(f.name), size: f.size }))
    .filter((f) => isAudioFile(f.name) && !ignored.has(f.name.toLowerCase()))
    .filter((f) => !/intro/i.test(f.name));
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.size - a.size);
  return cands[0].rel;
}

// ─── Registro local de packs instalados ───────────────────────────────────

export interface InstalledAudioPack {
  id: string;
  kind: DeckAudioKind;
  name: string;
  author: string;
  version: string;
  deckId?: string;
  /** Carpeta en disco (userData/WConsole/audio/<id>). */
  dir: string;
  /** Ficheros presentes en la carpeta (rutas relativas). */
  files: string[];
  /** Rol WPS5 → ruta relativa dentro de dir. Música usa la clave 'background'. */
  roles: Partial<Record<SoundName, string>>;
  downloadedAt: number;
}

// v2: los roles pasaron de basenames a rutas relativas (los zips de
// DeckThemes a veces anidan todo en una subcarpeta). Las entradas v1
// apuntaban a rutas inexistentes y se descartan.
const INSTALLED_STORAGE_KEY = 'wps5_audio_packs_v2';

function loadInstalled(): InstalledAudioPack[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(INSTALLED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistInstalled(packs: InstalledAudioPack[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(INSTALLED_STORAGE_KEY, JSON.stringify(packs));
    }
  } catch { /* cuota llena, etc. */ }
}

export function listInstalledAudioPacks(kind?: DeckAudioKind): InstalledAudioPack[] {
  const all = loadInstalled();
  return kind ? all.filter((p) => p.kind === kind) : all;
}

export function getInstalledAudioPack(id: string | null | undefined): InstalledAudioPack | null {
  if (!id) return null;
  return loadInstalled().find((p) => p.id === id) ?? null;
}

export function saveInstalledAudioPack(pack: InstalledAudioPack): void {
  const next = [pack, ...loadInstalled().filter((p) => p.id !== pack.id)];
  persistInstalled(next);
}

export function removeInstalledAudioPack(id: string): void {
  persistInstalled(loadInstalled().filter((p) => p.id !== id));
}

/** Debe coincidir con `toLocalFileUri` en electron/main.js. */
export function toLocalFileUri(filePath: string): string {
  return `local-file:///${filePath.replace(/\\/g, '/')}`;
}

/** Resuelve los roles de un pack instalado a URIs reproducibles. */
export function resolveInstalledPackSources(
  pack: InstalledAudioPack
): Partial<Record<SoundName, string>> {
  const out: Partial<Record<SoundName, string>> = {};
  (Object.keys(pack.roles) as SoundName[]).forEach((role) => {
    const file = pack.roles[role];
    if (file) out[role] = toLocalFileUri(`${pack.dir}/${file}`);
  });
  return out;
}

// ─── Packs incluidos en la app ────────────────────────────────────────────
// (Reservado: si en el futuro se quiere shippear algún pack bundled,
// añadir aquí entradas con requires estáticos y exponerlas vía
// BUNDLED_AUDIO_PACKS. Las carpetas de ejemplo se eliminaron, así que
// la lista queda vacía y todo viene de DeckThemes o de descargas.)
export interface BundledAudioPack {
  id: string;
  kind: DeckAudioKind;
  name: string;
  author: string;
  version: string;
  files: Partial<Record<SoundName, any>>;
}

export const BUNDLED_AUDIO_PACKS: BundledAudioPack[] = [];

export function getBundledAudioPack(id: string | null | undefined): BundledAudioPack | null {
  if (!id) return null;
  return BUNDLED_AUDIO_PACKS.find((p) => p.id === id) ?? null;
}
