import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Platform, TextInput, ScrollView, useWindowDimensions, Linking } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
import { ConsoleItem } from '../app/(tabs)/index';
import YoutubePlayer from './YoutubePlayer';
import ControlPrompt from './ControlPrompt';
import { useUser } from '../contexts/UserContext';
import { fetchSteamNewsByName, SteamNewsItem } from '../services/steamNewsService';
import { fetchSteamMediaByName, SteamMediaItem } from '../services/steamMediaService';

interface GameDetailViewProps {
  isVisible: boolean;
  item: ConsoleItem | null;
  onClose: () => void;
  onLaunch?: (id: string, path: string) => void;
  onRefresh?: () => void;
  isLaunching?: boolean;
  inputMode: 'keyboard' | 'gamepad';
}

const GameDetailView: React.FC<GameDetailViewProps> = ({ isVisible, item, onClose, onLaunch, onRefresh, isLaunching, inputMode }) => {
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editData, setEditData] = useState<Partial<ConsoleItem>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0); // 0:Jugar, 1:···, 2:Trofeos, 3:Amigos
  const [editModalFocusIndex, setEditModalFocusIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'basic' | 'path' | 'art'>('basic');
  const { activeUser } = useUser();

  const { width } = useWindowDimensions();
  const isSmallScreen = width < 1100;

  // focusIndex >= 2 → ocultar logo+botones (topPanel)
  // focusIndex >= 4 → ocultar cards trofeos/amigos
  const topPanelAnim = useSharedValue(1);   // 1=visible, 0=oculto
  const infoCardsAnim = useSharedValue(1);  // 1=visible, 0=oculto
  const panelLiftAnim = useSharedValue(0);  // 0=normal, 1=levantado (focusIndex >= 2)
  const darkOverlayAnim = useSharedValue(0); // 0=normal, 1=más oscuro

  useEffect(() => {
    topPanelAnim.value = withTiming(focusIndex >= 2 ? 0 : 1, { duration: 300 });
  }, [focusIndex]);

  useEffect(() => {
    const isElevated = focusIndex >= 2; // cards, capturas y noticias
    panelLiftAnim.value = withTiming(isElevated ? 1 : 0, { duration: 350 });
    darkOverlayAnim.value = withTiming(isElevated ? 1 : 0, { duration: 350 });
  }, [focusIndex]);

  useEffect(() => {
    infoCardsAnim.value = withTiming(focusIndex >= 100 ? 0 : 1, { duration: 300 });
  }, [focusIndex]);

  // Auto-scroll horizontal rows when focus moves
  useEffect(() => {
    if (focusIndex >= 100 && focusIndex < 200) {
      const idx = focusIndex - 100;
      mediaScrollRef.current?.scrollTo({ x: idx * 516, animated: true });
    } else if (focusIndex >= 200) {
      const idx = focusIndex - 200;
      newsScrollRef.current?.scrollTo({ x: idx * 336, animated: true });
    }
  }, [focusIndex]);

  const topPanelStyle = useAnimatedStyle(() => ({
    opacity: topPanelAnim.value,
    transform: [{ translateY: interpolate(topPanelAnim.value, [0, 1], [-20, 0]) }],
    maxHeight: interpolate(topPanelAnim.value, [0, 1], [0, 500]),
    overflow: topPanelAnim.value < 0.99 ? 'hidden' : 'visible',
  }));

  const infoCardsStyle = useAnimatedStyle(() => ({
    opacity: infoCardsAnim.value,
    transform: [{ translateY: interpolate(infoCardsAnim.value, [0, 1], [20, 0]) }],
    maxHeight: interpolate(infoCardsAnim.value, [0, 1], [0, 200]),
    overflow: 'hidden',
  }));

  // panelLiftStyle vacio - el lift se hace animando paddingTop del ScrollView
  const panelLiftStyle = useAnimatedStyle(() => ({}));

  const scrollPaddingStyle = useAnimatedStyle(() => ({
    paddingTop: interpolate(panelLiftAnim.value, [0, 1], [380, 60]),
    paddingBottom: 80,
  }));

  const darkOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(darkOverlayAnim.value, [0, 1], [0, 0.5]),
  }));

  const editTitleRef = React.useRef<TextInput>(null);
  const editDescRef = React.useRef<TextInput>(null);
  const editPathInputRef = React.useRef<TextInput>(null);

  // Steam data
  const [steamNews, setSteamNews] = useState<SteamNewsItem[]>([]);
  const [steamMedia, setSteamMedia] = useState<SteamMediaItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const mediaScrollRef = React.useRef<ScrollView>(null);
  const newsScrollRef = React.useRef<ScrollView>(null);

  // Fetch steam data when item changes
  useEffect(() => {
    if (!item || !isVisible) return;
    const title = item.title;
    if (!title) return;
    let cancelled = false;

    setSteamMedia([]);
    setMediaLoading(true);
    fetchSteamMediaByName(title).then(({ items }) => {
      if (!cancelled) { setSteamMedia(items); setMediaLoading(false); }
    });

    setSteamNews([]);
    setNewsLoading(true);
    fetchSteamNewsByName(title).then(news => {
      if (!cancelled) { setSteamNews(news); setNewsLoading(false); }
    });

    return () => { cancelled = true; };
  }, [item?.id, isVisible]);


  useEffect(() => {
    if (item) {
      setFocusIndex(0); // Reset focus when opening
      const initialData: any = {
        id: item.id,
        title: item.title,
        description: item.description,
        rating: item.rating,
        image: item.image?.uri?.startsWith('local-file://') ? item.image.uri.replace('local-file://', '') : (item.image?.uri?.startsWith('http') ? item.image.uri : undefined),
        logo: item.logo?.uri?.startsWith('local-file://') ? item.logo.uri.replace('local-file://', '') : (item.logo?.uri?.startsWith('http') ? item.logo.uri : undefined),
        backgroundImage: item.backgroundImage?.uri?.startsWith('local-file://') ? item.backgroundImage.uri.replace('local-file://', '') : (item.backgroundImage?.uri?.startsWith('http') ? item.backgroundImage.uri : undefined),
        video: item.video?.uri?.startsWith('local-file://') ? item.video.uri.replace('local-file://', '') : (item.video?.uri?.startsWith('http') ? item.video.uri : undefined),
        youtubeId: item.youtubeId,
        platform: item.platform,
        path: item.path,
        type: item.type,
      };

      setEditData(initialData);
    }
  }, [item, isVisible]);

  useEffect(() => {
    if (isEditModalVisible) {
      setEditModalFocusIndex(20);
      setActiveTab('basic');
    }
  }, [isEditModalVisible]);

  useEffect(() => {
    if (isEditModalVisible) {
      if (editModalFocusIndex === 20) setActiveTab('basic');
      else if (editModalFocusIndex === 21) setActiveTab('path');
      else if (editModalFocusIndex === 22) setActiveTab('art');
    }
  }, [editModalFocusIndex, isEditModalVisible]);

  // Keyboard navigation within Detail View
  useEffect(() => {
    if (isVisible && !isLaunching) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
        }

        if (isEditModalVisible) {
          const isGame = (editData.type || item?.type) !== 'media' && (editData.type || item?.type) !== 'web';

          if (e.key === 'ArrowDown') {
            if (editModalFocusIndex === 20) setEditModalFocusIndex(21);
            else if (editModalFocusIndex === 21) setEditModalFocusIndex(22);
            else if (editModalFocusIndex === 22) { } // Tab end

            // Tab 1: basic
            else if (editModalFocusIndex === 2) setEditModalFocusIndex(isGame ? 3 : 10);
            else if (editModalFocusIndex >= 3 && editModalFocusIndex <= 9) setEditModalFocusIndex(10);
            else if (editModalFocusIndex === 10) setEditModalFocusIndex(16); // to Cancel

            // Tab 2: path
            else if (editModalFocusIndex === 18) setEditModalFocusIndex(16); // to Cancel

            // Tab 3: art
            else if (editModalFocusIndex === 0) setEditModalFocusIndex(11);
            else if (editModalFocusIndex === 11) setEditModalFocusIndex(13);
            else if (editModalFocusIndex === 12) setEditModalFocusIndex(14);
            else if (editModalFocusIndex === 13) setEditModalFocusIndex(16); // to Cancel
            else if (editModalFocusIndex === 14) setEditModalFocusIndex(17); // to Save

            // Actions
            else if (editModalFocusIndex >= 15 && editModalFocusIndex <= 17) { }
          }

          else if (e.key === 'ArrowUp') {
            if (editModalFocusIndex === 22) setEditModalFocusIndex(21);
            else if (editModalFocusIndex === 21) setEditModalFocusIndex(20);
            else if (editModalFocusIndex === 20) { } // Tab start

            // Tab 1: basic
            else if (editModalFocusIndex === 2) setEditModalFocusIndex(20); // Back to sidebar basic tab
            else if (editModalFocusIndex >= 3 && editModalFocusIndex <= 9) setEditModalFocusIndex(2);
            else if (editModalFocusIndex === 10) setEditModalFocusIndex(isGame ? 3 : 2);

            // Tab 2: path
            else if (editModalFocusIndex === 18) setEditModalFocusIndex(21); // Back to sidebar path tab

            // Tab 3: art
            else if (editModalFocusIndex === 0) setEditModalFocusIndex(22); // Back to sidebar art tab
            else if (editModalFocusIndex === 11) setEditModalFocusIndex(0);
            else if (editModalFocusIndex === 12) setEditModalFocusIndex(0);
            else if (editModalFocusIndex === 13) setEditModalFocusIndex(11);
            else if (editModalFocusIndex === 14) setEditModalFocusIndex(12);

            // Actions
            else if (editModalFocusIndex >= 15 && editModalFocusIndex <= 17) {
              if (activeTab === 'basic') setEditModalFocusIndex(10);
              else if (activeTab === 'path') setEditModalFocusIndex(18);
              else if (activeTab === 'art') setEditModalFocusIndex(editModalFocusIndex === 17 ? 14 : 13);
            }
          }

          else if (e.key === 'ArrowRight') {
            // From tabs to content area
            if (editModalFocusIndex === 20) setEditModalFocusIndex(2); // Basic -> Title
            else if (editModalFocusIndex === 21) setEditModalFocusIndex(18); // Path -> Path selection
            else if (editModalFocusIndex === 22) setEditModalFocusIndex(0); // Art -> Sync

            // Within content elements
            else if (editModalFocusIndex >= 3 && editModalFocusIndex < 9) setEditModalFocusIndex(prev => prev + 1);
            else if (editModalFocusIndex === 11) setEditModalFocusIndex(12);
            else if (editModalFocusIndex === 13) setEditModalFocusIndex(14);

            // Actions
            else if (editModalFocusIndex >= 15 && editModalFocusIndex < 17) setEditModalFocusIndex(prev => prev + 1);
          }

          else if (e.key === 'ArrowLeft') {
            // From content area to tabs sidebar
            if (editModalFocusIndex === 2) setEditModalFocusIndex(20);
            else if (editModalFocusIndex >= 3 && editModalFocusIndex <= 9) setEditModalFocusIndex(20);
            else if (editModalFocusIndex === 10) setEditModalFocusIndex(20);

            else if (editModalFocusIndex === 18) setEditModalFocusIndex(21);

            else if (editModalFocusIndex === 0) setEditModalFocusIndex(22);
            else if (editModalFocusIndex === 11 || editModalFocusIndex === 13) setEditModalFocusIndex(22);
            else if (editModalFocusIndex === 12) setEditModalFocusIndex(11);
            else if (editModalFocusIndex === 14) setEditModalFocusIndex(13);

            // Actions
            else if (editModalFocusIndex > 15 && editModalFocusIndex <= 17) setEditModalFocusIndex(prev => prev - 1);
          }

          else if (e.key === 'Enter') {
            if (editModalFocusIndex === 20) setActiveTab('basic');
            else if (editModalFocusIndex === 21) setActiveTab('path');
            else if (editModalFocusIndex === 22) setActiveTab('art');
            else if (editModalFocusIndex === 0) handleUnifiedSync();
            else if (editModalFocusIndex === 2) editTitleRef.current?.focus();
            else if (editModalFocusIndex === 18) {
              if ((editData.type || item?.type) === 'web') editPathInputRef.current?.focus();
              else handleSelectPath();
            }
            else if (editModalFocusIndex >= 3 && editModalFocusIndex <= 9) {
              const platforms = ['PC', 'PS5', 'Xbox', 'Switch', 'Steam', 'EA', 'Epic'];
              setEditData({ ...editData, platform: platforms[editModalFocusIndex - 3] });
            }
            else if (editModalFocusIndex === 10) editDescRef.current?.focus();
            else if (editModalFocusIndex === 11) handleSelectImage('image');
            else if (editModalFocusIndex === 12) handleSelectImage('logo');
            else if (editModalFocusIndex === 13) handleSelectImage('backgroundImage');
            else if (editModalFocusIndex === 14) handleSelectVideo();
            else if (editModalFocusIndex === 15) handleDeleteApp();
            else if (editModalFocusIndex === 16) setEditModalVisible(false);
            else if (editModalFocusIndex === 17) handleSaveEdit();
          }

          else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setEditModalVisible(false);
          }
          return;
        }

        if (e.key === 'ArrowRight') {
          if (focusIndex === 0) setFocusIndex(1);
          else if (focusIndex === 2) setFocusIndex(3);
          // En row de capturas: avanzar item
          else if (focusIndex >= 100 && focusIndex < 100 + steamMedia.length - 1) setFocusIndex(prev => prev + 1);
          // En row de noticias: avanzar item
          else if (focusIndex >= 200 && focusIndex < 200 + steamNews.length - 1) setFocusIndex(prev => prev + 1);
        } else if (e.key === 'ArrowLeft') {
          if (focusIndex === 1) setFocusIndex(0);
          else if (focusIndex === 3) setFocusIndex(2);
          // En row de capturas: retroceder item (mínimo 100)
          else if (focusIndex > 100) setFocusIndex(prev => prev - 1);
          else if (focusIndex === 100) { } // ya en el primero
          // En row de noticias: retroceder item (mínimo 200)
          else if (focusIndex > 200) setFocusIndex(prev => prev - 1);
          else if (focusIndex === 200) { } // ya en el primero
        } else if (e.key === 'ArrowDown') {
          if (focusIndex <= 1) setFocusIndex(2);                          // botones → trofeos
          else if (focusIndex <= 3) setFocusIndex(steamMedia.length > 0 ? 100 : 200); // cards → capturas
          else if (focusIndex >= 100 && focusIndex < 200) setFocusIndex(steamNews.length > 0 ? 200 : 100); // capturas → noticias
          // noticias: no hay más abajo
        } else if (e.key === 'ArrowUp') {
          if (focusIndex >= 200) setFocusIndex(steamMedia.length > 0 ? 100 : 2); // noticias → capturas
          else if (focusIndex >= 100) setFocusIndex(2);                   // capturas → trofeos
          else if (focusIndex >= 2) setFocusIndex(0);                     // trofeos → botones
          // 0/1: no hace nada, no sale
        } else if (e.key === 'Enter') {
          if (focusIndex === 0) {
            if (item?.path) {
              if (onLaunch) onLaunch(item.id, item.path);
              else if ((window as any).electronAPI) (window as any).electronAPI.launchApp(item.id, item.path);
            }
          } else if (focusIndex === 1) {
            setEditModalVisible(true);
          } else if (focusIndex >= 100 && focusIndex < 200) {
            const media = steamMedia[focusIndex - 100];
            if (media?.type === 'movie' && media.mp4_url) Linking.openURL(media.mp4_url);
            else if (media?.full) Linking.openURL(media.full);
          } else if (focusIndex >= 200) {
            const news = steamNews[focusIndex - 200];
            if (news?.url) Linking.openURL(news.url);
          }
        } else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isVisible, isEditModalVisible, focusIndex, editModalFocusIndex, item, onLaunch, onClose, editData, steamMedia, steamNews]);

  if (!item) return null;

  const handleSelectPath = async () => {
    if ((window as any).electronAPI) {
      const p = await (window as any).electronAPI.selectFile();
      if (p) setEditData({ ...editData, path: p });
    }
  };

  const handleSelectImage = async (field: 'image' | 'backgroundImage' | 'logo') => {
    if ((window as any).electronAPI) {
      const img = await (window as any).electronAPI.selectImage();
      if (img) setEditData({ ...editData, [field]: img });
    }
  };

  const handleSelectVideo = async () => {
    if ((window as any).electronAPI) {
      const vid = await (window as any).electronAPI.selectVideo();
      if (vid) setEditData({ ...editData, video: vid });
    }
  };

  const handleSaveEdit = async () => {
    if ((window as any).electronAPI && editData.id) {
      // Limpiamos los campos vacíos o undefined para no sobrescribir con valores nulos en la DB
      const cleanData = Object.fromEntries(
        Object.entries(editData).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
      );

      const result = await (window as any).electronAPI.updateApp(cleanData);
      if (result.success) {
        setEditModalVisible(false);
        if (onRefresh) onRefresh();
      } else {
        alert('Error al actualizar: ' + result.error);
      }
    }
  };

  const handleUnifiedSync = async () => {
    if (!(window as any).electronAPI || !editData.title) return;

    setIsSyncing(true);
    const syncPrefs = activeUser?.settings?.syncPreferences || {
      ratingAndSummary: 'igdb',
      cover: 'steamgrid',
      background: 'steamgrid',
      logo: 'steamgrid'
    };

    let newEditData = { ...editData };

    // Fetch IGDB if needed
    if (syncPrefs.ratingAndSummary === 'igdb' || syncPrefs.cover === 'igdb' || syncPrefs.background === 'igdb') {
      const resultIGDB = await (window as any).electronAPI.fetchGameData(editData.title);
      if (resultIGDB.success) {
        const game = resultIGDB.data;
        if (syncPrefs.ratingAndSummary === 'igdb') {
          newEditData.rating = game.rating ? game.rating / 20 : (game.aggregated_rating ? game.aggregated_rating / 20 : 5.0);
          newEditData.description = game.summary || newEditData.description;
          newEditData.youtubeId = game.videos && game.videos.length > 0 ? game.videos[0].video_id : newEditData.youtubeId;
        }
        if (syncPrefs.cover === 'igdb' && game.cover?.url) {
          newEditData.image = 'https:' + game.cover.url.replace('t_thumb', 't_cover_big');
        }
        if (syncPrefs.background === 'igdb') {
          if (game.screenshots && game.screenshots.length > 0) {
            newEditData.backgroundImage = 'https:' + game.screenshots[0].url.replace('t_thumb', 't_1080p');
          } else if (game.artworks && game.artworks.length > 0) {
            newEditData.backgroundImage = 'https:' + game.artworks[0].url.replace('t_thumb', 't_1080p');
          }
        }
      } else {
        console.log('IGDB Sync failed:', resultIGDB.error);
      }
    }

    // Fetch SteamGridDB if needed
    if (syncPrefs.cover === 'steamgrid' || syncPrefs.background === 'steamgrid' || syncPrefs.logo === 'steamgrid') {
      const resultSteam = await (window as any).electronAPI.fetchSteamGridData(editData.title);
      if (resultSteam.success) {
        const assets = resultSteam.data;
        if (syncPrefs.cover === 'steamgrid' && assets.grid) newEditData.image = assets.grid;
        if (syncPrefs.background === 'steamgrid' && assets.hero) newEditData.backgroundImage = assets.hero;
        if (syncPrefs.logo === 'steamgrid' && assets.logo) newEditData.logo = assets.logo;
      } else {
        console.log('SteamGrid Sync failed:', resultSteam.error);
      }
    }

    setEditData(newEditData);
    setIsSyncing(false);
  };

  const handleToggleFavorite = async () => {
    console.log('Toggling favorite for:', item.id);
    if ((window as any).electronAPI && item.id) {
      const newStatus = !item.isFavorite;
      const result = await (window as any).electronAPI.updateApp({ id: item.id, isFavorite: newStatus });
      console.log('Update result:', result);
      if (result.success) {
        if (onRefresh) onRefresh();
      } else {
        alert('No se pudo marcar como favorito: ' + result.error);
      }
    } else {
      console.log('Missing electronAPI or item.id');
    }
  };

  const handleDeleteApp = async () => {
    if ((window as any).electronAPI && item.id) {
      const confirmed = window.confirm(`¿Estás seguro de que quieres eliminar "${item.title}"? Esta acción no se puede deshacer.`);
      if (confirmed) {
        const result = await (window as any).electronAPI.deleteApp(item.id);
        if (result.success) {
          onClose();
          if (onRefresh) onRefresh();
        } else {
          alert('Error al eliminar: ' + result.error);
        }
      }
    }
  };

  return (
    <Modal visible={isVisible} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.detailContainer}>

        {/* FULLSCREEN BACKGROUND */}
        {(editData.backgroundImage || item.backgroundImage) ? (
          <Image
            source={editData.backgroundImage ? (editData.backgroundImage.startsWith('http') ? { uri: editData.backgroundImage } : { uri: `local-file:///${editData.backgroundImage}` }) : item.backgroundImage}
            style={styles.detailBg}
          />
        ) : (editData.image || item.image) ? (
          <Image
            source={editData.image ? (editData.image.startsWith('http') ? { uri: editData.image } : { uri: `local-file:///${editData.image}` }) : item.image}
            style={styles.detailBg}
          />
        ) : null}

        {/* BOTTOM GRADIENT */}
        {Platform.OS === 'web' && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1,
            background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.0) 65%)',
            pointerEvents: 'none',
          } as any} />
        )}

        {/* TOP LEFT: game cover + title (replaces back/escape button) */}
        <View style={styles.topHeader}>
          {(item.image) && (
            <Image
              source={item.image}
              style={styles.topHeaderImage}
              resizeMode="cover"
            />
          )}
          <Text style={styles.topHeaderTitle} numberOfLines={1}>{item.title}</Text>
        </View>

        {/* DARK OVERLAY — se oscurece al enfocar cards */}
        {Platform.OS === 'web' && (
          <Animated.View style={[{
            position: 'absolute', inset: 0, zIndex: 2,
            backgroundColor: '#000',
            pointerEvents: 'none',
          } as any, darkOverlayStyle]} />
        )}

        {/* BOTTOM INFO PANEL — scrollable */}
        <ScrollView
          style={styles.ps5BottomPanel}
          contentContainerStyle={{ paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={scrollPaddingStyle}>

            {/* Logo/título + botones — se ocultan al bajar a trofeos */}
            <Animated.View style={topPanelStyle}>
              {(editData.logo || item.logo) ? (
                <Image
                  source={editData.logo ? (editData.logo.startsWith('http') ? { uri: editData.logo } : { uri: `local-file:///${editData.logo}` }) : item.logo}
                  style={styles.ps5Logo}
                  resizeMode="contain"
                />
              ) : (
                <Text style={styles.ps5Title} numberOfLines={2}>{item.title}</Text>
              )}

              <View style={styles.ps5ActionButtons}>
                <TouchableOpacity
                  style={[styles.ps5PlayBtn, focusIndex === 0 && styles.ps5PlayBtnFocused]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setFocusIndex(0);
                    if (item.path) {
                      if (onLaunch) onLaunch(item.id, item.path);
                      else if (Platform.OS === 'web' && (window as any).electronAPI)
                        (window as any).electronAPI.launchApp(item.id, item.path);
                    }
                  }}
                >
                  <Text style={[styles.ps5PlayBtnText, focusIndex === 0 && styles.ps5PlayBtnTextFocused]}>Jugar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.ps5MoreBtn, focusIndex === 1 && styles.ps5MoreBtnFocused]}
                  activeOpacity={0.8}
                  onPress={() => { setFocusIndex(1); setEditModalVisible(true); }}
                >
                  <Text style={[styles.ps5MoreBtnText, focusIndex === 1 && styles.ps5MoreBtnTextFocused]}>···</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* INFO CARDS: Trofeos + Amigos — se ocultan al bajar a capturas */}
            <Animated.View style={[styles.infoCardsRow, infoCardsStyle]}>
              {/* Trofeos */}
              <BlurView intensity={28} tint="dark" style={[styles.infoCard, focusIndex === 2 && styles.infoCardFocused]}>
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
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Trofeos</Text>
                <Text style={{ color: '#888', fontSize: 13 }}>37 conseguidos</Text>
              </BlurView>

              {/* Amigos */}
              <BlurView intensity={28} tint="dark" style={[styles.infoCard, focusIndex === 3 && styles.infoCardFocused]}>
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
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Amigos que juegan</Text>
                <Text style={{ color: '#888', fontSize: 13 }}>5 amigos tienen este juego</Text>
              </BlurView>
            </Animated.View>

            {/* CAPTURAS Y TRAILERS */}
            <View style={[styles.newsSectionWrapper]}>
              <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '500', marginBottom: 16 }}>Capturas y trailers</Text>
              {mediaLoading ? (
                <View style={styles.newsLoadingRow}>
                  <MaterialCommunityIcons name="loading" size={16} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.newsEmptyText}>Cargando capturas...</Text>
                </View>
              ) : steamMedia.length === 0 ? (
                <View style={styles.newsLoadingRow}>
                  <Ionicons name="images-outline" size={14} color="rgba(255,255,255,0.25)" />
                  <Text style={styles.newsEmptyText}>No hay capturas disponibles en Steam</Text>
                </View>
              ) : (
                <ScrollView
                  ref={mediaScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.newsScrollContent, { paddingRight: 50 }]}
                >
                  {steamMedia.map((media, idx) => {
                    const isMediaFocused = focusIndex === 100 + idx;
                    return (
                      <TouchableOpacity
                        key={media.id}
                        style={[styles.newsCard, isMediaFocused && styles.newsCardFocused]}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (media.type === 'movie' && media.mp4_url) Linking.openURL(media.mp4_url);
                          else if (media.full) Linking.openURL(media.full);
                        }}
                      >
                        <View style={styles.newsCardThumbnail}>
                          <Image source={{ uri: media.thumbnail }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          {media.type === 'movie' && (
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

            {/* ÚLTIMAS NOTICIAS */}
            <View style={[styles.newsSectionWrapper]}>
              <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '500', marginBottom: 16 }}>Últimas noticias</Text>
              {newsLoading ? (
                <View style={styles.newsLoadingRow}>
                  <MaterialCommunityIcons name="loading" size={16} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.newsEmptyText}>Buscando contenido...</Text>
                </View>
              ) : steamNews.length === 0 ? (
                <View style={styles.newsLoadingRow}>
                  <Ionicons name="newspaper-outline" size={14} color="rgba(255,255,255,0.25)" />
                  <Text style={styles.newsEmptyText}>No hay noticias disponibles</Text>
                </View>
              ) : (
                <ScrollView
                  ref={newsScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.newsScrollContent, { paddingRight: 50 }]}
                >
                  {steamNews.slice(0, 8).map((news, idx) => {
                    const isNewsFocused = focusIndex === 200 + idx;
                    return (
                      <TouchableOpacity
                        key={news.gid}
                        style={[styles.newsCard2, isNewsFocused && styles.newsCardFocused]}
                        activeOpacity={0.8}
                        onPress={() => { if (news.url) Linking.openURL(news.url); }}
                      >
                        <View style={styles.newsCardThumbnail}>
                          {news.image_url ? (
                            <Image source={{ uri: news.image_url }} style={{ width: '100%', height: '120%' }} resizeMode="cover" />
                          ) : (
                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' }}>
                              <Ionicons name="newspaper-outline" size={32} color="rgba(255,255,255,0.2)" />
                            </View>
                          )}
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

          </Animated.View>{/* end content */}

        </ScrollView>

        {isLaunching && (
          <BlurView intensity={90} tint="dark" style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
            <View style={styles.launchingOverlay}>
              <MaterialCommunityIcons name="controller-classic" size={100} color="#00FFFF" />
              <Text style={styles.launchingText}>Ejecutándose...</Text>
            </View>
          </BlurView>
        )}
      </View>

      {/* EDIT MODAL */}
      <Modal visible={isEditModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.modalContentExpanded]}>
            <View style={styles.modalBodyRow}>
              {/* SIDEBAR TABS */}
              <View style={styles.sidebar}>
                <Text style={styles.sidebarTitle}>Ajustes</Text>

                {[
                  { id: 'basic', label: 'Datos Básicos', icon: 'information-circle-outline', index: 20 },
                  { id: 'path', label: 'Ruta del Juego', icon: 'folder-open-outline', index: 21 },
                  { id: 'art', label: 'Arte y Multimedia', icon: 'image-outline', index: 22 },
                ].map((tab) => {
                  const isTabActive = activeTab === tab.id;
                  const isTabFocused = editModalFocusIndex === tab.index;

                  return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[
                        styles.tabButton,
                        isTabActive && styles.tabButtonActive,
                        isTabFocused && styles.buttonFocused
                      ]}
                      onPress={() => {
                        setEditModalFocusIndex(tab.index);
                        setActiveTab(tab.id as any);
                      }}
                    >
                      <Ionicons
                        name={tab.icon as any}
                        size={20}
                        color={isTabActive ? '#00FFFF' : '#8E8E93'}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={[
                        styles.tabButtonText,
                        isTabActive && styles.tabButtonTextActive
                      ]}>
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* RIGHT CONTENT AREA */}
              <View style={styles.contentArea}>
                <View style={{ flex: 1 }}>
                  {activeTab === 'basic' && (
                    <>
                      <Text style={styles.sectionTitle}>Datos Básicos</Text>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.label}>Título</Text>
                        <TextInput
                          ref={editTitleRef}
                          style={[styles.input, editModalFocusIndex === 2 && styles.inputFocused]}
                          value={editData.title}
                          onChangeText={(text) => setEditData({ ...editData, title: text })}
                        />

                        {((editData.type || item?.type) !== 'media' && (editData.type || item?.type) !== 'web') && (
                          <>
                            <Text style={styles.label}>Plataforma</Text>
                            <View style={{ marginBottom: 20 }}>
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
                                  const focusIdx = 3 + idx;
                                  return (
                                    <TouchableOpacity
                                      key={plat.id}
                                      style={[
                                        styles.platformBtn,
                                        editData.platform === plat.id && styles.platformBtnActive,
                                        editModalFocusIndex === focusIdx && styles.buttonFocused
                                      ]}
                                      onPress={() => setEditData({ ...editData, platform: plat.id })}
                                    >
                                      <MaterialCommunityIcons name={plat.icon as any} size={20} color={editData.platform === plat.id ? '#000' : '#FFF'} />
                                      <Text style={[styles.platformBtnText, editData.platform === plat.id && styles.platformBtnTextActive]}>{plat.id}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          </>
                        )}

                        <Text style={styles.label}>Descripción</Text>
                        <TextInput
                          ref={editDescRef}
                          style={[styles.input, { height: 120, textAlignVertical: 'top' }, editModalFocusIndex === 10 && styles.inputFocused]}
                          multiline
                          value={editData.description}
                          onChangeText={(text) => setEditData({ ...editData, description: text })}
                        />
                      </ScrollView>
                    </>
                  )}

                  {activeTab === 'path' && (
                    <>
                      <Text style={styles.sectionTitle}>Ruta del Juego</Text>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.label}>Ubicación del ejecutable o enlace</Text>
                        {((editData.type || item?.type) === 'web') ? (
                          <TextInput
                            ref={editPathInputRef}
                            style={[styles.input, editModalFocusIndex === 18 && styles.inputFocused]}
                            placeholder="URL (https://...)"
                            placeholderTextColor="#888"
                            value={editData.path}
                            onChangeText={(text) => setEditData({ ...editData, path: text })}
                          />
                        ) : (
                          <>
                            <TouchableOpacity
                              style={[styles.fileBtn, { marginBottom: 15 }, editModalFocusIndex === 18 && styles.buttonFocused]}
                              onPress={handleSelectPath}
                            >
                              <Ionicons name="folder-open" size={20} color="#FFF" />
                              <Text style={styles.fileBtnText}>Seleccionar nuevo ejecutable (.exe)</Text>
                            </TouchableOpacity>
                            <View style={styles.pathDisplayBox}>
                              <Text style={styles.pathDisplayTextHeader}>Ruta actual del juego:</Text>
                              <Text style={styles.pathDisplayText}>{editData.path || 'No seleccionada'}</Text>
                            </View>
                          </>
                        )}
                      </ScrollView>
                    </>
                  )}

                  {activeTab === 'art' && (
                    <>
                      <Text style={styles.sectionTitle}>Arte y Multimedia</Text>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.label}>Sincronización Inteligente</Text>
                        <View style={styles.syncRow}>
                          <TouchableOpacity
                            style={[styles.syncBtnUnified, isSyncing && { opacity: 0.7 }, editModalFocusIndex === 0 && styles.buttonFocused]}
                            onPress={handleUnifiedSync}
                            disabled={isSyncing}
                          >
                            <Ionicons name="sync" size={18} color="#000" />
                            <Text style={styles.syncBtnTextCompact}>{isSyncing ? 'Sincronizando...' : 'Sincronizar Datos (Auto)'}</Text>
                          </TouchableOpacity>
                        </View>

                        <Text style={styles.label}>Archivos Locales</Text>
                        <View style={styles.artGrid}>
                          <TouchableOpacity
                            style={[styles.artFileBtn, editModalFocusIndex === 11 && styles.buttonFocused]}
                            onPress={() => handleSelectImage('image')}
                          >
                            <Ionicons name="image" size={22} color="#00FFFF" style={{ marginBottom: 4 }} />
                            <Text style={styles.artFileBtnTitle}>Portada</Text>
                            <Text style={styles.artFileBtnSub}>Imagen vertical</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.artFileBtn, editModalFocusIndex === 12 && styles.buttonFocused]}
                            onPress={() => handleSelectImage('logo')}
                          >
                            <Ionicons name="color-palette" size={22} color="#00FFFF" style={{ marginBottom: 4 }} />
                            <Text style={styles.artFileBtnTitle}>Logo PNG</Text>
                            <Text style={styles.artFileBtnSub}>Transparente</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.artFileBtn, editModalFocusIndex === 13 && styles.buttonFocused]}
                            onPress={() => handleSelectImage('backgroundImage')}
                          >
                            <Ionicons name="images" size={22} color="#00FFFF" style={{ marginBottom: 4 }} />
                            <Text style={styles.artFileBtnTitle}>Fondo</Text>
                            <Text style={styles.artFileBtnSub}>Horizontal</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.artFileBtn, editModalFocusIndex === 14 && styles.buttonFocused]}
                            onPress={handleSelectVideo}
                          >
                            <Ionicons name="videocam" size={22} color="#00FFFF" style={{ marginBottom: 4 }} />
                            <Text style={styles.artFileBtnTitle}>Video</Text>
                            <Text style={styles.artFileBtnSub}>Trailer/Gameplay</Text>
                          </TouchableOpacity>
                        </View>
                      </ScrollView>
                    </>
                  )}
                </View>

                {/* MODAL ACTIONS FOOTER */}
                <View style={styles.modalDivider} />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.deleteBtn, editModalFocusIndex === 15 && styles.buttonFocused]}
                    onPress={handleDeleteApp}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF2D55" />
                  </TouchableOpacity>

                  <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                      style={[styles.cancelBtn, editModalFocusIndex === 16 && styles.buttonFocused]}
                      onPress={() => setEditModalVisible(false)}
                    >
                      <Text style={styles.cancelBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, editModalFocusIndex === 17 && styles.buttonFocused]}
                      onPress={handleSaveEdit}
                    >
                      <Text style={styles.saveBtnText}>Guardar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  detailContainer: {
    flex: 1,
    backgroundColor: '#000'
  },
  detailBg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    opacity: 0.6
  },
  detailOverlay: {
    flex: 1,
    flexDirection: 'row'
  },

  // === PS5-STYLE BOTTOM PANEL ===
  ps5BottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 150,
    right: 0,
    top: '10%',
    zIndex: 10,
  },
  ps5Logo: {
    width: 450,
    height: 160,
    marginBottom: 28,
  },
  ps5Title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '300',
    marginBottom: 28,
    letterSpacing: 0.3,
  },
  ps5ActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginLeft: 3,
  },
  ps5PlayBtn: {
    backgroundColor: '#9999991c',
    paddingHorizontal: 52,
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    width: 280,
  },
  ps5PlayBtnFocused: {
    backgroundColor: '#FFFFFF',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: '#FFFFFF',
    outlineOffset: 1,
  } as any,
  ps5PlayBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ps5PlayBtnTextFocused: {
    color: '#111111',
  },
  ps5MoreBtn: {
    backgroundColor: '#9999991c',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ps5MoreBtnFocused: {
    backgroundColor: '#FFFFFF',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: '#FFFFFF',
    outlineOffset: 1,
  } as any,
  ps5MoreBtnText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: -4,
  },
  ps5MoreBtnTextFocused: {
    color: '#111111',
  },

  // === TOP HEADER (game image + title, replaces back button) ===
  topHeader: {
    position: 'absolute',
    top: 40,
    left: 40,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topHeaderImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  topHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
    maxWidth: 300,
    opacity: 0.9,
  },

  // === STEAM MEDIA / NEWS ===
  newsSectionWrapper: {
    marginTop: 30,
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
    // transform: [{ scale: 1.03 }],
  } as any,
  newsCardThumbnail: {
    width: '100%',
    height: 281,
    backgroundColor: '#333',
    position: 'relative',
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
  mediaPlayBadge: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  infoCardsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
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
    transform: [{ scale: 0.99 }],
  } as any,
  detailBack: {
    position: 'absolute',
    top: 40,
    left: 40,
    zIndex: 30,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  favoriteButton: {
    position: 'absolute',
    top: 40,
    right: 520, // Adjusted to be outside the info panel or inside it? Let's put it inside info panel or top right of the whole screen.
    zIndex: 30,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  favoriteButtonActive: {
    backgroundColor: 'rgba(255, 45, 85, 0.2)',
    borderColor: 'rgba(255, 45, 85, 0.5)'
  },
  detailContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  detailLeft: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingLeft: 80,
    paddingBottom: 100
  },
  detailLogo: {
    width: 450,
    height: 220,
    resizeMode: 'contain'
  },
  detailCover: {
    width: 320,
    height: 190,
    borderRadius: 18,
    resizeMode: 'cover',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  detailRight: {
    width: '40%', // Fixed width usually better, but let's make it responsive
    maxWidth: 480,
    minWidth: 380,
    height: '100%',
    overflow: 'hidden',
  },
  infoPanel: {
    flex: 1,
    padding: 50,
    paddingTop: 120,
  },
  detailTitle: {
    color: '#FFF',
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.5
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)'
  },
  platformText: {
    color: '#00FFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30
  },
  ratingText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8
  },
  detailActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00BD10',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 14,
    marginRight: 12,
    shadowColor: '#00BD10',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  playButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1
  },
  optionsButton: {
    width: 54,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)'
  },
  detailScrollView: {
    flex: 1
  },
  detailDescription: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 30,
    fontWeight: '400'
  },
  mediaContainer: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  videoWrapper: { width: '100%', height: '100%' },
  detailScreenshot: { width: '100%', height: '100%', resizeMode: 'cover' },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: 480, backgroundColor: '#1C1C1E', borderRadius: 24, padding: 35, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalContentExpanded: { width: 850, height: 600, padding: 0, overflow: 'hidden' },
  modalBodyRow: { flexDirection: 'row', width: '100%', height: '100%' },
  sidebar: { width: 240, backgroundColor: '#141416', padding: 24, borderRightWidth: 1, borderRightColor: 'rgba(255, 255, 255, 0.08)' },
  sidebarTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 25, letterSpacing: 0.5 },
  tabButton: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  tabButtonActive: { backgroundColor: 'rgba(0, 255, 255, 0.08)', borderColor: 'rgba(0, 255, 255, 0.15)' },
  tabButtonText: { color: '#8E8E93', fontSize: 15, fontWeight: '600' },
  tabButtonTextActive: { color: '#00FFFF', fontWeight: 'bold' },
  contentArea: { flex: 1, padding: 30, justifyContent: 'space-between', backgroundColor: '#1C1C1E' },
  sectionTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  pathDisplayBox: { backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: 10 },
  pathDisplayTextHeader: { color: '#8E8E93', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  pathDisplayText: { color: '#FFF', fontSize: 14 },
  syncRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  syncBtnCompact: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD700', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  syncBtnTextCompact: { color: '#000', fontWeight: '800', marginLeft: 6, fontSize: 12 },
  syncBtnUnified: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00FFFF', paddingVertical: 15, paddingHorizontal: 15, borderRadius: 12, shadowColor: '#00FFFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10 },
  artGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  artFileBtn: { width: '47%', backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  artFileBtnTitle: { color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 6 },
  artFileBtnSub: { color: '#8E8E93', fontSize: 11, marginTop: 2 },
  modalDivider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)', marginVertical: 15, width: '100%' },
  modalTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginBottom: 25, textAlign: 'center' },
  label: { color: '#8E8E93', fontSize: 13, marginBottom: 8, marginLeft: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: '#000', color: '#FFF', padding: 16, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#333', fontSize: 16 },
  inputFocused: {
    borderColor: '#00FFFF',
    backgroundColor: '#0A0A0A',
  },
  platformScrollContent: { gap: 10, paddingVertical: 5 },
  platformBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  platformBtnActive: { borderColor: '#00FFFF', backgroundColor: '#00FFFF' },
  platformBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 6, fontSize: 12 },
  platformBtnTextActive: { color: '#000' },
  fileBtn: { backgroundColor: '#2C2C2E', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  fileBtnText: { color: '#FFF', marginLeft: 12, fontSize: 15, fontWeight: '500' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  cancelBtn: { flex: 1, padding: 16, backgroundColor: '#3A3A3C', borderRadius: 12, marginRight: 10, alignItems: 'center' },
  cancelBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  saveBtn: { flex: 1, padding: 16, backgroundColor: '#00FFFF', borderRadius: 12, marginLeft: 10, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  deleteBtn: {
    width: 54,
    height: 54,
    backgroundColor: 'rgba(255, 45, 85, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 45, 85, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD700', padding: 16, borderRadius: 12, marginBottom: 20 },
  syncBtnText: { color: '#000', fontWeight: '800', marginLeft: 10, fontSize: 15 },
  buttonFocused: {
    borderColor: '#FFF',
    borderWidth: 3,
    transform: [{ scale: 1.04 }],
    zIndex: 10,
  },
  launchingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchingText: {
    color: '#00FFFF',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 25,
    letterSpacing: 6,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 255, 255, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },

});


export default GameDetailView;