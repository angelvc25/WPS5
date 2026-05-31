import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Platform, Modal, TextInput, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
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

const TABS = ['Games', 'Media'];

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
  { id: '1', title: 'Welcome', time: 'WConsole - Home', image: require('@/assets/images/Home.gif'), description: 'Bienvenido a tu consola personal. Accede a tus juegos y aplicaciones favoritas con una experiencia premium.', rating: 5.0, backgroundImage: require('@/assets/images/FondoDefault.png') },
  { id: 'last_played', title: 'Último Jugado', time: 'No ejecutado aún', image: require('@/assets/images/Home.gif'), isLastPlayed: true },
  // { id: '3', title: 'Favoritos Juegos', time: 'Folder - Colección', isFolder: true },
  // { id: '4', title: 'Favoritos Media', time: 'Aplicaciones de Streaming', isGrid: true },
];

const DATA_MEDIA: ConsoleItem[] = [];

export default function ConsoleHome() {
  const { activeUser, changeUser, updateUser } = useUser();
  const [activeTab, setActiveTab] = useState('Games');
  const [activeIndex, setActiveIndex] = useState(0);

  // Focus management
  type FocusArea = 'header_user' | 'header_tabs' | 'main_carousel' | 'game_panel' | 'footer';
  const [focusArea, setFocusArea] = useState<FocusArea>('main_carousel');
  const [focusIndex, setFocusIndex] = useState(0);
  // game_panel focus: 0=Play, 1=More, 2=Trophies, 3=Friends
  const [gamePanelFocusIndex, setGamePanelFocusIndex] = useState(0);

  // Steam news
  const [steamNews, setSteamNews] = useState<SteamNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const newsScrollRef = useRef<ScrollView>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // PS5-style card sizing: smaller, square cards like the real PS5
  const CARD_SIZE = 130;
  const CARD_GAP = 6;
  const ITEM_WIDTH = CARD_SIZE + CARD_GAP * 2;
  const LEFT_PADDING = 60;
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

  const isGamePanelFocused = focusArea === 'game_panel';
  const isLowerSectionFocused = isGamePanelFocused && gamePanelFocusIndex >= 2;

  useEffect(() => {
    gamePanelFocusAnim.value = withTiming(isGamePanelFocused ? 1 : 0, { duration: 300 });
  }, [isGamePanelFocused]);

  useEffect(() => {
    lowerSectionFocusAnim.value = withTiming(isLowerSectionFocused ? 1 : 0, { duration: 300 });
  }, [isLowerSectionFocused]);

  const animatedTabContentStyle = useAnimatedStyle(() => ({
    opacity: tabFade.value,
    transform: [{ translateY: interpolate(tabFade.value, [0, 1], [10, 0]) }]
  }));

  const topPanelStyle = useAnimatedStyle(() => ({
    opacity: 1 - lowerSectionFocusAnim.value,
    transform: [{ translateY: interpolate(lowerSectionFocusAnim.value, [0, 1], [0, -20]) }],
    maxHeight: interpolate(lowerSectionFocusAnim.value, [0, 1], [500, 0]),
    marginTop: interpolate(lowerSectionFocusAnim.value, [0, 1], [0, -20]),
    overflow: lowerSectionFocusAnim.value > 0.01 ? 'hidden' : 'visible'
  }));

  const spacerStyle = useAnimatedStyle(() => {
    const isWelcome = (activeTab === 'Games' ? games : media)[activeIndex]?.id === '1';
    const targetMinHeight = interpolate(
      lowerSectionFocusAnim.value,
      [0, 1],
      [
        interpolate(gamePanelFocusAnim.value, [0, 1], [windowHeight - 390, windowHeight * 0.5 + 200]),
        320
      ]
    );
    return {
      minHeight: isWelcome ? 30 : Math.max(0, targetMinHeight),
      justifyContent: 'flex-end',
      paddingBottom: 20,
    };
  });

  const headerStyle = useAnimatedStyle(() => ({
    opacity: 1 - gamePanelFocusAnim.value,
    transform: [{ translateY: interpolate(gamePanelFocusAnim.value, [0, 1], [0, -20]) }],
    maxHeight: interpolate(gamePanelFocusAnim.value, [0, 1], [120, 0]),
    paddingTop: interpolate(gamePanelFocusAnim.value, [0, 1], [40, 0]),
    paddingBottom: interpolate(gamePanelFocusAnim.value, [0, 1], [12, 0]),
    overflow: 'hidden'
  }));

  const carouselStyle = useAnimatedStyle(() => ({
    opacity: 1 - gamePanelFocusAnim.value,
    transform: [{ translateY: interpolate(gamePanelFocusAnim.value, [0, 1], [0, -20]) }],
    height: interpolate(gamePanelFocusAnim.value, [0, 1], [240, 0]),
    overflow: 'hidden'
  }));

  const topBarMiniStyle = useAnimatedStyle(() => ({
    opacity: gamePanelFocusAnim.value,
    transform: [{ translateY: interpolate(gamePanelFocusAnim.value, [0, 1], [-20, 0]) }],
    pointerEvents: isGamePanelFocused ? 'auto' : 'none'
  }));

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
    if (!isUserModalVisible && focusArea === 'header_user') setFocusArea('main_carousel');
  }, [isUserModalVisible]);

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

        if (e.key === 'o' || e.key === 'O') {
          if (!isLaunching) {
            const willBeVisible = !isAddModalVisible;
            setAddModalVisible(willBeVisible);
            if (willBeVisible) { setUserModalVisible(false); setSettingsVisible(false); setFavoritesVisible(false); setHomeBgModalVisible(false); }
          }
          return;
        }

        if (isUserModalVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') { setUserModalVisible(false); setFocusArea('main_carousel'); }
          else if (e.key === 'ArrowRight') setModalSelectedIndex(prev => Math.min(prev + 1, 3));
          else if (e.key === 'ArrowLeft') setModalSelectedIndex(prev => Math.max(prev - 1, 0));
          else if (e.key === 'Enter') {
            if (modalSelectedIndex === 0) { setUserModalVisible(false); setSettingsVisible(true); }
            else if (modalSelectedIndex === 2) { setUserModalVisible(false); changeUser(); }
            else if (modalSelectedIndex === 3) { if ((window as any).electronAPI) (window as any).electronAPI.closeApp(); }
          }
          return;
        }
        if (isSettingsVisible) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') { setSettingsVisible(false); setUserModalVisible(true); setFocusArea('header_user'); }
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
          if (focusArea === 'main_carousel') { const nextIdx = Math.min(activeIndex + 1, currentData.length - 1); setActiveIndex(nextIdx); setFocusIndex(nextIdx); }
          else if (focusArea === 'header_tabs') {
            const nextIdx = Math.min(focusIndex + 1, TABS.length - 1);
            setFocusIndex(nextIdx); setActiveTab(TABS[nextIdx]); setActiveIndex(0);
          }
          else if (focusArea === 'game_panel') {
            if (gamePanelFocusIndex === 0) {
              setGamePanelFocusIndex(1);
            } else if (gamePanelFocusIndex === 2) {
              setGamePanelFocusIndex(3);
            } else if (gamePanelFocusIndex >= 4) {
              setGamePanelFocusIndex(prev => Math.min(prev + 1, 4 + steamNews.length - 1));
            }
          }
          return;
        }
        if (e.key === 'ArrowLeft') {
          soundService.playNavigation();
          if (focusArea === 'main_carousel') { const nextIdx = Math.max(activeIndex - 1, 0); setActiveIndex(nextIdx); setFocusIndex(nextIdx); }
          else if (focusArea === 'header_tabs') {
            const nextIdx = Math.max(focusIndex - 1, 0);
            setFocusIndex(nextIdx); setActiveTab(TABS[nextIdx]); setActiveIndex(0);
          }
          else if (focusArea === 'game_panel') {
            if (gamePanelFocusIndex === 1) {
              setGamePanelFocusIndex(0);
            } else if (gamePanelFocusIndex === 3) {
              setGamePanelFocusIndex(2);
            } else if (gamePanelFocusIndex >= 4) {
              setGamePanelFocusIndex(prev => Math.max(prev - 1, 4));
            }
          }
          return;
        }
        if (e.key === 'ArrowDown') {
          soundService.playNavigation();
          if (focusArea === 'header_user' || focusArea === 'header_tabs') { setFocusArea('main_carousel'); setFocusIndex(activeIndex); }
          else if (focusArea === 'main_carousel' && canPlay) { setFocusArea('game_panel'); setGamePanelFocusIndex(0); }
          else if (focusArea === 'game_panel') {
            if (gamePanelFocusIndex === 0) {
              setGamePanelFocusIndex(2);
            } else if (gamePanelFocusIndex === 1) {
              setGamePanelFocusIndex(3);
            } else if (gamePanelFocusIndex === 2 || gamePanelFocusIndex === 3) {
              if (steamNews.length > 0) {
                setGamePanelFocusIndex(4);
              }
            }
          }
          return;
        }
        if (e.key === 'ArrowUp') {
          soundService.playNavigation();
          if (focusArea === 'game_panel') {
            if (gamePanelFocusIndex === 0 || gamePanelFocusIndex === 1) {
              setFocusArea('main_carousel');
              setFocusIndex(activeIndex);
            } else if (gamePanelFocusIndex === 2) {
              setGamePanelFocusIndex(0);
            } else if (gamePanelFocusIndex === 3) {
              setGamePanelFocusIndex(1);
            } else if (gamePanelFocusIndex >= 4) {
              const newsIndex = gamePanelFocusIndex - 4;
              if (newsIndex % 2 === 0) {
                setGamePanelFocusIndex(2);
              } else {
                setGamePanelFocusIndex(3);
              }
            }
          }
          else if (focusArea === 'main_carousel') { setFocusArea('header_tabs'); setFocusIndex(TABS.indexOf(activeTab)); }
          else if (focusArea === 'header_tabs') { setFocusArea('header_user'); setFocusIndex(0); }
          return;
        }
        if (e.key === 'Enter') {
          soundService.playActivation();
          if (focusArea === 'game_panel') {
            if (gamePanelFocusIndex === 0 || gamePanelFocusIndex === 1) {
              if (activeItem) { handleLaunchApp(activeItem); }
            } else if (gamePanelFocusIndex >= 4) {
              const newsItem = steamNews[gamePanelFocusIndex - 4];
              if (newsItem && newsItem.url) {
                Linking.openURL(newsItem.url);
              }
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
          } else if (focusArea === 'header_user') { setUserModalVisible(true); }
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
  }, [activeTab, currentData, activeIndex, focusArea, focusIndex, gamePanelFocusIndex, isAddModalVisible, isUserModalVisible, isFavoritesVisible, selectedItem, modalSelectedIndex, addModalFocusIndex, bgModalFocusIndex, settingsFocusArea, settingsFocusIndex, settingsTab, isHomeBgModalVisible, homeBackground, newApp, steamNews]);

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

  // Auto-scroll main vertical scrollview when focus moves to lower sections
  useEffect(() => {
    if (!mainScrollRef.current) return;
    if (focusArea !== 'game_panel') {
      mainScrollRef.current.scrollTo({ y: 0, animated: true });
    } else {
      if (gamePanelFocusIndex === 0 || gamePanelFocusIndex === 1) {
        mainScrollRef.current.scrollTo({ y: 0, animated: true });
      } else if (gamePanelFocusIndex === 2 || gamePanelFocusIndex === 3) {
        mainScrollRef.current.scrollTo({ y: 220, animated: true });
      } else if (gamePanelFocusIndex >= 4) {
        mainScrollRef.current.scrollTo({ y: 480, animated: true });
      }
    }
  }, [focusArea, gamePanelFocusIndex]);

  // Auto-scroll news horizontal scrollview when navigating through news cards
  useEffect(() => {
    if (focusArea === 'game_panel' && gamePanelFocusIndex >= 4 && newsScrollRef.current) {
      const newsIndex = gamePanelFocusIndex - 4;
      const cardWidth = 500;
      const gap = 16;
      const scrollX = newsIndex * (cardWidth + gap);
      newsScrollRef.current.scrollTo({ x: scrollX, animated: true });
    }
  }, [gamePanelFocusIndex, focusArea]);

  // Auto-scroll carousel
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        const scrollX = activeIndex * ITEM_WIDTH;
        scrollRef.current.scrollTo({ x: scrollX, animated: true });
      }
    }, 10);
    return () => clearTimeout(timer);
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

  const currentBg = (activeTab === 'Games' && activeIndex === 0)
    ? (homeBackground || require('@/assets/images/FondoDefault.png'))
    : (currentData[activeIndex]?.isLastPlayed ? lastPlayedGame?.backgroundImage : (currentData[activeIndex]?.backgroundImage || require('@/assets/images/FondoDefault.png')));

  useEffect(() => {
    if (activeLayer === 'A') {
      if (currentBg !== bgA) { setBgB(currentBg); setActiveLayer('B'); fade.value = withTiming(1, { duration: 800 }); }
    } else {
      if (currentBg !== bgB) { setBgA(currentBg); setActiveLayer('A'); fade.value = withTiming(0, { duration: 800 }); }
    }
  }, [currentBg]);

  useEffect(() => { if (currentBg && !bgA && !bgB) setBgA(currentBg); }, []);

  const animatedStyleB = useAnimatedStyle(() => ({ opacity: fade.value }));

  // Get the active item info for the bottom panel
  const activeItem = currentData[activeIndex];
  const displayTitle = activeItem?.isLastPlayed ? (lastPlayedGame ? lastPlayedGame.title : 'Último Jugado') : activeItem?.title;
  const displayLogo = activeItem?.isLastPlayed ? lastPlayedGame?.logo : activeItem?.logo;
  const displayDesc = activeItem?.isLastPlayed ? (lastPlayedGame?.description || '') : (activeItem?.description || '');
  const canPlay = activeItem && !activeItem.isFolder && !activeItem.isGrid && activeItem.id !== '1';

  return (
    <SafeAreaView style={styles.container}>
      {/* === BACKGROUND: Dual Layer Crossfade === */}
      <View style={StyleSheet.absoluteFill}>
        {showTrailer && currentData[activeIndex]?.youtubeId ? (
          <View style={{ width: windowWidth, height: windowHeight, overflow: 'hidden' }}>
            <YoutubePlayer height={windowHeight} width={windowWidth} play={true} videoId={currentData[activeIndex].youtubeId!} mute={true} />
          </View>
        ) : (
          <>
            {bgA && <Image source={bgA} style={StyleSheet.absoluteFillObject} contentFit="cover" />}
            <Animated.View style={[StyleSheet.absoluteFill, animatedStyleB]}>
              {bgB && <Image source={bgB} style={StyleSheet.absoluteFillObject} contentFit="cover" />}
            </Animated.View>
          </>
        )}
      </View>

      {/* === GRADIENT OVERLAY (PS5 style: dark on left, transparent on right) === */}
      <View style={styles.gradientOverlay} pointerEvents="none" />
      <View style={styles.gradientOverlayTop} pointerEvents="none" />

      {/* MINI HEADER FOR GAME PANEL FOCUS */}
      <Animated.View style={[styles.miniHeader, topBarMiniStyle]} pointerEvents="none">
        {canPlay && activeItem && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={activeItem.isLastPlayed ? (lastPlayedGame?.image ?? activeItem.image) : activeItem.image} style={{ width: 36, height: 36, borderRadius: 8, marginRight: 12 }} />
            <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>{displayTitle}</Text>
          </View>
        )}
      </Animated.View>

      {/* === HEADER (PS5 style) — fixed on top === */}
      <Animated.View style={[styles.header, headerStyle]}>
        {/* Left: Navigation Tabs */}
        <View style={styles.headerLeft}>
          <ControlPrompt btn="L" label="" inputMode={inputMode} />
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
          <ControlPrompt btn="R" label="" inputMode={inputMode} />
        </View>

        {/* Right: Icons + Avatar + Clock */}
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons name="search" size={20} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconBtn}
            activeOpacity={0.7}
            onPress={() => { setUserModalVisible(false); setSettingsVisible(true); }}
          >
            <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>

          <View style={{ position: 'relative' }}>
            <TouchableOpacity
              id="avatar-btn"
              onPress={() => { setFocusArea('header_user'); setUserModalVisible(true); }}
              style={[
                styles.avatarContainer,
                activeUser ? { borderColor: activeUser.color } : {},
                focusArea === 'header_user' && styles.avatarFocused
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
            <View style={styles.activeStatusDot} />
          </View>

          <Text style={styles.timeText}>{currentTime}</Text>
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
              contentContainerStyle={{ paddingLeft: LEFT_PADDING, paddingRight: RIGHT_PADDING, alignItems: 'center' }}
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

                let cardContent;

                if (item.id === 'more_library') {
                  cardContent = (
                    <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9} style={[styles.cardWrapper, isActive && styles.cardWrapperActive]}>
                      <BlurView intensity={40} tint="dark" style={[styles.card, styles.moreCard, isActive && styles.cardActive]}>
                        <MaterialCommunityIcons name="library-shelves" size={32} color={isActive ? "#FFF" : "#999"} />
                      </BlurView>
                    </TouchableOpacity>
                  );
                } else if (item.isGrid) {
                  cardContent = (
                    <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9} style={[styles.cardWrapper, isActive && styles.cardWrapperActive]}>
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
                  );
                } else if (item.isFolder) {
                  cardContent = (
                    <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9} style={[styles.cardWrapper, isActive && styles.cardWrapperActive]}>
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
                  );
                } else if (item.isLastPlayed && !lastPlayedGame) {
                  cardContent = (
                    <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9} style={[styles.cardWrapper, isActive && styles.cardWrapperActive]}>
                      <BlurView intensity={30} tint="dark" style={[styles.card, styles.emptyCard, isActive && styles.cardActive]}>
                        <MaterialCommunityIcons name="history" size={32} color={isActive ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)"} />
                      </BlurView>
                    </TouchableOpacity>
                  );
                } else {
                  const imgSource = item.isLastPlayed ? (lastPlayedGame?.image ?? item.image) : item.image;
                  cardContent = (
                    <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9} style={[styles.cardWrapper, isActive && styles.cardWrapperActive]}>
                      <Image source={imgSource} style={[styles.card, isActive && styles.cardActive]} contentFit="cover" />
                    </TouchableOpacity>
                  );
                }

                return (
                  <View key={item.id} style={{ position: 'relative', overflow: 'visible', zIndex: isActive ? 10 : 1 }}>
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
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>

        {/* GAME INFO PANEL (bottom-left, PS5 style) */}
        <Animated.View style={[styles.gameInfoPanel, gameInfoPanelStyle]}>
          <Animated.View style={spacerStyle}>
            <Animated.View style={topPanelStyle}>
              {/* Logo or title */}
              {displayLogo ? (
                <Image source={displayLogo} style={styles.gameLogo} contentFit="contain" />
              ) : (
                <Text style={styles.gameTitle} numberOfLines={2}>{displayTitle}</Text>
              )}

              {/* Description
              {displayDesc ? (
                <Text style={styles.gameDesc} numberOfLines={2}>{displayDesc}</Text>
              ) : null} */}

              {/* Action Buttons */}
              {canPlay && (
                <View style={styles.actionButtons}>
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
                </View>
              )}
            </Animated.View>
          </Animated.View>

          <View style={{ paddingBottom: 80 }}>
            {/* === WELCOME WIDGETS (only when Welcome card is active) === */}
            {activeItem?.id === '1' && (
              <View style={styles.widgetGrid}>
                {/* Row 1 */}
                <View style={styles.widgetRow}>
                  {/* Controller Widget */}
                  <BlurView intensity={28} tint="dark" style={[styles.widgetCard, { flex: 0.8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialCommunityIcons name="gamepad-variant" size={26} color="#FFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>{gamepadInfo.connected ? gamepadInfo.name.split('(')[0].trim() : 'Control inalámbrico DualSense'}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Ionicons name="battery-full" size={14} color="#4CD964" />
                          <Text style={{ color: '#888', fontSize: 11 }}>{gamepadInfo.connected ? `${Math.round(gamepadInfo.battery * 100)}%` : '75%'}</Text>
                        </View>
                      </View>
                    </View>
                  </BlurView>

                  {/* Trophies Widget */}
                  <BlurView intensity={28} tint="dark" style={[styles.widgetCard, { flex: 1.2 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MaterialCommunityIcons name="trophy" size={18} color="#FFD700" />
                        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>Trofeos</Text>
                      </View>
                      <Text style={{ color: '#888', fontSize: 12 }}>Total: 232</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <MaterialCommunityIcons name="trophy" size={14} color="#B8D4E8" />
                        <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>0</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <MaterialCommunityIcons name="trophy" size={14} color="#FFD700" />
                        <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>9</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <MaterialCommunityIcons name="trophy" size={14} color="#C0C0C0" />
                        <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>28</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <MaterialCommunityIcons name="trophy" size={14} color="#CD7F32" />
                        <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>195</Text>
                      </View>
                    </View>
                  </BlurView>

                  {/* Store Widget */}
                  <BlurView intensity={28} tint="dark" style={[styles.widgetCard, { flex: 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Ionicons name="bag-handle" size={16} color="#0070D1" />
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>PlayStation Store</Text>
                    </View>
                    <Text style={{ color: '#AAA', fontSize: 12 }} numberOfLines={1}>Descubre las últimas ofertas</Text>
                    <Text style={{ color: '#0070D1', fontSize: 13, fontWeight: '700', marginTop: 4 }}>Ver tienda →</Text>
                  </BlurView>

                  {/* News Widget */}
                  <BlurView intensity={28} tint="dark" style={[styles.widgetCard, { flex: 0.6 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Ionicons name="newspaper" size={16} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>Noticias</Text>
                    </View>
                    <Text style={{ color: '#888', fontSize: 12 }}>Descubre juegos</Text>
                  </BlurView>
                </View>

                {/* Row 2 */}
                <View style={styles.widgetRow}>
                  {/* Recently Played Widget */}
                  <BlurView intensity={28} tint="dark" style={[styles.widgetCard, { flex: 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <Ionicons name="game-controller" size={16} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>Jugados recientemente</Text>
                    </View>
                    {lastPlayedGame ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Image source={lastPlayedGame.image} style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{lastPlayedGame.title}</Text>
                          <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>Hace poco</Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>Sin juegos recientes</Text>
                    )}
                  </BlurView>

                  {/* Messages Widget */}
                  <BlurView intensity={28} tint="dark" style={[styles.widgetCard, { flex: 0.9 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <Ionicons name="chatbubble" size={16} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>Mensajes</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person" size={18} color="#AAA" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>{activeUser?.name || 'Usuario'}</Text>
                        <Text style={{ color: '#888', fontSize: 11 }}>Sin mensajes nuevos</Text>
                      </View>
                    </View>
                  </BlurView>

                  {/* Storage Widget */}
                  <BlurView intensity={28} tint="dark" style={[styles.widgetCard, { flex: 1.1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MaterialCommunityIcons name="harddisk" size={16} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>Almacenamiento</Text>
                      </View>
                      <Ionicons name="information-circle-outline" size={16} color="#888" />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <MaterialCommunityIcons name="circle" size={8} color="#AAA" />
                      <Text style={{ color: '#AAA', fontSize: 12 }}>Espacio libre</Text>
                      <Text style={{ color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 'auto' }}>36.47 GB</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: '65%', borderRadius: 3, backgroundColor: '#0070D1' }} />
                    </View>
                  </BlurView>

                  {/* Wishlist Widget */}
                  <BlurView intensity={28} tint="dark" style={[styles.widgetCard, { flex: 0.6 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Ionicons name="heart" size={16} color="#FF6B6B" />
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>Lista de deseos</Text>
                    </View>
                    <Text style={{ color: '#888', fontSize: 12 }}>Ver tu lista</Text>
                  </BlurView>
                </View>
              </View>
            )}

            {/* Trophies & Friends Cards (for games, not Welcome) */}
            {canPlay && (
              <View style={styles.infoCardsRow}>
                {/* Trophies Card */}
                <BlurView intensity={28} tint="dark" style={[
                  styles.infoCard,
                  focusArea === 'game_panel' && gamePanelFocusIndex === 2 && styles.infoCardFocused
                ]}>
                  {/* Trophies row */}
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
                  {/* Avatars row */}
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
                            styles.newsCard,
                            isNewsFocused && styles.newsCardFocused
                          ]}
                          activeOpacity={0.8}
                          onPress={() => { if (item.url) Linking.openURL(item.url); }}
                        >
                          {/* Thumbnail area */}
                          <View style={styles.newsCardThumbnail}>
                            {item.image_url ? (
                              <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                            ) : (
                              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' }}>
                                <Ionicons name="newspaper-outline" size={32} color="rgba(255,255,255,0.2)" />
                              </View>
                            )}
                          </View>
                          {/* Text area */}
                          <View style={styles.newsCardContent}>
                            <Text style={styles.newsCardTitle} numberOfLines={2}>
                              {item.title}
                            </Text>
                            <Text style={styles.newsCardFooterText} numberOfLines={1}>
                              {(item.feedlabel || item.feedname || 'Steam')} | {formatSteamDate(item.date)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}
          </View>
        </Animated.View>
      </Animated.ScrollView>

      {/* === MODALS (same as before, preserved fully) === */}

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
              <TouchableOpacity style={[styles.settingsSidebarClose, (settingsFocusArea === 'sidebar' && settingsFocusIndex === 3) && styles.buttonFocused]} onPress={() => { setSettingsVisible(false); setUserModalVisible(true); }}>
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

    </SafeAreaView>
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
    gap: 4,
  },
  tabTouchable: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navItem: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  navItemActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabFocused: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255,255,255,0.8)',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    gap: 12,
  },
  widgetRow: {
    flexDirection: 'row',
    gap: 12,
  } as any,
  widgetCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    minHeight: 80,
    justifyContent: 'center',
  } as any,

  // === CAROUSEL ===
  carouselSection: {
    height: 240,
    justifyContent: 'center',
    marginBottom: 0,
  },
  cardWrapper: {
    marginHorizontal: 6,
    borderRadius: 10,
    overflow: 'hidden',
    opacity: 0.65,
    transform: [{ scale: 1 }, { translateY: 0 }],
  },
  cardWrapperActive: {
    opacity: 1,
    transform: [{ scale: 1.2 }, { translateY: 13 }],
    marginLeft: 10,
    marginRight: 10,
  },
  card: {
    width: 130,
    height: 130,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardActive: {
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: 'rgba(255,255,255,0.5)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
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
    paddingLeft: 50,
    paddingTop: 24,
    maxWidth: '100%' as any,
  },
  gameLogo: {
    width: 360,
    height: 120,
    marginBottom: 14,
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
    minWidth: 260,
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
    top: 132,
    left: 155,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    minWidth: 500,
  },
  platformBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformBadgeText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  activeGameTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
    whiteSpace: 'nowrap',
  } as any,
});
