export interface ToastOptions {
  duration?: number;
  icon?: any;
  source?: string;
  coverImage?: any;
  saveToHistory?: boolean;
}

export interface ToastHistoryItem {
  id: string;
  message: string;
  icon?: any;
  source?: string;
  coverImage?: any;
  timestamp: number;
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

export const toastService = {
  show(message: string, options?: ToastOptions) {
    listeners.forEach((fn) => fn({ message, options }));

    if (options?.saveToHistory !== false) {
      const item: ToastHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message,
        icon: options?.icon,
        source: options?.source,
        coverImage: options?.coverImage,
        timestamp: Date.now(),
      };
      history.unshift(item);
      if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      historyListeners.forEach((fn) => fn([...history]));
    }
  },
  subscribe(fn: ToastListener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getHistory(): ToastHistoryItem[] {
    return [...history];
  },
  subscribeHistory(fn: HistoryListener) {
    historyListeners.add(fn);
    return () => historyListeners.delete(fn);
  },
};

let globalLastNotifiedTrackId: string | null = null;

export function notifyNowPlayingToast(params: {
  id: string;
  title: string;
  artist?: string;
  thumbnail?: any;
  t: (key: string, options?: any) => string;
}) {
  const { id, title, artist, thumbnail, t } = params;
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

    toastService.show(msg, {
      icon: require('@/assets/images/music.png'),
      coverImage: typeof thumbnail === 'string' ? { uri: thumbnail } : thumbnail,
      source: 'music',
      saveToHistory: false,
    });
  }
}