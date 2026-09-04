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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { notifyNowPlayingToast } from '@/services/toastService';
import {
  sendMediaControl,
  getMediaControlTarget,
  getAppIconName,
  cleanAppName,
} from '@/services/systemMediaService';

interface MusicExpandedCardProps {
  isOpen: boolean;
  onClose: () => void;
}

function AppSourceBadge({ appName }: { appName?: string }) {
  const icon = getAppIconName(appName || 'Spotify');
  return (
    <View style={[styles.appBadgeWrap, { backgroundColor: icon.bg }]}>
      {icon.vendor === 'material' ? (
        <MaterialCommunityIcons name={icon.name as any} size={13} color={icon.color} />
      ) : (
        <Ionicons name={icon.name as any} size={10} color={icon.color} />
      )}
    </View>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Ahora mismo';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  return `Hace ${diffHours} h`;
}

export default function MusicExpandedCard({ isOpen, onClose }: MusicExpandedCardProps) {
  const { t } = useTranslation();
  const { width: winW, height: winH } = useWindowDimensions();
  const { nowPlaying } = useSystemMedia();

  const EXPANDED_W = Math.round(Math.min(Math.max(winW * 0.36, 400), 580));
  const EXPANDED_H = Math.round(Math.min(Math.max(winH * 0.62, 420), 660));

  const [focusedIndex, setFocusedIndex] = useState(0);
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

  // Notificar cambio de canción vía Toast y registrar en el historial mientras la card está abierta
  useEffect(() => {
    if (!isOpen || !nowPlaying || nowPlaying.playbackStatus !== 'playing') return;
    notifyNowPlayingToast({
      id: nowPlaying.id,
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      thumbnail: nowPlaying.thumbnail,
      appName: nowPlaying.appName,
      t,
    });
  }, [
    isOpen,
    nowPlaying?.id,
    nowPlaying?.title,
    nowPlaying?.artist,
    nowPlaying?.playbackStatus,
    nowPlaying?.appName,
    t,
  ]);

  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      backdropOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      cardOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      cardTranslateY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
      cardScale.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
      setFocusedIndex(0);
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

  useEffect(() => {
    if (focusedIndex > Math.max(0, historyList.length - 1)) {
      setFocusedIndex(0);
    }
  }, [historyList.length, focusedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const rowH = 68;
    scrollRef.current?.scrollTo({ y: focusedIndex * rowH, animated: true });
  }, [focusedIndex, isOpen]);

  const handlePrevTrack = async () => {
    soundService.playActivation?.();
    await sendMediaControl('prev', getMediaControlTarget(nowPlaying));
  };

  const handleNextTrack = async () => {
    soundService.playActivation?.();
    await sendMediaControl('next', getMediaControlTarget(nowPlaying));
  };

  const handleTogglePlay = async () => {
    soundService.playActivation?.();
    await sendMediaControl('play_pause', getMediaControlTarget(nowPlaying));
  };

  // Teclado y Mando (L1 -> Prev, R1 -> Next)
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'q' || e.key === 'Q') {
        // L1 -> Canción anterior
        e.preventDefault();
        e.stopPropagation();
        void handlePrevTrack();
      } else if (e.key === 'e' || e.key === 'E') {
        // R1 -> Canción siguiente
        e.preventDefault();
        e.stopPropagation();
        void handleNextTrack();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setFocusedIndex((prev) => Math.min(Math.max(0, historyList.length - 1), prev + 1));
        soundService.playNavigation();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setFocusedIndex((prev) => Math.max(0, prev - 1));
        soundService.playNavigation();
      } else if (e.key === 'Enter' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        e.stopPropagation();
        void handleTogglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, historyList, nowPlaying]);

  if (!shouldRender) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }, backdropStyle]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <View style={styles.centerContainer} pointerEvents="box-none">
        <Animated.View style={[styles.card, { width: EXPANDED_W, height: EXPANDED_H }, cardAnimStyle]}>
          {/* Header Superior */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {(() => {
                const currentApp = nowPlaying?.appName || historyList[0]?.appName || 'Spotify';
                const headerAppIcon = getAppIconName(currentApp);
                return (
                  <View style={[styles.appIconBadge, { backgroundColor: headerAppIcon.bg }]}>
                    {headerAppIcon.vendor === 'material' ? (
                      <MaterialCommunityIcons name={headerAppIcon.name as any} size={17} color={headerAppIcon.color} />
                    ) : (
                      <Ionicons name={headerAppIcon.name as any} size={15} color={headerAppIcon.color} />
                    )}
                  </View>
                );
              })()}
              <Text style={styles.headerTitle}>{t('musicExpanded.recentlyPlayed')}</Text>
            </View>

            <TouchableOpacity style={styles.headerClose} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Cuerpo - Lista de Canciones Escuchadas Recientemente */}
          <View style={styles.body}>
            {historyList.length === 0 ? (
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
                {historyList.map((item, idx) => {
                  const isFocused = idx === focusedIndex;
                  const isPlayingNow =
                    nowPlaying?.playbackStatus === 'playing' &&
                    nowPlaying.title.toLowerCase() === item.title.toLowerCase();

                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.85}
                      onPress={() => {
                        setFocusedIndex(idx);
                        void handleTogglePlay();
                      }}
                      style={[styles.row, isFocused && styles.rowFocused]}
                    >
                      {/* Portada */}
                      <View style={styles.artworkWrap}>
                        {item.thumbnail ? (
                          <Image
                            source={
                              typeof item.thumbnail === 'string'
                                ? { uri: item.thumbnail }
                                : item.thumbnail
                            }
                            style={styles.artwork}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.artwork, styles.artworkFallback]}>
                            <Ionicons name="musical-notes" size={22} color="#FFF" />
                          </View>
                        )}
                      </View>

                      {/* Título y Artista */}
                      <View style={styles.itemMeta}>
                        <Text style={styles.itemTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.itemSubtitle} numberOfLines={1}>
                          {item.artist || 'Artista desconocido'}
                        </Text>
                      </View>

                      {/* Marca de tiempo o Badge En reproducción */}
                      <View style={styles.itemRight}>
                        {isPlayingNow ? (
                          <View style={styles.statusPill}>
                            <Ionicons name="volume-medium" size={12} color="#1DB954" style={{ marginRight: 4 }} />
                            <Text style={styles.statusPillText}>{t('musicExpanded.nowPlaying')}</Text>
                          </View>
                        ) : (
                          <Text style={styles.timeText}>{formatRelativeTime(item.timestamp)}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Footer con hints de L1/R1 y botones */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <TouchableOpacity style={styles.footerHint} onPress={handlePrevTrack} activeOpacity={0.7}>
                <PSIcon char={PSIcons.l1} size={18} color="rgba(255, 255, 255, 0.9)" />
                <Text style={styles.footerHintText}>Anterior</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.footerHint} onPress={handleNextTrack} activeOpacity={0.7}>
                <PSIcon char={PSIcons.r1} size={18} color="rgba(255, 255, 255, 0.9)" />
                <Text style={styles.footerHintText}>Siguiente</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.footerRight}>
              <View style={styles.footerHint}>
                <PSIcon char={PSIcons.square} size={16} color="rgba(255, 255, 255, 0.7)" />
                <Text style={styles.footerHintText}>Play/Pausa</Text>
              </View>
              <View style={styles.footerHint}>
                <PSIcon char={PSIcons.circle} size={16} color="rgba(255, 255, 255, 0.7)" />
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
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
    paddingHorizontal: 16,
    paddingTop: 10,
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
    paddingHorizontal: 14,
    borderRadius: 10,
    marginVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
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
    width: 46,
    height: 46,
    borderRadius: 8,
  },
  artworkFallback: {
    backgroundColor: '#2A2A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBadgeWrap: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#12131F',
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
  itemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  timeText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    fontFamily: 'SSTLight',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
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
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  footerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerHintText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontFamily: 'SSTMedium',
  },
});
