import { useTranslation } from '@/contexts/LanguageContext';
import type { SteamDownloadItem } from '@/hooks/useSteamDownloads';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ConsoleItem } from '../app/(tabs)/index';
import { useAchievementWatcher } from '../hooks/useAchievementWatcher';
import {
  fetchAwGameAchievements,
  fetchPcGameAchievements, // juegos PC manuales — detecta AppID desde el exe
  fetchRpcs3Trophies,
  fetchRpcs3TrophiesFromLnk,
  getCachedAwAchievements,
  getRpcs3AppId,
} from '../services/achievementWatcherService';
import { formatPlaytime } from '../services/playtimeService';
import { getGameActionLabel, getSteamAppId } from '../services/steamLaunchService';
import { fetchSteamGameAchievements, getCachedSteamGameAchievements, SteamGameAchievementsSummary } from '../services/steamUserService';
import MusicPlayerCard from './MusicPlayerCard';
import SpinningBorderNoticias from './SpinningborderNoticias';

// ─── Shimmer skeleton placeholder (usado mientras cargan capturas/noticias) ──
// Evita que las filas de "Capturas y trailers" / "Últimas noticias" aparezcan
// de golpe: muestra cards vacías con un barrido de brillo hasta que llegan
// los datos reales, en vez de un simple ícono de "cargando".
function ShimmerSkeletonCard({
  width,
  height,
  borderRadius = 8,
  style,
}: {
  width: number;
  height: number;
  borderRadius?: number;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.06)',
          position: 'relative',
        },
        style,
      ]}
    >
      {Platform.OS === 'web' && (
        <>
          <style>
            {`
              @keyframes gip-skeleton-sweep {
                0% { background-position: -150% 0; }
                100% { background-position: 250% 0; }
              }
              .gip-skeleton-sweep {
                position: absolute;
                inset: 0;
                background: linear-gradient(
                  90deg,
                  rgba(255,255,255,0.02) 0%,
                  rgba(255,255,255,0.02) 35%,
                  rgba(255,255,255,0.15) 50%,
                  rgba(255,255,255,0.02) 65%,
                  rgba(255,255,255,0.02) 100%
                );
                background-size: 260% 100%;
                animation: gip-skeleton-sweep 1.6s ease-in-out infinite;
              }
            `}
          </style>
          {/* @ts-ignore */}
          <div className="gip-skeleton-sweep" />
        </>
      )}
    </View>
  );
}

interface GameInfoPanelProps {
  activeItem: ConsoleItem;
  activeIndex: number;
  lastPlayedGame: ConsoleItem | null;
  focusArea: string;
  gamePanelFocusIndex: number;
  setGamePanelFocusIndex: (index: number) => void;
  setFocusArea: (area: any) => void;
  handleLaunchApp: (item: ConsoleItem) => void;
  setSelectedItem: (item: ConsoleItem) => void;
  setDetailVisible: (visible: boolean) => void;
  steamMedia: any[];
  mediaLoading: boolean;
  setSelectedMediaIndex: (index: number | null) => void;
  steamNews: any[];
  newsLoading: boolean;
  activeUser: any;
  windowWidth: number;
  windowHeight: number;

  // Animated Styles passed from parent
  gameInfoPanelStyle: any;
  spacerStyle: any;
  infoCardsStyle: any;
  topPanelStyle: any;
  installedSteamAppIds?: Set<string> | null;
  activeDownload?: SteamDownloadItem | null;
  onAchievementCountChange?: (count: number) => void;
}

export const GameInfoPanel = ({
  activeItem,
  activeIndex,
  lastPlayedGame,
  focusArea,
  gamePanelFocusIndex,
  setGamePanelFocusIndex,
  setFocusArea,
  handleLaunchApp,
  setSelectedItem,
  setDetailVisible,
  steamMedia,
  mediaLoading,
  setSelectedMediaIndex,
  steamNews,
  newsLoading,
  activeUser,
  windowWidth,
  windowHeight,
  gameInfoPanelStyle,
  spacerStyle,
  infoCardsStyle,
  topPanelStyle,
  installedSteamAppIds = null,
  activeDownload = null,
  onAchievementCountChange,
}: GameInfoPanelProps) => {
  const { t } = useTranslation();
  const displayTitle = activeItem?.isLastPlayed ? (lastPlayedGame ? lastPlayedGame.title : t('lastPlayed.title')) : activeItem?.title;
  const displayLogo = activeItem?.isLastPlayed ? lastPlayedGame?.logo : activeItem?.logo;
  const playtimeItem = activeItem?.isLastPlayed ? lastPlayedGame : activeItem;
  const canPlay = activeItem && !activeItem.isFolder && !activeItem.isGrid && activeItem.id !== '1' && activeItem.id !== 'more_library';
  const isSpotify = activeItem?.title?.toLowerCase()?.includes('spotify');
  const isMediaSection = activeItem?.type === 'media' || activeItem?.type === 'web' || isSpotify;
  // Scale factor: 1.0 at 1080p, shrinks proportionally for smaller screens.
  const scale = Math.min(
    Math.max(Math.max(windowWidth / 1920, windowHeight / 1080), 0.6),
    1.25
  );
  const s = (v: number) => Math.round(v * scale);
  const achievementGame = activeItem?.isLastPlayed ? lastPlayedGame : activeItem;
  const achievementAppId = achievementGame ? getSteamAppId(achievementGame) : null;
  const rpcs3AppId = achievementGame ? getRpcs3AppId(achievementGame) : null;
  const steamId = activeUser?.settings?.steamId;

  // ── AchievementWatcher: detectar si el servidor local está corriendo ──────
  const { isAvailable: awAvailable } = useAchievementWatcher();

  // ── Indicador de fuente de logros para mostrar badge en la UI ─────────────
  // 'steam'  → logros de Steam API (cuenta legítima)
  // 'aw'     → logros leídos por AchievementWatcher (juego emulado/externo)
  // 'rpcs3'  → trofeos de RPCS3
  // null     → sin logros
  const [achievementsSource, setAchievementsSource] = React.useState<'steam' | 'aw' | 'rpcs3' | null>(null);

  // Inicialización sincrónica desde caché ─────────────────────────────────────
  const [steamAchievements, setSteamAchievements] = React.useState<SteamGameAchievementsSummary | null>(() => {
    // Caché Steam legítimo
    if (steamId && achievementAppId) {
      const cached = getCachedSteamGameAchievements(steamId, Number(achievementAppId));
      if (cached !== undefined) return cached;
    }
    // Caché AchievementWatcher (juego externo con appId Steam)
    if (achievementAppId && !steamId) {
      const awKey = achievementAppId;
      const awCached = getCachedAwAchievements(awKey, 'local');
      if (awCached !== undefined) return awCached;
    }
    return null;
  });
  const [achievementsLoading, setAchievementsLoading] = React.useState(false);

  React.useEffect(() => {
    const apiKey = process.env.EXPO_PUBLIC_STEAM_API_KEY || 'B1F361EA3C07B455DC8B0D06ED179B00';

    // ── RPCS3: leer trofeos via proceso Electron ─────────────────────────────
    if (rpcs3AppId) {
      const rpcs3Dir = (activeUser?.settings as any)?.rpcs3Path ?? null;

      console.log('[RPCS3]', {
        title: achievementGame?.title,
        platform: achievementGame?.platform,
        path: achievementGame?.path,
        rpcs3AppId,
        rpcs3Dir,
        isLnk: typeof achievementGame?.path === 'string' && achievementGame.path.toLowerCase().endsWith('.lnk'),
      });

      if (!rpcs3Dir) {
        // Sin rpcs3Path configurado, no hay nada que hacer silenciosamente.
        setSteamAchievements(null);
        setAchievementsSource(null);
        setAchievementsLoading(false);
        return;
      }

      const gamePath: string | null = achievementGame?.path ?? null;
      const isLnk = typeof gamePath === 'string' && gamePath.toLowerCase().endsWith('.lnk');

      let cancelled = false;
      setSteamAchievements(null);
      setAchievementsSource(null);
      setAchievementsLoading(false);

      const timer = setTimeout(() => {
        setAchievementsLoading(true);

        // Dos variantes: .lnk (juego añadido como acceso directo desde ES-DE / escritorio)
        // o path directo a una carpeta dentro de RPCS3.
        const trophyPromise = isLnk
          ? fetchRpcs3TrophiesFromLnk(gamePath!, rpcs3Dir)
          : fetchRpcs3Trophies(rpcs3Dir, rpcs3AppId);

        trophyPromise.then((summary) => {
          if (cancelled) return;
          setSteamAchievements(summary);
          setAchievementsSource(summary ? 'rpcs3' : null);
        }).catch(() => {
          if (!cancelled) {
            setSteamAchievements(null);
            setAchievementsSource(null);
          }
        }).finally(() => {
          if (!cancelled) setAchievementsLoading(false);
        });
      }, 300);

      return () => {
        cancelled = true;
        clearTimeout(timer);
        setAchievementsLoading(false);
      };
    }

    // ── Juego con Steam AppID ─────────────────────────────────────────────────
    // Para juegos PC manuales, achievementAppId es null — se continúa abajo.
    if (!achievementAppId) {
      // Antes de salir, verificar si es un juego PC que puede tener logros por exe
      const isPcEarly = achievementGame?.platform?.toUpperCase() === 'PC'
                     || achievementGame?.platform?.toUpperCase() === 'WINDOWS';
      const pathEarly = achievementGame?.path ?? null;
      const isExeEarly = typeof pathEarly === 'string'
                      && (pathEarly.endsWith('.exe') || pathEarly.endsWith('.bat'));
      const hasApiEarly = typeof (window as any)?.electronAPI?.getPcGameAchievements === 'function';

      if (!(isPcEarly && isExeEarly && hasApiEarly)) {
        setSteamAchievements(null);
        setAchievementsSource(null);
        setAchievementsLoading(false);
        return;
      }
      // Si es un juego PC con API disponible, continuar hasta la rama PC más abajo
    }

    // ── Ruta Steam legítimo (cuenta configurada) ──────────────────────────────
    if (steamId && achievementAppId) {
      // 1. Caché instantánea
      const cached = getCachedSteamGameAchievements(steamId, Number(achievementAppId));
      if (cached !== undefined) {
        setSteamAchievements(cached);
        setAchievementsSource(cached ? 'steam' : null);
        setAchievementsLoading(false);
        return;
      }

      // 2. Fetch con debounce de 300 ms
      setSteamAchievements(null);
      setAchievementsSource(null);
      setAchievementsLoading(false);

      let cancelled = false;
      const timer = setTimeout(() => {
        setAchievementsLoading(true);
        fetchSteamGameAchievements(apiKey, steamId, Number(achievementAppId)).then((summary) => {
          if (cancelled) return;

          if (summary) {
            // Steam legítimo devolvió datos
            setSteamAchievements(summary);
            setAchievementsSource('steam');
            setAchievementsLoading(false);
          } else if (awAvailable) {
            // Steam no devolvió nada (perfil privado, juego sin estadísticas...)
            // Intentar AchievementWatcher como fallback
            fetchAwGameAchievements(Number(achievementAppId), steamId).then((awSummary) => {
              if (!cancelled) {
                setSteamAchievements(awSummary);
                setAchievementsSource(awSummary ? 'aw' : null);
                setAchievementsLoading(false);
              }
            });
          } else {
            setSteamAchievements(null);
            setAchievementsSource(null);
            setAchievementsLoading(false);
          }
        });
      }, 300);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // ── Ruta AchievementWatcher puro (sin cuenta Steam configurada) ───────────
    // Se activa cuando hay un appId Steam en el juego pero no hay steamId de
    // usuario: típicamente juegos con emulador (Codex, Goldberg, etc.) añadidos
    // manualmente a la librería.
    if (awAvailable && achievementAppId) {
      // 1. Caché instantánea
      const awCached = getCachedAwAchievements(achievementAppId, 'local');
      if (awCached !== undefined) {
        setSteamAchievements(awCached);
        setAchievementsSource(awCached ? 'aw' : null);
        setAchievementsLoading(false);
        return;
      }

      // 2. Fetch con debounce de 300 ms
      setSteamAchievements(null);
      setAchievementsSource(null);
      setAchievementsLoading(false);

      let cancelled = false;
      const timer = setTimeout(() => {
        setAchievementsLoading(true);
        fetchAwGameAchievements(Number(achievementAppId), 'local').then((summary) => {
          if (!cancelled) {
            setSteamAchievements(summary);
            setAchievementsSource(summary ? 'aw' : null);
            setAchievementsLoading(false);
          }
        });
      }, 300);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // ── Juego PC manual (platform="PC") sin Steam AppID en el id ─────────────
    // Detecta el AppID leyendo steam_emu.ini / steam_appid.txt / CreamAPI.ini
    // en el directorio del ejecutable del juego.
    const isPcGame = achievementGame?.platform?.toUpperCase() === 'PC'
                  || achievementGame?.platform?.toUpperCase() === 'WINDOWS';
    const gamePath = achievementGame?.path ?? null;
    const hasExePath = typeof gamePath === 'string'
                    && (gamePath.endsWith('.exe') || gamePath.endsWith('.bat'));
    // Detectar disponibilidad directamente, independiente de awAvailable
    const hasPcAchApi = typeof (window as any)?.electronAPI?.getPcGameAchievements === 'function';

    console.log('[PC-ACH]', {
      title: achievementGame?.title,
      platform: achievementGame?.platform,
      isPcGame,
      hasExePath,
      hasPcAchApi,
      awAvailable,
      gamePath,
    });

    if (isPcGame && hasExePath && hasPcAchApi) {
      setSteamAchievements(null);
      setAchievementsSource(null);
      setAchievementsLoading(false);

      const apiKey = process.env.EXPO_PUBLIC_STEAM_API_KEY || 'B1F361EA3C07B455DC8B0D06ED179B00';
      let cancelled = false;
      const timer = setTimeout(() => {
        setAchievementsLoading(true);
        fetchPcGameAchievements(gamePath!, apiKey).then((summary) => {
          if (!cancelled) {
            console.log('[PC-ACH] result:', summary?.total, 'source:', (summary as any)?.source);
            setSteamAchievements(summary);
            setAchievementsSource(summary ? 'aw' : null);
            setAchievementsLoading(false);
          }
        });
      }, 300);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // Sin Steam ni AW disponible
    setSteamAchievements(null);
    setAchievementsSource(null);
    setAchievementsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievementAppId, rpcs3AppId, steamId, awAvailable,
      (activeUser?.settings as any)?.rpcs3Path,
      achievementGame?.path,      // juegos PC: el path del exe identifica el juego
      achievementGame?.platform,  // cambio de plataforma re-ejecuta el fetch
     ]);

  const trophyCounts = steamAchievements?.rarityCounts ?? { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  const trophyProgress = steamAchievements?.total
    ? Math.round((steamAchievements.unlocked / steamAchievements.total) * 100)
    : 0;

  const mediaScrollRef = React.useRef<ScrollView>(null);
  const newsScrollRef = React.useRef<ScrollView>(null);
  const achievementsScrollRef = React.useRef<ScrollView>(null);
  const scrollDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaItemRefs = React.useRef<any[]>([]);
  const newsItemRefs = React.useRef<any[]>([]);

  React.useEffect(() => {
    if (focusArea !== 'game_panel') return;

    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current);
    }

    scrollDebounceRef.current = setTimeout(() => {
      if (gamePanelFocusIndex >= 200) {
        const idx = gamePanelFocusIndex - 200;
        achievementsScrollRef.current?.scrollTo({ x: idx * Math.round(266 * scale), animated: true });
      } else if (gamePanelFocusIndex >= 100) {
        const idx = gamePanelFocusIndex - 100;
        // Solo mueve el ScrollView horizontal; scrollIntoView también desplaza
        // contenedores padre y puede sacar toda la pantalla del viewport.
        mediaScrollRef.current?.scrollTo({ x: idx * Math.round(516 * scale), animated: true });
      } else if (gamePanelFocusIndex >= 4) {
        const idx = gamePanelFocusIndex - 4;
        newsScrollRef.current?.scrollTo({ x: idx * Math.round(336 * scale), animated: true });
      }
    }, 80);

    return () => {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
      }
    };
  }, [gamePanelFocusIndex, focusArea, scale]);

  React.useEffect(() => {
    if (!canPlay || isMediaSection) {
      onAchievementCountChange?.(0);
      return;
    }
    if (steamAchievements) {
      onAchievementCountChange?.(steamAchievements.achievements.length);
    }
  }, [canPlay, isMediaSection, onAchievementCountChange, steamAchievements, achievementsSource]);

  const buttonLabel = getGameActionLabel(activeItem, installedSteamAppIds, {
    play: t('action.play'),
    playMedia: t('action.playMedia'),
    assignPath: t('action.assignPath'),
    download: t('action.download'),
  });

  return (
    <Animated.View style={[styles.gameInfoPanel, gameInfoPanelStyle, { paddingLeft: s(150) }]}>
      <Animated.View style={spacerStyle}>
        <Animated.View style={topPanelStyle}>
          {/* Logo or title — para isLastPlayed mostramos el encabezado estilo PS5 */}
          {activeItem?.isLastPlayed ? (
            <Animated.View key={`continue-${activeIndex}`} entering={FadeInDown.duration(400)}>
              {lastPlayedGame ? (
                <View style={{ flexDirection: 'column', gap: s(8) }}>
                  {/* Etiqueta pequeña superior */}
                  <View style={{
                    alignSelf: 'flex-start',
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    borderRadius: s(4),
                    paddingHorizontal: s(10),
                    paddingVertical: s(3),
                    marginBottom: s(4),
                  }}>
                    <Text style={{
                      color: 'rgba(255,255,255,0.75)',
                      fontSize: s(12),
                      fontFamily: 'SSTMedium',
                      letterSpacing: 0.5,
                    }}>
                      {lastPlayedGame.platform ?? lastPlayedGame.time ?? ''}
                    </Text>
                  </View>
                  {/* Título principal */}
                  <Text style={{
                    color: '#FFFFFF',
                    fontSize: s(36),
                    fontFamily: 'SSTLight',
                    fontWeight: '300',
                    letterSpacing: -0.5,
                    lineHeight: s(42),
                    textShadowColor: 'rgba(0,0,0,0.7)',
                    textShadowOffset: { width: 0, height: 2 },
                    textShadowRadius: 8,
                    maxWidth: s(600),
                  }} numberOfLines={2}>
                    {t('lastPlayed.continueHeading')}
                  </Text>
                  {/* Subtítulo con nombre del juego */}
                  <Text style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: s(16),
                    fontFamily: 'SSTLight',
                    marginTop: s(2),
                    letterSpacing: 0.2,
                  }} numberOfLines={1}>
                    {lastPlayedGame.title}
                  </Text>
                </View>
              ) : (
                /* Sin juego jugado aún — título genérico */
                <Text style={[styles.gameTitle, { fontSize: s(32) }]} numberOfLines={2}>
                  {t('lastPlayed.continueHeading')}
                </Text>
              )}
            </Animated.View>
          ) : displayLogo ? (
            <Animated.View key={`logo-${activeIndex}`} entering={FadeInDown.duration(400)}>
              <Image source={displayLogo} style={[styles.gameLogo, { width: s(400), height: s(220) }]} contentFit="contain" />
            </Animated.View>
          ) : (
            <Animated.View key={`title-${activeIndex}`} entering={FadeInDown.duration(400)}>
              {activeItem?.id !== '1' && (
                <Text style={[styles.gameTitle, { fontSize: s(38) }]} numberOfLines={2}>{displayTitle}</Text>
              )}
            </Animated.View>
          )}

          {/* Action Buttons */}
          {canPlay && (
            <Animated.View
              key={`buttons-${activeIndex}`}
              entering={FadeInDown.duration(400).delay(60)}
              style={[styles.actionButtons, activeItem?.isLastPlayed && { marginTop: s(22) }]}
            >
              {/* PLAY + ... */}
              <View style={styles.mainActions}>
                {activeDownload ? (
                  <View
                    style={[
                      styles.downloadContainer,
                      { width: s(320), height: s(65), borderRadius: s(28), paddingHorizontal: s(24) },
                    ]}
                  >
                    <View style={styles.downloadHeaderRow}>
                      <Text style={[styles.downloadLabel, { fontSize: s(17) }]}>
                        {t('action.downloading')}
                      </Text>
                      <Text style={[styles.downloadPercent, { fontSize: s(17) }]}>
                        {Math.round(activeDownload.percent)}%
                      </Text>
                    </View>
                    <View style={styles.downloadTrack}>
                      <View
                        style={[
                          styles.downloadFill,
                          { width: `${Math.max(2, Math.round(activeDownload.percent))}%` },
                        ]}
                      />
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    id="play-btn"
                    style={[
                      styles.playBtn,
                      {
                        width: s(320),
                        height: s(65),
                        paddingHorizontal: s(52),
                        paddingVertical: s(14),
                        borderRadius: s(28),
                      },
                      focusArea === 'game_panel' && gamePanelFocusIndex === 0 && styles.playBtnFocused
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (activeItem) { handleLaunchApp(activeItem); }
                    }}
                  >
                    <Text style={[
                      styles.playBtnText,
                      { fontSize: s(25) },
                      focusArea === 'game_panel' && gamePanelFocusIndex === 0 && styles.playBtnTextFocused
                    ]}>
                      {buttonLabel}
                    </Text>

                    {Platform.OS === 'web' &&
                      focusArea === 'game_panel' &&
                      gamePanelFocusIndex === 0 && (
                        <>
                          <style>
                            {`
                          /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -5px;
                          left: -6px;
                          right: -6px;
                          bottom: -5px;
                          border-radius: 32px;
                          z-index: 9999;
                          overflow: visible !important;

                          /* ─── AQUÍ OCURRE LA MAGIA DE LA MÁSCARA CUADRADA ─── */
                          /* 1. Definimos dos capas de gradientes básicos como máscaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. ¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estándar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 300%;
                          height: 600%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE --- */
                          @keyframes wc-content-shimmer {
                            0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
                            15% { opacity: 1; }
                            50% { opacity: 1; }
                            70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                            100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                          }
                          .wc-shimmer-line2 {
                            position: absolute;
                            top: 50%;
                            left: 50%;
                            width: 160%; 
                            height: 420%; 
                            background: linear-gradient(
                              to right,
                              transparent 0%,
                              rgba(255, 255, 255, 0.01) 20%,
                              rgba(255, 255, 255, 0.18) 50%, 
                              rgba(255, 255, 255, 0.01) 80%,
                              transparent 100%
                            );
                            animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
                          }
                      `}
                          </style>

                          <div className="wc-spinning-container2">
                            {/* El gradiente cónico gira aquí adentro, siendo recortado perfectamente por el padre */}
                            <div className="wc-spinning-inner" />
                          </div>
                        </>
                      )}

                    {/* SHIMMER */}
                    {Platform.OS === 'web' && focusArea === 'game_panel' && gamePanelFocusIndex === 0 && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 1,
                          right: 1,
                          bottom: 0,
                          borderRadius: 30,
                          zIndex: 5,
                          overflow: 'hidden',
                        } as any}
                        pointerEvents="none"
                      >
                        {/* @ts-ignore */}
                        <div className="wc-shimmer-line2" />
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  id="more-btn"
                  style={[
                    styles.moreBtn,
                    {
                      width: s(62),
                      height: s(62),
                      borderRadius: s(31),
                    },
                    focusArea === 'game_panel' && gamePanelFocusIndex === 1 && styles.moreBtnFocused
                  ]}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (activeItem) {
                      const target = activeItem.isLastPlayed ? lastPlayedGame : activeItem;
                      if (target) {
                        setSelectedItem(target);
                        setDetailVisible(true);
                      } else {
                        alert(t('game.noPlayedGame'));
                      }
                    }
                  }}
                >
                  <Text style={[
                    styles.moreBtnText,
                    { fontSize: s(22) },
                    focusArea === 'game_panel' && gamePanelFocusIndex === 1 && styles.moreBtnTextFocused
                  ]}>···</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.playtimeWrapper}>
                <View style={[styles.playtimeContainer, { minHeight: s(62), minWidth: s(100) }]}>
                  <MaterialCommunityIcons name="clock" size={s(22)} color="rgba(255, 255, 255, 0.97)" />
                  <Text style={[styles.playtimeText, { fontSize: s(16) }]} numberOfLines={1}>
                    {formatPlaytime(Number(playtimeItem?.playtimeMinutes ?? playtimeItem?.playtime_forever ?? 0), t as any)}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>

      {/* Info Cards (Trophies & Friends) */}
      {canPlay && (
        <Animated.View
          key={`cards-${activeIndex}`}
          entering={FadeInDown.duration(400).delay(120)}
        >
          <Animated.View
            style={[styles.infoCardsRow, infoCardsStyle, { marginTop: s(20) }]}
          >
          {/* Trophies Card */}
          <View
            style={[
              styles.infoCard,
              { padding: s(16), minWidth: s(350), borderRadius: s(16) },
              focusArea === 'game_panel' &&
              gamePanelFocusIndex === 2 &&
              styles.infoCardFocused,
            ]}
          >
            {Platform.OS === 'web' &&
              focusArea === 'game_panel' &&
              gamePanelFocusIndex === 2 && (
                <>
                  <style>
                    {`
                          /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: 0px;
                          left: 0px;
                          right: 0px;
                          bottom: 0px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible !important;

                          /* ─── AQUÍ OCURRE LA MAGIA DE LA MÁSCARA CUADRADA ─── */
                          /* 1. Definimos dos capas de gradientes básicos como máscaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. ¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estándar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 300%;
                          height: 600%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE --- */
  @keyframes wc-content-shimmer {
    0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
    15% { opacity: 1; }
    50% { opacity: 1; }
    70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
    100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
  }
  .wc-shimmer-line2 {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 160%; 
    height: 420%; 
    background: linear-gradient(
      to right,
      transparent 0%,
      rgba(255, 255, 255, 0.01) 20%,
      rgba(255, 255, 255, 0.18) 50%, 
      rgba(255, 255, 255, 0.01) 80%,
      transparent 100%
    );
    animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
  }
                      `}
                  </style>

                  <div className="wc-spinning-container2">
                    {/* El gradiente cónico gira aquí adentro, siendo recortado perfectamente por el padre */}
                    <div className="wc-spinning-inner" />
                  </div>
                </>
              )}

            {/* SHIMMER */}
            {Platform.OS === 'web' && focusArea === 'game_panel' && gamePanelFocusIndex === 2 && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 1,
                  right: 1,
                  bottom: 0,
                  borderRadius: 15,
                  zIndex: 5,
                  overflow: 'hidden',
                } as any}
                pointerEvents="none"
              >
                {/* @ts-ignore */}
                <div className="wc-shimmer-line2" />
              </View>
            )}
            {/* DEGRADADO */}
            {Platform.OS === 'web' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `
                    linear-gradient(
                      90deg,
                      rgba(207, 241, 253, 0.14) 0%,
                      rgba(207, 240, 255, 0.06) 50%,
                      rgba(255,255,255,0.02) 70%,
                      rgba(255,255,255,0.00) 90%,
                      rgba(0, 0, 0, 0) 100%
                    )
                  `,
                  pointerEvents: 'none',
                  borderRadius: 15,
                  zIndex: 1,
                  opacity: (focusArea === 'game_panel' && gamePanelFocusIndex === 2) ? 1 : 0,
                  transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            )}

            {/* CONTENIDO */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: s(12),
                gap: s(25),
                zIndex: 2,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Image
                  source={require('@/assets/images/platino.png')}
                  style={{
                    width: s(28),
                    height: s(28),
                    resizeMode: 'contain',
                  }}
                />
                <Text style={{ color: '#FFF', fontSize: s(14), fontFamily: 'SSTBold', marginTop: s(15) }}>
                  {trophyCounts.platinum}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Image
                  source={require('@/assets/images/oro.png')}
                  style={{
                    width: s(28),
                    height: s(28),
                    resizeMode: 'contain',
                  }}
                />
                <Text style={{ color: '#FFF', fontSize: s(14), fontFamily: 'SSTBold', marginTop: s(15) }}>
                  {trophyCounts.gold}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Image
                  source={require('@/assets/images/plata.png')}
                  style={{
                    width: s(28),
                    height: s(28),
                    resizeMode: 'contain',
                  }}
                />
                <Text style={{ color: '#FFF', fontSize: s(14), fontFamily: 'SSTBold', marginTop: s(15) }}>
                  {trophyCounts.silver}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Image
                  source={require('@/assets/images/bronce.png')}
                  style={{
                    width: s(28),
                    height: s(28),
                    resizeMode: 'contain',
                  }}
                />
                <Text style={{ color: '#FFF', fontSize: s(14), fontFamily: 'SSTBold', marginTop: s(15) }}>
                  {trophyCounts.bronze}
                </Text>
              </View>
            </View>

            <View style={{ zIndex: 2 }}>
              <Text
                style={{
                  color: '#FFF',
                  fontSize: s(16),
                  fontFamily: 'SSTBold',
                  marginBottom: s(4),
                }}
              >
                {t('game.trophies')}
              </Text>

              <Text style={{ color: '#ddddddff', fontFamily: 'SSTLight', fontSize: s(17) }}>
                {t('game.trophiesCount', { count: achievementsLoading ? '…' : `${steamAchievements?.unlocked ?? 0}/${steamAchievements?.total ?? 0}` })}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10), marginTop: s(8) }}>
                <View style={{ flex: 1, height: s(4), borderRadius: s(2), backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
                  <View style={{ width: `${achievementsLoading ? 0 : trophyProgress}%`, height: '100%', backgroundColor: '#E7E9EE', borderRadius: s(2) }} />
                </View>
                <Text style={{ color: '#FFF', fontSize: s(16), fontFamily: 'SSTBold', minWidth: s(40), textAlign: 'right' }}>
                  {achievementsLoading ? '…' : `${trophyProgress}%`}
                </Text>
              </View>
            </View>
          </View>

          {/* Friends Playing Card */}
          <View
            style={[
              styles.infoCard,
              { padding: s(16), minWidth: s(350), borderRadius: s(16) },
              focusArea === 'game_panel' &&
              gamePanelFocusIndex === 3 &&
              styles.infoCardFocused,
            ]}
          >
            {Platform.OS === 'web' &&
              focusArea === 'game_panel' &&
              gamePanelFocusIndex === 3 && (
                <>
                  <style>
                    {`
                          /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: 0px;
                          left: 0px;
                          right: 0px;
                          bottom: 0px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible !important;

                          /* ─── AQUÍ OCURRE LA MAGIA DE LA MÁSCARA CUADRADA ─── */
                          /* 1. Definimos dos capas de gradientes básicos como máscaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. ¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estándar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 300%;
                          height: 600%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE --- */
  @keyframes wc-content-shimmer {
    0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
    15% { opacity: 1; }
    50% { opacity: 1; }
    70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
    100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
  }
  .wc-shimmer-line2 {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 160%; 
    height: 420%; 
    background: linear-gradient(
      to right,
      transparent 0%,
      rgba(255, 255, 255, 0.01) 20%,
      rgba(255, 255, 255, 0.18) 50%, 
      rgba(255, 255, 255, 0.01) 80%,
      transparent 100%
    );
    animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
  }
                      `}
                  </style>

                  <div className="wc-spinning-container2">
                    {/* El gradiente cónico gira aquí adentro, siendo recortado perfectamente por el padre */}
                    <div className="wc-spinning-inner" />
                  </div>
                </>
              )}

            {/* SHIMMER */}
            {Platform.OS === 'web' && focusArea === 'game_panel' && gamePanelFocusIndex === 3 && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 1,
                  right: 1,
                  bottom: 0,
                  borderRadius: 15,
                  zIndex: 5,
                  overflow: 'hidden',
                } as any}
                pointerEvents="none"
              >
                {/* @ts-ignore */}
                <div className="wc-shimmer-line2" />
              </View>
            )}
            {/* DEGRADADO */}
            {Platform.OS === 'web' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `
                    linear-gradient(
                      90deg,
                      rgba(207, 241, 253, 0.14) 0%,
                      rgba(207, 240, 255, 0.06) 50%,
                      rgba(255,255,255,0.02) 70%,
                      rgba(255,255,255,0.00) 90%,
                      rgba(0, 0, 0, 0) 100%
                    )
                  `,
                  pointerEvents: 'none',
                  zIndex: 1,
                  borderRadius: 15,
                  opacity: (focusArea === 'game_panel' && gamePanelFocusIndex === 3) ? 1 : 0,
                  transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  backdropFilter: 'blur(2px)',
                }}
              />
            )}

            {/* CONTENIDO */}
            <View style={{ flexDirection: 'row', marginBottom: s(12), zIndex: 2 }}>
              <Image
                source={require('@/assets/images/amigos.png')}
                style={{
                  width: s(35),
                  height: s(35),
                  resizeMode: 'contain',
                }}
              />
            </View>

            <View style={{ zIndex: 2 }}>
              <Text
                style={{
                  color: '#FFF',
                  fontSize: s(16),
                  fontFamily: 'SSTBold',
                  marginBottom: s(4),
                }}
              >
                {t('game.friendsPlaying')}
              </Text>

              <Text style={{ color: '#ddddddff', fontFamily: 'SSTLight', fontSize: s(17) }}>
                {t('game.friendsCount', { count: 5 })}
              </Text>
            </View>
          </View>

          {/* Music Player Card (only visible on media/spotify) */}
          {isMediaSection && (
            <MusicPlayerCard
              isFocused={focusArea === 'game_panel' && gamePanelFocusIndex === 4}
            />
          )}
          </Animated.View>
        </Animated.View>
      )}

      {/* Phrase for media/spotify items */}
      {canPlay && isMediaSection && (
        <Animated.View
          key={`phrase-${activeIndex}`}
          entering={FadeInDown.duration(400).delay(120)}
          style={{ marginTop: s(20), paddingHorizontal: s(50), alignItems: 'flex-start' }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: s(14), fontFamily: 'SSTMediumIt' }}>
            {t('game.musicQuote')}
          </Text>
        </Animated.View>
      )}

      {!canPlay && (
        <Animated.View style={[styles.musicQuoteContainer, { width: windowWidth }]} entering={FadeInDown.duration(800).delay(300)}>
          <Ionicons name="musical-notes-outline" size={s(28)} color="rgba(255,255,255,0.4)" style={{ marginBottom: s(12) }} />
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: s(14), fontFamily: 'SSTMediumIt' }}>
            {t('game.musicQuote')}
          </Text>
        </Animated.View>
      )}

      {/* Screenshots and Trailers row */}
      {canPlay && !isMediaSection && (
        <View style={[styles.newsSectionWrapper, { width: windowWidth, marginTop: s(50) }]}>
          <Text style={{ color: '#FFF', fontSize: s(18), fontFamily: 'SSTMedium', marginBottom: s(16), paddingLeft: s(50) }}>{t('game.capturesAndTrailers')}</Text>

          {steamMedia.length === 0 ? (
            <View style={[styles.newsLoadingRow, { paddingLeft: s(50) }]}>
              <Ionicons name="images-outline" size={14} color="rgba(255,255,255,0.25)" />
              <Text style={styles.newsEmptyText}>{t('game.noCaptures')}</Text>
            </View>
          ) : (
            <ScrollView
              ref={mediaScrollRef}
              horizontal
              showsHorizontalScrollIndicator
              scrollEnabled
              nestedScrollEnabled
              directionalLockEnabled
              persistentScrollbar
              contentContainerStyle={[styles.newsScrollContent, { paddingLeft: s(50), paddingRight: s(50) }]}
            >
              {steamMedia.map((item, idx) => {
                const isMediaFocused = focusArea === 'game_panel' && gamePanelFocusIndex === 100 + idx;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.newsCard, { width: s(500), height: s(281) }, isMediaFocused && styles.newsCardFocused]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setGamePanelFocusIndex(100 + idx);
                      setSelectedMediaIndex(idx);
                    }}
                  >

                    {Platform.OS === 'web' &&
                      focusArea === 'game_panel' &&
                      gamePanelFocusIndex === 100 + idx && (
                        <>
                          <style>
                            {`
                          /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: 0px;
                          left: 0px;
                          right: 0px;
                          bottom: 0px;
                          border-radius: 8px;
                          z-index: 9999;
                          overflow: visible !important;

                          /* ─── AQUÍ OCURRE LA MAGIA DE LA MÁSCARA CUADRADA ─── */
                          /* 1. Definimos dos capas de gradientes básicos como máscaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. ¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estándar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 300%;
                          height: 600%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE --- */
  @keyframes wc-content-shimmer {
    0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
    15% { opacity: 1; }
    50% { opacity: 1; }
    70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
    100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
  }
  .wc-shimmer-line2 {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 160%; 
    height: 420%; 
    background: linear-gradient(
      to right,
      transparent 0%,
      rgba(255, 255, 255, 0.01) 20%,
      rgba(255, 255, 255, 0.18) 50%, 
      rgba(255, 255, 255, 0.01) 80%,
      transparent 100%
    );
    animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
  }
                      `}
                          </style>

                          <div className="wc-spinning-container2">
                            {/* El gradiente cónico gira aquí adentro, siendo recortado perfectamente por el padre */}
                            <div className="wc-spinning-inner" />
                          </div>
                        </>
                      )}

                    {/* SHIMMER */}
                    {Platform.OS === 'web' && focusArea === 'game_panel' && gamePanelFocusIndex === 100 + idx && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 1,
                          right: 1,
                          bottom: 0,
                          borderRadius: 8,
                          zIndex: 5,
                          overflow: 'hidden',
                        } as any}
                        pointerEvents="none"
                      >
                        {/* @ts-ignore */}
                        <div className="wc-shimmer-line2" />
                      </View>
                    )}
                    {/* DEGRADADO NEGRO (al estar enfocadas) */}
                    {Platform.OS === 'web' && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.85) 100%)',
                          pointerEvents: 'none',
                          zIndex: 1,
                          opacity: isMediaFocused ? 1 : 0,
                          transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                      />
                    )}
                    {/* Thumbnail */}
                    <View style={[styles.newsCardThumbnail, { height: s(281) }]}>
                      <Image
                        source={{ uri: item.thumbnail }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                      {/* Play badge para trailers */}
                      {item.type === 'movie' && (
                        <View style={styles.mediaPlayBadge}>
                          <Ionicons name="play-circle" size={s(32)} color="rgba(255,255,255,0.92)" />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* Achievements row: Steam legítimo, AchievementWatcher (emulado) o RPCS3 */}
      {canPlay && !isMediaSection && steamAchievements && steamAchievements.achievements.length > 0 && (
        <View style={[styles.newsSectionWrapper, { width: windowWidth, marginTop: s(30) }]}>
          {/* Título + badge de fuente */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10), marginBottom: s(16), paddingLeft: s(50) }}>
            <Text style={{ color: '#FFF', fontSize: s(18), fontFamily: 'SSTMedium' }}>
              {t('game.trophies')}
            </Text>
            {achievementsSource === 'aw' && (
              <View style={{ backgroundColor: 'rgba(255,200,80,0.18)', borderRadius: s(6), paddingHorizontal: s(8), paddingVertical: s(2) }}>
                <Text style={{ color: 'rgba(255,200,80,0.9)', fontSize: s(11), fontFamily: 'SSTMedium' }}>
                  AchievementWatcher
                </Text>
              </View>
            )}
            {achievementsSource === 'rpcs3' && (
              <View style={{ backgroundColor: 'rgba(0,160,255,0.18)', borderRadius: s(6), paddingHorizontal: s(8), paddingVertical: s(2) }}>
                <Text style={{ color: 'rgba(100,200,255,0.9)', fontSize: s(11), fontFamily: 'SSTMedium' }}>
                  RPCS3
                </Text>
              </View>
            )}
          </View>
          <ScrollView
            ref={achievementsScrollRef}
            horizontal
            showsHorizontalScrollIndicator
            scrollEnabled
            nestedScrollEnabled
            directionalLockEnabled
            persistentScrollbar
            contentContainerStyle={[styles.newsScrollContent, { paddingLeft: s(50), paddingRight: s(50) }]}
          >
            {steamAchievements.achievements.map((achievement, idx) => {
              const globalPercentage = Number(achievement.globalPercentage);
              const hasGlobalPercentage = Number.isFinite(globalPercentage);
              const isAchievementFocused = focusArea === 'game_panel' && gamePanelFocusIndex === 200 + idx;
              return (
                <TouchableOpacity
                  key={achievement.apiName}
                  onPress={() => setGamePanelFocusIndex(200 + idx)}
                  activeOpacity={0.8}
                  style={{
                    width: s(250),
                    height: s(180),
                    borderRadius: s(12),
                    overflow: 'hidden',
                    padding: s(16),
                    justifyContent: 'flex-end',
                    backgroundColor: achievement.achieved ? 'rgba(29, 37, 52, 0.96)' : 'rgba(18, 20, 27, 0.96)',
                    position: 'relative',
                  }}
                >
                  {isAchievementFocused && <SpinningBorderNoticias size={s(250)} />}
                  <Image
                    source={{ uri: achievement.achieved ? achievement.icon : achievement.lockedIcon }}
                    style={{ position: 'absolute', top: s(16), right: s(16), width: s(68), height: s(68), borderRadius: s(8), opacity: achievement.achieved ? 1 : 0.34 }}
                    contentFit="cover"
                  />
                  {!achievement.achieved && (
                    <View style={{ position: 'absolute', top: s(35), right: s(35), zIndex: 1 }}>
                      <Ionicons name="lock-closed" size={s(28)} color="rgba(255,255,255,0.88)" />
                    </View>
                  )}
                  <Text style={{ color: achievement.achieved ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)', fontSize: s(11), fontFamily: 'SSTMedium', marginBottom: s(4) }}>
                    {achievement.achieved ? 'Desbloqueado' : 'Bloqueado'}{hasGlobalPercentage ? ` · ${globalPercentage.toFixed(1)}%` : ''}
                  </Text>
                  <Text numberOfLines={1} style={{ color: '#FFF', fontSize: s(17), fontFamily: 'SSTBold', marginBottom: s(5) }}>
                    {achievement.name}
                  </Text>
                  <Text numberOfLines={2} style={{ color: 'rgba(255,255,255,0.62)', fontSize: s(12), lineHeight: s(16), fontFamily: 'SSTLight' }}>
                    {achievement.description || (achievement.achieved ? 'Logro conseguido' : 'Sigue jugando para desbloquear este logro.')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Steam News row */}
      {canPlay && !isMediaSection && (
        <View style={[styles.newsSectionWrapper, { width: windowWidth }]}>
          <Text style={{ color: '#FFF', fontSize: s(18), fontFamily: 'SSTMedium', marginBottom: s(16), paddingLeft: s(50) }}>{t('game.latestNews')}</Text>

          {steamNews.length === 0 ? (
            <View style={[styles.newsLoadingRow, { paddingLeft: s(50) }]}>
              <Ionicons name="newspaper-outline" size={14} color="rgba(255,255,255,0.25)" />
              <Text style={styles.newsEmptyText}>{t('game.noNews')}</Text>
            </View>
          ) : (
            <ScrollView
              ref={newsScrollRef}
              horizontal
              showsHorizontalScrollIndicator
              scrollEnabled
              nestedScrollEnabled
              directionalLockEnabled
              persistentScrollbar
              contentContainerStyle={[styles.newsScrollContent, { paddingLeft: s(50), paddingRight: s(50) }]}
            >
              {steamNews.slice(0, 8).map((news, idx) => {
                const isNewsFocused = focusArea === 'game_panel' && gamePanelFocusIndex === 4 + idx;
                const fallbackItem = activeItem?.isLastPlayed ? lastPlayedGame : activeItem;
                return (
                  <TouchableOpacity
                    key={news.gid}
                    style={[styles.newsCard2, { width: s(320) }, isNewsFocused && styles.newsCardFocused]}
                    activeOpacity={0.8}
                    onPress={() => { if (news.url) Linking.openURL(news.url); }}
                  >
                    {Platform.OS === 'web' &&
                      focusArea === 'game_panel' &&
                      gamePanelFocusIndex === 4 + idx && (
                        <>
                          <style>
                            {`
                          /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: 0px;
                          left: 0px;
                          right: 0px;
                          bottom: 0px;
                          border-radius: 8px;
                          z-index: 9999;
                          overflow: visible !important;

                          /* ─── AQUÍ OCURRE LA MAGIA DE LA MÁSCARA CUADRADA ─── */
                          /* 1. Definimos dos capas de gradientes básicos como máscaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. ¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estándar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 300%;
                          height: 600%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE --- */
  @keyframes wc-content-shimmer {
    0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
    15% { opacity: 1; }
    50% { opacity: 1; }
    70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
    100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
  }
  .wc-shimmer-line2 {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 160%; 
    height: 420%; 
    background: linear-gradient(
      to right,
      transparent 0%,
      rgba(255, 255, 255, 0.01) 20%,
      rgba(255, 255, 255, 0.18) 50%, 
      rgba(255, 255, 255, 0.01) 80%,
      transparent 100%
    );
    animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
  }
                      `}
                          </style>

                          <div className="wc-spinning-container2">
                            {/* El gradiente cónico gira aquí adentro, siendo recortado perfectamente por el padre */}
                            <div className="wc-spinning-inner" />
                          </div>
                        </>
                      )}

                    {/* SHIMMER */}
                    {Platform.OS === 'web' && focusArea === 'game_panel' && gamePanelFocusIndex === 4 + idx && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 1,
                          right: 1,
                          bottom: 0,
                          borderRadius: 8,
                          zIndex: 5,
                          overflow: 'hidden',
                        } as any}
                        pointerEvents="none"
                      >
                        {/* @ts-ignore */}
                        <div className="wc-shimmer-line2" />
                      </View>
                    )}
                    {/* DEGRADADO NEGRO (al estar enfocadas) */}
                    {Platform.OS === 'web' && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.85) 100%)',
                          pointerEvents: 'none',
                          zIndex: 1,
                          opacity: isNewsFocused ? 1 : 0,
                          transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                      />
                    )}

                    {/* SHIMMER (al estar enfocadas) */}
                    {Platform.OS === 'web' && isNewsFocused && (
                      <div
                        className="widget-shimmer-line"
                        style={{
                          animationDuration: '7s',
                          opacity: 0.8,
                        }}
                      />
                    )}
                    <View style={[styles.newsCardThumbnail, { height: s(281) }]}>
                      <Image
                        source={
                          news.image_url
                            ? { uri: news.image_url }
                            : (fallbackItem?.backgroundImage ?? fallbackItem?.image ?? require('@/assets/images/FondoDefault2.jpg'))
                        }
                        style={{ width: '100%', height: '100%', opacity: news.image_url ? 1 : 0.4 }}
                        contentFit="cover"
                      />
                    </View>
                    <View style={styles.newsCardContent}>
                      <Text style={styles.newsCardTitle} numberOfLines={1}>{news.title}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  gameInfoPanel: {
    paddingLeft: 150,
    paddingTop: 1,
    maxWidth: '100%' as any,
  },
  gameLogo: {
    width: 400,
    height: 220,
    marginBottom: 15,
  },
  gameTitle: {
    color: '#FFFFFF',
    fontSize: 38,
    fontFamily: 'SSTLight',
    fontWeight: '300',
    letterSpacing: -0.5,
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  mainActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  playtimeWrapper: {
    alignItems: 'flex-start',
    marginRight: 100,
  },
  playBtn: {
    backgroundColor: '#9999991c',
    paddingHorizontal: 52,
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    width: 320,
    height: 65,
  },
  playBtnText: {
    color: '#FFFFFF',
    fontSize: 25,
    fontFamily: 'SSTBold',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  moreBtn: {
    backgroundColor: '#9999991c',
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  moreBtnText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: -4,
  },
  playBtnFocused: {
    backgroundColor: '#FFFFFF',
    //outlineStyle: 'solid',
    //outlineWidth: 2,
    //outlineColor: '#929292ff',
    //outlineOffset: 1,
  } as any,
  playBtnTextFocused: {
    color: '#111111',
  },
  moreBtnFocused: {
    backgroundColor: '#FFFFFF',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: '#929292ff',
    outlineOffset: 1,
  } as any,
  moreBtnTextFocused: {
    color: '#111111',
  },
  playtimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(1, 1, 2, 0.84)',
  },
  playtimeText: {
    color: 'rgba(255, 255, 255, 0.97)',
    fontFamily: 'SSTLight',
    fontWeight: '600',
  },
  infoCardsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
    width: '90%',
  },
  infoCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgb(10 18 33)',
    //borderWidth: 1,
    //borderColor: 'rgba(255,255,255,0.05)',
    minWidth: 350,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  } as any,
  infoCardFocused: {
    //borderColor: 'rgba(255, 255, 255, 0.64)',
    //borderWidth: 1.5,
  } as any,
  newsSectionWrapper: {
    marginTop: 30,
    marginLeft: -50,
  },
  newsScrollContent: {
    gap: 16,
  },
  newsCard: {
    width: 500,
    height: 250,
    borderRadius: 8,
    backgroundColor: 'rgba(199, 199, 226, 0.04)',
    overflow: 'hidden',
    //borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  } as any,
  newsCard2: {
    width: 320,
    borderRadius: 8,
    backgroundColor: 'rgba(20,20,30,0.4)',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  } as any,
  newsCardFocused: {
    //borderColor: 'rgba(255, 255, 255, 0.49)',
    //borderWidth: 2,
    backgroundColor: 'rgba(35,35,45,0.6)',
  } as any,
  newsCardThumbnail: {
    width: '100%',
    height: 281,
    backgroundColor: '#333',
    position: 'relative',
  },
  newsCardContent: {
    padding: 12,
    zIndex: 2,
  },
  newsCardTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 6,
  },
  newsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  newsEmptyText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontStyle: 'italic',
  },
  musicQuoteContainer: {
    marginTop: 20,
    paddingHorizontal: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPlayBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 2,
  },
  downloadContainer: {
    backgroundColor: '#9999991c',
    justifyContent: 'center',
    width: 320,
    height: 65,
    borderRadius: 28,
    paddingHorizontal: 24,
  },
  downloadHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  downloadLabel: {
    color: '#FFFFFF',
    fontFamily: 'SSTBold',
    letterSpacing: 0.3,
  },
  downloadPercent: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'SSTBold',
  },
  downloadTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  downloadFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});

export default React.memo(GameInfoPanel);
