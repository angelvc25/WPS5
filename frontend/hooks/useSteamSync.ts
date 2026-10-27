import type { ConsoleItem } from '@/app/(tabs)/index';
import { UserProfile } from '@/components/UserSelectScreen';
import { TranslationKey } from '@/i18n/translations';
import { fetchEpicInstalledGames } from '@/services/epicInstallService';
import { buildEpicRunUrl } from '@/services/epicLaunchService';
import { fetchSteamGridData } from '@/services/steamGridService';
import { fetchSteamInstalledAppIds, fetchSteamInstalledGamesDetailed } from '@/services/steamInstallService';
import { buildSteamRunUrl, getSteamAppId, resolveLaunchPath } from '@/services/steamLaunchService';
import { fetchSteamOwnedGames } from '@/services/steamUserService';
import { fetchWishlistDeals, WishlistDeal } from '@/services/steamWishlistService';
import { toastService } from '@/services/toastService';
import { fetchXboxInstalledGames } from '@/services/xboxInstallService';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { SteamDownloadItem } from './useSteamDownloads';
import { useSteamDownloads } from './useSteamDownloads';
import { useLauncherSettled } from '@/hooks/useLauncherSettled';

type Vars = Record<string, string | number>;
type TFunction = (key: TranslationKey, vars?: Vars) => string;

interface UseSteamSyncParams {
  activeUser: UserProfile | null;
  /** Lista completa de juegos manuales (games) — necesaria para detectar overrides y orphan installs. */
  games: ConsoleItem[];
  t: TFunction;
  language: string;
  /** Pestaña activa de la librería ('installed' | 'collection'). Necesaria para refrescar installedSteamAppIds y la colección Steam bajo demanda. */
  libraryTab: 'installed' | 'collection';
}

interface UseSteamSyncResult {
  steamGames: ConsoleItem[];
  setSteamGames: React.Dispatch<React.SetStateAction<ConsoleItem[]>>;
  steamGamesRef: React.MutableRefObject<ConsoleItem[]>;
  epicGames: ConsoleItem[];
  setEpicGames: React.Dispatch<React.SetStateAction<ConsoleItem[]>>;
  epicGamesRef: React.MutableRefObject<ConsoleItem[]>;
  xboxGames: ConsoleItem[];
  setXboxGames: React.Dispatch<React.SetStateAction<ConsoleItem[]>>;
  xboxGamesRef: React.MutableRefObject<ConsoleItem[]>;
  installedSteamAppIds: Set<string> | null;
  loadingSteam: boolean;
  loadingEpic: boolean;
  loadingXbox: boolean;
  wishlistDeals: WishlistDeal[];
  steamDownloads: SteamDownloadItem[];
  downloadsByAppId: Map<string, SteamDownloadItem>;
  downloadingSteamGames: ConsoleItem[];
  isSteamTrackedGame: (item: ConsoleItem | null | undefined) => boolean;
  getEffectiveSteamGames: (steamId?: string) => ConsoleItem[];
}

// ── Utilidades puras (exportadas para que useLibrary pueda usarlas) ──────────

/** Devuelve true si el item es un juego rastreado por Steam. */
export function isSteamTrackedGame(item: ConsoleItem | null | undefined): boolean {
  if (!item) return false;
  const path = typeof item.path === 'string' ? item.path : '';
  return Boolean(
    item.id?.toString().startsWith('steam_') ||
    item.platform === 'Steam' ||
    (typeof (item as any).steamAppId !== 'undefined') ||
    path.startsWith('steam://rungameid/')
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const migrateSteamArtUrl = (url: any): any =>
  typeof url === 'string'
    ? url.replace('library_600x900_2x.jpg', 'library_600x900.jpg')
    : url;

const migrateCachedSteamGames = (parsed: any): ConsoleItem[] =>
  (Array.isArray(parsed) ? parsed : []).map((g: any) => ({
    ...g,
    image: migrateSteamArtUrl(g?.image),
  }));

export function useSteamSync({ activeUser, games, t, language: _language, libraryTab }: UseSteamSyncParams): UseSteamSyncResult {
  // ── Steam ─────────────────────────────────────────────────────────────────
  const settled = useLauncherSettled();
  const [steamGames, setSteamGames] = useState<ConsoleItem[]>([]);
  const steamGamesRef = useRef<ConsoleItem[]>([]);
  steamGamesRef.current = steamGames;

  const [installedSteamAppIds, setInstalledSteamAppIds] = useState<Set<string> | null>(null);
  const [loadingSteam, setLoadingSteam] = useState(false);

  // ── Epic ──────────────────────────────────────────────────────────────────
  const [epicGames, setEpicGames] = useState<ConsoleItem[]>([]);
  const epicGamesRef = useRef<ConsoleItem[]>([]);
  epicGamesRef.current = epicGames;
  const [loadingEpic, setLoadingEpic] = useState(false);

  // ── Xbox ──────────────────────────────────────────────────────────────────
  const [xboxGames, setXboxGames] = useState<ConsoleItem[]>([]);
  const xboxGamesRef = useRef<ConsoleItem[]>([]);
  xboxGamesRef.current = xboxGames;
  const [loadingXbox, setLoadingXbox] = useState(false);

  // ── Wishlist ──────────────────────────────────────────────────────────────
  const [wishlistDeals, setWishlistDeals] = useState<WishlistDeal[]>([]);
  const knownWishlistDealIdsRef = useRef<Set<number> | null>(null);

  // ── Steam downloads ───────────────────────────────────────────────────────
  const { downloads: steamDownloads } = useSteamDownloads();

  // ── downloadsByAppId ──────────────────────────────────────────────────────
  const downloadsByAppId = useMemo(() => {
    const map = new Map<string, SteamDownloadItem>();
    steamDownloads.forEach(d => map.set(d.appId, d));
    return map;
  }, [steamDownloads]);

  // ── downloadingSteamGames ─────────────────────────────────────────────────
  const downloadingSteamGames = useMemo(() => {
    if (downloadsByAppId.size === 0) return [] as ConsoleItem[];
    return steamGames
      .filter(sg => {
        const appId = getSteamAppId(sg as any);
        return !!appId && downloadsByAppId.has(appId);
      })
      .map(sg => ({ ...sg, path: resolveLaunchPath(sg) }));
  }, [steamGames, downloadsByAppId]);

  // ── Función pura: obtiene los juegos Steam efectivos (memoria o caché) ────
  const getEffectiveSteamGames = useCallback((steamId?: string): ConsoleItem[] => {
    if (steamGamesRef.current.length > 0) return steamGamesRef.current;
    const sid = steamId ?? activeUser?.settings?.steamId;
    if (sid) {
      try {
        const raw = localStorage.getItem(`steam_games_${sid}`);
        if (raw) {
          const parsed = migrateCachedSteamGames(JSON.parse(raw));
          if (parsed.length > 0) return parsed;
        }
      } catch (e) { /* noop */ }
    }
    return [];
  }, [activeUser?.settings?.steamId]);

  // ── Effect: cargar caché de Steam al montar o cambiar de usuario ──────────
  useEffect(() => {
    if (!settled) return;
    const steamId = activeUser?.settings?.steamId;
    if (steamId) {
      const cachedRaw = localStorage.getItem(`steam_games_${steamId}`);
      if (cachedRaw) {
        try {
          const parsed = migrateCachedSteamGames(JSON.parse(cachedRaw));
          if (parsed.length > 0) {
            setSteamGames(parsed);
          }
        } catch (e) {
          console.error('Error loading cached steam games:', e);
        }
      }
    } else {
      setSteamGames([]);
    }
  }, [settled, activeUser?.settings?.steamId]);

  // ── Effect: refresco silencioso de playtimes en segundo plano ─────────────
  useEffect(() => {
    if (!settled) return;
    const steamId = activeUser?.settings?.steamId;
    if (!steamId || steamGames.length === 0) return;

    const GLOBAL_STEAM_API_KEY = process.env.EXPO_PUBLIC_STEAM_API_KEY || 'B1F361EA3C07B455DC8B0D06ED179B00';

    const refreshTimeout = setTimeout(() => {
      fetchSteamOwnedGames(GLOBAL_STEAM_API_KEY, steamId)
        .then((freshList) => {
          if (!freshList || freshList.length === 0) return;

          const playtimeMap = new Map<string, number>();
          freshList.forEach((g: any) => {
            playtimeMap.set(`steam_${g.appid}`, Number(g.playtime_forever || 0));
          });

          setSteamGames(prev => {
            const updated = prev.map(game => {
              const freshMinutes = playtimeMap.get(game.id);
              if (freshMinutes === undefined || freshMinutes === (game.playtime_forever ?? game.playtimeMinutes ?? 0)) {
                return game;
              }
              return { ...game, playtime_forever: freshMinutes, playtimeMinutes: freshMinutes };
            });

            try {
              localStorage.setItem(`steam_games_${steamId}`, JSON.stringify(updated));
            } catch (_) { }

            return updated;
          });
        })
        .catch((e) => {
          console.warn('[Steam] No se pudo refrescar playtime:', e?.message);
        });
    }, 2500);

    return () => clearTimeout(refreshTimeout);
  }, [activeUser?.settings?.steamId, steamGames.length]);

  // ── Effect: carga inicial de installedSteamAppIds ─────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.getSteamInstalledApps) return;
    fetchSteamInstalledAppIds().then(setInstalledSteamAppIds);
  }, [settled]);

  // ── Effect: detectar fin de instalación de un juego de Steam ─────────────
  useEffect(() => {
    if (!settled) return;
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.getSteamInstalledApps) return;

    const interval = setInterval(async () => {
      const freshIds = await fetchSteamInstalledAppIds();

      setInstalledSteamAppIds(prevIds => {
        if (prevIds) {
          freshIds.forEach(id => {
            if (!prevIds.has(id)) {
              const game =
                steamGamesRef.current.find(g => g.id === `steam_${id}`) ||
                games.find(g => g.id === `steam_${id}`);
              if (game) {
                toastService.show(t('notifications.steam', { gameTitle: game.title }), {
                  icon: require('@/assets/images/install.png'),
                  source: 'steam',
                  coverImage: game.image,
                });
              }
            }
          });
        }
        return freshIds;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [settled, games, t]);

  // ── Effect: wishlist watcher ──────────────────────────────────────────────
  useEffect(() => {
    if (!settled) return;
    const steamId = activeUser?.settings?.steamId;
    if (!steamId) return;

    const checkWishlist = () => {
      fetchWishlistDeals(steamId).then(deals => {
        setWishlistDeals(deals);

        const known = knownWishlistDealIdsRef.current;

        if (known) {
          deals.forEach(deal => {
            if (!known.has(deal.appid)) {
              toastService.show(
                t('notifiactions.wishlist', {
                  gameTitle: deal.title,
                  discountPercent: deal.discountPercent,
                }),
                {
                  icon: require('@/assets/images/Steamico.png'),
                  source: 'steam',
                }
              );
            }
          });

          knownWishlistDealIdsRef.current = new Set(deals.map(d => d.appid));
        } else {
          // Primera carga: esperar 15s antes de mostrar las notificaciones
          setTimeout(() => {
            deals.slice(0, 5).forEach(deal => {
              toastService.show(
                t('notifiactions.wishlist', {
                  gameTitle: deal.title,
                  discountPercent: deal.discountPercent,
                }),
                {
                  icon: require('@/assets/images/Steamico.png'),
                  source: 'steam',
                }
              );
            });
          }, 15000);

          knownWishlistDealIdsRef.current = new Set(deals.map(d => d.appid));
        }
      });
    };

    checkWishlist();
    const interval = setInterval(checkWishlist, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [settled, activeUser?.settings?.steamId, t]);

  // ── Effect: carga inicial de juegos Epic ──────────────────────────────────
  useEffect(() => {
    if (!settled) return;
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.getEpicInstalledGames) return;
    if (epicGames.length > 0 || loadingEpic) return;

    // Cargar de inmediato desde la caché local para no demorar el inicio
    try {
      const cachedRaw = localStorage.getItem('epic_games_cache');
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (Array.isArray(cached) && cached.length > 0) {
          setEpicGames(cached);
          epicGamesRef.current = cached;
        }
      }
    } catch { /* noop */ }

    setLoadingEpic(true);
    fetchEpicInstalledGames().then(async (gamesList) => {
      let cachedMap = new Map<string, ConsoleItem>();
      try {
        const cachedRaw = localStorage.getItem('epic_games_cache');
        if (cachedRaw) {
          const list: ConsoleItem[] = JSON.parse(cachedRaw);
          list.forEach(g => cachedMap.set(g.id, g));
        }
      } catch { /* noop */ }

      const baseFormatted: ConsoleItem[] = gamesList.map((g: any) => {
        const existing = cachedMap.get(g.id);
        return {
          id: g.id,
          title: g.title,
          time: 'Epic',
          platform: 'Epic',
          type: 'game',
          path: buildEpicRunUrl(g.appName),
          image: existing?.image || null,
          backgroundImage: existing?.backgroundImage || null,
          logo: existing?.logo || null,
        };
      });

      // Solo consultar SteamGridDB para juegos que NO tengan arte guardado aún
      const withMetadata: ConsoleItem[] = [];
      for (const game of baseFormatted) {
        if (game.image && game.backgroundImage && game.logo) {
          withMetadata.push(game);
          continue;
        }
        try {
          const res = (window as any).electronAPI?.fetchSteamGridData
            ? await (window as any).electronAPI.fetchSteamGridData(game.title)
            : await fetchSteamGridData(game.title);
          if (res?.success && res.data) {
            withMetadata.push({
              ...game,
              image: res.data.grid || game.image,
              backgroundImage: res.data.hero || game.backgroundImage,
              logo: res.data.logo || game.logo,
            });
            continue;
          }
        } catch (e) {
          console.error('[Epic] Error fetching metadata for:', game.title, e);
        }
        withMetadata.push(game);
      }

      // Notifica solo los juegos de Epic nuevos desde el último escaneo
      try {
        const knownRaw = localStorage.getItem('epic_known_games');
        const known: string[] = knownRaw ? JSON.parse(knownRaw) : null;
        if (known) {
          const newOnes = withMetadata.filter(g => !known.includes(g.id));
          newOnes.forEach(g => {
            toastService.show(t('notifications.epicGames', { gameTitle: g.title }), {
              icon: require('@/assets/images/Epicico.png'),
              source: 'epic',
              coverImage: g.image,
            });
          });
        }
        localStorage.setItem('epic_known_games', JSON.stringify(withMetadata.map(g => g.id)));
        localStorage.setItem('epic_games_cache', JSON.stringify(withMetadata));
      } catch (e) { /* noop */ }

      setEpicGames(withMetadata);
      setLoadingEpic(false);
    }).catch(() => setLoadingEpic(false));
  }, [settled]);

  // ── Effect: carga inicial de juegos Xbox ──────────────────────────────────
  useEffect(() => {
    if (!settled) return;
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.getXboxInstalledGames) return;
    if (xboxGames.length > 0 || loadingXbox) return;

    // Cargar de inmediato desde la caché local para no demorar el inicio
    try {
      const cachedRaw = localStorage.getItem('xbox_games_cache');
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (Array.isArray(cached) && cached.length > 0) {
          setXboxGames(cached);
          xboxGamesRef.current = cached;
        }
      }
    } catch { /* noop */ }

    setLoadingXbox(true);
    fetchXboxInstalledGames().then(async (gamesList) => {
      let cachedMap = new Map<string, ConsoleItem>();
      try {
        const cachedRaw = localStorage.getItem('xbox_games_cache');
        if (cachedRaw) {
          const list: ConsoleItem[] = JSON.parse(cachedRaw);
          list.forEach(g => cachedMap.set(g.id, g));
        }
      } catch { /* noop */ }

      const baseFormatted: ConsoleItem[] = gamesList.map((g: any) => {
        const existing = cachedMap.get(g.id);
        return {
          id: g.id,
          title: g.title,
          time: 'Xbox',
          platform: 'Xbox',
          type: 'game',
          path: g.launchPath || (g.aumid ? `shell:AppsFolder\\${g.aumid}` : ''),
          image: existing?.image || g.icon || null,
          backgroundImage: existing?.backgroundImage || null,
          logo: existing?.logo || null,
        };
      });

      // Solo consultar SteamGridDB para juegos que NO tengan arte guardado aún
      const withMetadata: ConsoleItem[] = [];
      for (const game of baseFormatted) {
        if (game.backgroundImage && game.logo && game.image) {
          withMetadata.push(game);
          continue;
        }
        try {
          const res = (window as any).electronAPI?.fetchSteamGridData
            ? await (window as any).electronAPI.fetchSteamGridData(game.title)
            : await fetchSteamGridData(game.title);
          if (res?.success && res.data) {
            withMetadata.push({
              ...game,
              image: res.data.grid || game.image,
              backgroundImage: res.data.hero || game.backgroundImage,
              logo: res.data.logo || game.logo,
            });
            continue;
          }
        } catch (e) {
          console.error('[Xbox] Error fetching metadata for:', game.title, e);
        }
        withMetadata.push(game);
      }

      // Notifica solo los juegos de Xbox nuevos desde el último escaneo
      try {
        const knownRaw = localStorage.getItem('xbox_known_games');
        const known: string[] = knownRaw ? JSON.parse(knownRaw) : null;
        if (known) {
          const newOnes = withMetadata.filter(g => !known.includes(g.id));
          newOnes.forEach(g => {
            toastService.show(t('notifications.xboxGames', { gameTitle: g.title }), {
              icon: require('@/assets/images/Xboxico.png'),
              source: 'xbox',
              coverImage: g.image,
            });
          });
        }
        localStorage.setItem('xbox_known_games', JSON.stringify(withMetadata.map(g => g.id)));
        localStorage.setItem('xbox_games_cache', JSON.stringify(withMetadata));
      } catch (e) { /* noop */ }

      setXboxGames(withMetadata);
      setLoadingXbox(false);
    }).catch(() => setLoadingXbox(false));
  }, [settled]);

  // ── Effect: refresco de installedSteamAppIds al cambiar a colección ─────────
  useEffect(() => {
    if (!settled) return;
    if (libraryTab !== 'collection') return;
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.getSteamInstalledApps) return;

    fetchSteamInstalledAppIds().then(setInstalledSteamAppIds);
  }, [settled, libraryTab, steamGames.length]);

  // ── Effect: carga de juegos Steam al cambiar a colección (bajo demanda) ───
  useEffect(() => {
    if (!settled) return;
    if (libraryTab !== 'collection') return;
    if (steamGames.length > 0 || loadingSteam) return;

    const GLOBAL_STEAM_API_KEY = process.env.EXPO_PUBLIC_STEAM_API_KEY || 'B1F361EA3C07B455DC8B0D06ED179B00';
    const steamId = activeUser?.settings?.steamId;
    if (!steamId) return;

    // Si ya existen juegos en la caché de este usuario, no volvemos a consultar la API ni a re-sincronizar portadas
    const cachedRaw = localStorage.getItem(`steam_games_${steamId}`);
    if (cachedRaw) {
      try {
        const cached = migrateCachedSteamGames(JSON.parse(cachedRaw));
        if (cached.length > 0) {
          setSteamGames(cached);
          return;
        }
      } catch (e) { /* noop */ }
    }

    setLoadingSteam(true);
    fetchSteamOwnedGames(GLOBAL_STEAM_API_KEY, steamId).then(async (gamesList) => {
      const baseFormatted: ConsoleItem[] = gamesList.map((g: any) => ({
        id: `steam_${g.appid}`,
        title: g.name,
        time: 'Steam',
        image: `https://steamcdn-a.akamaihd.net/steam/apps/${g.appid}/library_600x900.jpg`,
        description: '',
        playtime_forever: Number(g.playtime_forever || 0),
        playtimeMinutes: Number(g.playtime_forever || 0),
        platform: 'Steam',
        path: buildSteamRunUrl(g.appid),
      }));

      const withMetadata = await Promise.all(
        baseFormatted.map(async (game) => {
          // Respetar portadas o metadatos personalizados previamente guardados por el usuario
          const existingOverride = games.find(g => g.id === game.id);
          if (existingOverride?.image) {
            return { ...game, ...existingOverride };
          }

          try {
            const res = (window as any).electronAPI?.fetchSteamGridData
              ? await (window as any).electronAPI.fetchSteamGridData(game.title)
              : await fetchSteamGridData(game.title);
            if (res?.success && res.data) {
              return {
                ...game,
                image: res.data.grid || game.image,
                backgroundImage: res.data.hero || game.backgroundImage,
                logo: res.data.logo || game.logo,
              };
            }
          } catch (e) {
            console.error('[Steam] Error fetching metadata for:', game.title, e);
          }
          return game;
        })
      );

      setSteamGames(withMetadata);
      try {
        localStorage.setItem(`steam_games_${steamId}`, JSON.stringify(withMetadata));
      } catch (e) { /* noop */ }
      setLoadingSteam(false);
    }).catch(() => setLoadingSteam(false));
  }, [libraryTab, activeUser, steamGames.length, loadingSteam, games]);

  // ── Effect: orphan installs (juegos instalados fuera de GetOwnedGames) ─────
  useEffect(() => {
    if (!settled) return;
    if (libraryTab !== 'collection') return;
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.getSteamInstalledAppsDetailed) return;
    if (steamGames.length === 0) return;

    fetchSteamInstalledGamesDetailed().then(async (detailed) => {
      if (detailed.length === 0) return;

      const knownIds = new Set(
        steamGames.map(g => getSteamAppId(g as any)).filter(Boolean)
      );
      const orphans = detailed.filter(d => !knownIds.has(d.appId));
      if (orphans.length === 0) return;

      console.log('[Steam] Juegos detectados localmente fuera de GetOwnedGames:', orphans.map(o => o.name));

      const steamIdForNotify = activeUser?.settings?.steamId;
      const notifiedKey = steamIdForNotify ? `steam_orphans_notified_${steamIdForNotify}` : null;
      let alreadyNotified: string[] = [];
      if (notifiedKey) {
        try {
          const raw = localStorage.getItem(notifiedKey);
          alreadyNotified = raw ? JSON.parse(raw) : [];
        } catch (e) { /* noop */ }
      }
      const newlyFound = orphans.filter(o => !alreadyNotified.includes(o.appId));

      const withMetadata = await Promise.all(
        orphans.map(async (o) => {
          const base: ConsoleItem = {
            id: `steam_${o.appId}`,
            title: o.name,
            time: 'Steam',
            image: `https://steamcdn-a.akamaihd.net/steam/apps/${o.appId}/library_600x900.jpg`,
            description: t('game.playedTime', { hours: 0 }),
            playtime_forever: 0,
            playtimeMinutes: 0,
            platform: 'Steam',
            path: buildSteamRunUrl(o.appId),
          };

          try {
            const res = (window as any).electronAPI?.fetchSteamGridData
              ? await (window as any).electronAPI.fetchSteamGridData(o.name)
              : await fetchSteamGridData(o.name);
            if (res?.success && res.data) {
              return {
                ...base,
                image: res.data.grid || base.image,
                backgroundImage: res.data.hero,
                logo: res.data.logo,
              };
            }
          } catch (e) {
            console.error('[Steam] Error fetching metadata for orphan game:', o.name, e);
          }
          return base;
        })
      );

      setSteamGames(prev => {
        const existingIds = new Set(prev.map(g => g.id));
        const toAdd = withMetadata.filter(g => !existingIds.has(g.id));
        if (toAdd.length === 0) return prev;

        const updated = [...prev, ...toAdd];
        const steamId = activeUser?.settings?.steamId;
        if (steamId) {
          try { localStorage.setItem(`steam_games_${steamId}`, JSON.stringify(updated)); } catch (e) { /* noop */ }
        }
        return updated;
      });

      if (newlyFound.length > 0) {
        newlyFound.forEach(o => {
          const gameWithMeta = withMetadata.find(g => g.id === `steam_${o.appId}`);
          toastService.show(
            t('notifications.steamOrphanDetected', { gameTitle: o.name }),
            {
              icon: require('@/assets/images/Steamico.png'),
              source: 'steam',
              coverImage: gameWithMeta?.image,
            }
          );
        });

        if (notifiedKey) {
          try {
            const updatedNotified = [...alreadyNotified, ...newlyFound.map(o => o.appId)];
            localStorage.setItem(notifiedKey, JSON.stringify(updatedNotified));
          } catch (e) { /* noop */ }
        }
      }
    });
  }, [settled, libraryTab, steamGames.length, activeUser?.settings?.steamId, t]);

  return {
    steamGames,
    setSteamGames,
    steamGamesRef,
    epicGames,
    setEpicGames,
    epicGamesRef,
    xboxGames,
    setXboxGames,
    xboxGamesRef,
    installedSteamAppIds,
    loadingSteam,
    loadingEpic,
    loadingXbox,
    wishlistDeals,
    steamDownloads,
    downloadsByAppId,
    downloadingSteamGames,
    isSteamTrackedGame,
    getEffectiveSteamGames,
  };
}
