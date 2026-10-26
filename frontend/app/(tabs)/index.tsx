import { ResizeMode, Video } from '@/components/AppVideo';
import BackgroundVideo from '@/components/BackgroundVideo';
import ClockText from '@/components/ClockText';
import FavoritesView from '@/components/FavoritesView';
import PSIcon from '@/components/PSIcon';
import RadarFocusWrapper from '@/components/RadarFocusWrapper';
import RandomSelectorView from '@/components/RandomSelectorView';
import SpinningBorderTabs from '@/components/SpinningBorderTabs';
import YoutubePlayer from '@/components/YoutubePlayer';
import { PSIcons } from '@/constants/psIcons';
import { useTheme } from '@/contexts/ThemeContext';
import { useUser } from '@/contexts/UserContext';
import { fetchGameVideosByName, GameVideoResult } from '@/services/gameVideoService';
import { fetchGamingNews } from '@/services/newsService';
import { syncProfileMediaToOnline } from '@/services/onlineAccountService';
import { extractSteamAppId as extractTrophySteamAppId, syncLocalTrophiesToOnline } from '@/services/onlineTrophiesService';
import { soundService } from '@/services/soundService';
import { getGameActionLabel, resolveSteamLaunchPath } from '@/services/steamLaunchService';
import { resolveGameScreenshots, SteamMediaItem } from '@/services/steamMediaService';
import { fetchSteamNewsByName, SteamNewsItem } from '@/services/steamNewsService';
import { fetchSteamGameAchievements } from '@/services/steamUserService';
import { fetchAwGameAchievements, fetchPcGameAchievements } from '@/services/achievementWatcherService';
import { toastService } from '@/services/toastService';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeInDown, FadeOut, interpolate, measure, runOnJS, useAnimatedRef, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

// WPS5 UI Expansion Components
import DeleteConfirmView from '@/components/DeleteConfirmView';
import FloatingSystemNav from '@/components/FloatingSystemNav';
import GameContextMenu from '@/components/GameContextMenu';
import GameDetailView from '@/components/GameDetailView';
import LibraryGrid, { LibraryGridHandle } from '@/components/LibraryGrid';
import ProfileDropdownMenu from '@/components/ProfileDropdownMenu';
import { Asset } from 'expo-asset';

// Modular components
import AddAppModal from '@/components/AddAppModal';
import AvatarPickerModal from '@/components/AvatarPickerModal';
import BackgroundPickerModal from '@/components/BackgroundPickerModal';
import ConsoleCarousel from '@/components/ConsoleCarousel';
import ErrorBoundary from '@/components/ErrorBoundary';
import GameInfoPanel from '@/components/GameInfoPanel';
import MediaGalleryView from '@/components/MediaGalleryView';
import { OnlineUserFullProfile } from '@/components/OnlineUserFullProfile';
import SearchView from '@/components/SearchView';
import SettingsView, { SettingsScreenType } from '@/components/SettingsView';
import StoreFrontPanel from '@/components/StoreFrontPanel';
import ThemeCharacterOverlay from '@/components/ThemeCharacterOverlay';
import TrophiesView from '@/components/TrophiesView';
import WelcomeSettingsView from '@/components/WelcomeSettingsView';
import WelcomeWidgets, { WelcomeWidgetsHandle } from '@/components/WelcomeWidgets';
import WidgetEditPanel, {
  clampWidgetSize,
  computeWidgetColumns,
  loadWidgetOrder,
  loadWidgetSizes,
  loadWidgetVisibility,
  PANEL_WIDGETS,
  saveWidgetOrder,
  saveWidgetSizes,
  saveWidgetVisibility,
  WidgetSizes,
  WidgetVisibility
} from '@/components/WidgetEditPanel';
import { PLATFORMS } from '@/constants/platforms';
import { useTranslation } from '@/contexts/LanguageContext';
import { useFocusNavigation, type UseFocusNavigationOptions } from '@/hooks/useFocusNavigation';
import { useGamepadInput } from '@/hooks/useGamepadInput';
import { useLibrary } from '@/hooks/useLibrary';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { useSteamSync } from '@/hooks/useSteamSync';
import { Language } from '@/i18n/translations';
import {
  initOnlineLibraryAutoSync,
} from '@/services/onlineAutoSync';
import { initOnlineFriendWatcher } from '@/services/onlineFriendWatcher';
import { psnLocaleForLanguage } from '@/services/psnMetadataService';
import { getSteamAppId } from '@/services/steamLaunchService';
import { fetchSteamStoreOffers } from '@/services/steamSpecialsService';
import { enrichOffersWithHeroes, enrichOffersWithPsnBackgrounds, extractSteamAppId, fetchStoreOffers, LOCAL_FALLBACK_OFFERS, StoreOffer } from '@/services/storeService';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

const TABS: { id: string; labelKey: 'tabs.games' | 'tabs.media' }[] = [
  { id: 'Games', labelKey: 'tabs.games' },
  { id: 'Media', labelKey: 'tabs.media' },
];

// ─── Slideshow Overlay ────────────────────────────────────────
interface SlideshowOverlayProps {
  images: string[];
  currentIndex: number;
  transition: string;
  windowWidth: number;
  windowHeight: number;
}

const SLIDE_MS = 900;

const SlideshowOverlay = React.memo<SlideshowOverlayProps>(({
  images, currentIndex, transition, windowWidth, windowHeight,
}) => {
  const uri = images[currentIndex % images.length] ?? null;

  const progress = useSharedValue(1);
  const lastUriRef = useRef<string | null>(uri);
  const [pair, setPair] = useState<{ prev: string | null; current: string | null }>({
    prev: null,
    current: uri,
  });

  useEffect(() => {
    if (!uri || uri === lastUriRef.current) return;
    setPair({ prev: lastUriRef.current, current: uri });
    lastUriRef.current = uri;
    progress.value = 0;
    progress.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  // 'left' => el contenido se desplaza hacia la izquierda
  const dir = transition === 'left' ? -1 : 1;

  // saliente: 0 -> dir * W
  const outgoingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * dir * windowWidth }],
    opacity: progress.value < 1 ? 1 : 0,
  }));

  // entrante: -dir * W -> 0
  const incomingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * -dir * windowWidth }],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 0, elevation: 0, }]} pointerEvents="none">
      {pair.prev && (
        <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 10, elevation: 10, }, outgoingStyle]}>
          <Image
            source={{ uri: pair.prev }}
            style={{ width: windowWidth, height: windowHeight }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </Animated.View>
      )}
      {pair.current && (
        <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 11, elevation: 11, }, incomingStyle]}>
          <Image
            source={{ uri: pair.current }}
            style={{ width: windowWidth, height: windowHeight }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </Animated.View>
      )}
    </View>
  );
});

SlideshowOverlay.displayName = 'SlideshowOverlay';

export interface ConsoleItem {
  id: string;
  title: string;
  time: string;
  image?: any;
  logo?: any;
  backgroundImage?: any;
  backgroundVideo?: any;
  video?: any;
  /** Audio opcional que se reproduce al mantener este juego enfocado en Inicio. */
  focusAudio?: string;
  isFolder?: boolean;
  isGrid?: boolean;
  path?: string;
  /** Argumentos extra pasados al ejecutable al lanzar (solo .exe externos, ej: "-dx11 -windowed"). */
  launchArgs?: string;
  description?: string;
  rating?: number;
  publisher?: string;
  genres?: string[];
  releaseDate?: string;
  isFavorite?: boolean;
  isLastPlayed?: boolean;
  lastPlayed?: number;
  playtime_forever?: number;
  playtimeMinutes?: number;
  youtubeId?: string;
  type?: 'game' | 'media' | 'web';
  platform?: string;
  /** Sistema retro específico cuando platform === 'Retro'. Ej: "SNES", "Sega Genesis", "Arcade - MAME" */
  retroSystem?: string;
  isPinned?: boolean;
}

export type StoreSource = 'ps5' | 'steam';


const HomeLightboxImage = React.memo(({
  uri,
  thumbnail,
}: {
  uri: string;
  thumbnail?: string;
}) => {
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const animateIn = useCallback(() => {
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, []);

  useEffect(() => {
    animateIn();
  }, [animateIn]);

  return (
    <Animated.View style={[{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }, animatedStyle]}>
      {Platform.OS === 'web' && (
        <style>
          {`
            @keyframes wps5-lightbox-fade {
              0% { opacity: 0; }
              100% { opacity: 1; }
            }
          `}
        </style>
      )}
      <Image
        source={{ uri }}
        placeholder={thumbnail ? { uri: thumbnail } : undefined}
        placeholderContentFit="contain"
        style={[
          { width: '100%', height: '100%' },
          Platform.OS === 'web' && ({
            animation: 'wps5-lightbox-fade 300ms ease-out both',
          } as any)
        ]}
        contentFit="contain"
        cachePolicy="memory-disk"
        onLoad={animateIn}
        onError={animateIn}
      />
    </Animated.View>
  );
});
HomeLightboxImage.displayName = 'HomeLightboxImage';

export default function ConsoleHome() {
  const { activeUser, changeUser, updateUser } = useUser();
  const { visualTheme, setVisualTheme, foregroundOverWidgets, visualThemeOnlyHome } = useTheme();
  // Zona del carrusel (borde inferior en px de pantalla): sirve para recortar el personaje cuando no debe cubrir los widgets.
  const carouselSectionRef = useRef<any>(null);
  const [carouselClipBottom, setCarouselClipBottom] = useState<number | null>(null);
  const { t, language, setLanguage } = useTranslation();
  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    updateUser({ settings: { ...activeUser?.settings, language: lang } });
  };
  // ── Video de suspensión al cerrar la app ──────────────────────────────────
  // Misma idea que el video de arranque en _layout.tsx: si el usuario activo
  // configuró un video de suspensión (Settings -> Splash Videos -> "Usar en
  // Suspend"), lo reproducimos entero (con audio) antes de cerrar realmente
  // la aplicación, en vez de matarla de golpe con electronAPI.closeApp().
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const shutdownFinishedRef = useRef(false);
  const suspendVideoPath = (activeUser?.settings as any)?.suspendVideoPath as string | undefined;

  // Debe coincidir con `toLocalFileUri` en electron/main.js y en _layout.tsx.
  const toLocalFileUri = (filePath: string) => `local-file:///${filePath.replace(/\\/g, '/')}`;

  // Video de suspensión: el personalizado del usuario; si no tiene (o falla),
  // el video por defecto empaquetado; si ese también falla, se cierra directo.
  const [suspendCustomFailed, setSuspendCustomFailed] = useState(false);
  const [suspendDefaultFailed, setSuspendDefaultFailed] = useState(false);
  const suspendCustomActive = !!suspendVideoPath && !suspendCustomFailed;
  const suspendVideoSource = useMemo(
    () => (suspendCustomActive ? { uri: toLocalFileUri(suspendVideoPath as string) } : require('@/assets/splash/suspend.webm')),
    [suspendCustomActive, suspendVideoPath]
  );

  const finishShutdown = () => {
    if (shutdownFinishedRef.current) return;
    shutdownFinishedRef.current = true;
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      (window as any).electronAPI.closeApp();
    }
  };

  // Punto único de salida: reemplaza las llamadas directas a
  // electronAPI.closeApp() en los menús de "Apagar"/"Salir". Si no hay video
  // de suspensión configurado, cierra directo (comportamiento anterior).
  const requestAppShutdown = () => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI) return;
    if (suspendCustomActive === false && suspendDefaultFailed) {
      // Ni el video personalizado ni el de por defecto están disponibles.
      (window as any).electronAPI.closeApp();
      return;
    }
    shutdownFinishedRef.current = false;
    setIsShuttingDown(true);
  };
  // Red de seguridad: si el video de suspensión nunca dispara "onEnd"
  // (archivo corrupto, códec no soportado, etc.), cerramos igual a los 20s.
  useEffect(() => {
    if (!isShuttingDown) return;
    const safetyTimer = setTimeout(finishShutdown, 20000);
    return () => clearTimeout(safetyTimer);
  }, [isShuttingDown]);

  const [activeTab, setActiveTab] = useState('Games');
  const [currentRenderedTab, setCurrentRenderedTab] = useState('Games');
  // carouselKey: incrementing this forces AnimatedCardWrapper instances to remount,
  // re-triggering the staggered entrance animation on tab change.
  const [carouselKey, setCarouselKey] = useState(0);

  // Steam news
  const [steamNews, setSteamNews] = useState<SteamNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // Storefront offers
  const [storeOffers, setStoreOffers] = useState<StoreOffer[]>(LOCAL_FALLBACK_OFFERS);
  const [storeLoading, setStoreLoading] = useState(true);

  // Steam screenshots & trailers
  const [steamMedia, setSteamMedia] = useState<SteamMediaItem[]>([]);
  const [gameVideos, setGameVideos] = useState<GameVideoResult[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);
  const [achievementCount, setAchievementCount] = useState(0);
  const selectedLightboxMedia = selectedMediaIndex !== null ? steamMedia[selectedMediaIndex] ?? null : null;


  const scrollRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<any>(null);
  const newsScrollRef = useRef<ScrollView>(null);
  const mediaScrollRef = useRef<ScrollView>(null);
  const focusAudioSoundRef = useRef<AudioPlayer | null>(null);
  const focusAudioDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusAudioRequestRef = useRef(0);
  const isLaunchingRef = useRef(false);
  const widgetScrollRef = useRef<ScrollView>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Dimensiones en píxeles reales del lightbox de medios (16:9), calculadas a
  // partir del ancho de ventana. Coincide con styles.lightboxContent
  // ('82%', maxWidth 1060). YoutubePlayer (WebView por debajo) necesita
  // height/width numéricos — no acepta '100%' como styles.lightboxVideo.
  const lightboxPlayerWidth = Math.min(windowWidth * 0.82, 1060);
  const lightboxPlayerHeight = lightboxPlayerWidth * (9 / 16);

  // PS5-style card sizing: responsive based on window dimensions
  const CARD_SIZE = Math.round(Math.min(Math.max(windowHeight * 0.12, 90), 120));
  const CARD_GAP = Math.round(Math.max(windowHeight * 0.006, 4));
  const ITEM_WIDTH = CARD_SIZE + CARD_GAP * 2;
  const LEFT_PADDING = Math.round(Math.max(windowWidth * 0.088, 80));
  const RIGHT_PADDING = Math.max(windowWidth - ITEM_WIDTH - LEFT_PADDING, 60);

  // States for dynamic data
  const [gamepadInfo, setGamepadInfo] = useState({ connected: false, name: '', battery: 0 });
  const [storageInfo, setStorageInfo] = useState<{
    percent: number;
    freeGB: number;
    disks: { name: string; percent: number; freeGB: number; totalGB: number }[];
  }>({ percent: 0, freeGB: 0, disks: [] });

  // States for Add App Modal
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [newApp, setNewApp] = useState({ title: '', path: '', image: '', type: 'game', platform: '' });
  const [isSaving, setIsSaving] = useState(false);

  // States for Game Detail View
  const [isUserModalVisible, setUserModalVisible] = useState(false);
  const [modalSelectedIndex, setModalSelectedIndex] = useState(0);
  const [isHomeBgModalVisible, setHomeBgModalVisible] = useState(false);
  const [isAvatarModalVisible, setAvatarModalVisible] = useState(false);
  const [isSearchVisible, setSearchVisible] = useState(false);
  const [onlineProfileUsername, setOnlineProfileUsername] = useState<string | null>(null);
  const [addModalFocusIndex, setAddModalFocusIndex] = useState(0);
  const [settingsFocusArea, setSettingsFocusArea] = useState<'sidebar' | 'content'>('sidebar');
  const [settingsFocusIndex, setSettingsFocusIndex] = useState(0);

  const addModalTitleRef = useRef<TextInput>(null);
  const addModalPlatformScrollRef = useRef<ScrollView>(null);
  const addModalPlatformOffsets = useRef<number[]>([]);

  const [isFavoritesVisible, setFavoritesVisible] = useState(false);
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  // Vista de trofeos: se abre desde el widget de logros del panel del juego
  // o del detalle del juego.
  const [isTrophiesVisible, setTrophiesVisible] = useState(false);
  const [trophiesItem, setTrophiesItem] = useState<ConsoleItem | null>(null);
  const [isWelcomeSettingsVisible, setWelcomeSettingsVisible] = useState(false);
  const [widgetVisibility, setWidgetVisibility] = useState<WidgetVisibility>(() => loadWidgetVisibility());
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => loadWidgetOrder());
  const [widgetSizes, setWidgetSizes] = useState<WidgetSizes>(() => loadWidgetSizes());

  // R1 (+1) amplía, L1 (-1) reduce. Tamaños: 0 → 1 → 2 (máximo por widget en WIDGET_MAX_SIZE).
  const resizeWidget = useCallback((id: string, delta: 1 | -1) => {
    const current = widgetSizes[id] ?? 0;
    const next = clampWidgetSize(id, current + delta);
    if (next === current) return; // ya está en el mínimo / máximo
    const updated: WidgetSizes = { ...widgetSizes, [id]: next };
    setWidgetSizes(updated);
    saveWidgetSizes(updated);
    soundService.playNavigation();
  }, [widgetSizes]);

  const row1Visible = useMemo(
    () => [0, 1, 2, 3, 4].filter(slot => widgetVisibility[widgetOrder[slot]] !== false),
    [widgetVisibility, widgetOrder]
  );
  const row2Visible = useMemo(
    () => [5, 6, 7, 8, 9].filter(slot => widgetVisibility[widgetOrder[slot]] !== false),
    [widgetVisibility, widgetOrder]
  );

  // Layout real del grid (columnas de 3 espacios; los widgets desplazados ruedan a la derecha)
  const widgetColumns = useMemo(
    () => computeWidgetColumns(
      widgetOrder,
      (id) => widgetVisibility[id] !== false,
      (id) => clampWidgetSize(id, widgetSizes[id] ?? 0)
    ),
    [widgetOrder, widgetVisibility, widgetSizes]
  );
  const [isMediaGalleryVisible, setMediaGalleryVisible] = useState(false);
  const [isSlidesModalVisible, setIsSlidesModalVisible] = useState(false);


  const [settingsInitialScreen, setSettingsInitialScreen] = useState<SettingsScreenType>('main');
  const [settingsTab, setSettingsTab] = useState<'profile' | 'home' | 'sync' | 'support'>('profile');
  const [homeBackground, setHomeBackground] = useState<any>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingItem, setLaunchingItem] = useState<ConsoleItem | null>(null);

  // ─── Modo presentación (estados, refs y effects extraídos) ────────────────
  const {
    presentationEnabled,
    inactivityTime,
    isPresentationMode,
    presentationAnim,
    slideshowAlbumName,
    setSlideshowAlbumName,
    slideshowDuration,
    slideshowTransition,
    slideshowImages,
    setSlideshowImages,
    currentSlideIndex,
    setCurrentSlideIndex,
    handlePresentationSettingsChange,
    handleSlidesSettingsChange,
    resetInteraction,
  } = usePresentationMode({ isLaunching });
  const [isRandomSelectorVisible, setRandomSelectorVisible] = useState(false);

  // Mantiene una copia sincrónica de isLaunching accesible desde callbacks
  // async (ej. setTimeout) sin depender de closures potencialmente obsoletas.
  useEffect(() => {
    isLaunchingRef.current = isLaunching;
  }, [isLaunching]);

  // States for new UI features (WPS5 UI Expansion)
  const libraryGridRef = useRef<LibraryGridHandle>(null);
  const welcomeWidgetsRef = useRef<WelcomeWidgetsHandle>(null);

  // ── useSteamSync: estados de Steam, Epic y Xbox ───────────────────────────
  // Necesitamos declarar estos estados temporalmente para poder pasar los
  // setters a useLibrary. useSteamSync los retorna, pero useLibrary los
  // necesita para mergeGameIntoState / markGameAsLastPlayed.
  // La declaración definitiva de games/gamesRef ocurre en useLibrary (ver abajo).

  // ── selectedItem y visibilidad del detalle (permanecen en index.tsx) ──────
  const [selectedItem, setSelectedItem] = useState<ConsoleItem | null>(null);
  const [isDetailVisible, setDetailVisible] = useState(false);
  const [detailInitialEditMode, setDetailInitialEditMode] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ConsoleItem | null>(null);
  const [uiReady, setUiReady] = useState(false);

  // libraryTab: se declara aquí para pasarlo a useSteamSync, useLibrary y useFocusNavigation
  const [libraryTab, setLibraryTab] = useState<'installed' | 'collection'>('installed');

  // ── useSteamSync ──────────────────────────────────────────────────────────
  // Nota: games no está disponible aún (lo provee useLibrary más abajo), así
  // que pasamos un array vacío inicialmente. useSteamSync lo usa para overrides
  // y orphan installs, que pueden cargarse ligeramente más tarde sin problema.
  // Se inicializa con array temporal; useLibrary proveerá games real.
  const [_gamesForSteam, _setGamesForSteam] = useState<ConsoleItem[]>([]);
  const {
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
    loadingEpic: _loadingEpic,
    loadingXbox: _loadingXbox,
    wishlistDeals: _wishlistDeals,
    steamDownloads: _steamDownloads,
    downloadsByAppId,
    downloadingSteamGames,
    isSteamTrackedGame,
    getEffectiveSteamGames,
  } = useSteamSync({ activeUser, games: _gamesForSteam, t, language, libraryTab });

  // ── useLibrary ────────────────────────────────────────────────────────────
  const GAMES_LIMIT = 10;
  const {
    games,
    setGames,
    gamesRef: _gamesRef,
    media,
    setMedia: _setMedia,
    lastPlayedGame,
    setLastPlayedGame: _setLastPlayedGame,
    currentData,
    displayedLibraryGames,
    searchableLibraryGames,
    searchableMedia,
    nonSteamGames: _nonSteamGames,
    savedGames: _savedGames,
    loadApps,
    mergeGameIntoState,
    mergeGameIntoStateRef,
    syncGamePlaytime,
    markGameAsLastPlayed,
    handleConfirmDeleteGame: _handleConfirmDeleteGame,
    appsLoaded: _appsLoaded,
  } = useLibrary({
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
    language,
    uiReady,
    libraryTab,
    setLibraryTab,
    setSteamGames,
    setEpicGames,
    setXboxGames,
    selectedItem,
    setSelectedItem,
    setDetailVisible,
    getEffectiveSteamGames,
    currentRenderedTab,
    gamesLimit: GAMES_LIMIT,
  });

  // Sincroniza games al state auxiliar usado por useSteamSync para overrides/orphans
  useEffect(() => {
    _setGamesForSteam(games);
  }, [games]);

  // Wrapper con firma () => void para el JSX (DeleteConfirmView.onConfirm)
  const handleConfirmDeleteGame = useCallback(() => {
    _handleConfirmDeleteGame(deleteConfirmItem, setDeleteConfirmItem);
  }, [_handleConfirmDeleteGame, deleteConfirmItem]);

  const launchStartTimeRef = useRef<Record<string, number>>({});
  const sessionPlaytimeRef = useRef<Record<string, number>>({});
  const initialUnlockedRef = useRef<Record<string, number>>({});
  // Trofeos ya notificados en tiempo real durante la sesión actual del juego.
  // Al cerrar el juego usamos este contador para evitar duplicar el toast de conteo.
  const realtimeTrophiesNotifiedRef = useRef<Record<string, number>>({});

  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [contextMenuFocusIndex, setContextMenuFocusIndex] = useState(0);
  const activeCardRef = useAnimatedRef<View>();
  const [contextMenuCoords, setContextMenuCoords] = useState({ top: 250, left: 335 });
  const [isLibraryDetailVisible, setIsLibraryDetailVisible] = useState(false);

  const [isOnline, setIsOnline] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [profileMenuFocusIndex, setProfileMenuFocusIndex] = useState(0);

  const [systemNavLevel, setSystemNavLevel] = useState(0); // 0 = menu, 1 = cards
  const [systemNavCardIndex, setSystemNavCardIndex] = useState(0);
  const [systemNavMaxCardIndex, setSystemNavMaxCardIndex] = useState(2);
  const [isSystemNavCardExpanded, setSystemNavCardExpanded] = useState(false);
  const [isFriendsCardOpen, setIsFriendsCardOpen] = useState(false);
  const [isNotificationsCardOpen, setIsNotificationsCardOpen] = useState(false);
  const [isMusicCardOpen, setIsMusicCardOpen] = useState(false);
  const [isDownloadsCardOpen, setIsDownloadsCardOpen] = useState(false);

  // Declaraciones anticipadas necesarias por useFocusNavigation antes de su llamada
  const [inputMode, setInputMode] = useState<'keyboard' | 'gamepad'>('keyboard');
  const mountTimeRef = useRef(Date.now());

  // ─── Datos derivados de storeOffers que necesita useFocusNavigation ───────
  const storeDeals = useMemo(() => storeOffers.filter(o => o.type === 'offer'), [storeOffers]);
  const storeUpcoming = useMemo(() => storeOffers.filter(o => o.type === 'release'), [storeOffers]);

  // ─── Refs para romper dependencia circular con useFocusNavigation ─────────
  // handleLaunchApp y otros callbacks se definen más abajo pero usan valores
  // del hook (setActiveIndex, setFocusArea). Como el hook los lee siempre desde
  // optionsRef.current (actualizada en cada render), basta con wrappers estables.
  const _handleLaunchAppRef = useRef<UseFocusNavigationOptions['handleLaunchApp']>(() => { });
  const _openContextMenuRef = useRef<UseFocusNavigationOptions['openContextMenu']>(() => { });
  const _handleContextMenuActionRef = useRef<UseFocusNavigationOptions['handleContextMenuAction']>(() => { });
  const _handleProfileMenuActionRef = useRef<UseFocusNavigationOptions['handleProfileMenuAction']>(() => { });
  const _handleSystemNavActionRef = useRef<UseFocusNavigationOptions['handleSystemNavAction']>(() => { });
  const _handleToggleFavoriteRef = useRef<UseFocusNavigationOptions['handleToggleFavorite']>(() => { });
  const _handleTogglePinRef = useRef<UseFocusNavigationOptions['handleTogglePin']>(() => { });

  // ─── useFocusNavigation ───────────────────────────────────────────────────
  const {
    focusArea, setFocusArea,
    focusIndex, setFocusIndex,
    activeIndex, setActiveIndex,
    gamePanelFocusIndex, setGamePanelFocusIndex,
    toolbarFocusIndex, setToolbarFocusIndex,
    isLibraryFocused, setIsLibraryFocused,
    libraryGridFocusIndex, setLibraryGridFocusIndex,
    visibleLibraryGames: _visibleLibraryGames, setVisibleLibraryGames,
    libraryTabsFocused, setLibraryTabsFocused,
    libraryFilterFocused, setLibraryFilterFocused,
    libraryFilterFromTabs: _libraryFilterFromTabs, setLibraryFilterFromTabs: _setLibraryFilterFromTabs,
    isLibraryFilterPanelOpen: _isLibraryFilterPanelOpen, setIsLibraryFilterPanelOpen,
    isWidgetEditOpen, setIsWidgetEditOpen,
    widgetEditFocusIndex, setWidgetEditFocusIndex,
    isWidgetMoveMode, setIsWidgetMoveMode: _setIsWidgetMoveMode,
    movingWidgetId, setMovingWidgetId: _setMovingWidgetId,
    preMoveOrderBackup: _preMoveOrderBackup, setPreMoveOrderBackup: _setPreMoveOrderBackup,
    startWidgetMove,
    getWidgetNeighbor: _getWidgetNeighbor,
  } = useFocusNavigation({
    activeTab,
    storeOffers,
    steamMedia,
    steamNews,
    achievementCount,
    lastPlayedGame,
    isLaunching,
    isSettingsVisible,
    isWelcomeSettingsVisible,
    isAddModalVisible,
    isHomeBgModalVisible,
    isSlidesModalVisible,
    isSearchVisible,
    isMediaGalleryVisible,
    isTrophiesVisible,
    isDetailVisible,
    isLibraryDetailVisible,
    isContextMenuOpen,
    isProfileMenuOpen,
    isFavoritesVisible,
    isRandomSelectorVisible,
    deleteConfirmItem,
    selectedMediaIndex,
    isSystemNavCardExpanded,
    isFriendsCardOpen,
    isNotificationsCardOpen,
    isUserModalVisible,
    activeUser,
    widgetVisibility,
    widgetOrder,
    widgetSizes,
    isPresentationMode,
    row1Visible,
    row2Visible,
    widgetColumns,
    PANEL_WIDGETS,
    storeDeals,
    storeUpcoming,
    currentData,
    libraryTab,
    mountTimeRef,
    scrollRef,
    mainScrollRef,
    mediaScrollRef,
    newsScrollRef,
    widgetScrollRef,
    libraryGridRef,
    systemNavLevel,
    systemNavMaxCardIndex,
    profileMenuFocusIndex,
    contextMenuFocusIndex,
    modalSelectedIndex,
    setActiveTab,
    handleLaunchApp: (item: ConsoleItem) => _handleLaunchAppRef.current(item),
    openContextMenu: () => _openContextMenuRef.current(),
    handleContextMenuAction: (idx: number) => _handleContextMenuActionRef.current(idx),
    handleToggleFavorite: () => _handleToggleFavoriteRef.current(),
    handleTogglePin: () => _handleTogglePinRef.current(),
    handleProfileMenuAction: (idx: number) => _handleProfileMenuActionRef.current(idx),
    handleSystemNavAction: (idx: number) => _handleSystemNavActionRef.current(idx),
    setAddModalVisible,
    setFavoritesVisible,
    setRandomSelectorVisible,
    setHomeBgModalVisible,
    setWelcomeSettingsVisible,
    setDetailVisible,
    setDetailInitialEditMode,
    setSelectedItem,
    setSearchVisible,
    setUserModalVisible,
    setSettingsVisible,
    setIsProfileMenuOpen,
    setProfileMenuFocusIndex,
    setIsContextMenuOpen,
    setContextMenuFocusIndex,
    setModalSelectedIndex,
    setSystemNavLevel,
    setSystemNavCardIndex,
    setSystemNavCardExpanded,
    setInputMode,
    setSelectedMediaIndex,
    setTrophiesVisible,
    saveWidgetOrder,
    saveWidgetVisibility,
    setWidgetVisibility,
    setWidgetOrder,
    setIsWidgetEditOpen: () => { }, // el hook gestiona este estado internamente
    setWidgetEditFocusIndex: () => { }, // el hook gestiona este estado internamente
    resizeWidget,
    resetInteraction,
    setLibraryTab,
    setIsFriendsCardOpen,
    setIsNotificationsCardOpen,
    windowWidth,
    windowHeight,
    ITEM_WIDTH,
  });

  // Widget con foco en WidgetEditPanel (null si el panel está cerrado). WelcomeWidgets atenúa el resto.
  const editingWidgetId = isWidgetEditOpen ? (PANEL_WIDGETS[widgetEditFocusIndex]?.id ?? null) : null;

  // Background transition: un solo estado combinado para evitar re-renders en cascada
  const [bgState, setBgState] = useState<{ bgA: any; bgB: any; activeLayer: 'A' | 'B' }>(
    { bgA: null, bgB: null, activeLayer: 'A' }
  );
  const [showTrailer, setShowTrailer] = useState(false);
  const fade = useSharedValue(0);
  const tabFade = useSharedValue(1);
  const gamePanelFocusAnim = useSharedValue(0);
  const lowerSectionFocusAnim = useSharedValue(0);
  const welcomeWidgetsFocusAnim = useSharedValue(0);
  const infoCardsAnim = useSharedValue(1); // 1=visible, 0=hidden
  const deepSectionFocusAnim = useSharedValue(0); // 1=capturas/noticias, 0=trofeos o arriba


  useEffect(() => {
    setShowTrailer(false);
    const autoPlay = activeUser?.settings?.autoPlayVideo !== false;
    if (!autoPlay) return;
    const item = currentData[activeIndex];
    if (item?.youtubeId) {
      const timer = setTimeout(() => { setShowTrailer(true); }, 3000);
      return () => clearTimeout(timer);
    }
  }, [activeIndex, currentRenderedTab, activeUser?.settings?.autoPlayVideo]);

  const raf2Ref = useRef<number | null>(null);
  useEffect(() => {
    // Doble rAF: deja que el primer commit se pinte y que Reanimated
    // termine de registrar sus worklets/estilos antes de montar el contenido animado
    const raf1 = requestAnimationFrame(() => {
      raf2Ref.current = requestAnimationFrame(() => setUiReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2Ref.current !== null) {
        cancelAnimationFrame(raf2Ref.current);
        raf2Ref.current = null;
      }
    };
  }, []);

  // Evita que el efecto de cambio de pestaña corra en el primer render
  // (desmontaba y volvía a montar todas las tarjetas del carrusel al arrancar).
  const firstTabRun = useRef(true);
  useEffect(() => {
    if (firstTabRun.current) { firstTabRun.current = false; return; }
    // Fade out old content
    tabFade.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) }, (isFinished) => {
      if (isFinished) {
        runOnJS(setCurrentRenderedTab)(activeTab);
        // Bump carouselKey so cards remount and replay the entrance animation
        runOnJS(setCarouselKey)((prev: number) => prev + 1);
      }
    });
  }, [activeTab]);

  useEffect(() => {
    // Fade in new content once swap happens
    tabFade.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });
  }, [currentRenderedTab]);

  // Fetch PlayStation Storefront offers
  useEffect(() => {
    const source = activeUser?.settings?.storeSource || 'ps5';
    setStoreLoading(true);
    const loader = source === 'steam'
      ? fetchSteamStoreOffers()
      : fetchStoreOffers();

    loader
      .then((data) => {
        const base = data.length > 0 ? data : LOCAL_FALLBACK_OFFERS;
        setStoreOffers(base);
        if (source === 'steam') {
          // Fuente Steam: fondos + logos de SteamGrid.
          enrichOffersWithHeroes(base).then((enriched) => {
            setStoreOffers(enriched);
          });
        } else {
          // Fuente PS5 Store: fondos de PSN en lugar de SteamGrid.
          enrichOffersWithPsnBackgrounds(base, psnLocaleForLanguage(language)).then((enriched) => {
            setStoreOffers(enriched);
          });
        }
      })
      .finally(() => setStoreLoading(false));
  }, [activeUser?.settings?.storeSource, language]);

  const isStoreCard = (currentRenderedTab === 'Games' ? games : media)[activeIndex]?.id === '5';
  const isGamePanelFocused = focusArea === 'game_panel';
  const isLowerSectionFocused = isGamePanelFocused && !isStoreCard && gamePanelFocusIndex >= 2;
  const isDeepSectionFocused = isGamePanelFocused && !isStoreCard && gamePanelFocusIndex >= 4;
  const isTopHidden = focusArea === 'game_panel' || focusArea === 'library_grid';

  useEffect(() => {
    deepSectionFocusAnim.value = withTiming(isDeepSectionFocused ? 1 : 0, { duration: 300 });
  }, [isDeepSectionFocused]);

  useEffect(() => {
    gamePanelFocusAnim.value = withTiming(isTopHidden ? 1 : 0, { duration: 300 });
  }, [isTopHidden]);

  useEffect(() => {
    lowerSectionFocusAnim.value = withTiming(isLowerSectionFocused ? 1 : 0, { duration: 300 });
  }, [isLowerSectionFocused]);

  useEffect(() => {
    welcomeWidgetsFocusAnim.value = withTiming(
      (focusArea === 'welcome_widgets' || focusArea === 'welcome_toolbar') ? 1 : 0,
      { duration: 280, easing: Easing.out(Easing.quad) }
    );
  }, [focusArea]);

  const isScreenshotRowFocused = focusArea === 'game_panel' && gamePanelFocusIndex >= 4;

  useEffect(() => {
    infoCardsAnim.value = withTiming(isScreenshotRowFocused ? 0 : 1, { duration: 300, easing: Easing.out(Easing.quad) });
  }, [isScreenshotRowFocused]);

  const infoCardsStyle = useAnimatedStyle(() => ({
    opacity: infoCardsAnim.value,
    transform: [{ translateY: interpolate(infoCardsAnim.value, [0, 1], [20, 0]) }],
    maxHeight: interpolate(infoCardsAnim.value, [0, 1], [0, 200]),
    overflow: 'hidden',
    marginBottom: interpolate(infoCardsAnim.value, [0, 1], [0, 0]),
  }));

  const animatedTabContentStyle = useAnimatedStyle(() => ({
    opacity: tabFade.value,
    transform: [{ translateY: interpolate(tabFade.value, [0, 1], [10, 0]) }]
  }));

  const darkOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lowerSectionFocusAnim.value, [0, 1], [0, 0.5]),
  }));

  const topPanelStyle = useAnimatedStyle(() => {
    // Collapse both for game lower section AND for welcome widgets focus
    const collapseAnim = Math.max(lowerSectionFocusAnim.value, welcomeWidgetsFocusAnim.value);
    return {
      opacity: 1 - collapseAnim,
      transform: [{ translateY: interpolate(collapseAnim, [0, 1], [0, -20]) }],
      maxHeight: interpolate(collapseAnim, [0, 1], [500, 0]),
      marginTop: interpolate(collapseAnim, [0, 1], [0, -20]),
      overflow: collapseAnim > 0.01 ? 'hidden' : 'visible',
    };
  });

  const spacerStyle = useAnimatedStyle(() => {
    const isWelcome = (currentRenderedTab === 'Games' ? games : media)[activeIndex]?.id === '1';
    const trophyHeight = 320;
    // Al navegar por capturas, trofeos o noticias conservamos la misma
    // separación vertical que usa GameDetailView, sin añadir espacio cuando
    // la ficha principal del juego está visible.
    const deepHeight = interpolate(deepSectionFocusAnim.value, [0, 1], [trophyHeight, 270]);
    const targetMinHeight = interpolate(
      lowerSectionFocusAnim.value,
      [0, 1],
      [
        interpolate(gamePanelFocusAnim.value, [0, 1], [windowHeight - 388, windowHeight * 0.5 + 200]),
        deepHeight
      ]
    );
    // When welcome_widgets is focused: keep spacer constant
    const welcomeHeight = Math.max(30, windowHeight - 623);
    return {
      minHeight: isWelcome ? welcomeHeight : Math.max(0, targetMinHeight),
      justifyContent: 'flex-end',
      paddingBottom: 20,
    };
  });

  const headerStyle = useAnimatedStyle(() => {
    // Collapse both when game_panel is focused AND when welcome_widgets is focused
    const collapseAnim = Math.max(gamePanelFocusAnim.value, welcomeWidgetsFocusAnim.value);
    const heightCollapse = gamePanelFocusAnim.value;
    return {
      opacity: 1 - collapseAnim,
      transform: [{ translateY: interpolate(collapseAnim, [0, 1], [0, -20]) }],
      maxHeight: interpolate(heightCollapse, [0, 1], [100, 0]),
      paddingTop: interpolate(heightCollapse, [0, 1], [16, 0]),
      paddingBottom: interpolate(heightCollapse, [0, 1], [4, 0]),
      overflow: 'hidden',
    };
  });

  const carouselStyle = useAnimatedStyle(() => {
    const collapseAnim = Math.max(gamePanelFocusAnim.value, welcomeWidgetsFocusAnim.value);
    const heightCollapse = gamePanelFocusAnim.value;
    const EXTRA_BUFFER = 24; // ajusta este valor hasta que la card ya no se corte
    const fullHeight = CARD_SIZE + 80 + EXTRA_BUFFER;
    return {
      opacity: 1 - collapseAnim,
      transform: [{ translateY: interpolate(collapseAnim, [0, 1], [0, -20]) }],
      height: interpolate(heightCollapse, [0, 1], [fullHeight, 0]),
      marginBottom: interpolate(heightCollapse, [0, 1], [-EXTRA_BUFFER, 0]),
      overflow: heightCollapse > 0.01 ? 'hidden' : 'visible',
    };
  });

  const topBarMiniStyle = useAnimatedStyle(() => {
    const collapseAnim = Math.max(gamePanelFocusAnim.value, welcomeWidgetsFocusAnim.value);
    return {
      opacity: collapseAnim,
      transform: [{ translateY: interpolate(collapseAnim, [0, 1], [-20, 0]) }],
      pointerEvents: (isTopHidden || focusArea === 'welcome_widgets' || focusArea === 'welcome_toolbar') ? 'auto' : 'none',
    };
  });

  const gameInfoPanelStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: interpolate(
        lowerSectionFocusAnim.value,
        [0, 1],
        [
          interpolate(gamePanelFocusAnim.value, [0, 1], [0, -60]),
          0
        ]
      )
    }]
  }));

  // Push widgets down when contracted so they appear centered/lower on screen
  const widgetContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: windowHeight * (40 / 1080),
    paddingTop: 0,
  }));
  //Altura widgets
  const welcomePanelLayout = useMemo(() => ({
    paddingLeft: Math.max(20, windowWidth * (150 / 1920)),
    //paddingRight: Math.max(20, windowWidth * (10 / 1920)),
    paddingTop: Math.max(8, windowHeight * (16 / 1080)),
    paddingBottom: Math.max(1, windowHeight * (1 / 1080)),
  }), [windowWidth, windowHeight]);

  const mainScrollContentStyle = useMemo(() => ({
    ...styles.mainScrollContent,
    minHeight: windowHeight - 40,
  }), [windowHeight]);

  const widgetContainerStyle2 = useAnimatedStyle(() => ({
    paddingBottom: 0,
    paddingTop: 0,
  }));

  const wviewStyle = useAnimatedStyle(() => ({
    display: welcomeWidgetsFocusAnim.value === 1 ? 'flex' : 'none',
  }));

  // ─── Presentation mode: hide/show animations ───────────────
  const presentationHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(presentationAnim.value, [0, 1], [1, 0]),
    transform: [{ translateY: interpolate(presentationAnim.value, [0, 1], [0, -80]) }],
  }));
  const presentationCarouselStyle = useAnimatedStyle(() => ({
    opacity: interpolate(presentationAnim.value, [0, 1], [1, 0]),
  }));
  const presentationWidgetsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(presentationAnim.value, [0, 1], [1, 0]),
    transform: [{ translateY: interpolate(presentationAnim.value, [0, 1], [0, 100]) }],
  }));
  const presentationToolbarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(presentationAnim.value, [0, 1], [topBarMiniStyle.opacity, 0]),
    transform: [{ translateY: interpolate(presentationAnim.value, [0, 1], [0, -40]) }],
  }));

  useEffect(() => {
    if (Platform.OS === 'web') {
      const savedBg = localStorage.getItem('home_background');
      if (savedBg) setHomeBackground({ uri: savedBg });
    }
  }, []);

  const focusedCarouselItem = currentData[activeIndex];
  // La tarjeta "Último jugado" hereda la música del juego que representa.
  const focusedCarouselAudio = focusedCarouselItem?.isLastPlayed
    ? lastPlayedGame?.focusAudio
    : focusedCarouselItem?.focusAudio;

  function compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    const length = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < length; i++) {
      const aNum = aParts[i] || 0;
      const bNum = bParts[i] || 0;
      if (aNum > bNum) return 1;
      if (aNum < bNum) return -1;
    }
    return 0;
  }

  const CheckUpdates = async () => {
    try {
      const res = await fetch(
        'https://angelvc25.github.io/WPS5-API/WPS5-API-V.json'
      );
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json() as {
        name: string;
        tipe: string;
        version: string;
        link: string;
      }[];
      const latest = data[0];
      console.log(latest.version, latest.tipe, latest.link);
      console.log(data);
      const currentVersion = '1.1.5';
      const comparison = compareVersions(latest.version, currentVersion);
      if (comparison > 0) {
        toastService.show(`${t('settings.updateAvailable')}\n${latest.version}`, {
          icon: require('@/assets/icons/logoblanco.png'),
          source: 'system',
        });
      } else {
        toastService.show(t('settings.youHaveTheLatestVersion'), {
          icon: require('@/assets/icons/logoblanco.png'),
          source: 'system',
        });
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      toastService.show(t('settings.updateCheckFailed'), {
        icon: require('@/assets/icons/logoblanco.png'),
        source: 'system',
      });
    }
  }

  useEffect(() => {
    setTimeout(() => {
      CheckUpdates();
    }, 8000);
  }, []);

  useEffect(() => {
    const currentItem = currentData[activeIndex];
    setIsLibraryFocused(
      currentItem?.id === 'more_library' ||
      focusArea === 'library_grid'
    );
  }, [activeIndex, focusArea, currentData]);

  // t() depende del idioma actual: se accede vía ref para que los toasts
  // en segundo plano (p. ej. solicitudes de amistad) salgan traducidos.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    loadApps();
    fetchGamingNews().then(() => { });
    initOnlineLibraryAutoSync();
    initOnlineFriendWatcher((key, params) => tRef.current(key as any, params));
    // La música de la interfaz espera al fin del splash/video de booteo
    // (el _layout avisa con 'wps5-splash-done') para no pisar su audio.
    soundService.init();
    const startInterfaceAudio = () => {
      soundService.playBackground();
      soundService.playStartHome();
    };
    const splashDone =
      typeof window === 'undefined' || (window as any).WPS5_SPLASH_DONE === true;
    let stopSplashListener: (() => void) | undefined;
    if (splashDone) {
      startInterfaceAudio();
    } else {
      const onSplashDone = () => startInterfaceAudio();
      window.addEventListener('wps5-splash-done', onSplashDone, { once: true });
      stopSplashListener = () => window.removeEventListener('wps5-splash-done', onSplashDone);
    }
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      (window as any).electronAPI.getStorageInfo().then((res: any) => {
        if (res.success) setStorageInfo({
          percent: res.percent,
          freeGB: res.freeGB,
          disks: Array.isArray(res.disks) ? res.disks : [],
        });
      });
    }
    return stopSplashListener;
  }, []);

  // La música temática solo se activa en Inicio y después de mantener el foco
  // sobre un juego. Así no se dispara durante una navegación rápida del carrusel.
  // También se desactiva por completo mientras `isLaunching` es true (launcher
  // suspendido con un juego en curso): de lo contrario, si el juego lanzado
  // queda enfocado en el carrusel (ej. como "último jugado"), este efecto se
  // dispara igual porque activeIndex/focusArea cambian al lanzar, y el
  // setTimeout de 2.5s sigue corriendo aunque la ventana esté oculta —
  // haciendo sonar el tema del juego mientras ya estás jugando.
  const stopFocusAudio = useCallback(async (resumeBackground: boolean) => {
    if (focusAudioDelayRef.current) {
      clearTimeout(focusAudioDelayRef.current);
      focusAudioDelayRef.current = null;
    }
    const sound = focusAudioSoundRef.current;
    focusAudioSoundRef.current = null;
    if (sound) {
      try { sound.remove(); } catch (_) { }
    }
    if (resumeBackground && !isLaunching) await soundService.playBackground();
  }, [isLaunching]);

  useEffect(() => {
    const requestId = ++focusAudioRequestRef.current;
    const shouldPlayFocusAudio =
      activeTab === 'Games' &&
      focusArea === 'main_carousel' &&
      !!focusedCarouselAudio &&
      !isLaunching &&
      !isDetailVisible; // No iniciar audio del carrusel mientras el detalle está abierto

    void stopFocusAudio(!shouldPlayFocusAudio || !!focusAudioSoundRef.current);
    if (!shouldPlayFocusAudio) return;

    const audioPath = focusedCarouselAudio;
    focusAudioDelayRef.current = setTimeout(async () => {
      if (focusAudioRequestRef.current !== requestId) return;
      if (isLaunchingRef.current) return; // el juego pudo lanzarse durante la espera de 2.5s
      try {
        await soundService.pauseBackground();
        const uri = audioPath.startsWith('http') || audioPath.startsWith('local-file://') || audioPath.startsWith('data:')
          ? audioPath
          : `local-file:///${audioPath.replace(/\\/g, '/')}`;
        const sound = createAudioPlayer(uri);
        sound.loop = true;
        sound.volume = 0.8;
        const playPromise = sound.play() as any;
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
        if (focusAudioRequestRef.current !== requestId) {
          try { sound.remove(); } catch (_) {}
          return;
        }
        focusAudioSoundRef.current = sound;
      } catch (error) {
        console.warn('No se pudo reproducir el audio de foco:', error);
        if (!isLaunchingRef.current) await soundService.playBackground();
      }
    }, 500);

    return () => { void stopFocusAudio(true); };
  }, [activeIndex, activeTab, focusArea, focusedCarouselAudio, isLaunching, isDetailVisible, stopFocusAudio]);

  const openContextMenu = () => {
    const item = currentData[activeIndex];
    if (!item || item.id === 'more_library' || item.id === '1' || item.id === '5' || item.isLastPlayed) return;

    if (activeCardRef.current) {
      activeCardRef.current.measureInWindow((x, y, width, height) => {
        setContextMenuCoords({
          left: x,
          top: y,
        });
        setIsContextMenuOpen(true);
        setContextMenuFocusIndex(0);
        soundService.playNavigation();
      });
    } else {
      setContextMenuCoords({
        left: 335,
        top: 250,
      });
      setIsContextMenuOpen(true);
      setContextMenuFocusIndex(0);
      soundService.playNavigation();
    }
  };

  const handleContextMenuAction = async (idx: number) => {
    setIsContextMenuOpen(false);
    const item = currentData[activeIndex];
    if (!item) return;

    if (idx === 0) {
      // Editar Datos
      setSelectedItem(item);
      setDetailInitialEditMode(true);
      setDetailVisible(true);
    } else if (idx === 1) {
      // Ubicación
      if (Platform.OS === 'web' && (window as any).electronAPI) {
        if (item.path) {
          const result = await (window as any).electronAPI.openGameLocation(item.path);

          if (!result.success) {
            toastService.show(t('toast.error') + ": " + result.error);
          }
        } else {
          toastService.show(t('toast.noPath'));
        }
      }
    } else if (idx === 2) {
      // Eliminar juego
      setDeleteConfirmItem(item);
    }
  };

  const handleSystemNavAction = (idx: number) => {
    if (idx === 0) {
      // Inicio
      setFocusArea('main_carousel');
    } else if (idx === 2) {
      setIsNotificationsCardOpen(true);
      soundService.playActivation?.();
    } else if (idx === 3) {
      // Game Base – abrir card de amigos (responsive, scrollable, oscurece fondo)
      setIsFriendsCardOpen(true);
      soundService.playActivation?.();
    } else if (idx === 4) {
      // Música – abrir card de música expandida
      setIsMusicCardOpen(true);
      soundService.playActivation?.();
    } else if (idx === 5) {
      // Descargas – abrir card de descargas expandida
      setIsDownloadsCardOpen(true);
      soundService.playActivation?.();
    } else if (idx === 9) {
      // Perfil (Cambiar usuario)
      changeUser();
    } else if (idx === 10) {
      // Alimentación (Apagar)
      requestAppShutdown();
    } else {
      // Placeholder para otras opciones
      console.log('Acción no implementada aún para el índice:', idx);
    }
  };

  const handleProfileMenuAction = (idx: number) => {
    setIsProfileMenuOpen(false);
    if (idx === 0) {
      // Toggle Estado Online
      setIsOnline(prev => !prev);
      soundService.playNavigation();
    } else if (idx === 1) {
      const isLinked = !!(activeUser?.settings as any)?.onlineUserId;
      if (isLinked) {
        // Perfil (Abre Configuración -> Perfil)
        setSettingsInitialScreen('users_and_accounts');
      } else {
        // Iniciar sesión (Abre pantalla de autenticación online con diseño manual PS5)
        setSettingsInitialScreen('online_auth');
      }
      setSettingsVisible(true);
      soundService.playActivation?.();
    } else if (idx === 2) {
      // Trofeos
      soundService.playActivation?.();
      alert(t('alert.trophies', { name: activeUser?.name || t('alert.userFallback') }));
    } else if (idx === 3) {
      // Cambiar usuario
      changeUser();
    } else if (idx === 4) {
      // Salir
      if (Platform.OS === 'web' && (window as any).electronAPI) {
        requestAppShutdown();
      } else {
        alert(t('alert.closingConsole'));
      }
    }
  };

  useEffect(() => {
    mountTimeRef.current = Date.now();
  }, []);

  useGamepadInput({
    onInputModeChange: setInputMode,
    onGamepadChange: setGamepadInfo,
    onConnected: () => {
      toastService.show(t('toast.controllerConnected'), {
        duration: 2500,
        icon: require('@/assets/images/controller.png'),
        source: 'system',
      });
    },
    onStaleGamepad: () => {
      toastService.show(t('toast.controllerNotResponding'), {
        duration: 5000, // un poco más largo, es un mensaje accionable, dale tiempo a leerlo
        icon: require('@/assets/images/controller.png'),
        source: 'system',
      });
    },
  });

  useEffect(() => {
    if (selectedItem) {
      const updated = currentData.find(i => i.id === selectedItem.id);
      if (updated) setSelectedItem(updated);
    }
  }, [games, media, activeTab]);

  useEffect(() => {
    if (!isUserModalVisible && focusArea === 'header_user') {
      setFocusArea('main_carousel');
    }
  }, [isUserModalVisible]);

  useEffect(() => {
    if (focusArea !== 'header_user') {
      setSystemNavLevel(0);
      setSystemNavCardExpanded(false);
    }
  }, [focusArea]);

  useEffect(() => {
    if (!isAddModalVisible && focusArea === 'footer') setFocusArea('main_carousel');
    if (isAddModalVisible) {
      setAddModalFocusIndex(0);
      setTimeout(() => addModalTitleRef.current?.focus(), 100);
    }
  }, [isAddModalVisible]);

  useEffect(() => {
    if (isSettingsVisible) { setSettingsFocusArea('sidebar'); setSettingsFocusIndex(0); }
  }, [isSettingsVisible]);

  // Auto-scroll platform row in Add App modal so the focused platform stays visible
  useEffect(() => {
    if (!isAddModalVisible || newApp.type !== 'game') return;
    const platformIdx = addModalFocusIndex - 4;
    if (platformIdx < 0 || platformIdx >= PLATFORMS.length) return;
    const offset = addModalPlatformOffsets.current[platformIdx];
    if (offset !== undefined && addModalPlatformScrollRef.current) {
      addModalPlatformScrollRef.current.scrollTo({ x: Math.max(0, offset - 12), animated: true });
    }
  }, [addModalFocusIndex, isAddModalVisible, newApp.type]);


  // Obtener noticias de Steam cuando cambia el juego activo (con debounce)
  useEffect(() => {
    const item = currentData[activeIndex];
    const playable = item && !item.isFolder && !item.isGrid && item.id !== '1';
    if (!playable) { setSteamNews([]); return; }
    if (activeUser?.settings?.showNews === false) { setSteamNews([]); setNewsLoading(false); return; }
    const title = item.isLastPlayed ? (lastPlayedGame?.title || '') : (item.title || '');
    if (!title || title === 'Último Jugado') { setSteamNews([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      setNewsLoading(true);
      setSteamNews([]);
      fetchSteamNewsByName(title, language).then(news => {
        if (!cancelled) { setSteamNews(news); setNewsLoading(false); }
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, currentRenderedTab, lastPlayedGame?.id, language, activeUser?.settings?.showNews]);

  // Obtener capturas y tráilers cuando cambia el juego activo (con debounce)
  useEffect(() => {
    const item = currentData[activeIndex];
    const playable = item && !item.isFolder && !item.isGrid && item.id !== '1';
    if (!playable) { setSteamMedia([]); return; }
    const title = item.isLastPlayed ? (lastPlayedGame?.title || '') : (item.title || '');
    if (!title || title === 'Último Jugado') { setSteamMedia([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setMediaLoading(true);
      setSteamMedia([]);
      try {
        const srcItem = item.isLastPlayed ? lastPlayedGame : item;
        const [images, igdbVideos] = await Promise.all([
          resolveGameScreenshots(title, { platform: srcItem?.platform, language }),
          fetchGameVideosByName(title),
        ]);
        if (cancelled) return;
        const videos: SteamMediaItem[] = (igdbVideos as unknown as SteamMediaItem[]) || [];
        if (!cancelled) {
          setSteamMedia([...videos, ...images]);
          setGameVideos(igdbVideos as any);
        }
      } catch (error) {
        console.error('[Media] Error obteniendo capturas:', error);
        if (!cancelled) { setSteamMedia([]); }
      } finally {
        if (!cancelled) { setMediaLoading(false); }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, currentRenderedTab, lastPlayedGame?.id, language]);

  const handleLaunchApp = (item: ConsoleItem) => {
    if (!item || item.id === '1' || item.id === '5' || item.id === 'more_library' || item.isFolder || item.isGrid) return;
    if (item.isLastPlayed && (!lastPlayedGame || lastPlayedGame.id === '1' || lastPlayedGame.id === '5')) {
      toastService.show('toast.noGameLaunched');
      return;
    }
    const targetItem = item.isLastPlayed ? lastPlayedGame! : item;
    if (!targetItem || targetItem.id === '1' || targetItem.id === '5' || targetItem.id === 'more_library') return;

    if (targetItem?.id && (!targetItem.type || targetItem.type === 'game') && !launchStartTimeRef.current[targetItem.id]) {
      launchStartTimeRef.current[targetItem.id] = Date.now();
      sessionPlaytimeRef.current[targetItem.id] = Number(targetItem.playtimeMinutes ?? targetItem.playtime_forever ?? 0);

      // Guardar cantidad de logros desbloqueados antes de jugar + enviar
      // credenciales Steam al main process para el poller en tiempo real.
      const appId = extractTrophySteamAppId(targetItem);
      const steamId = activeUser?.settings?.steamId;
      const apiKey = activeUser?.settings?.steamApiKey || process.env.EXPO_PUBLIC_STEAM_API_KEY || 'B1F361EA3C07B455DC8B0D06ED179B00';

      if (appId && steamId) {
        fetchSteamGameAchievements(apiKey, steamId, appId).then(summary => {
          if (summary && typeof summary.unlocked === 'number') {
            initialUnlockedRef.current[targetItem.id] = summary.unlocked;
          }
        }).catch(() => { });
        // Enviar credenciales al main para que el poller de trofeos funcione
        if (Platform.OS === 'web' && (window as any).electronAPI?.setActiveSteamCredentials) {
          (window as any).electronAPI.setActiveSteamCredentials({ steamId, apiKey });
        }
      } else if (appId) {
        fetchAwGameAchievements(appId, 'local', 'english', apiKey).then(summary => {
          if (summary && typeof summary.unlocked === 'number') {
            initialUnlockedRef.current[targetItem.id] = summary.unlocked;
          }
        }).catch(() => { });
      } else if (targetItem.path && targetItem.path.endsWith('.exe')) {
        fetchPcGameAchievements(targetItem.path, apiKey).then(summary => {
          if (summary && typeof summary.unlocked === 'number') {
            initialUnlockedRef.current[targetItem.id] = summary.unlocked;
          }
        }).catch(() => { });
      }
    }

    if (targetItem?.id && (!targetItem.type || targetItem.type === 'game')) {
      markGameAsLastPlayed(targetItem);
    }

    const launchPath = resolveSteamLaunchPath(targetItem, installedSteamAppIds);
    if (!launchPath) {
      setSelectedItem(targetItem);
      setDetailVisible(true);
      return;
    }
    if (launchPath.startsWith('http')) {
      if (Platform.OS === 'web' && (window as any).electronAPI) {
        (window as any).electronAPI.launchApp(targetItem.id, launchPath, targetItem.launchArgs).then(() => loadApps());
      } else {
        Linking.openURL(launchPath);
      }
      return;
    }
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      setLaunchingItem(targetItem);
      setIsLaunching(true);
      // Cerrar cualquier detalle abierto (carrusel o librería) para que al
      // volver del juego ningún modal ni flag atrape el teclado.
      setDetailVisible(false);
      libraryGridRef.current?.closeDetail();
      setIsLibraryDetailVisible(false);
      (window as any).electronAPI.launchApp(targetItem.id, launchPath, targetItem.launchArgs).then((result: any) => {
        loadApps();
        console.log('Juego lanzado');
        soundService.stopBackground();
        if (activeTab === 'Games') {
          const lpIdx = currentData.findIndex(x => x.id === 'last_played');
          if (lpIdx !== -1) {
            setActiveIndex(lpIdx);
          } else {
            setActiveIndex(2);
          }
        }
        setFocusArea('main_carousel');
        setDetailVisible(false);
        libraryGridRef.current?.closeDetail();
        setIsLibraryDetailVisible(false);
        setFavoritesVisible(false);
        setRandomSelectorVisible(false);

        if (!result?.suspended) {
          setTimeout(() => {
            setIsLaunching(false);
            setLaunchingItem(null);
          }, 5000);
        }
      }).catch((e: any) => {
        console.error('[Launch] Error lanzando el juego:', e);
        setIsLaunching(false);
        setLaunchingItem(null);
        toastService.show(t('toast.error'));
      });
    }
  };

  // Escuchar trofeos desbloqueados en tiempo real durante la sesión de juego.
  // El main process envía este evento cuando el poller detecta un logro nuevo.
  // Reproducimos el sonido y mostramos el toast / guardamos en el historial de notificaciones.
  useEffect(() => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.onTrophyUnlocked) return;
    const removeListener = (window as any).electronAPI.onTrophyUnlocked((data: any) => {
      soundService.playNotification?.();
      // Contabilizar para no duplicar el toast al cerrar el juego
      const gameId = data?.gameInfo?.id;
      if (gameId) {
        realtimeTrophiesNotifiedRef.current[gameId] =
          (realtimeTrophiesNotifiedRef.current[gameId] ?? 0) + 1;
      }
      const ach = data?.achievement;
      const game = data?.gameInfo;
      if (ach) {
        const achTitle = ach.name || 'Logro desbloqueado';
        const gameTitle = game?.title ? ` • ${game.title}` : '';
        const desc = ach.description ? `\n${ach.description}` : '';
        toastService.show(`🏆 ${achTitle}${gameTitle}${desc}`, {
          duration: 6000,
          source: 'trophies',
          icon: ach.icon ? { uri: ach.icon } : undefined,
          coverImage: ach.icon
            ? { uri: ach.icon }
            : (game?.image ? (typeof game.image === 'string' ? { uri: game.image } : game.image) : undefined),
          saveToHistory: true,
        });
      }
    });
    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  // Escuchar suspensión del launcher para pausar videos en el DOM y sonido mientras se juega
  useEffect(() => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.onLauncherSuspended) {
      const removeListener = (window as any).electronAPI.onLauncherSuspended((suspended: boolean) => {
        if (suspended) {
          if (typeof document !== 'undefined') {
            document.querySelectorAll('video').forEach((v) => {
              try { v.pause(); } catch (_) { }
            });
          }
          try { soundService.pauseBackground(); } catch (_) { }
          void stopFocusAudio(false);
          if (typeof (window as any).gc === 'function') {
            try { (window as any).gc(); } catch (_) { }
          }
        } else {
          if (typeof document !== 'undefined') {
            document.querySelectorAll('video').forEach((v) => {
              try { v.play().catch(() => { }); } catch (_) { }
            });
          }
          try { soundService.playBackground(); } catch (_) { }
        }
      });
      return () => {
        if (removeListener) removeListener();
      };
    }
  }, [stopFocusAudio]);

  // Escuchar actualizaciones de apps desde el proceso principal (ej. migración de imágenes a local para offline)
  useEffect(() => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.onAppUpdated) {
      const removeListener = (window as any).electronAPI.onAppUpdated((updatedApp: any) => {
        if (updatedApp && updatedApp.id) {
          mergeGameIntoStateRef.current(updatedApp);
        }
      });
      return () => {
        if (removeListener) removeListener();
      };
    }
  }, []);

  // Escuchar evento game-closed del proceso principal (launcher resume tras cerrar juego)
  useEffect(() => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.onGameClosed) {
      (window as any).electronAPI.onGameClosed((id: string) => {
        console.log('Juego cerrado, restaurando launcher:', id);
        const startedAt = launchStartTimeRef.current[id];
        if (startedAt) {
          const elapsedMinutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));

          // El item pudo haber sido excluido de "games" por loadApps() al
          // convertirse en el último jugado (ver lógica de gamesWithoutLastPlayed),
          // por eso también buscamos en steamGames y en lastPlayedGame.
          const trackedItem =
            games.find(item => item.id === id) ||
            steamGames.find(item => item.id === id) ||
            (lastPlayedGame && lastPlayedGame.id === id ? lastPlayedGame : null);

          if (trackedItem) {
            const currentMinutes = Number(trackedItem.playtimeMinutes ?? trackedItem.playtime_forever ?? 0);
            const updatedMinutes = currentMinutes + elapsedMinutes;
            sessionPlaytimeRef.current[id] = updatedMinutes;
            syncGamePlaytime(id, updatedMinutes);

            // Comprobar si se desbloquearon nuevos logros al cerrar el juego
            const appId = extractTrophySteamAppId(trackedItem);
            const steamId = activeUser?.settings?.steamId;
            const apiKey = activeUser?.settings?.steamApiKey || process.env.EXPO_PUBLIC_STEAM_API_KEY || 'B1F361EA3C07B455DC8B0D06ED179B00';
            const prevUnlocked = initialUnlockedRef.current[id];
            delete initialUnlockedRef.current[id];

            const handleNewAchievements = async (summary: any) => {
              if (summary && typeof summary.unlocked === 'number') {
                const newUnlocked = summary.unlocked;
                if (typeof prevUnlocked === 'number' && newUnlocked > prevUnlocked) {
                  const diff = newUnlocked - prevUnlocked;
                  // Descuentar los trofeos ya notificados en tiempo real
                  // para no duplicar el popup al volver al launcher.
                  const alreadyNotified = realtimeTrophiesNotifiedRef.current[id] ?? 0;
                  delete realtimeTrophiesNotifiedRef.current[id];
                  const pendingDiff = diff - alreadyNotified;

                  if (pendingDiff > 0) {
                    // Mostrar popup PS5 por cada logro nuevo no notificado aún.
                    // Usamos los datos completos del summary (con icon, rarity, etc.).
                    const newlyUnlocked = (summary.achievements || [])
                      .filter((a: any) => a.achieved)
                      .sort((a: any, b: any) => (b.unlockTime ?? 0) - (a.unlockTime ?? 0))
                      .slice(0, pendingDiff);

                    const gameInfo = { id, title: trackedItem.title, image: trackedItem.image };

                    for (const ach of newlyUnlocked) {
                      if (Platform.OS === 'web' && (window as any).electronAPI?.showTrophyNotification) {
                        try {
                          await (window as any).electronAPI.showTrophyNotification(ach, gameInfo);
                        } catch (err) {
                          console.warn('[Trophy] Error mostrando notificación desktop:', err);
                        }
                      }
                      soundService.playNotification?.();
                      const achTitle = ach.name || 'Logro desbloqueado';
                      const gameTitle = trackedItem.title ? ` • ${trackedItem.title}` : '';
                      const desc = ach.description ? `\n${ach.description}` : '';
                      toastService.show(`🏆 ${achTitle}${gameTitle}${desc}`, {
                        duration: 6000,
                        source: 'trophies',
                        icon: ach.icon ? { uri: ach.icon } : undefined,
                        coverImage: ach.icon
                          ? { uri: ach.icon }
                          : (trackedItem.image ? (typeof trackedItem.image === 'string' ? { uri: trackedItem.image } : trackedItem.image) : undefined),
                        saveToHistory: true,
                      });
                    }
                  }
                }
                // Sincronizar trofeos locales a la cuenta online para refrescar widgets y perfil
                if (steamId) {
                  const allGames = [...(games || []), ...(steamGames || [])];
                  syncLocalTrophiesToOnline(allGames as any, { apiKey, steamId }).catch(() => { });
                }
              }
            };

            if (appId && steamId) {
              fetchSteamGameAchievements(apiKey, steamId, appId, true /* forceRefresh */)
                .then(handleNewAchievements)
                .catch(() => { });
            } else if (appId) {
              fetchAwGameAchievements(appId, 'local', 'english', apiKey)
                .then(handleNewAchievements)
                .catch(() => { });
            } else if (trackedItem.path && trackedItem.path.endsWith('.exe')) {
              fetchPcGameAchievements(trackedItem.path, apiKey)
                .then(handleNewAchievements)
                .catch(() => { });
            }
          } else {
            console.warn('[Playtime] No se encontró el item para actualizar tiempo jugado:', id);
          }

          delete launchStartTimeRef.current[id];
        }

        soundService.playBackground();
        setIsLaunching(false);
        setLaunchingItem(null);
        // Higiene al volver: ningún modal ni flag debe atrapar el teclado.
        setDetailVisible(false);
        libraryGridRef.current?.closeDetail();
        setIsLibraryDetailVisible(false);
        loadApps();
      });
      return () => {
        (window as any).electronAPI?.removeGameClosedListener?.();
      };
    }
  }, [games, steamGames, lastPlayedGame]);

  const handleAppPress = (index: number, item: ConsoleItem) => {
    setFocusArea('main_carousel');
    setActiveIndex(index);
    setFocusIndex(index);
    if (activeIndex === index) {
      if (item.id === 'more_library' || item.id === '1' || item.id === '5') return;
      if (item.isFolder || item.isGrid) { setFavoritesVisible(true); return; }
      if (item.isLastPlayed) {
        if (lastPlayedGame && lastPlayedGame.id !== '1' && lastPlayedGame.id !== '5') {
          handleLaunchApp(lastPlayedGame);
        } else {
          toastService.show('toast.noGameLaunched');
        }
        return;
      }
      if (!item.isGrid) { handleLaunchApp(item); }
    }
  };

  const handleApplyHomeBg = (uri: string) => {
    setVisualTheme('none');
    setHomeBackground({ uri });
    localStorage.setItem('home_background', uri);
    if (slideshowAlbumName) {
      setSlideshowAlbumName(null);
      setSlideshowImages([]);
      setCurrentSlideIndex(0);
      localStorage.removeItem('slideshow_album');
      localStorage.setItem('slideshow_duration', slideshowDuration);
      localStorage.setItem('slideshow_transition', slideshowTransition);
    }
  };

  const handleSelectWallpaperFolder = async () => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.selectCaptureFolder) {
      const folderPath = await (window as any).electronAPI.selectCaptureFolder();
      if (folderPath) {
        updateUser({ settings: { ...activeUser?.settings, wallpaperPath: folderPath } as any });
      }
    }
  };

  const handleSelectRpcs3Folder = async () => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.selectCaptureFolder) {
      const folderPath = await (window as any).electronAPI.selectCaptureFolder();
      if (folderPath) {
        updateUser({ settings: { ...activeUser?.settings, rpcs3Path: folderPath } as any });
      }
    }
  };

  const handleSelectCaptureFolder = async () => {
    if (Platform.OS === 'web' && (window as any).electronAPI && typeof (window as any).electronAPI.selectCaptureFolder === 'function') {
      const folderPath = await (window as any).electronAPI.selectCaptureFolder();
      if (folderPath) {
        updateUser({ settings: { ...activeUser?.settings, capturePath: folderPath } as any });
      }
    }
  };

  const handleSelectAvatarFolder = async () => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.selectCaptureFolder) {
      const folderPath = await (window as any).electronAPI.selectCaptureFolder();
      if (folderPath) {
        updateUser({ settings: { ...activeUser?.settings, avatarPath: folderPath } as any });
      }
    }
  };

  const handleApplyAvatar = (uri: string) => {
    updateUser({
      avatar: uri,
      avatarBase64: uri,
      settings: { ...activeUser?.settings, useSteamAvatar: false } as any,
    });
  };

  const fetchSteamAvatar = async (apiKey: string, steamId: string) => {
    try {
      const res = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.response?.players?.length > 0) {
          const avatarUrl = data.response.players[0].avatarfull;
          updateUser({ steamAvatarUrl: avatarUrl });
          return avatarUrl;
        }
      }
    } catch (err) {
      console.error('Error fetching Steam avatar:', err);
    }
    return null;
  };

  const handleToggleSteamAvatar = async () => {
    const isCurrentlyUsingSteam = !!activeUser?.settings?.useSteamAvatar;
    const newSettings = { ...activeUser?.settings, useSteamAvatar: !isCurrentlyUsingSteam };
    updateUser({ settings: newSettings as any });

    let avatarUrl = activeUser?.steamAvatarUrl;
    const GLOBAL_STEAM_API_KEY = process.env.EXPO_PUBLIC_STEAM_API_KEY || 'TU_API_KEY_AQUI';
    if (!isCurrentlyUsingSteam && activeUser?.settings?.steamId) {
      avatarUrl = (await fetchSteamAvatar(GLOBAL_STEAM_API_KEY, activeUser.settings.steamId)) || avatarUrl;
    }
    // Si se activó, intentar subirla a la cuenta online (URL http visible).
    if (!isCurrentlyUsingSteam) {
      syncProfileMediaToOnline({ ...activeUser, steamAvatarUrl: avatarUrl, settings: newSettings } as any).catch(() => { });
    }
  };

  const handleTogglePin = async () => {
    const item = currentData[activeIndex];
    if (!item) return;
    const newPinned = !item.isPinned;

    // El ítem enfocado puede venir de `games` (manuales) o de `steamGames`/`epicGames`/`xboxGames`
    if (isSteamTrackedGame(item)) {
      setSteamGames(prev => prev.map(g => g.id === item.id ? { ...g, isPinned: newPinned } : g));
    } else if (item.id?.toString().startsWith('epic_')) {
      setEpicGames(prev => prev.map(g => g.id === item.id ? { ...g, isPinned: newPinned } : g));
    } else if (item.id?.toString().startsWith('xbox_')) {
      setXboxGames(prev => prev.map(g => g.id === item.id ? { ...g, isPinned: newPinned } : g));
    } else {
      setGames(prev => prev.map(g => g.id === item.id ? { ...g, isPinned: newPinned } : g));
    }

    if (Platform.OS === 'web' && (window as any).electronAPI?.updateApp) {
      await (window as any).electronAPI.updateApp({ id: item.id, isPinned: newPinned });
    }
    soundService.playNavigation();
  };

  const handleToggleFavorite = async () => {
    const item = currentData[activeIndex];
    if (!item) return;
    const newFav = !item.isFavorite;

    const isSteamOrEpicId = item.id?.toString().startsWith('steam_') || item.id?.toString().startsWith('epic_') || item.id?.toString().startsWith('xbox_');

    if (isSteamTrackedGame(item)) {
      // Steam: la fuente de verdad es `steamGames` + su caché en localStorage.
      // Hay que persistirla, o el favorito se pierde al recargar/cambiar de usuario.
      setSteamGames(prev => {
        const updated = prev.map(g => g.id === item.id ? { ...g, isFavorite: newFav } : g);
        steamGamesRef.current = updated;
        const steamId = activeUser?.settings?.steamId;
        if (steamId) {
          try { localStorage.setItem(`steam_games_${steamId}`, JSON.stringify(updated)); } catch (e) { /* noop */ }
        }
        return updated;
      });
      // Si el usuario editó este juego, existe un registro en `games` que pisa
      // a `steamGames` en `displayedLibraryGames`: mantenerlo sincronizado.
      setGames(prev => prev.map(g => g.id === item.id ? { ...g, isFavorite: newFav } : g));
    } else if (item.id?.toString().startsWith('epic_')) {
      setEpicGames(prev => {
        const updated = prev.map(g => g.id === item.id ? { ...g, isFavorite: newFav } : g);
        epicGamesRef.current = updated;
        return updated;
      });
      setGames(prev => prev.map(g => g.id === item.id ? { ...g, isFavorite: newFav } : g));
    } else if (item.id?.toString().startsWith('xbox_')) {
      setXboxGames(prev => {
        const updated = prev.map(g => g.id === item.id ? { ...g, isFavorite: newFav } : g);
        xboxGamesRef.current = updated;
        return updated;
      });
      setGames(prev => prev.map(g => g.id === item.id ? { ...g, isFavorite: newFav } : g));
    } else {
      setGames(prev => prev.map(g => g.id === item.id ? { ...g, isFavorite: newFav } : g));
    }

    // Para Steam/Epic NO escribimos en games.json (evita registros "fantasma"
    // sin título/portada, igual que en markGameAsLastPlayed).
    if (!isSteamOrEpicId && Platform.OS === 'web' && (window as any).electronAPI?.updateApp) {
      await (window as any).electronAPI.updateApp({ id: item.id, isFavorite: newFav });
    }
    soundService.playNavigation();
  };

  // Actualizar refs de callbacks para useFocusNavigation (rompe la dependencia circular)
  _handleLaunchAppRef.current = handleLaunchApp;
  _openContextMenuRef.current = openContextMenu;
  _handleContextMenuActionRef.current = handleContextMenuAction;
  _handleProfileMenuActionRef.current = handleProfileMenuAction;
  _handleSystemNavActionRef.current = handleSystemNavAction;
  _handleToggleFavoriteRef.current = handleToggleFavorite;
  _handleTogglePinRef.current = handleTogglePin;

  // Background del StoreFrontPanel: se computa sincrónicamente para evitar parpadeos
  const storeFocusedBackground = useMemo(() => {
    if (currentData[activeIndex]?.id !== '5') return null;
    let focused: StoreOffer | undefined;
    if (gamePanelFocusIndex < 10) {
      focused = storeDeals[gamePanelFocusIndex];
    } else if (gamePanelFocusIndex >= 10 && gamePanelFocusIndex < 20) {
      focused = storeUpcoming[gamePanelFocusIndex - 10];
    }
    const focusedSteamAppId = extractSteamAppId(focused);
    return (
      focused?.backgroundImage ||
      (focusedSteamAppId
        ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${focusedSteamAppId}/library_hero.jpg`
        : null) ||
      storeOffers[0]?.backgroundImage ||
      null
    );
  }, [gamePanelFocusIndex, currentData, activeIndex, storeOffers]);

  const isWelcomeCard = currentRenderedTab === 'Games' && currentData[activeIndex]?.id === '1';
  const isThemeActiveForCurrentCard = visualTheme && (!visualThemeOnlyHome || isWelcomeCard);

  const currentBg = (isThemeActiveForCurrentCard && currentRenderedTab === 'Games' && currentData[activeIndex]?.id !== '5')
    ? visualTheme.background
    : ((currentRenderedTab === 'Games' && activeIndex === 1)
      ? (homeBackground || require('@/assets/images/FondoDefault2.jpg'))
      : (currentData[activeIndex]?.id === '5' && storeFocusedBackground
        ? storeFocusedBackground
        : (currentData[activeIndex]?.isLastPlayed ? lastPlayedGame?.backgroundImage : (currentData[activeIndex]?.backgroundImage || require('@/assets/images/FondoDefault2.jpg')))));
  const currentBackgroundVideo =
    isThemeActiveForCurrentCard
      ? null
      : (currentRenderedTab === 'Games' && activeIndex === 0
        ? currentData[activeIndex]?.backgroundVideo
        : null);

  const prevActiveIndexRef = useRef(activeIndex);
  const wipePrevIndexRef = useRef(activeIndex);
  const wipeDirection = useSharedValue<1 | -1>(1);
  // 0 = capa A activa/entrante, 1 = capa B activa/entrante
  const activeLayerShared = useSharedValue<0 | 1>(0);

  // Ref que se actualiza en CADA render: nunca queda obsoleto en closures
  const invertTransitionRef = useRef(false);
  invertTransitionRef.current = activeUser?.settings?.invertTransitionDirection === true;

  const slideshowActive = !isThemeActiveForCurrentCard && slideshowImages.length > 0 && (isWelcomeCard || isPresentationMode);

  // Track previous active index for spinning border transition
  React.useEffect(() => {
    if (activeIndex !== prevActiveIndexRef.current) {
      // Calcular la dirección del wipe ANTES de actualizar la ref.
      // Se lee invertTransitionRef.current (siempre fresco) en lugar de la
      // closure de activeUser para evitar el problema de stale closure.
      const normalDirection = activeIndex > wipePrevIndexRef.current ? 1 : -1;
      const invert = invertTransitionRef.current;
      wipeDirection.value = (invert ? -1 * normalDirection : normalDirection) as (1 | -1);
      wipePrevIndexRef.current = activeIndex;

      prevActiveIndexRef.current = activeIndex;
    }
  }, [activeIndex]);

  // "Sobre los widgets" desactivado: en la tarjeta de bienvenida el personaje se recorta a la zona del carrusel.
  const clipForegroundToCarousel = !foregroundOverWidgets && isWelcomeCard;

  // Mide dónde empieza el carrusel en pantalla. Se hace en reposo (sin transform/colapso de por medio).
  useEffect(() => {
    if (!clipForegroundToCarousel || !visualTheme?.foreground) return;
    if (focusArea === 'game_panel' || focusArea === 'welcome_widgets' || focusArea === 'welcome_toolbar') return;
    const timer = setTimeout(() => {
      const node = carouselSectionRef.current;
      if (!node) return;
      const apply = (top: number) => {
        if (Number.isFinite(top)) setCarouselClipBottom(Math.round(top + CARD_SIZE + 80));
      };
      if (Platform.OS === 'web' && typeof node.getBoundingClientRect === 'function') {
        apply(node.getBoundingClientRect().top);
      } else if (typeof node.measureInWindow === 'function') {
        node.measureInWindow((_x: number, y: number) => apply(y));
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [clipForegroundToCarousel, visualTheme?.foreground, focusArea, activeIndex, windowWidth, windowHeight, CARD_SIZE]);

  const showThemeForeground =
    !!visualTheme?.foreground &&
    (!visualThemeOnlyHome || isWelcomeCard) &&
    currentRenderedTab === 'Games' &&
    currentData[activeIndex]?.id !== '5' &&
    !isSettingsVisible &&
    !isLibraryFocused &&
    !isPresentationMode &&
    !isLaunching &&
    !isSearchVisible &&
    !isDetailVisible &&
    !slideshowActive &&
    // Al bajar a las secciones inferiores del GameInfoPanel (trofeos, capturas, noticias) el personaje se oculta.
    focusArea !== 'game_panel' &&
    focusArea !== 'welcome_widgets' &&
    focusArea !== 'welcome_toolbar';

  // La dirección del wipe se calcula en el useEffect de prevActiveIndexRef (arriba)
  // para evitar la condición de carrera con prevActiveIndexRef.current.

  // Reemplaza el useEffect actual de background transition:
  // Mantiene referencias para que el navegador no descarte lo ya decodificado (LRU map cache)
  const decodedCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const bgRequestRef = useRef(0);

  const getBgUri = (bg: any): string | null => {
    if (!bg) return null;
    if (typeof bg === 'string') return bg;
    if (typeof bg === 'number') {
      try {
        return Asset.fromModule(bg).uri;
      } catch {
        return null;
      }
    }
    if (typeof bg === 'object' && bg.uri) return String(bg.uri);
    return null;
  };

  const preloadDecoded = (uri: string, timeoutMs = 600) =>
    new Promise<void>((resolve) => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return resolve();
      if (decodedCacheRef.current.has(uri)) {
        return resolve();
      }
      const img = new window.Image();
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          decodedCacheRef.current.set(uri, img);
          if (decodedCacheRef.current.size > 20) {
            const firstKey = decodedCacheRef.current.keys().next().value;
            if (firstKey) decodedCacheRef.current.delete(firstKey);
          }
          resolve();
        }
      };
      img.src = uri;
      (img.decode ? img.decode() : Promise.resolve()).then(finish, finish);
      setTimeout(finish, timeoutMs); // red de seguridad
    });

  // Ref actualizado en cada render: permite leer bgState en el efecto
  // sin añadirlo como dependencia (evita el loop setBgState → re-runs).
  const bgStateRef = useRef(bgState);
  bgStateRef.current = bgState;

  useEffect(() => {
    const { bgA, bgB, activeLayer } = bgStateRef.current;
    if (!bgA && !bgB) {
      setBgState(s => ({ ...s, bgA: currentBg }));
      return;
    }

    const requestId = ++bgRequestRef.current;
    let cancelled = false;

    const startCrossfade = () => {
      if (cancelled || requestId !== bgRequestRef.current) return;
      cancelAnimation(fade);
      // Re-leer del ref: el estado puede haber cambiado en los 140ms de debounce
      const { bgA: a, bgB: b, activeLayer: layer } = bgStateRef.current;
      if (layer === 'A') {
        fade.value = 0;
        if (currentBg !== a) {
          activeLayerShared.value = 1; // B pasa a ser la capa entrante
          setBgState({ bgA: a, bgB: currentBg, activeLayer: 'B' });
          fade.value = withTiming(1, { duration: 450, easing: Easing.inOut(Easing.quad) });
        }
      } else {
        fade.value = 1;
        if (currentBg !== b) {
          activeLayerShared.value = 0; // A pasa a ser la capa entrante
          setBgState({ bgA: currentBg, bgB: b, activeLayer: 'A' });
          fade.value = withTiming(0, { duration: 450, easing: Easing.inOut(Easing.quad) });
        }
      }
    };

    // Debounce: al pasar rápido por varias tarjetas, solo se transiciona al fondo final
    const timer = setTimeout(async () => {
      const uri = getBgUri(currentBg);
      if (uri) await preloadDecoded(uri);
      startCrossfade();
    }, 140);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentBg]);

  useEffect(() => { if (currentBg && !bgStateRef.current.bgA && !bgStateRef.current.bgB) setBgState(s => ({ ...s, bgA: currentBg })); }, []);

  // Normaliza los sources del fondo: los strings remotos (héroes de Steam)
  // pasan a { uri } con identidad estable para que expo-image no los
  // re-resuelva en cada render, y ambas capas usan caché persistente sin
  // fundido propio (el crossfade lo hace el Animated.View padre).
  const { bgA, bgB } = bgState;
  const bgASource = useMemo(() => (typeof bgA === 'string' ? { uri: bgA } : bgA), [bgA]);
  const bgBSource = useMemo(() => (typeof bgB === 'string' ? { uri: bgB } : bgB), [bgB]);
  const bgAKey = typeof bgA === 'string' ? bgA : (bgA?.uri ? String(bgA.uri) : undefined);
  const bgBKey = typeof bgB === 'string' ? bgB : (bgB?.uri ? String(bgB.uri) : undefined);

  const animatedStyleA = useAnimatedStyle(() => {
    const progress = 1 - fade.value;
    const dir = wipeDirection.value;
    const isIncoming = activeLayerShared.value === 0; // A es la capa entrante
    return {
      zIndex: isIncoming ? 1 : 0,
      opacity: progress,
      transform: [
        { scale: interpolate(progress, [0, 1], [1.025, 1]) },
        // Entrante: viene de +dir*20 → 0 | Saliente: va de 0 → -dir*20
        { translateX: isIncoming
            ? interpolate(progress, [0, 1], [dir * 20, 0])
            : interpolate(progress, [0, 1], [-dir * 20, 0]) },
      ],
    };
  });

  const animatedStyleB = useAnimatedStyle(() => {
    const progress = fade.value;
    const dir = wipeDirection.value;
    const isIncoming = activeLayerShared.value === 1; // B es la capa entrante
    return {
      zIndex: isIncoming ? 1 : 0,
      opacity: progress,
      transform: [
        { scale: interpolate(progress, [0, 1], [1.025, 1]) },
        // Entrante: viene de +dir*20 → 0 | Saliente: va de 0 → -dir*20
        { translateX: isIncoming
            ? interpolate(progress, [0, 1], [dir * 20, 0])
            : interpolate(progress, [0, 1], [-dir * 20, 0]) },
      ],
    };
  });

  // Get the active item info for the bottom panel
  const activeItem = currentData[activeIndex];
  const activeItemForDownload = activeItem?.isLastPlayed ? lastPlayedGame : activeItem;
  const activeItemAppId = activeItemForDownload ? getSteamAppId(activeItemForDownload as any) : null;
  const activeDownload = activeItemAppId ? downloadsByAppId.get(activeItemAppId) ?? null : null;
  const displayTitle = activeItem?.isLastPlayed ? (lastPlayedGame ? lastPlayedGame.title : 'Último Jugado') : activeItem?.title;
  const displayLogo = activeItem?.isLastPlayed ? lastPlayedGame?.logo : activeItem?.logo;
  const displayDesc = activeItem?.isLastPlayed ? (lastPlayedGame?.description || '') : (activeItem?.description || '');
  const canPlay = activeItem && !activeItem.isFolder && !activeItem.isGrid && activeItem.id !== '1' && activeItem.id !== 'more_library';
  const isSpotify =
    activeItem?.title?.toLowerCase()?.includes('spotify');

  const buttonLabel = getGameActionLabel(activeItem, installedSteamAppIds);

  const collapseAnim = useDerivedValue(() => {
    return Math.max(gamePanelFocusAnim.value, welcomeWidgetsFocusAnim.value);
  });

  const activeCardReady = useSharedValue(false);

  useEffect(() => {
    activeCardReady.value = false;
  }, [activeIndex, carouselKey]);

  const startX = useSharedValue(140);
  const startY = useSharedValue(187);
  const startW = useSharedValue(180);
  const startH = useSharedValue(180);
  const cardMounted = useSharedValue(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      cardMounted.value = true;
    }, 100);

    return () => clearTimeout(timer);
  }, [activeIndex, currentRenderedTab]);

  useDerivedValue(() => {
    if (collapseAnim.value !== 0 || !activeCardReady.value) {
      return;
    }

    const measurement = measure(activeCardRef);

    if (
      measurement &&
      measurement.width > 0 &&
      measurement.height > 0
    ) {
      startX.value = measurement.pageX;
      startY.value = measurement.pageY;
      startW.value = measurement.width;
      startH.value = measurement.height;
    }
  });

  const getTransitionImageSource = () => {
    if (focusArea === 'library_grid') {
      return require('@/assets/images/Libreria.jpeg');
    }
    if (focusArea === 'welcome_widgets') {
      return currentData[activeIndex]?.image;
    }
    if (!activeItem) return null;
    if (activeItem.id === 'more_library') {
      return require('@/assets/images/Libreria.jpeg');
    }
    if (activeItem.isLastPlayed) {
      return lastPlayedGame?.image ?? activeItem.image;
    }
    return activeItem.image;
  };

  const floatingImageStyle = useAnimatedStyle(() => {
    const c = collapseAnim.value;

    const width = interpolate(c, [0, 1], [startW.value, 60]);
    const height = interpolate(c, [0, 1], [startH.value, 60]);
    const left = interpolate(c, [0, 1], [startX.value, 50]);
    const top = interpolate(c, [0, 1], [startY.value, 40]);
    const borderRadius = interpolate(c, [0, 1], [30, 8]);

    const opacity = c;

    return {
      position: 'absolute',
      left,
      top,
      width,
      height,
      borderRadius,
      opacity,
      zIndex: 9999,
      pointerEvents: 'none',
      overflow: 'hidden',
    };
  });



  return (
    <SafeAreaView style={styles.container}>
      {/* === BACKGROUND: Dual Layer Crossfade === */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            zIndex: 0,
            elevation: 0,
          },
        ]}
      >

        {/* VIDEO DE FONDO */}
        {currentBackgroundVideo ? (
          <BackgroundVideo
            source={currentBackgroundVideo}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            shouldPlay
            isLooping
            muted
          />
        ) : showTrailer && currentData[activeIndex]?.youtubeId ? (

          <View style={{ width: windowWidth, height: windowHeight, overflow: 'hidden' }}>
            <YoutubePlayer
              height={windowHeight}
              width={windowWidth}
              play={true}
              videoId={currentData[activeIndex].youtubeId!}
              mute={true}
            />
          </View>

        ) : (
          <>
            <Animated.View style={[StyleSheet.absoluteFill, animatedStyleA, { willChange: 'transform, opacity', backfaceVisibility: 'hidden' } as any]}>
              {/* <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }]} /> */}
              {bgA && (
                <Image
                  source={bgASource}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                  recyclingKey={bgAKey}
                />
              )}
            </Animated.View>

            <Animated.View style={[StyleSheet.absoluteFill, animatedStyleB, { willChange: 'transform, opacity', backfaceVisibility: 'hidden' } as any]}>
              {/* <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }]} /> */}
              {bgB && (
                <Image
                  source={bgBSource}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                  recyclingKey={bgBKey}
                />
              )}
            </Animated.View>
          </>
        )}
      </View>

      {/* === SLIDESHOW: POR ENCIMA DEL BACKGROUND ORIGINAL === */}
      {slideshowActive && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              zIndex: 0,
              elevation: 0,
            },
          ]}
        >
          <SlideshowOverlay
            images={slideshowImages}
            currentIndex={currentSlideIndex}
            transition={slideshowTransition}
            windowWidth={windowWidth}
            windowHeight={windowHeight}
          />
        </View>
      )}

      {/* === GRADIENT OVERLAY (PS5 style: dark on left, transparent on right) === */}
      <View style={[styles.gradientOverlay, isThemeActiveForCurrentCard && { opacity: 0.28 }]} pointerEvents="none" />
      <View style={[styles.gradientOverlayTop, isThemeActiveForCurrentCard && { opacity: 0.45 }]} pointerEvents="none" />

      {/* === BOTTOM-TO-TOP GRADIENT — visible when welcome_widgets is focused === */}
      {Platform.OS === 'web' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0, 0, 0, 1) 10%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.15) 100%)',
            opacity: (focusArea === 'welcome_widgets' || focusArea === 'welcome_toolbar') ? 1 : 0,
            transition: 'opacity 350ms cubic-bezier(0.22, 1, 0.36, 1)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}

      {/* DARK OVERLAY — se oscurece al enfocar cards, capturas y noticias */}
      {Platform.OS === 'web' && (
        <Animated.View style={[{
          position: 'absolute', inset: 0, zIndex: 1,
          backgroundColor: '#000',
          pointerEvents: 'none',
        } as any, darkOverlayStyle]} />
      )}

      {/* === CONTEXT MENU BACKGROUND DIM === */}
      {Platform.OS === 'web' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            opacity: isContextMenuOpen ? 1 : 0,
            transition: 'opacity 280ms cubic-bezier(0.22, 1, 0.36, 1)',
            pointerEvents: isContextMenuOpen ? 'auto' : 'none',
            zIndex: 9990,
          }}
          onClick={() => setIsContextMenuOpen(false)}
        />
      )}

      {/* Absolutely positioned context menu rendered at root level */}
      {isContextMenuOpen && (
        <View
          style={{
            position: 'absolute',
            left: contextMenuCoords.left,
            top: contextMenuCoords.top,
            zIndex: 9999,
          }}
        >
          <GameContextMenu
            focusedIndex={contextMenuFocusIndex}
            onPressItem={handleContextMenuAction}
            isPinned={!!currentData[activeIndex]?.isPinned}
            onTogglePin={handleTogglePin}
            isFavorite={!!currentData[activeIndex]?.isFavorite}
            onToggleFavorite={handleToggleFavorite}
          />
        </View>
      )}

      {/* MINI HEADER FOR GAME PANEL FOCUS */}
      <Animated.View style={[styles.miniHeader, topBarMiniStyle]} pointerEvents="none">
        {focusArea === 'library_grid' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={require('@/assets/images/Libreria.jpeg')} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 12, opacity: 0 }} />
            <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '200', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>{t('library.title')}</Text>
          </View>
        ) : (focusArea === 'welcome_widgets' || focusArea === 'welcome_toolbar') ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={currentData[activeIndex]?.image} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 12, opacity: 0 }} contentFit="cover" />
            <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '200', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>{t('home.welcome')}</Text>
          </View>
        ) : (canPlay && activeItem && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={activeItem.isLastPlayed ? (lastPlayedGame?.image ?? activeItem.image) : activeItem.image} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 12, opacity: 0 }} />
            <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '200', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>{displayTitle}</Text>
          </View>
        ))}
      </Animated.View>

      {/* MINI TOOLBAR — visible when welcome widgets are focused (PS5 style) */}
      <Animated.View style={[styles.miniHeaderToolbar, topBarMiniStyle, presentationToolbarStyle]}>
        {focusArea === 'welcome_widgets' || focusArea === 'welcome_toolbar' ? (
          <View style={styles.miniToolbarRow}>
            {[
              { id: 'edit', icon: 'create-outline' as const, type: 'ion' as const },
              { id: 'grid', icon: require('@/assets/images/gamesGrid2.png'), type: 'img' as const },
              { id: 'background', icon: require('@/assets/images/cambioFondo.png'), type: 'img' as const },
              { id: 'settings', icon: require('@/assets/images/settings.png'), type: 'img' as const },
            ].map((item, idx) => (
              <RadarFocusWrapper
                key={item.id}
                id={`wtoolbar-${item.id}`}
                isFocused={focusArea === 'welcome_toolbar' && toolbarFocusIndex === idx}
                size={50}
                innerSize={40}
                borderRadius="50%"
              >
                <TouchableOpacity
                  style={[
                    styles.headerIconBtn,
                    focusArea === 'welcome_toolbar' && toolbarFocusIndex === idx && styles.headerIconBtnFocused,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setFocusArea('welcome_toolbar');
                    setToolbarFocusIndex(idx);
                    if (idx === 0) {
                      setIsWidgetEditOpen(prev => !prev);
                      setWidgetEditFocusIndex(0);
                    } else if (idx === 2) setHomeBgModalVisible(true);
                    else if (idx === 3) setWelcomeSettingsVisible(true);
                  }}
                >
                  {item.type === 'ion' ? (
                    <Ionicons
                      name={item.icon}
                      size={30}
                      color={focusArea === 'welcome_toolbar' && toolbarFocusIndex === idx ? '#000' : '#FFF'}
                    />
                  ) : (
                    <Image
                      source={item.icon}
                      style={{ width: 30, height: 30, resizeMode: 'contain' }}
                      tintColor={focusArea === 'welcome_toolbar' && toolbarFocusIndex === idx ? '#000' : '#FFF'}
                    />
                  )}
                </TouchableOpacity>
              </RadarFocusWrapper>
            ))}
          </View>
        ) : null}
      </Animated.View>

      {/* === HEADER (PS5 style) — fixed on top === */}
      <Animated.View style={[styles.header, headerStyle, presentationHeaderStyle]}>
        {/* Left: Navigation Tabs */}
        <View style={styles.headerLeft}>
          {/* <ControlPrompt btn="L" label="" inputMode={inputMode} /> */}
          {TABS.map((tab, idx) => (
            <View key={tab.id} style={styles.tabTouchable}>
              {focusArea === 'header_tabs' && focusIndex === idx && <SpinningBorderTabs size={100} />}
              <TouchableOpacity
                id={`tab-${tab.id.toLowerCase()}`}
                onPress={(e) => {
                  (e.currentTarget as any)?.blur?.();
                  setActiveTab(tab.id);
                  setActiveIndex(0);
                  setFocusArea('main_carousel');
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.navItem,
                  activeTab === tab.id && styles.navItemActive,
                  (focusArea === 'header_tabs' && focusIndex === idx) && styles.tabFocused
                ]}>
                  {t(tab.labelKey)}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
          {/* <ControlPrompt btn="R" label="" inputMode={inputMode} /> */}
        </View>

        {/* Right: Icons + Avatar + Clock */}
        <View style={styles.headerRight}>

          {/* Search Icon — RadarFocusWrapper */}
          <RadarFocusWrapper id="hdr-search" isFocused={focusArea === 'header_avatar' && focusIndex === 0} size={50} innerSize={40} borderRadius="50%">
            <TouchableOpacity
              style={[styles.headerIconBtn, focusArea === 'header_avatar' && focusIndex === 0 && styles.headerIconBtnFocused]}
              activeOpacity={0.7}
              onPress={() => { setFocusArea('header_avatar'); setFocusIndex(0); setSearchVisible(true); }}
            >
              {/* <Ionicons name="search" size={22} color="rgba(255,255,255,0.85)" /> */}
              <Image
                source={require('@/assets/images/PS5_SearchIcon.png')}
                style={{
                  width: 24,
                  height: 24,
                  resizeMode: 'contain',
                }}
                tintColor={
                  focusArea === 'header_avatar' && focusIndex === 0
                    ? '#000'
                    : '#FFF'
                }
              />
            </TouchableOpacity>
          </RadarFocusWrapper>

          {/* Settings Icon — RadarFocusWrapper */}
          <RadarFocusWrapper id="hdr-settings" isFocused={focusArea === 'header_avatar' && focusIndex === 1} size={50} innerSize={40} borderRadius="50%">
            <TouchableOpacity
              style={[styles.headerIconBtn, focusArea === 'header_avatar' && focusIndex === 1 && styles.headerIconBtnFocused]}
              activeOpacity={0.7}
              onPress={() => { setUserModalVisible(false); setSettingsVisible(true); }}
            >
              {/* <Ionicons name="settings-sharp" size={30} color="#fff" /> */}
              <Image
                source={require('@/assets/images/settings.png')}
                style={{
                  width: 24,
                  height: 24,
                  resizeMode: 'contain',
                }}
                tintColor={
                  focusArea === 'header_avatar' && focusIndex === 1
                    ? '#000'
                    : '#FFF'
                }
              />
            </TouchableOpacity>
          </RadarFocusWrapper>

          {/* Avatar / Profile — RadarFocusWrapper */}
          <View style={{ position: 'relative' }}>
            <RadarFocusWrapper id="hdr-avatar" isFocused={focusArea === 'header_avatar' && focusIndex === 2} size={52} innerSize={36} borderRadius="50%">
              <TouchableOpacity
                id="avatar-btn"
                onPress={() => {
                  setIsProfileMenuOpen(true);
                  setProfileMenuFocusIndex(0);
                  soundService.playNavigation();
                }}
                style={[
                  styles.avatarContainer,
                  activeUser ? { borderColor: activeUser.color } : {},
                ]}
                activeOpacity={0.75}
              >
                {activeUser?.avatar ? (
                  <Image
                    source={{ uri: (activeUser?.settings?.useSteamAvatar && activeUser?.steamAvatarUrl) ? activeUser.steamAvatarUrl : ((activeUser as any).avatarBase64 || activeUser.avatar) }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.defaultAvatarHeader}>
                    {/* <Ionicons name="person" size={18} color="#FFF" /> */}
                    <Image
                      source={require('@/assets/images/ProfilePicture.png')}
                      style={{
                        width: 35,
                        height: 35,
                        resizeMode: 'contain',
                      }}
                    />
                  </View>
                )}
              </TouchableOpacity>
            </RadarFocusWrapper>
            {/* Status dot — posicionado sobre la esquina inferior-derecha del avatar (36px), dentro del wrapper de 52px, offset = (52-36)/2 = 8px */}
            <View style={[
              styles.activeStatusDot,
              { backgroundColor: isOnline ? '#4CD964' : '#8E8E93', bottom: 7, right: 7 }
            ]} />
          </View>

          <ClockText style={styles.timeText2} />
        </View>
      </Animated.View>

      {/* Presentation mode clock — shown when UI is hidden */}
      {isPresentationMode && (
        <Animated.View style={styles.presentationClock} entering={FadeIn.duration(600)}>
          <ClockText style={styles.timeText2} />
        </Animated.View>
      )}

      {/* === MAIN SCROLLABLE CONTENT === */}
      <Animated.ScrollView
        ref={mainScrollRef}
        scrollEnabled={!isWelcomeSettingsVisible && !isWidgetEditOpen} // <--- Deshabilita el scroll del fondo cuando la configuración o edición está abierta
        style={[styles.mainContent, animatedTabContentStyle]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={mainScrollContentStyle}
        scrollEventThrottle={16}
      >
        {/* CAROUSEL ROW */}
        <Animated.View ref={carouselSectionRef} style={[styles.carouselSection, carouselStyle, presentationCarouselStyle]}>
          <ConsoleCarousel
            currentData={currentData}
            downloadsByAppId={downloadsByAppId}
            activeIndex={activeIndex}
            carouselKey={carouselKey}
            lastPlayedGame={lastPlayedGame}
            focusArea={focusArea}
            isContextMenuOpen={isContextMenuOpen}
            activeCardRef={activeCardRef}
            activeCardReady={activeCardReady}
            scrollRef={scrollRef}
            handleAppPress={handleAppPress}
            openContextMenu={openContextMenu}
            setIsContextMenuOpen={setIsContextMenuOpen}
            CARD_SIZE={CARD_SIZE}
            ITEM_WIDTH={ITEM_WIDTH}
            LEFT_PADDING={LEFT_PADDING}
            RIGHT_PADDING={RIGHT_PADDING}
            media={media}
            games={games}
            collapseAnim={collapseAnim}

          />
        </Animated.View>

        {/* LIBRARY GRID SECTION */}
        {isLibraryFocused && (
          <LibraryGrid
            ref={libraryGridRef}
            games={displayedLibraryGames}
            activeTab={libraryTab}
            onTabChange={(tab) => { setLibraryTab(tab); setLibraryGridFocusIndex(0); setLibraryTabsFocused(false); setLibraryFilterFocused(false); }}
            isLoading={loadingSteam}
            isFocused={focusArea === 'library_grid'}
            gridActive={focusArea === 'library_grid' && !libraryTabsFocused && !libraryFilterFocused}
            tabsFocused={focusArea === 'library_grid' && libraryTabsFocused}
            filterButtonFocused={focusArea === 'library_grid' && libraryFilterFocused}
            onFilterPanelVisibilityChange={setIsLibraryFilterPanelOpen}
            focusedIndex={libraryGridFocusIndex}
            onItemPress={(index, game) => {
              if (game.id === 'media_gallery') {
                setMediaGalleryVisible(true);
                return;
              }
              setSelectedItem(game);
              setDetailVisible(true);
            }}
            onDetailVisibilityChange={(visible) => setIsLibraryDetailVisible(visible)}
            installedSteamAppIds={installedSteamAppIds}
            onVisibleGamesChange={setVisibleLibraryGames}
            onRefresh={(updatedGame) => {
              if (updatedGame) mergeGameIntoState(updatedGame);
              else loadApps();
            }}
            onLaunch={(id, path) => {
              const game = displayedLibraryGames.find(g => g.id === id) || (selectedItem?.id === id ? selectedItem : null);
              if (game) handleLaunchApp(game);
              else handleLaunchApp({ id, path } as any);
            }}
          />
        )}

        {/* GAME INFO PANEL (bottom-left, PS5 style) */}
        {!isLibraryFocused && uiReady && (
          activeItem?.id === '1' ? (
            <Animated.View style={[styles.welcomePanel, welcomePanelLayout]} entering={FadeInDown.duration(500).delay(150)}>
              <Animated.View style={[gameInfoPanelStyle, presentationWidgetsStyle]}>
                <Animated.View style={widgetContainerStyle}>
                  <WelcomeWidgets
                    ref={welcomeWidgetsRef}
                    focusArea={focusArea}
                    focusIndex={focusIndex}
                    setFocusArea={setFocusArea}
                    setFocusIndex={setFocusIndex}
                    setHomeBgModalVisible={setHomeBgModalVisible}
                    setAddModalVisible={setAddModalVisible}
                    setRandomSelectorVisible={setRandomSelectorVisible}
                    gamepadInfo={gamepadInfo}
                    storageInfo={storageInfo}
                    lastPlayedGame={lastPlayedGame}
                    activeUser={activeUser}
                    handleLaunchApp={handleLaunchApp}
                    windowWidth={windowWidth}
                    windowHeight={windowHeight}
                    widgetContainerStyle={widgetContainerStyle}
                    widgetContainerStyle2={widgetContainerStyle2}
                    wviewStyle={wviewStyle}
                    widgetVisibility={widgetVisibility}
                    widgetOrder={widgetOrder}
                    widgetSizes={widgetSizes}
                    isMoveMode={isWidgetMoveMode}
                    movingWidgetId={movingWidgetId}
                    editingWidgetId={editingWidgetId}
                  />
                </Animated.View>
              </Animated.View>
            </Animated.View>
          ) : activeItem?.id === '5' ? (
            <StoreFrontPanel
              windowWidth={windowWidth}
              windowHeight={windowHeight}
              gameInfoPanelStyle={gameInfoPanelStyle}
              focusArea={focusArea}
              gamePanelFocusIndex={gamePanelFocusIndex}
              offers={storeOffers}
              loading={storeLoading}
            />
          ) : (
            <GameInfoPanel
              activeItem={activeItem}
              activeIndex={activeIndex}
              lastPlayedGame={lastPlayedGame}
              focusArea={focusArea}
              gamePanelFocusIndex={gamePanelFocusIndex}
              setGamePanelFocusIndex={setGamePanelFocusIndex}
              setFocusArea={setFocusArea}
              handleLaunchApp={handleLaunchApp}
              setSelectedItem={setSelectedItem}
              setDetailVisible={setDetailVisible}
              onOpenConfig={(target) => {
                setSelectedItem(target);
                setDetailInitialEditMode(true);
                setDetailVisible(true);
              }}
              onOpenTrophies={() => {
                const target = activeItem?.isLastPlayed ? lastPlayedGame : activeItem;
                setTrophiesItem(target ?? null);
                setTrophiesVisible(true);
              }}
              steamMedia={steamMedia}
              mediaLoading={mediaLoading}
              setSelectedMediaIndex={setSelectedMediaIndex}
              steamNews={steamNews}
              newsLoading={newsLoading}
              activeUser={activeUser}
              windowWidth={windowWidth}
              windowHeight={windowHeight}
              gameInfoPanelStyle={gameInfoPanelStyle}
              activeDownload={activeDownload}
              onAchievementCountChange={setAchievementCount}
              spacerStyle={spacerStyle}
              infoCardsStyle={infoCardsStyle}
              topPanelStyle={topPanelStyle}
              installedSteamAppIds={installedSteamAppIds}
            />
          )
        )}
      </Animated.ScrollView>

      <ThemeCharacterOverlay
        theme={visualTheme}
        visible={showThemeForeground}
        clipBottom={clipForegroundToCarousel ? (carouselClipBottom ?? CARD_SIZE + 80 + Math.round(windowHeight * 0.12)) : null}
      />

      {/* WPS5 UI EXPANSION COMPONENTS */}
      <ErrorBoundary
        fallbackTitle="Error en la vista de detalles del juego"
        onReset={() => {
          setDetailVisible(false);
          setDetailInitialEditMode(false);
        }}
      >
        <GameDetailView
          isVisible={isDetailVisible}
          item={selectedItem}
          initialEditMode={detailInitialEditMode}
          gamepadConnected={gamepadInfo.connected}
          onClose={() => {
            setDetailVisible(false);
            setDetailInitialEditMode(false);
          }}
          onRefresh={(updatedGame) => {
            if (updatedGame) mergeGameIntoState(updatedGame);
            else loadApps();
          }}
          inputMode={inputMode}
          isLaunching={isLaunching}
          installedSteamAppIds={installedSteamAppIds}
          onOpenMediaGallery={() => {
            setDetailVisible(false);
            setDetailInitialEditMode(false);
            setMediaGalleryVisible(true);
          }}
          onOpenTrophies={() => {
            // La vista de trofeos se monta por encima del detalle del juego.
            setTrophiesItem(selectedItem);
            setTrophiesVisible(true);
          }}
          onLaunch={(_id, _path) => {
            if (selectedItem) handleLaunchApp(selectedItem);
          }}
        />
      </ErrorBoundary>

      <DeleteConfirmView
        visible={!!deleteConfirmItem}
        item={deleteConfirmItem ? { title: deleteConfirmItem.title, image: deleteConfirmItem.image } : null}
        onCancel={() => setDeleteConfirmItem(null)}
        onConfirm={handleConfirmDeleteGame}
      />

      <FloatingSystemNav
        focusedIndex={modalSelectedIndex}
        isFocused={focusArea === 'header_user'}
        onPressItem={(index) => {
          setModalSelectedIndex(index);
          handleSystemNavAction(index);
        }}
        onClose={() => setFocusArea('main_carousel')}
        navLevel={systemNavLevel}
        cardIndex={systemNavCardIndex}
        isCardExpanded={isSystemNavCardExpanded}
        onPressCard={(index) => {
          setSystemNavCardIndex(index);
          setSystemNavLevel(1);
          setSystemNavCardExpanded(true);
        }}
        onCloseExpanded={() => setSystemNavCardExpanded(false)}
        onRefreshApps={loadApps}
        onCardsCountChange={setSystemNavMaxCardIndex}
        isFriendsOpen={isFriendsCardOpen}
        onFriendsOpenChange={setIsFriendsCardOpen}
        isNotificationsOpen={isNotificationsCardOpen}
        onNotificationsOpenChange={setIsNotificationsCardOpen}
        isMusicOpen={isMusicCardOpen}
        onMusicOpenChange={setIsMusicCardOpen}
        isDownloadsOpen={isDownloadsCardOpen}
        onDownloadsOpenChange={setIsDownloadsCardOpen}
      />

      <FavoritesView
        isVisible={isFavoritesVisible}
        isLaunching={isLaunching}
        inputMode={inputMode}
        favorites={currentData[activeIndex]?.isGrid ? media.filter(m => m.isFavorite) : games.filter(g => g.isFavorite)}
        onClose={() => setFavoritesVisible(false)}
        onLaunch={handleLaunchApp}
      />

      {/* Vista de trofeos: lista de logros juego a juego */}
      <TrophiesView
        visible={isTrophiesVisible}
        onClose={() => setTrophiesVisible(false)}
        activeUser={activeUser}
        inputMode={inputMode}
        gamepadConnected={gamepadInfo.connected}
        initialItem={trophiesItem}
        libraryGames={games}
      />

      <RandomSelectorView
        isVisible={isRandomSelectorVisible}
        games={games}
        inputMode={inputMode}
        onClose={() => setRandomSelectorVisible(false)}
        onLaunch={(item) => {
          setRandomSelectorVisible(false);
          handleLaunchApp(item);
        }}
      />

      {/* ADD APP MODAL */}
      <AddAppModal
        visible={isAddModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAppsAdded={() => loadApps()}
      />

      {/* MEDIA LIGHTBOX MODAL */}
      <Modal
        visible={selectedMediaIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMediaIndex(null)}
      >
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setSelectedMediaIndex(null)}
          />

          <View style={styles.lightboxContent} pointerEvents="box-none">
            {selectedLightboxMedia?.type === 'movie' && selectedLightboxMedia.mp4_url ? (
              <Video
                source={{ uri: selectedLightboxMedia.mp4_url }}
                style={styles.lightboxVideo}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                useNativeControls
              />
            ) : selectedLightboxMedia?.type === 'movie' && (selectedLightboxMedia as any).youtube_id ? (
              // Videos de IGDB: no hay archivo .mp4, solo un video_id de
              // YouTube. Se reproduce con el wrapper YoutubePlayer.
              <YoutubePlayer
                key={(selectedLightboxMedia as any).youtube_id}
                height={lightboxPlayerHeight}
                width={lightboxPlayerWidth}
                videoId={(selectedLightboxMedia as any).youtube_id}
                play
              />
            ) : selectedLightboxMedia?.full ? (
              <HomeLightboxImage
                key={selectedLightboxMedia.id || selectedLightboxMedia.full}
                uri={selectedLightboxMedia.full}
                thumbnail={selectedLightboxMedia.thumbnail}
              />
            ) : null}

            <TouchableOpacity
              style={styles.lightboxCloseBtn}
              onPress={() => setSelectedMediaIndex(null)}
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>

            {selectedLightboxMedia?.type === 'movie' && (
              <View style={styles.lightboxBadge}>
                <Ionicons name="play-circle" size={14} color="#FFF" />
                <Text style={styles.lightboxBadgeText}>Trailer</Text>
              </View>
            )}

            {steamMedia.length > 1 && selectedMediaIndex !== null && (
              <View style={styles.lightboxCounter}>
                <Text style={styles.lightboxCounterText}>
                  {selectedMediaIndex + 1} / {steamMedia.length}
                </Text>
              </View>
            )}
          </View>

          {selectedMediaIndex !== null && selectedMediaIndex > 0 && (
            <TouchableOpacity
              style={[styles.lightboxArrow, styles.lightboxArrowLeft]}
              onPress={() => setSelectedMediaIndex(prev => prev !== null ? prev - 1 : prev)}
            >
              <Ionicons name="chevron-back" size={28} color="#FFF" />
            </TouchableOpacity>
          )}

          {selectedMediaIndex !== null && selectedMediaIndex < steamMedia.length - 1 && (
            <TouchableOpacity
              style={[styles.lightboxArrow, styles.lightboxArrowRight]}
              onPress={() => setSelectedMediaIndex(prev => prev !== null ? prev + 1 : prev)}
            >
              <Ionicons name="chevron-forward" size={28} color="#FFF" />
            </TouchableOpacity>
          )}

          {steamMedia.length > 1 && (
            <View style={styles.lightboxStrip} pointerEvents="box-none">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.lightboxStripContent}
              >
                {steamMedia.map((m, i) => (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setSelectedMediaIndex(i)}
                    style={[
                      styles.lightboxThumb,
                      selectedMediaIndex === i && styles.lightboxThumbActive,
                    ]}
                  >
                    <Image
                      source={{ uri: m.thumbnail }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                    {m.type === 'movie' && (
                      <View style={styles.lightboxThumbPlay}>
                        <Ionicons name="play" size={10} color="#FFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* SEARCH VIEW */}
      <SearchView
        visible={isSearchVisible}
        gamepadConnected={gamepadInfo.connected}
        onClose={() => setSearchVisible(false)}
        libraryGames={searchableLibraryGames}
        mediaItems={searchableMedia.length > 0 ? searchableMedia : media}
        storeOffers={storeOffers}
        onOpenGameDetail={(item) => {
          setSelectedItem(item as ConsoleItem);
          setDetailVisible(true);
        }}
        onOpenOnlineUser={(username) => setOnlineProfileUsername(username)}
      />

      <OnlineUserFullProfile
        username={onlineProfileUsername}
        onClose={() => setOnlineProfileUsername(null)}
      />

      {/* BACKGROUND PICKER */}
      <BackgroundPickerModal
        visible={isHomeBgModalVisible}
        onClose={() => setHomeBgModalVisible(false)}
        onSelectBackground={handleApplyHomeBg}
        currentBackgroundUri={homeBackground?.uri}
        backdropUri={
          homeBackground?.uri ??
          (Platform.OS === 'web' ? localStorage.getItem('home_background') : null)
        }
        wallpaperPath={activeUser?.settings?.wallpaperPath}
        capturePath={activeUser?.settings?.capturePath}
      />

      {/* Background Picker for Slideshow Album Selection */}
      <BackgroundPickerModal
        visible={isSlidesModalVisible}
        onClose={() => setIsSlidesModalVisible(false)}
        onSelectBackground={() => { }}
        initialTab="slides"
        onSelectAlbum={(albumName: string, items: string[]) => {
          setIsSlidesModalVisible(false);
          handleSlidesSettingsChange({ albumName, duration: slideshowDuration, transition: slideshowTransition });
        }}
      />

      {/* MEDIA GALLERY */}
      <MediaGalleryView
        visible={isMediaGalleryVisible}
        onClose={() => setMediaGalleryVisible(false)}
        capturePath={activeUser?.settings?.capturePath}
        wallpaperPath={activeUser?.settings?.wallpaperPath}
      />

      {/* AVATAR PICKER */}
      <AvatarPickerModal
        visible={isAvatarModalVisible}
        onClose={() => setAvatarModalVisible(false)}
        onSelectAvatar={handleApplyAvatar}
        currentAvatarUri={
          (activeUser?.settings?.useSteamAvatar && activeUser?.steamAvatarUrl)
            ? activeUser.steamAvatarUrl
            : ((activeUser as any)?.avatarBase64 || activeUser?.avatar || null)
        }
        avatarPath={activeUser?.settings?.avatarPath}
      />

      {/* SETTINGS VIEW */}
      <SettingsView
        visible={isSettingsVisible}
        gamepadConnected={gamepadInfo.connected}
        onClose={() => {
          setSettingsVisible(false);
          setSettingsInitialScreen('main');
          setFocusArea('header_avatar');
          setFocusIndex(1);
        }}
        activeUser={activeUser}
        updateUser={updateUser}
        allUsers={activeUser ? [activeUser] : []}
        onSwitchUser={() => changeUser()}
        libraryGames={games}
        media={media}
        language={language}
        changeLanguage={changeLanguage}
        onOpenBgModal={() => setHomeBgModalVisible(true)}
        onSelectWallpaperFolder={handleSelectWallpaperFolder}
        onSelectCaptureFolder={handleSelectCaptureFolder}
        onSelectRpcs3Folder={handleSelectRpcs3Folder}
        onOpenAvatarModal={() => setAvatarModalVisible(true)}
        onSelectAvatarFolder={handleSelectAvatarFolder}
        onToggleSteamAvatar={handleToggleSteamAvatar}
        initialScreen={settingsInitialScreen}
        onGamesImported={() => loadApps()}
      />

      {/* WELCOME SETTINGS VIEW */}
      <WelcomeSettingsView
        visible={isWelcomeSettingsVisible}
        onClose={() => {
          setWelcomeSettingsVisible(false);
          setFocusArea('welcome_toolbar');
          setToolbarFocusIndex(3);
        }}
        presentationEnabled={presentationEnabled}
        inactivityTime={inactivityTime}
        onSettingsChange={handlePresentationSettingsChange}
        selectedAlbumName={slideshowAlbumName}
        onOpenAlbumPicker={() => {
          setIsSlidesModalVisible(true);
        }}
        onSlidesSettingsChange={handleSlidesSettingsChange}
        isAlbumPickerOpen={isSlidesModalVisible}
      />

      {/* WIDGET EDIT PANEL */}
      <WidgetEditPanel
        visible={isWidgetEditOpen}
        focusedWidgetIndex={widgetEditFocusIndex}
        visibility={widgetVisibility}
        sizes={widgetSizes}
        onResize={resizeWidget}
        onToggle={(id) => {
          setWidgetVisibility(prev => {
            const next = { ...prev, [id]: prev[id] === false ? true : false };
            saveWidgetVisibility(next);
            return next;
          });
        }}
        onClose={() => {
          setIsWidgetEditOpen(false);
          setFocusArea('welcome_toolbar');
          setToolbarFocusIndex(0);
        }}
        onStartMove={(id) => startWidgetMove(id)}
        windowHeight={windowHeight}
      />

      {/* PS5 MOVE MODE FOOTER HINTS */}
      {isWidgetMoveMode && (
        <Animated.View
          style={styles.moveModeFooter}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
        >
          <View style={styles.moveHintItem}>
            <PSIcon char={PSIcons.cross} size={20} color="#d3d3d3ff" />
            <Text style={styles.moveHintText}>{t('common.confirm')}</Text>
          </View>
          <View style={styles.moveHintItem}>
            <PSIcon char={PSIcons.circle} size={20} color="#d3d3d3ff" />
            <Text style={styles.moveHintText}>{t('common.cancel')}</Text>
          </View>
        </Animated.View>
      )}

      {/* USER/POWER MODAL */}
      <Modal visible={isUserModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.userModalOverlay} activeOpacity={1} onPress={() => setUserModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: '100%', alignItems: 'center' }}>
            <View style={styles.userModalContent}>
              <View style={styles.userModalHeader}>
                <View style={styles.modalAvatarContainer}>
                  {activeUser?.avatar ? (
                    <Image
                      source={{ uri: (activeUser?.settings?.useSteamAvatar && activeUser?.steamAvatarUrl) ? activeUser.steamAvatarUrl : ((activeUser as any).avatarBase64 || activeUser.avatar) }}
                      style={styles.modalAvatar}
                      contentFit="contain"
                    />
                  ) : (
                    <View style={styles.defaultAvatarModal}><Ionicons name="person" size={24} color="#FFF" /></View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userModalHeaderName}>{activeUser?.name}</Text>
                  <Text style={styles.userModalHeaderStatus}>Online</Text>
                </View>
              </View>
              <View style={styles.powerButtonsContainer}>
                <TouchableOpacity style={[styles.powerButton, modalSelectedIndex === 0 && styles.powerButtonActive, modalSelectedIndex === 0 && styles.buttonFocused]} activeOpacity={0.8} onPress={() => { setModalSelectedIndex(0); setUserModalVisible(false); setSettingsVisible(true); }}>
                  <Ionicons name="settings-outline" size={48} color={modalSelectedIndex === 0 ? styles.powerIconActive.color : styles.powerIcon.color} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.powerButton, modalSelectedIndex === 1 && styles.powerButtonActive, modalSelectedIndex === 1 && styles.buttonFocused]} activeOpacity={0.8} onPress={() => setModalSelectedIndex(1)}>
                  <Ionicons name="log-out-outline" size={48} color={modalSelectedIndex === 1 ? styles.powerIconActive.color : styles.powerIcon.color} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.powerButton, modalSelectedIndex === 2 && styles.powerButtonActive, modalSelectedIndex === 2 && styles.buttonFocused]} activeOpacity={0.8} onPress={() => { setModalSelectedIndex(2); setUserModalVisible(false); changeUser(); }}>
                  <Ionicons name="sync-outline" size={48} color={modalSelectedIndex === 2 ? styles.powerIconActive.color : styles.powerIcon.color} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.powerButton, modalSelectedIndex === 3 && styles.powerButtonActive, modalSelectedIndex === 3 && styles.buttonFocused]} activeOpacity={0.8} onPress={() => { setModalSelectedIndex(3); setUserModalVisible(false); requestAppShutdown(); }}>
                  <Ionicons name="power-outline" size={48} color={modalSelectedIndex === 3 ? styles.powerIconActive.color : styles.powerIcon.color} />
                </TouchableOpacity>
              </View>
              <View style={styles.userModalFooter}>
                <View style={styles.statusInfo}>
                  <Ionicons name="desktop-outline" size={16} color="#A0A0C0" />
                  <Text style={styles.statusText}>WPS5 Console</Text>
                </View>
                <Text style={styles.statusSeparator}>|</Text>
                <View style={styles.statusInfo}>
                  <Ionicons name="time-outline" size={16} color="#A0A0C0" />
                  <ClockText style={styles.statusText} />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* LAUNCHING OVERLAY */}
      <Modal visible={isLaunching} transparent animationType="fade">
        {launchingItem ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, { zIndex: 1000, backgroundColor: '#000' }]}
            entering={FadeIn.duration(800)}
            exiting={FadeOut.duration(800)}
          >
            {/* Background image of the game, sin oscurecer */}
            {launchingItem.backgroundImage ? (
              <Image
                source={launchingItem.backgroundImage}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
            ) : launchingItem.image ? (
              <Image
                source={launchingItem.image}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
            ) : null}

            <View style={styles.launchingOverlay}>
              <Animated.View style={{ alignItems: 'center', marginBottom: 40 }} entering={FadeIn.delay(600).duration(2000)}>
                {launchingItem.logo ? (
                  <Image
                    source={launchingItem.logo}
                    style={{ width: 450, height: 180, marginBottom: 20 }}
                    contentFit="contain"
                  />
                ) : (
                  <Text style={[styles.ps5Title, { fontSize: 42, textAlign: 'center', marginBottom: 20, fontWeight: '200' }]} numberOfLines={1}>
                    {launchingItem.title}
                  </Text>
                )}
              </Animated.View>
            </View>
          </Animated.View>
        ) : (
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill}>
          </BlurView>
        )}
      </Modal>

      {/* SHUTDOWN OVERLAY: reproduce el video de suspensión configurado por
          el usuario (Settings -> Splash Videos) antes de cerrar la app. */}
      <Modal visible={isShuttingDown} transparent animationType="fade">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
          {(suspendCustomActive || !suspendDefaultFailed) ? (
            <BackgroundVideo
              key={suspendCustomActive ? 'suspend-custom' : 'suspend-default'}
              source={suspendVideoSource}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              muted={false}
              shouldPlay
              isLooping={false}
              onEnd={finishShutdown}
              onError={() => {
                if (suspendCustomActive) { setSuspendCustomFailed(true); return; }
                setSuspendDefaultFailed(true);
                finishShutdown(); // el de por defecto también falló: cerrar sin esperar
              }}
            />
          ) : (
            <Ionicons name="power-outline" size={64} color="#FFFFFF" />
          )}
        </View>
      </Modal>

      {/* PROFILE DROPDOWN MENU & BACKDROP */}
      {isProfileMenuOpen && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]}>
          {/* Backdrop for partially darkening background */}
          <TouchableOpacity
            style={styles.profileMenuBackdrop}
            activeOpacity={1}
            onPress={() => setIsProfileMenuOpen(false)}
          />
          {/* Dropdown Menu wrapper */}
          <View style={styles.profileMenuDropdownWrapper}>
            <ProfileDropdownMenu
              focusedIndex={profileMenuFocusIndex}
              onPressItem={handleProfileMenuAction}
              activeUser={activeUser}
              isOnline={isOnline}
            />
          </View>
        </View>
      )}
      {/* FLOATING TRANSITION COVER */}
      {getTransitionImageSource() && (
        <Animated.View style={floatingImageStyle}>
          <Image
            source={getTransitionImageSource()}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
        </Animated.View>
      )}

    </SafeAreaView >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
  },

  // === OVERLAY GRADIENTS ===
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.1) 100%)',
  } as any,
  gradientOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 130,
    backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
  } as any,

  // === HEADER ===
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 50,
    paddingTop: 16,
    paddingBottom: 4,
    zIndex: 5,
  },
  miniHeader: {
    position: 'absolute',
    top: 38,
    left: 50,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniHeaderToolbar: {
    position: 'absolute',
    top: 16,
    right: 50,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    left: 30,
    gap: 35,
  },
  tabTouchable: {
    position: 'relative',
    overflow: 'visible',
  },
  navItem: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 30,
    fontFamily: 'SSTLight',
    fontWeight: '200',
    letterSpacing: 0.2,
    borderWidth: 2,
    borderColor: 'transparent',
    borderStyle: 'solid',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navItemActive: {
    color: '#FFFFFF',
    fontFamily: 'SSTBold',
    //fontWeight: '400',
  },
  tabFocused: {
    color: '#ffffffff',
    //borderColor: "#a8a8a8ff",
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    // Sin fondo cuando no tiene focus — el RadarFocusWrapper maneja el efecto visual
  },
  headerIconBtnFocused: {
    backgroundColor: 'rgba(255, 255, 255, 1)',
  },
  timeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontFamily: 'SSTMedium',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginHorizontal: 4,
  },
  timeText2: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 35,
    fontFamily: 'SSTLight',
    fontWeight: '200',
    letterSpacing: 0.8,
    marginHorizontal: 4,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarMensajes: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
  },
  defaultAvatarHeader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  activeStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 10,
    backgroundColor: '#4CD964',
    borderWidth: 1,
    borderColor: '#308a3fa2',
    zIndex: 10,
  },

  // === MAIN CONTENT (scrollable) ===
  mainContent: {
    flex: 1,
    paddingTop: 0,
    zIndex: 2,
  },
  mainScrollContent: {
    paddingTop: 10, // space for fixed header (reduced to move games higher)
    paddingBottom: 60, // space for footer
    flexGrow: 1,
    minHeight: '100%',
  },


  // === CAROUSEL ===
  carouselSection: {
    height: 240,
    justifyContent: 'center',
    marginBottom: 0,
  },

  // === MEDIA LIGHTBOX ===
  lightboxOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3000,
  },
  lightboxContent: {
    width: '82%',
    maxWidth: 1060,
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  lightboxImage: { width: '100%', height: '100%' },
  lightboxVideo: { width: '100%', height: '100%' },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lightboxBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    zIndex: 10,
  },
  lightboxBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  lightboxCounter: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    zIndex: 10,
  },
  lightboxCounterText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  lightboxArrow: {
    position: 'absolute',
    top: '50%' as any,
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lightboxArrowLeft: { left: '8%' as any },
  lightboxArrowRight: { right: '8%' as any },
  lightboxStrip: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  lightboxStripContent: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lightboxThumb: {
    width: 80,
    height: 46,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    opacity: 0.55,
  },
  lightboxThumbActive: {
    borderColor: '#FFFFFF',
    opacity: 1,
  },
  lightboxThumbPlay: {
    position: 'absolute',
    inset: 0 as any,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // === FOOTER ===
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 50,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.0)',
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },

  // === EMPTY STATES ===
  mediaEmptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 60,
  },
  mediaEmptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
    marginTop: 15,
    fontWeight: '600',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: {
    width: 420,
    backgroundColor: 'rgba(23, 23, 30, 1)',
    borderRadius: 12,
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '300', marginBottom: 20, textAlign: 'center', letterSpacing: 0.5 },
  input: { backgroundColor: 'rgba(255,255,255,0.02)', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', fontSize: 15 },
  inputFocused: { borderColor: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, transform: [{ scale: 1.02 }] },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  typeBtn: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, marginHorizontal: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  typeBtnActive: { borderColor: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.06)' },
  typeBtnText: { color: 'rgba(255,255,255,0.5)', fontWeight: '300', fontSize: 13 },
  typeBtnTextActive: { color: '#FFF', fontWeight: '500' },
  platformScrollContent: { gap: 8, paddingVertical: 5 },
  platformBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  platformBtnActive: { borderColor: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.06)' },
  platformBtnText: { color: 'rgba(255,255,255,0.5)', fontWeight: '300', marginLeft: 6, fontSize: 12 },
  platformBtnTextActive: { color: '#FFF', fontWeight: '500' },
  fileBtn: { backgroundColor: 'rgba(255,255,255,0.02)', padding: 15, borderRadius: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  fileBtnText: { color: 'rgba(255,255,255,0.85)', fontWeight: '300', marginLeft: 10, flex: 1, fontSize: 13 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cancelBtn: { flex: 1, padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, marginRight: 5, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  cancelBtnText: { color: 'rgba(255,255,255,0.7)', fontWeight: '300' },
  saveBtn: { flex: 1, padding: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, marginLeft: 5, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  saveBtnText: { color: '#FFF', fontWeight: '600' },

  // === SETTINGS MODAL ===
  settingsOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  settingsContainer: { width: 850, height: 600, backgroundColor: '#1C1C1E', borderRadius: 24, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  settingsSidebar: { width: 240, backgroundColor: '#141416', padding: 24, borderRightWidth: 1, borderRightColor: 'rgba(255, 255, 255, 0.08)' },
  settingsSidebarTitle: { color: '#FFF', fontSize: 20, fontFamily: 'SSTBold', fontWeight: 'bold', marginBottom: 25, letterSpacing: 0.5 },
  settingsTab: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: 'transparent', gap: 10 },
  settingsTabActive: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' },
  settingsTabText: { color: '#8E8E93', fontSize: 15, fontWeight: '600' },
  settingsTabTextActive: { color: '#FFF', fontWeight: 'bold' },
  settingsSidebarClose: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', gap: 10 },
  settingsSidebarCloseText: { color: '#8E8E93', fontSize: 15, fontWeight: '600' },
  settingsMain: { flex: 1, padding: 30, backgroundColor: '#1C1C1E' },
  settingsMainTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  settingsScrollContentInner: { paddingBottom: 20 },
  settingsSection: { marginBottom: 35 },
  settingsLabel: { color: '#888', fontSize: 12, fontWeight: '900', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1.5 },
  settingsAvatarContainer: { position: 'relative', width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
  settingsAvatar: { width: '100%', height: '100%', borderRadius: 60 },
  settingsAvatarEditBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0, 0, 0, 0.6)', height: '30%', justifyContent: 'center', alignItems: 'center' },
  settingsInput: { backgroundColor: 'rgba(0, 0, 0, 0.3)', color: '#FFF', padding: 15, borderRadius: 15, fontSize: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  colorPickerContainer: { flexDirection: 'row', gap: 15, alignItems: 'center' },
  colorCircle: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', cursor: 'pointer' } as any,
  colorCircleActive: { borderColor: '#FFF', transform: [{ scale: 1.15 }] },
  settingsOptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
  settingsOptionInfo: { flex: 1, marginRight: 20 },
  settingsOptionLabel: { color: '#E0E0FF', fontSize: 16, fontWeight: '600', marginBottom: 5 },
  settingsOptionDesc: { color: '#888', fontSize: 13, lineHeight: 18 },
  toggleContainer: { width: 54, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.1)', padding: 3, justifyContent: 'center' },
  toggleContainerActive: { backgroundColor: 'rgba(255,255,255,0.7)' },
  toggleCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF' },
  toggleCircleActive: { transform: [{ translateX: 25 }] },
  settingsSecondaryBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 15, gap: 12, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  settingsSecondaryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  defaultAvatarContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },

  // === WIDGET MOVE MODE FOOTER ===
  moveModeFooter: {
    position: 'absolute' as const,
    bottom: 30,
    right: 48,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 20,
    zIndex: 99999,
    backgroundColor: 'rgba(12, 12, 12, 1)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 20,
  },
  moveHintItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  moveHintBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center' as const, justifyContent: 'center' as const },
  moveHintBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' as const },
  moveHintText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'SSTMedium', fontWeight: '500' as const },

  // === USER MODAL ===
  userModalOverlay: { flex: 1, backgroundColor: 'rgba(10, 10, 15, 0.95)', justifyContent: 'center', alignItems: 'center' },
  userModalContent: { width: '90%', maxWidth: 800, alignItems: 'center' },
  userModalHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30, 30, 45, 0.8)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 15, marginBottom: 40, alignSelf: 'flex-end', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalAvatarContainer: { position: 'relative', marginRight: 15 },
  modalAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#FFF' },
  defaultAvatarModal: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFF' },
  userModalHeaderName: { color: '#E0E0FF', fontSize: 16, fontWeight: '500' },
  userModalHeaderStatus: { color: '#4CD964', fontSize: 10, fontWeight: 'bold' },
  powerButtonsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 50 },
  powerButton: { width: 160, height: 160, backgroundColor: 'rgba(40, 40, 60, 0.5)', borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  powerButtonActive: { backgroundColor: '#C4B5FD', borderColor: '#A78BFA' },
  powerIcon: { color: '#E0E0FF' },
  powerIconActive: { color: '#1E1E2E' },
  userModalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
  statusInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { color: '#A0A0C0', fontSize: 14 },
  statusSeparator: { color: '#404060', fontSize: 18 },

  // === FOCUS / BUTTON STATES ===
  buttonFocused: { borderColor: '#FFFFFF', borderWidth: 2, transform: [{ scale: 1.04 }], zIndex: 10 },

  // === LAUNCHING ===
  launchingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  launchingText: { color: '#FFFFFF', fontSize: 22, fontFamily: 'SSTBold', fontWeight: 'bold', marginTop: 20, letterSpacing: 3, textTransform: 'uppercase' },

  // === ACTIVE CARD LABEL ===
  activeLabelContainer: {
    position: 'absolute',
    top: 120,
    left: 190,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    minWidth: 500,
  },
  platformBadge: {
    //backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 2,
    //borderRadius: 4,
    marginRight: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformBadgeText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  activeGameTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontFamily: 'SSTLight',
    fontWeight: '300',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
    whiteSpace: 'nowrap',
  } as any,


  profileMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 9998,
  },
  profileMenuDropdownWrapper: {
    position: 'absolute',
    top: 90,
    right: 175,
    zIndex: 9999,
  },

  // === NEW FULL SCREEN SETTINGS VIEW ===
  settingsViewContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 999,
  },
  settingsOverlayDark: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 8, 12, 0.45)',
  },
  settingsContentContainer: {
    flex: 1,
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 80,
  },
  settingsMainTitleLarge: {
    color: '#FFF',
    fontSize: 40,
    fontFamily: 'SSTLight',
    fontWeight: '200',
    letterSpacing: 0.5,
    marginBottom: 30,
  },
  settingsTwoColumns: {
    flex: 1,
    flexDirection: 'row',
    gap: 60,
  },
  settingsSidebarNew: {
    width: 320,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    paddingRight: 40,
    justifyContent: 'flex-start',
  },
  settingsTabNew: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    // borderRadius: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 15,
    // backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  settingsTabActiveNew: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  settingsTabFocusedNew: {
    borderColor: '#FFFFFF',
    // backgroundColor: 'rgba(255, 255, 255, 0.12)',
    // shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    borderRadius: 5,
  },
  settingsTabTextNew: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 18,
    fontWeight: '400',
  },
  settingsTabTextActiveNew: {
    color: '#FFF',
    fontWeight: '600',
  },
  settingsSidebarCloseNew: {
    marginTop: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  settingsSidebarCloseTextNew: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 18,
    fontWeight: '400',
  },
  settingsMainNew: {
    flex: 1,
    // backgroundColor: 'rgba(20, 20, 30, 0.15)',
    borderRadius: 0,
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0)',
  },
  settingsSectionTitleNew: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '300',
    marginBottom: 30,
  },
  settingsScrollContentInnerNew: {
    paddingBottom: 40,
  },
  settingsSectionNew: {
    marginBottom: 35,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  settingsLabelNew: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 15,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  settingsAvatarContainerNew: {
    position: 'relative',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  settingsAvatarNew: {
    width: '100%',
    height: '100%',
    borderRadius: 70,
  },
  settingsAvatarEditBadgeNew: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    height: '30%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarContainerNew: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  settingsInputNew: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    color: '#FFF',
    padding: 16,
    borderRadius: 14,
    fontSize: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  settingsInputFocusedNew: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  colorPickerContainerNew: {
    flexDirection: 'row',
    gap: 15,
    alignItems: 'center',
  },
  colorCircleNew: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorCircleActiveNew: {
    borderColor: '#FFF',
    transform: [{ scale: 1.15 }],
  },
  settingsOptionRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 35,
    paddingBottom: 25,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  settingsOptionInfoNew: {
    flex: 1,
    marginRight: 30,
  },
  settingsOptionLabelNew: {
    color: '#E0E0FF',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 6,
  },
  settingsOptionDescNew: {
    color: '#8A8A8F',
    fontSize: 14,
    lineHeight: 20,
  },
  toggleContainerNew: {
    width: 60,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 3,
    justifyContent: 'center',
  },
  toggleContainerActiveNew: {
    backgroundColor: '#FFFFFF',
  },
  toggleCircleNew: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
  },
  toggleCircleActiveNew: {
    transform: [{ translateX: 26 }],
    backgroundColor: '#000',
  },
  settingsSecondaryBtnNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 14,
    gap: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  settingsSecondaryBtnTextNew: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
  },
  settingsElementFocusedNew: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  platformBtnNew: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  platformBtnActiveNew: {
    backgroundColor: '#FFF',
  },
  platformBtnTextNew: {
    color: '#8E8E93',
    fontWeight: '600',
  },
  platformBtnTextActiveNew: {
    color: '#000',
    fontWeight: '700',
  },
  ps5Title: {
    //fontSize: 30,
    //color: '#ffffff',
    //fontWeight: 'bold',
    //letterSpacing: 1,
    //marginBottom: 12,
    //textShadowColor: '#000',
    //textShadowOffset: { width: 2, height: 2 },
    //textShadowRadius: 5,
  },
  welcomePanel: {
    marginTop: 'auto' as any,
    width: '100%',
    maxWidth: '100%' as any,
  },
  supportMessageContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    padding: 24,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  supportTextMain: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '300',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  supportTextSub: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 600,
  },
  supportLinksRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 35,
  },
  supportLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    gap: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  supportLinkBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  patronsSection: {
    marginTop: 10,
  },
  patronsListGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 15,
  },
  patronCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  patronName: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  presentationClock: {
    position: 'absolute',
    top: 16,
    right: 40,
    zIndex: 9998,
  },
});