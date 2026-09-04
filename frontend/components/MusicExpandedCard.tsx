import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useTranslation } from '@/contexts/LanguageContext';
import { soundService } from '@/services/soundService';
import { musicHistoryService, HistoryTrackItem } from '@/services/musicHistoryService';
import { useSystemMedia } from '@/hooks/useSystemMedia';
import staticTracks from '@/constants/tracks';
import { openWebLink } from '@/services/linkService';

interface MusicExpandedCardProps {
  isOpen: boolean;
  onClose: () => void;
}

type SectionType = 'topPicks' | 'recentlyPlayed' | 'musicSources';

interface CuratedItem {
  id: string;
  title: string;
  subtitle: string;
  artwork: any;
  color?: string;
  type: 'playlist' | 'track' | 'source';
}

const TOP_PICKS: CuratedItem[] = [
  {
    id: 'tp-1',
    title: 'Rap Life',
    subtitle: 'Playlist',
    artwork: require('@/assets/images/spotify_portada.png'),
    color: '#E63946',
    type: 'playlist',
  },
  {
    id: 'tp-2',
    title: 'Viral Hits',
    subtitle: 'Playlist',
    artwork: require('@/assets/images/wavesFondo.jpeg'),
    color: '#457B9D',
    type: 'playlist',
  },
  {
    id: 'tp-3',
    title: 'Immersive Gaming',
    subtitle: 'Playlist',
    artwork: require('@/assets/images/StoreBackground.jpg'),
    color: '#2A9D8F',
    type: 'playlist',
  },
  {
    id: 'tp-4',
    title: 'In My Room',
    subtitle: 'Playlist',
    artwork: require('@/assets/images/FondoDefault2.jpg'),
    color: '#F4A261',
    type: 'playlist',
  },
  {
    id: 'tp-5',
    title: 'Indie Anthems',
    subtitle: 'Playlist',
    artwork: require('@/assets/images/StoreFondo.jpg'),
    color: '#E76F51',
    type: 'playlist',
  },
  {
    id: 'tp-6',
    title: 'Favorites Mix',
    subtitle: 'Playlist',
    artwork: require('@/assets/images/cambioFondo.png'),
    color: '#9B5DE5',
    type: 'playlist',
  },
];

const MUSIC_SOURCES: CuratedItem[] = [
  {
    id: 'src-spotify',
    title: 'Spotify',
    subtitle: 'Streaming de Música',
    artwork: require('@/assets/images/spotify_logo.png'),
    color: '#1DB954',
    type: 'source',
  },
  {
    id: 'src-apple',
    title: 'Apple Music',
    subtitle: 'Streaming de Música',
    artwork: require('@/assets/images/music.png'),
    color: '#FA233B',
    type: 'source',
  },
  {
    id: 'src-wps5',
    title: 'WPS5 Local Player',
    subtitle: 'Reproductor Integrado',
    artwork: require('@/assets/images/Libreria.jpeg'),
    color: '#0070D1',
    type: 'source',
  },
];

export default function MusicExpandedCard({ isOpen, onClose }: MusicExpandedCardProps) {
  const { t } = useTranslation();
  const { width: winW, height: winH } = useWindowDimensions();
  const { nowPlaying } = useSystemMedia();

  const EXPANDED_W = Math.round(Math.min(Math.max(winW * 0.38, 420), 620));
  const EXPANDED_H = Math.round(Math.min(Math.max(winH * 0.64, 440), 680));

  const [activeSection, setActiveSection] = useState<SectionType>('recentlyPlayed');
  const [activeColumn, setActiveColumn] = useState<'sidebar' | 'content'>('content');
  const [sidebarFocusedIndex, setSidebarFocusedIndex] = useState(1);
  const [contentFocusedIndex, setContentFocusedIndex] = useState(0);
  const [historyList, setHistoryList] = useState<HistoryTrackItem[]>(() => musicHistoryService.getHistory());

  const scrollRef = useRef<ScrollView>(null);

  const backdropOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(24);
  const cardScale = useSharedValue(0.96);

  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    return musicHistoryService.subscribe(setHistoryList);
  }, []);

  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      backdropOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      cardOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      cardTranslateY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
      cardScale.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
      setActiveColumn('content');
      setContentFocusedIndex(0);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) });
      cardOpacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) });
      cardTranslateY.value = withTiming(16, { duration: 200, easing: Easing.in(Easing.cubic) });
      cardScale.value = withTiming(0.97, { duration: 200, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setShouldRender)(false);
      });
    }
  }, [isOpen]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }, { scale: cardScale.value }],
  }));

  const currentContentItems = useMemo(() => {
    if (activeSection === 'topPicks') return TOP_PICKS;
    if (activeSection === 'musicSources') return MUSIC_SOURCES;
    return historyList;
  }, [activeSection, historyList]);

  useEffect(() => {
    if (contentFocusedIndex > Math.max(0, currentContentItems.length - 1)) {
      setContentFocusedIndex(0);
    }
  }, [currentContentItems.length, contentFocusedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const rowH = 68;
    scrollRef.current?.scrollTo({ y: contentFocusedIndex * rowH, animated: true });
  }, [contentFocusedIndex, isOpen]);

  // Teclado y Mando
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        if (activeColumn === 'content') {
          setActiveColumn('sidebar');
          soundService.playNavigation();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        if (activeColumn === 'sidebar') {
          setActiveColumn('content');
          soundService.playNavigation();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        soundService.playNavigation();
        if (activeColumn === 'sidebar') {
          setSidebarFocusedIndex((prev) => {
            const next = Math.min(2, prev + 1);
            if (next === 0) setActiveSection('topPicks');
            else if (next === 1) setActiveSection('recentlyPlayed');
            else setActiveSection('musicSources');
            return next;
          });
        } else {
          setContentFocusedIndex((prev) => Math.min(Math.max(0, currentContentItems.length - 1), prev + 1));
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        soundService.playNavigation();
        if (activeColumn === 'sidebar') {
          setSidebarFocusedIndex((prev) => {
            const next = Math.max(0, prev - 1);
            if (next === 0) setActiveSection('topPicks');
            else if (next === 1) setActiveSection('recentlyPlayed');
            else setActiveSection('musicSources');
            return next;
          });
        } else {
          setContentFocusedIndex((prev) => Math.max(0, prev - 1));
        }
      } else if (e.key === 'Enter' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        e.stopPropagation();
        soundService.playActivation?.();
        if (activeColumn === 'sidebar') {
          setActiveColumn('content');
        } else {
          handleItemSelect(currentContentItems[contentFocusedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, activeColumn, sidebarFocusedIndex, contentFocusedIndex, currentContentItems]);

  const handleItemSelect = (item: any) => {
    if (!item) return;
    if (item.id === 'src-spotify') {
      void openWebLink('https://open.spotify.com');
    } else if (item.id === 'src-apple') {
      void openWebLink('https://music.apple.com');
    }
  };

  if (!shouldRender) return null;

  const sidebarSections: { key: SectionType; label: string; icon: string; badge?: number }[] = [
    { key: 'topPicks', label: t('musicExpanded.topPicks'), icon: 'flame-outline' },
    { key: 'recentlyPlayed', label: t('musicExpanded.recentlyPlayed'), icon: 'time-outline', badge: historyList.length },
    { key: 'musicSources', label: t('musicExpanded.musicSources'), icon: 'apps-outline' },
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }, backdropStyle]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <View style={styles.centerContainer} pointerEvents="box-none">
        <Animated.View style={[styles.card, { width: EXPANDED_W, height: EXPANDED_H }, cardAnimStyle]}>
          {/* Header Superior */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.appIconBadge}>
                <Ionicons name="musical-notes" size={16} color="#FFF" />
              </View>
              <Text style={styles.headerTitle}>
                {activeSection === 'topPicks'
                  ? t('musicExpanded.topPicks')
                  : activeSection === 'recentlyPlayed'
                  ? t('musicExpanded.recentlyPlayed')
                  : t('musicExpanded.title')}
              </Text>
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.6)" style={{ marginLeft: 4 }} />
            </View>

            <TouchableOpacity style={styles.headerClose} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Cuerpo Dos Columnas */}
          <View style={styles.body}>
            {/* Columna Izquierda: Menú / Sidebar */}
            <View style={styles.sidebar}>
              {sidebarSections.map((sec, idx) => {
                const isSelectedSection = activeSection === sec.key;
                const isSidebarFocused = activeColumn === 'sidebar' && sidebarFocusedIndex === idx;

                return (
                  <TouchableOpacity
                    key={sec.key}
                    activeOpacity={0.8}
                    onPress={() => {
                      setActiveSection(sec.key);
                      setSidebarFocusedIndex(idx);
                      setActiveColumn('sidebar');
                      soundService.playNavigation();
                    }}
                    style={[
                      styles.sidebarItem,
                      isSelectedSection && styles.sidebarItemActive,
                      isSidebarFocused && styles.sidebarItemFocused,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sidebarText,
                        isSelectedSection && styles.sidebarTextActive,
                        isSidebarFocused && styles.sidebarTextFocused,
                      ]}
                      numberOfLines={1}
                    >
                      {sec.label}
                    </Text>
                    {Boolean(sec.badge) && (
                      <View style={styles.sidebarBadge}>
                        <Text style={styles.sidebarBadgeText}>{sec.badge}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Separador vertical */}
            <View style={styles.divider} />

            {/* Columna Derecha: Lista de Contenido */}
            <View style={styles.contentArea}>
              {currentContentItems.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="musical-notes-outline" size={44} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.emptyTitle}>{t('musicExpanded.noHistory')}</Text>
                  <Text style={styles.emptySub}>{t('musicExpanded.noHistorySub')}</Text>
                </View>
              ) : (
                <ScrollView
                  ref={scrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 16 }}
                  showsVerticalScrollIndicator={false}
                >
                  {currentContentItems.map((item: any, idx: number) => {
                    const isFocused = activeColumn === 'content' && idx === contentFocusedIndex;
                    const isPlayingNow =
                      nowPlaying?.playbackStatus === 'playing' &&
                      nowPlaying.title.toLowerCase() === (item.title || '').toLowerCase();

                    return (
                      <TouchableOpacity
                        key={item.id || idx}
                        activeOpacity={0.85}
                        onPress={() => {
                          setContentFocusedIndex(idx);
                          setActiveColumn('content');
                          soundService.playActivation?.();
                          handleItemSelect(item);
                        }}
                        style={[styles.row, isFocused && styles.rowFocused]}
                      >
                        <View style={styles.artworkWrap}>
                          {item.thumbnail || item.artwork ? (
                            <Image
                              source={
                                typeof (item.thumbnail || item.artwork) === 'string'
                                  ? { uri: item.thumbnail || item.artwork }
                                  : item.thumbnail || item.artwork
                              }
                              style={styles.artwork}
                              contentFit="cover"
                            />
                          ) : (
                            <View style={[styles.artwork, styles.artworkFallback]}>
                              <Ionicons name="musical-notes" size={22} color="#FFF" />
                            </View>
                          )}

                          {isPlayingNow && (
                            <View style={styles.playingBadge}>
                              <Ionicons name="volume-medium" size={12} color="#1DB954" />
                            </View>
                          )}
                        </View>

                        <View style={styles.itemMeta}>
                          <Text style={styles.itemTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.itemSubtitle} numberOfLines={1}>
                            {item.artist || item.subtitle || t('musicExpanded.nowPlaying')}
                          </Text>
                        </View>

                        {isPlayingNow && (
                          <View style={styles.statusPill}>
                            <Text style={styles.statusPillText}>{t('musicExpanded.nowPlaying')}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>

          {/* Footer de Pistas/Controles */}
          <View style={styles.footer}>
            <View style={styles.footerHint}>
              <PSIcon char={PSIcons.options} size={18} color="rgba(255,255,255,0.7)" />
              <Text style={styles.footerHintText}>Options</Text>
            </View>
            <View style={styles.footerRight}>
              <View style={styles.footerHint}>
                <PSIcon char={PSIcons.square} size={16} color="rgba(255,255,255,0.7)" />
                <Text style={styles.footerHintText}>{t('common.confirm')}</Text>
              </View>
              <View style={styles.footerHint}>
                <PSIcon char={PSIcons.circle} size={16} color="rgba(255,255,255,0.7)" />
                <Text style={styles.footerHintText}>{t('common.back')}</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: 'rgba(22, 23, 31, 0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 28,
    elevation: 20,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  appIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#FA233B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'SSTBold',
    fontWeight: '700',
  },
  headerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sidebar: {
    width: 170,
    flexDirection: 'column',
    gap: 8,
    paddingRight: 10,
    paddingTop: 8,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  sidebarItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  sidebarItemFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  sidebarText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 15,
    fontFamily: 'SSTMedium',
  },
  sidebarTextActive: {
    color: '#FFF',
    fontFamily: 'SSTBold',
  },
  sidebarTextFocused: {
    color: '#FFF',
  },
  sidebarBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sidebarBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: 'SSTBold',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 4,
  },
  contentArea: {
    flex: 1,
    paddingLeft: 14,
    paddingTop: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontFamily: 'SSTBold',
    marginTop: 12,
  },
  emptySub: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
    fontFamily: 'SSTLight',
    textAlign: 'center',
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginVertical: 3,
    backgroundColor: 'transparent',
  },
  rowFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  artworkWrap: {
    position: 'relative',
    marginRight: 14,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  artworkFallback: {
    backgroundColor: '#2A2A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    backgroundColor: '#12131F',
    borderRadius: 8,
    padding: 3,
  },
  itemMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTMedium',
  },
  itemSubtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontFamily: 'SSTLight',
    marginTop: 3,
  },
  statusPill: {
    backgroundColor: 'rgba(29, 185, 84, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.4)',
  },
  statusPillText: {
    color: '#1DB954',
    fontSize: 11,
    fontFamily: 'SSTBold',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(15, 16, 22, 0.6)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  footerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  footerHintText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontFamily: 'SSTMedium',
  },
});
