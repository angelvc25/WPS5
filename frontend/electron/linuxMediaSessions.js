'use strict';

/**
 * Sesiones de reproducción del sistema en Linux (MPRIS sobre D-Bus).
 *
 * Es el equivalente Linux del paquete `windows-media-sessions` que se usa en
 * win32: expone el mismo contrato para que main.js no tenga que conocer la
 * plataforma.
 *
 *   getAllSessions()          -> RawMediaSession[]      (misma forma que espera el renderer)
 *   onSessionsChanged(cb)     -> unsubscribe
 *   control(action, target)   -> { success: [busName] } | { success: false, error }
 *   shutdown()
 *
 * Notas:
 *  - Se descarta la sesión de esta propia app (Electron exporta también MPRIS
 *    con nombre `...instance<pid>`), para no mostrarnos como "reproduciendo".
 *  - `mpris:artUrl` con file:// se convierte a local-file:// para que el
 *    renderer pueda cargarla con el protocolo propio de la app.
 */

const dbus = require('dbus-next');
const { Message } = dbus;

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const PLAYER_PATH = '/org/mpris/MediaPlayer2';
const IFACE_ROOT = 'org.mpris.MediaPlayer2';
const IFACE_PLAYER = 'org.mpris.MediaPlayer2.Player';
const IFACE_PROPERTIES = 'org.freedesktop.DBus.Properties';

const POLL_INTERVAL_MS = 6000;
const SIGNAL_DEBOUNCE_MS = 400;

let bus = null;
let busFailed = false;
let dbusInterface = null;
let pollTimer = null;
let notifyTimer = null;
let messageListener = null;
let lastSnapshot = [];
const listeners = new Set();

// ── utilidades de tipado D-Bus ────────────────────────────────────────────

/** dbus-next entrega los valores como Variant { signature, value } (sin aplanar). */
function unwrap(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(unwrap);
  if ('signature' in value && 'value' in value) return unwrap(value.value);

  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const out = {};
    for (const [key, val] of Object.entries(value)) out[key] = unwrap(val);
    return out;
  }
  // JSBI BigInt y demás objetos opacos (int64/uint64) se devuelven tal cual
  return value;
}

/** int64/uint64 llegan como BigInt o JSBI: pasan por string antes de Number. */
function toNumber(value) {
  const raw = unwrap(value);
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (raw === null || raw === undefined || raw === '') return 0;
  const parsed = Number(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringValue(value) {
  const raw = unwrap(value);
  return typeof raw === 'string' ? raw : '';
}

function mapPlaybackStatus(status) {
  switch (toStringValue(status).toLowerCase()) {
    case 'playing': return 'playing';
    case 'paused': return 'paused';
    case 'stopped': return 'stopped';
    default: return 'stopped';
  }
}

/** file:// y rutas absolutas se sirven con el protocolo propio local-file://. */
function normalizeArtUrl(uri) {
  if (!uri || typeof uri !== 'string') return undefined;
  if (uri.startsWith('file://')) return `local-file://${uri.slice('file://'.length)}`;
  if (/^https?:\/\//i.test(uri) || uri.startsWith('data:')) return uri;
  if (uri.startsWith('/')) return `local-file:///${uri}`;
  return undefined;
}

// ── conexión al bus de sesión ─────────────────────────────────────────────

function getBus() {
  if (busFailed) return null;
  if (bus) return bus;

  try {
    bus = dbus.sessionBus();
    bus.on('error', (err) => {
      console.warn('[MediaSessions/MPRIS] error de bus:', err.message);
      // Se reconecta en el siguiente ciclo en lugar de dejar la app sin música
      bus = null;
      dbusInterface = null;
    });
    return bus;
  } catch (err) {
    console.warn('[MediaSessions/MPRIS] sin bus de sesión:', err.message);
    busFailed = true;
    return null;
  }
}

async function getDbusInterface(activeBus) {
  if (dbusInterface) return dbusInterface;
  const proxy = await activeBus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus');
  dbusInterface = proxy.getInterface('org.freedesktop.DBus');
  return dbusInterface;
}

function isOwnSession(busName) {
  // Electron registra `org.mpris.MediaPlayer2.<app>.instance<pid>` con el pid
  // del proceso principal (el de esta app).
  if (busName.endsWith(`instance${process.pid}`)) return true;
  if (busName === `${MPRIS_PREFIX}${process.pid}`) return true;

  try {
    // Segunda barrera: identidad del reproductor = nombre de nuestra app
    const appName = require('electron').app.getName();
    const self = lastSnapshot.find((session) => session.id === busName);
    if (appName && self && self.sourceAppDisplayName === appName) return true;
  } catch (_) { /* sin electron (tests con node puro) */ }

  return false;
}

async function listPlayerNames(activeBus) {
  const iface = await getDbusInterface(activeBus);
  const names = await iface.ListNames();
  return names.filter((name) => name.startsWith(MPRIS_PREFIX) && !isOwnSession(name));
}

async function getProperties(activeBus, destination, interfaceName) {
  const reply = await activeBus.call(new Message({
    destination,
    path: PLAYER_PATH,
    interface: IFACE_PROPERTIES,
    member: 'GetAll',
    signature: 's',
    body: [interfaceName],
  }));
  const raw = (reply && reply.body && reply.body[0]) || {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) out[key] = unwrap(value);
  return out;
}

// ── lectura de sesiones ───────────────────────────────────────────────────

async function readSession(activeBus, busName) {
  const [rootProps, playerProps] = await Promise.all([
    getProperties(activeBus, busName, IFACE_ROOT),
    getProperties(activeBus, busName, IFACE_PLAYER),
  ]);

  const meta = playerProps.Metadata || {};
  const artistRaw = meta['xesam:artist'];
  const artist = Array.isArray(artistRaw)
    ? artistRaw.filter(Boolean).join(', ')
    : toStringValue(artistRaw);

  const identity = toStringValue(rootProps.Identity).trim();
  const title = toStringValue(meta['xesam:title']).trim();

  return {
    id: busName,
    sourceAppUserModelId: busName,
    sourceAppDisplayName: identity || busName.replace(MPRIS_PREFIX, ''),
    title,
    artist: artist.trim(),
    albumTitle: toStringValue(meta['xesam:album']).trim() || undefined,
    thumbnail: normalizeArtUrl(toStringValue(meta['mpris:artUrl'])),
    playbackStatus: mapPlaybackStatus(playerProps.PlaybackStatus),
    timeline: {
      // MPRIS trabaja en microsegundos
      positionMs: Math.max(0, Math.round(toNumber(playerProps.Position) / 1000)),
      durationMs: Math.max(0, Math.round(toNumber(meta['mpris:length']) / 1000)),
    },
    controls: {
      canPlay: playerProps.CanPlay !== false,
      canPause: playerProps.CanPause !== false,
      canSkipNext: playerProps.CanGoNext === true,
      canSkipPrevious: playerProps.CanGoPrevious === true,
    },
  };
}

async function getAllSessions() {
  const activeBus = getBus();
  if (!activeBus) return lastSnapshot;

  try {
    const names = await listPlayerNames(activeBus);
    const sessions = await Promise.all(
      names.map((name) => readSession(activeBus, name).catch(() => null)),
    );
    lastSnapshot = sessions.filter(Boolean);
    return lastSnapshot;
  } catch (err) {
    console.warn('[MediaSessions/MPRIS] getAllSessions:', err.message);
    return lastSnapshot;
  }
}

// ── notificaciones de cambio ──────────────────────────────────────────────

function notifyChanged() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    for (const listener of listeners) {
      try { listener(lastSnapshot); } catch (_) { /* un listener no rompe el resto */ }
    }
  }, SIGNAL_DEBOUNCE_MS);
}

function startPolling(activeBus) {
  if (pollTimer) return;

  // Refresco periódico: cube altas/bajas de reproductores y cambios de
  // posición (Position no emite PropertiesChanged por especificación MPRIS)
  pollTimer = setInterval(async () => {
    await getAllSessions();
    notifyChanged();
  }, POLL_INTERVAL_MS);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();

  // Cambios instantáneos (play/pausa en otra app) vía PropertiesChanged
  messageListener = (msg) => {
    if (msg.interface !== IFACE_PROPERTIES || msg.member !== 'PropertiesChanged') return;
    if (!Array.isArray(msg.body) || msg.body[0] !== IFACE_PLAYER) return;
    getAllSessions().then(notifyChanged);
  };
  activeBus.on('message', messageListener);
}

function onSessionsChanged(callback) {
  if (typeof callback !== 'function') return () => {};
  listeners.add(callback);

  const activeBus = getBus();
  if (activeBus) startPolling(activeBus);

  return () => listeners.delete(callback);
}

// ── controles (Play/Pausa, Siguiente, Anterior) ───────────────────────────

function matchesTarget(session, target) {
  if (!target) return false;

  const busName = String(target.sourceAppUserModelId || '').trim();
  if (busName && session.id === busName) return true;

  const wanted = String(target.appName || '').trim().toLowerCase();
  if (!wanted) return false;

  const identity = String(session.sourceAppDisplayName || '').toLowerCase();
  if (!identity) return false;
  if (identity.includes(wanted) || wanted.includes(identity)) return true;

  // Alias habituales: "Google Chrome"/"Chromium" se tratan como lo mismo
  const aliases = ['chrome', 'chromium', 'firefox', 'spotify', 'youtube'];
  for (const alias of aliases) {
    if (wanted.includes(alias) && identity.includes(alias)) return true;
  }
  return false;
}

async function control(action, target) {
  const memberByAction = {
    play_pause: 'PlayPause',
    next: 'Next',
    prev: 'Previous',
  };
  const member = memberByAction[action];
  if (!member) return { success: false, error: `acción desconocida: ${action}` };

  const activeBus = getBus();
  if (!activeBus) return { success: false, error: 'bus de sesión no disponible' };

  try {
    const names = await listPlayerNames(activeBus);
    if (names.length === 0) return { success: false, error: 'sin reproductores MPRIS' };

    // 1) destino exacto (bus name)  2) por nombre de app  3) el que suena
    let chosen = names.find((name) => target && target.sourceAppUserModelId === name);
    if (!chosen) chosen = names.find((name) => matchesTarget(lastSnapshot.find((s) => s.id === name) || { id: name }, target));
    if (!chosen) chosen = names.find((name) => lastSnapshot.find((s) => s.id === name)?.playbackStatus === 'playing') || names[0];

    await activeBus.call(new Message({
      destination: chosen,
      path: PLAYER_PATH,
      interface: IFACE_PLAYER,
      member,
    }));

    return { success: [chosen] };
  } catch (err) {
    console.warn('[MediaSessions/MPRIS] control:', action, err.message);
    return { success: false, error: err.message };
  }
}

// ── ciclo de vida ─────────────────────────────────────────────────────────

function shutdown() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (notifyTimer) {
    clearTimeout(notifyTimer);
    notifyTimer = null;
  }
  if (bus && messageListener) {
    bus.removeListener('message', messageListener);
    messageListener = null;
  }
  listeners.clear();
  lastSnapshot = [];

  if (bus) {
    try { bus.disconnect(); } catch (_) { /* ya desconectado */ }
    bus = null;
    dbusInterface = null;
  }
  busFailed = false;
}

module.exports = {
  getAllSessions,
  onSessionsChanged,
  control,
  shutdown,
};
