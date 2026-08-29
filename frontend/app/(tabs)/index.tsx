import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Platform, Modal, TextInput, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Video, ResizeMode } from 'expo-av';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, useDerivedValue, useAnimatedRef, measure, withTiming, withDelay, withRepeat, interpolate, Easing, FadeInDown, FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import YoutubePlayer from '@/components/YoutubePlayer';
import FavoritesView from '@/components/FavoritesView';
import ControlPrompt from '@/components/ControlPrompt';
import RandomSelectorView from '@/components/RandomSelectorView';
import { useUser } from '@/contexts/UserContext';
import { Linking } from 'react-native';
import { fetchGamingNews, NewsArticle } from '@/services/newsService';
import { soundService } from '@/services/soundService';
import { fetchSteamNewsByName, formatSteamDate, SteamNewsItem } from '@/services/steamNewsService';
import { fetchSteamMediaByName, SteamMediaItem } from '@/services/steamMediaService';
import { fetchSteamOwnedGames } from '@/services/steamUserService';
import { fetchSteamInstalledAppIds } from '@/services/steamInstallService';
import { buildSteamRunUrl, getGameActionLabel, resolveLaunchPath, resolveSteamLaunchPath } from '@/services/steamLaunchService';
import { Feather } from '@expo/vector-icons';
import RadarFocusWrapper from '@/components/RadarFocusWrapper';
import MusicPlayerCard from '@/components/MusicPlayerCard';

// WPS5 UI Expansion Components
import LibraryGrid from '@/components/LibraryGrid';
import FloatingSystemNav from '@/components/FloatingSystemNav';
import OverlayTab from '@/components/OverlayTab';
import GameContextMenu from '@/components/GameContextMenu';
import GameDetailView from '@/components/GameDetailView';
import ProfileDropdownMenu from '@/components/ProfileDropdownMenu';

// Modular components
import ConsoleCarousel from '@/components/ConsoleCarousel';
import WelcomeWidgets from '@/components/WelcomeWidgets';
import GameInfoPanel from '@/components/GameInfoPanel';
import StoreFrontPanel from '@/components/StoreFrontPanel';
import BackgroundPickerModal from '@/components/BackgroundPickerModal';
import SearchView from '@/components/SearchView';
import { fetchStoreOffers, StoreOffer, LOCAL_FALLBACK_OFFERS } from '@/services/storeService';
import { UserProfile } from '@/components/UserSelectScreen';
import { useTranslation } from '@/contexts/LanguageContext';
import { LANGUAGE_OPTIONS, isLanguage, Language } from '@/i18n/translations';

const TABS: { id: string; labelKey: 'tabs.games' | 'tabs.media' }[] = [
  { id: 'Games', labelKey: 'tabs.games' },
  { id: 'Media', labelKey: 'tabs.media' },
];
var Wview: string = 'block';

export interface ConsoleItem {
  id: string;
  title: string;
  time: string;
  image?: any;
  logo?: any;
  backgroundImage?: any;
  backgroundVideo?: any;
  video?: any;
  isFolder?: boolean;
  isGrid?: boolean;
  path?: string;
  description?: string;
  rating?: number;
  isFavorite?: boolean;
  isLastPlayed?: boolean;
  lastPlayed?: number;
  youtubeId?: string;
  type?: 'game' | 'media' | 'web';
  platform?: string;
}

const getInitialGames = (t: any): ConsoleItem[] => [
  { id: '1', title: t('home.welcome'), time: 'WConsole - Home', image: require('@/assets/images/Home.png'), description: t('home.welcomeDesc'), rating: 5.0 },
  { id: 'last_played', title: t('lastPlayed.title'), time: t('lastPlayed.noGamesYet'), image: require('@/assets/images/Home.gif'), isLastPlayed: true },
  { id: '5', title: 'PlayStation Store', time: t('home.store'), image: require('@/assets/images/Store.png'), backgroundImage: require('@/assets/images/StoreFondo.jpg') }
];

const getInitialMedia = (t: any): ConsoleItem[] => [
  {
    id: 'spotify_default',
    title: 'Spotify',
    time: t('home.music'),
    type: 'media',
    platform: 'Spotify',
    description: t('home.musicDesc'),
    image: require('@/assets/images/spotify_portada.png'),
    logo: require('@/assets/images/spotify_logo.png'),
    backgroundImage: require('@/assets/images/spotify_fondo.png')
  }
];



export default function ConsoleHome() {
  const { activeUser, changeUser, updateUser } = useUser();
  const { t, language, setLanguage } = useTranslation();
  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    updateUser({ settings: { ...activeUser?.settings, language: lang } });
  };
  const [activeTab, setActiveTab] = useState('Games');
  const [currentRenderedTab, setCurrentRenderedTab] = useState('Games');
  const [activeIndex, setActiveIndex] = useState(1);
  // carouselKey: incrementing this forces AnimatedCardWrapper instances to remount,
  // re-triggering the staggered entrance animation on tab change.
  const [carouselKey, setCarouselKey] = useState(0);

  // Focus management
  type FocusArea = 'header_user' | 'header_tabs' | 'main_carousel' | 'game_panel' | 'footer' | 'welcome_widgets' | 'welcome_toolbar' | 'library_grid' | 'header_avatar';
  const [focusArea, setFocusArea] = useState<FocusArea>('main_carousel');
  const [focusIndex, setFocusIndex] = useState(0);
  // game_panel focus: 0=Play, 1=More, 2=Trophies, 3=Friends
  const [gamePanelFocusIndex, setGamePanelFocusIndex] = useState(0);

  // Steam news
  const [steamNews, setSteamNews] = useState<SteamNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // Storefront offers
  const [storeOffers, setStoreOffers] = useState<StoreOffer[]>(LOCAL_FALLBACK_OFFERS);
  const [storeLoading, setStoreLoading] = useState(true);

  // Steam screenshots & trailers
  const [steamMedia, setSteamMedia] = useState<SteamMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);
  const selectedLightboxMedia = selectedMediaIndex !== null ? steamMedia[selectedMediaIndex] ?? null : null;


  const scrollRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<any>(null);
  const newsScrollRef = useRef<ScrollView>(null);
  const mediaScrollRef = useRef<ScrollView>(null);
  const widgetScrollRef = useRef<ScrollView>(null);
  const lastNavTime = useRef<number>(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // PS5-style card sizing: responsive based on window dimensions
  const CARD_SIZE = Math.round(Math.min(Math.max(windowHeight * 0.12, 90), 180));
  const CARD_GAP = Math.round(Math.max(windowHeight * 0.006, 4));
  const ITEM_WIDTH = CARD_SIZE + CARD_GAP * 2;
  const LEFT_PADDING = Math.round(Math.max(windowWidth * 0.078, 80));
  const RIGHT_PADDING = Math.max(windowWidth - ITEM_WIDTH - LEFT_PADDING, 60);

  // States for dynamic data and clock
  const [games, setGames] = useState<ConsoleItem[]>(() => getInitialGames(t));
  const [media, setMedia] = useState<ConsoleItem[]>(() => getInitialMedia(t));
  const [lastPlayedGame, setLastPlayedGame] = useState<ConsoleItem | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [gamepadInfo, setGamepadInfo] = useState({ connected: false, name: '', battery: 0 });
  const [storageInfo, setStorageInfo] = useState({ percent: 0, freeGB: 0 });

  // States for Add App Modal
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [newApp, setNewApp] = useState({ title: '', path: '', image: '', type: 'game', platform: '' });
  const [isSaving, setIsSaving] = useState(false);

  // States for Game Detail View
  const [selectedItem, setSelectedItem] = useState<ConsoleItem | null>(null);
  const [isUserModalVisible, setUserModalVisible] = useState(false);
  const [modalSelectedIndex, setModalSelectedIndex] = useState(0);
  const [isHomeBgModalVisible, setHomeBgModalVisible] = useState(false);
  const [isSearchVisible, setSearchVisible] = useState(false);
  const [searchUsers, setSearchUsers] = useState<UserProfile[]>([]);
  const [toolbarFocusIndex, setToolbarFocusIndex] = useState(2);
  const [addModalFocusIndex, setAddModalFocusIndex] = useState(0);
  const [settingsFocusArea, setSettingsFocusArea] = useState<'sidebar' | 'content'>('sidebar');
  const [settingsFocusIndex, setSettingsFocusIndex] = useState(0);

  const addModalTitleRef = useRef<TextInput>(null);
  const addModalPathRef = useRef<TextInput>(null);
  const addModalPlatformRef = useRef<TextInput>(null);
  const settingsNameRef = useRef<TextInput>(null);

  const [isFavoritesVisible, setFavoritesVisible] = useState(false);
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'home' | 'sync' | 'support'>('profile');
  const [homeBackground, setHomeBackground] = useState<any>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingItem, setLaunchingItem] = useState<ConsoleItem | null>(null);
  const [isRandomSelectorVisible, setRandomSelectorVisible] = useState(false);

  // States for new UI features (WPS5 UI Expansion)
  const [isLibraryFocused, setIsLibraryFocused] = useState(false);
  const [libraryGridFocusIndex, setLibraryGridFocusIndex] = useState(0);
  const [libraryTab, setLibraryTab] = useState<'installed' | 'collection'>('installed');
  // true cuando el foco (teclado/mando) está sobre la fila de pestañas
  // Instalados | Tu Colección, en vez de sobre una tarjeta del grid.
  const [libraryTabsFocused, setLibraryTabsFocused] = useState(false);
  const [steamGames, setSteamGames] = useState<ConsoleItem[]>([]);
  const [installedSteamAppIds, setInstalledSteamAppIds] = useState<Set<string> | null>(null);
  const [loadingSteam, setLoadingSteam] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [contextMenuFocusIndex, setContextMenuFocusIndex] = useState(0);
  const activeCardRef = useAnimatedRef<View>();
  const [contextMenuCoords, setContextMenuCoords] = useState({ top: 250, left: 335 });
  const [isDetailVisible, setDetailVisible] = useState(false);
  const [isLibraryDetailVisible, setIsLibraryDetailVisible] = useState(false);

  const [isOnline, setIsOnline] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [profileMenuFocusIndex, setProfileMenuFocusIndex] = useState(0);

  const [systemNavLevel, setSystemNavLevel] = useState(0); // 0 = menu, 1 = cards
  const [systemNavCardIndex, setSystemNavCardIndex] = useState(0);
  const [systemNavMaxCardIndex, setSystemNavMaxCardIndex] = useState(2);
  const [isSystemNavCardExpanded, setSystemNavCardExpanded] = useState(false);

  // Background transition states
  const [bgA, setBgA] = useState<any>(null);
  const [bgB, setBgB] = useState<any>(null);
  const [activeLayer, setActiveLayer] = useState<'A' | 'B'>('A');
  const [showTrailer, setShowTrailer] = useState(false);
  const [inputMode, setInputMode] = useState<'keyboard' | 'gamepad'>('keyboard');
  const fade = useSharedValue(0);
  const tabFade = useSharedValue(1);
  const gamePanelFocusAnim = useSharedValue(0);
  const lowerSectionFocusAnim = useSharedValue(0);
  const welcomeWidgetsFocusAnim = useSharedValue(0);
  const spinRotation = useSharedValue(0);
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

  useEffect(() => {
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

  // Spinning border animation — continuous rotation for active card
  useEffect(() => {
    spinRotation.value = withRepeat(
      withTiming(360, { duration: 2800, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  // Fetch PlayStation Storefront offers
  useEffect(() => {
    fetchStoreOffers()
      .then((data) => setStoreOffers(data))
      .finally(() => setStoreLoading(false));
  }, []);

  const isGamePanelFocused = focusArea === 'game_panel';
  const isLowerSectionFocused = isGamePanelFocused && gamePanelFocusIndex >= 2;
  const isDeepSectionFocused = isGamePanelFocused && gamePanelFocusIndex >= 4;
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
    const deepHeight = interpolate(deepSectionFocusAnim.value, [0, 1], [trophyHeight, 80]);
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
    const fullHeight = CARD_SIZE + 80;
    return {
      opacity: 1 - collapseAnim,
      transform: [{ translateY: interpolate(collapseAnim, [0, 1], [0, -20]) }],
      height: interpolate(heightCollapse, [0, 1], [fullHeight, 0]),
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
    paddingBottom: Math.max(10, windowHeight * (10 / 1080)),
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

  useEffect(() => {
    if (Platform.OS === 'web') {
      const savedBg = localStorage.getItem('home_background');
      if (savedBg) setHomeBackground({ uri: savedBg });
    }
  }, []);

  const GAMES_LIMIT = 10;
  const nonSteamGames = games.filter(item => !item.id.toString().startsWith('steam_'));

  let currentData = currentRenderedTab === 'Games' ? nonSteamGames : media;

  if (currentRenderedTab === 'Games') {
    currentData = nonSteamGames.slice(0, GAMES_LIMIT);
    currentData.push({
      id: 'more_library',
      title: t('library.viewLibrary'),
      time: t('library.viewAllGames'),
      image: null,
    } as any);
  }

  // Filter out system utility cards from the saved games list
  const savedGames = nonSteamGames.filter(
    item => item.id !== '1' && item.id !== 'last_played' && item.id !== 'more_library' && item.id !== '5' && !item.isFolder && !item.isGrid
  );

  const displayedLibraryGames = libraryTab === 'installed' ? savedGames : steamGames.map(sg => {
    const override = games.find(g => g.id === sg.id);
    const merged = override ? { ...sg, ...override } : sg;
    return { ...merged, path: resolveLaunchPath(merged) };
  });

  const searchableLibraryGames = useMemo(() => {
    const byId = new Map<string, ConsoleItem>();
    savedGames.forEach(g => byId.set(g.id, { ...g, path: resolveLaunchPath(g) }));
    steamGames.forEach(g => {
      const existing = byId.get(g.id);
      byId.set(g.id, existing ? { ...g, ...existing, path: resolveLaunchPath(existing) } : { ...g, path: resolveLaunchPath(g) });
    });
    return Array.from(byId.values());
  }, [savedGames, steamGames]);

  const searchableMedia = useMemo(() => media, [media]);

  useEffect(() => {
    if (!isSearchVisible || Platform.OS !== 'web' || !(window as any).electronAPI?.getUsers) return;
    (window as any).electronAPI.getUsers().then((users: UserProfile[]) => {
      if (Array.isArray(users) && users.length > 0) setSearchUsers(users);
    }).catch(() => { });
  }, [isSearchVisible]);

  useEffect(() => {
    if (libraryTab === 'collection' && steamGames.length === 0 && !loadingSteam) {
      // Reemplaza 'TU_API_KEY_AQUI' con tu verdadera Steam Web API Key
      const GLOBAL_STEAM_API_KEY = process.env.EXPO_PUBLIC_STEAM_API_KEY || 'B1F361EA3C07B455DC8B0D06ED179B00';
      const steamId = activeUser?.settings?.steamId;

      if (steamId) {
        setLoadingSteam(true);
        fetchSteamOwnedGames(GLOBAL_STEAM_API_KEY, steamId).then(gamesList => {
          const formatted: ConsoleItem[] = gamesList.map((g: any) => ({
            id: `steam_${g.appid}`,
            title: g.name,
            time: 'Steam',
            image: { uri: `https://steamcdn-a.akamaihd.net/steam/apps/${g.appid}/library_600x900_2x.jpg` },
            description: t('game.playedTime', { hours: Math.round(g.playtime_forever / 60) }),
            platform: 'Steam',
            path: buildSteamRunUrl(g.appid),
          }));
          setSteamGames(formatted);
          setLoadingSteam(false);
        }).catch(() => setLoadingSteam(false));
      }
    }
  }, [libraryTab, activeUser, steamGames.length, loadingSteam]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.getSteamInstalledApps) return;

    fetchSteamInstalledAppIds().then(setInstalledSteamAppIds);
  }, []);

  useEffect(() => {
    if (libraryTab !== 'collection') return;
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.getSteamInstalledApps) return;

    fetchSteamInstalledAppIds().then(setInstalledSteamAppIds);
  }, [libraryTab, steamGames.length]);

  useEffect(() => {
    const currentItem = currentData[activeIndex];
    setIsLibraryFocused(
      currentItem?.id === 'more_library' ||
      focusArea === 'library_grid'
    );
  }, [activeIndex, focusArea, currentData]);

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      setCurrentTime(`${hours}:${minutes} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadApps = () => {
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      (window as any).electronAPI.getApps().then((data: any) => {
        const formatApp = (app: any) => ({
          id: app.id,
          title: app.title,
          time: app.type === 'game' ? (app.platform || t('cc.typeGame')) : (app.type === 'web' ? 'Web App' : 'Media'),
          image: app.imageBase64
            ? { uri: app.imageBase64 }
            : (app.image
              ? (app.image.startsWith('http') ? { uri: app.image } : { uri: `local-file:///${app.image.replace(/\\/g, '/')}` })
              : (app.id === 'spotify_default' ? require('@/assets/images/spotify_portada.png') : (app.type === 'web' ? require('@/assets/images/web_default.jpg') : require('@/assets/images/Home.gif')))
            ),
          logo: app.logoBase64 ? { uri: app.logoBase64 } : (app.logo ? (app.logo.startsWith('http') ? { uri: app.logo } : { uri: `local-file:///${app.logo.replace(/\\/g, '/')}` }) : (app.id === 'spotify_default' ? require('@/assets/images/spotify_logo.png') : null)),
          backgroundImage: app.backgroundImageBase64
            ? { uri: app.backgroundImageBase64 }
            : (app.backgroundImage
              ? (app.backgroundImage.startsWith('http') ? { uri: app.backgroundImage } : { uri: `local-file:///${app.backgroundImage.replace(/\\/g, '/')}` })
              : (app.id === 'spotify_default' ? require('@/assets/images/spotify_fondo.png') : require('@/assets/images/FondoDefault2.jpg'))
            ),
          video: app.video ? (app.video.startsWith('http') ? { uri: app.video } : { uri: `local-file:///${app.video.replace(/\\/g, '/')}` }) : null,
          path: app.path,
          description: app.description || (app.id === 'spotify_default' ? t('home.musicDesc') : ''),
          rating: app.rating,
          isFavorite: app.isFavorite,
          lastPlayed: app.lastPlayed,
          youtubeId: app.youtubeId,
          type: app.type,
          platform: app.platform
        });
        const gamesList = (data.games || []).map(formatApp);
        const mediaList = (data.media || []).map(formatApp);

        const initialGames = getInitialGames(t);
        const home = initialGames.find(g => g.id === '1');
        const lastPlayed = initialGames.find(g => g.id === 'last_played');
        const favGames = initialGames.find(g => g.id === '3');
        const favMedia = initialGames.find(g => g.id === '4');
        const ps5store = initialGames.find(g => g.id === '5');

        const baseItems = [ps5store, home, lastPlayed, favGames, favMedia].filter(Boolean) as ConsoleItem[];

        // Find the most recently played game/media to show in last_played card
        const allFormatted = [...gamesList, ...mediaList];
        const sortedByLastPlayed = allFormatted
          .filter((i: any) => i.lastPlayed)
          .sort((a: any, b: any) => b.lastPlayed - a.lastPlayed);
        const latestGame = sortedByLastPlayed[0] || null;

        // Exclude last played game from the row to avoid duplication.
        // Sort remaining games: most recently played first, then unplayed in original order.
        const gamesWithoutLastPlayed = latestGame
          ? gamesList.filter((g: any) => g.id !== latestGame.id)
          : gamesList;
        const gamesWithHistory = gamesWithoutLastPlayed
          .filter((g: any) => g.lastPlayed)
          .sort((a: any, b: any) => b.lastPlayed - a.lastPlayed);
        const gamesWithoutHistory = gamesWithoutLastPlayed.filter((g: any) => !g.lastPlayed);
        const sortedGames = [...gamesWithHistory, ...gamesWithoutHistory];

        setGames([...baseItems, ...sortedGames]);

        const initialMedia = getInitialMedia(t);
        const filteredDataMedia = initialMedia.filter((defaultItem: any) =>
          !mediaList.some((userItem: any) => userItem.id === defaultItem.id)
        );
        setMedia([...filteredDataMedia, ...mediaList.reverse()]);

        if (latestGame) setLastPlayedGame(latestGame);
      });
    }
  };

  useEffect(() => {
    loadApps();
    fetchGamingNews().then(() => { });
    soundService.init();
    soundService.playBackground();
    soundService.playStartHome();
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      (window as any).electronAPI.getStorageInfo().then((res: any) => {
        if (res.success) setStorageInfo({ percent: res.percent, freeGB: res.freeGB });
      });
    }
  }, []);

  const openContextMenu = () => {
    const item = currentData[activeIndex];
    if (!item || item.id === 'more_library') return;

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
      setDetailVisible(true);
    } else if (idx === 1) {
      // Ubicación
      if (Platform.OS === 'web' && (window as any).electronAPI) {
        if (item.path) {
          const result = await (window as any).electronAPI.openGameLocation(item.path);

          if (!result.success) {
            alert('Error: ' + result.error);
          }
        } else {
          alert('La aplicación no tiene ruta asignada.');
        }
      }
    } else if (idx === 2) {
      // Eliminar
      const confirmed = window.confirm(`¿Estás seguro de que quieres eliminar "${item.title}"? Esta acción no se puede deshacer.`);
      if (confirmed) {
        if (Platform.OS === 'web' && (window as any).electronAPI) {
          const result = await (window as any).electronAPI.deleteApp(item.id);
          if (result.success) {
            loadApps();
          } else {
            alert('Error al eliminar: ' + result.error);
          }
        }
      }
    }
  };

  const handleSystemNavAction = (idx: number) => {
    if (idx === 0) {
      // Inicio
      setFocusArea('main_carousel');
    } else if (idx === 9) {
      // Perfil (Cambiar usuario)
      changeUser();
    } else if (idx === 10) {
      // Alimentación (Apagar)
      if (Platform.OS === 'web' && (window as any).electronAPI) {
        (window as any).electronAPI.closeApp();
      }
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
      // Perfil (Abre Configuración -> Perfil)
      setSettingsTab('profile');
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
        (window as any).electronAPI.closeApp();
      } else {
        alert(t('alert.closingConsole'));
      }
    }
  };

  // Gamepad state refs
  const prevButtonsRef = useRef(new Array(16).fill(false));
  const prevAxesRef = useRef([0, 0, 0, 0]);
  const lastGpId = useRef<string | null>(null);

  // Gamepad Support
  useEffect(() => {
    let rafId: number;
    const poll = () => {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0];
      if (gp) {
        const buttons = gp.buttons;
        const dispatch = (key: string) => {
          setInputMode('gamepad');
          const event = new KeyboardEvent('keydown', {
            key, bubbles: true, cancelable: true,
            keyCode: key === 'Enter' ? 13 : (key === 'ArrowRight' ? 39 : (key === 'ArrowLeft' ? 37 : (key === 'ArrowUp' ? 38 : (key === 'ArrowDown' ? 40 : 0))))
          });
          (event as any).fromGamepad = true;
          window.dispatchEvent(event);
        };
        const checkDpad = (idx: number, key: string) => {
          const pressed = !!buttons[idx]?.pressed;
          if (pressed && !prevButtonsRef.current[idx]) dispatch(key);
          prevButtonsRef.current[idx] = pressed;
        };
        checkDpad(12, 'ArrowUp'); checkDpad(13, 'ArrowDown');
        checkDpad(14, 'ArrowLeft'); checkDpad(15, 'ArrowRight');
        const checkAxis = (axisIdx: number, posKey: string, negKey: string) => {
          const val = gp.axes[axisIdx];
          const prevVal = prevAxesRef.current[axisIdx] || 0;
          const threshold = 0.5;
          if (val > threshold && prevVal <= threshold) dispatch(posKey);
          else if (val < -threshold && prevVal >= -threshold) dispatch(negKey);
          prevAxesRef.current[axisIdx] = val;
        };
        checkAxis(1, 'ArrowDown', 'ArrowUp');
        checkAxis(0, 'ArrowRight', 'ArrowLeft');
        if (lastGpId.current !== gp.id) {
          lastGpId.current = gp.id;
          setGamepadInfo({ connected: true, name: gp.id, battery: 0.75 });
        }
        const checkButton = (idx: number, key: string) => {
          const pressed = !!buttons[idx]?.pressed;
          if (pressed && !prevButtonsRef.current[idx]) dispatch(key);
          prevButtonsRef.current[idx] = pressed;
        };
        checkButton(0, 'Enter');
        checkButton(1, 'Escape');
        checkButton(2, 'x');
        checkButton(3, 't'); // Triángulo -> Buscar
        checkButton(4, 'q');
        checkButton(5, 'e');
        checkButton(8, 's'); // Share/Create -> Menú contextual
        checkButton(9, 'Home');
      } else {
        if (lastGpId.current !== null) {
          lastGpId.current = null;
          setGamepadInfo({ connected: false, name: '', battery: 0 });
        }
      }
      rafId = requestAnimationFrame(poll);
    };
    if (Platform.OS === 'web') rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, []);

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

  // Keyboard Navigation
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleKeyDown = (e: any) => {
        if (!e.fromGamepad) setInputMode('keyboard');
        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) e.preventDefault();
        if (isLaunching) return;
        if (isDetailVisible || isLibraryDetailVisible) return;
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
        if (isSearchVisible) return;

        // Throttle rapid arrow key inputs (key repeats/fast tapping)
        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          const now = Date.now();
          if (now - lastNavTime.current < 130) {
            return;
          }
          lastNavTime.current = now;
        }

        // Profile Dropdown Menu Keyboard Navigation
        if (isProfileMenuOpen) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setIsProfileMenuOpen(false);
            soundService.playBack();
          } else if (e.key === 'ArrowDown') {
            setProfileMenuFocusIndex(prev => Math.min(prev + 1, 4));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            setProfileMenuFocusIndex(prev => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'Enter') {
            handleProfileMenuAction(profileMenuFocusIndex);
            soundService.playActivation();
          }
          return;
        }

        // Toggle Control Center via Home key
        if (e.key === 'Home') {
          soundService.playContextMenu();
          if (focusArea === 'header_user') {
            setFocusArea('main_carousel');
            setSystemNavCardExpanded(false);
          } else {
            setFocusArea('header_user');
            setModalSelectedIndex(0);
            setSystemNavCardIndex(0);
            setSystemNavLevel(1);
            setSystemNavCardExpanded(false);
          }
          soundService.playNavigation();
          return;
        }

        // Triángulo -> Buscar, desde cualquier parte del home
        if (e.key === 't' || e.key === 'T') {
          if (
            !isContextMenuOpen &&
            !isProfileMenuOpen &&
            !isAddModalVisible &&
            !isSettingsVisible &&
            !isUserModalVisible &&
            !isFavoritesVisible &&
            !isRandomSelectorVisible &&
            focusArea !== 'header_user'
          ) {
            soundService.playContextMenu();
            setFocusArea('header_avatar');
            setFocusIndex(0);
            setSearchVisible(true);
          }
          return;
        }

        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          soundService.playExitMenu();
          if (!isContextMenuOpen && !(focusArea === 'header_user')) {
            setFocusArea('main_carousel');
          }
        }

        if (e.key === 'o' || e.key === 'O') {
          if (!isLaunching) {
            const willBeVisible = !isAddModalVisible;
            setAddModalVisible(willBeVisible);
            if (willBeVisible) { setUserModalVisible(false); setSettingsVisible(false); setFavoritesVisible(false); setHomeBgModalVisible(false); }
          }
          return;
        }

        // 1. Context Menu Keyboard Navigation
        if (isContextMenuOpen) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setIsContextMenuOpen(false);
            soundService.playBack();
          } else if (e.key === 'ArrowDown') {
            setContextMenuFocusIndex(prev => Math.min(prev + 1, 2));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            setContextMenuFocusIndex(prev => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'Enter') {
            handleContextMenuAction(contextMenuFocusIndex);
            soundService.playActivation();
          }
          return;
        }

        // 2. Floating System Navigation Keyboard Navigation
        if (focusArea === 'header_user') {
          if (isSystemNavCardExpanded) {
            if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
              setSystemNavCardExpanded(false);
              soundService.playBack();
            }
            return;
          }

          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setFocusArea('main_carousel');
          } else if (e.key === 'ArrowUp') {
            if (systemNavLevel === 0) {
              setSystemNavLevel(1);
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowDown') {
            if (systemNavLevel === 1) {
              setSystemNavLevel(0);
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowRight') {
            if (systemNavLevel === 0) {
              setModalSelectedIndex(prev => Math.min(prev + 1, 10));
            } else {
              setSystemNavCardIndex(prev => Math.min(prev + 1, systemNavMaxCardIndex));
            }
            soundService.playNavigation();
          } else if (e.key === 'ArrowLeft') {
            if (systemNavLevel === 0) {
              setModalSelectedIndex(prev => Math.max(prev - 1, 0));
            } else {
              setSystemNavCardIndex(prev => Math.max(prev - 1, 0));
            }
            soundService.playNavigation();
          } else if (e.key === 'Enter') {
            if (systemNavLevel === 0) {
              handleSystemNavAction(modalSelectedIndex);
            } else {
              setSystemNavCardExpanded(true);
              soundService.playActivation?.();
            }
          }
          return;
        }

        // 3. Option Action Keys (Open Context Menu)
        if (e.key === 'x' || e.key === 'X' || e.key === 'm' || e.key === 'M' || e.key === 's' || e.key === 'S') {
          soundService.playContextMenu();
          if (focusArea === 'main_carousel') {
            const item = currentData[activeIndex];
            if (item && item.id !== 'more_library') {
              openContextMenu();
            }
          }
          return;
        }

        if (isSettingsVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') { setSettingsVisible(false); setFocusArea('header_user'); }
          else if (e.key === 'ArrowDown') {
            if (settingsFocusArea === 'sidebar') setSettingsFocusIndex(prev => Math.min(prev + 1, 4));
            else {
              let maxIdx = 1;
              if (settingsTab === 'profile') maxIdx = 2;
              else if (settingsTab === 'sync') maxIdx = 3;
              else if (settingsTab === 'home') {
                maxIdx = 5
                  + (activeUser?.settings?.capturePath ? 1 : 0)
                  + (activeUser?.settings?.wallpaperPath ? 1 : 0);
              }
              else if (settingsTab === 'support') maxIdx = 2;
              setSettingsFocusIndex(prev => Math.min(prev + 1, maxIdx));
            }
          } else if (e.key === 'ArrowUp') setSettingsFocusIndex(prev => Math.max(prev - 1, 0));
          else if (e.key === 'ArrowRight' && settingsFocusArea === 'sidebar') { setSettingsFocusArea('content'); setSettingsFocusIndex(0); }
          else if (e.key === 'ArrowLeft' && settingsFocusArea === 'content') {
            setSettingsFocusArea('sidebar');
            if (settingsTab === 'profile') setSettingsFocusIndex(0);
            else if (settingsTab === 'home') setSettingsFocusIndex(1);
            else if (settingsTab === 'sync') setSettingsFocusIndex(2);
            else if (settingsTab === 'support') setSettingsFocusIndex(3);
          } else if (e.key === 'Enter') {
            if (settingsFocusArea === 'sidebar') {
              if (settingsFocusIndex === 0) setSettingsTab('profile');
              else if (settingsFocusIndex === 1) setSettingsTab('home');
              else if (settingsFocusIndex === 2) setSettingsTab('sync');
              else if (settingsFocusIndex === 3) setSettingsTab('support');
              else if (settingsFocusIndex === 4) { setSettingsVisible(false); setUserModalVisible(true); }
            } else {
              if (settingsTab === 'profile') {
                if (settingsFocusIndex === 0) handleSelectAvatar();
                else if (settingsFocusIndex === 1) settingsNameRef.current?.focus();
              } else if (settingsTab === 'home') {
                if (settingsFocusIndex === 0) {
                  // Idioma
                  const currentIndex = LANGUAGE_OPTIONS.findIndex(
                    option => option.id === language
                  );

                  const nextIndex =
                    currentIndex >= 0
                      ? (currentIndex + 1) % LANGUAGE_OPTIONS.length
                      : 0;

                  changeLanguage(LANGUAGE_OPTIONS[nextIndex].id);

                } else if (settingsFocusIndex === 1) {
                  // Reproducción automática
                  updateUser({
                    settings: {
                      ...activeUser?.settings,
                      autoPlayVideo: !(
                        activeUser?.settings?.autoPlayVideo !== false
                      )
                    }
                  });

                } else if (settingsFocusIndex === 2) {
                  // Invertir transición
                  updateUser({
                    settings: {
                      ...activeUser?.settings,
                      invertTransitionDirection:
                        !activeUser?.settings?.invertTransitionDirection
                    }
                  });

                } else if (settingsFocusIndex === 3) {
                  // Fondo de pantalla
                  setSettingsVisible(false);
                  setHomeBgModalVisible(true);

                } else if (settingsFocusIndex === 4) {
                  // Carpeta de fondos
                  handleSelectWallpaperFolder();

                } else if (settingsFocusIndex === 5) {
                  // Carpeta de capturas
                  handleSelectCaptureFolder();

                } else if (
                  settingsFocusIndex === 6 &&
                  activeUser?.settings?.capturePath
                ) {
                  updateUser({
                    settings: {
                      ...activeUser?.settings,
                      capturePath: ''
                    } as any
                  });

                } else if (
                  settingsFocusIndex ===
                  (activeUser?.settings?.capturePath ? 7 : 6) &&
                  activeUser?.settings?.wallpaperPath
                ) {
                  updateUser({
                    settings: {
                      ...activeUser?.settings,
                      wallpaperPath: ''
                    } as any
                  });
                }
              } else if (settingsTab === 'sync') {
                const currentSync = activeUser?.settings?.syncPreferences || { ratingAndSummary: 'igdb', cover: 'steamgrid', background: 'steamgrid', logo: 'steamgrid' };
                if (settingsFocusIndex === 0) updateUser({ settings: { autoPlayVideo: activeUser?.settings?.autoPlayVideo ?? true, syncPreferences: { ...currentSync, ratingAndSummary: currentSync.ratingAndSummary === 'igdb' ? 'none' : 'igdb' } as any } });
                else if (settingsFocusIndex === 1) updateUser({ settings: { autoPlayVideo: activeUser?.settings?.autoPlayVideo ?? true, syncPreferences: { ...currentSync, cover: currentSync.cover === 'steamgrid' ? 'igdb' : (currentSync.cover === 'igdb' ? 'none' : 'steamgrid') } as any } });
                else if (settingsFocusIndex === 2) updateUser({ settings: { autoPlayVideo: activeUser?.settings?.autoPlayVideo ?? true, syncPreferences: { ...currentSync, background: currentSync.background === 'steamgrid' ? 'igdb' : (currentSync.background === 'igdb' ? 'none' : 'steamgrid') } as any } });
                else if (settingsFocusIndex === 3) updateUser({ settings: { autoPlayVideo: activeUser?.settings?.autoPlayVideo ?? true, syncPreferences: { ...currentSync, logo: currentSync.logo === 'steamgrid' ? 'none' : 'steamgrid' } as any } });
              } else if (settingsTab === 'support') {
                if (settingsFocusIndex === 0) Linking.openURL('https://patreon.com/WPS5');
                else if (settingsFocusIndex === 1) Linking.openURL('https://github.com/angelvc25/WPS5');
                else if (settingsFocusIndex === 2) Linking.openURL('https://youtube.com');
              }
            }
          }
          return;
        }
        if (selectedMediaIndex !== null) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setSelectedMediaIndex(null);
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            setSelectedMediaIndex(prev => prev !== null && prev < steamMedia.length - 1 ? prev + 1 : prev);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            setSelectedMediaIndex(prev => prev !== null && prev > 0 ? prev - 1 : prev);
          }
          return;
        }
        if (isAddModalVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') setAddModalVisible(false);
          else if (e.key === 'ArrowDown') {
            if (addModalFocusIndex === 0) setAddModalFocusIndex(1);
            else if (addModalFocusIndex >= 1 && addModalFocusIndex <= 3) setAddModalFocusIndex(newApp.type === 'game' ? 4 : 11);
            else if (addModalFocusIndex >= 4 && addModalFocusIndex <= 10) setAddModalFocusIndex(11);
            else if (addModalFocusIndex === 11) setAddModalFocusIndex(12);
            else if (addModalFocusIndex === 12) setAddModalFocusIndex(14);
            else if (addModalFocusIndex === 13) setAddModalFocusIndex(14);
          } else if (e.key === 'ArrowUp') {
            if (addModalFocusIndex === 14 || addModalFocusIndex === 13) setAddModalFocusIndex(12);
            else if (addModalFocusIndex === 12) setAddModalFocusIndex(11);
            else if (addModalFocusIndex === 11) setAddModalFocusIndex(newApp.type === 'game' ? 4 : 1);
            else if (addModalFocusIndex >= 4 && addModalFocusIndex <= 10) setAddModalFocusIndex(1);
            else if (addModalFocusIndex >= 1 && addModalFocusIndex <= 3) setAddModalFocusIndex(0);
          } else if (e.key === 'ArrowRight') {
            if (addModalFocusIndex >= 1 && addModalFocusIndex < 3) setAddModalFocusIndex(prev => prev + 1);
            else if (addModalFocusIndex >= 4 && addModalFocusIndex < 10) setAddModalFocusIndex(prev => prev + 1);
            else if (addModalFocusIndex === 13) setAddModalFocusIndex(14);
          } else if (e.key === 'ArrowLeft') {
            if (addModalFocusIndex > 1 && addModalFocusIndex <= 3) setAddModalFocusIndex(prev => prev - 1);
            else if (addModalFocusIndex > 4 && addModalFocusIndex <= 10) setAddModalFocusIndex(prev => prev - 1);
            else if (addModalFocusIndex === 14) setAddModalFocusIndex(13);
          } else if (e.key === 'Enter') {
            if (addModalFocusIndex === 0) addModalTitleRef.current?.focus();
            else if (addModalFocusIndex === 1) setNewApp({ ...newApp, type: 'game' });
            else if (addModalFocusIndex === 2) setNewApp({ ...newApp, type: 'media', platform: '' });
            else if (addModalFocusIndex === 3) setNewApp({ ...newApp, type: 'web', platform: '' });
            else if (addModalFocusIndex >= 4 && addModalFocusIndex <= 10) {
              const platforms = ['PC', 'PS5', 'Xbox', 'Switch', 'Steam', 'EA', 'Epic'];
              setNewApp({ ...newApp, platform: platforms[addModalFocusIndex - 4] });
            } else if (addModalFocusIndex === 11) { if (newApp.type === 'web') addModalPathRef.current?.focus(); else handleSelectExecutable(); }
            else if (addModalFocusIndex === 12) handleSelectImage();
            else if (addModalFocusIndex === 13) setAddModalVisible(false);
            else if (addModalFocusIndex === 14) handleSaveApp();
          }
          return;
        }
        if (isHomeBgModalVisible) return;
        if (isSearchVisible) return;
        if (isRandomSelectorVisible) { if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') setRandomSelectorVisible(false); return; }
        if (isFavoritesVisible) { if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') setFavoritesVisible(false); return; }

        // --- SPATIAL NAVIGATION ---
        if (e.key === 'ArrowRight') {
          soundService.playNavigation();
          if (focusArea === 'library_grid') {
            if (libraryTabsFocused) {
              if (libraryTab !== 'collection') { setLibraryTab('collection'); setLibraryGridFocusIndex(0); }
            } else {
              setLibraryGridFocusIndex(prev => Math.min(prev + 1, displayedLibraryGames.length - 1));
            }
          }
          else if (focusArea === 'header_avatar') {
            if (focusIndex < 2) setFocusIndex(prev => prev + 1);
          }
          else if (focusArea === 'main_carousel') { const nextIdx = Math.min(activeIndex + 1, currentData.length - 1); setActiveIndex(nextIdx); setFocusIndex(nextIdx); }
          else if (focusArea === 'header_tabs') {
            if (focusIndex < TABS.length - 1) {
              const nextIdx = focusIndex + 1;
              setFocusIndex(nextIdx);
            } else {
              // Último tab → pasar a los iconos de la derecha (buscar)
              setFocusArea('header_avatar');
              setFocusIndex(0);
            }
          }
          else if (focusArea === 'game_panel') {
            if (activeItem?.id === '5') {
              const storeDeals = storeOffers.filter(o => o.type === 'offer');
              const storeUpcoming = storeOffers.filter(o => o.type === 'release');
              if (gamePanelFocusIndex < 10) {
                // Deals row
                const nextIdx = Math.min(gamePanelFocusIndex + 1, storeDeals.length - 1);
                setGamePanelFocusIndex(nextIdx);
              } else if (gamePanelFocusIndex >= 10 && gamePanelFocusIndex < 20) {
                // Upcoming row
                const nextIdx = Math.min(gamePanelFocusIndex + 1, 10 + storeUpcoming.length - 1);
                setGamePanelFocusIndex(nextIdx);
              }
            } else {
              if (gamePanelFocusIndex === 0) {
                setGamePanelFocusIndex(1);
              } else if (gamePanelFocusIndex === 2) {
                setGamePanelFocusIndex(3);
              } else if (gamePanelFocusIndex >= 100) {
                setGamePanelFocusIndex(prev => Math.min(prev + 1, 100 + steamMedia.length - 1));
              } else if (gamePanelFocusIndex >= 4) {
                const panelItem = currentData[activeIndex];
                const isMediaPanelItem = panelItem?.type === 'media' || panelItem?.type === 'web' || panelItem?.title?.toLowerCase().includes('spotify');
                if (!(isMediaPanelItem && gamePanelFocusIndex === 4)) {
                  setGamePanelFocusIndex(prev => Math.min(prev + 1, 4 + steamNews.length - 1));
                }
              }
            }
          }
          else if (focusArea === 'welcome_widgets') {
            if (focusIndex < 4) setFocusIndex(prev => prev + 1);
            else if (focusIndex >= 5 && focusIndex < 9) setFocusIndex(prev => prev + 1);
          }
          else if (focusArea === 'welcome_toolbar') {
            if (toolbarFocusIndex < 3) setToolbarFocusIndex(prev => prev + 1);
          }
          return;
        }
        if (e.key === 'ArrowLeft') {
          soundService.playNavigation();
          if (focusArea === 'library_grid') {
            if (libraryTabsFocused) {
              if (libraryTab !== 'installed') { setLibraryTab('installed'); setLibraryGridFocusIndex(0); }
            } else {
              setLibraryGridFocusIndex(prev => Math.max(prev - 1, 0));
            }
          }
          else if (focusArea === 'main_carousel') { const nextIdx = Math.max(activeIndex - 1, 0); setActiveIndex(nextIdx); setFocusIndex(nextIdx); }
          else if (focusArea === 'header_tabs') {
            const nextIdx = Math.max(focusIndex - 1, 0);
            setFocusIndex(nextIdx);
          }
          else if (focusArea === 'header_avatar') {
            if (focusIndex > 0) {
              setFocusIndex(prev => prev - 1);
            } else {
              setFocusArea('header_tabs');
              setFocusIndex(TABS.indexOf(activeTab));
            }
          }
          else if (focusArea === 'game_panel') {
            if (activeItem?.id === '5') {
              if (gamePanelFocusIndex < 10) {
                // Deals row
                const nextIdx = Math.max(gamePanelFocusIndex - 1, 0);
                setGamePanelFocusIndex(nextIdx);
              } else if (gamePanelFocusIndex >= 10 && gamePanelFocusIndex < 20) {
                // Upcoming row
                const nextIdx = Math.max(gamePanelFocusIndex - 1, 10);
                setGamePanelFocusIndex(nextIdx);
              }
            } else {
              if (gamePanelFocusIndex === 1) {
                setGamePanelFocusIndex(0);
              } else if (gamePanelFocusIndex === 3) {
                setGamePanelFocusIndex(2);
              } else if (gamePanelFocusIndex >= 100) {
                setGamePanelFocusIndex(prev => Math.max(prev - 1, 100));
              } else if (gamePanelFocusIndex >= 4) {
                const panelItem = currentData[activeIndex];
                const isMediaPanelItem = panelItem?.type === 'media' || panelItem?.type === 'web' || panelItem?.title?.toLowerCase().includes('spotify');
                if (!(isMediaPanelItem && gamePanelFocusIndex === 4)) {
                  setGamePanelFocusIndex(prev => Math.max(prev - 1, 4));
                }
              }
            }
          }
          else if (focusArea === 'welcome_widgets') {
            if (focusIndex > 0 && focusIndex <= 4) setFocusIndex(prev => prev - 1);
            else if (focusIndex > 5 && focusIndex <= 9) setFocusIndex(prev => prev - 1);
          }
          else if (focusArea === 'welcome_toolbar') {
            if (toolbarFocusIndex > 0) setToolbarFocusIndex(prev => prev - 1);
          }
          return;
        }
        if (e.key === 'ArrowDown') {
          soundService.playNavigation();
          if (focusArea === 'library_grid') {
            if (libraryTabsFocused) {
              setLibraryTabsFocused(false);
              setLibraryGridFocusIndex(0);
            } else {
              setLibraryGridFocusIndex(prev => Math.min(prev + 5, displayedLibraryGames.length - 1));
            }
          }
          else if (focusArea === 'header_avatar') {
            // Bajar desde los iconos globales siempre regresa a Games (inicio)
            setActiveTab('Games');
            setActiveIndex(0);
            setFocusArea('main_carousel');
            setFocusIndex(0);
          }
          else if (focusArea === 'header_tabs') { setFocusArea('main_carousel'); setFocusIndex(activeIndex); }
          else if (focusArea === 'main_carousel') {
            if (activeItem?.id === 'more_library') {
              setFocusArea('library_grid');
              setLibraryTabsFocused(true);
              setLibraryGridFocusIndex(0);
            } else if (activeItem?.id === '1') {
              setFocusArea('welcome_widgets');
              setFocusIndex(0);
            } else if (canPlay) {
              setFocusArea('game_panel');
              setGamePanelFocusIndex(0);
            }
          }
          else if (focusArea === 'game_panel') {
            if (activeItem?.id === '5') {
              const storeDeals = storeOffers.filter(o => o.type === 'offer');
              const storeUpcoming = storeOffers.filter(o => o.type === 'release');
              if (gamePanelFocusIndex < 10) {
                // Moving down from Deals row
                if (storeUpcoming.length > 0) {
                  const targetCol = Math.min(gamePanelFocusIndex, storeUpcoming.length - 1);
                  setGamePanelFocusIndex(10 + targetCol);
                } else {
                  setGamePanelFocusIndex(20);
                }
              } else if (gamePanelFocusIndex >= 10 && gamePanelFocusIndex < 20) {
                // Moving down from Upcoming row to footer
                setGamePanelFocusIndex(20);
              }
            } else {
              if (gamePanelFocusIndex === 0) {
                setGamePanelFocusIndex(2);
              } else if (gamePanelFocusIndex === 1) {
                setGamePanelFocusIndex(3);
              } else if (gamePanelFocusIndex === 2 || gamePanelFocusIndex === 3) {
                const panelItem = currentData[activeIndex];
                const isMediaPanelItem = panelItem?.type === 'media' || panelItem?.type === 'web' || panelItem?.title?.toLowerCase().includes('spotify');
                if (isMediaPanelItem) {
                  setGamePanelFocusIndex(4);
                } else if (steamMedia.length > 0) {
                  setGamePanelFocusIndex(100);
                } else if (steamNews.length > 0) {
                  setGamePanelFocusIndex(4);
                }
              } else if (gamePanelFocusIndex >= 100) {
                if (steamNews.length > 0) {
                  setGamePanelFocusIndex(4);
                }
              }
            }
          }
          else if (focusArea === 'welcome_widgets') {
            if (focusIndex < 5) setFocusIndex(prev => prev + 5);
          }
          else if (focusArea === 'welcome_toolbar') {
            setFocusArea('welcome_widgets');
            setFocusIndex(0);
          }
          return;
        }
        if (e.key === 'ArrowUp') {
          soundService.playNavigation();
          if (focusArea === 'library_grid') {
            if (libraryTabsFocused) {
              setFocusArea('main_carousel');
              setLibraryTabsFocused(false);
            } else if (libraryGridFocusIndex < 5) {
              setLibraryTabsFocused(true);
            } else {
              setLibraryGridFocusIndex(prev => Math.max(prev - 5, 0));
            }
          }
          else if (focusArea === 'game_panel') {
            if (activeItem?.id === '5') {
              const storeDeals = storeOffers.filter(o => o.type === 'offer');
              const storeUpcoming = storeOffers.filter(o => o.type === 'release');
              if (gamePanelFocusIndex === 20) {
                if (storeUpcoming.length > 0) {
                  setGamePanelFocusIndex(10);
                } else {
                  setGamePanelFocusIndex(0);
                }
              } else if (gamePanelFocusIndex >= 10 && gamePanelFocusIndex < 20) {
                const col = gamePanelFocusIndex - 10;
                const targetCol = Math.min(col, storeDeals.length - 1);
                setGamePanelFocusIndex(targetCol);
              } else if (gamePanelFocusIndex < 10) {
                setFocusArea('main_carousel');
                setFocusIndex(activeIndex);
              }
            } else {
              if (gamePanelFocusIndex === 0 || gamePanelFocusIndex === 1) {
                setFocusArea('main_carousel');
                setFocusIndex(activeIndex);
              } else if (gamePanelFocusIndex === 2) {
                setGamePanelFocusIndex(0);
              } else if (gamePanelFocusIndex === 3) {
                setGamePanelFocusIndex(1);
              } else if (gamePanelFocusIndex >= 100) {
                setGamePanelFocusIndex(2);
              } else if (gamePanelFocusIndex >= 4) {
                const panelItem = currentData[activeIndex];
                const isMediaPanelItem = panelItem?.type === 'media' || panelItem?.type === 'web' || panelItem?.title?.toLowerCase().includes('spotify');
                if (isMediaPanelItem && gamePanelFocusIndex === 4) {
                  setGamePanelFocusIndex(2);
                } else if (steamMedia.length > 0) {
                  setGamePanelFocusIndex(100);
                } else {
                  const newsIndex = gamePanelFocusIndex - 4;
                  setGamePanelFocusIndex(newsIndex % 2 === 0 ? 2 : 3);
                }
              }
            }
          }
          else if (focusArea === 'main_carousel') { setFocusArea('header_tabs'); setFocusIndex(TABS.indexOf(activeTab)); }
          else if (focusArea === 'header_tabs') { setFocusArea('header_avatar'); setFocusIndex(0); }
          else if (focusArea === 'welcome_widgets') {
            if (focusIndex >= 5) {
              setFocusIndex(prev => prev - 5);
            } else {
              setFocusArea('welcome_toolbar');
              setToolbarFocusIndex(2);
            }
          }
          else if (focusArea === 'welcome_toolbar') {
            setFocusArea('main_carousel');
            setFocusIndex(activeIndex);
          }
          return;
        }
        if (e.key === 'Enter') {
          soundService.playActivation();
          if (focusArea === 'header_tabs') {
            setActiveTab(TABS[focusIndex].id);
            setActiveIndex(0);
            setFocusArea('main_carousel');
            return;
          }
          if (focusArea === 'header_avatar') {
            if (focusIndex === 0) {
              setSearchVisible(true);
            } else if (focusIndex === 1) {
              setUserModalVisible(false);
              setSettingsVisible(true);
            } else if (focusIndex === 2) {
              setIsProfileMenuOpen(true);
              setProfileMenuFocusIndex(0);
            }
            return;
          }
          if (focusArea === 'library_grid') {
            if (libraryTabsFocused) { return; } // usa ←/→ para cambiar de pestaña
            const game = displayedLibraryGames[libraryGridFocusIndex];
            if (game) { setSelectedItem(game); setDetailVisible(true); }
            return;
          }
          if (focusArea === 'game_panel') {
            if (activeItem?.id === '5') {
              const storeDeals = storeOffers.filter(o => o.type === 'offer');
              const storeUpcoming = storeOffers.filter(o => o.type === 'release');
              if (gamePanelFocusIndex < 10) {
                const deal = storeDeals[gamePanelFocusIndex];
                if (deal && deal.url) {
                  Linking.openURL(deal.url);
                }
              } else if (gamePanelFocusIndex >= 10 && gamePanelFocusIndex < 20) {
                const item = storeUpcoming[gamePanelFocusIndex - 10];
                if (item && item.url) {
                  Linking.openURL(item.url);
                }
              } else if (gamePanelFocusIndex === 20) {
                Linking.openURL('https://store.playstation.com');
              }
            } else {
              if (gamePanelFocusIndex === 0) {
                if (activeItem) { handleLaunchApp(activeItem); }
              } else if (gamePanelFocusIndex === 1) {
                if (activeItem) {
                  const target = activeItem.isLastPlayed ? lastPlayedGame : activeItem;
                  if (target) {
                    setSelectedItem(target);
                    setDetailVisible(true);
                  } else {
                    alert('Aún no has jugado a ningún juego.');
                  }
                }
              } else if (gamePanelFocusIndex >= 100) {
                const mediaItem = steamMedia[gamePanelFocusIndex - 100];
                if (mediaItem) {
                  setSelectedMediaIndex(gamePanelFocusIndex - 100);
                }
              } else if (gamePanelFocusIndex === 4) {
                const panelItem = currentData[activeIndex];
                const isMediaPanelItem = panelItem?.type === 'media' || panelItem?.type === 'web' || panelItem?.title?.toLowerCase().includes('spotify');
                if (!isMediaPanelItem) {
                  const newsItem = steamNews[gamePanelFocusIndex - 4];
                  if (newsItem && newsItem.url) {
                    Linking.openURL(newsItem.url);
                  }
                }
              } else if (gamePanelFocusIndex > 4) {
                const newsItem = steamNews[gamePanelFocusIndex - 4];
                if (newsItem && newsItem.url) {
                  Linking.openURL(newsItem.url);
                }
              }
            }
            return;
          }
          if (focusArea === 'welcome_toolbar') {
            if (toolbarFocusIndex === 2) setHomeBgModalVisible(true);
            else if (toolbarFocusIndex === 3) setSettingsVisible(true);
            return;
          }
          if (focusArea === 'welcome_widgets') {
            if (focusIndex === 2) {
              Linking.openURL('https://store.playstation.com');
            } else if (focusIndex === 4) {
              setAddModalVisible(true);
            } else if (focusIndex === 5 && lastPlayedGame) {
              handleLaunchApp(lastPlayedGame);
            } else if (focusIndex === 9) {
              setHomeBgModalVisible(true);
            }
            return;
          }
          if (focusArea === 'main_carousel') {
            const item = currentData[activeIndex];
            if (item) {
              if (item.id === 'more_library') return;
              if (item.isFolder || item.isGrid) { setFavoritesVisible(true); return; }
              if (activeTab === 'Games' && activeIndex === 0) { setHomeBgModalVisible(true); return; }
              if (item.isLastPlayed) {
                if (lastPlayedGame) { handleLaunchApp(lastPlayedGame); }
                else alert('Aún no has jugado a ningún juego.');
              } else { handleLaunchApp(item); }
            }
          }
          return;
        }
        if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
          soundService.playTab();
          const direction = (e.key === 'q' || e.key === 'Q') ? -1 : 1;
          setActiveTab(prev => {
            const idx = TABS.findIndex(t => t.id === prev);
            const nextIdx = idx + direction;
            if (nextIdx >= 0 && nextIdx < TABS.length) {
              setActiveIndex(0);
              if (focusArea === 'header_tabs') setFocusIndex(nextIdx);
              return TABS[nextIdx].id;
            }
            return prev;
          });
        }
        if (e.key === 'b' || e.key === 'B' || e.key === 'Escape') {
          soundService.playBack();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeTab, currentData, activeIndex, focusArea, focusIndex, gamePanelFocusIndex, isAddModalVisible, isUserModalVisible, isFavoritesVisible, selectedItem, modalSelectedIndex, addModalFocusIndex, settingsFocusArea, settingsFocusIndex, settingsTab, isHomeBgModalVisible, isSearchVisible, homeBackground, newApp, steamNews, steamMedia, selectedMediaIndex, isProfileMenuOpen, profileMenuFocusIndex, isOnline, isLaunching, isContextMenuOpen, isDetailVisible, isLibraryDetailVisible, isSettingsVisible, isRandomSelectorVisible, systemNavLevel, systemNavCardIndex, isSystemNavCardExpanded, systemNavMaxCardIndex, libraryGridFocusIndex, libraryTabsFocused, displayedLibraryGames, lastPlayedGame, activeUser, storeOffers, toolbarFocusIndex]);

  // Fetch Steam news when the active item changes (debounced)
  useEffect(() => {
    const item = currentData[activeIndex];
    const playable = item && !item.isFolder && !item.isGrid && item.id !== '1';
    if (!playable) { setSteamNews([]); return; }
    const title = item.isLastPlayed ? (lastPlayedGame?.title || '') : (item.title || '');
    if (!title || title === 'Último Jugado') { setSteamNews([]); return; }
    setNewsLoading(true);
    setSteamNews([]);
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchSteamNewsByName(title).then(news => {
        if (!cancelled) { setSteamNews(news); setNewsLoading(false); }
      });
    }, 400); // 400ms debounce
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeIndex, currentRenderedTab, lastPlayedGame?.id]);

  // Fetch Steam screenshots & trailers when the active item changes (debounced)
  useEffect(() => {
    const item = currentData[activeIndex];
    const playable = item && !item.isFolder && !item.isGrid && item.id !== '1';
    if (!playable) { setSteamMedia([]); return; }
    const title = item.isLastPlayed ? (lastPlayedGame?.title || '') : (item.title || '');
    if (!title || title === 'Último Jugado') { setSteamMedia([]); return; }
    setMediaLoading(true);
    setSteamMedia([]);
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchSteamMediaByName(title).then(({ items }) => {
        if (!cancelled) { setSteamMedia(items); setMediaLoading(false); }
      });
    }, 400); // 400ms debounce
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeIndex, currentRenderedTab, lastPlayedGame?.id]);

  // Auto-scroll main vertical scrollview when focus moves to lower sections
  useEffect(() => {
    if (!mainScrollRef.current) return;
    if (focusArea === 'library_grid') {
      mainScrollRef.current.scrollTo({ y: 0, animated: true });
    } else if (focusArea === 'welcome_widgets') {
      mainScrollRef.current.scrollTo({ y: windowHeight * 0.35, animated: true });
    } else if (focusArea !== 'game_panel') {
      mainScrollRef.current.scrollTo({ y: 0, animated: true });
    } else {
      if (gamePanelFocusIndex === 0 || gamePanelFocusIndex === 1) {
        mainScrollRef.current.scrollTo({ y: 0, animated: true });
      } else if (gamePanelFocusIndex === 2 || gamePanelFocusIndex === 3) {
        mainScrollRef.current.scrollTo({ y: 220, animated: true });
      } else if (gamePanelFocusIndex >= 100) {
        mainScrollRef.current.scrollTo({ y: 480, animated: true });
      } else if (gamePanelFocusIndex >= 4) {
        mainScrollRef.current.scrollTo({ y: 700, animated: true });
      }
    }
  }, [focusArea, gamePanelFocusIndex, libraryGridFocusIndex]);

  // Auto-scroll media horizontal scrollview when navigating through media cards
  useEffect(() => {
    if (focusArea === 'game_panel' && gamePanelFocusIndex >= 100 && mediaScrollRef.current) {
      const mediaIndex = gamePanelFocusIndex - 100;
      const cardWidth = 500 + 16;
      mediaScrollRef.current.scrollTo({ x: mediaIndex * cardWidth, animated: true });
    }
  }, [gamePanelFocusIndex, focusArea]);

  // Auto-scroll news horizontal scrollview when navigating through news cards
  useEffect(() => {
    if (focusArea === 'game_panel' && gamePanelFocusIndex >= 4 && gamePanelFocusIndex < 100 && newsScrollRef.current) {
      const newsIndex = gamePanelFocusIndex - 4;
      const cardWidth = 500;
      const gap = 16;
      const scrollX = newsIndex * (cardWidth + gap);
      newsScrollRef.current.scrollTo({ x: scrollX, animated: true });
    }
    // Reset news scroll when focus leaves the news row
    if (focusArea === 'game_panel' && gamePanelFocusIndex >= 100 && newsScrollRef.current) {
      newsScrollRef.current.scrollTo({ x: 0, animated: true });
    }
  }, [gamePanelFocusIndex, focusArea]);

  // Auto-scroll welcome widgets horizontal scrollview when focus moves
  useEffect(() => {
    if (focusArea === 'welcome_widgets' && widgetScrollRef.current) {
      const colIndex = focusIndex % 5;
      const cardWidth = (windowWidth - 40) / 5;
      const gap = 10;
      const scrollX = colIndex * (cardWidth + gap);
      widgetScrollRef.current.scrollTo({ x: scrollX, animated: true });
    }
  }, [focusIndex, focusArea, windowWidth]);

  // Auto-scroll carousel
  useEffect(() => {
    if (scrollRef.current) {
      const scrollX = activeIndex * ITEM_WIDTH;
      scrollRef.current.scrollTo({ x: scrollX, animated: true });
    }
  }, [activeIndex, currentRenderedTab, ITEM_WIDTH]);
  const handleLaunchApp = (item: ConsoleItem) => {
    if (!item) return;
    if (item.isLastPlayed && !lastPlayedGame) {
      alert('Aún no has jugado a ningún juego.');
      return;
    }
    const targetItem = item.isLastPlayed ? lastPlayedGame! : item;
    if (!targetItem) return;
    const launchPath = resolveSteamLaunchPath(targetItem, installedSteamAppIds);
    if (!launchPath) {
      setSelectedItem(targetItem);
      setDetailVisible(true);
      return;
    }
    if (launchPath.startsWith('http')) {
      if (Platform.OS === 'web' && (window as any).electronAPI) {
        (window as any).electronAPI.launchApp(targetItem.id, launchPath).then(() => loadApps());
      } else {
        Linking.openURL(launchPath);
      }
      return;
    }
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      setLaunchingItem(targetItem);
      setIsLaunching(true);
      (window as any).electronAPI.launchApp(targetItem.id, launchPath).then((result: any) => {
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
        setFavoritesVisible(false);
        setRandomSelectorVisible(false);

        // Si el launcher no se suspendió (URLs, .url, etc), limpiar estado tras delay
        if (!result?.suspended) {
          setTimeout(() => {
            setIsLaunching(false);
            setLaunchingItem(null);
          }, 5000);
        }
        // Si se suspendió, el evento 'game-closed' se encarga de restaurar
      });
    }
  };

  // Escuchar evento game-closed del proceso principal (launcher resume tras cerrar juego)
  useEffect(() => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.onGameClosed) {
      (window as any).electronAPI.onGameClosed((id: string) => {
        console.log('Juego cerrado, restaurando launcher:', id);
        soundService.playBackground();
        setIsLaunching(false);
        setLaunchingItem(null);
        loadApps();
      });
      return () => {
        (window as any).electronAPI?.removeGameClosedListener?.();
      };
    }
  }, []);

  const handleAppPress = (index: number, item: ConsoleItem) => {
    setFocusArea('main_carousel');
    setActiveIndex(index);
    setFocusIndex(index);
    if (activeIndex === index) {
      if (item.id === 'more_library') return;
      if (activeTab === 'Games' && index === 0) { setHomeBgModalVisible(true); return; }
      if (item.isFolder || item.isGrid) { setFavoritesVisible(true); return; }
      if (item.isLastPlayed) {
        if (lastPlayedGame) { handleLaunchApp(lastPlayedGame); }
        else alert(t('lastPlayed.noGamesYet'));
        return;
      }
      if (!item.isGrid) { handleLaunchApp(item); }
    }
  };

  const handleSelectExecutable = async () => {
    if ((window as any).electronAPI) {
      const path = await (window as any).electronAPI.selectFile();
      if (path) {
        const filename = path.split(/[\\\/]/).pop() || '';
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
        setNewApp({ ...newApp, path, title: newApp.title || nameWithoutExt });
      }
    }
  };

  const handleSelectImage = async () => {
    if ((window as any).electronAPI) {
      const img = await (window as any).electronAPI.selectImage();
      if (img) setNewApp({ ...newApp, image: img });
    }
  };

  const handleSaveApp = async () => {
    if ((window as any).electronAPI && newApp.title && newApp.path) {
      setIsSaving(true);
      let appToSave = { ...newApp };
      if (!appToSave.image && appToSave.type === 'game') {
        try {
          const res = await (window as any).electronAPI.fetchSteamGridData(appToSave.title);
          if (res.success && res.data) {
            if (res.data.grid) appToSave.image = res.data.grid;
            if (res.data.hero) (appToSave as any).backgroundImage = res.data.hero;
            if (res.data.logo) (appToSave as any).logo = res.data.logo;
          }
        } catch (error) { console.error('Error fetching SteamGrid data:', error); }
      }
      await (window as any).electronAPI.saveApp(appToSave);
      setIsSaving(false);
      setAddModalVisible(false);
      setNewApp({ title: '', path: '', image: '', type: 'game', platform: '' });
      loadApps();
    } else { alert(t('add.completeFields')); }
  };

  const handleApplyHomeBg = (uri: string) => {
    setHomeBackground({ uri });
    localStorage.setItem('home_background', uri);
  };

  const handleSelectHomeBg = async () => {
    setHomeBgModalVisible(true);
  };

  const handleSelectWallpaperFolder = async () => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.selectCaptureFolder) {
      const folderPath = await (window as any).electronAPI.selectCaptureFolder();
      if (folderPath) {
        updateUser({ settings: { ...activeUser?.settings, wallpaperPath: folderPath } as any });
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

  const handleSelectAvatar = async () => {
    if ((window as any).electronAPI) {
      const img = await (window as any).electronAPI.selectImage();
      if (img) { const avatarUri = `local-file:///${img.replace(/\\/g, '/')}`; updateUser({ avatar: avatarUri }); }
    }
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

    const GLOBAL_STEAM_API_KEY = process.env.EXPO_PUBLIC_STEAM_API_KEY || 'TU_API_KEY_AQUI';
    if (!isCurrentlyUsingSteam && activeUser?.settings?.steamId) {
      await fetchSteamAvatar(GLOBAL_STEAM_API_KEY, activeUser.settings.steamId);
    }
  };

  const currentBg = (currentRenderedTab === 'Games' && activeIndex === 1)
    ? (homeBackground || require('@/assets/images/FondoDefault2.jpg'))
    : (currentData[activeIndex]?.isLastPlayed ? lastPlayedGame?.backgroundImage : (currentData[activeIndex]?.backgroundImage || require('@/assets/images/FondoDefault2.jpg')));
  const currentBackgroundVideo =
    currentRenderedTab === 'Games' && activeIndex === 0
      ? currentData[activeIndex]?.backgroundVideo
      : null;

  const prevActiveIndexRef = useRef(activeIndex);
  const wipeDirection = useSharedValue<1 | -1>(1);

  useEffect(() => {
    if (activeIndex !== prevActiveIndexRef.current) {
      const normalDirection = activeIndex > prevActiveIndexRef.current ? 1 : -1;
      const invert = activeUser?.settings?.invertTransitionDirection === true;
      wipeDirection.value = (invert ? -1 * normalDirection : normalDirection) as (1 | -1);
      prevActiveIndexRef.current = activeIndex;
    }
  }, [activeIndex, activeUser?.settings?.invertTransitionDirection]);

  useEffect(() => {
    // If it's the very first time setting the background, do it immediately without delay
    if (!bgA && !bgB) {
      setBgA(currentBg);
      return;
    }

    if (activeLayer === 'A') {
      if (currentBg !== bgA) {
        setBgB(currentBg);
        setActiveLayer('B');
        fade.value = withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) });
      }
    } else {
      if (currentBg !== bgB) {
        setBgA(currentBg);
        setActiveLayer('A');
        fade.value = withTiming(0, { duration: 600, easing: Easing.inOut(Easing.quad) });
      }
    }
  }, [currentBg]);

  useEffect(() => { if (currentBg && !bgA && !bgB) setBgA(currentBg); }, []);

  const animatedStyleA = useAnimatedStyle(() => {
    const progress = 1 - fade.value;
    const dir = wipeDirection.value;
    // Para un desvanecimiento muy suave, ampliamos el borde de transición a 100%.
    // p va desde -100 hasta 150 (rango de 250).
    const p = progress * 250 - 100;
    // dir === 1 (moved right) -> wave starts from left (0%)
    // dir === -1 (moved left) -> wave starts from right (100%)
    const originX = dir === 1 ? '0%' : '100%';
    const maskStr = `radial-gradient(circle at ${originX} 50%, black ${p}%, transparent ${p + 100}%)`;

    return {
      zIndex: activeLayer === 'A' ? 1 : 0,
      opacity: Platform.OS === 'web' ? 1 : progress, // Fallback for native
      transform: [{ scale: interpolate(progress, [0, 1], [1.04, 1]) }],
      ...(Platform.OS === 'web' ? {
        WebkitMaskImage: activeLayer === 'A' ? maskStr : 'none',
        maskImage: activeLayer === 'A' ? maskStr : 'none',
      } : {})
    };
  });

  const animatedStyleB = useAnimatedStyle(() => {
    const progress = fade.value;
    const dir = wipeDirection.value;
    const p = progress * 250 - 100;
    const originX = dir === 1 ? '0%' : '100%';
    const maskStr = `radial-gradient(circle at ${originX} 50%, black ${p}%, transparent ${p + 100}%)`;

    return {
      zIndex: activeLayer === 'B' ? 1 : 0,
      opacity: Platform.OS === 'web' ? 1 : progress,
      transform: [{ scale: interpolate(progress, [0, 1], [1.04, 1]) }],
      ...(Platform.OS === 'web' ? {
        WebkitMaskImage: activeLayer === 'B' ? maskStr : 'none',
        maskImage: activeLayer === 'B' ? maskStr : 'none',
      } : {})
    };
  });

  // Get the active item info for the bottom panel
  const activeItem = currentData[activeIndex];
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

  const startX = useSharedValue(140);
  const startY = useSharedValue(187);
  const startW = useSharedValue(180);
  const startH = useSharedValue(180);

  useDerivedValue(() => {
    if (collapseAnim.value === 0) {
      const measurement = measure(activeCardRef);
      if (measurement) {
        startX.value = measurement.pageX;
        startY.value = measurement.pageY;
        startW.value = measurement.width;
        startH.value = measurement.height;
      }
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
      <View style={StyleSheet.absoluteFill}>

        {/* VIDEO DE FONDO */}
        {currentBackgroundVideo ? (
          <Video
            source={currentBackgroundVideo}
            style={StyleSheet.absoluteFillObject}
            resizeMode={ResizeMode.STRETCH}
            shouldPlay
            isLooping
            isMuted
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
            <Animated.View style={[StyleSheet.absoluteFill, animatedStyleA]}>
              {bgA && (
                <Image
                  source={bgA}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                />
              )}
            </Animated.View>

            <Animated.View style={[StyleSheet.absoluteFill, animatedStyleB]}>
              {bgB && (
                <Image
                  source={bgB}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                />
              )}
            </Animated.View>
          </>
        )}
      </View>

      {/* === GRADIENT OVERLAY (PS5 style: dark on left, transparent on right) === */}
      <View style={styles.gradientOverlay} pointerEvents="none" />
      <View style={styles.gradientOverlayTop} pointerEvents="none" />

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
          />
        </View>
      )}

      {/* MINI HEADER FOR GAME PANEL FOCUS */}
      <Animated.View style={[styles.miniHeader, topBarMiniStyle]} pointerEvents="none">
        {focusArea === 'library_grid' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={require('@/assets/images/Libreria.jpeg')} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 12, opacity: 0 }} />
            <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '200', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>Biblioteca de juegos</Text>
          </View>
        ) : (focusArea === 'welcome_widgets' || focusArea === 'welcome_toolbar') ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={currentData[activeIndex]?.image} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 12, opacity: 0 }} contentFit="cover" />
            <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '200', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>Welcome</Text>
          </View>
        ) : (canPlay && activeItem && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={activeItem.isLastPlayed ? (lastPlayedGame?.image ?? activeItem.image) : activeItem.image} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 12, opacity: 0 }} />
            <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '200', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>{displayTitle}</Text>
          </View>
        ))}
      </Animated.View>

      {/* MINI TOOLBAR — visible when welcome widgets are focused (PS5 style) */}
      <Animated.View style={[styles.miniHeaderToolbar, topBarMiniStyle]}>
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
                    if (idx === 2) setHomeBgModalVisible(true);
                    else if (idx === 3) setSettingsVisible(true);
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
      <Animated.View style={[styles.header, headerStyle]}>
        {/* Left: Navigation Tabs */}
        <View style={styles.headerLeft}>
          {/* <ControlPrompt btn="L" label="" inputMode={inputMode} /> */}
          {TABS.map((tab, idx) => (
            <TouchableOpacity
              key={tab.id}
              id={`tab-${tab.id.toLowerCase()}`}
              onPress={(e) => {
                (e.currentTarget as any)?.blur?.();
                setActiveTab(tab.id);
                setActiveIndex(0);
                setFocusArea('main_carousel');
              }}
              activeOpacity={0.7}
              style={styles.tabTouchable}
            >
              <Text style={[
                styles.navItem,
                activeTab === tab.id && styles.navItemActive,
                (focusArea === 'header_tabs' && focusIndex === idx) && styles.tabFocused
              ]}>
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
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
                  <Image source={{ uri: (activeUser?.settings?.useSteamAvatar && activeUser?.steamAvatarUrl) ? activeUser.steamAvatarUrl : ((activeUser as any).avatarBase64 || activeUser.avatar) }} style={styles.avatar} />
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

          <Text style={styles.timeText2}>{currentTime}</Text>
        </View>
      </Animated.View>

      {/* === MAIN SCROLLABLE CONTENT === */}
      <Animated.ScrollView
        ref={mainScrollRef}
        style={[styles.mainContent, animatedTabContentStyle]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={mainScrollContentStyle}
        scrollEventThrottle={16}
      >
        {/* CAROUSEL ROW */}
        <Animated.View style={[styles.carouselSection, carouselStyle]}>
          <ConsoleCarousel
            currentData={currentData}
            activeIndex={activeIndex}
            carouselKey={carouselKey}
            lastPlayedGame={lastPlayedGame}
            focusArea={focusArea}
            isContextMenuOpen={isContextMenuOpen}
            activeCardRef={activeCardRef}
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
            games={displayedLibraryGames}
            activeTab={libraryTab}
            onTabChange={(tab) => { setLibraryTab(tab); setLibraryGridFocusIndex(0); setLibraryTabsFocused(false); }}
            isLoading={loadingSteam}
            isFocused={focusArea === 'library_grid'}
            gridActive={focusArea === 'library_grid' && !libraryTabsFocused}
            tabsFocused={focusArea === 'library_grid' && libraryTabsFocused}
            focusedIndex={libraryGridFocusIndex}
            onItemPress={(index, game) => { setSelectedItem(game); setDetailVisible(true); }}
            onDetailVisibilityChange={(visible) => setIsLibraryDetailVisible(visible)}
            installedSteamAppIds={installedSteamAppIds}
          />
        )}

        {/* GAME INFO PANEL (bottom-left, PS5 style) */}
        {!isLibraryFocused && (
          activeItem?.id === '1' ? (
            <Animated.View style={[styles.welcomePanel, welcomePanelLayout, gameInfoPanelStyle]} entering={FadeInDown.duration(500).delay(150)}>
              <Animated.View style={widgetContainerStyle}>
                <WelcomeWidgets
                  focusArea={focusArea}
                  focusIndex={focusIndex}
                  setFocusArea={setFocusArea}
                  setFocusIndex={setFocusIndex}
                  setHomeBgModalVisible={setHomeBgModalVisible}
                  setAddModalVisible={setAddModalVisible}
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
                />
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
              steamMedia={steamMedia}
              mediaLoading={mediaLoading}
              setSelectedMediaIndex={setSelectedMediaIndex}
              steamNews={steamNews}
              newsLoading={newsLoading}
              activeUser={activeUser}
              windowWidth={windowWidth}
              windowHeight={windowHeight}
              gameInfoPanelStyle={gameInfoPanelStyle}
              spacerStyle={spacerStyle}
              infoCardsStyle={infoCardsStyle}
              topPanelStyle={topPanelStyle}
              installedSteamAppIds={installedSteamAppIds}
            />
          )
        )}
      </Animated.ScrollView>

      {/* WPS5 UI EXPANSION COMPONENTS */}
      <GameDetailView
        isVisible={isDetailVisible}
        item={selectedItem}
        onClose={() => setDetailVisible(false)}
        onRefresh={() => loadApps()}
        inputMode={inputMode}
        isLaunching={isLaunching}
        installedSteamAppIds={installedSteamAppIds}
        onLaunch={(_id, _path) => {
          if (selectedItem) handleLaunchApp(selectedItem);
        }}
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
      />

      <FavoritesView
        isVisible={isFavoritesVisible}
        isLaunching={isLaunching}
        inputMode={inputMode}
        favorites={currentData[activeIndex]?.isGrid ? media.filter(m => m.isFavorite) : games.filter(g => g.isFavorite)}
        onClose={() => setFavoritesVisible(false)}
        onLaunch={handleLaunchApp}
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
      <Modal visible={isAddModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {Platform.OS === 'web' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `
                    linear-gradient(
                      45deg,
                      rgba(255, 255, 255, 0.08) 0%,
                      rgba(255,255,255,0.03) 40%,
                      rgba(255,255,255,0.01) 60%,
                      rgba(0,0,0,0.00) 100%
                    )
                  `,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              />
            )}
            <View style={{ zIndex: 2 }}>
              <Text style={styles.modalTitle}>{t('add.title')}</Text>
              <TextInput
                ref={addModalTitleRef}
                style={[styles.input, addModalFocusIndex === 0 && styles.inputFocused]}
                placeholder={t('add.appName')}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={newApp.title}
                onChangeText={(text) => setNewApp({ ...newApp, title: text })}
              />
              <View style={styles.pickerRow}>
                <TouchableOpacity style={[styles.typeBtn, newApp.type === 'game' && styles.typeBtnActive, addModalFocusIndex === 1 && styles.inputFocused]} onPress={() => setNewApp({ ...newApp, type: 'game' })}>
                  <Text style={[styles.typeBtnText, newApp.type === 'game' && styles.typeBtnTextActive]}>{t('cc.typeGames')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeBtn, newApp.type === 'media' && styles.typeBtnActive, addModalFocusIndex === 2 && styles.inputFocused]} onPress={() => setNewApp({ ...newApp, type: 'media', platform: '' })}>
                  <Text style={[styles.typeBtnText, newApp.type === 'media' && styles.typeBtnTextActive]}>{t('cc.typeMedia')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeBtn, newApp.type === 'web' && styles.typeBtnActive, addModalFocusIndex === 3 && styles.inputFocused]} onPress={() => setNewApp({ ...newApp, type: 'web', platform: '' })}>
                  <Text style={[styles.typeBtnText, newApp.type === 'web' && styles.typeBtnTextActive]}>{t('cc.typeWeb')}</Text>
                </TouchableOpacity>
              </View>
              {newApp.type === 'game' && (
                <View style={{ marginBottom: 15 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformScrollContent}>
                    {[{ id: 'PC', icon: 'microsoft-windows' }, { id: 'PS5', icon: 'sony-playstation' }, { id: 'Xbox', icon: 'microsoft-xbox' }, { id: 'Switch', icon: 'nintendo-switch' }, { id: 'Steam', icon: 'steam' }, { id: 'EA', icon: 'alpha-e-box' }, { id: 'Epic', icon: 'alpha-e-circle' }].map((plat, idx) => {
                      const focusIdx = 4 + idx;
                      return (
                        <TouchableOpacity key={plat.id} style={[styles.platformBtn, newApp.platform === plat.id && styles.platformBtnActive, addModalFocusIndex === focusIdx && styles.inputFocused]} onPress={() => setNewApp({ ...newApp, platform: plat.id })}>
                          <MaterialCommunityIcons name={plat.icon as any} size={20} color={newApp.platform === plat.id ? '#FFF' : 'rgba(255,255,255,0.5)'} />
                          <Text style={[styles.platformBtnText, newApp.platform === plat.id && styles.platformBtnTextActive]}>{plat.id}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
              {newApp.type === 'web' ? (
                <TextInput ref={addModalPathRef} style={[styles.input, addModalFocusIndex === 11 && styles.inputFocused]} placeholder="URL (https://...)" placeholderTextColor="rgba(255,255,255,0.3)" value={newApp.path} onChangeText={(text) => setNewApp({ ...newApp, path: text })} />
              ) : (
                <TouchableOpacity style={[styles.fileBtn, addModalFocusIndex === 11 && styles.inputFocused]} onPress={handleSelectExecutable}>
                  <Ionicons name="folder-open" size={20} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.fileBtnText}>{newApp.path ? t('add.path', { path: newApp.path.slice(-20) }) : t('add.selectExe')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.fileBtn, addModalFocusIndex === 12 && styles.inputFocused]} onPress={handleSelectImage}>
                <Ionicons name="image" size={20} color="rgba(255,255,255,0.7)" />
                <Text style={styles.fileBtnText}>{newApp.image ? t('add.cover', { path: newApp.image.slice(-20) }) : t('add.coverOptional')}</Text>
              </TouchableOpacity>
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.cancelBtn, isSaving && { opacity: 0.5 }, addModalFocusIndex === 13 && styles.inputFocused]} onPress={() => !isSaving && setAddModalVisible(false)} disabled={isSaving}>
                  <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, isSaving && { backgroundColor: 'rgba(255,255,255,0.05)' }, addModalFocusIndex === 14 && styles.inputFocused]} onPress={handleSaveApp} disabled={isSaving}>
                  <Text style={styles.saveBtnText}>{isSaving ? t('edit.searchingAssetsShort') : t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

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
            ) : selectedLightboxMedia?.full ? (
              <Image
                source={{ uri: selectedLightboxMedia.full }}
                style={styles.lightboxImage}
                contentFit="contain"
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
        onClose={() => setSearchVisible(false)}
        libraryGames={searchableLibraryGames}
        mediaItems={searchableMedia.length > 0 ? searchableMedia : media}
        storeOffers={storeOffers}
        users={searchUsers.length > 0 ? searchUsers : (activeUser ? [activeUser] : [])}
        onOpenGameDetail={(item) => {
          setSelectedItem(item as ConsoleItem);
          setDetailVisible(true);
        }}
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

      {/* SETTINGS VIEW */}
      {isSettingsVisible && (
        <Animated.View style={styles.settingsViewContainer} entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)}>
          {/* background video */}
          <Video
            source={require('@/assets/video/waves_ajustes.mp4')}
            style={StyleSheet.absoluteFillObject}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted
          />
          {/* subtle dark overlay */}
          <View style={styles.settingsOverlayDark} />

          <View style={styles.settingsContentContainer}>
            {/* Title Header */}
            <Text style={styles.settingsMainTitleLarge}>{t('settings.title')}</Text>

            {/* Two Column Layout */}
            <View style={styles.settingsTwoColumns}>
              {/* Sidebar */}
              <View style={styles.settingsSidebarNew}>
                <TouchableOpacity
                  style={[
                    styles.settingsTabNew,
                    settingsTab === 'profile' && styles.settingsTabActiveNew,
                    (settingsFocusArea === 'sidebar' && settingsFocusIndex === 0) && styles.settingsTabFocusedNew
                  ]}
                  onPress={() => setSettingsTab('profile')}
                >
                  <Ionicons name="person-outline" size={24} color={settingsTab === 'profile' ? '#FFF' : '#AAA'} />
                  <Text style={[styles.settingsTabTextNew, settingsTab === 'profile' && styles.settingsTabTextActiveNew]}>{t('settings.profile')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.settingsTabNew,
                    settingsTab === 'home' && styles.settingsTabActiveNew,
                    (settingsFocusArea === 'sidebar' && settingsFocusIndex === 1) && styles.settingsTabFocusedNew
                  ]}
                  onPress={() => setSettingsTab('home')}
                >
                  <Ionicons name="home-outline" size={24} color={settingsTab === 'home' ? '#FFF' : '#AAA'} />
                  <Text style={[styles.settingsTabTextNew, settingsTab === 'home' && styles.settingsTabTextActiveNew]}>{t('settings.home')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.settingsTabNew,
                    settingsTab === 'sync' && styles.settingsTabActiveNew,
                    (settingsFocusArea === 'sidebar' && settingsFocusIndex === 2) && styles.settingsTabFocusedNew
                  ]}
                  onPress={() => setSettingsTab('sync')}
                >
                  <Ionicons name="sync-circle-outline" size={24} color={settingsTab === 'sync' ? '#FFF' : '#AAA'} />
                  <Text style={[styles.settingsTabTextNew, settingsTab === 'sync' && styles.settingsTabTextActiveNew]}>{t('settings.sync')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.settingsTabNew,
                    settingsTab === 'support' && styles.settingsTabActiveNew,
                    (settingsFocusArea === 'sidebar' && settingsFocusIndex === 3) && styles.settingsTabFocusedNew
                  ]}
                  onPress={() => setSettingsTab('support')}
                >
                  <Ionicons name="heart-outline" size={24} color={settingsTab === 'support' ? '#FFF' : '#AAA'} />
                  <Text style={[styles.settingsTabTextNew, settingsTab === 'support' && styles.settingsTabTextActiveNew]}>{t('settings.support')}</Text>
                </TouchableOpacity>

                <View style={{ flex: 1 }} />

              </View>

              {/* Main Content Area */}
              <View style={styles.settingsMainNew}>
                {settingsTab === 'profile' ? (
                  <ScrollView contentContainerStyle={styles.settingsScrollContentInnerNew} showsVerticalScrollIndicator={false}>
                    <Text style={styles.settingsSectionTitleNew}>{t('settings.profileConfig')}</Text>

                    <View style={styles.settingsSectionNew}>
                      <Text style={styles.settingsLabelNew}>{t('settings.profilePhoto')}</Text>
                      <TouchableOpacity
                        onPress={handleSelectAvatar}
                        style={[
                          styles.settingsAvatarContainerNew,
                          { borderColor: activeUser?.color || '#FFFFFF' },
                          (settingsFocusArea === 'content' && settingsFocusIndex === 0) && styles.settingsElementFocusedNew
                        ]}
                      >
                        {activeUser?.avatar ? (
                          <Image source={{ uri: (activeUser?.settings?.useSteamAvatar && activeUser?.steamAvatarUrl) ? activeUser.steamAvatarUrl : ((activeUser as any).avatarBase64 || activeUser.avatar) }} style={styles.settingsAvatarNew} />
                        ) : (
                          <View style={styles.defaultAvatarContainerNew}>
                            <Ionicons name="person" size={60} color="rgba(255,255,255,0.4)" />
                          </View>
                        )}
                        <View style={styles.settingsAvatarEditBadgeNew}>
                          <Ionicons name="camera" size={20} color="#FFF" />
                        </View>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.settingsOptionRowNew}>
                      <View style={styles.settingsOptionInfoNew}>
                        <Text style={styles.settingsOptionLabelNew}>{t('settings.useSteamAvatar')}</Text>
                        <Text style={styles.settingsOptionDescNew}>{t('settings.useSteamAvatarDesc')}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={handleToggleSteamAvatar}
                        style={[
                          styles.toggleContainerNew,
                          activeUser?.settings?.useSteamAvatar && styles.toggleContainerActiveNew,
                          (settingsFocusArea === 'content' && settingsFocusIndex === 1) && styles.settingsElementFocusedNew
                        ]}
                      >
                        <View style={[styles.toggleCircleNew, activeUser?.settings?.useSteamAvatar && styles.toggleCircleActiveNew]} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.settingsSectionNew}>
                      <Text style={styles.settingsLabelNew}>{t('settings.username')}</Text>
                      <TextInput
                        ref={settingsNameRef}
                        style={[
                          styles.settingsInputNew,
                          (settingsFocusArea === 'content' && settingsFocusIndex === 2) && styles.settingsInputFocusedNew
                        ]}
                        value={activeUser?.name || ''}
                        onChangeText={(text) => updateUser({ name: text })}
                        placeholder={t('settings.usernamePlaceholder')}
                        placeholderTextColor="#666"
                      />
                    </View>

                    <View style={styles.settingsSectionNew}>
                      <Text style={styles.settingsLabelNew}>{t('settings.profileColor')}</Text>
                      <View style={styles.colorPickerContainerNew}>
                        {['#FF3B30', '#00D4FF', '#FFCC00', '#4CD964', '#AF52DE', '#FF9500'].map((color) => (
                          <TouchableOpacity
                            key={color}
                            style={[
                              styles.colorCircleNew,
                              { backgroundColor: color },
                              activeUser?.color === color && styles.colorCircleActiveNew
                            ]}
                            onPress={() => updateUser({ color })}
                          />
                        ))}
                        <TouchableOpacity
                          style={[
                            styles.colorCircleNew,
                            { backgroundColor: activeUser?.color }
                          ]}
                          onPress={() => {
                            const el = document.getElementById('colorPicker') as any;
                            if (el) el.click();
                          }}
                        >
                          <input
                            id="colorPicker"
                            type="color"
                            value={activeUser?.color}
                            onChange={(e) => updateUser({ color: e.target.value })}
                            style={{ display: 'none' }}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.settingsSectionNew}>
                      <Text style={styles.settingsLabelNew}>{t('settings.steamAccount')}</Text>
                      {activeUser?.settings?.steamId ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialCommunityIcons name="steam" size={28} color="#FFF" style={{ marginRight: 10 }} />
                            <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>Steam</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, marginRight: 15 }}>{t('settings.steamConnected', {
                              id: activeUser.settings.steamId
                            })}</Text>
                            <TouchableOpacity
                              style={{ backgroundColor: '#FF3333', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                              onPress={() => updateUser({ settings: { ...activeUser.settings, steamId: null } as any })}
                            >
                              <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{t('settings.unlink')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialCommunityIcons name="steam" size={28} color="#FFF" style={{ marginRight: 10 }} />
                            <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>Steam</Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              { borderRadius: 4, overflow: 'hidden' },
                              (settingsFocusArea === 'content' && settingsFocusIndex === 3) && { borderWidth: 2, borderColor: '#FFF' }
                            ]}
                            onPress={async () => {
                              if (Platform.OS === 'web' && (window as any).electronAPI) {
                                const res = await (window as any).electronAPI.steamLogin();
                                if (res.success && res.steamId) {
                                  updateUser({ settings: { ...activeUser?.settings, steamId: res.steamId } as any });
                                } else if (res.error && res.error !== 'Ventana de inicio de sesión cerrada') {
                                  alert(
                                    t('settings.steamLoginError', {
                                      error: res.error
                                    })
                                  );
                                }
                              } else {
                                alert(t('settings.desktopOnly'));
                              }
                            }}
                          >
                            <Image
                              source={require('@/assets/images/steam_boton.png')}
                              style={{ width: 180, height: 45 }}
                              contentFit="contain"
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <View style={styles.settingsSectionNew}>
                      <Text style={styles.settingsLabelNew}>
                        {t('settings.language')}
                      </Text>

                      <Text style={styles.settingsOptionDescNew}>
                        {t('settings.languageDesc')}
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                        {LANGUAGE_OPTIONS.map((option) => (
                          <TouchableOpacity
                            key={option.id}
                            style={[
                              styles.platformBtnNew,
                              language === option.id && styles.platformBtnActiveNew,
                              (settingsFocusArea === 'content' && settingsFocusIndex === 0) &&
                              styles.settingsElementFocusedNew
                            ]}
                            onPress={() => changeLanguage(option.id)}
                          >
                            <Text
                              style={[
                                styles.platformBtnTextNew,
                                language === option.id && styles.platformBtnTextActiveNew
                              ]}
                            >
                              {option.nativeName}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </ScrollView>
                ) : settingsTab === 'home' ? (
                  <ScrollView contentContainerStyle={styles.settingsScrollContentInnerNew} showsVerticalScrollIndicator={false}>
                    <Text style={styles.settingsSectionTitleNew}>{t('settings.homeConfig')}</Text>

                    <View style={styles.settingsOptionRowNew}>
                      <View style={styles.settingsOptionInfoNew}>
                        <Text style={styles.settingsOptionLabelNew}>{t('settings.autoPlayVideo')}</Text>
                        <Text style={styles.settingsOptionDescNew}>{t('settings.autoPlayVideoDesc')}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => updateUser({ settings: { ...activeUser?.settings, autoPlayVideo: !(activeUser?.settings?.autoPlayVideo !== false) } })}
                        style={[
                          styles.toggleContainerNew,
                          (activeUser?.settings?.autoPlayVideo !== false) && styles.toggleContainerActiveNew,
                          (settingsFocusArea === 'content' && settingsFocusIndex === 0) && styles.settingsElementFocusedNew
                        ]}
                      >
                        <View style={[styles.toggleCircleNew, (activeUser?.settings?.autoPlayVideo !== false) && styles.toggleCircleActiveNew]} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.settingsOptionRowNew}>
                      <View style={styles.settingsOptionInfoNew}>
                        <Text style={styles.settingsOptionLabelNew}>{t('settings.invertTransition')}</Text>
                        <Text style={styles.settingsOptionDescNew}>{t('settings.invertTransitionDesc')}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => updateUser({ settings: { ...activeUser?.settings, invertTransitionDirection: !activeUser?.settings?.invertTransitionDirection } })}
                        style={[
                          styles.toggleContainerNew,
                          (activeUser?.settings?.invertTransitionDirection === true) && styles.toggleContainerActiveNew,
                          (settingsFocusArea === 'content' && settingsFocusIndex === 1) && styles.settingsElementFocusedNew
                        ]}
                      >
                        <View style={[styles.toggleCircleNew, (activeUser?.settings?.invertTransitionDirection === true) && styles.toggleCircleActiveNew]} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.settingsSectionNew}>
                      <Text style={styles.settingsLabelNew}>{t('settings.wallpaper')}</Text>
                      <TouchableOpacity
                        style={[
                          styles.settingsSecondaryBtnNew,
                          (settingsFocusArea === 'content' && settingsFocusIndex === 2) && styles.settingsElementFocusedNew
                        ]}
                        onPress={() => {
                          setSettingsVisible(false);
                          setHomeBgModalVisible(true);
                        }}
                      >
                        <Ionicons name="image-outline" size={20} color="#FFF" />
                        <Text style={styles.settingsSecondaryBtnTextNew}>{t('settings.chooseWallpaper')}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.settingsSectionNew}>
                      <Text style={styles.settingsLabelNew}>{t('settings.wallpaperFolder')}</Text>
                      <Text style={[styles.settingsOptionDescNew, { marginBottom: 10, color: '#888' }]}>
                        {t('settings.currentPath', { path: activeUser?.settings?.wallpaperPath || t('settings.defaultWallpapers') })}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.settingsSecondaryBtnNew,
                          (settingsFocusArea === 'content' && settingsFocusIndex === 3) && styles.settingsElementFocusedNew
                        ]}
                        onPress={handleSelectWallpaperFolder}
                      >
                        <Ionicons name="folder-open-outline" size={20} color="#FFF" />
                        <Text style={styles.settingsSecondaryBtnTextNew}>{t('settings.selectFolder')}</Text>
                      </TouchableOpacity>
                      {activeUser?.settings?.wallpaperPath && (
                        <TouchableOpacity
                          style={[
                            styles.settingsSecondaryBtnNew,
                            { marginTop: 10, backgroundColor: '#442222' },
                            (settingsFocusArea === 'content' && settingsFocusIndex === (activeUser?.settings?.capturePath ? 6 : 5)) && styles.settingsElementFocusedNew
                          ]}
                          onPress={() => updateUser({ settings: { ...activeUser?.settings, wallpaperPath: '' } as any })}
                        >
                          <Ionicons name="trash-outline" size={20} color="#FF5555" />
                          <Text style={[styles.settingsSecondaryBtnTextNew, { color: '#FF5555' }]}>{t('settings.restoreDefault')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.settingsSectionNew}>
                      <Text style={styles.settingsLabelNew}>{t('settings.capturesFolder')}</Text>
                      <Text style={[styles.settingsOptionDescNew, { marginBottom: 10, color: '#888' }]}>
                        {t('settings.currentPath', { path: activeUser?.settings?.capturePath || t('settings.defaultCaptures') })}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.settingsSecondaryBtnNew,
                          (settingsFocusArea === 'content' && settingsFocusIndex === 4) && styles.settingsElementFocusedNew
                        ]}
                        onPress={handleSelectCaptureFolder}
                      >
                        <Ionicons name="folder-open-outline" size={20} color="#FFF" />
                        <Text style={styles.settingsSecondaryBtnTextNew}>{t('settings.selectFolder')}</Text>
                      </TouchableOpacity>
                      {activeUser?.settings?.capturePath && (
                        <TouchableOpacity
                          style={[
                            styles.settingsSecondaryBtnNew,
                            { marginTop: 10, backgroundColor: '#442222' },
                            (settingsFocusArea === 'content' && settingsFocusIndex === 5) && styles.settingsElementFocusedNew
                          ]}
                          onPress={() => updateUser({ settings: { ...activeUser?.settings, capturePath: '' } as any })}
                        >
                          <Ionicons name="trash-outline" size={20} color="#FF5555" />
                          <Text style={[styles.settingsSecondaryBtnTextNew, { color: '#FF5555' }]}>{t('settings.restoreDefault')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </ScrollView>
                ) : settingsTab === 'sync' ? (
                  <ScrollView contentContainerStyle={styles.settingsScrollContentInnerNew} showsVerticalScrollIndicator={false}>
                    <Text style={styles.settingsSectionTitleNew}>{t('settings.smartSync')}</Text>
                    <Text style={[styles.settingsOptionDescNew, { marginBottom: 20, color: '#888' }]}>{t('settings.smartSyncDesc')}</Text>

                    {[
                      { key: 'ratingAndSummary', label: t('settings.ratingAndSummary'), options: [{ id: 'igdb', label: 'IGDB' }, { id: 'none', label: t('settings.none') }] },
                      { key: 'cover', label: t('settings.cover'), options: [{ id: 'steamgrid', label: 'SteamGrid' }, { id: 'igdb', label: 'IGDB' }, { id: 'none', label: t('settings.none') }] },
                      { key: 'background', label: t('settings.background'), options: [{ id: 'steamgrid', label: 'SteamGrid' }, { id: 'igdb', label: 'IGDB' }, { id: 'none', label: t('settings.none') }] },
                      { key: 'logo', label: t('settings.logo'), options: [{ id: 'steamgrid', label: 'SteamGrid' }, { id: 'none', label: t('settings.none') }] }
                    ].map((pref, index) => {
                      const currentSync = activeUser?.settings?.syncPreferences || { ratingAndSummary: 'igdb', cover: 'steamgrid', background: 'steamgrid', logo: 'steamgrid' };
                      const currentValue = (currentSync as any)[pref.key];
                      return (
                        <View
                          key={pref.key}
                          style={[
                            styles.settingsSectionNew,
                            (settingsFocusArea === 'content' && settingsFocusIndex === index) && styles.settingsElementFocusedNew,
                            { padding: 10, borderRadius: 12 }
                          ]}
                        >
                          <Text style={styles.settingsLabelNew}>{pref.label}</Text>
                          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                            {pref.options.map(opt => (
                              <TouchableOpacity
                                key={opt.id}
                                style={[
                                  styles.platformBtnNew,
                                  currentValue === opt.id && styles.platformBtnActiveNew
                                ]}
                                onPress={() => updateUser({
                                  settings: {
                                    autoPlayVideo: activeUser?.settings?.autoPlayVideo ?? true,
                                    syncPreferences: { ...currentSync, [pref.key]: opt.id } as any
                                  }
                                })}
                              >
                                <Text style={[styles.platformBtnTextNew, currentValue === opt.id && styles.platformBtnTextActiveNew]}>
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : settingsTab === 'support' ? (
                  <ScrollView contentContainerStyle={styles.settingsScrollContentInnerNew} showsVerticalScrollIndicator={false}>
                    <Text style={styles.settingsSectionTitleNew}>{t('settings.supportTitle')}</Text>

                    <View style={styles.supportMessageContainer}>
                      <Ionicons name="heart-circle-sharp" size={60} color="#FF3B30" style={{ marginBottom: 15, alignSelf: 'center' }} />
                      <Text style={styles.supportTextMain}>{t('settings.thanks')}</Text>
                      <Text style={styles.supportTextSub}>
                        {t('settings.supportBody')}
                      </Text>
                    </View>

                    {/* Social links */}
                    <View style={styles.supportLinksRow}>
                      <TouchableOpacity
                        style={[
                          styles.supportLinkBtn,
                          (settingsFocusArea === 'content' && settingsFocusIndex === 0) && styles.settingsElementFocusedNew
                        ]}
                        onPress={() => Linking.openURL('https://patreon.com/WPS5')}
                      >
                        <Ionicons name="logo-octocat" size={20} color="#FF4500" />
                        <Text style={styles.supportLinkBtnText}>Patreon</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.supportLinkBtn,
                          (settingsFocusArea === 'content' && settingsFocusIndex === 1) && styles.settingsElementFocusedNew
                        ]}
                        onPress={() => Linking.openURL('https://github.com/angelvc25/WPS5')}
                      >
                        <Ionicons name="logo-github" size={20} color="#FFF" />
                        <Text style={styles.supportLinkBtnText}>GitHub</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.supportLinkBtn,
                          (settingsFocusArea === 'content' && settingsFocusIndex === 2) && styles.settingsElementFocusedNew
                        ]}
                        onPress={() => Linking.openURL('https://youtube.com')}
                      >
                        <Ionicons name="logo-youtube" size={20} color="#FF0000" />
                        <Text style={styles.supportLinkBtnText}>YouTube</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Patrons list / Users list */}
                    <View style={styles.patronsSection}>
                      <Text style={styles.settingsLabelNew}>{t('settings.patrons')}</Text>
                      <View style={styles.patronsListGrid}>
                        {['angelvc25', 'Crizz_Vc',].map((name, idx) => (
                          <View key={idx} style={styles.patronCard}>
                            <Ionicons name="star" size={14} color="#FFCC00" />
                            <Text style={styles.patronName}>{name}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </ScrollView>
                ) : null}
              </View>
            </View>
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
                    <Image source={{ uri: (activeUser?.settings?.useSteamAvatar && activeUser?.steamAvatarUrl) ? activeUser.steamAvatarUrl : ((activeUser as any).avatarBase64 || activeUser.avatar) }} style={styles.modalAvatar} />
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
                <TouchableOpacity style={[styles.powerButton, modalSelectedIndex === 3 && styles.powerButtonActive, modalSelectedIndex === 3 && styles.buttonFocused]} activeOpacity={0.8} onPress={() => { setModalSelectedIndex(3); if (Platform.OS === 'web' && (window as any).electronAPI) (window as any).electronAPI.closeApp(); }}>
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
                  <Text style={styles.statusText}>{currentTime}</Text>
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
            {/* Background image of the game */}
            {launchingItem.backgroundImage ? (
              <Image
                source={launchingItem.backgroundImage}
                style={[StyleSheet.absoluteFillObject, { opacity: 0.4 }]}
                contentFit="cover"
              />
            ) : launchingItem.image ? (
              <Image
                source={launchingItem.image}
                style={[StyleSheet.absoluteFillObject, { opacity: 0.4 }]}
                contentFit="cover"
              />
            ) : null}

            {/* Dark background gradient overlay */}
            {Platform.OS === 'web' && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.3) 100%)',
                pointerEvents: 'none',
              } as any} />
            )}

            <View style={styles.launchingOverlay}>
              <Animated.View style={{ alignItems: 'center', marginBottom: 40 }} entering={FadeInDown.delay(300).duration(800)}>
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
    // Simulates a left-to-right gradient: dark on left, fading to transparent
    background: 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.1) 100%)',
    backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.1) 100%)',
  } as any,
  gradientOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 130,
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
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
    top: 16,
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
    // Padding removed — navItem holds its own constant padding to prevent layout shifts on focus
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
    fontFamily: 'SSTRg',
    fontWeight: '400',
  },
  tabFocused: {
    color: '#FFFFFF',
    borderColor: "#a8a8a8ff",
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
});