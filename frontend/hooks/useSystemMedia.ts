import { useEffect, useState, useRef } from 'react';
import {
  fetchMediaSessions,
  pickNowPlayingSession,
  subscribeMediaSessions,
  SystemMediaSession,
} from '@/services/systemMediaService';

export function useSystemMedia() {
  const [sessions, setSessions] = useState<SystemMediaSession[]>([]);
  const [nowPlaying, setNowPlaying] = useState<SystemMediaSession | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const basePositionRef = useRef(0);
  const lastSyncRef = useRef<number>(Date.now());

  useEffect(() => {
    let mounted = true;

    fetchMediaSessions().then((list) => {
      if (mounted) setSessions(list);
    });

    const unsubscribe = subscribeMediaSessions((list) => {
      if (mounted) setSessions(list);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const picked = pickNowPlayingSession(sessions);
    setNowPlaying(picked);
    if (picked) {
      basePositionRef.current = picked.positionMs;
      lastSyncRef.current = Date.now();
    }
  }, [sessions]);

  // Interpolar posición entre actualizaciones del backend
  useEffect(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    if (!nowPlaying || nowPlaying.playbackStatus !== 'playing') return;

    basePositionRef.current = nowPlaying.positionMs;
    lastSyncRef.current = Date.now();

    tickRef.current = setInterval(() => {
      const nextPos = basePositionRef.current + (Date.now() - lastSyncRef.current);
      setNowPlaying((prev) => {
        if (!prev || prev.playbackStatus !== 'playing') return prev;
        if (prev.durationMs > 0 && nextPos >= prev.durationMs) {
          return { ...prev, positionMs: prev.durationMs };
        }
        return { ...prev, positionMs: nextPos };
      });
    }, 500);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [nowPlaying?.id, nowPlaying?.playbackStatus, nowPlaying?.positionMs]);

  return { sessions, nowPlaying };
}
