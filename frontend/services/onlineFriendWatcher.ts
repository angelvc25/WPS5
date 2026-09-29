/**
 * Vigilante de amistad online WPS5: toasts automáticos de solicitudes.
 *
 * 1. Encuesta periódicamente las solicitudes entrantes: ante una solicitud
 *    nueva muestra un toast ("X te ha enviado una solicitud de amistad")
 *    que queda guardado en el historial → visible en la card de
 *    notificaciones, donde se puede aceptar o rechazar.
 * 2. Detecta aceptaciones: si un usuario al que le enviamos solicitud
 *    aparece en la lista de amigos, muestra un toast ("X ha aceptado tu
 *    solicitud de amistad").
 *
 * Todo es best-effort y silencioso ante errores de red. Sin sesión no
 * hace nada.
 */

import { getOnlineSession, subscribeOnlineSession, type OnlineUser } from './onlineAccountService';
import {
  acceptOnlineFriendRequest,
  fetchOnlineFriends,
  fetchOnlineFriendRequests,
  rejectOnlineFriendRequest,
  sendOnlineFriendRequest,
  type FriendRequestItem,
} from './onlineFriendsService';
import { toastService } from './toastService';
import { soundService } from './soundService';

export type FriendWatcherTranslate = (key: string, params?: any) => string;

/** Cada cuánto se encuesta al servidor. */
const POLL_MS = 45000;
/** Margen tras iniciar sesión antes del primer chequeo. */
const SESSION_DELAY_MS = 5000;
/** Cuánto vive una solicitud enviada pendiente de aceptación (30 días). */
const SENT_TTL_MS = 30 * 24 * 3600 * 1000;

const KNOWN_REQUESTS_PREFIX = 'wps5_known_requests_';
const KNOWN_FRIENDS_PREFIX = 'wps5_known_friends_';
const SENT_REQUESTS_PREFIX = 'wps5_sent_requests_';

interface SentRequest {
  userId: string;
  at: number;
}

let translate: FriendWatcherTranslate = (key) => key;
let initialized = false;
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let currentUid = '';
let baselineDone = false;
let knownRequests: string[] = [];
let knownFriends: string[] = [];

type FriendsListener = () => void;
const friendsListeners = new Set<FriendsListener>();
/** Solicitudes ya resueltas (aceptadas/rechazadas) para ocultar sus botones. */
const handledRequestIds = new Set<string>();

function readJson<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* no crítico */
  }
}

function displayNameOf(user: OnlineUser): string {
  return user.displayName || user.username || 'player';
}

function avatarIconOf(user: OnlineUser): any {
  if (user.avatarUrl && /^https?:\/\//i.test(user.avatarUrl)) {
    return { uri: user.avatarUrl };
  }
  return require('@/assets/images/userDefault.jpeg');
}

function loadPersistedState(uid: string) {
  knownRequests = readJson<string[]>(KNOWN_REQUESTS_PREFIX + uid) || [];
  knownFriends = readJson<string[]>(KNOWN_FRIENDS_PREFIX + uid) || [];
}

function persistKnownState(uid: string) {
  writeJson(KNOWN_REQUESTS_PREFIX + uid, knownRequests);
  writeJson(KNOWN_FRIENDS_PREFIX + uid, knownFriends);
}

function readSentRequests(uid: string): SentRequest[] {
  const list = readJson<SentRequest[]>(SENT_REQUESTS_PREFIX + uid);
  if (!Array.isArray(list)) return [];
  const now = Date.now();
  return list.filter((s) => s && typeof s.userId === 'string' && now - s.at < SENT_TTL_MS);
}

function writeSentRequests(uid: string, list: SentRequest[]) {
  writeJson(SENT_REQUESTS_PREFIX + uid, list);
}

function emitFriendsChanged() {
  friendsListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* no crítico */
    }
  });
}

/** Suscribe recargas (panel de amigos, card de notificaciones). */
export function subscribeFriendUpdates(fn: FriendsListener): () => void {
  friendsListeners.add(fn);
  return () => {
    friendsListeners.delete(fn);
  };
}

/** ¿Esta solicitud ya fue aceptada/rechazada? (para ocultar sus botones). */
export function isFriendRequestHandled(requestId: string): boolean {
  return handledRequestIds.has(requestId);
}

function markRequestHandled(requestId: string) {
  handledRequestIds.add(requestId);
  knownRequests = knownRequests.filter((id) => id !== requestId);
  if (currentUid) persistKnownState(currentUid);
}

async function tick() {
  if (ticking) return;
  const session = getOnlineSession();
  if (!session) return;
  const uid = session.user.id;
  if (uid !== currentUid) {
    currentUid = uid;
    loadPersistedState(uid);
    baselineDone = false;
  }

  ticking = true;
  try {
    const [requests, friends] = await Promise.all([
      fetchOnlineFriendRequests().catch(() => null),
      fetchOnlineFriends().catch(() => null),
    ]);
    if (!requests || !friends) return;

    // ── 1. Solicitudes entrantes nuevas → toast ──
    const incoming = requests.filter((r) => !knownRequests.includes(r.id));
    if (baselineDone) {
      for (const req of incoming) {
        notifyIncomingRequest(req);
      }
    }
    knownRequests = requests.map((r) => r.id);

    // ── 2. Amigos nuevos que tenían solicitud enviada → toast de aceptada ──
    const sent = readSentRequests(uid);
    const sentIds = new Set(sent.map((s) => s.userId));
    const freshFriends = friends.filter((f) => !knownFriends.includes(f.user.id));
    if (baselineDone) {
      const remaining = sent.filter((s) => sentIds.has(s.userId));
      for (const f of freshFriends) {
        if (sentIds.has(f.user.id)) {
          notifyRequestAccepted(f.user);
          sentIds.delete(f.user.id);
        }
      }
      if (remaining.length !== sent.length || freshFriends.length > 0) {
        writeSentRequests(
          uid,
          sent.filter((s) => sentIds.has(s.userId)),
        );
      }
    }
    knownFriends = friends.map((f) => f.user.id);

    persistKnownState(uid);
    baselineDone = true;
  } finally {
    ticking = false;
  }
}

function notifyIncomingRequest(req: FriendRequestItem) {
  const name = displayNameOf(req.user);
  toastService.show(translate('friends.requestReceived', { name }), {
    source: 'friends',
    icon: avatarIconOf(req.user),
    action: {
      type: 'friend-request',
      requestId: req.id,
      username: req.user.username,
      displayName: name,
    },
  });
  soundService.playNotification?.().catch(() => {});
}

function notifyRequestAccepted(user: OnlineUser) {
  const name = displayNameOf(user);
  toastService.show(translate('friends.requestAccepted', { name }), {
    source: 'friends',
    icon: avatarIconOf(user),
  });
  soundService.playNotification?.().catch(() => {});
  emitFriendsChanged();
}

/**
 * Envía una solicitud y la registra como pendiente (para detectar cuando la
 * acepten). Usar en lugar de `sendOnlineFriendRequest` directo.
 */
export async function sendFriendRequestTracked(userId: string): Promise<void> {
  await sendOnlineFriendRequest(userId);
  const session = getOnlineSession();
  if (session) {
    const uid = session.user.id;
    const sent = readSentRequests(uid);
    if (!sent.some((s) => s.userId === userId)) {
      sent.push({ userId, at: Date.now() });
      writeSentRequests(uid, sent);
    }
  }
  emitFriendsChanged();
}

/**
 * Acepta una solicitud (p. ej. desde la card de notificaciones).
 * Tras aceptar, el remitente verá el toast de aceptada en su próximo chequeo.
 */
export async function acceptFriendRequestTracked(requestId: string): Promise<void> {
  await acceptOnlineFriendRequest(requestId);
  markRequestHandled(requestId);
  emitFriendsChanged();
}

/** Rechaza una solicitud (p. ej. desde la card de notificaciones). */
export async function rejectFriendRequestTracked(requestId: string): Promise<void> {
  await rejectOnlineFriendRequest(requestId);
  markRequestHandled(requestId);
  emitFriendsChanged();
}

/**
 * Arranca el vigilante (idempotente). `t` traduce las claves de toasts.
 * Llamar una vez al montar la app.
 */
export function initOnlineFriendWatcher(t: FriendWatcherTranslate): void {
  if (t) translate = t;
  if (initialized) return;
  initialized = true;
  if (getOnlineSession()) {
    // Primer chequeo: siembra el estado sin avisar de lo ya pendiente.
    void tick();
  }
  subscribeOnlineSession((session) => {
    if (session) setTimeout(() => void tick(), SESSION_DELAY_MS);
  });
  if (timer) clearInterval(timer);
  timer = setInterval(() => void tick(), POLL_MS);
}
