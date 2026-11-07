/**
 * useConsoleNotifications.ts
 *
 * Hook que detecta los eventos "estilo consola" mientras el usuario está
 * dentro del overlay (juego activo) y los dispara como notificaciones
 * unificadas a través de toastService (con consoleType), para que
 * ConsoleNotificationsHost las renderice en la esquina superior.
 *
 * Eventos detectados:
 *   1. Amigo comenzó a jugar (Steam friends)
 *   2. Descarga completada (Steam downloads – transición de activa a completada)
 *   3. Juego actualizado (Steam downloads – un appId ya completado vuelve a completarse)
 *   4. Nuevo logro desbloqueado (logros de Steam / externos del juego activo)
 *
 * El hook es idempotente: solo notifica cada evento una vez (usa refs para
 * recordar qué ya fue notificado) y es silencioso ante errores de red.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { toastService } from '@/services/toastService';
import { soundService } from '@/services/soundService';
import { fetchSteamFriends, SteamFriend } from '@/services/steamFriendsService';
import { useSteamDownloads } from './useSteamDownloads';
import { fetchSteamGameAchievements } from '@/services/steamUserService';
import { fetchAwGameAchievements } from '@/services/achievementWatcherService';
import type { SteamGameAchievementsSummary } from '@/services/steamUserService';

export type ConsoleNotificationType =
    | 'friend-playing'
    | 'download-completed'
    | 'game-updated'
    | 'achievement-unlocked';

interface UseConsoleNotificationsOptions {
    /** API key de Steam (opcional, se toma de settings si no se pasa). */
    steamApiKey?: string;
    /** Steam ID del usuario (opcional, se toma de settings si no se pasa). */
    steamUserId?: string;
    /** App ID del juego actualmente activo en el overlay (para logros). */
    activeAppId?: string | null;
    /** Intervalo de encuesta en ms (default 10s). */
    pollIntervalMs?: number;
    /** Si es false, no se detectan logros. */
    watchAchievementsEnabled?: boolean;
}

const DEFAULT_API_KEY = (process.env as any)?.EXPO_PUBLIC_STEAM_API_KEY ||
    'B1F361EA3C07B455DC8B0D06ED179B00';

/** Solo notificamos desbloqueos ocurridos en los últimos 90 segundos. */
const RECENT_UNLOCK_MS = 90 * 1000;

export function useConsoleNotifications({
    steamApiKey: steamApiKeyProp,
    steamUserId: steamUserIdProp,
    activeAppId,
    pollIntervalMs = 10000,
    watchAchievementsEnabled = true,
}: UseConsoleNotificationsOptions = {}) {
    const { t } = useTranslation();
    const { activeUser } = useUser();

    const steamApiKey = steamApiKeyProp ??
        (activeUser?.settings as any)?.steamApiKey ??
        DEFAULT_API_KEY;
    const steamUserId = steamUserIdProp ?? (activeUser?.settings as any)?.steamId;

    const { downloads, completedDownloads } = useSteamDownloads(2000);

    // Refs que se mantienen sincronizadas con el estado sin forzar re-creación de callbacks.
    const downloadsRef = useRef(downloads);
    const completedDownloadsRef = useRef(completedDownloads);
    downloadsRef.current = downloads;
    completedDownloadsRef.current = completedDownloads;

    // ── Refs de deduplicación (nivel componente, no dentro de callbacks) ────
    // steamid -> gameextrainfo (último juego detectado del amigo)
    const playingFriendsRef = useRef<Map<string, string>>(new Map());
    // appIds ya notificados como "descarga completada" (primera vez)
    const completedNotifiedRef = useRef<Set<string>>(new Set());
    // appIds de descargas activas en el poll anterior (para detectar transiciones)
    const prevActiveRef = useRef<Set<string>>(new Set());
    // apiName + unlockTime de logros ya notificados
    const unlockedAchievementsRef = useRef<Set<string>>(new Set());

    // ─── 1. Amigo comenzó a jugar ─────────────────────────────────────────
    const watchFriends = useCallback(() => {
        if (!steamUserId || !steamApiKey) return;
        let cancelled = false;
        let interval: ReturnType<typeof setInterval>;

        const tick = async () => {
            try {
                const friends = await fetchSteamFriends(steamApiKey, steamUserId);
                if (cancelled) return;

                for (const friend of friends) {
                    if (!friend.gameextrainfo || !friend.gameid) continue;

                    const prevGame = playingFriendsRef.current.get(friend.steamid);
                    // Solo notificamos si el amigo *acaba de comenzar* a jugar
                    // (no estaba jugando antes, o cambió de juego).
                    if (prevGame === undefined || prevGame !== friend.gameextrainfo) {
                        playingFriendsRef.current.set(friend.steamid, friend.gameextrainfo);
                        if (cancelled) return;

                        toastService.show(
                            t('consoleNotif.friendPlaying', {
                                name: friend.personaname,
                                game: friend.gameextrainfo,
                            }),
                            {
                                consoleType: 'friend-playing',
                                consoleTitle: t('consoleNotif.friendPlayingTitle'),
                                icon: friend.avatar
                                    ? { uri: friend.avatar }
                                    : require('@/assets/images/userDefault.jpeg'),
                                glyphName: 'person',
                                accentColor: '#4FA8FF',
                                source: 'steam',
                                duration: 8000,
                                consoleData: {
                                    steamid: friend.steamid,
                                    appId: friend.gameid,
                                    game: friend.gameextrainfo,
                                    name: friend.personaname,
                                },
                            },
                        );
                        soundService.playNotification?.().catch(() => { });
                    }
                }
            } catch {
                // Silencioso ante errores de red / Steam no disponible.
            }
        };

        tick();
        interval = setInterval(tick, pollIntervalMs);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [steamApiKey, steamUserId, pollIntervalMs, t]);

    // ─── 2. Descarga completada / 3. Juego actualizado ────────────────────
    // Detecta transiciones: una descarga que estaba activa (en `downloads`)
    // y ya no está, porque terminó. Si ese appId ya fue notificado como
    // completado antes, es una "actualización"; si no, es una "descarga
    // completada" nueva.
    const watchDownloads = useCallback(() => {
        let cancelled = false;
        let interval: ReturnType<typeof setInterval>;

        const tick = () => {
            if (cancelled) return;

            const currentDownloads = downloadsRef.current;
            const currentCompleted = completedDownloadsRef.current;

            const currentActiveIds = new Set(currentDownloads.map((d) => d.appId));
            const prevIds = prevActiveRef.current;

            // Qué descargas activas dejaron de estarlo (terminaron o se pausaron)
            const justFinished = [...prevIds].filter((id) => !currentActiveIds.has(id));

            for (const appId of justFinished) {
                const item = currentCompleted.find((d) => d.appId === appId);
                if (!item) continue;

                if (completedNotifiedRef.current.has(appId)) {
                    // Ya se completó antes → juego actualizado
                    toastService.show(
                        t('consoleNotif.gameUpdated', { game: item.name }),
                        {
                            consoleType: 'game-updated',
                            consoleTitle: t('consoleNotif.gameUpdatedTitle'),
                            icon: undefined,
                            glyphName: 'refresh',
                            accentColor: '#FFB300',
                            source: 'steam',
                            duration: 8000,
                            consoleData: { appId, game: item.name },
                        },
                    );
                    soundService.playNotification?.().catch(() => { });
                } else {
                    // Primera vez que vemos este appId completar
                    completedNotifiedRef.current.add(appId);
                    toastService.show(
                        t('consoleNotif.downloadCompleted', { game: item.name }),
                        {
                            consoleType: 'download-completed',
                            consoleTitle: t('consoleNotif.downloadCompletedTitle'),
                            icon: undefined,
                            glyphName: 'download',
                            accentColor: '#2E7DFF',
                            source: 'steam',
                            duration: 8000,
                            consoleData: { appId, game: item.name },
                        },
                    );
                    soundService.playNotification?.().catch(() => { });
                }
            }

            if (!cancelled) {
                prevActiveRef.current = currentActiveIds;
            }
        };

        tick();
        interval = setInterval(tick, pollIntervalMs);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [pollIntervalMs, t]);

    // ─── 4. Nuevo logro desbloqueado ──────────────────────────────────────
    const watchAchievementsCb = useCallback(() => {
        if (!watchAchievementsEnabled || !activeAppId || !steamUserId || !steamApiKey) return;
        let cancelled = false;
        let interval: ReturnType<typeof setInterval>;

        const tick = async () => {
            try {
                const appIdNum = Number(activeAppId);
                if (!appIdNum) return;

                // Intentamos logros de Steam legítimos primero; si fallan,
                // probamos con el watcher de logros externos (emuladores).
                let summary: SteamGameAchievementsSummary | null = null;
                try {
                    // fetchSteamGameAchievements(apiKey, steamId, appId, forceRefresh, lang)
                    summary = await fetchSteamGameAchievements(
                        steamApiKey,
                        steamUserId,
                        appIdNum,
                        false,
                        'english',
                    ).catch(() => null);
                } catch {
                    summary = null;
                }

                if (!summary || !summary.achievements) {
                    try {
                        // fetchAwGameAchievements(appId, userId, lang, steamApiKey)
                        summary = await fetchAwGameAchievements(
                            appIdNum,
                            steamUserId,
                            'english',
                            steamApiKey,
                        ).catch(() => null);
                    } catch {
                        summary = null;
                    }
                }

                if (!summary || !summary.achievements || cancelled) return;

                for (const ach of summary.achievements) {
                    if (!ach.achieved) continue;
                    const unlockTime = ach.unlockTime || 0;
                    // Solo logros muy recientes (evita notificar logros viejos
                    // que ya estaban desbloqueados antes de instalar el hook).
                    if (Date.now() - unlockTime > RECENT_UNLOCK_MS) continue;
                    const key = `${ach.apiName}-${unlockTime}`;
                    if (unlockedAchievementsRef.current.has(key)) continue;
                    unlockedAchievementsRef.current.add(key);

                    toastService.show(
                        t('consoleNotif.achievementUnlocked', {
                            game: '',
                            achievement: ach.name,
                        }),
                        {
                            consoleType: 'achievement-unlocked',
                            consoleTitle: t('consoleNotif.achievementUnlockedTitle'),
                            icon: ach.icon ? { uri: ach.icon } : undefined,
                            glyphName: 'trophy',
                            accentColor: '#FFD700',
                            source: 'achievements',
                            duration: 9000,
                            consoleData: {
                                appId: activeAppId,
                                achievement: ach.name,
                                apiName: ach.apiName,
                                unlockTime,
                            },
                        },
                    );
                    soundService.playNotification?.().catch(() => { });
                }
            } catch {
                // Silencioso.
            }
        };

        tick();
        interval = setInterval(tick, pollIntervalMs);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [activeAppId, steamUserId, steamApiKey, pollIntervalMs, t]);

    // ── Escucha de trofeos de Electron: solo sincronizar sonido/historial si la ventana nativa está activa ──
    useEffect(() => {
        if (Platform.OS !== 'web' || !(window as any).electronAPI?.onTrophyUnlocked) return;
        const removeListener = (window as any).electronAPI.onTrophyUnlocked((data: any) => {
            const ach = data?.achievement;
            if (!ach) return;
            // La notificación flotante con el estilo de PS5 la dibuja la ventana nativa de Electron.
            // Aquí solo reproducimos sonido si no estuviese en la ventana nativa.
        });

        return removeListener;
    }, [t]);

    // ── Arranque de los watchers ───────────────────────────────────────────
    // Cada watcher gestiona su propio interval interno; este efecto solo los
    // inicializa una vez al montar y los limpia al desmontar.
    useEffect(() => {
        const unFriends = watchFriends();
        const unDownloads = watchDownloads();
        const unAchievements = watchAchievementsCb();

        return () => {
            unFriends?.();
            unDownloads?.();
            unAchievements?.();
        };
    }, [watchFriends, watchDownloads, watchAchievementsCb]);
}

export default useConsoleNotifications;
