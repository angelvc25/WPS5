import { Platform } from 'react-native';

export type PlaybackStatus =
  | 'closed'
  | 'opened'
  | 'changing'
  | 'stopped'
  | 'playing'
  | 'paused';

export interface SystemMediaSession {
  id: string;
  sourceAppUserModelId: string;
  appName: string;
  title: string;
  artist: string;
  albumTitle?: string;
  thumbnail?: string;
  playbackStatus: PlaybackStatus;
  positionMs: number;
  durationMs: number;
  controls?: {
    canPlay: boolean;
    canPause: boolean;
    canSkipNext: boolean;
    canSkipPrevious: boolean;
  };
}

type RawMediaSession = {
  id: string;
  sourceAppUserModelId: string;
  sourceAppDisplayName?: string;
  title?: string;
  artist?: string;
  albumTitle?: string;
  thumbnail?: string;
  playbackStatus: PlaybackStatus;
  timeline?: { positionMs?: number; durationMs?: number };
  controls?: SystemMediaSession['controls'];
};

function normalizeSession(raw: RawMediaSession): SystemMediaSession {
  return {
    id: raw.id,
    sourceAppUserModelId: raw.sourceAppUserModelId,
    appName: raw.sourceAppDisplayName || raw.sourceAppUserModelId || 'Media',
    title: raw.title?.trim() || 'Sin título',
    artist: raw.artist?.trim() || raw.albumTitle?.trim() || 'Artista desconocido',
    albumTitle: raw.albumTitle,
    thumbnail: raw.thumbnail,
    playbackStatus: raw.playbackStatus,
    positionMs: raw.timeline?.positionMs ?? 0,
    durationMs: raw.timeline?.durationMs ?? 0,
    controls: raw.controls,
  };
}

/** Sesión visible en el card: reproduciendo o en pausa con metadatos. */
export function pickNowPlayingSession(
  sessions: SystemMediaSession[],
): SystemMediaSession | null {
  const visible = sessions.filter((s) => {
    const isActive =
      s.playbackStatus === 'playing'
      || s.playbackStatus === 'paused'
      || s.playbackStatus === 'opened';
    const hasMeta = Boolean(s.title?.trim() || s.thumbnail || s.artist?.trim());
    return isActive && hasMeta;
  });
  if (visible.length === 0) return null;

  const playing = visible.find((s) => s.playbackStatus === 'playing');
  if (playing) return playing;

  const opened = visible.find((s) => s.playbackStatus === 'opened');
  return opened ?? visible[0];
}

export function formatMediaTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function getElectronAPI() {
  if (Platform.OS !== 'web') return null;
  return (window as any).electronAPI ?? null;
}

export async function fetchMediaSessions(): Promise<SystemMediaSession[]> {
  const api = getElectronAPI();
  if (!api?.getMediaSessions) return [];
  try {
    const raw = await api.getMediaSessions();
    return (raw as RawMediaSession[]).map(normalizeSession);
  } catch {
    return [];
  }
}

export function subscribeMediaSessions(
  callback: (sessions: SystemMediaSession[]) => void,
): () => void {
  const api = getElectronAPI();
  if (!api?.onMediaSessionsChanged) return () => { };

  return api.onMediaSessionsChanged((raw: RawMediaSession[]) => {
    callback(raw.map(normalizeSession));
  });
}

export type MediaControlTarget = {
  appName?: string;
  sourceAppUserModelId?: string;
};

export function getMediaControlTarget(
  session: SystemMediaSession | null | undefined,
): MediaControlTarget | undefined {
  if (!session) return undefined;
  return {
    appName: session.appName,
    sourceAppUserModelId: session.sourceAppUserModelId,
  };
}

export async function sendMediaControl(
  action: 'play_pause' | 'next' | 'prev',
  target?: MediaControlTarget,
): Promise<void> {
  const api = getElectronAPI();
  if (!api?.mediaControl) return;
  try {
    const result = await api.mediaControl(action, target);
    if (result?.success === false) {
      console.warn('[MediaControl]', action, 'not applied', result);
    }
  } catch (err) {
    console.warn('[MediaControl]', action, err);
  }
}

export function getAppIconName(appName: string): {
  vendor: 'ionicons' | 'material';
  name: string;
  color: string;
  bg: string;
} {
  const lower = appName.toLowerCase();
  if (lower.includes('spotify')) {
    return { vendor: 'material', name: 'spotify', color: '#1DB954', bg: '#000000ff' };
  }
  if (lower.includes('youtube')) {
    return { vendor: 'material', name: 'youtube', color: '#fff', bg: '#FF0000' };
  }
  if (lower.includes('firefox')) {
    return { vendor: 'material', name: 'firefox', color: '#fff', bg: '#FF7139' };
  }
  if (lower.includes('chrome')) {
    return { vendor: 'material', name: 'google-chrome', color: '#fff', bg: '#4285F4' };
  }
  if (lower.includes('edge')) {
    return { vendor: 'material', name: 'microsoft-edge', color: '#fff', bg: '#0078D7' };
  }
  if (lower.includes('groove') || lower.includes('media player')) {
    return { vendor: 'ionicons', name: 'musical-notes', color: '#000', bg: '#fff' };
  }
  return { vendor: 'ionicons', name: 'musical-notes', color: '#000', bg: 'rgba(255,255,255,0.92)' };
}
