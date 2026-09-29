/**
 * Auto-sincronización silenciosa de la biblioteca local a la cuenta online.
 *
 * Reutiliza `syncLocalLibraryToOnline` (que ya solo sube lo cambiado y poda
 * lo eliminado), pero sin que el usuario tenga que pulsar "Sincronizar
 * biblioteca":
 * - Tras cargar la librería local, programa una sincronización.
 * - Ante cambios (añadir/eliminar/jugar/retocar un juego), espera
 *   `AUTO_SYNC_DELAY_MS` desde el último cambio y sincroniza.
 * - Al iniciar sesión online, sincroniza poco después.
 *
 * Garantías:
 * - Nunca antes de que la librería local esté cargada (si no, una lista
 *   vacía podría podar todo el catálogo remoto).
 * - Solo si hay sesión online Y pertenece al perfil activo (linkedOnlineUserId).
 * - Nunca dos sincronizaciones a la vez; los errores son silenciosos
 *   (se reintenta ante el próximo cambio) y nunca muestran toasts.
 */

import { getOnlineSession, subscribeOnlineSession } from './onlineAccountService';
import { syncLocalLibraryToOnline } from './onlineLibraryService';

/** Espera tras el último cambio de la librería antes de sincronizar. */
const AUTO_SYNC_DELAY_MS = 30000;
/** Espera tras cargar la librería o iniciar sesión. */
const AUTO_SYNC_SOON_DELAY_MS = 10000;
/** Dónde se guarda el resumen de la última auto-sincronización. */
const AUTO_SYNC_STORAGE_KEY = 'online_library_autosync';

// Mismo filtro que onlineLibraryService: lo que no se sube no debe disparar syncs.
const SYSTEM_IDS = new Set(['1', '5', 'last_played', 'more_library', 'media_gallery']);

export interface OnlineAutoSyncInfo {
  at: number;
  uploaded: number;
  removed: number;
  total: number;
}

let initialized = false;
let libraryLoaded = false;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let pendingGames: any[] = [];
let pendingLinkedId = '';
let lastSyncedFingerprint = '';

function syncableOf(game: any): boolean {
  return (
    !!game &&
    typeof game.id === 'string' &&
    !SYSTEM_IDS.has(game.id) &&
    !game.isFolder &&
    !game.isGrid &&
    game.type !== 'media' &&
    game.type !== 'web' &&
    typeof game.title === 'string' &&
    game.title.trim().length > 0
  );
}

function httpCoverOf(game: any): string {
  const img = game?.image;
  const url = typeof img === 'string' ? img : img?.uri;
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';
}

/**
 * Huella estable de lo que se sincroniza (id, título, portada http,
 * plataforma, tiempo de juego y puntuación). Barata de comparar.
 */
export function fingerprintOnlineLibrary(games: any[]): string {
  const parts = (games || [])
    .filter(syncableOf)
    .map((g) =>
      [
        g.id,
        String(g.title).trim().slice(0, 200),
        httpCoverOf(g),
        g.platform || '',
        Number(g.playtimeMinutes ?? g.playtime_forever ?? 0) || 0,
        typeof g.rating === 'number' ? g.rating : '',
      ].join('|'),
    )
    .sort();
  return `${parts.length}#${parts.join('\n')}`;
}

function readLastSync(): OnlineAutoSyncInfo | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnlineAutoSyncInfo;
    return typeof parsed?.at === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function getLastOnlineAutoSync(): OnlineAutoSyncInfo | null {
  return readLastSync();
}

function persistLastSync(info: OnlineAutoSyncInfo) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(AUTO_SYNC_STORAGE_KEY, JSON.stringify(info));
  } catch {
    /* almacenamiento no disponible: no es crítico */
  }
}

function schedule(delayMs: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runAutoSync();
  }, delayMs);
}

async function runAutoSync(): Promise<void> {
  if (running || !libraryLoaded) return;
  const session = getOnlineSession();
  if (!session || !pendingLinkedId || session.user.id !== pendingLinkedId) return;
  const fingerprint = fingerprintOnlineLibrary(pendingGames);
  if (!fingerprint || fingerprint === lastSyncedFingerprint) return;

  running = true;
  try {
    const result = await syncLocalLibraryToOnline(pendingGames);
    lastSyncedFingerprint = fingerprint;
    persistLastSync({
      at: Date.now(),
      uploaded: result.uploaded,
      removed: result.removed,
      total: result.total,
    });
    console.log(
      `[OnlineAutoSync] Biblioteca sincronizada: ${result.uploaded}/${result.total} (eliminados: ${result.removed})`,
    );
  } catch (error) {
    // Silencioso: se reintentará ante el próximo cambio o sesión.
    console.warn('[OnlineAutoSync] No se pudo sincronizar, se reintentará más tarde:', error);
  } finally {
    running = false;
  }
}

/**
 * Suscribe el disparo por inicio de sesión. Llamar una vez al montar la app
 * (init es idempotente). Los juegos/cambios llegan vía `notifyOnlineLibraryChanged`.
 */
export function initOnlineLibraryAutoSync(): void {
  if (initialized) return;
  initialized = true;
  subscribeOnlineSession((session) => {
    if (session) schedule(AUTO_SYNC_SOON_DELAY_MS);
  });
}

/**
 * Marca la librería local como cargada. Imprescindible antes de cualquier
 * sincronización: evita que una lista aún vacía pode el catálogo remoto.
 */
export function markOnlineLibraryLoaded(): void {
  libraryLoaded = true;
  schedule(AUTO_SYNC_SOON_DELAY_MS);
}

/**
 * Avisa de un posible cambio en la librería. Aplica debounce: solo
 * sincroniza si la huella difiere de la última sincronizada.
 */
export function notifyOnlineLibraryChanged(games: any[], linkedOnlineUserId?: string | null): void {
  pendingGames = Array.isArray(games) ? games : [];
  pendingLinkedId = typeof linkedOnlineUserId === 'string' ? linkedOnlineUserId : '';
  if (!libraryLoaded) return;
  if (!pendingLinkedId || !getOnlineSession()) return;
  if (fingerprintOnlineLibrary(pendingGames) === lastSyncedFingerprint) return;
  schedule(AUTO_SYNC_DELAY_MS);
}
