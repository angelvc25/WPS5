import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Platform, Modal, TextInput, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Video, ResizeMode } from 'expo-av';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, interpolate, Easing, FadeInDown } from 'react-native-reanimated';
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
import { Feather } from '@expo/vector-icons';
import RadarFocusWrapper from '@/components/RadarFocusWrapper';
import PS5WidgetRow from '@/components/ps5widgetrow';

// WPS5 UI Expansion Components
import LibraryGrid from '@/components/LibraryGrid';
import FloatingSystemNav from '@/components/FloatingSystemNav';
import OverlayTab from '@/components/OverlayTab';
import GameContextMenu from '@/components/GameContextMenu';
import GameDetailView from '@/components/GameDetailView';
import ProfileDropdownMenu from '@/components/ProfileDropdownMenu';

const TABS = ['Games', 'Media'];

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

const DATA_GAMES: ConsoleItem[] = [
  { id: '1', title: 'Welcome', time: 'WConsole - Home', image: require('@/assets/images/Home.png'), description: 'Bienvenido a tu consola personal. Accede a tus juegos y aplicaciones favoritas con una experiencia premium.', rating: 5.0 },
  { id: 'last_played', title: 'Último Jugado', time: 'No ejecutado aún', image: require('@/assets/images/Home.gif'), isLastPlayed: true },
  // { id: '3', title: 'Favoritos Juegos', time: 'Folder - Colección', isFolder: true },
  // { id: '4', title: 'Favoritos Media', time: 'Aplicaciones de Streaming', isGrid: true },
  { id: '5', title: 'PlayStation Store', time: 'Tienda', image: require('@/assets/images/Store.png'), backgroundImage: require('@/assets/images/StoreFondo.jpg') }
];

const DATA_MEDIA: ConsoleItem[] = [];

// AnimatedCardWrapper — top-level component so each card owns its shared value.
// This prevents the flicker caused by a single global shared value resetting on index change.
const AnimatedCardWrapper = React.memo(({
  isActive,
  children,
  style,
}: {
  isActive: boolean;
  children: React.ReactNode;
  style?: any;
}) => {
  const scale = useSharedValue(isActive ? 1.5 : 1);
  const translateY = useSharedValue(isActive ? 17 : 0);
  const marginH = useSharedValue(isActive ? 20 : 6);

  React.useEffect(() => {
    scale.value = withTiming(isActive ? 1.5 : 1, { duration: 280, easing: Easing.out(Easing.quad) });
    translateY.value = withTiming(isActive ? 17 : 0, { duration: 280, easing: Easing.out(Easing.quad) });
    marginH.value = withTiming(isActive ? 20 : 6, { duration: 280, easing: Easing.out(Easing.quad) });
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
    marginLeft: marginH.value,
    marginRight: marginH.value,
    overflow: isActive ? 'visible' : 'hidden',
    borderRadius: 20,
  }));

  return (
    <Animated.View style={[animStyle, style]}>
      {children}
    </Animated.View>
  );
});

export default function ConsoleHome() {
  const { activeUser, changeUser, updateUser } = useUser();
  const [activeTab, setActiveTab] = useState('Games');
  const [activeIndex, setActiveIndex] = useState(1);

  // Focus management
  type FocusArea = 'header_user' | 'header_tabs' | 'main_carousel' | 'game_panel' | 'footer' | 'welcome_widgets' | 'library_grid' | 'header_avatar';
  const [focusArea, setFocusArea] = useState<FocusArea>('main_carousel');
  const [focusIndex, setFocusIndex] = useState(0);
  // game_panel focus: 0=Play, 1=More, 2=Trophies, 3=Friends
  const [gamePanelFocusIndex, setGamePanelFocusIndex] = useState(0);

  // Steam news
  const [steamNews, setSteamNews] = useState<SteamNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // Steam screenshots & trailers
  const [steamMedia, setSteamMedia] = useState<SteamMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);


  const scrollRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const newsScrollRef = useRef<ScrollView>(null);
  const mediaScrollRef = useRef<ScrollView>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // PS5-style card sizing: smaller, square cards like the real PS5
  const CARD_SIZE = 130;
  const CARD_GAP = 6;
  const ITEM_WIDTH = CARD_SIZE + CARD_GAP * 2;
  const LEFT_PADDING = 150;
  const RIGHT_PADDING = Math.max(windowWidth - ITEM_WIDTH - LEFT_PADDING, 60);

  // States for dynamic data and clock
  const [games, setGames] = useState<ConsoleItem[]>(DATA_GAMES);
  const [media, setMedia] = useState<ConsoleItem[]>(DATA_MEDIA);
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
  const [addModalFocusIndex, setAddModalFocusIndex] = useState(0);
  const [bgModalFocusIndex, setBgModalFocusIndex] = useState(0);
  const [settingsFocusArea, setSettingsFocusArea] = useState<'sidebar' | 'content'>('sidebar');
  const [settingsFocusIndex, setSettingsFocusIndex] = useState(0);

  const addModalTitleRef = useRef<TextInput>(null);
  const addModalPathRef = useRef<TextInput>(null);
  const addModalPlatformRef = useRef<TextInput>(null);
  const settingsNameRef = useRef<TextInput>(null);

  const [isFavoritesVisible, setFavoritesVisible] = useState(false);
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'home' | 'sync'>('profile');
  const [homeBackground, setHomeBackground] = useState<any>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isRandomSelectorVisible, setRandomSelectorVisible] = useState(false);

  // States for new UI features (WPS5 UI Expansion)
  const [isLibraryFocused, setIsLibraryFocused] = useState(false);
  const [libraryGridFocusIndex, setLibraryGridFocusIndex] = useState(0);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [contextMenuFocusIndex, setContextMenuFocusIndex] = useState(0);
  const [isDetailVisible, setDetailVisible] = useState(false);

  const [isOnline, setIsOnline] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [profileMenuFocusIndex, setProfileMenuFocusIndex] = useState(0);

  const [systemNavLevel, setSystemNavLevel] = useState(0); // 0 = menu, 1 = cards
  const [systemNavCardIndex, setSystemNavCardIndex] = useState(0);
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
  }, [activeIndex, activeTab, activeUser?.settings?.autoPlayVideo]);

  useEffect(() => {
    tabFade.value = 0;
    tabFade.value = withTiming(1, { duration: 400 });
  }, [activeTab]);

  // Spinning border animation — continuous rotation for active card
  useEffect(() => {
    spinRotation.value = withRepeat(
      withTiming(360, { duration: 2800, easing: Easing.linear }),
      -1,
      false
    );
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
    welcomeWidgetsFocusAnim.value = withTiming(focusArea === 'welcome_widgets' ? 1 : 0, { duration: 280, easing: Easing.out(Easing.quad) });
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
    const isWelcome = (activeTab === 'Games' ? games : media)[activeIndex]?.id === '1';
    const trophyHeight = 320;
    const deepHeight = interpolate(deepSectionFocusAnim.value, [0, 1], [trophyHeight, 80]);
    const targetMinHeight = interpolate(
      lowerSectionFocusAnim.value,
      [0, 1],
      [
        interpolate(gamePanelFocusAnim.value, [0, 1], [windowHeight - 390, windowHeight * 0.5 + 200]),
        deepHeight
      ]
    );
    // When welcome_widgets is focused: shrink spacer to ~0 so title+carousel collapse up
    const welcomeHeight = interpolate(
      welcomeWidgetsFocusAnim.value,
      [0, 1],
      [Math.max(30, windowHeight - 655), 0]
    );
    return {
      minHeight: isWelcome ? welcomeHeight : Math.max(0, targetMinHeight),
      justifyContent: 'flex-end',
      paddingBottom: 20,
    };
  });

  const headerStyle = useAnimatedStyle(() => {
    // Collapse both when game_panel is focused AND when welcome_widgets is focused
    const collapseAnim = Math.max(gamePanelFocusAnim.value, welcomeWidgetsFocusAnim.value);
    return {
      opacity: 1 - collapseAnim,
      transform: [{ translateY: interpolate(collapseAnim, [0, 1], [0, -20]) }],
      maxHeight: interpolate(collapseAnim, [0, 1], [120, 0]),
      paddingTop: interpolate(collapseAnim, [0, 1], [40, 0]),
      paddingBottom: interpolate(collapseAnim, [0, 1], [12, 0]),
      overflow: 'hidden',
    };
  });

  const carouselStyle = useAnimatedStyle(() => {
    const collapseAnim = Math.max(gamePanelFocusAnim.value, welcomeWidgetsFocusAnim.value);
    return {
      opacity: 1 - collapseAnim,
      transform: [{ translateY: interpolate(collapseAnim, [0, 1], [0, -20]) }],
      height: interpolate(collapseAnim, [0, 1], [200, 0]),
      overflow: 'hidden',
    };
  });

  const topBarMiniStyle = useAnimatedStyle(() => {
    const collapseAnim = Math.max(gamePanelFocusAnim.value, welcomeWidgetsFocusAnim.value);
    return {
      opacity: collapseAnim,
      transform: [{ translateY: interpolate(collapseAnim, [0, 1], [-20, 0]) }],
      pointerEvents: (isTopHidden || focusArea === 'welcome_widgets') ? 'auto' : 'none',
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

  // Push widgets down when contracted so they appear centered/lower on screen posicion de los widgets cuando se contrae windowHeight/0.22
  const widgetContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: 80,
    paddingTop: interpolate(welcomeWidgetsFocusAnim.value, [0, 1], [0, windowHeight * 0.05]),
  }));

  const widgetContainerStyle2 = useAnimatedStyle(() => ({
    paddingBottom: 0,
    paddingTop: interpolate(welcomeWidgetsFocusAnim.value, [0, 1], [0, windowHeight * 0.40]),
  }));

  useEffect(() => {
    if (Platform.OS === 'web') {
      const savedBg = localStorage.getItem('home_background');
      if (savedBg) setHomeBackground({ uri: savedBg });
    }
  }, []);

  const GAMES_LIMIT = 10;
  let currentData = activeTab === 'Games' ? games : media;

  if (activeTab === 'Games' && games.length > GAMES_LIMIT) {
    currentData = games.slice(0, GAMES_LIMIT);
    currentData.push({
      id: 'more_library',
      title: 'Ver Biblioteca',
      time: 'Ver todos los juegos',
      image: null,
    } as any);
  }

  // Filter out system utility cards from the saved games list
  const savedGames = games.filter(
    item => item.id !== '1' && item.id !== 'last_played' && item.id !== 'more_library' && !item.isFolder && !item.isGrid
  );

  useEffect(() => {
    const currentItem = currentData[activeIndex];
    setIsLibraryFocused(
      (focusArea === 'main_carousel' && currentItem?.id === 'more_library') ||
      focusArea === 'library_grid'
    );
  }, [activeIndex, focusArea, currentData]);

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}`);
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
          time: app.type === 'game' ? (app.platform || 'Juego') : (app.type === 'web' ? 'Web App' : 'Media'),
          image: app.imageBase64
            ? { uri: app.imageBase64 }
            : (app.image
              ? (app.image.startsWith('http') ? { uri: app.image } : { uri: `local-file:///${app.image.replace(/\\/g, '/')}` })
              : (app.type === 'web' ? require('@/assets/images/web_default.jpg') : require('@/assets/images/Home.gif'))
            ),
          logo: app.logoBase64 ? { uri: app.logoBase64 } : (app.logo ? (app.logo.startsWith('http') ? { uri: app.logo } : { uri: `local-file:///${app.logo.replace(/\\/g, '/')}` }) : null),
          backgroundImage: app.backgroundImageBase64
            ? { uri: app.backgroundImageBase64 }
            : (app.backgroundImage
              ? (app.backgroundImage.startsWith('http') ? { uri: app.backgroundImage } : { uri: `local-file:///${app.backgroundImage.replace(/\\/g, '/')}` })
              : require('@/assets/images/FondoDefault2.jpg')
            ),
          video: app.video ? (app.video.startsWith('http') ? { uri: app.video } : { uri: `local-file:///${app.video.replace(/\\/g, '/')}` }) : null,
          path: app.path,
          description: app.description,
          rating: app.rating,
          isFavorite: app.isFavorite,
          lastPlayed: app.lastPlayed,
          youtubeId: app.youtubeId,
          type: app.type,
          platform: app.platform
        });
        const gamesList = (data.games || []).map(formatApp);
        const mediaList = (data.media || []).map(formatApp);

        const home = DATA_GAMES.find(g => g.id === '1');
        const lastPlayed = DATA_GAMES.find(g => g.id === 'last_played');
        const favGames = DATA_GAMES.find(g => g.id === '3');
        const favMedia = DATA_GAMES.find(g => g.id === '4');
        const ps5store = DATA_GAMES.find(g => g.id === '5');

        const baseItems = [ps5store, home, lastPlayed, favGames, favMedia].filter(Boolean) as ConsoleItem[];
        setGames([...baseItems, ...gamesList.reverse()]);
        setMedia([...DATA_MEDIA, ...mediaList.reverse()]);

        const allFormatted = [...gamesList, ...mediaList];
        const latest = allFormatted.filter(i => i.lastPlayed).sort((a: any, b: any) => b.lastPlayed - a.lastPlayed)[0];
        if (latest) setLastPlayedGame(latest);
      });
    }
  };

  useEffect(() => {
    loadApps();
    fetchGamingNews().then(() => { });
    soundService.init();
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      (window as any).electronAPI.getStorageInfo().then((res: any) => {
        if (res.success) setStorageInfo({ percent: res.percent, freeGB: res.freeGB });
      });
    }
  }, []);

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
      alert(`Ubicación de la aplicación:\n\n${item.path || 'No seleccionada'}`);
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
      alert(`🏆 Trofeos de ${activeUser?.name || 'Usuario'}\n\nTotal: 457\n🥇 Oro: 13 | 🥈 Plata: 45 | 🥉 Bronce: 399`);
    } else if (idx === 3) {
      // Cambiar usuario
      changeUser();
    } else if (idx === 4) {
      // Salir
      if (Platform.OS === 'web' && (window as any).electronAPI) {
        (window as any).electronAPI.closeApp();
      } else {
        alert("Cerrando la consola WPS5...");
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
        checkButton(4, 'q');
        checkButton(5, 'e');
        checkButton(9, 'o');
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
    if (isHomeBgModalVisible) setBgModalFocusIndex(0);
  }, [isHomeBgModalVisible]);

  useEffect(() => {
    if (isSettingsVisible) { setSettingsFocusArea('sidebar'); setSettingsFocusIndex(0); }
  }, [isSettingsVisible]);

  // Keyboard Navigation
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleKeyDown = (e: any) => {
        if (!e.fromGamepad) setInputMode('keyboard');
        if (isLaunching) return;
        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) e.preventDefault();
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;

        // Profile Dropdown Menu Keyboard Navigation
        if (isProfileMenuOpen) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setIsProfileMenuOpen(false);
            soundService.playNavigation();
          } else if (e.key === 'ArrowDown') {
            setProfileMenuFocusIndex(prev => Math.min(prev + 1, 4));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            setProfileMenuFocusIndex(prev => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'Enter') {
            handleProfileMenuAction(profileMenuFocusIndex);
          }
          return;
        }

        // Toggle Control Center via Home key
        if (e.key === 'Home') {
          if (focusArea === 'header_user') {
            setFocusArea('main_carousel');
          } else {
            setFocusArea('header_user');
            setModalSelectedIndex(0);
          }
          soundService.playNavigation();
          return;
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
          } else if (e.key === 'ArrowDown') {
            setContextMenuFocusIndex(prev => Math.min(prev + 1, 2));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            setContextMenuFocusIndex(prev => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'Enter') {
            handleContextMenuAction(contextMenuFocusIndex);
          }
          return;
        }

        // 2. Floating System Navigation Keyboard Navigation
        if (focusArea === 'header_user') {
          if (isSystemNavCardExpanded) {
            if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
              setSystemNavCardExpanded(false);
            }
            return;
          }

          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setFocusArea('main_carousel');
          } else if (e.key === 'ArrowUp') {
            if (systemNavLevel === 0 && modalSelectedIndex === 0) {
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
              setSystemNavCardIndex(prev => Math.min(prev + 1, 2)); // 3 cards total
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
        if (e.key === 'x' || e.key === 'X' || e.key === 'm' || e.key === 'M') {
          if (focusArea === 'main_carousel') {
            const item = currentData[activeIndex];
            if (item && item.id !== 'more_library') {
              setIsContextMenuOpen(true);
              setContextMenuFocusIndex(0);
              soundService.playNavigation();
            }
          }
          return;
        }

        if (isSettingsVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') { setSettingsVisible(false); setFocusArea('header_user'); }
          else if (e.key === 'ArrowDown') {
            if (settingsFocusArea === 'sidebar') setSettingsFocusIndex(prev => Math.min(prev + 1, 3));
            else { let maxIdx = 1; if (settingsTab === 'profile') maxIdx = 2; if (settingsTab === 'sync') maxIdx = 3; setSettingsFocusIndex(prev => Math.min(prev + 1, maxIdx)); }
          } else if (e.key === 'ArrowUp') setSettingsFocusIndex(prev => Math.max(prev - 1, 0));
          else if (e.key === 'ArrowRight' && settingsFocusArea === 'sidebar') { setSettingsFocusArea('content'); setSettingsFocusIndex(0); }
          else if (e.key === 'ArrowLeft' && settingsFocusArea === 'content') {
            setSettingsFocusArea('sidebar');
            if (settingsTab === 'profile') setSettingsFocusIndex(0);
            else if (settingsTab === 'home') setSettingsFocusIndex(1);
            else if (settingsTab === 'sync') setSettingsFocusIndex(2);
          } else if (e.key === 'Enter') {
            if (settingsFocusArea === 'sidebar') {
              if (settingsFocusIndex === 0) setSettingsTab('profile');
              else if (settingsFocusIndex === 1) setSettingsTab('home');
              else if (settingsFocusIndex === 2) setSettingsTab('sync');
              else if (settingsFocusIndex === 3) { setSettingsVisible(false); setUserModalVisible(true); }
            } else {
              if (settingsTab === 'profile') {
                if (settingsFocusIndex === 0) handleSelectAvatar();
                else if (settingsFocusIndex === 1) settingsNameRef.current?.focus();
              } else if (settingsTab === 'home') {
                if (settingsFocusIndex === 0) updateUser({ settings: { ...activeUser?.settings, autoPlayVideo: !(activeUser?.settings?.autoPlayVideo !== false) } });
                else if (settingsFocusIndex === 1) { setSettingsVisible(false); setHomeBgModalVisible(true); }
              } else if (settingsTab === 'sync') {
                const currentSync = activeUser?.settings?.syncPreferences || { ratingAndSummary: 'igdb', cover: 'steamgrid', background: 'steamgrid', logo: 'steamgrid' };
                if (settingsFocusIndex === 0) updateUser({ settings: { autoPlayVideo: activeUser?.settings?.autoPlayVideo ?? true, syncPreferences: { ...currentSync, ratingAndSummary: currentSync.ratingAndSummary === 'igdb' ? 'none' : 'igdb' } as any } });
                else if (settingsFocusIndex === 1) updateUser({ settings: { autoPlayVideo: activeUser?.settings?.autoPlayVideo ?? true, syncPreferences: { ...currentSync, cover: currentSync.cover === 'steamgrid' ? 'igdb' : (currentSync.cover === 'igdb' ? 'none' : 'steamgrid') } as any } });
                else if (settingsFocusIndex === 2) updateUser({ settings: { autoPlayVideo: activeUser?.settings?.autoPlayVideo ?? true, syncPreferences: { ...currentSync, background: currentSync.background === 'steamgrid' ? 'igdb' : (currentSync.background === 'igdb' ? 'none' : 'steamgrid') } as any } });
                else if (settingsFocusIndex === 3) updateUser({ settings: { autoPlayVideo: activeUser?.settings?.autoPlayVideo ?? true, syncPreferences: { ...currentSync, logo: currentSync.logo === 'steamgrid' ? 'none' : 'steamgrid' } as any } });
              }
            }
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
        if (isHomeBgModalVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') setHomeBgModalVisible(false);
          else if (e.key === 'ArrowDown') setBgModalFocusIndex(prev => Math.min(prev + 1, homeBackground ? 2 : 1));
          else if (e.key === 'ArrowUp') setBgModalFocusIndex(prev => Math.max(prev - 1, 0));
          else if (e.key === 'Enter') {
            if (bgModalFocusIndex === 0) handleSelectHomeBg();
            else if (bgModalFocusIndex === 1 && homeBackground) { setHomeBackground(null); localStorage.removeItem('home_background'); setHomeBgModalVisible(false); }
            else setHomeBgModalVisible(false);
          }
          return;
        }
        if (isRandomSelectorVisible) { if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') setRandomSelectorVisible(false); return; }
        if (isFavoritesVisible) { if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') setFavoritesVisible(false); return; }

        // --- SPATIAL NAVIGATION ---
        if (e.key === 'ArrowRight') {
          soundService.playNavigation();
          if (focusArea === 'library_grid') {
            setLibraryGridFocusIndex(prev => Math.min(prev + 1, savedGames.length - 1));
          }
          else if (focusArea === 'main_carousel') { const nextIdx = Math.min(activeIndex + 1, currentData.length - 1); setActiveIndex(nextIdx); setFocusIndex(nextIdx); }
          else if (focusArea === 'header_tabs') {
            const nextIdx = Math.min(focusIndex + 1, TABS.length - 1);
            setFocusIndex(nextIdx); setActiveTab(TABS[nextIdx]); setActiveIndex(0);
          }
          else if (focusArea === 'game_panel') {
            if (gamePanelFocusIndex === 0) {
              setGamePanelFocusIndex(1);
            } else if (gamePanelFocusIndex === 2) {
              setGamePanelFocusIndex(3);
            } else if (gamePanelFocusIndex >= 100) {
              setGamePanelFocusIndex(prev => Math.min(prev + 1, 100 + steamMedia.length - 1));
            } else if (gamePanelFocusIndex >= 4) {
              setGamePanelFocusIndex(prev => Math.min(prev + 1, 4 + steamNews.length - 1));
            }
          }
          else if (focusArea === 'welcome_widgets') {
            if (focusIndex < 4) setFocusIndex(prev => prev + 1);
            else if (focusIndex >= 5 && focusIndex < 9) setFocusIndex(prev => prev + 1);
          }
          return;
        }
        if (e.key === 'ArrowLeft') {
          soundService.playNavigation();
          if (focusArea === 'library_grid') {
            setLibraryGridFocusIndex(prev => Math.max(prev - 1, 0));
          }
          else if (focusArea === 'main_carousel') { const nextIdx = Math.max(activeIndex - 1, 0); setActiveIndex(nextIdx); setFocusIndex(nextIdx); }
          else if (focusArea === 'header_tabs') {
            const nextIdx = Math.max(focusIndex - 1, 0);
            setFocusIndex(nextIdx); setActiveTab(TABS[nextIdx]); setActiveIndex(0);
          }
          else if (focusArea === 'header_avatar') {
            setFocusArea('header_tabs');
            setFocusIndex(TABS.indexOf(activeTab));
          }
          else if (focusArea === 'game_panel') {
            if (gamePanelFocusIndex === 1) {
              setGamePanelFocusIndex(0);
            } else if (gamePanelFocusIndex === 3) {
              setGamePanelFocusIndex(2);
            } else if (gamePanelFocusIndex >= 100) {
              setGamePanelFocusIndex(prev => Math.max(prev - 1, 100));
            } else if (gamePanelFocusIndex >= 4) {
              setGamePanelFocusIndex(prev => Math.max(prev - 1, 4));
            }
          }
          else if (focusArea === 'welcome_widgets') {
            if (focusIndex > 0 && focusIndex <= 4) setFocusIndex(prev => prev - 1);
            else if (focusIndex > 5 && focusIndex <= 9) setFocusIndex(prev => prev - 1);
          }
          return;
        }
        if (e.key === 'ArrowDown') {
          soundService.playNavigation();
          if (focusArea === 'library_grid') {
            setLibraryGridFocusIndex(prev => Math.min(prev + 5, savedGames.length - 1));
          }
          else if (focusArea === 'header_user' || focusArea === 'header_tabs' || focusArea === 'header_avatar') { setFocusArea('main_carousel'); setFocusIndex(activeIndex); }
          else if (focusArea === 'main_carousel') {
            if (activeItem?.id === 'more_library') {
              setFocusArea('library_grid');
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
            if (gamePanelFocusIndex === 0) {
              setGamePanelFocusIndex(2);
            } else if (gamePanelFocusIndex === 1) {
              setGamePanelFocusIndex(3);
            } else if (gamePanelFocusIndex === 2 || gamePanelFocusIndex === 3) {
              if (steamMedia.length > 0) {
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
          else if (focusArea === 'welcome_widgets') {
            if (focusIndex < 5) setFocusIndex(prev => prev + 5);
          }
          return;
        }
        if (e.key === 'ArrowUp') {
          soundService.playNavigation();
          if (focusArea === 'library_grid') {
            if (libraryGridFocusIndex < 5) {
              setFocusArea('main_carousel');
            } else {
              setLibraryGridFocusIndex(prev => Math.max(prev - 5, 0));
            }
          }
          else if (focusArea === 'game_panel') {
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
              if (steamMedia.length > 0) {
                setGamePanelFocusIndex(100);
              } else {
                const newsIndex = gamePanelFocusIndex - 4;
                setGamePanelFocusIndex(newsIndex % 2 === 0 ? 2 : 3);
              }
            }
          }
          else if (focusArea === 'main_carousel') { setFocusArea('header_tabs'); setFocusIndex(TABS.indexOf(activeTab)); }
          else if (focusArea === 'header_tabs') { setFocusArea('header_avatar'); setFocusIndex(0); }
          else if (focusArea === 'welcome_widgets') {
            if (focusIndex >= 5) {
              setFocusIndex(prev => prev - 5);
            } else {
              setFocusArea('main_carousel');
              setFocusIndex(activeIndex);
            }
          }
          return;
        }
        if (e.key === 'Enter') {
          soundService.playActivation();
          if (focusArea === 'header_avatar') {
            setIsProfileMenuOpen(true);
            setProfileMenuFocusIndex(0);
            return;
          }
          if (focusArea === 'library_grid') {
            const game = savedGames[libraryGridFocusIndex];
            if (game) { setSelectedItem(game); setDetailVisible(true); }
            return;
          }
          if (focusArea === 'game_panel') {
            if (gamePanelFocusIndex === 0 || gamePanelFocusIndex === 1) {
              if (activeItem) { handleLaunchApp(activeItem); }
            } else if (gamePanelFocusIndex >= 100) {
              const mediaItem = steamMedia[gamePanelFocusIndex - 100];
              if (mediaItem) {
                if (mediaItem.type === 'movie' && mediaItem.mp4_url) {
                  Linking.openURL(mediaItem.mp4_url);
                } else if (mediaItem.full) {
                  Linking.openURL(mediaItem.full);
                }
              }
            } else if (gamePanelFocusIndex >= 4) {
              const newsItem = steamNews[gamePanelFocusIndex - 4];
              if (newsItem && newsItem.url) {
                Linking.openURL(newsItem.url);
              }
            }
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
          } else if (focusArea === 'header_user') { handleSystemNavAction(modalSelectedIndex); }
          return;
        }
        if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
          soundService.playNavigation();
          const direction = (e.key === 'q' || e.key === 'Q') ? -1 : 1;
          setActiveTab(prev => {
            const idx = TABS.indexOf(prev);
            const nextIdx = idx + direction;
            if (nextIdx >= 0 && nextIdx < TABS.length) {
              setActiveIndex(0);
              if (focusArea === 'header_tabs') setFocusIndex(nextIdx);
              return TABS[nextIdx];
            }
            return prev;
          });
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeTab, currentData, activeIndex, focusArea, focusIndex, gamePanelFocusIndex, isAddModalVisible, isUserModalVisible, isFavoritesVisible, selectedItem, modalSelectedIndex, addModalFocusIndex, bgModalFocusIndex, settingsFocusArea, settingsFocusIndex, settingsTab, isHomeBgModalVisible, homeBackground, newApp, steamNews, isProfileMenuOpen, profileMenuFocusIndex, isOnline]);

  // Fetch Steam news when the active item changes
  useEffect(() => {
    const item = currentData[activeIndex];
    const playable = item && !item.isFolder && !item.isGrid && item.id !== '1';
    if (!playable) { setSteamNews([]); return; }
    const title = item.isLastPlayed ? (lastPlayedGame?.title || '') : (item.title || '');
    if (!title || title === 'Último Jugado') { setSteamNews([]); return; }
    setNewsLoading(true);
    setSteamNews([]);
    let cancelled = false;
    fetchSteamNewsByName(title).then(news => {
      if (!cancelled) { setSteamNews(news); setNewsLoading(false); }
    });
    return () => { cancelled = true; };
  }, [activeIndex, activeTab, lastPlayedGame?.id]);

  // Fetch Steam screenshots & trailers when the active item changes
  useEffect(() => {
    const item = currentData[activeIndex];
    const playable = item && !item.isFolder && !item.isGrid && item.id !== '1';
    if (!playable) { setSteamMedia([]); return; }
    const title = item.isLastPlayed ? (lastPlayedGame?.title || '') : (item.title || '');
    if (!title || title === 'Último Jugado') { setSteamMedia([]); return; }
    setMediaLoading(true);
    setSteamMedia([]);
    let cancelled = false;
    fetchSteamMediaByName(title).then(({ items }) => {
      if (!cancelled) { setSteamMedia(items); setMediaLoading(false); }
    });
    return () => { cancelled = true; };
  }, [activeIndex, activeTab, lastPlayedGame?.id]);

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

  // Auto-scroll carousel
  useEffect(() => {
    if (scrollRef.current) {
      const scrollX = activeIndex * ITEM_WIDTH;
      scrollRef.current.scrollTo({ x: scrollX, animated: true });
    }
  }, [activeIndex, activeTab, ITEM_WIDTH]);

  const handleLaunchApp = (item: ConsoleItem) => {
    if (!item) return;
    const targetItem = item.isLastPlayed ? (lastPlayedGame || item) : item;
    if (!targetItem || !targetItem.path) return;
    if (targetItem.path.startsWith('http')) {
      Linking.openURL(targetItem.path);
      return;
    }
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      setIsLaunching(true);
      (window as any).electronAPI.launchApp(targetItem.id, targetItem.path).then(() => {
        loadApps();
        setTimeout(() => setIsLaunching(false), 4000);
      });
    }
  };

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
        else alert('Aún no has jugado a ningún juego.');
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
    } else { alert('Por favor completa el título y la ruta del ejecutable.'); }
  };

  const handleSelectHomeBg = async () => {
    if ((window as any).electronAPI) {
      const img = await (window as any).electronAPI.selectImage();
      if (img) {
        const bgUri = `local-file:///${img.replace(/\\/g, '/')}`;
        setHomeBackground({ uri: bgUri });
        localStorage.setItem('home_background', bgUri);
        setHomeBgModalVisible(false);
      }
    }
  };

  const handleSelectAvatar = async () => {
    if ((window as any).electronAPI) {
      const img = await (window as any).electronAPI.selectImage();
      if (img) { const avatarUri = `local-file:///${img.replace(/\\/g, '/')}`; updateUser({ avatar: avatarUri }); }
    }
  };

  const currentBg = (activeTab === 'Games' && activeIndex === 1)
    ? (homeBackground || require('@/assets/images/FondoDefault2.jpg'))
    : (currentData[activeIndex]?.isLastPlayed ? lastPlayedGame?.backgroundImage : (currentData[activeIndex]?.backgroundImage || require('@/assets/images/FondoDefault2.jpg')));
  const currentBackgroundVideo =
    activeTab === 'Games' && activeIndex === 0
      ? currentData[activeIndex]?.backgroundVideo
      : null;
  useEffect(() => {
    if (activeLayer === 'A') {
      if (currentBg !== bgA) {
        setBgB(currentBg);
        setActiveLayer('B');
        fade.value = withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) });
      }
    } else {
      if (currentBg !== bgB) {
        setBgA(currentBg);
        setActiveLayer('A');
        fade.value = withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.quad) });
      }
    }
  }, [currentBg]);

  useEffect(() => { if (currentBg && !bgA && !bgB) setBgA(currentBg); }, []);

  const animatedStyleB = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: interpolate(fade.value, [0, 1], [1.04, 1]) }],
  }));

  const animatedStyleA = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(fade.value, [0, 1], [1, 1.04]) }],
  }));

  // Get the active item info for the bottom panel
  const activeItem = currentData[activeIndex];
  const displayTitle = activeItem?.isLastPlayed ? (lastPlayedGame ? lastPlayedGame.title : 'Último Jugado') : activeItem?.title;
  const displayLogo = activeItem?.isLastPlayed ? lastPlayedGame?.logo : activeItem?.logo;
  const displayDesc = activeItem?.isLastPlayed ? (lastPlayedGame?.description || '') : (activeItem?.description || '');
  const canPlay = activeItem && !activeItem.isFolder && !activeItem.isGrid && activeItem.id !== '1';


  // Spinning border component — rotating conic-gradient halo around the active card
  // SpinningBorder: placed INSIDE the card's TouchableOpacity so it inherits scale/translate transforms.
  // Uses negative absolute positioning to overflow outside the card bounds.
  const SpinningBorder = ({ size }: { size: number }) => {
    if (Platform.OS !== 'web') return null;

    return (
      <>
        <style>{`
        /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
        @keyframes wc-spin-border {
          0%   { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .wc-spinning-inner {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 300%;
          height: 300%;
          animation: wc-spin-border 9.8s linear infinite;
          
          /* Cambiado 'transparent' por un color base semi-translucido elegante (rgba 255, 255, 255, 0.15) */
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

        /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE (CICLO 5s) --- */
        @keyframes wc-content-shimmer {
          0% { 
            transform: translate(-160%, -50%) rotate(48deg); 
            opacity: 0; 
          }
          15% { 
            opacity: 1; 
          }
          50% { 
            opacity: 1; 
          }
          70% { 
            transform: translate(130%, -50%) rotate(48deg); 
            opacity: 0; 
          }
          100% { 
            transform: translate(130%, -50%) rotate(48deg); 
            opacity: 0; 
          }
        }
        .wc-shimmer-line {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 140%; 
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
      `}</style>

        {/* CAPA ATRÁS: Borde Giratorio */}
        <View
          style={{
            position: 'absolute',
            top: 1,
            left: 11,
            right: 11,
            bottom: 1,
            borderRadius: 20,
            zIndex: -1,
            overflow: 'hidden',
          } as any}
          pointerEvents="none"
        >
          <div className="wc-spinning-inner" />
        </View>

        {/* CAPA ADELANTE: Brillo Adaptado Amplio */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 10,
            right: 10,
            bottom: 0,
            borderRadius: 22,
            zIndex: 5,
            overflow: 'hidden',
          } as any}
          pointerEvents="none"
        >
          <div className="wc-shimmer-line" />
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* === BACKGROUND: Dual Layer Crossfade === */}
      <View style={StyleSheet.absoluteFill}>

        {/* VIDEO DE FONDO */}
        {currentBackgroundVideo ? (
          <Video
            source={currentBackgroundVideo}
            style={StyleSheet.absoluteFillObject}
            resizeMode={ResizeMode.COVER}
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

      {/* MINI HEADER FOR GAME PANEL FOCUS */}
      <Animated.View style={[styles.miniHeader, topBarMiniStyle]} pointerEvents="none">
        {focusArea === 'library_grid' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={require('@/assets/images/Libreria.jpeg')} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 12 }} />
            <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '200', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>Biblioteca de juegos</Text>
          </View>
        ) : focusArea === 'welcome_widgets' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={currentData[activeIndex]?.image} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 12 }} contentFit="cover" />
            <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '200', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>Welcome</Text>
          </View>
        ) : (canPlay && activeItem && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={activeItem.isLastPlayed ? (lastPlayedGame?.image ?? activeItem.image) : activeItem.image} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 12 }} />
            <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '200', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>{displayTitle}</Text>
          </View>
        ))}
      </Animated.View>

      {/* === HEADER (PS5 style) — fixed on top === */}
      <Animated.View style={[styles.header, headerStyle]}>
        {/* Left: Navigation Tabs */}
        <View style={styles.headerLeft}>
          {/* <ControlPrompt btn="L" label="" inputMode={inputMode} /> */}
          {TABS.map((tab, idx) => (
            <TouchableOpacity
              key={tab}
              id={`tab-${tab.toLowerCase()}`}
              onPress={(e) => {
                (e.currentTarget as any)?.blur?.();
                setActiveTab(tab);
                setActiveIndex(0);
                setFocusArea('main_carousel');
              }}
              activeOpacity={0.7}
              style={styles.tabTouchable}
            >
              <Text style={[
                styles.navItem,
                activeTab === tab && styles.navItemActive,
                (focusArea === 'header_tabs' && focusIndex === idx) && styles.tabFocused
              ]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
          {/* <ControlPrompt btn="R" label="" inputMode={inputMode} /> */}
        </View>

        {/* Right: Icons + Avatar + Clock */}
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons name="search" size={25} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconBtn}
            activeOpacity={0.7}
            onPress={() => { setUserModalVisible(false); setSettingsVisible(true); }}
          >
            <Ionicons name="settings-sharp" size={25} color="#fff" />
          </TouchableOpacity>

          <View style={{ position: 'relative' }}>
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
                focusArea === 'header_avatar' && styles.avatarFocused
              ]}
              activeOpacity={0.75}
            >
              {activeUser?.avatar ? (
                <Image source={{ uri: (activeUser as any).avatarBase64 || activeUser.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.defaultAvatarHeader}>
                  <Ionicons name="person" size={18} color="#FFF" />
                </View>
              )}
            </TouchableOpacity>
            <View style={[
              styles.activeStatusDot,
              { backgroundColor: isOnline ? '#4CD964' : '#8E8E93' }
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
        contentContainerStyle={styles.mainScrollContent}
        scrollEventThrottle={16}
      >
        {/* CAROUSEL ROW */}
        <Animated.View style={[styles.carouselSection, carouselStyle]}>
          {currentData.length === 0 ? (
            <View style={styles.mediaEmptyContainer}>
              <Ionicons name="film-outline" size={80} color="rgba(255,255,255,0.15)" />
              <Text style={styles.mediaEmptyText}>No hay aplicaciones de multimedia</Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: LEFT_PADDING, paddingRight: RIGHT_PADDING, marginTop: 20 }}
              snapToInterval={ITEM_WIDTH}
              snapToAlignment="start"
              decelerationRate="fast"
              scrollEventThrottle={16}
              onLayout={() => {
                if (scrollRef.current) {
                  scrollRef.current.scrollTo({ x: activeIndex * ITEM_WIDTH, animated: false });
                }
              }}
            >
              {currentData.map((item, index) => {
                const isActive = index === activeIndex;
                const isHomeCard = item.id === '1';
                const isStoreCard = item.id === '5';

                const customOpacity =
                  isHomeCard
                    ? (isActive ? 0.9 : 0.9)
                    : isStoreCard
                      ? (isActive ? 0.9 : 0.9)
                      : 1;

                let cardContent;

                if (item.id === 'more_library') {
                  cardContent = (
                    <AnimatedCardWrapper isActive={isActive} style={{ opacity: 0.75 }}>
                      <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                        {isActive && <SpinningBorder size={CARD_SIZE} />}

                        {/* 1. Añadimos overflow: 'hidden' a la tarjeta para que la imagen no se salga de las esquinas redondeadas */}
                        <BlurView intensity={40} tint="dark" style={[styles.card, styles.moreCard, isActive && styles.cardActive, { overflow: 'hidden', padding: 0 }]}>

                          {/* 2. Modificamos la imagen para que llene todo el espacio */}
                          <Image
                            source={require('@/assets/images/Libreria.jpeg')}
                            style={{
                              width: '100%',
                              height: '100%',
                              // ❌ Eliminamos tintColor para que no pinte un cuadro sólido sobre tu archivo .jpeg
                            }}
                            resizeMode="cover" // 3. "cover" asegura que llene todo el recuadro sin deformarse
                          />

                        </BlurView>
                      </TouchableOpacity>
                    </AnimatedCardWrapper>
                  );
                } else if (item.isGrid) {
                  cardContent = (
                    <AnimatedCardWrapper isActive={isActive} style={{ opacity: customOpacity }}>
                      <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                        {isActive && <SpinningBorder size={CARD_SIZE} />}
                        <View style={[styles.card, styles.folderCard, isActive && styles.cardActive]}>
                          <View style={styles.folderCardHeader}>
                            <MaterialCommunityIcons name="view-grid" size={14} color="rgba(255,255,255,0.7)" />
                            <Text style={styles.folderCardTitle}> Media</Text>
                          </View>
                          <View style={styles.folderCardContent}>
                            {(() => {
                              const favs = media.filter(m => m.isFavorite);
                              if (favs.length === 0) return <Ionicons name="apps-outline" size={28} color="rgba(255,255,255,0.2)" />;
                              if (favs.length === 1) return <Image source={favs[0].image} style={{ width: '100%', height: '100%' }} contentFit="cover" />;
                              return (
                                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                                  {favs.slice(0, 4).map((f, fi) => (
                                    <Image key={fi} source={f.image} style={{ width: '50%', height: '50%' }} contentFit="cover" />
                                  ))}
                                </View>
                              );
                            })()}
                          </View>
                        </View>
                      </TouchableOpacity>
                    </AnimatedCardWrapper>
                  );
                } else if (item.isFolder) {
                  cardContent = (
                    <AnimatedCardWrapper isActive={isActive}>
                      <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                        {isActive && <SpinningBorder size={CARD_SIZE} />}
                        <View style={[styles.card, styles.folderCard, isActive && styles.cardActive]}>
                          <View style={styles.folderCardHeader}>
                            <Ionicons name="heart" size={14} color="rgba(255,100,100,0.9)" />
                            <Text style={styles.folderCardTitle}> Favs</Text>
                          </View>
                          <View style={styles.folderCardContent}>
                            {(() => {
                              const favs = games.filter(g => g.isFavorite);
                              if (favs.length === 0) return <Ionicons name="star-outline" size={28} color="rgba(255,255,255,0.2)" />;
                              if (favs.length === 1) return <Image source={favs[0].image} style={{ width: '100%', height: '100%' }} contentFit="cover" />;
                              return (
                                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                                  {favs.slice(0, 4).map((f, fi) => (
                                    <Image key={fi} source={f.image} style={{ width: '50%', height: '50%' }} contentFit="cover" />
                                  ))}
                                </View>
                              );
                            })()}
                          </View>
                        </View>
                      </TouchableOpacity>
                    </AnimatedCardWrapper>
                  );
                } else if (item.isLastPlayed && !lastPlayedGame) {
                  cardContent = (
                    <AnimatedCardWrapper isActive={isActive} style={{ opacity: customOpacity }}>
                      <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                        {isActive && <SpinningBorder size={CARD_SIZE} />}
                        <BlurView intensity={30} tint="dark" style={[styles.card, styles.emptyCard, isActive && styles.cardActive]}>
                          <MaterialCommunityIcons name="history" size={32} color={isActive ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)"} />
                        </BlurView>
                      </TouchableOpacity>
                    </AnimatedCardWrapper>
                  );
                } else {
                  const imgSource = item.isLastPlayed ? (lastPlayedGame?.image ?? item.image) : item.image;
                  cardContent = (
                    <AnimatedCardWrapper isActive={isActive} style={{ opacity: customOpacity }}>
                      <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                        {isActive && <SpinningBorder size={CARD_SIZE} />}
                        <Image source={imgSource} style={[styles.card, isActive && styles.cardActive]} contentFit="cover" />
                      </TouchableOpacity>
                    </AnimatedCardWrapper>
                  );
                }

                return (
                  <View key={item.id} style={{ position: 'relative', overflow: 'visible', zIndex: isActive ? 10 : 1, opacity: customOpacity }}>
                    {cardContent}
                    {isActive && item.id !== 'more_library' && (
                      <View style={styles.activeLabelContainer}>
                        <View style={styles.platformBadge}>
                          <Text style={styles.platformBadgeText}>
                            {item.isFolder || item.isGrid ? 'FAVS' : (item.platform || 'PS5')}
                          </Text>
                        </View>
                        <Text style={styles.activeGameTitle} numberOfLines={1}>
                          {item.isLastPlayed ? (lastPlayedGame?.title || 'Último Jugado') : item.title}
                        </Text>

                        {/* Options button to open context menu via mouse/click */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={{ marginLeft: 6, paddingHorizontal: 4, display: 'none' }}
                          onPress={() => {
                            setIsContextMenuOpen(prev => !prev);
                            setContextMenuFocusIndex(0);
                          }}
                        >
                          <Ionicons name="ellipsis-vertical" size={14} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Absolutely positioned context menu */}
                    {isActive && item.id !== 'more_library' && isContextMenuOpen && (
                      <GameContextMenu
                        focusedIndex={contextMenuFocusIndex}
                        onPressItem={handleContextMenuAction}
                      />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>

        {/* LIBRARY GRID SECTION */}
        {isLibraryFocused && (
          <LibraryGrid
            games={savedGames}
            isFocused={focusArea === 'library_grid'}
            focusedIndex={libraryGridFocusIndex}
            onItemPress={(index, game) => { setSelectedItem(game); setDetailVisible(true); }}
          />
        )}

        {/* GAME INFO PANEL (bottom-left, PS5 style) */}
        {focusArea !== 'library_grid' && (
          <Animated.View style={[styles.gameInfoPanel, gameInfoPanelStyle]}>
            <Animated.View style={spacerStyle}>
              <Animated.View style={topPanelStyle}>
                {/* Logo or title */}
                {displayLogo ? (
                  <Animated.View key={`logo-${activeIndex}`} entering={FadeInDown.duration(400)}>
                    <Image source={displayLogo} style={styles.gameLogo} contentFit="contain" />
                  </Animated.View>
                ) : (
                  <Animated.View key={`title-${activeIndex}`} entering={FadeInDown.duration(400)}>
                    {activeItem?.id !== '1' && (
                      <Text style={styles.gameTitle} numberOfLines={2}>{displayTitle}</Text>
                    )}
                  </Animated.View>
                )}

                {/* Description
              {displayDesc ? (
                <Text style={styles.gameDesc} numberOfLines={2}>{displayDesc}</Text>
              ) : null} */}

                {/* Action Buttons */}
                {canPlay && (
                  <Animated.View key={`buttons-${activeIndex}`} entering={FadeInDown.duration(400).delay(60)} style={styles.actionButtons}>
                    <TouchableOpacity
                      id="play-btn"
                      style={[
                        styles.playBtn,
                        focusArea === 'game_panel' && gamePanelFocusIndex === 0 && styles.playBtnFocused
                      ]}
                      activeOpacity={0.85}
                      onPress={() => {
                        if (activeItem) { handleLaunchApp(activeItem); }
                      }}
                    >
                      <Text style={[
                        styles.playBtnText,
                        focusArea === 'game_panel' && gamePanelFocusIndex === 0 && styles.playBtnTextFocused
                      ]}>Jugar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      id="more-btn"
                      style={[
                        styles.moreBtn,
                        focusArea === 'game_panel' && gamePanelFocusIndex === 1 && styles.moreBtnFocused
                      ]}
                      activeOpacity={0.8}
                      onPress={() => {
                        if (activeItem) { handleLaunchApp(activeItem); }
                      }}
                    >
                      <Text style={[
                        styles.moreBtnText,
                        focusArea === 'game_panel' && gamePanelFocusIndex === 1 && styles.moreBtnTextFocused
                      ]}>···</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </Animated.View>
            </Animated.View>
            {/* el siguiente Animated.View es el que proiporciona la animacion de subir al entrar a una vista */}


            <style>{`
            @keyframes widget-shimmer {
              0% {
                transform: translate(-160%, 120%) rotate(-45deg);
                opacity: 0;
              }

              15% {
                opacity: 1;
              }

              50% {
                opacity: 1;
              }

              70% {
                transform: translate(130%, -120%) rotate(-45deg);
                opacity: 0;
              }

              100% {
                transform: translate(130%, -120%) rotate(-45deg);
                opacity: 0;
              }
            }

            .widget-shimmer-line {
              position: absolute;

              top: 50%;
              left: -60%;

              width: 140%;
              height: 420%;

              background: linear-gradient(
                to right,
                transparent 0%,
                rgba(255,255,255,0.01) 20%,
                rgba(255,255,255,0.18) 50%,
                rgba(255,255,255,0.01) 80%,
                transparent 100%
              );

              animation: widget-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;

              pointer-events: none;

              z-index: 2;
            }
          `}</style>

            {activeItem?.id === '1' && (
              <Animated.View key="ea-sports-widget" entering={FadeInDown.duration(400).delay(60)} style={widgetContainerStyle2}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={{ flex: 1 }}
                  onPress={() => {
                    setFocusArea('welcome_widgets');
                    setFocusIndex(0);
                  }}
                >
                  <View style={[styles.welcomeWidgetCard, { maxWidth: 347 }, { bottom: 70 }, (focusArea === 'welcome_widgets' && focusIndex === 10) && styles.welcomeWidgetCardFocused]}>
                    {/* DEGRADADO */}
                    {Platform.OS === 'web' && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,

                          background: `
                              linear-gradient(
                                45deg,
                                rgba(120,220,255,0.14) 0%,
                                rgba(120,220,255,0.06) 18%,
                                rgba(255,255,255,0.02) 35%,
                                rgba(255,255,255,0.00) 58%,
                                rgba(0,0,0,0.00) 100%
                              )
                            `,

                          pointerEvents: 'none',
                          zIndex: 1,

                          opacity:
                            focusArea === 'welcome_widgets'
                              ? 1
                              : 0,

                          transition:
                            'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                      />
                    )}

                    {/* SHIMMER */}
                    {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 10 && (
                      <div
                        className="widget-shimmer-line"
                        style={{
                          animationDuration: '7s',
                          opacity: 0.8,
                        }}
                      />
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="battery-full" size={11} color="#fff" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.widgetTitle} numberOfLines={1}>
                          Obtenén EA Sports FC 26 con PlayStation Plus
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}

            <Animated.View key="welcome-widgets" entering={FadeInDown.duration(400).delay(60)} style={widgetContainerStyle}>
              {/* === WELCOME WIDGETS (only when Welcome card is active) === */}
              {/* <PS5WidgetRow /> */}
              {activeItem?.id === '1' && (
                <View style={styles.widgetGrid}>
                  {/* Row 1 */}
                  <View style={styles.widgetRow}>
                    {/* Controller Widget */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1 }}
                      onPress={() => {
                        setFocusArea('welcome_widgets');
                        setFocusIndex(0);
                      }}
                    >
                      <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 0) && styles.welcomeWidgetCardFocused]}>
                        {/* DEGRADADO */}
                        {Platform.OS === 'web' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,

                              background: `
                              linear-gradient(
                                45deg,
                                rgba(120,220,255,0.14) 0%,
                                rgba(120,220,255,0.06) 18%,
                                rgba(255,255,255,0.02) 35%,
                                rgba(255,255,255,0.00) 58%,
                                rgba(0,0,0,0.00) 100%
                              )
                            `,

                              pointerEvents: 'none',
                              zIndex: 1,

                              opacity:
                                focusArea === 'welcome_widgets'
                                  ? 1
                                  : 0,

                              transition:
                                'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                          />
                        )}

                        {/* SHIMMER */}
                        {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 0 && (
                          <div
                            className="widget-shimmer-line"
                            style={{
                              animationDuration: '7s',
                              opacity: 0.8,
                            }}
                          />
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={[styles.widgetIconWrap, { width: 80, height: 80, borderRadius: 50, border: "5px solid #4CD964" }]}>
                            <Text style={{ color: "#FFF" }}>1</Text>
                            <MaterialCommunityIcons name="gamepad-variant" size={20} color="#FFF" />
                            <Ionicons name="battery-full" size={11} color="#fff" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.widgetTitle} numberOfLines={1}>
                              {gamepadInfo.connected ? gamepadInfo.name.split('(')[0].trim() : 'Control inalambrico DualSense'}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                              <Text style={styles.widgetSubtitle}>{gamepadInfo.connected ? `${Math.round(gamepadInfo.battery * 100)}%` : '75%'}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Trophies Widget */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1 }}
                      onPress={() => {
                        setFocusArea('welcome_widgets');
                        setFocusIndex(1);
                      }}
                    >
                      <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 1) && styles.welcomeWidgetCardFocused]}>
                        {/* DEGRADADO */}
                        {Platform.OS === 'web' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,

                              background: `
                              linear-gradient(
                                45deg,
                                rgba(120,220,255,0.14) 0%,
                                rgba(120,220,255,0.06) 18%,
                                rgba(255,255,255,0.02) 35%,
                                rgba(255,255,255,0.00) 58%,
                                rgba(0,0,0,0.00) 100%
                              )
                            `,

                              pointerEvents: 'none',
                              zIndex: 1,

                              opacity:
                                focusArea === 'welcome_widgets'
                                  ? 1
                                  : 0,

                              transition:
                                'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                          />
                        )}

                        {/* SHIMMER */}
                        {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 1 && (
                          <div
                            className="widget-shimmer-line"
                            style={{
                              animationDuration: '7s',
                              opacity: 0.8,
                            }}
                          />
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <MaterialCommunityIcons name="trophy" size={14} color="#FFD700" />
                            <Text style={styles.widgetTitle}>Trofeos</Text>
                          </View>
                          <Text style={styles.widgetBadge}>457</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {[
                            { color: '#B8D4E8', count: 0 },
                            { color: '#FFD700', count: 13 },
                            { color: '#C0C0C0', count: 45 },
                            { color: '#CD7F32', count: 399 },
                          ].map((t, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              <MaterialCommunityIcons name="trophy" size={11} color={t.color} />
                              <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{t.count}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Store Widget */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1 }}
                      onPress={() => {
                        setFocusArea('welcome_widgets');
                        setFocusIndex(2);
                        Linking.openURL('https://store.playstation.com');
                      }}
                    >
                      <View style={[styles.welcomeWidgetCard, {
                        backgroundImage: 'url(https://clan.fastly.steamstatic.com/images/34133273/15c8c42be7ab69aa6a47a2dcf73a945383e0a07f.jpg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }, (focusArea === 'welcome_widgets' && focusIndex === 2) && styles.welcomeWidgetCardFocused]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <Ionicons name="bag-handle" size={13} color="#0070D1" />
                          <Text style={styles.widgetTitle}>PlayStation Store</Text>
                        </View>
                        <Text style={styles.widgetSubtitle} numberOfLines={1}>Últimas ofertas disponibles</Text>
                        <Text style={{ fontSize: 10, fontWeight: "bold", marginTop: 15, color: "#fff" }} numberOfLines={1}>US$69.99</Text>
                      </View>
                    </TouchableOpacity>

                    {/* News Widget */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1 }}
                      onPress={() => {
                        setFocusArea('welcome_widgets');
                        setFocusIndex(3);
                      }}
                    >
                      <View style={[styles.welcomeWidgetCard, { flexDirection: 'row', justifyContent: 'space-between' }, (focusArea === 'welcome_widgets' && focusIndex === 3) && styles.welcomeWidgetCardFocused]}>
                        {/* DEGRADADO */}
                        {Platform.OS === 'web' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,

                              background: `
                                linear-gradient(
                                  45deg,
                                  rgba(120,220,255,0.14) 0%,
                                  rgba(120,220,255,0.06) 18%,
                                  rgba(255,255,255,0.02) 35%,
                                  rgba(255,255,255,0.00) 58%,
                                  rgba(0,0,0,0.00) 100%
                                )
                              `,

                              pointerEvents: 'none',
                              zIndex: 1,

                              opacity:
                                focusArea === 'welcome_widgets'
                                  ? 1
                                  : 0,

                              transition:
                                'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                          />
                        )}

                        {/* SHIMMER */}
                        {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 3 && (
                          <div
                            className="widget-shimmer-line"
                            style={{
                              animationDuration: '7s',
                              opacity: 0.8,
                            }}
                          />
                        )}
                        <View style={{ flexDirection: 'column', alignItems: 'start' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 15 }}>
                            <Ionicons name="newspaper" size={13} color="rgba(255,255,255,0.8)" />
                            <Text style={styles.widgetTitle}>Noticias</Text>
                          </View>
                          <Text style={styles.widgetSubtitle}>Descubre juegos nuevos</Text>
                          <Text style={styles.widgetSubtitle}>Apex Legends | Ayer</Text>
                        </View>
                        <Image source={require("../../assets/images/Store.png")} style={{ width: 70, height: 70, borderRadius: 6 }} contentFit="cover" />
                      </View>
                    </TouchableOpacity>

                    {/* Agregar Juego Widget */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1 }}
                      onPress={() => {
                        setFocusArea('welcome_widgets');
                        setFocusIndex(4);
                        setAddModalVisible(true);
                      }}
                    >
                      <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 4) && styles.welcomeWidgetCardFocused]}>
                        {/* DEGRADADO */}
                        {Platform.OS === 'web' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,

                              background: `
                                linear-gradient(
                                  45deg,
                                  rgba(120,220,255,0.14) 0%,
                                  rgba(120,220,255,0.06) 18%,
                                  rgba(255,255,255,0.02) 35%,
                                  rgba(255,255,255,0.00) 58%,
                                  rgba(0,0,0,0.00) 100%
                                )
                              `,

                              pointerEvents: 'none',
                              zIndex: 1,

                              opacity:
                                focusArea === 'welcome_widgets'
                                  ? 1
                                  : 0,

                              transition:
                                'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                          />
                        )}

                        {/* SHIMMER */}
                        {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 4 && (
                          <div
                            className="widget-shimmer-line"
                            style={{
                              animationDuration: '7s',
                              opacity: 0.8,
                            }}
                          />
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={styles.widgetIconWrap}>
                            <Ionicons name="add" size={20} color="#FFF" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.widgetTitle}>Agregar Juego</Text>
                            <Text style={styles.widgetSubtitle} numberOfLines={1}>Accesos directos</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Row 2 */}
                  <View style={styles.widgetRow}>
                    {/* Recently Played Widget */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1 }}
                      onPress={() => {
                        setFocusArea('welcome_widgets');
                        setFocusIndex(5);
                        if (lastPlayedGame) handleLaunchApp(lastPlayedGame);
                      }}
                    >
                      {/* jugados recientemente */}
                      <View style={[styles.welcomeWidgetCard, { flexDirection: 'row', justifyContent: 'space-between' }, (focusArea === 'welcome_widgets' && focusIndex === 5) && styles.welcomeWidgetCardFocused]}>
                        {/* DEGRADADO */}
                        {Platform.OS === 'web' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,

                              background: `
                              linear-gradient(
                                45deg,
                                rgba(120,220,255,0.14) 0%,
                                rgba(120,220,255,0.06) 18%,
                                rgba(255,255,255,0.02) 35%,
                                rgba(255,255,255,0.00) 58%,
                                rgba(0,0,0,0.00) 100%
                              )
                            `,

                              pointerEvents: 'none',
                              zIndex: 1,

                              opacity:
                                focusArea === 'welcome_widgets'
                                  ? 1
                                  : 0,

                              transition:
                                'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                          />
                        )}

                        {/* SHIMMER */}
                        {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 5 && (
                          <div
                            className="widget-shimmer-line"
                            style={{
                              animationDuration: '7s',
                              opacity: 0.8,
                            }}
                          />
                        )}
                        <View style={{ flexDirection: 'column', alignItems: 'start', gap: 5, marginBottom: 6, maxWidth: 160 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Ionicons name="game-controller" size={13} color="rgba(255,255,255,0.8)" />
                            <Text style={styles.widgetTitle}>Jugados recientemente</Text>
                          </View>
                          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600', flex: 1 }} numberOfLines={1}>{lastPlayedGame.title}</Text>
                          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600', flex: 1 }}><MaterialCommunityIcons name="clock" size={13} color="rgba(255,255,255,0.8)" style={{ marginRight: 5 }} />2 horas</Text>
                        </View>
                        {lastPlayedGame ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Image source={lastPlayedGame.image} style={{ width: 70, height: 70, borderRadius: 6 }} contentFit="cover" />
                          </View>
                        ) : (
                          <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, fontStyle: 'italic' }}>Sin juegos recientes</Text>
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Messages Widget */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1 }}
                      onPress={() => {
                        setFocusArea('welcome_widgets');
                        setFocusIndex(6);
                      }}
                    >
                      <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 6) && styles.welcomeWidgetCardFocused]}>
                        {/* DEGRADADO */}
                        {Platform.OS === 'web' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,

                              background: `
                                linear-gradient(
                                  45deg,
                                  rgba(120,220,255,0.14) 0%,
                                  rgba(120,220,255,0.06) 18%,
                                  rgba(255,255,255,0.02) 35%,
                                  rgba(255,255,255,0.00) 58%,
                                  rgba(0,0,0,0.00) 100%
                                )
                              `,

                              pointerEvents: 'none',
                              zIndex: 1,

                              opacity:
                                focusArea === 'welcome_widgets'
                                  ? 1
                                  : 0,

                              transition:
                                'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                          />
                        )}

                        {/* SHIMMER */}
                        {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 6 && (
                          <div
                            className="widget-shimmer-line"
                            style={{
                              animationDuration: '7s',
                              opacity: 0.8,
                            }}
                          />
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                          <Ionicons name="chatbubble" size={13} style={{ marginBottom: 9 }} color="rgba(255,255,255,0.8)" />
                          <Text style={[styles.widgetTitle, { marginBottom: 9 }]}>Mensajes</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 36, height: 36, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                            <Ionicons name="person" size={13} color="rgba(255,255,255,0.5)" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }} numberOfLines={1}>{activeUser?.name || 'Usuario'}</Text>
                            <Text style={styles.widgetSubtitle}>Ayer</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Storage Widget */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1 }}
                      onPress={() => {
                        setFocusArea('welcome_widgets');
                        setFocusIndex(7);
                      }}
                    >
                      <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 7) && styles.welcomeWidgetCardFocused]}>
                        {/* DEGRADADO */}
                        {Platform.OS === 'web' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,

                              background: `
                                linear-gradient(
                                  45deg,
                                  rgba(120,220,255,0.14) 0%,
                                  rgba(120,220,255,0.06) 18%,
                                  rgba(255,255,255,0.02) 35%,
                                  rgba(255,255,255,0.00) 58%,
                                  rgba(0,0,0,0.00) 100%
                                )
                              `,

                              pointerEvents: 'none',
                              zIndex: 1,

                              opacity:
                                focusArea === 'welcome_widgets'
                                  ? 1
                                  : 0,

                              transition:
                                'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                          />
                        )}

                        {/* SHIMMER */}
                        {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 7 && (
                          <div
                            className="widget-shimmer-line"
                            style={{
                              animationDuration: '7s',
                              opacity: 0.8,
                            }}
                          />
                        )}
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <MaterialCommunityIcons name="harddisk" size={13} color="rgba(255,255,255,0.8)" />
                            <Text style={styles.widgetTitle}>Almacenamiento</Text>
                          </View>
                        </View>

                        {/* Espacio libre */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <Text style={styles.widgetSubtitle}>
                            <MaterialCommunityIcons name="circle" size={13} color="rgba(255,255,255,0.4)" style={{ marginRight: 5 }} /> Espacio libre
                          </Text>
                          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>
                            {storageInfo.freeGB > 0 ? `${storageInfo.freeGB.toFixed(1)} GB` : '36.47 GB'}
                          </Text>
                        </View>

                        {/* Barra multicolor */}
                        <View style={{ height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexDirection: 'row' }}>
                          {/* Segmento usado — azul */}
                          <View style={{
                            height: '100%',
                            // borderTopRightRadius: 5,
                            // borderBottomRightRadius: 5,
                            width: `${storageInfo.percent > 0 ? storageInfo.percent : 65}%`,
                            backgroundColor: '#0070D1',
                          }} />
                          {/* Segmento adicional — morado oscuro, ocupa el resto hasta ~68% */}
                          <View style={{
                            height: '100%',
                            width: `${Math.max(0, (storageInfo.percent > 65 ? storageInfo.percent : 63) - (storageInfo.percent > 0 ? storageInfo.percent : 65))}%`,
                            backgroundColor: '#3c1afaff',
                          }} />
                          <View style={{
                            height: '100%',
                            width: `${Math.max(0, (storageInfo.percent > 63 ? storageInfo.percent : 65) - (storageInfo.percent > 0 ? storageInfo.percent : 65))}%`,
                            backgroundColor: '#fa6c1aff',
                          }} />
                          <View style={{
                            height: '100%',
                            borderTopRightRadius: 5,
                            borderBottomRightRadius: 5,
                            width: `${Math.max(0, (storageInfo.percent > 65 ? storageInfo.percent : 79) - (storageInfo.percent > 0 ? storageInfo.percent : 65))}%`,
                            backgroundColor: '#c2c2c2ff',
                          }} />
                          {/* El resto queda transparente por el backgroundColor del contenedor */}
                        </View>

                      </View>
                    </TouchableOpacity>

                    {/* Wishlist Widget */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1 }}
                      onPress={() => {
                        setFocusArea('welcome_widgets');
                        setFocusIndex(8);
                      }}
                    >
                      <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 8) && styles.welcomeWidgetCardFocused]}>
                        {/* DEGRADADO */}
                        {Platform.OS === 'web' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,

                              background: `
                                linear-gradient(
                                  45deg,
                                  rgba(120,220,255,0.14) 0%,
                                  rgba(120,220,255,0.06) 18%,
                                  rgba(255,255,255,0.02) 35%,
                                  rgba(255,255,255,0.00) 58%,
                                  rgba(0,0,0,0.00) 100%
                                )
                              `,

                              pointerEvents: 'none',
                              zIndex: 1,

                              opacity:
                                focusArea === 'welcome_widgets'
                                  ? 1
                                  : 0,

                              transition:
                                'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                          />
                        )}

                        {/* SHIMMER */}
                        {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 8 && (
                          <div
                            className="widget-shimmer-line"
                            style={{
                              animationDuration: '7s',
                              opacity: 0.8,
                            }}
                          />
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                          <Ionicons name="heart" size={13} color="#FF6B6B" />
                          <Text style={styles.widgetTitle}>Lista de deseos</Text>
                        </View>
                        <Text style={styles.widgetSubtitle}>Ver tu lista de deseos</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Cambiar Fondo Widget */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1 }}
                      onPress={() => {
                        setFocusArea('welcome_widgets');
                        setFocusIndex(9);
                        setHomeBgModalVisible(true);
                      }}
                    >
                      <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 9) && styles.welcomeWidgetCardFocused]}>
                        {/* DEGRADADO */}
                        {Platform.OS === 'web' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,

                              background: `
                                linear-gradient(
                                  45deg,
                                  rgba(120,220,255,0.14) 0%,
                                  rgba(120,220,255,0.06) 18%,
                                  rgba(255,255,255,0.02) 35%,
                                  rgba(255,255,255,0.00) 58%,
                                  rgba(0,0,0,0.00) 100%
                                )
                              `,

                              pointerEvents: 'none',
                              zIndex: 1,

                              opacity:
                                focusArea === 'welcome_widgets'
                                  ? 1
                                  : 0,

                              transition:
                                'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                          />
                        )}

                        {/* SHIMMER */}
                        {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 9 && (
                          <div
                            className="widget-shimmer-line"
                            style={{
                              animationDuration: '7s',
                              opacity: 0.8,
                            }}
                          />
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={styles.widgetIconWrap}>
                            <Ionicons name="image-outline" size={17} color="#FFF" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.widgetTitle}>Cambiar Fondo</Text>
                            <Text style={styles.widgetSubtitle} numberOfLines={1}>Personaliza tu consola</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Trophies & Friends Cards — animadas al ocultarse cuando se enfoca capturas */}
              {canPlay && (
                <Animated.View key={`cards-${activeIndex}`} entering={FadeInDown.duration(400).delay(120)} style={[styles.infoCardsRow, infoCardsStyle]}>
                  {/* Trophies Card */}
                  <BlurView intensity={28} tint="dark" style={[
                    styles.infoCard,
                    focusArea === 'game_panel' && gamePanelFocusIndex === 2 && styles.infoCardFocused
                  ]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialCommunityIcons name="trophy" size={20} color="#B0B0FF" />
                        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>1</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialCommunityIcons name="circle" size={12} color="#FFD700" />
                        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>3</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialCommunityIcons name="circle" size={12} color="#C0C0C0" />
                        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>16</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialCommunityIcons name="circle" size={12} color="#CD7F32" />
                        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>17</Text>
                      </View>
                    </View>
                    <View>
                      <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Trofeos</Text>
                      <Text style={{ color: '#888', fontSize: 13 }}>37 conseguidos</Text>
                    </View>
                  </BlurView>

                  {/* Friends Playing Card */}
                  <BlurView intensity={28} tint="dark" style={[
                    styles.infoCard,
                    focusArea === 'game_panel' && gamePanelFocusIndex === 3 && styles.infoCardFocused
                  ]}>
                    <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                      {[1, 2, 3, 4, 5].map((_, i) => (
                        <View key={i} style={{
                          width: 28, height: 28, borderRadius: 14, backgroundColor: '#555',
                          borderWidth: 2, borderColor: '#111', marginLeft: i === 0 ? 0 : -10,
                          alignItems: 'center', justifyContent: 'center'
                        }}>
                          <Ionicons name="person" size={16} color="#AAA" />
                        </View>
                      ))}
                    </View>
                    <View>
                      <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Amigos que juegan</Text>
                      <Text style={{ color: '#888', fontSize: 13 }}>5 amigos tienen este juego</Text>
                    </View>
                  </BlurView>
                </Animated.View>
              )}
              {canPlay && (
                <View style={[styles.newsSectionWrapper, { width: windowWidth }]}>
                  <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '500', marginBottom: 16, paddingLeft: 50 }}>Capturas y trailers</Text>

                  {mediaLoading ? (
                    <View style={[styles.newsLoadingRow, { paddingLeft: 50 }]}>
                      <MaterialCommunityIcons name="loading" size={16} color="rgba(255,255,255,0.3)" />
                      <Text style={styles.newsEmptyText}>Cargando capturas...</Text>
                    </View>
                  ) : steamMedia.length === 0 ? (
                    <View style={[styles.newsLoadingRow, { paddingLeft: 50 }]}>
                      <Ionicons name="images-outline" size={14} color="rgba(255,255,255,0.25)" />
                      <Text style={styles.newsEmptyText}>No hay capturas disponibles en Steam</Text>
                    </View>
                  ) : (
                    <ScrollView
                      ref={mediaScrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={[styles.newsScrollContent, { paddingLeft: 50, paddingRight: 50 }]}
                    >
                      {steamMedia.map((item, idx) => {
                        const isMediaFocused = focusArea === 'game_panel' && gamePanelFocusIndex === 100 + idx;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.newsCard, isMediaFocused && styles.newsCardFocused]}
                            activeOpacity={0.8}
                            onPress={() => {
                              setGamePanelFocusIndex(100 + idx);
                              if (item.type === 'movie' && item.mp4_url) {
                                Linking.openURL(item.mp4_url);
                              } else if (item.full) {
                                Linking.openURL(item.full);
                              }
                            }}
                          >
                            {/* Thumbnail */}
                            <View style={styles.newsCardThumbnail}>
                              <Image
                                source={{ uri: item.thumbnail }}
                                style={{ width: '100%', height: '100%' }}
                                contentFit="cover"
                              />
                              {/* Play badge para trailers */}
                              {item.type === 'movie' && (
                                <View style={styles.mediaPlayBadge}>
                                  <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.92)" />
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

              {/* === NOTICIAS OFICIALES (for games, not Welcome) === */}
              {canPlay && (
                <View style={[styles.newsSectionWrapper, { width: windowWidth }]}>
                  <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '500', marginBottom: 16, paddingLeft: 50 }}>Últimas noticias</Text>

                  {newsLoading ? (
                    <View style={[styles.newsLoadingRow, { paddingLeft: 50 }]}>
                      <MaterialCommunityIcons name="loading" size={16} color="rgba(255,255,255,0.3)" />
                      <Text style={styles.newsEmptyText}>Buscando contenido...</Text>
                    </View>
                  ) : steamNews.length === 0 ? (
                    <View style={[styles.newsLoadingRow, { paddingLeft: 50 }]}>
                      <Ionicons name="newspaper-outline" size={14} color="rgba(255,255,255,0.25)" />
                      <Text style={styles.newsEmptyText}>No hay noticias disponibles</Text>
                    </View>
                  ) : (
                    <ScrollView
                      ref={newsScrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={[styles.newsScrollContent, { paddingLeft: 50, paddingRight: 50 }]}
                    >
                      {steamNews.slice(0, 8).map((item, idx) => {
                        const isNewsFocused = focusArea === 'game_panel' && gamePanelFocusIndex === 4 + idx;
                        return (
                          <TouchableOpacity
                            key={item.gid}
                            style={[
                              styles.newsCard2,
                              isNewsFocused && styles.newsCardFocused
                            ]}
                            activeOpacity={0.8}
                            onPress={() => { if (item.url) Linking.openURL(item.url); }}
                          >
                            {/* Thumbnail area */}
                            <View style={styles.newsCardThumbnail}>
                              {item.image_url ? (
                                <Image source={{ uri: item.image_url }} style={[{ width: '100%', height: '120%' }]} contentFit="cover" />
                              ) : (
                                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' }}>
                                  <Ionicons name="newspaper-outline" size={32} color="rgba(255,255,255,0.2)" />
                                </View>
                              )}
                            </View>
                            {/* Text area */}
                            <View style={styles.newsCardContent}>
                              <Text style={[styles.newsCardTitle]} numberOfLines={1}>
                                {item.title}
                              </Text>
                              {/* <Text style={styles.newsCardFooterText} numberOfLines={1}>
                                {(item.feedlabel || item.feedname || 'Steam')} | {formatSteamDate(item.date)}
                              </Text> */}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              )}
            </Animated.View>
          </Animated.View >
        )
        }
      </Animated.ScrollView >

      {/* WPS5 UI EXPANSION COMPONENTS */}
      < GameDetailView
        isVisible={isDetailVisible}
        item={selectedItem}
        onClose={() => setDetailVisible(false)}
        onRefresh={() => loadApps()}
        inputMode={inputMode}
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
      />

      <FavoritesView
        isVisible={isFavoritesVisible}
        isLaunching={isLaunching}
        inputMode={inputMode}
        favorites={currentData[activeIndex]?.isGrid ? media.filter(m => m.isFavorite) : games.filter(g => g.isFavorite)}
        onClose={() => setFavoritesVisible(false)}
        onLaunch={(item) => {
          if (item.path?.startsWith('http')) { Linking.openURL(item.path); return; }
          if (item.path && Platform.OS === 'web' && (window as any).electronAPI) {
            setIsLaunching(true);
            (window as any).electronAPI.launchApp(item.id, item.path).then(() => { loadApps(); setTimeout(() => setIsLaunching(false), 4000); });
          }
        }}
      />

      <RandomSelectorView
        isVisible={isRandomSelectorVisible}
        games={games}
        inputMode={inputMode}
        onClose={() => setRandomSelectorVisible(false)}
        onLaunch={(item) => {
          setRandomSelectorVisible(false);
          if (item.path?.startsWith('http')) { Linking.openURL(item.path); return; }
          if (item.path && Platform.OS === 'web' && (window as any).electronAPI) {
            setIsLaunching(true);
            (window as any).electronAPI.launchApp(item.id, item.path).then(() => { loadApps(); setTimeout(() => setIsLaunching(false), 4000); });
          }
        }}
      />

      {/* ADD APP MODAL */}
      <Modal visible={isAddModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Añadir Nueva Aplicación</Text>
            <TextInput
              ref={addModalTitleRef}
              style={[styles.input, addModalFocusIndex === 0 && styles.inputFocused]}
              placeholder="Nombre de la Aplicación"
              placeholderTextColor="#888"
              value={newApp.title}
              onChangeText={(text) => setNewApp({ ...newApp, title: text })}
            />
            <View style={styles.pickerRow}>
              <TouchableOpacity style={[styles.typeBtn, newApp.type === 'game' && styles.typeBtnActive, addModalFocusIndex === 1 && styles.buttonFocused]} onPress={() => setNewApp({ ...newApp, type: 'game' })}>
                <Text style={styles.typeBtnText}>Games</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, newApp.type === 'media' && styles.typeBtnActive, addModalFocusIndex === 2 && styles.buttonFocused]} onPress={() => setNewApp({ ...newApp, type: 'media', platform: '' })}>
                <Text style={styles.typeBtnText}>Media</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, newApp.type === 'web' && styles.typeBtnActive, addModalFocusIndex === 3 && styles.buttonFocused]} onPress={() => setNewApp({ ...newApp, type: 'web', platform: '' })}>
                <Text style={styles.typeBtnText}>Web</Text>
              </TouchableOpacity>
            </View>
            {newApp.type === 'game' && (
              <View style={{ marginBottom: 15 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformScrollContent}>
                  {[{ id: 'PC', icon: 'microsoft-windows' }, { id: 'PS5', icon: 'sony-playstation' }, { id: 'Xbox', icon: 'microsoft-xbox' }, { id: 'Switch', icon: 'nintendo-switch' }, { id: 'Steam', icon: 'steam' }, { id: 'EA', icon: 'alpha-e-box' }, { id: 'Epic', icon: 'alpha-e-circle' }].map((plat, idx) => {
                    const focusIdx = 4 + idx;
                    return (
                      <TouchableOpacity key={plat.id} style={[styles.platformBtn, newApp.platform === plat.id && styles.platformBtnActive, addModalFocusIndex === focusIdx && styles.buttonFocused]} onPress={() => setNewApp({ ...newApp, platform: plat.id })}>
                        <MaterialCommunityIcons name={plat.icon as any} size={20} color={newApp.platform === plat.id ? '#000' : '#FFF'} />
                        <Text style={[styles.platformBtnText, newApp.platform === plat.id && styles.platformBtnTextActive]}>{plat.id}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            {newApp.type === 'web' ? (
              <TextInput ref={addModalPathRef} style={[styles.input, addModalFocusIndex === 11 && styles.inputFocused]} placeholder="URL (https://...)" placeholderTextColor="#888" value={newApp.path} onChangeText={(text) => setNewApp({ ...newApp, path: text })} />
            ) : (
              <TouchableOpacity style={[styles.fileBtn, addModalFocusIndex === 11 && styles.buttonFocused]} onPress={handleSelectExecutable}>
                <Ionicons name="folder-open" size={20} color="#FFF" />
                <Text style={styles.fileBtnText}>{newApp.path ? 'Ruta: ...' + newApp.path.slice(-20) : 'Seleccionar Ejecutable (.exe)'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.fileBtn, addModalFocusIndex === 12 && styles.buttonFocused]} onPress={handleSelectImage}>
              <Ionicons name="image" size={20} color="#FFF" />
              <Text style={styles.fileBtnText}>{newApp.image ? 'Portada: ...' + newApp.image.slice(-20) : 'Portada (Opcional - Auto-fetch)'}</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.cancelBtn, isSaving && { opacity: 0.5 }, addModalFocusIndex === 13 && styles.buttonFocused]} onPress={() => !isSaving && setAddModalVisible(false)} disabled={isSaving}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, isSaving && { backgroundColor: '#444' }, addModalFocusIndex === 14 && styles.buttonFocused]} onPress={handleSaveApp} disabled={isSaving}>
                <Text style={styles.saveBtnText}>{isSaving ? 'Buscando assets...' : 'Guardar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* HOME BG MODAL */}
      <Modal visible={isHomeBgModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configurar Fondo de Inicio</Text>
            <Text style={{ color: '#AAA', textAlign: 'center', marginBottom: 20 }}>Selecciona una imagen personalizada para el fondo de tu pantalla principal.</Text>
            <TouchableOpacity style={[styles.fileBtn, bgModalFocusIndex === 0 && styles.buttonFocused]} onPress={handleSelectHomeBg}>
              <Ionicons name="image" size={24} color="#FFF" />
              <Text style={styles.fileBtnText}>Seleccionar Imagen de Fondo</Text>
            </TouchableOpacity>
            {homeBackground && (
              <TouchableOpacity style={[styles.fileBtn, { backgroundColor: '#442222' }, bgModalFocusIndex === 1 && styles.buttonFocused]} onPress={() => { setHomeBackground(null); localStorage.removeItem('home_background'); setHomeBgModalVisible(false); }}>
                <Ionicons name="trash" size={24} color="#FF5555" />
                <Text style={[styles.fileBtnText, { color: '#FF5555' }]}>Eliminar Fondo Personalizado</Text>
              </TouchableOpacity>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.cancelBtn, bgModalFocusIndex === (homeBackground ? 2 : 1) && styles.buttonFocused]} onPress={() => setHomeBgModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SETTINGS MODAL */}
      <Modal visible={isSettingsVisible} transparent animationType="slide">
        <View style={styles.settingsOverlay}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.settingsContainer}>
            <View style={styles.settingsSidebar}>
              <Text style={styles.settingsSidebarTitle}>Ajustes</Text>
              <TouchableOpacity style={[styles.settingsTab, settingsTab === 'profile' && styles.settingsTabActive, (settingsFocusArea === 'sidebar' && settingsFocusIndex === 0) && styles.buttonFocused]} onPress={() => setSettingsTab('profile')}>
                <Ionicons name="person-outline" size={20} color={settingsTab === 'profile' ? '#FFF' : '#AAA'} />
                <Text style={[styles.settingsTabText, settingsTab === 'profile' && styles.settingsTabTextActive]}>Perfil</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.settingsTab, settingsTab === 'home' && styles.settingsTabActive, (settingsFocusArea === 'sidebar' && settingsFocusIndex === 1) && styles.buttonFocused]} onPress={() => setSettingsTab('home')}>
                <Ionicons name="home-outline" size={20} color={settingsTab === 'home' ? '#FFF' : '#AAA'} />
                <Text style={[styles.settingsTabText, settingsTab === 'home' && styles.settingsTabTextActive]}>Inicio</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.settingsTab, settingsTab === 'sync' && styles.settingsTabActive, (settingsFocusArea === 'sidebar' && settingsFocusIndex === 2) && styles.buttonFocused]} onPress={() => setSettingsTab('sync')}>
                <Ionicons name="sync-circle-outline" size={20} color={settingsTab === 'sync' ? '#FFF' : '#AAA'} />
                <Text style={[styles.settingsTabText, settingsTab === 'sync' && styles.settingsTabTextActive]}>Sincronización</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={[styles.settingsSidebarClose, (settingsFocusArea === 'sidebar' && settingsFocusIndex === 3) && styles.buttonFocused]} onPress={() => { setSettingsVisible(false); setFocusArea('header_user'); }}>
                <Ionicons name="arrow-back" size={20} color="#AAA" />
                <Text style={styles.settingsSidebarCloseText}>Volver</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.settingsMain}>
              {settingsTab === 'profile' ? (
                <ScrollView contentContainerStyle={styles.settingsScrollContentInner}>
                  <Text style={styles.settingsMainTitle}>Configuración de Perfil</Text>
                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsLabel}>Foto de Perfil</Text>
                    <TouchableOpacity onPress={handleSelectAvatar} style={[styles.settingsAvatarContainer, { borderColor: activeUser?.color || '#FFFFFF' }, (settingsFocusArea === 'content' && settingsFocusIndex === 0) && styles.buttonFocused]}>
                      {activeUser?.avatar ? (
                        <Image source={{ uri: (activeUser as any).avatarBase64 || activeUser.avatar }} style={styles.settingsAvatar} />
                      ) : (
                        <View style={styles.defaultAvatarContainer}><Ionicons name="person" size={60} color="rgba(255,255,255,0.4)" /></View>
                      )}
                      <View style={styles.settingsAvatarEditBadge}><Ionicons name="camera" size={20} color="#FFF" /></View>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsLabel}>Nombre de Usuario</Text>
                    <TextInput ref={settingsNameRef} style={[styles.settingsInput, (settingsFocusArea === 'content' && settingsFocusIndex === 1) && styles.inputFocused]} value={activeUser?.name || ''} onChangeText={(text) => updateUser({ name: text })} placeholder="Ingresa tu nombre" placeholderTextColor="#666" />
                  </View>
                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsLabel}>Color de Perfil</Text>
                    <View style={styles.colorPickerContainer}>
                      {['#FF3B30', '#00D4FF', '#FFCC00', '#4CD964', '#AF52DE', '#FF9500'].map((color) => (
                        <TouchableOpacity key={color} style={[styles.colorCircle, { backgroundColor: color }, activeUser?.color === color && styles.colorCircleActive]} onPress={() => updateUser({ color })} />
                      ))}
                      <TouchableOpacity style={[styles.colorCircle, { backgroundColor: activeUser?.color }]} onPress={() => { const el = document.getElementById('colorPicker') as any; if (el) el.click(); }}>
                        <input id="colorPicker" type="color" value={activeUser?.color} onChange={(e) => updateUser({ color: e.target.value })} style={{ display: 'none' }} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScrollView>
              ) : settingsTab === 'home' ? (
                <ScrollView contentContainerStyle={styles.settingsScrollContentInner}>
                  <Text style={styles.settingsMainTitle}>Configuración de Inicio</Text>
                  <View style={styles.settingsOptionRow}>
                    <View style={styles.settingsOptionInfo}>
                      <Text style={styles.settingsOptionLabel}>Reproducción automática de video</Text>
                      <Text style={styles.settingsOptionDesc}>Reproduce trailers de juegos automáticamente cuando seleccionas un juego en el carrusel principal.</Text>
                    </View>
                    <TouchableOpacity onPress={() => updateUser({ settings: { ...activeUser?.settings, autoPlayVideo: !(activeUser?.settings?.autoPlayVideo !== false) } })} style={[styles.toggleContainer, (activeUser?.settings?.autoPlayVideo !== false) && styles.toggleContainerActive, (settingsFocusArea === 'content' && settingsFocusIndex === 0) && styles.buttonFocused]}>
                      <View style={[styles.toggleCircle, (activeUser?.settings?.autoPlayVideo !== false) && styles.toggleCircleActive]} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsLabel}>Fondo de Pantalla</Text>
                    <TouchableOpacity style={[styles.settingsSecondaryBtn, (settingsFocusArea === 'content' && settingsFocusIndex === 1) && styles.buttonFocused]} onPress={() => { setSettingsVisible(false); setHomeBgModalVisible(true); }}>
                      <Ionicons name="image-outline" size={20} color="#FFF" />
                      <Text style={styles.settingsSecondaryBtnText}>Cambiar Imagen de Fondo</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              ) : settingsTab === 'sync' ? (
                <ScrollView contentContainerStyle={styles.settingsScrollContentInner}>
                  <Text style={styles.settingsMainTitle}>Sincronización Inteligente</Text>
                  <Text style={[styles.settingsOptionDesc, { marginBottom: 20, color: '#888' }]}>Elige la fuente de datos predeterminada para cada tipo de contenido cuando uses el botón "Sincronizar Datos".</Text>
                  {[
                    { key: 'ratingAndSummary', label: 'Resumen y Rating', options: [{ id: 'igdb', label: 'IGDB' }, { id: 'none', label: 'Ninguno' }] },
                    { key: 'cover', label: 'Portada (Cover)', options: [{ id: 'steamgrid', label: 'SteamGrid' }, { id: 'igdb', label: 'IGDB' }, { id: 'none', label: 'Ninguno' }] },
                    { key: 'background', label: 'Fondo (Background)', options: [{ id: 'steamgrid', label: 'SteamGrid' }, { id: 'igdb', label: 'IGDB' }, { id: 'none', label: 'Ninguno' }] },
                    { key: 'logo', label: 'Logo', options: [{ id: 'steamgrid', label: 'SteamGrid' }, { id: 'none', label: 'Ninguno' }] }
                  ].map((pref, index) => {
                    const currentSync = activeUser?.settings?.syncPreferences || { ratingAndSummary: 'igdb', cover: 'steamgrid', background: 'steamgrid', logo: 'steamgrid' };
                    const currentValue = (currentSync as any)[pref.key];
                    return (
                      <View key={pref.key} style={[styles.settingsSection, (settingsFocusArea === 'content' && settingsFocusIndex === index) && styles.buttonFocused]}>
                        <Text style={styles.settingsLabel}>{pref.label}</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                          {pref.options.map(opt => (
                            <TouchableOpacity key={opt.id} style={[styles.platformBtn, currentValue === opt.id && styles.platformBtnActive]} onPress={() => updateUser({ settings: { autoPlayVideo: activeUser?.settings?.autoPlayVideo ?? true, syncPreferences: { ...currentSync, [pref.key]: opt.id } as any } })}>
                              <Text style={[styles.platformBtnText, currentValue === opt.id && styles.platformBtnTextActive]}>{opt.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* USER/POWER MODAL */}
      <Modal visible={isUserModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.userModalOverlay} activeOpacity={1} onPress={() => setUserModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: '100%', alignItems: 'center' }}>
            <View style={styles.userModalContent}>
              <View style={styles.userModalHeader}>
                <View style={styles.modalAvatarContainer}>
                  {activeUser?.avatar ? (
                    <Image source={{ uri: (activeUser as any).avatarBase64 || activeUser.avatar }} style={styles.modalAvatar} />
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
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill}>
          <View style={styles.launchingOverlay}>
            <MaterialCommunityIcons name="controller-classic" size={100} color="#FFF" />
            <Text style={styles.launchingText}>Ejecutándose...</Text>
          </View>
        </BlurView>
      </Modal>

      {/* PROFILE DROPDOWN MENU & BACKDROP */}
      {isProfileMenuOpen && (
        <View style={StyleSheet.absoluteFill}>
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
    paddingTop: 40,
    paddingBottom: 12,
  },
  miniHeader: {
    position: 'absolute',
    top: 40,
    left: 50,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    left: 30,
    gap: 35,
  },
  tabTouchable: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navItem: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 30,
    fontWeight: '200',
    letterSpacing: 0.2,
  },
  navItemActive: {
    color: '#FFFFFF',
    fontWeight: '400',
  },
  tabFocused: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255,255,255,0.8)',
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
  },
  timeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginHorizontal: 4,
  },
  timeText2: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 35,
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
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CD964',
    borderWidth: 2,
    borderColor: '#000',
    zIndex: 10,
  },

  // === MAIN CONTENT (scrollable) ===
  mainContent: {
    flex: 1,
    paddingTop: 0,
  },
  mainScrollContent: {
    paddingTop: 10, // space for fixed header (reduced to move games higher)
    paddingBottom: 60, // space for footer
    minHeight: '100%',
  },

  // === WELCOME WIDGETS ===
  widgetGrid: {
    paddingHorizontal: 0,
    paddingTop: 10,
    gap: 10,
    width: '100%',
  },
  widgetRow: {
    flexDirection: 'row',
    gap: 10,
  } as any,
  welcomeWidgetCard: {
    flex: 1,
    height: 88,
    borderRadius: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0)',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    backgroundColor: '#0d1015',
  } as any,
  welcomeWidgetCardFocused: {
    borderColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1.7,
    //backgroundColor: 'rgba(25, 50, 72, 0.95)',
    transform: [{ scale: 1.02 }],
  } as any,
  widgetTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  } as any,
  widgetSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    marginTop: 1,
  } as any,
  widgetBadge: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '500',
  } as any,
  widgetIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  } as any,

  // === CAROUSEL ===
  carouselSection: {
    height: 240,
    justifyContent: 'center',
    marginBottom: 0,
  },
  cardWrapper: {
    marginHorizontal: 6,
    borderRadius: 20,
    overflow: 'hidden',
    // opacity: 0.65,
    transform: [{ scale: 1 }, { translateY: 0 }],
  },
  cardWrapperActive: {
    opacity: 1,
    overflow: 'visible',
    transform: [{ scale: 1.5 }, { translateY: 17 }],
    marginLeft: 20,
    marginRight: 20,
  },
  card: {
    width: 120,
    height: 120,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardActive: {
    borderWidth: 3.5,
    borderColor: 'rgba(255, 255, 255, 0)',
    shadowColor: 'rgba(255, 255, 255, 0)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    marginLeft: 10,
    marginRight: 10,
  } as any,
  moreCard: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCard: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderCard: {
    padding: 10,
    overflow: 'hidden',
  },
  folderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  folderCardTitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  folderCardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 6,
  },

  // === GAME INFO PANEL (flows below carousel) ===
  gameInfoPanel: {
    paddingLeft: 150,
    paddingTop: 24,
    maxWidth: '100%' as any,
  },
  gameLogo: {
    width: 360,
    height: 120,
    marginBottom: 50,
  },
  gameTitle: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  gameDesc: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  playBtn: {
    backgroundColor: '#9999991c',
    paddingHorizontal: 52,
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    width: 280,
  },
  playBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  moreBtn: {
    backgroundColor: '#9999991c',
    width: 52,
    height: 52,
    borderRadius: 26,
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

  // === PLAY BTN FOCUS STATES ===
  playBtnFocused: {
    backgroundColor: '#FFFFFF',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: '#FFFFFF',
    outlineOffset: 1,
  } as any,
  playBtnTextFocused: {
    color: '#111111',
  },
  moreBtnFocused: {
    backgroundColor: '#FFFFFF',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: '#FFFFFF',
    outlineOffset: 1,
  } as any,
  moreBtnTextFocused: {
    color: '#111111',
  },

  // === INFO CARDS (below play button) ===
  infoCardsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
    width: '90%',
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(30,30,40,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    minWidth: 280,
    justifyContent: 'center',
  } as any,
  infoCardFocused: {
    borderColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1.5,
    backgroundColor: 'rgba(40,40,50,0.6)',
    transform: [{ scale: 1.02 }],
  } as any,

  // === STEAM NEWS SECTION ===
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
    backgroundColor: 'rgba(20,20,30,0.4)',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    objectFit: ''
  } as any,
  newsCard2: {
    width: 320,
    borderRadius: 8,
    backgroundColor: 'rgba(20,20,30,0.4)',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  } as any,
  newsCardFocused: {
    borderColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1.5,
    backgroundColor: 'rgba(35,35,45,0.6)',
    transform: [{ scale: 1.03 }],
  } as any,
  newsCardThumbnail: {
    width: '100%',
    height: 281, // 16:9 for 500px width
    backgroundColor: '#333',
    position: 'relative',
  },
  newsDurationBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newsDurationText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  newsPlayIcon: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsCardContent: {
    padding: 12,
  },
  newsCardTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 6,
  },
  newsCardFooterText: {
    color: '#888',
    fontSize: 12,
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

  // === MODALS ===
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: 420, backgroundColor: '#1C1C1E', borderRadius: 16, padding: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#111', color: '#FFF', padding: 12, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#333', fontSize: 15 },
  inputFocused: { borderColor: '#FFFFFF', borderWidth: 2 },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  typeBtn: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#111', borderRadius: 10, marginHorizontal: 4, borderWidth: 1, borderColor: '#333' },
  typeBtnActive: { borderColor: '#FFF', backgroundColor: '#2A2A2A' },
  typeBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  platformScrollContent: { gap: 8, paddingVertical: 5 },
  platformBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  platformBtnActive: { borderColor: '#FFF', backgroundColor: '#FFF' },
  platformBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 6, fontSize: 12 },
  platformBtnTextActive: { color: '#000' },
  fileBtn: { backgroundColor: '#2A2A2A', padding: 15, borderRadius: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  fileBtnText: { color: '#FFF', marginLeft: 10, flex: 1, fontSize: 13 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cancelBtn: { flex: 1, padding: 12, backgroundColor: '#333', borderRadius: 10, marginRight: 5, alignItems: 'center' },
  cancelBtnText: { color: '#FFF', fontWeight: 'bold' },
  saveBtn: { flex: 1, padding: 12, backgroundColor: '#FFFFFF', borderRadius: 10, marginLeft: 5, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: 'bold' },

  // === SETTINGS MODAL ===
  settingsOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  settingsContainer: { width: 850, height: 600, backgroundColor: '#1C1C1E', borderRadius: 24, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  settingsSidebar: { width: 240, backgroundColor: '#141416', padding: 24, borderRightWidth: 1, borderRightColor: 'rgba(255, 255, 255, 0.08)' },
  settingsSidebarTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 25, letterSpacing: 0.5 },
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
  launchingText: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold', marginTop: 20, letterSpacing: 3, textTransform: 'uppercase' },

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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
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
    fontWeight: '300',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
    whiteSpace: 'nowrap',
  } as any,

  // === MEDIA (screenshots / trailers) ===
  mediaPlayBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
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
});