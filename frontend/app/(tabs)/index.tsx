import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Dimensions, Platform, Modal, TextInput, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import YoutubePlayer from '@/components/YoutubePlayer';
import GameDetailView from '@/components/GameDetailView';
import FavoritesView from '@/components/FavoritesView';
import ControlPrompt from '@/components/ControlPrompt';
import RandomSelectorView from '@/components/RandomSelectorView';
import { useUser } from '@/contexts/UserContext';
import { Linking } from 'react-native';
import { fetchGamingNews, NewsArticle } from '@/services/newsService';
import { soundService } from '@/services/soundService';

const TABS = ['Games', 'Media', 'Biblioteca'];

export interface ConsoleItem {
  id: string;
  title: string;
  time: string;
  image?: any;
  logo?: any;
  backgroundImage?: any;
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
  { id: '1', title: 'Home', time: 'WConsole - Home', image: require('@/assets/images/Home.gif'), description: 'Bienvenido a tu consola personal. Accede a tus juegos y aplicaciones favoritas con una experiencia premium.', rating: 5.0, backgroundImage: require('@/assets/images/FondoDefault.png') },
  { id: 'last_played', title: 'Último Jugado', time: 'No ejecutado aún', image: require('@/assets/images/Home.gif'), isLastPlayed: true },
  { id: '3', title: 'Favoritos Juegos', time: 'Folder - Colección', isFolder: true },
  { id: '4', title: 'Favoritos Media', time: 'Aplicaciones de Streaming', isGrid: true },
];

const DATA_MEDIA: ConsoleItem[] = [];

export default function ConsoleHome() {
  const { activeUser, changeUser, updateUser } = useUser();
  const [activeTab, setActiveTab] = useState('Games');
  const [activeIndex, setActiveIndex] = useState(0);

  // Focus management
  type FocusArea = 'header_user' | 'header_tabs' | 'main_carousel' | 'widgets_row' | 'bottom_news' | 'footer';
  const [focusArea, setFocusArea] = useState<FocusArea>('main_carousel');
  const [focusIndex, setFocusIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const mainVerticalScrollRef = useRef<ScrollView>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Dynamic sizing based on window width
  const baseCardSize = 220;
  // Simple scaling logic: base on 1000px width, but clamped
  const scale = Math.min(Math.max(windowWidth / 1100, 0.85), 1.4);
  const CARD_SIZE = Math.round(baseCardSize * scale);
  const ITEM_WIDTH = CARD_SIZE + (8 * 2); // card width + horizontal margins
  const LEFT_PADDING = 50; // fixed left anchor position
  const RIGHT_PADDING = windowWidth - ITEM_WIDTH - LEFT_PADDING; // allows last item to reach left anchor

  // Biblioteca Grid Dynamic Sizing
  const LIBRARY_ITEM_WIDTH = 180;
  const LIBRARY_GAP = 20;
  const LIBRARY_COLS = Math.max(1, Math.floor((windowWidth - 100 + LIBRARY_GAP) / (LIBRARY_ITEM_WIDTH + LIBRARY_GAP)));

  // States for dynamic data and clock
  const [games, setGames] = useState<ConsoleItem[]>(DATA_GAMES);
  const [media, setMedia] = useState<ConsoleItem[]>(DATA_MEDIA);
  const [lastPlayedGame, setLastPlayedGame] = useState<ConsoleItem | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [gamepadInfo, setGamepadInfo] = useState({ connected: false, name: '', battery: 0 });
  const [storageInfo, setStorageInfo] = useState({ percent: 0, freeGB: 0 });

  // States for Add App Modal
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [newApp, setNewApp] = useState({ title: '', path: '', image: '', type: 'game', platform: '' });
  const [isSaving, setIsSaving] = useState(false);

  // States for Game Detail View
  const [isDetailVisible, setDetailVisible] = useState(false);
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
  const [settingsTab, setSettingsTab] = useState<'profile' | 'home'>('profile');
  const [homeBackground, setHomeBackground] = useState<any>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isRandomSelectorVisible, setRandomSelectorVisible] = useState(false);

  // Background transition states
  const [bgA, setBgA] = useState<any>(null);
  const [bgB, setBgB] = useState<any>(null);
  const [activeLayer, setActiveLayer] = useState<'A' | 'B'>('A');
  const [showTrailer, setShowTrailer] = useState(false);
  const [inputMode, setInputMode] = useState<'keyboard' | 'gamepad'>('keyboard');
  const fade = useSharedValue(0);
  const tabFade = useSharedValue(1);

  useEffect(() => {
    setShowTrailer(false);

    // Si la reproducción automática está desactivada en ajustes, no mostrar trailer
    const autoPlay = activeUser?.settings?.autoPlayVideo !== false; // Por defecto true
    if (!autoPlay) return;

    const item = currentData[activeIndex];
    if (item?.youtubeId) {
      const timer = setTimeout(() => {
        setShowTrailer(true);
      }, 3000); // 3 segundos de espera
      return () => clearTimeout(timer);
    }
  }, [activeIndex, activeTab, activeUser?.settings?.autoPlayVideo]);

  useEffect(() => {
    tabFade.value = 0;
    tabFade.value = withTiming(1, { duration: 400 });
  }, [activeTab]);

  const animatedTabContentStyle = useAnimatedStyle(() => ({
    opacity: tabFade.value,
    transform: [{ translateY: interpolate(tabFade.value, [0, 1], [15, 0]) }]
  }));

  useEffect(() => {
    if (Platform.OS === 'web') {
      const savedBg = localStorage.getItem('home_background');
      if (savedBg) setHomeBackground({ uri: savedBg });
    }
  }, []);



  const libraryData = games.filter(g => !g.isFolder && !g.isGrid && g.id !== '1' && g.id !== 'last_played');

  const GAMES_LIMIT = 10;
  let currentData = activeTab === 'Games' ? games : (activeTab === 'Media' ? media : (activeTab === 'Biblioteca' ? libraryData : []));

  if (activeTab === 'Games' && games.length > GAMES_LIMIT) {
    currentData = games.slice(0, GAMES_LIMIT);
    currentData.push({
      id: 'more_library',
      title: 'Ver Biblioteca',
      time: 'Ver todos los juegos',
      image: null,
    } as any);
  }

  // Reloj en tiempo real
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
              : require('@/assets/images/FondoDefault.png')
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

        const baseItems = [home, lastPlayed, favGames, favMedia].filter(Boolean) as ConsoleItem[];

        setGames([...baseItems, ...gamesList.reverse()]);
        setMedia([...DATA_MEDIA, ...mediaList.reverse()]);

        // Identificar el último juego jugado
        const allFormatted = [...gamesList, ...mediaList];
        const latest = allFormatted.filter(i => i.lastPlayed).sort((a: any, b: any) => b.lastPlayed - a.lastPlayed)[0];
        if (latest) {
          setLastPlayedGame(latest);
        }
      });
    }
  };

  useEffect(() => {
    loadApps(); // Cargar juegos y aplicaciones al iniciar
    fetchGamingNews().then(setNews);
    soundService.init();

    // Get real storage info if on Electron
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      (window as any).electronAPI.getStorageInfo().then((res: any) => {
        if (res.success) {
          setStorageInfo({ percent: res.percent, freeGB: res.freeGB });
        }
      });
    }
  }, []);

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
        const now = Date.now();
        const buttons = gp.buttons;

        const dispatch = (key: string) => {
          setInputMode('gamepad');
          const event = new KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
            keyCode: key === 'Enter' ? 13 : (key === 'ArrowRight' ? 39 : (key === 'ArrowLeft' ? 37 : (key === 'ArrowUp' ? 38 : (key === 'ArrowDown' ? 40 : 0))))
          });
          (event as any).fromGamepad = true;
          window.dispatchEvent(event);
        };

        // D-Pad Edge Detection
        const checkDpad = (idx: number, key: string) => {
          const pressed = !!buttons[idx]?.pressed;
          if (pressed && !prevButtonsRef.current[idx]) {
            dispatch(key);
          }
          prevButtonsRef.current[idx] = pressed;
        };

        checkDpad(12, 'ArrowUp');
        checkDpad(13, 'ArrowDown');
        checkDpad(14, 'ArrowLeft');
        checkDpad(15, 'ArrowRight');

        // Sticks Edge Detection (Threshold based)
        const checkAxis = (axisIdx: number, posKey: string, negKey: string) => {
          const val = gp.axes[axisIdx];
          const prevVal = prevAxesRef.current[axisIdx] || 0;
          const threshold = 0.5;

          if (val > threshold && prevVal <= threshold) dispatch(posKey);
          else if (val < -threshold && prevVal >= -threshold) dispatch(negKey);

          prevAxesRef.current[axisIdx] = val;
        };

        checkAxis(1, 'ArrowDown', 'ArrowUp');   // Left Stick Y
        checkAxis(0, 'ArrowRight', 'ArrowLeft'); // Left Stick X

        // Update Gamepad State for Widgets
        if (lastGpId.current !== gp.id) {
          lastGpId.current = gp.id;
          setGamepadInfo({
            connected: true,
            name: gp.id,
            battery: 0.75 // Simulated battery for UI demonstration
          });
        }

        // Buttons (One-shot)
        const checkButton = (idx: number, key: string) => {
          const pressed = !!buttons[idx]?.pressed;
          if (pressed && !prevButtonsRef.current[idx]) dispatch(key);
          prevButtonsRef.current[idx] = pressed;
        };

        checkButton(0, 'Enter');      // A / Cross
        checkButton(1, 'Escape');     // B / Circle
        checkButton(4, 'q');         // L1
        checkButton(5, 'e');         // R1
        checkButton(9, 'o');          // Options button maps to 'o' for "Añadir App"
      }
      rafId = requestAnimationFrame(poll);
    };

    if (Platform.OS === 'web') {
      rafId = requestAnimationFrame(poll);
    }
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Sincronizar selectedItem cuando cambian las listas
  useEffect(() => {
    if (selectedItem) {
      const updated = currentData.find(i => i.id === selectedItem.id);
      if (updated) setSelectedItem(updated);
    }
  }, [games, media, activeTab]);

  // Sincronizar focus si el usuario cierra modales con el mouse
  useEffect(() => {
    if (!isUserModalVisible && focusArea === 'header_user') {
      setFocusArea('main_carousel');
    }
  }, [isUserModalVisible]);

  useEffect(() => {
    if (!isAddModalVisible && focusArea === 'footer') {
      setFocusArea('main_carousel');
    }
    if (isAddModalVisible) {
      setAddModalFocusIndex(0);
      // Auto-focus first input after a small delay
      setTimeout(() => addModalTitleRef.current?.focus(), 100);
    }
  }, [isAddModalVisible]);

  useEffect(() => {
    if (isHomeBgModalVisible) setBgModalFocusIndex(0);
  }, [isHomeBgModalVisible]);

  useEffect(() => {
    if (isSettingsVisible) {
      setSettingsFocusArea('sidebar');
      setSettingsFocusIndex(0);
    }
  }, [isSettingsVisible]);

  // Manejador global para salir de iframes o click en espacios vacíos
  const handleGlobalTouch = () => {
    // Si la interfaz se siente bloqueada, un toque general la devuelve al carrusel
    // pero solo si no estamos navegando fluidamente o hay algún modal abierto
    if (!isUserModalVisible && !isAddModalVisible && !isDetailVisible && !isSettingsVisible && !isFavoritesVisible) {
      // if we click on background, maybe ensure focus area is valid
      if (focusArea === 'header_user' || focusArea === 'footer') {
        setFocusArea('main_carousel');
      }
    }
  };

  // Keyboard Navigation Listener
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleKeyDown = (e: any) => {
        if (!e.fromGamepad) setInputMode('keyboard');
        if (isLaunching) return;

        // Si el usuario está escribiendo en un input o textarea, no interferimos con la navegación del sistema
        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
          // Blur any focused non-input element so it doesn't re-fire onPress when Enter is pressed
          const active = document.activeElement as HTMLElement | null;
          if (active && active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA' && !active.isContentEditable) {
            active.blur();
          }
        }

        if (e.target && (
          e.target.tagName === 'INPUT' ||
          e.target.tagName === 'TEXTAREA' ||
          e.target.isContentEditable ||
          (e.target.getAttribute && e.target.getAttribute('type') === 'text')
        )) {
          return;
        }

        // Global shortcut for Options button (Add App)
        if (e.key === 'o' || e.key === 'O') {
          if (!isLaunching) {
            const willBeVisible = !isAddModalVisible;
            setAddModalVisible(willBeVisible);
            if (willBeVisible) {
              // If opening, ensure other views are closed to avoid overlap
              setDetailVisible(false);
              setUserModalVisible(false);
              setSettingsVisible(false);
              setFavoritesVisible(false);
              setHomeBgModalVisible(false);
            }
          }
          return;
        }

        // Detail view controls
        if (isDetailVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setDetailVisible(false);
          }
          return;
        }
        // User/Power modal controls
        if (isUserModalVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setUserModalVisible(false);
            setFocusArea('main_carousel');
          } else if (e.key === 'ArrowRight') {
            setModalSelectedIndex((prev) => Math.min(prev + 1, 3));
          } else if (e.key === 'ArrowLeft') {
            setModalSelectedIndex((prev) => Math.max(prev - 1, 0));
          } else if (e.key === 'Enter') {
            if (modalSelectedIndex === 0) { // Opciones/Settings
              setUserModalVisible(false);
              setSettingsVisible(true);
            } else if (modalSelectedIndex === 2) { // Cambiar de usuario
              setUserModalVisible(false);
              changeUser();
            } else if (modalSelectedIndex === 3) { // Apagar
              if ((window as any).electronAPI) (window as any).electronAPI.closeApp();
            }
          }
          return;
        }

        // Settings modal controls
        if (isSettingsVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setSettingsVisible(false);
            setUserModalVisible(true);
            setFocusArea('header_user');
          } else if (e.key === 'ArrowDown') {
            if (settingsFocusArea === 'sidebar') {
              setSettingsFocusIndex(prev => Math.min(prev + 1, 2));
            } else {
              setSettingsFocusIndex(prev => Math.min(prev + 1, settingsTab === 'profile' ? 2 : 1));
            }
          } else if (e.key === 'ArrowUp') {
            setSettingsFocusIndex(prev => Math.max(prev - 1, 0));
          } else if (e.key === 'ArrowRight' && settingsFocusArea === 'sidebar') {
            setSettingsFocusArea('content');
            setSettingsFocusIndex(0);
          } else if (e.key === 'ArrowLeft' && settingsFocusArea === 'content') {
            setSettingsFocusArea('sidebar');
            setSettingsFocusIndex(settingsTab === 'profile' ? 0 : 1);
          } else if (e.key === 'Enter') {
            if (settingsFocusArea === 'sidebar') {
              if (settingsFocusIndex === 0) setSettingsTab('profile');
              else if (settingsFocusIndex === 1) setSettingsTab('home');
              else if (settingsFocusIndex === 2) {
                setSettingsVisible(false);
                setUserModalVisible(true);
              }
            } else {
              if (settingsTab === 'profile') {
                if (settingsFocusIndex === 0) handleSelectAvatar();
                else if (settingsFocusIndex === 1) settingsNameRef.current?.focus();
              } else {
                if (settingsFocusIndex === 0) {
                  updateUser({
                    settings: { ...activeUser?.settings, autoPlayVideo: !(activeUser?.settings?.autoPlayVideo !== false) }
                  });
                } else if (settingsFocusIndex === 1) {
                  setSettingsVisible(false);
                  setHomeBgModalVisible(true);
                }
              }
            }
          }
          return;
        }

        // Add App Modal Controls
        if (isAddModalVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setAddModalVisible(false);
          } else if (e.key === 'ArrowDown') {
            if (addModalFocusIndex === 0) setAddModalFocusIndex(1);
            else if (addModalFocusIndex >= 1 && addModalFocusIndex <= 3) setAddModalFocusIndex(newApp.type === 'game' ? 4 : 11);
            else if (addModalFocusIndex >= 4 && addModalFocusIndex <= 10) setAddModalFocusIndex(11);
            else if (addModalFocusIndex === 11) setAddModalFocusIndex(12);
            else if (addModalFocusIndex === 12) setAddModalFocusIndex(14); // Save
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
            }
            else if (addModalFocusIndex === 11) {
              if (newApp.type === 'web') addModalPathRef.current?.focus();
              else handleSelectExecutable();
            }
            else if (addModalFocusIndex === 12) handleSelectImage();
            else if (addModalFocusIndex === 13) setAddModalVisible(false);
            else if (addModalFocusIndex === 14) handleSaveApp();
          }
          return;
        }

        // Home Background Modal Controls
        if (isHomeBgModalVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setHomeBgModalVisible(false);
          } else if (e.key === 'ArrowDown') {
            setBgModalFocusIndex(prev => Math.min(prev + 1, homeBackground ? 2 : 1));
          } else if (e.key === 'ArrowUp') {
            setBgModalFocusIndex(prev => Math.max(prev - 1, 0));
          } else if (e.key === 'Enter') {
            if (bgModalFocusIndex === 0) handleSelectHomeBg();
            else if (bgModalFocusIndex === 1 && homeBackground) {
              setHomeBackground(null);
              localStorage.removeItem('home_background');
              setHomeBgModalVisible(false);
            } else {
              setHomeBgModalVisible(false);
            }
          }
          return;
        }
        if (isRandomSelectorVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setRandomSelectorVisible(false);
          }
          return;
        }

        if (isFavoritesVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setFavoritesVisible(false);
          }
          return;
        }

        // --- SPATIAL NAVIGATION ---

        if (e.key === 'ArrowDown') {
          soundService.playNavigation();
          if (focusArea === 'header_user' || focusArea === 'header_tabs') {
            setFocusArea('main_carousel');
            setFocusIndex(activeIndex);
          } else if (focusArea === 'main_carousel') {
            if (activeTab === 'Biblioteca') {
              const nextIdx = activeIndex + LIBRARY_COLS;
              if (nextIdx < currentData.length) {
                setActiveIndex(nextIdx);
                setFocusIndex(nextIdx);
              } else {
                setFocusArea('widgets_row');
                setFocusIndex(0);
                mainVerticalScrollRef.current?.scrollTo({ y: 350, animated: true });
              }
            } else {
              setFocusArea('widgets_row');
              setFocusIndex(0);
              mainVerticalScrollRef.current?.scrollTo({ y: 350, animated: true });
            }
          } else if (focusArea === 'widgets_row') {
            setFocusArea('bottom_news');
            setFocusIndex(0); // Start at first news article
            mainVerticalScrollRef.current?.scrollTo({ y: 550, animated: true });
          } else if (focusArea === 'bottom_news') {
            const nextIdx = focusIndex + 1;
            const maxIdx = news.length;
            if (nextIdx <= maxIdx) {
              setFocusIndex(nextIdx);
              mainVerticalScrollRef.current?.scrollTo({ y: 350 + nextIdx * 140, animated: true });
            } else {
              setFocusArea('footer');
              setFocusIndex(0);
              mainVerticalScrollRef.current?.scrollToEnd({ animated: true });
            }
          }
          return;
        }

        if (e.key === 'ArrowUp') {
          soundService.playNavigation();
          if (focusArea === 'footer') {
            setFocusArea('bottom_news');
            setFocusIndex(news.length);
            mainVerticalScrollRef.current?.scrollToEnd({ animated: true });
          } else if (focusArea === 'bottom_news') {
            const nextIdx = focusIndex - 1;
            if (nextIdx >= 0 || (focusIndex === -1)) {
              // If we were at -1 (Random Card), we should go to widgets or stay. 
              // But ArrowUp from -1 should go up.
              if (focusIndex === -1) {
                setFocusArea('widgets_row');
                setFocusIndex(0);
                mainVerticalScrollRef.current?.scrollTo({ y: 350, animated: true });
                return;
              }
              setFocusIndex(nextIdx);
              mainVerticalScrollRef.current?.scrollTo({ y: 550 + nextIdx * 140, animated: true });
            } else {
              setFocusArea('widgets_row');
              setFocusIndex(0);
              mainVerticalScrollRef.current?.scrollTo({ y: 350, animated: true });
            }
          } else if (focusArea === 'widgets_row') {
            setFocusArea('main_carousel');
            setFocusIndex(activeIndex);
            mainVerticalScrollRef.current?.scrollTo({ y: 0, animated: true });
          } else if (focusArea === 'main_carousel') {
            if (activeTab === 'Biblioteca') {
              const nextIdx = activeIndex - LIBRARY_COLS;
              if (nextIdx >= 0) {
                setActiveIndex(nextIdx);
                setFocusIndex(nextIdx);
              } else {
                setFocusArea('header_tabs');
                setFocusIndex(TABS.indexOf(activeTab));
              }
            } else {
              setFocusArea('header_tabs');
              setFocusIndex(TABS.indexOf(activeTab));
            }
          } else if (focusArea === 'header_tabs') {
            setFocusArea('header_user');
            setFocusIndex(0);
          }
          return;
        }

        if (e.key === 'ArrowRight') {
          soundService.playNavigation();
          if (focusArea === 'main_carousel') {
            const nextIdx = Math.min(activeIndex + 1, currentData.length - 1);
            setActiveIndex(nextIdx);
            setFocusIndex(nextIdx);
          } else if (focusArea === 'widgets_row') {
            setFocusIndex((prev) => Math.min(prev + 1, 2)); // 3 widgets total
          } else if (focusArea === 'header_tabs') {
            const nextIdx = Math.min(focusIndex + 1, TABS.length - 1);
            setFocusIndex(nextIdx);
            setActiveTab(TABS[nextIdx]);
            setActiveIndex(0);
          } else if (focusArea === 'bottom_news') {
            if (focusIndex !== -1) {
              setFocusIndex(-1); // Move to Random Card on the right
            }
          }
          return;
        }

        if (e.key === 'ArrowLeft') {
          soundService.playNavigation();
          if (focusArea === 'main_carousel') {
            const nextIdx = Math.max(activeIndex - 1, 0);
            setActiveIndex(nextIdx);
            setFocusIndex(nextIdx);
          } else if (focusArea === 'widgets_row') {
            setFocusIndex((prev) => Math.max(prev - 1, 0));
          } else if (focusArea === 'header_tabs') {
            const nextIdx = Math.max(focusIndex - 1, 0);
            setFocusIndex(nextIdx);
            setActiveTab(TABS[nextIdx]);
            setActiveIndex(0);
          } else if (focusArea === 'bottom_news') {
            if (focusIndex === -1) {
              setFocusIndex(0);
            }
          }
          return;
        }

        if (e.key === 'Enter') {
          soundService.playActivation();
          if (focusArea === 'main_carousel') {
            const item = currentData[activeIndex];
            if (item) {
              if (item.id === 'more_library') {
                setActiveTab('Biblioteca');
                setActiveIndex(0);
                setFocusArea('main_carousel');
                return;
              }
              if (item.isFolder || item.isGrid) {
                setFavoritesVisible(true);
                return;
              }
              if (activeTab === 'Games' && activeIndex === 0) {
                setHomeBgModalVisible(true);
                return;
              }
              if (item.isLastPlayed) {
                if (lastPlayedGame) {
                  setSelectedItem(lastPlayedGame);
                  setDetailVisible(true);
                } else {
                  alert('Aún no has jugado a ningún juego.');
                }
              } else {
                setSelectedItem(item);
                setDetailVisible(true);
              }
            }
          } else if (focusArea === 'widgets_row') {
            if (focusIndex === 1) { // Screenshots
              if ((window as any).electronAPI) (window as any).electronAPI.openScreenshots();
            }
          } else if (focusArea === 'header_user') {
            setUserModalVisible(true);
          } else if (focusArea === 'bottom_news') {
            if (focusIndex === -1) {
              setRandomSelectorVisible(true);
              return;
            }
            if (focusIndex === news.length) { // Back to top button
              setFocusArea('main_carousel');
              setFocusIndex(activeIndex);
              mainVerticalScrollRef.current?.scrollTo({ y: 0, animated: true });
              return;
            }
            const article = news[focusIndex];
            if (article) Linking.openURL(article.url);
          }
          return;
        }

        if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
          soundService.playNavigation();
          const direction = (e.key === 'q' || e.key === 'Q') ? -1 : 1;
          setActiveTab((prev) => {
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
      // capture:true ensures our handler fires before React's internal listeners on focused elements
      window.addEventListener('keydown', handleKeyDown, { capture: true });
      return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }
  }, [activeTab, currentData, activeIndex, focusArea, focusIndex, isAddModalVisible, isDetailVisible, isUserModalVisible, isFavoritesVisible, selectedItem, modalSelectedIndex, addModalFocusIndex, bgModalFocusIndex, settingsFocusArea, settingsFocusIndex, settingsTab, isHomeBgModalVisible, homeBackground, newApp]);

  // Auto-scroll: with dynamic padding the active item always lands at the screen center
  useEffect(() => {
    // Usamos un pequeño delay o requestAnimationFrame para asegurar que el layout se haya actualizado
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        const scrollX = activeIndex * ITEM_WIDTH;
        scrollRef.current.scrollTo({ x: scrollX, animated: true });
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [activeIndex, activeTab, ITEM_WIDTH, windowWidth]);

  const handleAppPress = (index: number, item: ConsoleItem) => {
    // Sincronizar foco con el clic
    setFocusArea('main_carousel');
    setActiveIndex(index);
    setFocusIndex(index);

    if (activeIndex === index) {
      if (item.id === 'more_library') {
        setActiveTab('Biblioteca');
        setActiveIndex(0);
        setFocusArea('main_carousel');
        return;
      }
      if (activeTab === 'Games' && index === 0) {
        setHomeBgModalVisible(true);
        return;
      }
      if (item.isFolder || item.isGrid) {
        setFavoritesVisible(true);
        return;
      }
      if (item.isLastPlayed) {
        if (lastPlayedGame) {
          setSelectedItem(lastPlayedGame);
          setDetailVisible(true);
        } else {
          alert('Aún no has jugado a ningún juego.');
        }
        return;
      }
      if (!item.isGrid) {
        setSelectedItem(item);
        setDetailVisible(true);
      }
    }
  };

  const handleSelectExecutable = async () => {
    if ((window as any).electronAPI) {
      const path = await (window as any).electronAPI.selectFile();
      if (path) {
        const filename = path.split(/[\\/]/).pop() || '';
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
        setNewApp({
          ...newApp,
          path,
          title: newApp.title || nameWithoutExt
        });
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

      // Si no hay imagen y es un juego, intentar buscar en SteamGridDB
      if (!appToSave.image && appToSave.type === 'game') {
        try {
          const res = await (window as any).electronAPI.fetchSteamGridData(appToSave.title);
          if (res.success && res.data) {
            if (res.data.grid) appToSave.image = res.data.grid;
            if (res.data.hero) (appToSave as any).backgroundImage = res.data.hero;
            if (res.data.logo) (appToSave as any).logo = res.data.logo;
          }
        } catch (error) {
          console.error('Error fetching SteamGrid data:', error);
        }
      }

      await (window as any).electronAPI.saveApp(appToSave);
      setIsSaving(false);
      setAddModalVisible(false);
      setNewApp({ title: '', path: '', image: '', type: 'game', platform: '' });
      loadApps(); // Reload DB to update list
    } else {
      alert('Por favor completa el título y la ruta del ejecutable.');
    }
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
      if (img) {
        const avatarUri = `local-file:///${img.replace(/\\/g, '/')}`;
        updateUser({ avatar: avatarUri });
      }
    }
  };

  const currentBg = (activeTab === 'Games' && activeIndex === 0)
    ? (homeBackground || require('@/assets/images/FondoDefault.png'))
    : (currentData[activeIndex]?.isLastPlayed ? lastPlayedGame?.backgroundImage : (currentData[activeIndex]?.backgroundImage || require('@/assets/images/FondoDefault.png')));

  // Trigger crossfade when currentBg changes
  useEffect(() => {
    if (activeLayer === 'A') {
      if (currentBg !== bgA) {
        setBgB(currentBg);
        setActiveLayer('B');
        fade.value = withTiming(1, { duration: 800 });
      }
    } else {
      if (currentBg !== bgB) {
        setBgA(currentBg);
        setActiveLayer('A');
        fade.value = withTiming(0, { duration: 800 });
      }
    }
  }, [currentBg]);

  // Initial load
  useEffect(() => {
    if (currentBg && !bgA && !bgB) setBgA(currentBg);
  }, []);

  const animatedStyleB = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));


  return (
    <SafeAreaView style={styles.container}>
      {/* BACKGROUND DINÁMICO (Dual Layer Crossfade) */}
      <View style={StyleSheet.absoluteFill} onTouchEnd={handleGlobalTouch}>
        {showTrailer && currentData[activeIndex]?.youtubeId ? (
          <View style={{ width: windowWidth, height: windowHeight, overflow: 'hidden' }}>
            <YoutubePlayer
              height={windowHeight}
              width={windowWidth}
              play={true}
              videoId={currentData[activeIndex].youtubeId}
              mute={true}
            />
          </View>
        ) : (
          <>
            {bgA && (
              <Image
                source={bgA}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
            )}
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
      {/* OVERLAY PARA LEGIBILIDAD (Solo si hay fondo o estamos en Biblioteca) */}
      {(currentBg || activeTab === 'Biblioteca') && (
        <View style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: activeTab === 'Biblioteca' ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)' }
        ]} />
      )}
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => {
              setFocusArea('header_user');
              setUserModalVisible(true);
            }}
            accessible={false}
            style={[
              styles.avatarContainer,
              styles.avatarActive,
              activeUser ? { borderColor: activeUser.color } : {},
              focusArea === 'header_user' && styles.itemFocused
            ]}
            activeOpacity={0.75}
          >
            {activeUser?.avatar ? (
              <Image source={{ uri: (activeUser as any).avatarBase64 || activeUser.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.defaultAvatarHeader}>
                <Ionicons name="person" size={24} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
          {activeUser && (
            <View style={styles.welcomeContainer}>
              <Text style={styles.welcomeText}>Bienvenido,</Text>
              <Text style={styles.welcomeName}>{activeUser.name}</Text>
            </View>
          )}
        </View>

        <View style={styles.headerCenter}>
          <ControlPrompt btn="L" label="" inputMode={inputMode} />
          {TABS.map((tab, idx) => (
            <TouchableOpacity
              key={tab}
              onPress={(e) => {
                (e.currentTarget as any)?.blur?.();
                setActiveTab(tab);
                setActiveIndex(0);
                setFocusArea('main_carousel');
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.navItem,
                  activeTab === tab && styles.navItemActive,
                  (focusArea === 'header_tabs' && focusIndex === idx) && styles.tabFocused
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
          <ControlPrompt btn="R" label="" inputMode={inputMode} />
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.timeText}>{currentTime}</Text>
          <Ionicons name="wifi" size={20} color="#CCC" style={{ marginHorizontal: 8 }} />
          <Text style={styles.batteryText}>75%</Text>
          <Ionicons name="battery-full" size={24} color="#CCC" />
        </View>
      </View>

      {/* SCROLLABLE CONTENT */}
      <ScrollView
        ref={mainVerticalScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          if (y < 200) {
            if (focusArea !== 'main_carousel' && focusArea !== 'header_tabs' && focusArea !== 'header_user') {
              setFocusArea('main_carousel');
            }
          } else if (y >= 200 && y < 450) {
            if (focusArea !== 'widgets_row') setFocusArea('widgets_row');
          } else if (y >= 450) {
            if (focusArea !== 'bottom_news' && focusArea !== 'footer') setFocusArea('bottom_news');
          }
        }}
        scrollEventThrottle={16}
      >
        {/* MAIN CONTENT */}
        <Animated.View style={[styles.mainContent, animatedTabContentStyle]}>
          <View style={styles.activeTitleContainer}>
            <View style={styles.cartridgeIcon} />
            <Text style={[styles.activeTitle, { fontSize: Math.round(22 * scale) }]}>
              {currentData[activeIndex]?.isLastPlayed ? (lastPlayedGame ? `Último: ${lastPlayedGame.title}` : 'Último Jugado') : currentData[activeIndex]?.title}
            </Text>
          </View>

          <View style={[styles.carouselWrapper, { height: activeTab === 'Biblioteca' ? 'auto' : CARD_SIZE * 1.2 }]}>
            {activeTab === 'Biblioteca' ? (
              <View style={styles.libraryGridContainer}>
                {currentData.map((item, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => handleAppPress(index, item)}
                      activeOpacity={0.9}
                      style={[
                        styles.libraryGridItem,
                        isActive && styles.libraryGridItemActive
                      ]}
                    >
                      <Image source={item.image} style={styles.libraryItemImage} contentFit="cover" />
                      {isActive && (
                        <View style={styles.libraryItemOverlay}>
                          <Text numberOfLines={1} style={styles.libraryItemTitle}>{item.title}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {currentData.length === 0 && (
                  <View style={styles.libraryEmpty}>
                    <Ionicons name="cart-outline" size={60} color="rgba(255,255,255,0.1)" />
                    <Text style={styles.libraryEmptyText}>No hay juegos disponibles en la biblioteca aún.</Text>
                  </View>
                )}
              </View>
            ) : currentData.length === 0 ? (
              <View style={styles.mediaEmptyContainer}>
                <Ionicons name="film-outline" size={Math.round(80 * scale)} color="rgba(255,255,255,0.15)" />
                <Text style={styles.mediaEmptyText}>No hay aplicaciones de multimedia</Text>
              </View>
            ) : (
              <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingLeft: LEFT_PADDING, paddingRight: RIGHT_PADDING, alignItems: 'center' }}
                snapToInterval={ITEM_WIDTH}
                snapToAlignment="start"
                decelerationRate="fast"
                scrollEventThrottle={16}
                onLayout={() => {
                  if (scrollRef.current) {
                    const scrollX = activeIndex * ITEM_WIDTH;
                    scrollRef.current.scrollTo({ x: scrollX, animated: false });
                  }
                }}
              >
                {currentData.map((item, index) => {
                  const isActive = index === activeIndex;
                  const cardContainerStyle = [
                    styles.cardBase,
                    { width: CARD_SIZE, height: CARD_SIZE },
                    isActive && styles.cardActive
                  ];

                  if (item.id === 'more_library') {
                    return (
                      <TouchableOpacity key={item.id} onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                        <BlurView intensity={40} tint="dark" style={[styles.libraryBtnCard, cardContainerStyle]}>
                          <MaterialCommunityIcons name="library-shelves" size={Math.round(60 * scale)} color={isActive ? "#00FFFF" : "#666"} />
                          <Text style={[styles.libraryBtnText, { fontSize: Math.round(14 * scale) }]}>Ver Biblioteca</Text>
                        </BlurView>
                      </TouchableOpacity>
                    );
                  }

                  if (item.isGrid) {
                    return (
                      <TouchableOpacity key={item.id} onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                        <View style={[styles.folderContainer, cardContainerStyle]}>
                          <View style={styles.folderHeader}>
                            <MaterialCommunityIcons name="view-grid" size={16} color="#00FFFF" />
                            <Text style={styles.folderTitle}> Favorite Media</Text>
                          </View>
                          <View style={styles.folderContent}>
                            {(() => {
                              const favs = media.filter(m => m.isFavorite);
                              if (favs.length === 0) {
                                return (
                                  <View style={styles.folderEmpty}>
                                    <Ionicons name="apps-outline" size={30} color="rgba(0,255,255,0.2)" />
                                  </View>
                                );
                              }
                              if (favs.length === 1) {
                                return <Image source={favs[0].image} style={styles.folderImgFull} />;
                              }
                              if (favs.length === 2) {
                                return (
                                  <View style={styles.folderCol}>
                                    <Image source={favs[0].image} style={styles.folderImgWide} />
                                    <Image source={favs[1].image} style={styles.folderImgWide} />
                                  </View>
                                );
                              }
                              if (favs.length === 3) {
                                return (
                                  <View style={styles.folderCol}>
                                    <View style={styles.folderRow}>
                                      <Image source={favs[0].image} style={styles.folderImgSmall} />
                                      <Image source={favs[1].image} style={styles.folderImgSmall} />
                                    </View>
                                    <Image source={favs[2].image} style={styles.folderImgWide} />
                                  </View>
                                );
                              }
                              // 4 or more
                              return (
                                <View style={styles.folderCol}>
                                  <View style={styles.folderRow}>
                                    <Image source={favs[0].image} style={styles.folderImgSmall} />
                                    <Image source={favs[1].image} style={styles.folderImgSmall} />
                                  </View>
                                  <View style={styles.folderRow}>
                                    <Image source={favs[2].image} style={styles.folderImgSmall} />
                                    <Image source={favs[3].image} style={styles.folderImgSmall} />
                                  </View>
                                </View>
                              );
                            })()}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  if (item.isFolder) {
                    return (
                      <TouchableOpacity key={item.id} onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                        <View style={[styles.folderContainer, cardContainerStyle]}>
                          <View style={styles.folderHeader}>
                            <Ionicons name="heart" size={16} color="#FF2D55" />
                            <Text style={styles.folderTitle}> Favorite Games</Text>
                          </View>
                          <View style={styles.folderContent}>
                            {(() => {
                              const favs = games.filter(g => g.isFavorite);
                              if (favs.length === 0) {
                                return (
                                  <View style={styles.folderEmpty}>
                                    <Ionicons name="star-outline" size={30} color="rgba(255,255,255,0.2)" />
                                  </View>
                                );
                              }
                              if (favs.length === 1) {
                                return <Image source={favs[0].image} style={styles.folderImgFull} />;
                              }
                              if (favs.length === 2) {
                                return (
                                  <View style={styles.folderCol}>
                                    <Image source={favs[0].image} style={styles.folderImgWide} />
                                    <Image source={favs[1].image} style={styles.folderImgWide} />
                                  </View>
                                );
                              }
                              if (favs.length === 3) {
                                return (
                                  <View style={styles.folderCol}>
                                    <View style={styles.folderRow}>
                                      <Image source={favs[0].image} style={styles.folderImgSmall} />
                                      <Image source={favs[1].image} style={styles.folderImgSmall} />
                                    </View>
                                    <Image source={favs[2].image} style={styles.folderImgWide} />
                                  </View>
                                );
                              }
                              // 4 or more
                              return (
                                <View style={styles.folderCol}>
                                  <View style={styles.folderRow}>
                                    <Image source={favs[0].image} style={styles.folderImgSmall} />
                                    <Image source={favs[1].image} style={styles.folderImgSmall} />
                                  </View>
                                  <View style={styles.folderRow}>
                                    <Image source={favs[2].image} style={styles.folderImgSmall} />
                                    <Image source={favs[3].image} style={styles.folderImgSmall} />
                                  </View>
                                </View>
                              );
                            })()}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  if (item.isLastPlayed && !lastPlayedGame) {
                    return (
                      <TouchableOpacity key={item.id} onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                        <View style={[...cardContainerStyle, { overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.03)', justifyContent: 'center', alignItems: 'center' }]}>
                          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                          <MaterialCommunityIcons
                            name="history"
                            size={Math.round(60 * scale)}
                            color={isActive ? "#00FFFF" : "rgba(255,255,255,0.2)"}
                          />
                          <View style={{ position: 'absolute', bottom: 15, width: '100%', alignItems: 'center' }}>
                            <Text style={{
                              color: isActive ? "#00FFFF" : "rgba(255,255,255,0.4)",
                              fontSize: Math.round(10 * scale),
                              fontWeight: 'bold',
                              letterSpacing: 1
                            }}>
                              SIN ACTIVIDAD
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity key={item.id} onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                      <Image
                        source={item.isLastPlayed ? (lastPlayedGame?.image ?? item.image) : item.image}
                        style={[styles.cardImage, cardContainerStyle]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View style={styles.activeSubtitleContainer}>
            <Text style={styles.activeSubtitle}>
              {currentData[activeIndex]?.isLastPlayed ? (lastPlayedGame ? `Jugado recientemente` : 'Ningún juego ejecutado') : currentData[activeIndex]?.time}
            </Text>
          </View>
        </Animated.View>

        {/* WIDGETS ROW */}
        <View style={styles.widgetsRowContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.widgetsScrollContent}>
            {/* WIDGET 1: CONTROLLER */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.widgetCard,
                (focusArea === 'widgets_row' && focusIndex === 0) && styles.widgetCardFocused
              ]}
            >
              <BlurView intensity={30} tint="dark" style={styles.widgetBlur}>
                <View style={styles.widgetHeader}>
                  <MaterialCommunityIcons name={gamepadInfo.connected ? "controller-classic" : "controller-off"} size={24} color={gamepadInfo.connected ? "#00FFFF" : "#666"} />
                  <Text style={styles.widgetTitle}>CONTROL</Text>
                </View>
                <View style={styles.widgetContent}>
                  <Text style={styles.widgetMainText} numberOfLines={1}>{gamepadInfo.connected ? gamepadInfo.name.split('(')[0].trim() : 'No conectado'}</Text>
                  <View style={styles.widgetStatusRow}>
                    <Ionicons name={gamepadInfo.connected ? "battery-charging" : "battery-dead"} size={16} color={gamepadInfo.connected ? "#00FF00" : "#666"} />
                    <Text style={styles.widgetStatusText}>{gamepadInfo.connected ? '75%' : '---'}</Text>
                    <Text style={styles.widgetSubText}>{gamepadInfo.connected ? 'INALÁMBRICO' : 'ESPERANDO...'}</Text>
                  </View>
                </View>
              </BlurView>
            </TouchableOpacity>

            {/* WIDGET 2: SCREENSHOTS */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.widgetCard,
                (focusArea === 'widgets_row' && focusIndex === 1) && styles.widgetCardFocused
              ]}
            >
              <BlurView intensity={30} tint="dark" style={styles.widgetBlur}>
                <View style={styles.widgetHeader}>
                  <MaterialCommunityIcons name="camera" size={24} color="#A78BFA" />
                  <Text style={styles.widgetTitle}>CAPTURAS</Text>
                </View>
                <View style={styles.widgetContent}>
                  <View style={styles.screenshotPreview}>
                    <Ionicons name="images" size={30} color="rgba(255,255,255,0.1)" />
                  </View>
                  <Text style={styles.widgetSubText}>12 NUEVAS CAPTURAS</Text>
                </View>
              </BlurView>
            </TouchableOpacity>

            {/* WIDGET 3: STORAGE */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.widgetCard,
                (focusArea === 'widgets_row' && focusIndex === 2) && styles.widgetCardFocused
              ]}
            >
              <BlurView intensity={30} tint="dark" style={styles.widgetBlur}>
                <View style={styles.widgetHeader}>
                  <MaterialCommunityIcons name="harddisk" size={24} color="#FBBF24" />
                  <Text style={styles.widgetTitle}>ALMACENAMIENTO</Text>
                </View>
                <View style={styles.widgetContent}>
                  <View style={styles.storageBarContainer}>
                    <View style={[styles.storageBar, { width: `${storageInfo.percent || 10}%` }]} />
                  </View>
                  <Text style={styles.widgetMainText}>{storageInfo.percent || '---'}% LLENO</Text>
                  <Text style={styles.widgetSubText}>{storageInfo.freeGB || '---'} GB DISPONIBLES</Text>
                </View>
              </BlurView>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* BOTTOM NEWS SECTION (VERTICAL) */}
        <View style={styles.newsAndRandomContainer}>
          <View style={styles.newsContainerVertical}>
            <View style={styles.newsHeaderContainer}>
              <Ionicons name="newspaper-outline" size={18} color="#00FFFF" />
              <Text style={styles.newsSectionTitle}>ÚLTIMAS NOTICIAS</Text>
            </View>
            <View style={styles.newsListVertical}>
              {news.length > 0 ? (
                news.map((article, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.newsCardVertical,
                      (focusArea === 'bottom_news' && focusIndex === index) && styles.itemFocused
                    ]}
                    onPress={() => {
                      setFocusArea('bottom_news');
                      setFocusIndex(index);
                      Linking.openURL(article.url);
                    }}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: article.urlToImage }} style={styles.newsImageVertical} contentFit="cover" />
                    <View style={styles.newsOverlayVertical}>
                      <Text style={styles.newsSourcePremium}>{article.source.name.toUpperCase()}</Text>
                      <Text numberOfLines={2} style={styles.newsTitleVertical}>{article.title}</Text>
                      <Text numberOfLines={2} style={styles.newsDescVertical}>{article.description}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.newsLoadingContainer}>
                  <Text style={styles.newsLoadingText}>Cargando novedades del mundo gaming...</Text>
                </View>
              )}

              {/* BACK TO TOP BUTTON at the end of the vertical list */}
              {news.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.backToTopCardVertical,
                    (focusArea === 'bottom_news' && focusIndex === news.length) && styles.itemFocused
                  ]}
                  onPress={() => {
                    setFocusArea('main_carousel');
                    setFocusIndex(activeIndex);
                    mainVerticalScrollRef.current?.scrollTo({ y: 0, animated: true });
                  }}
                >
                  <Ionicons name="arrow-up" size={24} color="#00FFFF" />
                  <Text style={styles.backToTopText}>VOLVER AL PRINCIPIO</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* RANDOM GAME CARD ON THE RIGHT */}
          <View style={styles.randomCardContainer}>
            <TouchableOpacity
              style={[
                styles.randomCard,
                (focusArea === 'bottom_news' && focusIndex === -1) && styles.itemFocused
              ]}
              onPress={() => setRandomSelectorVisible(true)}
              activeOpacity={0.8}
            >
              <BlurView intensity={30} tint="dark" style={styles.randomCardBlur}>
                <View style={styles.randomCardContent}>
                  <MaterialCommunityIcons name="dice-multiple" size={60} color="#CCFF00" />
                  <View style={styles.randomCardText}>
                    <Text style={styles.randomCardTitle}>SELECCIONAR JUEGO ALEATORIO</Text>
                    <Text style={styles.randomCardSub}>¿NO SABES QUÉ JUGAR? PRUEBA TU SUERTE</Text>
                  </View>
                </View>

                {/* Decorative Slant */}
                <View style={styles.randomCardSlantDecor} />
              </BlurView>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* FOOTER CONTROLS */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <MaterialCommunityIcons name="controller-classic" size={26} color="#FFF" />
          <ControlPrompt btn="Explore" label="Explorar" inputMode={inputMode} />
        </View>
        <View style={styles.footerRight}>
          <TouchableOpacity
            onPress={() => {
              setFocusArea('footer');
              setFocusIndex(0);
              setAddModalVisible(true);
            }}
            accessible={false}
            style={[styles.footerBtn, (focusArea === 'footer' && focusIndex === 0) && styles.footerBtnFocused]}
          >
            <ControlPrompt btn="Options" label="Añadir App" inputMode={inputMode} />
          </TouchableOpacity>
          <ControlPrompt btn="B" label="Cerrar" inputMode={inputMode} />
          <ControlPrompt btn="A" label="Iniciar" inputMode={inputMode} />
        </View>
      </View>

      <GameDetailView
        isVisible={isDetailVisible}
        item={selectedItem}
        isLaunching={isLaunching}
        inputMode={inputMode}
        onClose={() => setDetailVisible(false)}
        onRefresh={loadApps}
        onLaunch={(id, path) => {
          if (path.startsWith('http')) {
            Linking.openURL(path);
            return;
          }
          if (Platform.OS === 'web' && (window as any).electronAPI) {
            setIsLaunching(true);
            (window as any).electronAPI.launchApp(id, path).then(() => {
              loadApps();
              setTimeout(() => setIsLaunching(false), 4000);
            });
          }
        }}
      />

      <FavoritesView
        isVisible={isFavoritesVisible}
        isLaunching={isLaunching}
        inputMode={inputMode}
        favorites={currentData[activeIndex]?.isGrid ? media.filter(m => m.isFavorite) : games.filter(g => g.isFavorite)}
        onClose={() => setFavoritesVisible(false)}
        onLaunch={(item) => {
          if (item.path?.startsWith('http')) {
            Linking.openURL(item.path);
            return;
          }
          if (item.path && Platform.OS === 'web' && (window as any).electronAPI) {
            setIsLaunching(true);
            (window as any).electronAPI.launchApp(item.id, item.path).then(() => {
              loadApps();
              setTimeout(() => setIsLaunching(false), 4000);
            });
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
          if (item.path?.startsWith('http')) {
            Linking.openURL(item.path);
            return;
          }
          if (item.path && Platform.OS === 'web' && (window as any).electronAPI) {
            setIsLaunching(true);
            (window as any).electronAPI.launchApp(item.id, item.path).then(() => {
              loadApps();
              setTimeout(() => setIsLaunching(false), 4000);
            });
          }
        }}
      />

      {/* MODAL TO ADD APP */}

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
              <TouchableOpacity
                style={[styles.typeBtn, newApp.type === 'game' && styles.typeBtnActive, addModalFocusIndex === 1 && styles.buttonFocused]}
                onPress={() => setNewApp({ ...newApp, type: 'game' })}
              >
                <Text style={styles.typeBtnText}>Games</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, newApp.type === 'media' && styles.typeBtnActive, addModalFocusIndex === 2 && styles.buttonFocused]}
                onPress={() => setNewApp({ ...newApp, type: 'media', platform: '' })}
              >
                <Text style={styles.typeBtnText}>Media</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, newApp.type === 'web' && styles.typeBtnActive, addModalFocusIndex === 3 && styles.buttonFocused]}
                onPress={() => setNewApp({ ...newApp, type: 'web', platform: '' })}
              >
                <Text style={styles.typeBtnText}>Web</Text>
              </TouchableOpacity>
            </View>

            {newApp.type === 'game' && (
              <View style={{ marginBottom: 15 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformScrollContent}>
                  {[
                    { id: 'PC', icon: 'microsoft-windows' },
                    { id: 'PS5', icon: 'sony-playstation' },
                    { id: 'Xbox', icon: 'microsoft-xbox' },
                    { id: 'Switch', icon: 'nintendo-switch' },
                    { id: 'Steam', icon: 'steam' },
                    { id: 'EA', icon: 'alpha-e-box' },
                    { id: 'Epic', icon: 'alpha-e-circle' }
                  ].map((plat, idx) => {
                    const focusIdx = 4 + idx;
                    return (
                      <TouchableOpacity
                        key={plat.id}
                        style={[
                          styles.platformBtn,
                          newApp.platform === plat.id && styles.platformBtnActive,
                          addModalFocusIndex === focusIdx && styles.buttonFocused
                        ]}
                        onPress={() => setNewApp({ ...newApp, platform: plat.id })}
                      >
                        <MaterialCommunityIcons name={plat.icon as any} size={20} color={newApp.platform === plat.id ? '#000' : '#FFF'} />
                        <Text style={[styles.platformBtnText, newApp.platform === plat.id && styles.platformBtnTextActive]}>{plat.id}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {newApp.type === 'web' ? (
              <TextInput
                ref={addModalPathRef}
                style={[styles.input, addModalFocusIndex === 11 && styles.inputFocused]}
                placeholder="URL (https://...)"
                placeholderTextColor="#888"
                value={newApp.path}
                onChangeText={(text) => setNewApp({ ...newApp, path: text })}
              />
            ) : (
              <TouchableOpacity
                style={[styles.fileBtn, addModalFocusIndex === 11 && styles.buttonFocused]}
                onPress={handleSelectExecutable}
              >
                <Ionicons name="folder-open" size={20} color="#FFF" />
                <Text style={styles.fileBtnText}>
                  {newApp.path ? 'Ruta: ...' + newApp.path.slice(-20) : 'Seleccionar Ejecutable (.exe)'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.fileBtn, addModalFocusIndex === 12 && styles.buttonFocused]}
              onPress={handleSelectImage}
            >
              <Ionicons name="image" size={20} color="#FFF" />
              <Text style={styles.fileBtnText}>
                {newApp.image ? 'Portada: ...' + newApp.image.slice(-20) : 'Portada (Opcional - Auto-fetch)'}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, isSaving && { opacity: 0.5 }, addModalFocusIndex === 13 && styles.buttonFocused]}
                onPress={() => !isSaving && setAddModalVisible(false)}
                disabled={isSaving}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, isSaving && { backgroundColor: '#444' }, addModalFocusIndex === 14 && styles.buttonFocused]}
                onPress={handleSaveApp}
                disabled={isSaving}
              >
                <Text style={styles.saveBtnText}>{isSaving ? 'Buscando assets...' : 'Guardar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL TO CHANGE HOME BACKGROUND */}
      <Modal visible={isHomeBgModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configurar Fondo de Inicio</Text>
            <Text style={{ color: '#AAA', textAlign: 'center', marginBottom: 20 }}>
              Selecciona una imagen personalizada para el fondo de tu pantalla principal.
            </Text>

            <TouchableOpacity
              style={[styles.fileBtn, bgModalFocusIndex === 0 && styles.buttonFocused]}
              onPress={handleSelectHomeBg}
            >
              <Ionicons name="image" size={24} color="#FFF" />
              <Text style={styles.fileBtnText}>Seleccionar Imagen de Fondo</Text>
            </TouchableOpacity>

            {homeBackground && (
              <TouchableOpacity
                style={[styles.fileBtn, { backgroundColor: '#442222' }, bgModalFocusIndex === 1 && styles.buttonFocused]}
                onPress={() => {
                  setHomeBackground(null);
                  localStorage.removeItem('home_background');
                  setHomeBgModalVisible(false);
                }}
              >
                <Ionicons name="trash" size={24} color="#FF5555" />
                <Text style={[styles.fileBtnText, { color: '#FF5555' }]}>Eliminar Fondo Personalizado</Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, bgModalFocusIndex === (homeBackground ? 2 : 1) && styles.buttonFocused]}
                onPress={() => setHomeBgModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>






      <Modal visible={isSettingsVisible} transparent animationType="slide">
        <View style={styles.settingsOverlay}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

          <View style={styles.settingsContainer}>
            {/* Sidebar Navigation */}
            <View style={styles.settingsSidebar}>
              <Text style={styles.settingsSidebarTitle}>Ajustes</Text>

              <TouchableOpacity
                style={[styles.settingsTab, settingsTab === 'profile' && styles.settingsTabActive, (settingsFocusArea === 'sidebar' && settingsFocusIndex === 0) && styles.buttonFocused]}
                onPress={() => setSettingsTab('profile')}
              >
                <Ionicons name="person-outline" size={20} color={settingsTab === 'profile' ? '#00FFFF' : '#AAA'} />
                <Text style={[styles.settingsTabText, settingsTab === 'profile' && styles.settingsTabTextActive]}>Perfil</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.settingsTab, settingsTab === 'home' && styles.settingsTabActive, (settingsFocusArea === 'sidebar' && settingsFocusIndex === 1) && styles.buttonFocused]}
                onPress={() => setSettingsTab('home')}
              >
                <Ionicons name="home-outline" size={20} color={settingsTab === 'home' ? '#00FFFF' : '#AAA'} />
                <Text style={[styles.settingsTabText, settingsTab === 'home' && styles.settingsTabTextActive]}>Inicio</Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <TouchableOpacity
                style={[styles.settingsSidebarClose, (settingsFocusArea === 'sidebar' && settingsFocusIndex === 2) && styles.buttonFocused]}
                onPress={() => {
                  setSettingsVisible(false);
                  setUserModalVisible(true);
                }}
              >
                <Ionicons name="arrow-back" size={20} color="#AAA" />
                <Text style={styles.settingsSidebarCloseText}>Volver</Text>
              </TouchableOpacity>
            </View>

            {/* Main Content Area */}
            <View style={styles.settingsMain}>
              {settingsTab === 'profile' ? (
                <ScrollView contentContainerStyle={styles.settingsScrollContentInner}>
                  <Text style={styles.settingsMainTitle}>Configuración de Perfil</Text>

                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsLabel}>Foto de Perfil</Text>
                    <TouchableOpacity
                      onPress={handleSelectAvatar}
                      style={[
                        styles.settingsAvatarContainer,
                        { borderColor: activeUser?.color || '#00FFFF' },
                        (settingsFocusArea === 'content' && settingsFocusIndex === 0) && styles.buttonFocused
                      ]}
                    >
                      {activeUser?.avatar ? (
                        <Image source={{ uri: (activeUser as any).avatarBase64 || activeUser.avatar }} style={styles.settingsAvatar} />
                      ) : (
                        <View style={styles.defaultAvatarContainer}>
                          <Ionicons name="person" size={60} color="rgba(255,255,255,0.4)" />
                        </View>
                      )}
                      <View style={styles.settingsAvatarEditBadge}>
                        <Ionicons name="camera" size={20} color="#FFF" />
                      </View>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsLabel}>Nombre de Usuario</Text>
                    <TextInput
                      ref={settingsNameRef}
                      style={[styles.settingsInput, (settingsFocusArea === 'content' && settingsFocusIndex === 1) && styles.inputFocused]}
                      value={activeUser?.name || ''}
                      onChangeText={(text) => updateUser({ name: text })}
                      placeholder="Ingresa tu nombre"
                      placeholderTextColor="#666"
                    />
                  </View>

                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsLabel}>Color de Perfil</Text>
                    <View style={styles.colorPickerContainer}>
                      {['#FF3B30', '#00D4FF', '#FFCC00', '#4CD964', '#AF52DE', '#FF9500'].map((color) => (
                        <TouchableOpacity
                          key={color}
                          style={[
                            styles.colorCircle,
                            { backgroundColor: color },
                            activeUser?.color === color && styles.colorCircleActive,
                          ]}
                          onPress={() => updateUser({ color })}
                        />
                      ))}
                      <TouchableOpacity
                        style={[styles.colorCircle, { backgroundColor: activeUser?.color }]}
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
                </ScrollView>
              ) : (
                <ScrollView contentContainerStyle={styles.settingsScrollContentInner}>
                  <Text style={styles.settingsMainTitle}>Configuración de Inicio</Text>

                  <View style={styles.settingsOptionRow}>
                    <View style={styles.settingsOptionInfo}>
                      <Text style={styles.settingsOptionLabel}>Reproducción automática de video</Text>
                      <Text style={styles.settingsOptionDesc}>Reproduce trailers de juegos automáticamente cuando seleccionas un juego en el row principal.</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => updateUser({
                        settings: { ...activeUser?.settings, autoPlayVideo: !(activeUser?.settings?.autoPlayVideo !== false) }
                      })}
                      style={[
                        styles.toggleContainer,
                        (activeUser?.settings?.autoPlayVideo !== false) && styles.toggleContainerActive,
                        (settingsFocusArea === 'content' && settingsFocusIndex === 0) && styles.buttonFocused
                      ]}
                    >
                      <View style={[
                        styles.toggleCircle,
                        (activeUser?.settings?.autoPlayVideo !== false) && styles.toggleCircleActive
                      ]} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsLabel}>Fondo de Pantalla</Text>
                    <TouchableOpacity
                      style={[styles.settingsSecondaryBtn, (settingsFocusArea === 'content' && settingsFocusIndex === 1) && styles.buttonFocused]}
                      onPress={() => {
                        setSettingsVisible(false);
                        setHomeBgModalVisible(true);
                      }}
                    >
                      <Ionicons name="image-outline" size={20} color="#FFF" />
                      <Text style={styles.settingsSecondaryBtnText}>Cambiar Imagen de Fondo</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isUserModalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.userModalOverlay}
          activeOpacity={1}
          onPress={() => setUserModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: '100%', alignItems: 'center' }}>
            <View style={styles.userModalContent}>
              {/* Header User Profile */}
              <View style={styles.userModalHeader}>
                <View style={styles.modalAvatarContainer}>
                  {activeUser?.avatar ? (
                    <Image source={{ uri: (activeUser as any).avatarBase64 || activeUser.avatar }} style={styles.modalAvatar} />
                  ) : (
                    <View style={styles.defaultAvatarModal}>
                      <Ionicons name="person" size={24} color="#FFF" />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userModalHeaderName}>{activeUser?.name}</Text>
                  <Text style={styles.userModalHeaderStatus}>Online</Text>
                </View>
              </View>

              {/* Power Buttons */}
              <View style={styles.powerButtonsContainer}>
                <TouchableOpacity
                  style={[styles.powerButton, modalSelectedIndex === 0 && styles.powerButtonActive, modalSelectedIndex === 0 && styles.buttonFocused]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setModalSelectedIndex(0);
                    setUserModalVisible(false);
                    setSettingsVisible(true);
                  }}
                >
                  <Ionicons name="settings-outline" size={48} color={modalSelectedIndex === 0 ? styles.powerIconActive.color : styles.powerIcon.color} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.powerButton, modalSelectedIndex === 1 && styles.powerButtonActive, modalSelectedIndex === 1 && styles.buttonFocused]}
                  activeOpacity={0.8}
                  onPress={() => setModalSelectedIndex(1)}
                >
                  <Ionicons name="log-out-outline" size={48} color={modalSelectedIndex === 1 ? styles.powerIconActive.color : styles.powerIcon.color} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.powerButton, modalSelectedIndex === 2 && styles.powerButtonActive, modalSelectedIndex === 2 && styles.buttonFocused]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setModalSelectedIndex(2);
                    setUserModalVisible(false);
                    changeUser();
                  }}
                >
                  <Ionicons name="sync-outline" size={48} color={modalSelectedIndex === 2 ? styles.powerIconActive.color : styles.powerIcon.color} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.powerButton, modalSelectedIndex === 3 && styles.powerButtonActive, modalSelectedIndex === 3 && styles.buttonFocused]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setModalSelectedIndex(3);
                    if (Platform.OS === 'web' && (window as any).electronAPI) {
                      (window as any).electronAPI.closeApp();
                    }
                  }}
                >
                  <Ionicons name="power-outline" size={48} color={modalSelectedIndex === 3 ? styles.powerIconActive.color : styles.powerIcon.color} />
                </TouchableOpacity>
              </View>


              {/* Footer Info */}
              <View style={styles.userModalFooter}>
                <View style={styles.statusInfo}>
                  <Ionicons name="desktop-outline" size={16} color="#A0A0C0" />
                  <Text style={styles.statusText}>Last Login: Sep 18 20:05</Text>
                </View>
                <Text style={styles.statusSeparator}>|</Text>
                <View style={styles.statusInfo}>
                  <Ionicons name="time-outline" size={16} color="#A0A0C0" />
                  <Text style={styles.statusText}>Uptime: 6 hours, 5 minutes</Text>
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
            <MaterialCommunityIcons name="controller-classic" size={100} color="#00FFFF" />
            <Text style={styles.launchingText}>Ejecutándose...</Text>
          </View>
        </BlurView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E1E1E' },
  header: { flexDirection: 'row', paddingHorizontal: 30, paddingTop: 20, paddingBottom: 10, alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', width: '30%' },
  avatarContainer: { width: 44, height: 44, borderRadius: 22, marginRight: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  avatarActive: { borderColor: '#FF3B30' },
  avatar: { width: '100%', height: '100%' },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center', marginLeft: 5 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '40%' },
  navItem: { color: '#888', fontSize: 16, marginHorizontal: 12, fontWeight: '600' },
  navItemActive: { color: '#FFF' },
  headerRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', width: '30%' },
  timeText: { color: '#CCC', fontSize: 14, fontWeight: 'bold', marginRight: 10 },
  batteryText: { color: '#CCC', fontSize: 14, fontWeight: 'bold', marginRight: 5 },
  mainContent: { flex: 1, justifyContent: 'center', marginTop: 20 },
  activeTitleContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 50, marginBottom: 15, height: 30 },
  cartridgeIcon: { width: 12, height: 16, backgroundColor: '#00FFFF', marginRight: 10, borderRadius: 2 },
  activeTitle: { color: '#00FFFF', fontSize: 22, fontWeight: '300', letterSpacing: 0.5 },
  carouselWrapper: {},
  cardBase: { borderRadius: 12, marginHorizontal: 8, borderWidth: 4, borderColor: 'transparent' },
  cardActive: { borderColor: '#00FFFF', transform: [{ scale: 1.08 }], zIndex: 10 },
  cardImage: { resizeMode: 'cover' },
  folderContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    backdropFilter: 'blur(15px)', // Standard CSS for Electron/Web
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  } as any,
  folderHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  folderTitle: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  folderContent: { flex: 1, marginTop: 5 },
  folderCol: { flex: 1, justifyContent: 'space-between' },
  folderRow: { flexDirection: 'row', justifyContent: 'space-between', height: '48%' },
  folderImgFull: { width: '100%', height: '100%', borderRadius: 6 },
  folderImgWide: { width: '100%', height: '48%', borderRadius: 4 },
  folderImgSmall: { width: '48%', height: '100%', borderRadius: 4 },
  folderEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  activeSubtitleContainer: { paddingHorizontal: 50, marginTop: 15, height: 20 },
  activeSubtitle: { color: '#888', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  newsLoadingText: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
  },
  newsAndRandomContainer: {
    flexDirection: 'row',
    marginTop: 40,
    paddingBottom: 20,
    paddingHorizontal: 0,
  },
  newsContainerVertical: {
    width: '40%',
  },
  randomCardContainer: {
    flex: 1,
    paddingLeft: 30,
    paddingRight: 50,
    justifyContent: 'flex-start',
    paddingTop: 45, // align with news list start
  },
  randomCard: {
    width: '100%',
    height: 250,
    borderRadius: 25,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  randomCardBlur: {
    flex: 1,
    padding: 30,
    backgroundColor: 'rgba(204, 255, 0, 0.05)',
  },
  randomCardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  randomCardText: {
    alignItems: 'center',
  },
  randomCardTitle: {
    color: '#CCFF00',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  randomCardSub: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginTop: 5,
    textAlign: 'center',
  },
  randomCardSlantDecor: {
    position: 'absolute',
    bottom: -20,
    right: -20,
    width: 100,
    height: 100,
    backgroundColor: '#CCFF00',
    transform: [{ rotate: '45deg' }],
    opacity: 0.1,
  },
  newsHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 50,
    marginBottom: 20,
    gap: 10,
  },
  newsSectionTitle: {
    color: '#00FFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  newsListVertical: { paddingHorizontal: 50, gap: 15 },
  newsCardVertical: {
    width: '100%',
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 15,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(10px)',
  } as any,
  newsImageVertical: {
    width: 180,
    height: '100%',
  },
  newsOverlayVertical: {
    flex: 1,
    padding: 15,
    justifyContent: 'center',
  },
  newsTitleVertical: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  newsDescVertical: {
    color: '#AAA',
    fontSize: 12,
    lineHeight: 16,
  },
  newsSourcePremium: {
    color: '#00FFFF',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
    opacity: 0.8,
  },
  newsLoadingContainer: {
    paddingHorizontal: 50,
    paddingVertical: 30,
    alignItems: 'center',
  },

  backToTopCardVertical: {
    width: '100%',
    height: 80,
    backgroundColor: 'rgba(0,255,255,0.05)',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,255,255,0.2)',
    marginTop: 10,
  },
  backToTopText: {
    color: '#00FFFF',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 5,
    letterSpacing: 2
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
    height: 70,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center' },
  footerRight: { flexDirection: 'row', alignItems: 'center' },

  footerBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  footerHint: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  btnIcon: { color: '#00FFFF', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: 400, backgroundColor: '#2A2A2A', borderRadius: 12, padding: 25, borderWidth: 1, borderColor: '#444' },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#111', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#444' },
  inputFocused: {
    borderColor: '#00FFFF',
    borderWidth: 2,
    backgroundColor: '#111',
  },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  typeBtn: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#111', borderRadius: 8, marginHorizontal: 5, borderWidth: 1, borderColor: '#444' },
  typeBtnActive: { borderColor: '#00FFFF', backgroundColor: '#333' },
  typeBtnText: { color: '#FFF', fontWeight: 'bold' },
  platformScrollContent: { gap: 10, paddingVertical: 5 },
  platformBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  platformBtnActive: { borderColor: '#00FFFF', backgroundColor: '#00FFFF' },
  platformBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 6, fontSize: 12 },
  platformBtnTextActive: { color: '#000' },
  fileBtn: { backgroundColor: '#333', padding: 15, borderRadius: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  fileBtnText: { color: '#FFF', marginLeft: 10, flex: 1 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cancelBtn: { flex: 1, padding: 12, backgroundColor: '#555', borderRadius: 8, marginRight: 5, alignItems: 'center' },
  cancelBtnText: { color: '#FFF', fontWeight: 'bold' },
  saveBtn: { flex: 1, padding: 12, backgroundColor: '#00FFFF', borderRadius: 8, marginLeft: 5, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: 'bold' },
  // USER/POWER MODAL STYLES
  userModalOverlay: { flex: 1, backgroundColor: 'rgba(10, 10, 15, 0.95)', justifyContent: 'center', alignItems: 'center' },
  userModalContent: { width: '90%', maxWidth: 800, alignItems: 'center' },
  userModalHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30, 30, 45, 0.8)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 15, marginBottom: 40, alignSelf: 'flex-end', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  userModalHeaderAvatar: { width: 30, height: 30, borderRadius: 15, marginRight: 10 },
  userModalHeaderName: { color: '#E0E0FF', fontSize: 16, fontWeight: '500', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  powerButtonsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 50 },
  powerButton: { width: 160, height: 160, backgroundColor: 'rgba(40, 40, 60, 0.5)', borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  powerButtonActive: { backgroundColor: '#C4B5FD', borderColor: '#A78BFA' }, // Light purple/lavender
  powerIcon: { color: '#E0E0FF' },
  powerIconActive: { color: '#1E1E2E' },
  userModalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
  statusInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { color: '#A0A0C0', fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  statusSeparator: { color: '#404060', fontSize: 18 },
  modalAvatarContainer: { position: 'relative', marginRight: 15 },
  modalAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#FFF' },
  avatarEditBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#00FFFF', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#1E1E2E' },
  userModalHeaderStatus: { color: '#00FF00', fontSize: 10, fontWeight: 'bold' },
  modalUserNameInput: {
    color: '#E0E0FF',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    width: 200,
  },
  welcomeContainer: {
    marginLeft: 5,
    justifyContent: 'center',
  },
  welcomeText: {
    color: '#888',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  welcomeName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // New Focus Styles
  itemFocused: {
    borderWidth: 3,
    borderColor: '#00FFFF',
    transform: [{ scale: 1.05 }],
  },
  buttonFocused: {
    borderColor: '#00FFFF',
    borderWidth: 3,
    transform: [{ scale: 1.05 }],
    zIndex: 10,
  },
  tabFocused: {
    color: '#00FFFF',
    borderBottomWidth: 2,
    borderBottomColor: '#00FFFF',
    paddingBottom: 2,
  },
  footerBtnFocused: {
    backgroundColor: 'rgba(0, 255, 255, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  // Biblioteca Grid Styles
  libraryGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 50,
    gap: 20,
    justifyContent: 'flex-start',
  },
  libraryGridItem: {
    width: 180,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  libraryGridItemActive: {
    borderColor: '#00FFFF',
    transform: [{ scale: 1.05 }],
    zIndex: 10,
    shadowColor: '#00FFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  libraryItemImage: {
    width: '100%',
    height: '100%',
  },
  libraryItemOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
  },
  libraryItemTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  libraryEmpty: {
    flex: 1,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryEmptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 15,
    fontStyle: 'italic',
  },
  libraryBtnCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  libraryBtnText: {
    color: '#FFF',
    marginTop: 10,
    fontWeight: '600',
  },
  // Widgets Styles
  widgetsRowContainer: {
    marginTop: 30,
    height: 160,
  },
  widgetsScrollContent: {
    paddingHorizontal: 50,
    gap: 20,
    alignItems: 'center',
  },
  widgetCard: {
    width: 280,
    height: 140,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  widgetCardFocused: {
    borderColor: '#00FFFF',
    borderWidth: 2,
    transform: [{ scale: 1.02 }],
  },
  widgetBlur: {
    flex: 1,
    padding: 15,
  },
  widgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  widgetTitle: {
    color: '#888',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  widgetContent: {
    flex: 1,
    justifyContent: 'center',
  },
  widgetMainText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  widgetStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  widgetStatusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  widgetSubText: {
    color: '#666',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  screenshotPreview: {
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  storageBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    marginBottom: 10,
    overflow: 'hidden',
  },
  storageBar: {
    height: '100%',
    backgroundColor: '#00FFFF',
    borderRadius: 3,
  },
  // SETTINGS MODAL STYLES
  settingsOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsContainer: {
    width: 850,
    height: 600,
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingsSidebar: {
    width: 240,
    backgroundColor: '#141416',
    padding: 24,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
  },
  settingsSidebarTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 25,
    letterSpacing: 0.5,
  },
  settingsTab: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 10,
  },
  settingsTabActive: {
    backgroundColor: 'rgba(0, 255, 255, 0.08)',
    borderColor: 'rgba(0, 255, 255, 0.15)',
  },
  settingsTabText: {
    color: '#8E8E93',
    fontSize: 15,
    fontWeight: '600',
  },
  settingsTabTextActive: {
    color: '#00FFFF',
    fontWeight: 'bold',
  },
  settingsSidebarClose: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 10,
  },
  settingsSidebarCloseText: {
    color: '#8E8E93',
    fontSize: 15,
    fontWeight: '600',
  },
  settingsMain: {
    flex: 1,
    padding: 30,
    backgroundColor: '#1C1C1E',
  },
  settingsMainTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  settingsScrollContentInner: {
    paddingBottom: 20,
  },
  settingsSection: {
    marginBottom: 35,
  },
  settingsLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 15,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  settingsAvatarContainer: {
    position: 'relative',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#00FFFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  settingsAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  settingsAvatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    height: '30%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    color: '#FFF',
    padding: 15,
    borderRadius: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  colorPickerContainer: {
    flexDirection: 'row',
    gap: 15,
    alignItems: 'center',

  },
  colorPickerInput: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    overflow: 'hidden',
    // appearance: 'none',
    // WebkitAppearance: 'none',
    // border: 0,
    padding: 0,
    cursor: 'pointer',
  },
  colorCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#FFF',
    cursor: 'pointer',
  },
  colorCircleActive: {
    borderColor: '#FFF',
    transform: [{ scale: 1.15 }],
  },
  settingsOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  settingsOptionInfo: {
    flex: 1,
    marginRight: 20,
  },
  settingsOptionLabel: {
    color: '#E0E0FF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  settingsOptionDesc: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },
  toggleContainer: {
    width: 54,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 3,
    justifyContent: 'center',
  },
  toggleContainerActive: {
    backgroundColor: '#00FFFF',
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
  },
  toggleCircleActive: {
    transform: [{ translateX: 25 }],
  },
  settingsSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 15,
    borderRadius: 15,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingsSecondaryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  defaultAvatarContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  defaultAvatarHeader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  defaultAvatarModal: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFF',
  },
  mediaEmptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  mediaEmptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
    marginTop: 15,
    fontWeight: '600',
  },
  launchingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 9999,
  },
  launchingText: {
    color: '#00FFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    letterSpacing: 4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});

