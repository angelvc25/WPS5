export interface HistoryTrackItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: any;
  source?: string;
  timestamp: number;
}

type MusicHistoryListener = (history: HistoryTrackItem[]) => void;

const history: HistoryTrackItem[] = [];
const listeners = new Set<MusicHistoryListener>();
const MAX_MUSIC_HISTORY = 50;

export const musicHistoryService = {
  addTrack(item: Omit<HistoryTrackItem, 'id' | 'timestamp'>) {
    if (!item.title) return;
    const existingIdx = history.findIndex(
      (h) => h.title === item.title && h.artist === item.artist
    );
    if (existingIdx !== -1) {
      history.splice(existingIdx, 1);
    }
    const newEntry: HistoryTrackItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    history.unshift(newEntry);
    if (history.length > MAX_MUSIC_HISTORY) history.length = MAX_MUSIC_HISTORY;
    listeners.forEach((fn) => fn([...history]));
  },
  getHistory(): HistoryTrackItem[] {
    return [...history];
  },
  subscribe(fn: MusicHistoryListener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
