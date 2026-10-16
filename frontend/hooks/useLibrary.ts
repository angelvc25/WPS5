import type { ConsoleItem, StoreSource } from '@/app/(tabs)/index';
import { UserProfile } from '@/components/UserSelectScreen';
import { TranslationKey } from '@/i18n/translations';
import {
    fingerprintOnlineLibrary,
    markOnlineLibraryLoaded,
    notifyOnlineLibraryChanged,
} from '@/services/onlineAutoSync';
import { getSteamAppId, resolveLaunchPath } from '@/services/steamLaunchService';
import { toastService } from '@/services/toastService';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { SteamDownloadItem } from './useSteamDownloads';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ─────────────────────────────────────────────────────────────────────────────

type Vars = Record<string, string | number>;
type TFunction = (key: TranslationKey, vars?: Vars) => string;

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de utilidad puras (no exportadas)
// Originalmente definidas antes del componente en app/(tabs)/index.tsx
// ─────────────────────────────────────────────────────────────────────────────

/** Única fuente de verdad para el tile de la tienda (id='5') según la fuente elegida. */
const getStoreTile = (source: StoreSource, t: any): ConsoleItem =>
    source === 'steam'
        ? { id: '5', title: 'Steam Store', time: t('home.store'), image: require('@/assets/images/SteamStore.png'), backgroundImage: require('@/assets/images/StoreFondoSteam.png') }
        : { id: '5', title: 'PlayStation Store', time: t('home.store'), image: require('@/assets/images/Store.png'), backgroundImage: require('@/assets/images/StoreFondo.jpg') };

/**
 * Lee la fuente persistida en localStorage para que el icono correcto se muestre
 * desde el primer render (antes de que activeUser termine de cargar).
 */
const getPersistedStoreSource = (): StoreSource => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return 'ps5';
        const lastUserId = window.localStorage.getItem('console_last_user_id');
        const savedUsers = window.localStorage.getItem('console_users');
        if (!savedUsers) return 'ps5';
        const usersList = JSON.parse(savedUsers) as Array<{ id: string; settings?: { storeSource?: StoreSource } }>;
        const target = lastUserId ? usersList.find((u) => u.id === lastUserId) : usersList[0];
        return target?.settings?.storeSource === 'steam' ? 'steam' : 'ps5';
    } catch {
        return 'ps5';
    }
};

const getInitialGames = (t: any, source: StoreSource = 'ps5'): ConsoleItem[] => [
    { id: '1', title: t('home.welcome'), time: 'WConsole - Home', image: require('@/assets/images/Home.png'), description: t('home.welcomeDesc'), rating: 5.0 },
    { id: 'last_played', title: t('lastPlayed.title'), time: t('lastPlayed.noGamesYet'), image: require('@/assets/images/Home.gif'), isLastPlayed: true },
    getStoreTile(source, t),
];

const getInitialMedia = (t: any): ConsoleItem[] => [
    {
        id: 'spotify_default',
        title: 'Spotify',
        time: t('home.music'),
        type: 'media',
        platform: 'PC',
        description: t('home.musicDesc'),
        image: require('@/assets/images/spotify_portada.png'),
        logo: require('@/assets/images/spotify_logo.png'),
        backgroundImage: require('@/assets/images/spotify_fondo.png'),
    },
];

const migrateSteamArtUrl = (url: any): any =>
    typeof url === 'string'
        ? url.replace('library_600x900_2x.jpg', 'library_600x900.jpg')
        : url;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const migrateCachedSteamGames = (parsed: any): ConsoleItem[] =>
    (Array.isArray(parsed) ? parsed : []).map((g: any) => ({
        ...g,
        image: migrateSteamArtUrl(g?.image),
    }));

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del hook
// ─────────────────────────────────────────────────────────────────────────────

interface UseLibraryOptions {
    activeUser: UserProfile | null;
    steamGames: ConsoleItem[];
    steamGamesRef: React.MutableRefObject<ConsoleItem[]>;
    epicGames: ConsoleItem[];
    epicGamesRef: React.MutableRefObject<ConsoleItem[]>;
    xboxGames: ConsoleItem[];
    xboxGamesRef: React.MutableRefObject<ConsoleItem[]>;
    downloadsByAppId: Map<string, SteamDownloadItem>;
    downloadingSteamGames: ConsoleItem[];
    t: TFunction;
    language: string;
    uiReady: boolean;
    /** Pestaña activa de la librería — la gestiona index.tsx y la comparte con useSteamSync. */
    libraryTab: 'installed' | 'collection';
    setLibraryTab: React.Dispatch<React.SetStateAction<'installed' | 'collection'>>;
    // Setters que mergeGameIntoState / syncGamePlaytime / markGameAsLastPlayed necesitan
    setSteamGames: React.Dispatch<React.SetStateAction<ConsoleItem[]>>;
    setEpicGames: React.Dispatch<React.SetStateAction<ConsoleItem[]>>;
    setXboxGames: React.Dispatch<React.SetStateAction<ConsoleItem[]>>;
    selectedItem: ConsoleItem | null;
    setSelectedItem: React.Dispatch<React.SetStateAction<ConsoleItem | null>>;
    setDetailVisible: React.Dispatch<React.SetStateAction<boolean>>;
    getEffectiveSteamGames: (steamId?: string) => ConsoleItem[];
    /** Pestaña activa del carrusel ('Games' | 'Media') para filtrar currentData. */
    currentRenderedTab: string;
    /** Límite de juegos en el carrusel de inicio (GAMES_LIMIT). */
    gamesLimit: number;
}

interface UseLibraryResult {
    games: ConsoleItem[];
    setGames: React.Dispatch<React.SetStateAction<ConsoleItem[]>>;
    gamesRef: React.MutableRefObject<ConsoleItem[]>;
    media: ConsoleItem[];
    setMedia: React.Dispatch<React.SetStateAction<ConsoleItem[]>>;
    lastPlayedGame: ConsoleItem | null;
    setLastPlayedGame: React.Dispatch<React.SetStateAction<ConsoleItem | null>>;
    currentData: ConsoleItem[];
    displayedLibraryGames: ConsoleItem[];
    searchableLibraryGames: ConsoleItem[];
    searchableMedia: ConsoleItem[];
    nonSteamGames: ConsoleItem[];
    savedGames: ConsoleItem[];
    loadApps: () => void;
    mergeGameIntoState: (updated: Partial<ConsoleItem> & { _deleted?: boolean }) => void;
    mergeGameIntoStateRef: React.MutableRefObject<(updated: Partial<ConsoleItem> & { _deleted?: boolean }) => void>;
    syncGamePlaytime: (gameId: string, totalMinutes: number) => void;
    markGameAsLastPlayed: (item: ConsoleItem) => void;
    handleConfirmDeleteGame: (
        deleteConfirmItem: ConsoleItem | null,
        setDeleteConfirmItem: React.Dispatch<React.SetStateAction<ConsoleItem | null>>,
    ) => Promise<void>;
    appsLoaded: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook principal
// ─────────────────────────────────────────────────────────────────────────────

export function useLibrary({
    activeUser,
    steamGames,
    steamGamesRef,
    epicGames,
    epicGamesRef,
    xboxGames,
    xboxGamesRef,
    downloadsByAppId,
    downloadingSteamGames,
    t,
    language: _language,
    uiReady,
    libraryTab,
    setSteamGames,
    setEpicGames,
    setXboxGames,
    selectedItem,
    setSelectedItem,
    setDetailVisible,
    getEffectiveSteamGames,
    currentRenderedTab,
    gamesLimit,
}: UseLibraryOptions): UseLibraryResult {

    // ── Estados de la biblioteca ──────────────────────────────────────────────
    // Inicializa con la fuente persistida para no parpadear con el icono contrario al entrar.
    const [games, setGames] = useState<ConsoleItem[]>(() => getInitialGames(t, getPersistedStoreSource()));
    // Espejo sincrónico para evitar clausuras obsoletas en listeners async.
    const gamesRef = useRef<ConsoleItem[]>([]);
    gamesRef.current = games;

    const [media, setMedia] = useState<ConsoleItem[]>(() => getInitialMedia(t));
    const [lastPlayedGame, setLastPlayedGame] = useState<ConsoleItem | null>(null);
    const [appsLoaded, setAppsLoaded] = useState(false);
    const readySentRef = useRef(false);

    // ── Efecto: limpiar lastPlayedGame si apunta a una tarjeta de sistema ─────
    useEffect(() => {
        if (lastPlayedGame?.id === '1' || lastPlayedGame?.id === '5' || lastPlayedGame?.id === 'more_library') {
            setLastPlayedGame(null);
        }
    }, [lastPlayedGame]);

    // ── Efecto: actualizar tile del Store cuando cambia la fuente ─────────────
    // Usa getStoreTile (única fuente de verdad) para que icono, título y fondo
    // siempre vayan juntos, y loadApps() no pueda dejarlo desincronizado.
    useEffect(() => {
        const source: StoreSource = activeUser?.settings?.storeSource || getPersistedStoreSource();

        setGames((prev) => {
            if (!prev.some((item) => item.id === '5')) return prev;
            const storeTile = getStoreTile(source, t);
            return prev.map((item) =>
                item.id === '5' ? { ...item, ...storeTile } : item
            );
        });
    }, [activeUser?.settings?.storeSource, t]);

    // ── Efecto: ajustar lastPlayedGame cuando steamGames cambia ───────────────
    // Si steamGames se carga/actualiza y tiene un juego con lastPlayed más reciente
    // que lastPlayedGame, aseguramos que la card de último jugado apunte a ese juego.
    useEffect(() => {
        if (steamGames.length === 0) return;
        // Los juegos fijados no deben tomar la tarjeta "Último Jugado" (ya tienen
        // su propio lugar fijo en Inicio, ver `pinnedSteamGames`).
        const played = steamGames.filter(g => g.lastPlayed && !g.isPinned);
        if (played.length === 0) return;
        played.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
        const mostRecentSteam = played[0];
        if (mostRecentSteam && (!lastPlayedGame || !lastPlayedGame.lastPlayed || (mostRecentSteam.lastPlayed || 0) > (lastPlayedGame.lastPlayed || 0))) {
            setLastPlayedGame(mostRecentSteam);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [steamGames]);

    // ── Efecto: auto-sync online de la biblioteca ─────────────────────────────
    // Ante cualquier cambio en los juegos se programa una subida silenciosa
    // (con debounce dentro del servicio).
    const onlineLibraryFingerprint = useMemo(() => fingerprintOnlineLibrary(games), [games]);
    useEffect(() => {
        const settings: any = activeUser?.settings || {};
        notifyOnlineLibraryChanged(gamesRef.current, {
            linkedOnlineUserId: settings.onlineUserId,
            steamId: settings.steamId,
            steamApiKey: settings.steamApiKey,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        onlineLibraryFingerprint,
        (activeUser?.settings as any)?.onlineUserId,
        activeUser?.settings?.steamId,
    ]);

    // ── Efecto: wps5-home-ready (necesita uiReady + appsLoaded) ──────────────
    useEffect(() => {
        if (!uiReady || !appsLoaded || readySentRef.current) return;
        readySentRef.current = true;

        // Disparar 'wps5-home-ready' solo cuando el fondo del carrusel activo
        // esté decodificado por el navegador, evitando el flash negro al entrar.
        // Si el fondo es un require() local (objeto con 'uri' o number) lo
        // resolvemos a string; si tarda más de 2s, disparamos igual (seguridad).
        const dispatchReady = () => window.dispatchEvent(new Event('wps5-home-ready'));

        // Resolver URI de la imagen de fondo actual
        // Intentar con el homeBackground del usuario (la imagen más probable de
        // no estar cacheada) y luego con el backgroundImage del item activo.
        const bgValue = (() => {
            try {
                // homeBackground es la imagen personalizada del usuario para el home.
                // Si es una URL remota o local-file://, precargarla es lo más útil.
                const hb = (activeUser?.settings as any)?.homeBackground;
                if (typeof hb === 'string' && hb) return hb;
                if (hb && typeof hb === 'object' && typeof (hb as any).uri === 'string') return (hb as any).uri;
                // Fallback: backgroundImage del item activo (index 1 = last_played o primer juego)
                const item = games[1];
                const bg = item?.backgroundImage;
                if (typeof bg === 'string') return bg;
                if (bg && typeof bg === 'object' && typeof (bg as any).uri === 'string') return (bg as any).uri;
            } catch {/* noop */ }
            return null;
        })();

        if (!bgValue || Platform.OS !== 'web') {
            // Sin URI concreta o fuera de web: esperar un frame extra para que
            // React pinte el primer frame del home antes de retirar el overlay.
            requestAnimationFrame(() => requestAnimationFrame(() =>
                setTimeout(dispatchReady, 150)
            ));
            return;
        }

        // Precargar la imagen de fondo; cuando cargue (o falle/timeout) avisar.
        let fired = false;
        const fire = () => { if (!fired) { fired = true; dispatchReady(); } };
        const safety = setTimeout(fire, 2000);
        const img = new window.Image();
        img.onload = () => { clearTimeout(safety); requestAnimationFrame(() => requestAnimationFrame(fire)); };
        img.onerror = () => { clearTimeout(safety); fire(); };
        img.src = bgValue;
        return () => { clearTimeout(safety); fired = true; };
    }, [uiReady, appsLoaded]);

    // ── Memos derivados ───────────────────────────────────────────────────────

    const nonSteamGames = useMemo(
        () => games.filter(item => !item.id.toString().startsWith('steam_') && !item.id.toString().startsWith('epic_') && !item.id.toString().startsWith('xbox_')),
        [games]
    );

    const MEDIA_GALLERY_ITEM: ConsoleItem = {
        id: 'media_gallery',
        title: t('mediaGallery.title'),
        time: 'Capturas y videoclips',
        image: require('@/assets/images/GaleriaMultimedia2.png'),
        isFolder: true,
        type: 'media',
    };

    // Filter out system utility cards from the saved games list
    const savedGames = useMemo(
        () => nonSteamGames.filter(
            item => item.id !== '1' && item.id !== 'last_played' && item.id !== 'more_library' && item.id !== '5' && !item.isFolder && !item.isGrid && (!!item.title && item.title !== 'Juego')
        ),
        [nonSteamGames]
    );

    // NOTA: todo este bloque va en useMemo para que la identidad de los
    // objetos (sobre todo los de Steam, que se clonan con `{ ...g }`) sea
    // estable entre renders. Antes se reconstruía en cada render y cada tarjeta
    // Steam recibía un `item` nuevo, lo que obligaba a expo-image a re-resolver
    // la portada remota justo durante la animación de scale (tirón).
    // Juegos de Steam ya jugados (con lastPlayed) que no se están descargando
    // ahora: deben aparecer como tarjetas normales del carrusel y correrse a
    // la derecha según su fecha de juego, igual que los manuales.
    const lastPlayedGameId = lastPlayedGame?.id;
    const playedSteamGames = useMemo(() => steamGames
        .filter(g => {
            if (!g.lastPlayed) return false;
            if (g.isPinned) return false; // ya se muestra fijo, ver `pinnedSteamGames`
            if (lastPlayedGameId && g.id === lastPlayedGameId) return false; // ya está en "Último Jugado"
            const appId = getSteamAppId(g as any);
            return !(appId && downloadsByAppId.has(appId));
        })
        .map(g => ({ ...g, path: resolveLaunchPath(g) })),
        [steamGames, lastPlayedGameId, downloadsByAppId]);

    // Juegos de Steam fijados: igual que `pinnedManual`, permanecen siempre en
    // Inicio en vez de rotar con los demás recientes (excepto si ahora mismo
    // se están descargando, que ya se muestran arriba en `downloadingSteamGames`).
    const pinnedSteamGames = useMemo(() => steamGames
        .filter(g => {
            if (!g.isPinned) return false;
            const appId = getSteamAppId(g as any);
            return !(appId && downloadsByAppId.has(appId));
        })
        .map(g => ({ ...g, path: resolveLaunchPath(g) })),
        [steamGames, downloadsByAppId]);

    const currentData: ConsoleItem[] = useMemo(() => {
        const BASE_CARD_IDS = ['1', 'last_played', '5'];
        const baseCards = nonSteamGames.filter(g => BASE_CARD_IDS.includes(g.id));
        const otherSavedGames = nonSteamGames.filter(g => !BASE_CARD_IDS.includes(g.id));
        const pinnedManual = otherSavedGames.filter(g => g.isPinned);
        const unpinnedManual = otherSavedGames.filter(g => !g.isPinned);
        const manualWithHistory = unpinnedManual.filter(g => g.lastPlayed);
        const manualWithoutHistory = unpinnedManual.filter(g => !g.lastPlayed);

        const combinedRecent = [...manualWithHistory, ...playedSteamGames]
            .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));

        const combinedOtherGames = [...pinnedManual, ...pinnedSteamGames, ...combinedRecent, ...manualWithoutHistory];

        let data: ConsoleItem[] = currentRenderedTab === 'Games'
            ? [...baseCards, ...downloadingSteamGames, ...combinedOtherGames]
            : media;

        if (currentRenderedTab === 'Games') {
            data = data.slice(0, gamesLimit);
            data.push({
                id: 'more_library',
                title: t('library.viewLibrary'),
                time: t('library.viewAllGames'),
                image: null,
            } as any);
        }
        return data;
    }, [currentRenderedTab, nonSteamGames, downloadingSteamGames, playedSteamGames, pinnedSteamGames, media, t, gamesLimit]);

    const displayedLibraryGames = useMemo(() => {
        // Registros manuales de la DB (ediciones del usuario) que pisan los datos
        // detectados de Steam/Epic/Xbox. Misma lógica que ya existía inline para Steam.
        const dbOverrides = new Map<string, ConsoleItem>();
        games.forEach(g => {
            if ((g.id.startsWith('steam_') || g.id.startsWith('epic_') || g.id.startsWith('xbox_')) && g.title && g.title !== 'Juego') {
                dbOverrides.set(g.id, g);
            }
        });
        const applyDbOverride = (base: ConsoleItem): ConsoleItem => {
            const override = dbOverrides.get(base.id);
            if (!override) return { ...base, path: resolveLaunchPath(base) };
            const merged = {
                ...base,
                ...override,
                title: override.title || base.title,
                image: (override.image && override.image !== require('@/assets/images/Home.gif')) ? override.image : base.image,
                backgroundImage: (override.backgroundImage && override.backgroundImage !== require('@/assets/images/FondoDefault2.jpg')) ? override.backgroundImage : base.backgroundImage,
                logo: (override as any).logo || (base as any).logo,
                // `...override` copia `isFavorite: undefined` (o un valor viejo) encima
                // del favorito real del juego; priorizamos el de steamGames/epicGames/xboxGames.
                isFavorite: base.isFavorite ?? override.isFavorite,
            };
            return { ...merged, path: resolveLaunchPath(merged) };
        };
        if (libraryTab === 'installed') {
            const byId = new Map<string, ConsoleItem>();
            epicGames.forEach(game => {
                byId.set(game.id, applyDbOverride(game));
            });
            xboxGames.forEach(game => {
                byId.set(game.id, applyDbOverride(game));
            });
            // Incluimos también los juegos de Steam (colección completa). No
            // filtramos aquí por "instalado": LibraryGrid ya aplica ese filtro
            // internamente usando `installedSteamAppIds`, igual que hace con
            // los demás juegos de esta pestaña. Si los excluimos aquí, jamás
            // llegan a LibraryGrid y no aparecen aunque estén instalados.
            steamGames.forEach(sg => {
                byId.set(sg.id, applyDbOverride(sg));
            });
            savedGames.forEach(game => {
                byId.set(game.id, { ...game, path: resolveLaunchPath(game) });
            });
            const result = Array.from(byId.values());
            result.unshift(MEDIA_GALLERY_ITEM);
            return result;
        }
        return steamGames.map(sg => applyDbOverride(sg));
    }, [libraryTab, savedGames, epicGames, xboxGames, steamGames, games]);

    const searchableLibraryGames = useMemo(() => {
        const byId = new Map<string, ConsoleItem>();
        savedGames.forEach(g => byId.set(g.id, { ...g, path: resolveLaunchPath(g) }));
        steamGames.forEach(g => {
            const existing = byId.get(g.id);
            byId.set(g.id, existing ? { ...g, ...existing, path: resolveLaunchPath(existing) } : { ...g, path: resolveLaunchPath(g) });
        });
        const epicOverrides = new Map<string, ConsoleItem>();
        games.forEach(g => {
            if (g.id.startsWith('epic_') && g.title && g.title !== 'Juego') epicOverrides.set(g.id, g);
        });
        epicGames.forEach(g => {
            const existing = byId.get(g.id);
            const override = epicOverrides.get(g.id);
            const base = override ? { ...g, ...override } : g;
            byId.set(g.id, existing ? { ...base, ...existing } : base);
        });
        const xboxOverrides = new Map<string, ConsoleItem>();
        games.forEach(g => {
            if (g.id.startsWith('xbox_') && g.title && g.title !== 'Juego') xboxOverrides.set(g.id, g);
        });
        xboxGames.forEach(g => {
            const existing = byId.get(g.id);
            const override = xboxOverrides.get(g.id);
            const base = override ? { ...g, ...override } : g;
            byId.set(g.id, existing ? { ...base, ...existing } : base);
        });
        return Array.from(byId.values());
    }, [savedGames, steamGames, epicGames, xboxGames, games]);

    const searchableMedia = useMemo(() => media, [media]);

    // ── Función: cargar apps desde Electron IPC ───────────────────────────────
    const loadApps = useCallback(() => {
        if (Platform.OS === 'web' && (window as any).electronAPI) {
            (window as any).electronAPI.getApps().then((data: any) => {
                // Convierte una ruta o URL guardada al formato { uri } de expo-image.
                // Los valores no-string se ignoran para que un registro corrupto
                // nunca rompa el refresco de toda la lista.
                const toUri = (v: unknown) => {
                    if (typeof v !== 'string' || !v) return null;
                    if (v.startsWith('http')) return { uri: v };
                    const clean = v.replace(/^local-file:\/+/, '').replace(/\\/g, '/');
                    return { uri: `local-file:///${clean}` };
                };
                const formatApp = (app: any) => ({
                    id: app.id,
                    title: app.title,
                    time: app.type === 'game' ? (app.platform || t('cc.typeGame')) : (app.type === 'web' ? 'Web App' : 'Media'),
                    image: app.imageBase64
                        ? { uri: app.imageBase64 }
                        : (toUri(app.image)
                            ?? (app.id === 'spotify_default' ? require('@/assets/images/spotify_portada.png') : (app.type === 'web' ? require('@/assets/images/web_default.jpg') : require('@/assets/images/Home.gif')))
                        ),
                    logo: app.logoBase64 ? { uri: app.logoBase64 } : (toUri(app.logo)
                        ?? (app.id === 'spotify_default' ? require('@/assets/images/spotify_logo.png') : null)),
                    backgroundImage: app.backgroundImageBase64
                        ? { uri: app.backgroundImageBase64 }
                        : (toUri(app.backgroundImage)
                            ?? (app.id === 'spotify_default' ? require('@/assets/images/spotify_fondo.png') : require('@/assets/images/FondoDefault2.jpg'))
                        ),
                    video: toUri(app.video),
                    focusAudio: app.focusAudio,
                    path: app.path,
                    launchArgs: app.launchArgs,
                    description: app.description || (app.id === 'spotify_default' ? t('home.musicDesc') : ''),
                    rating: app.rating,
                    publisher: app.publisher,
                    genres: app.genres,
                    releaseDate: app.releaseDate,
                    gameId: app.gameId,
                    isFavorite: app.isFavorite,
                    lastPlayed: app.lastPlayed,
                    playtimeMinutes: Number(app.playtimeMinutes ?? app.playtime_forever ?? 0),
                    playtime_forever: Number(app.playtime_forever ?? app.playtimeMinutes ?? 0),
                    youtubeId: app.youtubeId,
                    type: app.type,
                    platform: app.platform,
                    retroSystem: app.retroSystem,
                    isPinned: app.isPinned,
                });
                const validRawGames = (data.games || []).filter((app: any) => {
                    if (!app || !app.id) return false;
                    if (app.id === '1' || app.id === '5' || app.id === 'last_played' || app.id === 'more_library') return false;
                    const isSteamOrEpic = app.id.toString().startsWith('steam_') || app.id.toString().startsWith('epic_');
                    if (isSteamOrEpic && (!app.title || app.title.trim() === '' || app.title === 'Juego')) {
                        return false;
                    }
                    return true;
                });
                const gamesList = validRawGames.map(formatApp);
                const mediaList = (data.media || []).map(formatApp);

                // Respeta la fuente elegida (Steam o PS5) para no revertir el icono al recargar la lista.
                const storeSource: StoreSource = activeUser?.settings?.storeSource || getPersistedStoreSource();
                const initialGames = getInitialGames(t, storeSource);
                const home = initialGames.find(g => g.id === '1');
                const lastPlayed = initialGames.find(g => g.id === 'last_played');
                const favGames = initialGames.find(g => g.id === '3');
                const favMedia = initialGames.find(g => g.id === '4');
                const ps5store = initialGames.find(g => g.id === '5');

                const baseItems = [ps5store, home, lastPlayed, favGames, favMedia].filter(Boolean) as ConsoleItem[];

                // Find the most recently played game/media across all sources (manual, steam, epic, xbox, media)
                const currentSteamGames = getEffectiveSteamGames();
                const currentEpicGames = epicGamesRef.current;
                const currentXboxGames = xboxGamesRef.current;
                const allFormatted = [
                    ...gamesList,
                    ...mediaList,
                    ...currentSteamGames,
                    ...currentEpicGames,
                    ...currentXboxGames,
                ];
                const sortedByLastPlayed = allFormatted
                    // Un juego fijado no debe convertirse en "Último Jugado": ya tiene
                    // su propio lugar fijo en Inicio, y si se le excluyera de
                    // `gamesList` más abajo (para "no duplicar" con esa tarjeta)
                    // desaparecería por completo de su lugar fijado.
                    .filter((i: any) => i.lastPlayed && !i.isPinned && i.id !== '1' && i.id !== '5' && i.id !== 'last_played' && i.id !== 'more_library')
                    .sort((a: any, b: any) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
                let latestGame = sortedByLastPlayed[0] || null;

                if (latestGame && (latestGame.id?.toString().startsWith('steam_') || latestGame.id?.toString().startsWith('epic_') || latestGame.id?.toString().startsWith('xbox_'))) {
                    const richVersion = currentSteamGames.find(g => g.id === latestGame!.id) ||
                        currentEpicGames.find(g => g.id === latestGame!.id) ||
                        currentXboxGames.find(g => g.id === latestGame!.id);
                    if (richVersion) {
                        latestGame = {
                            ...richVersion,
                            lastPlayed: latestGame.lastPlayed,
                            playtimeMinutes: latestGame.playtimeMinutes ?? richVersion.playtimeMinutes,
                            playtime_forever: latestGame.playtime_forever ?? richVersion.playtime_forever,
                        };
                    }
                }

                // Exclude last played game from the row to avoid duplication.
                // Sort remaining games: most recently played first, then unplayed in original order.
                const gamesWithoutLastPlayed = (latestGame && latestGame.id !== '1' && latestGame.id !== '5')
                    ? gamesList.filter((g: any) => g.id !== latestGame.id)
                    : gamesList;
                const pinnedGames = gamesWithoutLastPlayed.filter((g: any) => g.isPinned);
                const gamesWithHistory = gamesWithoutLastPlayed
                    .filter((g: any) => g.lastPlayed && !g.isPinned)
                    .sort((a: any, b: any) => b.lastPlayed - a.lastPlayed);
                const gamesWithoutHistory = gamesWithoutLastPlayed.filter((g: any) => !g.lastPlayed && !g.isPinned);
                const sortedGames = [...pinnedGames, ...gamesWithHistory, ...gamesWithoutHistory];

                setGames([...baseItems, ...sortedGames]);
                // La librería local ya está cargada: el auto-sync online puede empezar
                // a programar subidas (antes no, para no podar el catálogo remoto).
                markOnlineLibraryLoaded();

                const initialMedia = getInitialMedia(t);
                const filteredDataMedia = initialMedia.filter((defaultItem: any) =>
                    !mediaList.some((userItem: any) => userItem.id === defaultItem.id)
                );
                setMedia([...filteredDataMedia, ...mediaList.reverse()]);

                if (latestGame && latestGame.id !== '1' && latestGame.id !== '5') {
                    setLastPlayedGame(latestGame);
                } else {
                    setLastPlayedGame(null);
                }
                setAppsLoaded(true);
            }).catch((e: any) => {
                console.error('[loadApps] Error refrescando la lista:', e);
                setAppsLoaded(true); // no dejar el overlay esperando si falla
            });
        } else {
            setAppsLoaded(true); // sin Electron no hay nada que cargar
        }
    }, [activeUser, t, getEffectiveSteamGames, epicGamesRef, xboxGamesRef]);

    // ── Función: actualizar playtime tras cerrar un juego ─────────────────────
    const syncGamePlaytime = useCallback((gameId: string, totalMinutes: number) => {
        setGames(prev => prev.map(item => item.id !== gameId ? item : { ...item, playtimeMinutes: totalMinutes, playtime_forever: totalMinutes }));
        setSteamGames(prev => {
            const updated = prev.map(item => item.id !== gameId ? item : { ...item, playtimeMinutes: totalMinutes, playtime_forever: totalMinutes });
            steamGamesRef.current = updated;
            const steamId = activeUser?.settings?.steamId;
            if (steamId) {
                try { localStorage.setItem(`steam_games_${steamId}`, JSON.stringify(updated)); } catch (e) { /* noop */ }
            }
            return updated;
        });
        setLastPlayedGame(prev => prev && prev.id === gameId ? { ...prev, playtimeMinutes: totalMinutes, playtime_forever: totalMinutes } : prev);

        const isSteamOrEpic = gameId.startsWith('steam_') || gameId.startsWith('epic_');
        if (!isSteamOrEpic && (window as any).electronAPI?.updateApp) {
            (window as any).electronAPI.updateApp({
                id: gameId,
                playtimeMinutes: totalMinutes,
                playtime_forever: totalMinutes,
            });
        }
    }, [activeUser?.settings?.steamId, setSteamGames, steamGamesRef]);

    // ── Función: marcar un juego como último jugado ───────────────────────────
    const markGameAsLastPlayed = useCallback((item: ConsoleItem) => {
        if (!item || !item.id || item.id === '1' || item.id === '5' || item.id === 'last_played' || item.id === 'more_library' || item.isLastPlayed || item.isFolder || item.isGrid) {
            return;
        }
        const now = Date.now();
        const id = item.id;
        const isSteamOrEpicOrXbox = id.startsWith('steam_') || id.startsWith('epic_') || id.startsWith('xbox_');

        setGames(prev => prev.map(g => g.id === id ? { ...g, lastPlayed: now } : g));

        if (isSteamOrEpicOrXbox) {
            setSteamGames(prev => {
                if (!prev.some(g => g.id === id)) return prev;
                const updated = prev.map(g => g.id === id ? { ...g, lastPlayed: now } : g);
                steamGamesRef.current = updated;
                const steamId = activeUser?.settings?.steamId;
                if (steamId) {
                    try { localStorage.setItem(`steam_games_${steamId}`, JSON.stringify(updated)); } catch (e) { /* noop */ }
                }
                return updated;
            });
            setEpicGames(prev => {
                const updated = prev.map(g => g.id === id ? { ...g, lastPlayed: now } : g);
                epicGamesRef.current = updated;
                return updated;
            });
            setXboxGames(prev => {
                const updated = prev.map(g => g.id === id ? { ...g, lastPlayed: now } : g);
                xboxGamesRef.current = updated;
                return updated;
            });
        }

        // Un juego fijado ya tiene su propio lugar permanente en Inicio (ver
        // `pinnedManual`/`pinnedSteamGames`), así que no debe además tomar la
        // tarjeta "Último Jugado" — si lo hiciera, se vería dos veces a la vez
        // (una como fijado y otra como "Último Jugado"). Seguimos guardando su
        // `lastPlayed` arriba por si se desfija más adelante.
        if (!item.isPinned) {
            setLastPlayedGame({ ...item, lastPlayed: now });
        }

        // Los juegos manuales ya guardan lastPlayed vía main.js al lanzarlos;
        // para Steam/Epic/Xbox evitamos crear un registro "fantasma" sin título/portada
        // en games.json y confiamos en el estado en memoria + caché local.
        if (!isSteamOrEpicOrXbox && Platform.OS === 'web' && (window as any).electronAPI?.updateApp) {
            (window as any).electronAPI.updateApp({ id, lastPlayed: now });
        }
    }, [activeUser?.settings?.steamId, setSteamGames, setEpicGames, setXboxGames, steamGamesRef, epicGamesRef, xboxGamesRef]);

    // ── Función: merge optimista de un juego en todos los estados ─────────────
    // Con `_deleted: true` elimina el juego de todos los estados al instante.
    const mergeGameIntoState = useCallback((updated: Partial<ConsoleItem> & { _deleted?: boolean }) => {
        if (!updated.id) return;
        const id = updated.id;

        if ((updated as any)._deleted) {
            setGames(prev => prev.filter(g => g.id !== id));
            setSteamGames(prev => {
                const updatedList = prev.filter(g => g.id !== id);
                const steamId = activeUser?.settings?.steamId;
                if (steamId) {
                    try {
                        localStorage.setItem(`steam_games_${steamId}`, JSON.stringify(updatedList));
                    } catch (e) { }
                }
                return updatedList;
            });
            if (selectedItem && selectedItem.id === id) {
                setDetailVisible(false);
                setSelectedItem(null);
            }
            if (lastPlayedGame && lastPlayedGame.id === id) {
                setLastPlayedGame(null);
            }
            return;
        }

        const formatUpdated = (existing: ConsoleItem): ConsoleItem => {
            const merged = { ...existing };
            Object.entries(updated).forEach(([key, value]) => {
                if (key === '_deleted') return;
                if (value !== '' && value !== null && value !== undefined) {
                    (merged as any)[key] = value;
                }
            });
            // Re-wrap image/logo/backgroundImage URLs into { uri } format like loadApps does
            (['image', 'logo', 'backgroundImage'] as const).forEach(field => {
                const val = (merged as any)[field];
                if (typeof val === 'string') {
                    if (val.startsWith('http')) {
                        (merged as any)[field] = { uri: val };
                    } else {
                        const clean = val.replace(/^local-file:\/+/, '').replace(/\\/g, '/');
                        (merged as any)[field] = { uri: `local-file:///${clean}` };
                    }
                }
            });
            return merged;
        };

        if (id.startsWith('steam_')) {
            setSteamGames(prev => {
                const updatedList = prev.map(g => g.id === id ? formatUpdated(g) : g);
                const steamId = activeUser?.settings?.steamId;
                if (steamId) {
                    try {
                        localStorage.setItem(`steam_games_${steamId}`, JSON.stringify(updatedList));
                    } catch (e) { }
                }
                return updatedList;
            });
        }

        if (id.startsWith('epic_')) {
            setEpicGames(prev => {
                if (prev.some(g => g.id === id)) {
                    return prev.map(g => g.id === id ? formatUpdated(g) : g);
                }
                return [...prev, formatUpdated({ id } as ConsoleItem)];
            });
        }

        if (id.startsWith('xbox_')) {
            setXboxGames(prev => {
                const updatedList = prev.some(g => g.id === id)
                    ? prev.map(g => g.id === id ? formatUpdated(g) : g)
                    : [...prev, formatUpdated({ id } as ConsoleItem)];
                // Persist to localStorage so useSteamSync restores the user's
                // custom artwork (cover / background / logo) on next launcher start,
                // instead of re-fetching from SteamGridDB and overwriting them.
                try {
                    localStorage.setItem('xbox_games_cache', JSON.stringify(updatedList));
                } catch (e) { /* noop -- quota errors should not break the update */ }
                return updatedList;
            });
        }

        if (selectedItem && selectedItem.id === id) {
            setSelectedItem(prev => prev ? formatUpdated(prev) : null);
        }

        // El juego "Último Jugado" vive en su propio estado, separado de `games`/`steamGames`
        // (ver nota de arquitectura sobre lastPlayedGame). Si no se actualiza aquí también,
        // lanzar desde el carrusel de Inicio sigue usando el objeto viejo (sin launchArgs, etc.)
        // aunque ya se haya guardado el cambio en la DB.
        if (lastPlayedGame && lastPlayedGame.id === id) {
            setLastPlayedGame(prev => prev ? formatUpdated(prev) : null);
        }

        setGames(prev => {
            const exists = prev.some(g => g.id === id);
            if (exists) {
                return prev.map(g => g.id === id ? formatUpdated(g) : g);
            }
            // New entry (e.g. first Steam artwork save) — add it to the list
            const newGame: any = { ...updated };
            (['image', 'logo', 'backgroundImage'] as const).forEach(field => {
                const val = newGame[field];
                if (typeof val === 'string') {
                    if (val.startsWith('http')) {
                        newGame[field] = { uri: val };
                    } else {
                        const clean = val.replace(/^local-file:\/+/, '').replace(/\\/g, '/');
                        newGame[field] = { uri: `local-file:///${clean}` };
                    }
                }
            });
            return [...prev, newGame];
        });
    }, [activeUser?.settings?.steamId, setSteamGames, setEpicGames, setXboxGames, selectedItem, setSelectedItem, setDetailVisible, lastPlayedGame]);

    // Ref estable para que callbacks async siempre usen la versión actual
    const mergeGameIntoStateRef = useRef(mergeGameIntoState);
    useEffect(() => {
        mergeGameIntoStateRef.current = mergeGameIntoState;
    });

    // ── Función: confirmar borrado de un juego ────────────────────────────────
    const handleConfirmDeleteGame = useCallback(async (
        deleteConfirmItem: ConsoleItem | null,
        setDeleteConfirmItem: React.Dispatch<React.SetStateAction<ConsoleItem | null>>,
    ) => {
        const target = deleteConfirmItem;
        if (!target) return;
        setDeleteConfirmItem(null);

        if (Platform.OS === 'web' && (window as any).electronAPI?.deleteApp) {
            const result = await (window as any).electronAPI.deleteApp(target.id);
            if (result?.success) {
                setGames(prev => prev.filter(g => g.id !== target.id));
                setSteamGames(prev => prev.filter(g => g.id !== target.id));
                if (selectedItem?.id === target.id) {
                    setDetailVisible(false);
                    setSelectedItem(null);
                }
                loadApps();
            } else {
                toastService.show('toast.error');
            }
        }
    }, [setSteamGames, selectedItem, setDetailVisible, setSelectedItem, loadApps]);

    // ─────────────────────────────────────────────────────────────────────────
    // Retorno del hook
    // ─────────────────────────────────────────────────────────────────────────
    return {
        games,
        setGames,
        gamesRef,
        media,
        setMedia,
        lastPlayedGame,
        setLastPlayedGame,
        currentData,
        displayedLibraryGames,
        searchableLibraryGames,
        searchableMedia,
        nonSteamGames,
        savedGames,
        loadApps,
        mergeGameIntoState,
        mergeGameIntoStateRef,
        syncGamePlaytime,
        markGameAsLastPlayed,
        handleConfirmDeleteGame,
        appsLoaded,
    };
}
