/** Acción asociada a un toast (p. ej. solicitud de amistad aceptable/rechazable). */
export interface ToastFriendRequestAction {
  type: 'friend-request';
  requestId: string;
  username: string;
  displayName: string;
}

export interface ToastOptions {
  duration?: number;
  icon?: any;
  source?: string;
  coverImage?: any;
  saveToHistory?: boolean;
  action?: ToastFriendRequestAction;
}

export interface ToastHistoryItem {
  id: string;
  message: string;
  icon?: any;
  source?: string;
  coverImage?: any;
  timestamp: number;
  action?: ToastFriendRequestAction;
}

interface ToastPayload {
  message: string;
  options?: ToastOptions;
}

type ToastListener = (payload: ToastPayload) => void;
type HistoryListener = (history: ToastHistoryItem[]) => void;

const listeners = new Set<ToastListener>();
const historyListeners = new Set<HistoryListener>();
const history: ToastHistoryItem[] = [];
const MAX_HISTORY = 50;

// ── Cola de visualización ────────────────────────────────────────────────
// Solo se muestran MAX_VISIBLE toasts a la vez; el resto espera en cola y
// entra a medida que se libera un lugar. El historial NO pasa por la cola:
// se guarda al instante, así que nada se pierde aunque un toast espere.
const MAX_VISIBLE = 2;
// Debe coincidir con la duración por defecto del componente que dibuja los toasts.
const DEFAULT_DURATION = 5000;
// Margen para la animación de salida antes de liberar el lugar.
const EXIT_BUFFER = 400;
// Tope de espera: si llegan muchos de golpe (p. ej. descuentos) se descartan
// los más antiguos de la cola (siguen en el historial).
const MAX_QUEUE = 10;

const queue: ToastPayload[] = [];
let visibleCount = 0;

function dispatch(payload: ToastPayload) {
  visibleCount += 1;
  listeners.forEach((fn) => fn(payload));
  const ms = (payload.options?.duration ?? DEFAULT_DURATION) + EXIT_BUFFER;
  setTimeout(() => {
    visibleCount = Math.max(0, visibleCount - 1);
    flushQueue();
  }, ms);
}

function flushQueue() {
  while (visibleCount < MAX_VISIBLE && queue.length > 0) {
    dispatch(queue.shift() as ToastPayload);
  }
}

export const toastService = {
  show(message: string, options?: ToastOptions) {
    queue.push({ message, options });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    flushQueue();

    if (options?.saveToHistory !== false) {
      const item: ToastHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message,
        icon: options?.icon,
        source: options?.source,
        coverImage: options?.coverImage,
        timestamp: Date.now(),
        action: options?.action,
      };
      history.unshift(item);
      if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      historyListeners.forEach((fn) => fn([...history]));
    }
  },
  subscribe(fn: ToastListener) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  getHistory(): ToastHistoryItem[] {
    return [...history];
  },
  subscribeHistory(fn: HistoryListener) {
    historyListeners.add(fn);
    return () => { historyListeners.delete(fn); };
  },
};

import { musicHistoryService } from './musicHistoryService';
import { cleanAppName } from './systemMediaService';

let globalLastNotifiedTrackId: string | null = null;

export function notifyNowPlayingToast(params: {
  id: string;
  title: string;
  artist?: string;
  thumbnail?: any;
  appName?: string;
  t: (key: any, options?: any) => string;
}) {
  const { id, title, artist, thumbnail, appName, t } = params;
  const key = `track_${id}_${title}_${artist || ''}`;
  if (globalLastNotifiedTrackId !== key) {
    globalLastNotifiedTrackId = key;
    const hasArtist =
      artist &&
      artist !== 'Artista desconocido' &&
      artist !== 'Unknown artist' &&
      artist !== 'Desconocido' &&
      artist !== 'Unknown';
    const msg = hasArtist
      ? t('toast.nowPlaying', { title, artist })
      : t('toast.nowPlayingTitleOnly', { title });

    musicHistoryService.addTrack({
      title,
      artist: hasArtist ? (artist as string) : '',
      thumbnail,
      appName: appName ? cleanAppName(appName) : 'Spotify',
      source: 'music',
    });

    toastService.show(msg, {
      icon: require('@/assets/images/music.png'),
      coverImage: typeof thumbnail === 'string' ? { uri: thumbnail } : thumbnail,
      source: 'music',
      saveToHistory: false,
    });
  }
}