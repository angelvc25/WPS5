export interface ToastOptions {
  duration?: number;
  icon?: any;
}

export interface ToastHistoryItem {
  id: string;
  message: string;
  icon?: any;
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

    const item: ToastHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message,
      icon: options?.icon,
      timestamp: Date.now(),
    };
    history.unshift(item);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    historyListeners.forEach((fn) => fn([...history]));
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