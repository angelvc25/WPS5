import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Platform,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { fetchSteamGridData } from '../services/steamGridService';
import { Video, ResizeMode } from 'expo-av';
import SpinningBorder from './Spinningborder';
import SpinningBorderNoticias from './SpinningborderNoticias';
import SpinningborderDiscover from './SpinningborderDiscover';
import { fetchSteamNewsByName, formatSteamDate, SteamNewsItem } from '../services/steamNewsService';
import { useUser } from '../contexts/UserContext';
import { openWebLink } from '@/services/linkService';
import { useSystemMedia } from '@/hooks/useSystemMedia';
import { soundService } from '@/services/soundService';
import {
  formatMediaTime,
  getAppIconName,
  sendMediaControl,
  getMediaControlTarget,
  SystemMediaSession,
} from '@/services/systemMediaService';
import { useTranslation } from '@/contexts/LanguageContext';
import { TranslationKey } from '@/i18n/translations';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';
import { PLATFORMS } from '@/constants/platforms';

interface CardData {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  imageUri?: string;
  bgColor?: string;
  type: 'news' | 'capture' | 'discover' | 'addGame' | 'nowPlaying';
  mediaSession?: SystemMediaSession;
}

type MediaControlAction = 'prev' | 'play_pause' | 'next';
const EXPANDED_MEDIA_CONTROLS: MediaControlAction[] = ['prev', 'play_pause', 'next'];

const MOCK_CARDS: CardData[] = [
  {
    id: 'c1',
    title: 'Noticias oficiales',
    subtitle: '10 historias de tus juegos',
    icon: 'megaphone',
    imageUri: 'https://tierragamer.com/wp-content/uploads/2023/09/PS5-Exito.webp',
    type: 'news',
  },
  {
    id: 'c2',
    title: 'Nueva captura',
    subtitle: 'Creado recientemente',
    icon: 'camera',
    imageUri: 'https://images.igdb.com/igdb/image/upload/t_original/ar43t.jpg',
    type: 'capture',
  },
  {
    id: 'c3',
    title: 'Sugerencias destacadas',
    subtitle: 'Descubrir',
    icon: 'sparkles',
    bgColor: '#0055A5',
    type: 'discover',
  },
];

interface ControlCenterCardsProps {
  isFocusedLayer: boolean;
  focusedIndex: number;
  onPressCard: (index: number) => void;
  isExpanded: boolean;
  onCloseExpanded: () => void;
  activeNavIndex?: number;
  onRefreshApps?: () => void;
  onCardsCountChange?: (maxIndex: number) => void;
}

// ─── Discover Tip Video ─────────────────────────────────────────────────────
// En web, expo-av envuelve el <video> real dentro de un <div> contenedor y
// no le pasa width/height al <video> interno (elemento "reemplazado"), por
// lo que un <video> con position:absolute + inset:0 no llena el recuadro.
// Por eso en web renderizamos el tag <video> nativo directamente, con
// width/height: 100% puesto en el propio elemento. En nativo (iOS/Android)
// ese problema no existe, así que ahí seguimos usando expo-av normalmente.
function DiscoverTipVideo({
  source,
  resizeMode,
  muted = true,
  showControls = false,
}: {
  source: any;
  resizeMode: 'cover' | 'contain';
  muted?: boolean;
  showControls?: boolean;
}) {
  if (Platform.OS === 'web') {
    const uri = typeof source === 'string' ? source : source?.uri;
    return (
      // @ts-ignore - tag HTML crudo, solo se renderiza en web via react-native-web
      <video
        src={uri}
        autoPlay
        loop
        muted={muted}
        controls={showControls}
        playsInline
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: resizeMode,
        }}
      />
    );
  }

  return (
    <Video
      source={source}
      style={StyleSheet.absoluteFill}
      resizeMode={resizeMode === 'cover' ? ResizeMode.COVER : ResizeMode.CONTAIN}
      isLooping
      shouldPlay
      isMuted={muted}
      useNativeControls={showControls}
    />
  );
}

// ─── Animated Card ────────────────────────────────────────────────────────────
function AnimatedCard({
  card,
  index,
  isActive,
  isExpanded,
  isFocusedLayer,
  onPress,
  enterDelay,
  onCloseExpanded,
  onRefreshApps,
}: {
  card: CardData;
  index: number;
  isActive: boolean;
  isExpanded: boolean;
  isFocusedLayer: boolean;
  onPress: () => void;
  enterDelay: number;
  onCloseExpanded?: () => void;
  onRefreshApps?: () => void;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  // Tamaños responsive para la card expandida: máximo ~30% ancho, ~70% alto
  const EXPANDED_W = Math.round(Math.min(Math.max(winW * 0.22, 320), 520));
  const EXPANDED_H = Math.round(Math.min(Math.max(winH * 0.65, 480), 720));
  const COLLAPSED_SIZE = Math.round(Math.min(Math.max(winH * 0.22, 200), 280));

  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);

  const scale = useSharedValue(1);
  const scaleX = useSharedValue(1);
  const focusLift = useSharedValue(0);
  const animWidth = useSharedValue(COLLAPSED_SIZE);
  const animHeight = useSharedValue(COLLAPSED_SIZE);

  const [focusedNewsIndex, setFocusedNewsIndex] = React.useState(0);
  const [selectedDiscoverCategory, setSelectedDiscoverCategory] = React.useState<number | null>(null);
  const [focusedDiscoverIndex, setFocusedDiscoverIndex] = React.useState(0);
  const [focusedDiscoverTip, setFocusedDiscoverTip] = React.useState(0);
  const [isDiscoverLightboxOpen, setIsDiscoverLightboxOpen] = React.useState(false);
  const discoverLightboxAnim = useSharedValue(0);
  const scrollRef = React.useRef<ScrollView>(null);
  const [realNews, setRealNews] = React.useState<SteamNewsItem[]>([]);
  const [mediaControlFocus, setMediaControlFocus] = React.useState(1);
  const { t } = useTranslation();
  const DISCOVER_CATEGORIES = React.useMemo(() => getDiscoverCategories(t), [t]);

  const openDiscoverLightbox = () => {
    setIsDiscoverLightboxOpen(true);
    discoverLightboxAnim.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
    soundService.playActivation?.();
  };

  const closeDiscoverLightbox = () => {
    discoverLightboxAnim.value = withTiming(0, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
    }, (finished) => {
      if (finished) {
        runOnJS(setIsDiscoverLightboxOpen)(false);
      }
    });
    soundService.playBack?.();
  };

  const lightboxBackdropStyle = useAnimatedStyle(() => ({
    opacity: discoverLightboxAnim.value,
  }));

  const lightboxImageAnimStyle = useAnimatedStyle(() => {
    const scale = interpolate(discoverLightboxAnim.value, [0, 1], [0.55, 1.0]);
    const translateY = interpolate(discoverLightboxAnim.value, [0, 1], [40, 0]);
    return {
      opacity: discoverLightboxAnim.value,
      transform: [{ translateY }, { scale }],
    };
  });

  const { activeUser } = useUser();
  const [captureImage, setCaptureImage] = React.useState<string | null>(null);
  const [isCaptureModalVisible, setCaptureModalVisible] = React.useState(false);

  // Form states for adding game
  const [title, setTitle] = React.useState('');
  const [path, setPath] = React.useState('');
  const [image, setImage] = React.useState('');
  const [platform, setPlatform] = React.useState('PC');
  const [type, setType] = React.useState<'game' | 'media' | 'web'>('game');
  const [isSaving, setIsSaving] = React.useState(false);
  const [focusedField, setFocusedField] = React.useState<string | null>(null);

  const handleSelectFile = async () => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.selectFile) {
      const file = await (window as any).electronAPI.selectFile();
      if (file) {
        setPath(file);
        if (!title) {
          const filename = file.split(/[\\\/]/).pop() || '';
          const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
          setTitle(nameWithoutExt);
        }
      }
    }
  };

  const handleSelectLocalImage = async () => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.selectImage) {
      const img = await (window as any).electronAPI.selectImage();
      if (img) setImage(img);
    }
  };

  const handleSaveApp = async () => {
    if (!title || !path) {
      alert(t('cc.completeFields'));
      return;
    }
    setIsSaving(true);
    try {
      let appToSave: any = {
        title,
        path,
        image: image || undefined,
        type, // 'game', 'media' or 'web'
        platform: type === 'game' ? platform : undefined,
      };

      if (!appToSave.image && type === 'game') {
        try {
          const res = (window as any).electronAPI?.fetchSteamGridData
            ? await (window as any).electronAPI.fetchSteamGridData(title)
            : await fetchSteamGridData(title);
          if (res.success && res.data) {
            if (res.data.grid) appToSave.image = res.data.grid;
            if (res.data.hero) appToSave.backgroundImage = res.data.hero;
            if (res.data.logo) appToSave.logo = res.data.logo;
          }
        } catch (error) {
          console.error('Error fetching SteamGrid data:', error);
        }
      }

      if ((window as any).electronAPI?.saveApp) {
        await (window as any).electronAPI.saveApp(appToSave);
      }

      // Reset form
      setTitle('');
      setPath('');
      setImage('');
      setPlatform('PC');
      setType('game');

      // Close expanded card
      if (onCloseExpanded) {
        onCloseExpanded();
      }

      // Reload applications list
      if (onRefreshApps) {
        onRefreshApps();
      }
    } catch (e) {
      console.error('Error saving app:', e);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (card.type === 'capture' && Platform.OS === 'web') {
      const fetchCapture = async () => {
        const path = activeUser?.settings?.capturePath || '';
        if ((window as any).electronAPI && typeof (window as any).electronAPI.getLatestCapture === 'function') {
          const img = await (window as any).electronAPI.getLatestCapture(path);
          if (img) setCaptureImage(img);
        }
      };
      fetchCapture();
    }
  }, [card.type, activeUser?.settings?.capturePath, isActive]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: focusedNewsIndex * 110, animated: true });
    }
  }, [focusedNewsIndex]);

  useEffect(() => {
    if (card.type === 'news') {
      fetchSteamNewsByName('Helldivers 2').then(data => {
        if (data && data.length > 0) {
          setRealNews(data.slice(0, 6));
        }
      });
    }
  }, [card.type]);

  const maxIndex = realNews.length > 0 ? realNews.length - 1 : NEWS_ITEMS.length - 1;

  useEffect(() => {
    if (isExpanded) {
      setFocusedNewsIndex(0);
      setFocusedDiscoverIndex(0);
      setSelectedDiscoverCategory(null);
      setFocusedDiscoverTip(0);
      setIsDiscoverLightboxOpen(false);
      discoverLightboxAnim.value = 0;
      if (card.type === 'nowPlaying') setMediaControlFocus(1);
    }
  }, [isExpanded, card.type]);

  useEffect(() => {
    if (!isExpanded || Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (card.type === 'discover') {
        if (isDiscoverLightboxOpen) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B' || e.key === 'Enter' || e.key === 'x' || e.key === 'X') {
            e.preventDefault(); e.stopPropagation();
            closeDiscoverLightbox();
          } else if (e.key === 'q' || e.key === 'Q') {
            e.preventDefault(); e.stopPropagation();
            setFocusedDiscoverTip((prev) => Math.max(0, prev - 1));
            soundService.playNavigation();
          } else if (e.key === 'e' || e.key === 'E') {
            e.preventDefault(); e.stopPropagation();
            const maxTips = (DISCOVER_CATEGORIES[selectedDiscoverCategory || 0]?.tips.length || 1) - 1;
            setFocusedDiscoverTip((prev) => Math.min(maxTips, prev + 1));
            soundService.playNavigation();
          }
          return;
        }
        if (selectedDiscoverCategory === null) {
          if (e.key === 'ArrowUp') {
            e.preventDefault(); e.stopPropagation();
            setFocusedDiscoverIndex((prev) => Math.max(0, prev - 1));
            soundService.playNavigation();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault(); e.stopPropagation();
            setFocusedDiscoverIndex((prev) => Math.min(DISCOVER_CATEGORIES.length - 1, prev + 1));
            soundService.playNavigation();
          } else if (e.key === 'Enter' || e.key === 'x' || e.key === 'X') {
            e.preventDefault(); e.stopPropagation();
            setSelectedDiscoverCategory(focusedDiscoverIndex);
            setFocusedDiscoverTip(0);
            soundService.playActivation?.();
          } else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            e.preventDefault(); e.stopPropagation();
            soundService.playBack?.();
            onCloseExpanded?.();
          }
        } else {
          const tips = DISCOVER_CATEGORIES[selectedDiscoverCategory]?.tips || [];
          if (e.key === 'q' || e.key === 'Q') {
            e.preventDefault(); e.stopPropagation();
            setFocusedDiscoverTip((prev) => Math.max(0, prev - 1));
            soundService.playNavigation();
          } else if (e.key === 'e' || e.key === 'E') {
            e.preventDefault(); e.stopPropagation();
            setFocusedDiscoverTip((prev) => Math.min(tips.length - 1, prev + 1));
            soundService.playNavigation();
          } else if (e.key === 'Enter' || e.key === 'x' || e.key === 'X') {
            e.preventDefault(); e.stopPropagation();
            openDiscoverLightbox();
          } else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            e.preventDefault(); e.stopPropagation();
            setSelectedDiscoverCategory(null);
            soundService.playBack?.();
          }
        }
        return;
      }
      if (card.type === 'nowPlaying') {
        if (e.key === 'q' || e.key === 'Q') {
          e.preventDefault();
          e.stopPropagation();
          soundService.playActivation?.();
          setMediaControlFocus(0);
          sendMediaControl('prev', getMediaControlTarget(card.mediaSession));
        } else if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          e.stopPropagation();
          soundService.playActivation?.();
          setMediaControlFocus(2);
          sendMediaControl('next', getMediaControlTarget(card.mediaSession));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          setMediaControlFocus((prev) => Math.max(0, prev - 1));
          soundService.playNavigation();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          setMediaControlFocus((prev) => Math.min(EXPANDED_MEDIA_CONTROLS.length - 1, prev + 1));
          soundService.playNavigation();
        } else if (e.key === 'Enter' || e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          e.stopPropagation();
          soundService.playActivation?.();
          sendMediaControl(
            EXPANDED_MEDIA_CONTROLS[mediaControlFocus],
            getMediaControlTarget(card.mediaSession),
          );
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setFocusedNewsIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setFocusedNewsIndex((prev) => Math.min(maxIndex, prev + 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (card.type === 'capture') {
          setCaptureModalVisible(prev => !prev);
        } else if (card.type === 'news' && realNews.length > 0 && realNews[focusedNewsIndex]?.url) {
          openWebLink(realNews[focusedNewsIndex].url);
        }
      } else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        if (card.type === 'capture' && isCaptureModalVisible) {
          e.preventDefault();
          e.stopPropagation();
          setCaptureModalVisible(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isExpanded, maxIndex, realNews, focusedNewsIndex, card.type, card.mediaSession, isCaptureModalVisible, mediaControlFocus, selectedDiscoverCategory, focusedDiscoverIndex, focusedDiscoverTip, onCloseExpanded, isDiscoverLightboxOpen]);

  useEffect(() => {
    if (!isActive || isExpanded || Platform.OS !== 'web') return;
    const handleEnterToExpand = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }
    };
    window.addEventListener('keydown', handleEnterToExpand, true);
    return () => window.removeEventListener('keydown', handleEnterToExpand, true);
  }, [isActive, isExpanded, onPress]);

  // Entrance animation on mount (staggered per card)
  useEffect(() => {
    translateY.value = withDelay(
      enterDelay,
      withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) })
    );
    opacity.value = withDelay(
      enterDelay,
      withTiming(1, { duration: 220 })
    );
  }, []);

  // Size on expand — responsive
  useEffect(() => {
    if (isActive && isExpanded) {
      animWidth.value = withTiming(EXPANDED_W, { duration: 300, easing: Easing.out(Easing.cubic) });
      animHeight.value = withTiming(EXPANDED_H, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else {
      animWidth.value = withTiming(COLLAPSED_SIZE, { duration: 300, easing: Easing.out(Easing.cubic) });
      animHeight.value = withTiming(COLLAPSED_SIZE, { duration: 300, easing: Easing.out(Easing.cubic) });
    }
  }, [isActive, isExpanded, EXPANDED_W, EXPANDED_H, COLLAPSED_SIZE]);

  // Scale on focus
  useEffect(() => {
    if (isActive && !isExpanded) {
      scale.value = withTiming(1.30, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });

      scaleX.value = withTiming(1.015, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });

      focusLift.value = withTiming(-35, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      scale.value = withTiming(1, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });

      scaleX.value = withTiming(1, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });

      focusLift.value = withTiming(0, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [isActive, isExpanded]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    width: animWidth.value,
    height: animHeight.value,
    transform: [
      {
        translateY: translateY.value + focusLift.value,
      },
      {
        scaleX: scaleX.value,
      },
      {
        scaleY: scale.value,
      },
    ],
  }));

  // Counter-scale for the badge: cancels the parent card's asymmetric scale so the badge stays square
  const badgeCounterStyle = useAnimatedStyle(() => ({
    alignSelf: 'flex-start' as const,
    transform: [
      { scaleX: 1 / scaleX.value },
      { scaleY: 1 / scale.value },
    ],
  }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        activeOpacity={isExpanded ? 1 : 0.85}
        onPress={() => {
          if (!isExpanded) onPress();
        }}
        style={[styles.card, { width: '100%', height: '100%' }]}
      >
        <View style={styles.cardClip}>
          {card.type === 'nowPlaying' && card.mediaSession ? (
            <NowPlayingCardBody
              session={card.mediaSession}
              isExpanded={isExpanded}
              isActive={isActive}
              controlFocusIndex={mediaControlFocus}
              badgeCounterStyle={badgeCounterStyle}
            />
          ) : card.type === 'addGame' ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(23, 23, 30, 0.98)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }]}>
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        45deg,
                        rgba(232, 249, 255, 0.17) 0%,
                        rgba(120,220,255,0.03) 40%,
                        rgba(255,255,255,0.01) 60%,
                        rgba(0,0,0,0.00) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              )}
              {isExpanded ? (
                <View style={[StyleSheet.absoluteFill, { zIndex: 2 }]}>
                  <View style={styles.expandedHeader}>
                    <View style={styles.iconCircle}>
                      <Ionicons name="game-controller" size={20} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.expandedTitle}>{t('cc.addGameFormTitle')}</Text>
                      <Text style={styles.expandedSubtitle}>{t('cc.addGameFormSubtitle')}</Text>
                    </View>
                    <TouchableOpacity style={styles.closeBtn} onPress={onCloseExpanded}>
                      <Ionicons name="close" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ paddingHorizontal: 24, paddingVertical: 20, flex: 1 }} showsVerticalScrollIndicator={false}>
                    {/* TIPO DE APLICACIÓN */}
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 }}>
                      {t('cc.appType')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                      {[
                        { id: 'game', label: t('cc.typeGames'), icon: 'game-controller' },
                        { id: 'media', label: t('cc.typeMedia'), icon: 'musical-notes' },
                        { id: 'web', label: t('cc.typeWeb'), icon: 'globe' }
                      ].map((tItem) => {
                        const isSelected = type === tItem.id;
                        return (
                          <TouchableOpacity
                            key={tItem.id}
                            activeOpacity={0.8}
                            onPress={() => setType(tItem.id as any)}
                            style={{
                              flex: 1,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                              borderColor: isSelected ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.08)',
                              borderWidth: 1,
                              borderRadius: 8,
                              paddingVertical: 12,
                              gap: 6,
                              // @ts-ignore
                              boxShadow: isSelected ? '0 0 10px rgba(255, 255, 255, 0.2)' : 'none',
                            }}
                          >
                            <Ionicons name={tItem.icon as any} size={16} color={isSelected ? '#ffffffff' : 'rgba(255, 255, 255, 0.5)'} />
                            <Text style={{ color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.6)', fontWeight: isSelected ? '700' : '400', fontSize: 14 }}>
                              {tItem.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* NOMBRE */}
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 }}>
                      {type === 'game' ? t('cc.gameName') : t('cc.appName')}
                    </Text>
                    <TextInput
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        borderRadius: 8,
                        color: '#FFF',
                        padding: 14,
                        fontSize: 16,
                        marginBottom: 20,
                        borderWidth: 1,
                        borderColor: focusedField === 'title' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255,255,255,0.1)',
                      }}
                      placeholder={type === 'game' ? "Ej: Cyberpunk 2077" : type === 'media' ? "Ej: Spotify" : "Ej: Google"}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={title}
                      onChangeText={setTitle}
                      onFocus={() => setFocusedField('title')}
                      onBlur={() => setFocusedField(null)}
                    />

                    {/* PLATAFORMA (Solo para Juegos) */}
                    {type === 'game' && (
                      <View style={{ marginBottom: 20 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 }}>
                          {t('cc.platform')}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {PLATFORMS.map((plat) => {
                            const isSelected = platform === plat.id;
                            return (
                              <TouchableOpacity
                                key={plat.id}
                                activeOpacity={0.8}
                                onPress={() => setPlatform(plat.id)}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                                  borderColor: isSelected ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.08)',
                                  borderWidth: 1,
                                  borderRadius: 8,
                                  paddingHorizontal: 12,
                                  paddingVertical: 8,
                                  gap: 6,
                                  // @ts-ignore
                                  boxShadow: isSelected ? '0 0 10px rgba(255, 255, 255, 0.15)' : 'none',
                                }}
                              >
                                <MaterialCommunityIcons
                                  name={plat.icon as any}
                                  size={16}
                                  color={isSelected ? '#fff' : 'rgba(255, 255, 255, 0.5)'}
                                />
                                <Text style={{ color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.6)', fontWeight: isSelected ? '600' : '400', fontSize: 13 }}>
                                  {plat.id}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* RUTA / URL */}
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 }}>
                      {type === 'web' ? t('cc.webUrl') : t('cc.exePath')}
                    </Text>
                    {type === 'web' ? (
                      <TextInput
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          borderRadius: 8,
                          color: '#FFF',
                          padding: 14,
                          fontSize: 16,
                          marginBottom: 20,
                          borderWidth: 1,
                          borderColor: focusedField === 'path' ? 'rgba(120, 255, 255, 0.4)' : 'rgba(255,255,255,0.1)',
                        }}
                        placeholder="https://ejemplo.com"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        value={path}
                        onChangeText={setPath}
                        onFocus={() => setFocusedField('path')}
                        onBlur={() => setFocusedField(null)}
                      />
                    ) : (
                      <View style={{ flexDirection: 'row', marginBottom: 20 }}>
                        <TextInput
                          style={{
                            flex: 1,
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            borderTopLeftRadius: 8,
                            borderBottomLeftRadius: 8,
                            color: '#FFF',
                            padding: 14,
                            fontSize: 16,
                            borderWidth: 1,
                            borderColor: focusedField === 'path' ? 'rgba(120, 255, 255, 0.4)' : 'rgba(255,255,255,0.1)',
                            borderRightWidth: 0,
                          }}
                          placeholder={type === 'media' ? t('cc.phMediaUrl') : t('cc.phGameUrl')}
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          value={path}
                          onChangeText={setPath}
                          onFocus={() => setFocusedField('path')}
                          onBlur={() => setFocusedField(null)}
                        />
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={handleSelectFile}
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            paddingHorizontal: 20,
                            justifyContent: 'center',
                            borderTopRightRadius: 8,
                            borderBottomRightRadius: 8,
                            borderWidth: 1,
                            borderColor: focusedField === 'path' ? 'rgba(120, 255, 255, 0.4)' : 'rgba(255,255,255,0.1)',
                          }}
                        >
                          <Ionicons name="folder-open" size={20} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* PORTADA (OPCIONAL) */}
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 }}>
                      {t('cc.coverOptional')}
                    </Text>
                    <View style={{ flexDirection: 'row', marginBottom: 30 }}>
                      <TextInput
                        style={{
                          flex: 1,
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          borderTopLeftRadius: 8,
                          borderBottomLeftRadius: 8,
                          color: '#FFF',
                          padding: 14,
                          fontSize: 16,
                          borderWidth: 1,
                          borderColor: focusedField === 'image' ? 'rgba(120, 255, 255, 0.4)' : 'rgba(255,255,255,0.1)',
                          borderRightWidth: 0,
                        }}
                        placeholder={t('cc.phCover')}
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        value={image}
                        onChangeText={setImage}
                        onFocus={() => setFocusedField('image')}
                        onBlur={() => setFocusedField(null)}
                      />
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleSelectLocalImage}
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          paddingHorizontal: 20,
                          justifyContent: 'center',
                          borderTopRightRadius: 8,
                          borderBottomRightRadius: 8,
                          borderWidth: 1,
                          borderColor: focusedField === 'image' ? 'rgba(120, 255, 255, 0.4)' : 'rgba(255,255,255,0.1)',
                        }}
                      >
                        <Ionicons name="image" size={20} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  </ScrollView>

                  {/* STICKY BOTTOM BUTTON */}
                  <View style={{
                    paddingHorizontal: 24,
                    paddingBottom: 24,
                    paddingTop: 16,
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(255,255,255,0.08)',
                    backgroundColor: 'rgba(23, 23, 30, 0.96)',
                  }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={handleSaveApp}
                      disabled={isSaving}
                      style={{
                        backgroundColor: '#fff',
                        borderRadius: 10,
                        padding: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        // @ts-ignore
                        boxShadow: '0 4px 15px rgba(255,255,255,0.2)',
                      }}
                    >
                      <Text style={{ color: '#000', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }}>
                        {isSaving ? t('cc.savingApp') : (type === 'game' ? t('cc.saveGame') : t('cc.saveApp'))}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(38, 41, 48, 0.95)', borderRadius: 16, overflow: 'hidden' }]}>
                  <Image source={require('../assets/images/gamesGrid.png')} style={[StyleSheet.absoluteFill, { opacity: 0.8 }]} contentFit="cover" />
                  {Platform.OS === 'web' && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top right, rgba(38,41,48,1) 0%, rgba(38,41,48,0.7) 40%, rgba(38,41,48,0) 100%)',
                        zIndex: 1,
                      }}
                    />
                  )}
                  {Platform.OS !== 'web' && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(38, 41, 48, 0.6)' }]} />
                  )}
                  <View style={[StyleSheet.absoluteFill, { padding: 14, justifyContent: 'space-between', zIndex: 2 }]}>
                    <View style={{ flexDirection: 'row' }}>
                      <Animated.View style={badgeCounterStyle}>
                        <View style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="game-controller" size={13} color="#000" />
                        </View>
                      </Animated.View>
                    </View>
                    <View>
                      <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '500', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('cc.addGameSubtitle')}
                      </Text>
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 20 }}>
                        {t('cc.addGameTitle')}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          ) : card.type === 'capture' ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d1015', padding: 16 }]}>
              {/* Icon */}
              <Animated.View style={[badgeCounterStyle, { marginBottom: 12 }]}>
                <View style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="scan" size={18} color="#000" />
                </View>
              </Animated.View>

              {/* Image Container */}
              <View style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}>
                <Image source={{ uri: captureImage || card.imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                {/* Maximize Overlay */}
                {isExpanded && (
                  <TouchableOpacity
                    style={{ position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}
                    onPress={() => setCaptureModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="expand" size={26} color="#FFF" />
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {/* Text Section */}
              <View style={{ marginTop: 16, paddingBottom: 4 }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Recently created</Text>
                <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 2 }}>New screenshot</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>Just now</Text>
              </View>
            </View>
          ) : (
            <>
              {card.type === 'discover' && !isExpanded ? (
                <Image
                  source={require('@/assets/images/Sugerencias.png')}
                  style={[StyleSheet.absoluteFill, { opacity: 0.7 }]}
                  contentFit="cover"

                />
              ) : card.bgColor ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: card.bgColor }]} />
              ) : (
                <Image
                  source={require('@/assets/images/noticias.png')}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              )}

              {/* {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        0deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255, 255, 255, 0.02) 50%,
                        rgba(255, 255, 255, 0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              )} */}

              {/* Card content */}
              {isExpanded && card.type === 'discover' ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(23, 23, 30, 0.98)', borderRadius: 16, overflow: 'hidden' }]}>
                  {Platform.OS === 'web' && (
                    <div
                      style={{
                        position: 'absolute', inset: 0,
                        background: `linear-gradient(45deg, rgba(232, 249, 255, 0.14) 0%, rgba(120,220,255,0.03) 40%, rgba(255,255,255,0.01) 60%, rgba(0,0,0,0.00) 100%)`,
                        pointerEvents: 'none', zIndex: 1,
                      }}
                    />
                  )}
                  <View style={{ flex: 1, zIndex: 2, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 }}>
                    {selectedDiscoverCategory === null ? (
                      <>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Ionicons name="sparkles" size={20} color="#fff" />
                            <Text style={styles.expandedTitle}>{t('cc.discover')}</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={onCloseExpanded}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="close" size={18} color="#fff" />
                          </TouchableOpacity>
                        </View>

                        {/* Category List */}
                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                          {DISCOVER_CATEGORIES.map((cat, i) => {
                            const isFocused = focusedDiscoverIndex === i;
                            return (
                              <TouchableOpacity
                                key={cat.id}
                                activeOpacity={0.85}
                                onPress={() => {
                                  setFocusedDiscoverIndex(i);
                                  setSelectedDiscoverCategory(i);
                                  setFocusedDiscoverTip(0);
                                  soundService.playActivation?.();
                                }}
                                style={{
                                  marginBottom: 14,
                                  borderRadius: 12,
                                  backgroundColor: '#005bb5',
                                  height: 140,
                                  position: 'relative',
                                  zIndex: isFocused ? 30 : 1,
                                  overflow: 'visible',
                                }}
                              >
                                {Platform.OS === 'web' && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      borderRadius: 12,
                                      background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(0,0,0,0.15) 100%)',
                                      pointerEvents: 'none',
                                    }}
                                  />
                                )}
                                <View style={{ padding: 18, minHeight: 128, justifyContent: 'flex-end', zIndex: 2 }}>
                                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '400', letterSpacing: 0.3 }}>
                                    {cat.title}
                                  </Text>
                                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, marginTop: 4, lineHeight: 18 }}>
                                    {cat.subtitle}
                                  </Text>
                                </View>
                                {isFocused && (
                                  <SpinningBorderNoticias
                                    {...({
                                      width: '100%',
                                      height: '100%',
                                      borderRadius: 12,
                                      id: `discover-${i}`,
                                    } as any)}
                                  />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>

                        {/* Footer Hints */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                          <Ionicons name="list" size={14} color="rgba(255,255,255,0.6)" />
                          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' }}>{t('cc.options')}</Text>
                        </View>
                      </>
                    ) : (
                      <View style={{ flex: 1 }}>
                        {/* Sub Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                            activeOpacity={0.7}
                            onPress={() => {
                              setSelectedDiscoverCategory(null);
                              soundService.playBack?.();
                            }}
                          >
                            <Ionicons name="arrow-back" size={18} color="#fff" />
                            <Ionicons name="sparkles" size={18} color="#fff" />
                            <Text style={[styles.expandedTitle, { flexShrink: 1 }]} numberOfLines={1}>
                              {DISCOVER_CATEGORIES[selectedDiscoverCategory].title}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={onCloseExpanded}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="close" size={18} color="#fff" />
                          </TouchableOpacity>
                        </View>

                        {/* Tip Content */}
                        <View style={{ flex: 1 }}>
                          {/* L1 / R1 Pagination Bar */}
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => {
                                setFocusedDiscoverTip((prev) => Math.max(0, prev - 1));
                                soundService.playNavigation();
                              }}
                              disabled={focusedDiscoverTip === 0}
                              style={{
                                paddingHorizontal: 4,
                                paddingVertical: 2,
                              }}
                            >
                              <PSIcon
                                char={PSIcons.r1}
                                size={26}
                                color={focusedDiscoverTip === 0 ? 'rgba(255,255,255,0.25)' : '#fff'}
                              />
                            </TouchableOpacity>

                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', letterSpacing: 1 }}>
                              {focusedDiscoverTip + 1}/{DISCOVER_CATEGORIES[selectedDiscoverCategory].tips.length}
                            </Text>

                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => {
                                const maxTips = DISCOVER_CATEGORIES[selectedDiscoverCategory].tips.length - 1;
                                setFocusedDiscoverTip((prev) => Math.min(maxTips, prev + 1));
                                soundService.playNavigation();
                              }}
                              disabled={focusedDiscoverTip === DISCOVER_CATEGORIES[selectedDiscoverCategory].tips.length - 1}
                              style={{
                                paddingHorizontal: 4,
                                paddingVertical: 2,
                              }}
                            >
                              <PSIcon
                                char={PSIcons.l1}
                                size={26}
                                color={focusedDiscoverTip === DISCOVER_CATEGORIES[selectedDiscoverCategory].tips.length - 1 ? 'rgba(255,255,255,0.25)' : '#fff'}
                              />
                            </TouchableOpacity>
                          </View>

                          {/* Screenshot preview with expand growth action */}
                          <TouchableOpacity
                            activeOpacity={0.88}
                            onPress={openDiscoverLightbox}
                            style={{
                              width: '100%',
                              aspectRatio: 16 / 9,
                              borderRadius: 12,
                              overflow: 'hidden',
                              marginBottom: 16,
                              borderWidth: 1,
                              borderColor: 'rgba(255,255,255,0.2)',
                              backgroundColor: '#000',
                              position: 'relative',
                            }}
                          >
                            {DISCOVER_CATEGORIES[selectedDiscoverCategory].tips[focusedDiscoverTip]?.video ? (
                              <DiscoverTipVideo
                                source={DISCOVER_CATEGORIES[selectedDiscoverCategory].tips[focusedDiscoverTip]?.video}
                                resizeMode="cover"
                                muted
                              />
                            ) : (
                              <Image
                                source={DISCOVER_CATEGORIES[selectedDiscoverCategory].tips[focusedDiscoverTip]?.image}
                                style={StyleSheet.absoluteFill}
                                contentFit="cover"
                              />
                            )}
                            {/* Expand Badge Overlay */}
                            <View style={{
                              position: 'absolute',
                              bottom: 10,
                              right: 10,
                              backgroundColor: 'rgba(0,0,0,0.68)',
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 8,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              borderWidth: 1,
                              borderColor: 'rgba(255,255,255,0.18)',
                            }}>
                              <Ionicons name="scan-outline" size={14} color="#fff" />
                              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{t('cc.zoom')}</Text>
                            </View>
                          </TouchableOpacity>

                          {/* Text description */}
                          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 8, lineHeight: 23 }}>
                              {DISCOVER_CATEGORIES[selectedDiscoverCategory].tips[focusedDiscoverTip]?.title}
                            </Text>
                            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 21 }}>
                              {DISCOVER_CATEGORIES[selectedDiscoverCategory].tips[focusedDiscoverTip]?.description}
                            </Text>
                          </ScrollView>

                          {/* Footer Hints */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => {
                                setSelectedDiscoverCategory(null);
                                soundService.playBack?.();
                              }}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                            >
                              <PSIcon char={PSIcons.circle} size={20} color="rgba(255, 255, 255, 0.9)" />
                              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' }}>{t('common.back')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={openDiscoverLightbox}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                            >
                              <Ionicons name="scan" size={14} color="rgba(255,255,255,0.6)" />
                              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' }}>{t('cc.zoomImage')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              ) : isExpanded && card.type === 'news' ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(23, 23, 30, 1)' }]}>
                  {Platform.OS === 'web' && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: `linear-gradient(45deg, rgba(232, 249, 255, 0.17) 0%, rgba(120,220,255,0.03) 40%, rgba(255,255,255,0.01) 60%, rgba(0,0,0,0.00) 100%)`,
                        pointerEvents: 'none',
                        zIndex: 1,
                      }}
                    />
                  )}
                  <View style={{ padding: 20, flex: 1, zIndex: 2 }}>
                    <Text style={styles.expandedTitle}>{card.title}</Text>
                    <Text style={styles.expandedSubtitle}>{card.subtitle}</Text>
                    <ScrollView
                      ref={scrollRef}
                      style={{ flex: 1, marginTop: 20 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {realNews.length > 0 ? (
                        realNews.map((article, i) => (
                          <NewsRow
                            key={i}
                            title={article.title}
                            desc={(article.contents || '').replace(/<[^>]*>?/gm, '').replace(/\[\/?(b|i|u|url|img|h1|h2|h3)[^\]]*\]/gi, '').slice(0, 120) + '...'}
                            tag={article.feedlabel.toUpperCase()}
                            date={formatSteamDate(article.date)}
                            imageUri={article.image_url}
                            enterDelay={i * 50}
                            isFocused={i === focusedNewsIndex}
                          />
                        ))
                      ) : (
                        NEWS_ITEMS.map((news, i) => (
                          <NewsRow
                            key={i}
                            title={news.title}
                            desc={news.desc}
                            tag={news.tag}
                            date={news.date}
                            icon={news.icon}
                            color={news.color}
                            enterDelay={i * 50}
                            isFocused={i === focusedNewsIndex}
                          />
                        ))
                      )}
                    </ScrollView>
                  </View>
                </View>
              ) : (
                <View style={styles.cardContent} pointerEvents="none">
                  <View style={styles.cardTopBar}>
                    <Animated.View style={badgeCounterStyle}>
                      <View style={styles.smallIcon}>
                        <Ionicons name={card.icon} size={13} color="#000" />
                      </View>
                    </Animated.View>
                  </View>
                  <View style={styles.cardBottom}>
                    <Text style={styles.cardSubtitle} numberOfLines={1}>{card.subtitle}</Text>
                    <Text style={styles.cardTitle} numberOfLines={2}>{card.title}</Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* SpinningBorder — outside clip, draws over card border */}
        {isActive && !isExpanded && (
          <SpinningBorder
            size={COLLAPSED_SIZE}
          />
        )}
      </TouchableOpacity>

      {Platform.OS === 'web' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
                      linear-gradient(
                        0deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255, 255, 255, 0.02) 50%,
                        rgba(255, 255, 255, 0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
            pointerEvents: 'none',
            zIndex: 1,
            borderRadius: 16,
          }}
        />
      )}

      {/* Capture Fullscreen Modal */}
      <Modal visible={isCaptureModalVisible} transparent animationType="fade">
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setCaptureModalVisible(false)}
          />
          <View style={styles.lightboxContent} pointerEvents="box-none">
            <Image
              source={{ uri: captureImage || card.imageUri }}
              style={styles.lightboxImage}
              contentFit="contain"
            />
            <TouchableOpacity
              style={styles.lightboxCloseBtn}
              onPress={() => setCaptureModalVisible(false)}
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Discover Tip Fullscreen Image Modal with Smooth Growth Animation from Initial Position to Side */}
      {isDiscoverLightboxOpen && (
        <Modal visible={true} transparent animationType="none">
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'transparent' }]} pointerEvents="box-none">
            {/* Transparent click catcher to close when clicking outside */}
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={closeDiscoverLightbox}
            />

            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  justifyContent: 'center',
                  alignItems: 'center',
                  pointerEvents: 'box-none',
                },
                lightboxImageAnimStyle,
              ]}
            >
              <View
                style={{
                  width: Math.round(Math.min(winW * 0.55, 920)),
                  maxWidth: winW - 80,
                  aspectRatio: 16 / 9,
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: '#000',
                  borderWidth: 1.5,
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  // @ts-ignore
                  boxShadow: '0 25px 60px rgba(0,0,0,0.85), 0 0 20px rgba(0,0,0,0.5)',
                  position: 'relative',
                }}
              >
                {DISCOVER_CATEGORIES[selectedDiscoverCategory || 0]?.tips[focusedDiscoverTip]?.video ? (
                  <DiscoverTipVideo
                    source={DISCOVER_CATEGORIES[selectedDiscoverCategory || 0]?.tips[focusedDiscoverTip]?.video}
                    resizeMode="contain"
                    muted={false}
                    showControls
                  />
                ) : (
                  <Image
                    source={DISCOVER_CATEGORIES[selectedDiscoverCategory || 0]?.tips[focusedDiscoverTip]?.image}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                )}

                {/* Navigation arrows on sides if multiple tips */}
                {(DISCOVER_CATEGORIES[selectedDiscoverCategory || 0]?.tips.length || 0) > 1 && (
                  <>
                    {focusedDiscoverTip > 0 && (
                      <TouchableOpacity
                        style={{
                          position: 'absolute',
                          left: 16,
                          top: '50%',
                          transform: [{ translateY: -22 }],
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: 'rgba(0,0,0,0.65)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.25)',
                          zIndex: 10,
                        }}
                        onPress={(e) => {
                          e.stopPropagation();
                          setFocusedDiscoverTip((prev) => Math.max(0, prev - 1));
                          soundService.playNavigation();
                        }}
                      >
                        <Ionicons name="chevron-back" size={24} color="#FFF" />
                      </TouchableOpacity>
                    )}

                    {focusedDiscoverTip < (DISCOVER_CATEGORIES[selectedDiscoverCategory || 0]?.tips.length || 1) - 1 && (
                      <TouchableOpacity
                        style={{
                          position: 'absolute',
                          right: 16,
                          top: '50%',
                          transform: [{ translateY: -22 }],
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: 'rgba(0,0,0,0.65)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.25)',
                          zIndex: 10,
                        }}
                        onPress={(e) => {
                          e.stopPropagation();
                          const maxTips = (DISCOVER_CATEGORIES[selectedDiscoverCategory || 0]?.tips.length || 1) - 1;
                          setFocusedDiscoverTip((prev) => Math.min(maxTips, prev + 1));
                          soundService.playNavigation();
                        }}
                      >
                        <Ionicons name="chevron-forward" size={24} color="#FFF" />
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {/* Title overlay at bottom */}
                {Platform.OS === 'web' && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: '20px 24px',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%)',
                      pointerEvents: 'none',
                    }}
                  >
                    {/* <div style={{ color: '#fff', fontSize: 18, fontWeight: 400, letterSpacing: '0.3px', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
                      {DISCOVER_CATEGORIES[selectedDiscoverCategory || 0]?.tips[focusedDiscoverTip]?.title}
                    </div> */}
                  </div>
                )}

                {/* Close button inside the card image top-right */}
                <TouchableOpacity
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(0,0,0,0.65)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.25)',
                    zIndex: 10,
                  }}
                  onPress={closeDiscoverLightbox}
                >
                  <Ionicons name="close" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </Animated.View>
  );
}



// ─── Animated News Row ────────────────────────────────────────────────────────
interface NewsRowProps {
  title: string;
  desc: string;
  tag: string;
  date: string;
  imageUri?: string;
  icon?: any;
  color?: string;
  enterDelay: number;
  isFocused: boolean;
}

// ─── Now Playing Card (Windows SMTC) ─────────────────────────────────────────
function AppSourceBadge({ appName, counterStyle }: { appName: string; counterStyle?: any }) {
  const icon = getAppIconName(appName);
  return (
    <Animated.View style={[counterStyle, { alignSelf: 'flex-start' }]}>
      <View style={[styles.mediaAppBadge, { backgroundColor: icon.bg }]}>
        {icon.vendor === 'material' ? (
          <MaterialCommunityIcons name={icon.name as any} size={17} color={icon.color} />
        ) : (
          <Ionicons name={icon.name as any} size={13} color={icon.color} />
        )}
      </View>
    </Animated.View>
  );
}

function NowPlayingCardBody({
  session,
  isExpanded,
  isActive,
  controlFocusIndex = 1,
  badgeCounterStyle,
}: {
  session: SystemMediaSession;
  isExpanded: boolean;
  isActive: boolean;
  controlFocusIndex?: number;
  badgeCounterStyle?: any;
}) {
  const progress =
    session.durationMs > 0
      ? Math.min(1, session.positionMs / session.durationMs)
      : 0;
  const isPlaying = session.playbackStatus === 'playing';
  const { t } = useTranslation();

  const mediaTarget = getMediaControlTarget(session);

  const focusedControlStyle = (index: number) => (
    controlFocusIndex === index
      ? { borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(255,255,255,0.1)' }
      : { borderColor: 'transparent', backgroundColor: 'transparent' }
  );

  if (!isExpanded) {
    return (
      <View style={styles.mediaCollapsedRoot}>
        <View style={styles.mediaCollapsedTop}>
          <AppSourceBadge appName={session.appName} counterStyle={badgeCounterStyle} />
        </View>
        <View style={styles.mediaArtWrap}>
          {session.thumbnail ? (
            <Image source={{ uri: session.thumbnail }} style={styles.mediaArtImage} contentFit="cover" />
          ) : (
            <View style={[styles.mediaArtImage, styles.mediaArtFallback]}>
              <Ionicons name="musical-notes" size={48} color="rgba(255,255,255,0.25)" />
            </View>
          )}
        </View>
        <View style={styles.mediaCollapsedMeta}>
          <Text style={styles.mediaNowPlayingLabel} numberOfLines={1}>
            {t('cc.playingOn')} {session.appName}
          </Text>
          <Text style={styles.mediaTrackTitle} numberOfLines={1}>{session.title}</Text>
          <Text style={styles.mediaTrackArtist} numberOfLines={1}>{session.artist}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mediaExpandedRoot}>
      <View style={styles.mediaExpandedHeader}>
        <AppSourceBadge appName={session.appName} />
        <Text style={styles.mediaExpandedHeaderText} numberOfLines={1}>
          {t('cc.playingOn')} {session.appName}
        </Text>
      </View>

      <View style={styles.mediaExpandedArtWrap}>
        {session.thumbnail ? (
          <Image source={{ uri: session.thumbnail }} style={styles.mediaExpandedArt} contentFit="cover" />
        ) : (
          <View style={[styles.mediaExpandedArt, styles.mediaArtFallback]}>
            <Ionicons name="musical-notes" size={64} color="rgba(255,255,255,0.25)" />
          </View>
        )}
      </View>

      <Text style={styles.mediaExpandedTitle} numberOfLines={2}>{session.title}</Text>
      <Text style={styles.mediaExpandedArtist} numberOfLines={1}>{session.artist}</Text>

      <View style={styles.mediaProgressRow}>
        <Text style={styles.mediaTimeText}>{formatMediaTime(session.positionMs)}</Text>
        <View style={styles.mediaProgressTrack}>
          <View style={[styles.mediaProgressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.mediaTimeText}>{formatMediaTime(session.durationMs)}</Text>
      </View>

      <View style={[styles.mediaControlsRow, { zIndex: 5 }]}>
        <View style={styles.mediaControlCenter}>
          <TouchableOpacity
            style={[styles.mediaSkipBtn, focusedControlStyle(0)]}
            onPress={(e) => {
              (e as any)?.stopPropagation?.();
              void sendMediaControl('prev', mediaTarget);
            }}
          >
            <Ionicons name="play-skip-back" size={22} color="#fff" />
            <PSIcon char={PSIcons.r1} size={20} color="rgba(255, 255, 255, 0.9)" style={{ marginTop: 2 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mediaPlayBtn, focusedControlStyle(1)]}
            onPress={(e) => {
              (e as any)?.stopPropagation?.();
              void sendMediaControl('play_pause', mediaTarget);
            }}
          >
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#fff" style={{ marginLeft: isPlaying ? 0 : 3 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mediaSkipBtn, focusedControlStyle(2)]}
            onPress={(e) => {
              (e as any)?.stopPropagation?.();
              void sendMediaControl('next', mediaTarget);
            }}
          >
            <Ionicons name="play-skip-forward" size={22} color="#fff" />
            <PSIcon char={PSIcons.l1} size={20} color="rgba(255, 255, 255, 0.9)" style={{ marginTop: 2 }} />
          </TouchableOpacity>
        </View>
      </View>

      {isActive && (
        <View style={styles.mediaFooterHints}>
          <View style={styles.mediaHintItem}>
            <PSIcon char={PSIcons.square} size={20} color="rgba(255, 255, 255, 0.9)" />
            <Text style={styles.mediaHintText}>{t('common.confirm')}</Text>
          </View>
          <View style={styles.mediaHintItem}>
            <PSIcon char={PSIcons.dpadLeft} size={20} color="rgba(255, 255, 255, 0.9)" />
            <PSIcon char={PSIcons.dpadRight} size={20} color="rgba(255, 255, 255, 0.9)" />
            <Text style={styles.mediaHintText}>{t('common.navigate')}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function NewsRow({ title, desc, tag, date, imageUri, icon, color, enterDelay, isFocused }: NewsRowProps) {
  const translateX = useSharedValue(-20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateX.value = withDelay(enterDelay, withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }));
    opacity.value = withDelay(enterDelay, withTiming(1, { duration: 300 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[styles.newsItem, style, isFocused && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 14 }}>
        <View style={[styles.newsThumb, color ? { backgroundColor: color } : { backgroundColor: '#1a1a1a' }, { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
          ) : (
            <Ionicons name={icon || 'newspaper'} size={26} color="rgba(255,255,255,0.55)" />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.newsTagRow}>
            <View style={[styles.newsTag, { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={[styles.newsTagText, { color: 'rgba(255,255,255,0.6)' }]}>{tag}</Text>
            </View>
            <Text style={styles.newsDate}>{date}</Text>
          </View>
          <Text style={styles.newsTitle}>{title}</Text>
          <Text style={styles.newsDesc} numberOfLines={2}>{desc}</Text>
        </View>
      </View>
      {isFocused && (
        <SpinningBorderNoticias
          size={13}
        />
      )}
    </Animated.View>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ControlCenterCards({
  isFocusedLayer,
  focusedIndex,
  onPressCard,
  isExpanded,
  onCloseExpanded,
  activeNavIndex,
  onRefreshApps,
  onCardsCountChange,
}: ControlCenterCardsProps) {
  const translateX = useSharedValue(0);
  const { width: winW, height: winH } = useWindowDimensions();
  const COLLAPSED_SIZE = Math.round(Math.min(Math.max(winH * 0.22, 200), 280));
  const cardStep = COLLAPSED_SIZE + 14;

  const { nowPlaying } = useSystemMedia();
  const { t } = useTranslation();

  const cardsToShow = React.useMemo(() => {
    const nowPlayingCard: CardData | null = nowPlaying
      ? {
        id: 'now-playing',
        title: nowPlaying.title,
        subtitle: `${t('cc.playingOn')} ${nowPlaying.appName}`,
        icon: 'musical-notes',
        imageUri: nowPlaying.thumbnail,
        type: 'nowPlaying',
        mediaSession: nowPlaying,
      }
      : null;

    if (activeNavIndex === 5) {
      const cards: CardData[] = [
        {
          id: 'add-game',
          title: t('cc.addGameTitle'),
          subtitle: t('cc.addGameSubtitle'),
          icon: 'game-controller' as const,
          type: 'addGame' as const,
        },
      ];
      return nowPlayingCard ? [nowPlayingCard, ...cards] : cards;
    }

    const cards: CardData[] = [];
    if (nowPlayingCard) cards.push(nowPlayingCard);

    const translatedMockCards = MOCK_CARDS.map(card => {
      if (card.id === 'c1') return { ...card, title: t('cc.officialNews'), subtitle: t('cc.newsSubtitle') };
      if (card.id === 'c2') return { ...card, title: t('cc.newCapture'), subtitle: t('cc.recentlyCreated') };
      if (card.id === 'c3') return { ...card, title: t('cc.featured'), subtitle: t('cc.discover') };
      return card;
    });

    return [...cards, ...translatedMockCards];
  }, [activeNavIndex, nowPlaying, t]);

  useEffect(() => {
    onCardsCountChange?.(Math.max(0, cardsToShow.length - 1));
  }, [cardsToShow.length, onCardsCountChange]);

  useEffect(() => {
    translateX.value = withTiming(-focusedIndex * cardStep, {
      duration: 250,
      easing: Easing.out(Easing.ease),
    });
  }, [focusedIndex, cardStep]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[styles.cardsRow, rowStyle, { paddingLeft: Math.max(winW * 0.05, 40), width: '100%' }]}>
      {cardsToShow.map((card, index) => (
        <AnimatedCard
          key={card.id}
          card={card as CardData}
          index={index}
          isActive={isFocusedLayer && focusedIndex === index}
          isExpanded={isExpanded && focusedIndex === index}
          isFocusedLayer={isFocusedLayer}
          onPress={() => onPressCard(index)}
          enterDelay={index * 60}
          onCloseExpanded={onCloseExpanded}
          onRefreshApps={onRefreshApps}
        />
      ))}
    </Animated.View>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const NEWS_ITEMS = [
  {
    title: 'Gran actualización de temporada llega esta semana',
    desc: 'El nuevo pase incluye 20 misiones, 3 personajes nuevos y eventos por tiempo limitado.',
    tag: 'ACTUALIZACIÓN', tagColor: '#0070d1', color: '#1a2a4a',
    icon: 'download-outline' as const, date: 'Hace 1 día',
  },
  {
    title: 'Torneo clasificatorio abierto este fin de semana',
    desc: 'Inscríbete antes del viernes para participar con premios exclusivos en el juego.',
    tag: 'EVENTO', tagColor: '#7b2fbe', color: '#2a1a4a',
    icon: 'trophy-outline' as const, date: 'Hace 2 días',
  },
  {
    title: 'Nuevo DLC: La Forja de los Héroes',
    desc: 'Explora el nuevo mapa de 8 horas de contenido, con jefes únicos y equipo épico.',
    tag: 'DLC', tagColor: '#be4f1f', color: '#3a1a1a',
    icon: 'planet-outline' as const, date: 'Hace 3 días',
  },
  {
    title: 'Notas de parche v2.4.1 — Balance de personajes',
    desc: 'Ajustes de daño en 12 personajes, 8 bugs críticos corregidos y mejoras de rendimiento.',
    tag: 'PARCHE', tagColor: '#1e7e34', color: '#1a3a1a',
    icon: 'bug-outline' as const, date: 'Hace 5 días',
  },
  {
    title: 'Colaboración especial con franquicia popular anunciada',
    desc: 'Skins exclusivos, emotes y accesorios del universo cinematográfico llegan pronto.',
    tag: 'COLABORACIÓN', tagColor: '#b8860b', color: '#3a2a1a',
    icon: 'star-outline' as const, date: 'Hace 1 semana',
  },
];

const getDiscoverCategories = (t: (key: string) => string) => [
  {
    id: 'easy',
    title: t('cc.easyToUse'),
    subtitle: t('cc.easyToUseDesc'),
    color: '#0055A5',
    icon: 'accessibility',
    tips: [
      {
        video: require('@/assets/video/controlCenter.mp4'),
        title: t('cc.floatingMenu'),
        description: (
          <>
            {t('cc.floatingMenuDesc')}{' '}
            <PSIcon
              char={PSIcons.options}
              size={10}
              color="rgba(255, 255, 255, 0.9)"
              style={{ verticalAlign: 'middle' }}
            />
          </>
        ),
      },
      {
        image: require('@/assets/images/SearchGuide.png'),
        title: t('cc.search'),
        description: (
          <>
            {t('cc.searchDesc')}{' '}
            <PSIcon
              char={PSIcons.triangle}
              size={20}
              color="rgba(255, 255, 255, 0.9)"
              style={{ verticalAlign: 'middle' }}
            />
          </>
        ),
      },
      {
        image: require('@/assets/images/VisualAnimation.png'),
        title: t('cc.visualAnimation'),
        description: t('cc.visualAnimationDesc'),
      },
      {
        image: require('@/assets/images/AvatarFolder.png'),
        title: t('cc.avatarFolder'),
        description: t('cc.avatarFolderDesc'),
      },
      {
        image: require('@/assets/images/SteamSetting.png'),
        title: t('cc.steamSetting'),
        description: t('cc.steamSettingDesc'),
      },
      {
        image: require('@/assets/images/Sync.png'),
        title: t('cc.sync'),
        description: t('cc.syncDesc'),
      },
    ]
  },
  {
    id: 'discover',
    title: t('cc.discoverMore'),
    subtitle: t('cc.discoverMoreDesc'),
    color: '#0066CC',
    icon: 'compass',
    tips: [
      {
        video: require('@/assets/video/addGames.mp4'),
        title: t('cc.addGameManually'),
        description: (
          <>
            {t('cc.addGameManuallyDesc')}{' '}
            <PSIcon
              char={PSIcons.options}
              size={10}
              color="rgba(255, 255, 255, 0.9)"
              style={{ verticalAlign: 'middle' }}
            />
          </>
        ),
      },
      {
        image: require('@/assets/images/settingGuide2.png'),
        title: t('cc.personalizeBg'),
        description: t('cc.personalizeBgDesc'),
      },
      {
        video: require('@/assets/video/wallpaper.mp4'),
        title: t('cc.personalizeBg2'),
        description: t('cc.personalizeBg2Desc'),
      },
      {
        video: require('@/assets/video/avatarPicker.mp4'),
        title: t('cc.avatarPicker'),
        description: t('cc.avatarPickerDesc'),
      }
    ]
  },
  {
    id: 'improve',
    title: t('cc.improveTitle'),
    subtitle: t('cc.improveDesc'),
    color: '#0077E6',
    icon: 'game-controller',
    tips: [
      {
        image: require('@/assets/images/music.png'),
        title: t('cc.controlMusic'),
        description: t('cc.controlMusicDesc'),
      },
      {
        image: require('@/assets/images/SettingGames.png'),
        title: t('cc.settingGames'),
        description: (
          <>
            {t('cc.settingGamesDesc')}{' '}
            <PSIcon
              char={PSIcons.share}
              size={10}
              color="rgba(255, 255, 255, 0.9)"
              style={{ verticalAlign: 'middle' }}
            />
          </>
        ),
      },
      {
        video: require('@/assets/video/editorGames.mp4'),
        title: t('cc.editorGames'),
        description: t('cc.editorGamesDesc'),
      }
    ]
  }
];

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    marginBottom: 50,
    width: '95%',
    gap: 14,
  },
  card: {
    borderRadius: 16,
    overflow: 'visible',
    backgroundColor: '#0d1015',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  cardClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 14,
    // subtle gradient-like dark bottom via backgroundColor at bottom half
    //background: undefined,
  },
  cardTopBar: {
    flexDirection: 'row',
  },
  smallIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBottom: {
    // Bottom of card — sits on top of the image gradient
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    fontFamily: 'SSTLight',
    marginBottom: 2,
    //textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'SSTMedium',
    lineHeight: 20,
  },

  // Modal / Expanded
  modalOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBg: {
    backgroundColor: 'rgba(5, 5, 10, 0.88)',
  },
  expandedContainer: {
    width: '58%',
    maxWidth: 700,
    height: '68%',
    backgroundColor: '#0d1015',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    // @ts-ignore web shadow
    boxShadow: '0 40px 80px rgba(0,0,0,0.9)',
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  expandedTitle: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'SSTBold',
    lineHeight: 20,
  },
  expandedSubtitle: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 12,
    fontFamily: 'SSTLight',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  // News list
  newsItem: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    gap: 14,
  },
  newsThumb: {
    width: 80,
    height: 64,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  newsTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  newsTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newsTagText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'SSTRg',
    letterSpacing: 0.6,
  },
  newsDate: {
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'SSTRg',
    fontSize: 11,
  },
  newsTitle: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'SSTBold',
    marginBottom: 4,
    lineHeight: 18,
  },
  newsDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'SSTLight',
    fontSize: 12,
    lineHeight: 16,
  },

  // Lightbox
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxContent: {
    width: '90%',
    height: '90%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Now Playing (Windows media)
  mediaCollapsedRoot: {
    flex: 1,
    backgroundColor: '#0d1015',
    padding: 14,
  },
  mediaCollapsedTop: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  mediaAppBadge: {
    width: 27,
    height: 27,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaArtWrap: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    width: '70%',
    height: '40%',
    margin: 'auto',
    marginBottom: 12,
  },
  mediaArtImage: {
    width: '100%',
    height: '100%',
  },
  mediaArtFallback: {
    backgroundColor: '#2a2a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaCollapsedMeta: {
    paddingBottom: 2,
  },
  mediaNowPlayingLabel: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 13,
    fontFamily: 'SSTRg',
    marginBottom: 4,
  },
  mediaTrackTitle: {
    color: '#ffffffe8',
    fontSize: 17,
    fontFamily: 'SSTBold',
    marginBottom: 2,
  },
  mediaTrackArtist: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 13,
    fontFamily: 'SSTRg',
  },
  mediaExpandedRoot: {
    flex: 1,
    backgroundColor: '#0d1015',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  mediaExpandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  mediaExpandedHeaderText: {
    color: 'rgba(255, 255, 255, 0.89)',
    fontSize: 17,
    fontFamily: 'SSTLight',
    flex: 1,
  },
  mediaExpandedArtWrap: {
    alignSelf: 'center',
    width: '72%',
    aspectRatio: 1,
    borderRadius: 0,
    overflow: 'hidden',
    marginBottom: 18,
  },
  mediaExpandedArt: {
    width: '100%',
    height: '100%',
  },
  mediaExpandedTitle: {
    color: '#fff',
    fontSize: 23,
    fontFamily: 'SSTLight',
    marginBottom: 4,
  },
  mediaExpandedArtist: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 17,
    fontFamily: 'SSTLight',
    marginBottom: 18,
  },
  mediaProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
  },
  mediaProgressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  mediaProgressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  mediaTimeText: {
    color: 'rgba(255, 255, 255, 1)',
    fontSize: 13,
    fontFamily: 'SSTBold',
    width: 36,
    textAlign: 'center',
  },
  mediaControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  mediaControlBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaControlCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  mediaSkipBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 50,
    borderRadius: 12,
    //borderWidth: 1,
  },
  mediaSkipHint: {
    color: 'rgba(255, 255, 255, 0.22)',
    fontSize: 9,
    marginTop: 2,
    fontFamily: 'SSTLight',
  },
  mediaPlayBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaFooterHints: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    marginTop: 'auto' as any,
    paddingTop: 8,
  },
  mediaHintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mediaHintCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  mediaHintSquare: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  mediaHintText: {
    color: 'rgba(255, 255, 255, 0.66)',
    fontFamily: 'SSTLight',
    fontSize: 14,
  },
});