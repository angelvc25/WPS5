import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';

export interface SteamDownloadItem {
  appId: string;
  name: string;
  bytesToDownload: number;
  bytesDownloaded: number;
  bytesToStage: number;
  bytesStaged: number;
  stateFlags: number;
  downloading: boolean;
  validating: boolean;
  paused: boolean;
  percent: number;
  downloadSpeed: number;
}

export interface DownloadCompletion {
  appId: string;
  name: string;
}

export function useSteamDownloads(pollIntervalMs: number = 2000) {
  const [downloads, setDownloads] = useState<SteamDownloadItem[]>([]);
  const [completedDownloads, setCompletedDownloads] = useState<DownloadCompletion[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const prevDownloadsRef = useRef<Map<string, SteamDownloadItem>>(new Map());
  // Recuerda qué appIds ya notificamos como completados, para no duplicarlos
  // aunque el estado "activo" parpadee entre polls.
  const notifiedCompletedRef = useRef<Set<string>>(new Set());

  const fetchDownloads = useCallback((): void => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.getSteamDownloadProgress) return;
    (window as any).electronAPI
      .getSteamDownloadProgress()
      .then((result: any) => {
        if (!mountedRef.current) return;
        const list: SteamDownloadItem[] = Array.isArray(result) ? result : [];
        setDownloads(list);

        const prevMap = prevDownloadsRef.current;
        const currentIds = new Set(list.map((d) => d.appId));
        const completions: DownloadCompletion[] = [];

        for (const [appId, prev] of prevMap) {
          const current = list.find((d) => d.appId === appId);
          const justFinished = !current || (current.percent >= 100 && !current.downloading && !current.validating);
          if (justFinished && !notifiedCompletedRef.current.has(appId)) {
            notifiedCompletedRef.current.add(appId);
            completions.push({ appId, name: prev.name });
          }
        }

        // Si vuelve a aparecer descargando (ej. una nueva actualización),
        // lo liberamos para poder notificar su próxima finalización.
        for (const appId of currentIds) {
          notifiedCompletedRef.current.delete(appId);
        }

        if (completions.length > 0) {
          setCompletedDownloads((prev) => [...prev, ...completions]);
        }

        prevDownloadsRef.current = new Map(list.map((d) => [d.appId, d]));
      })
      .catch((err: any) => {
        console.error('Error fetching Steam download progress:', err);
      });
  }, []);

  // resto del hook igual...

  const dismissCompletion = useCallback((appId: string): void => {
    setCompletedDownloads((prev) => prev.filter((c) => c.appId !== appId));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchDownloads();

    intervalRef.current = setInterval(fetchDownloads, pollIntervalMs);

    let removeListener: (() => void) | undefined;
    if (Platform.OS === 'web' && (window as any).electronAPI?.onSteamDownloadUpdated) {
      removeListener = (window as any).electronAPI.onSteamDownloadUpdated(fetchDownloads);
    }

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (removeListener) removeListener();
    };
  }, [fetchDownloads, pollIntervalMs]);

  return {
    downloads,
    hasActiveDownloads: downloads.length > 0,
    completedDownloads,
    dismissCompletion,
  };
}
