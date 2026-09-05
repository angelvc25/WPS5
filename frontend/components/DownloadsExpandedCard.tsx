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
import { SpinningBorderSearch } from './SpinningBorderSearch';

export interface DownloadItem {
  id: string;
  appName: string;
  appIcon?: any;
  appCoverImage?: any;
  platform?: string;
  progress: number;
  totalSize: number;
  downloadedSize: number;
  timeRemaining: string;
  status: 'downloading' | 'installing' | 'completed';
  startTime: number;
}

interface DownloadsExpandedCardProps {
  isOpen: boolean;
  onClose: () => void;
  downloads?: DownloadItem[];
}

const MOCK_DOWNLOADS: DownloadItem[] = [
  {
    id: 'dl-1',
    appName: 'Wobbly Life',
    platform: 'PS5',
    progress: 14.8,
    totalSize: 2132000000,
    downloadedSize: 317200000,
    timeRemaining: '3m',
    status: 'downloading',
    startTime: Date.now() - 120000,
  },
];

const MOCK_COMPLETED: DownloadItem[] = [
  {
    id: 'dl-c1',
    appName: 'Software del sistema',
    platform: 'PS5',
    progress: 100,
    totalSize: 0,
    downloadedSize: 0,
    timeRemaining: '',
    status: 'completed',
    startTime: Date.now() - 86400000,
  },
  {
    id: 'dl-c2',
    appName: 'FINAL FANTASY XVI',
    platform: 'PS5',
    progress: 100,
    totalSize: 0,
    downloadedSize: 0,
    timeRemaining: '',
    status: 'completed',
    startTime: Date.now() - 172800000,
  },
  {
    id: 'dl-c3',
    appName: "ASTRO's PLAYROOM",
    platform: 'PS5',
    progress: 100,
    totalSize: 0,
    downloadedSize: 0,
    timeRemaining: '',
    status: 'completed',
    startTime: Date.now() - 259200000,
  },
  {
    id: 'dl-c4',
    appName: 'Apple TV',
    platform: 'PS5',
    progress: 100,
    totalSize: 0,
    downloadedSize: 0,
    timeRemaining: '',
    status: 'completed',
    startTime: Date.now() - 345600000,
  },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function DownloadsExpandedCard({
  isOpen,
  onClose,
  downloads: downloadsProp,
}: DownloadsExpandedCardProps) {
  const { width: winW, height: winH } = useWindowDimensions();
  const { t } = useTranslation();

  const [downloads] = useState<DownloadItem[]>(downloadsProp ?? MOCK_DOWNLOADS);
  const [completed] = useState<DownloadItem[]>(MOCK_COMPLETED);
  const [selectedDownload, setSelectedDownload] = useState<DownloadItem | null>(null);
  const [focusedRow, setFocusedRow] = useState(0);

  const scrollRef = useRef<ScrollView>(null);

  const CARD_W = Math.round(Math.min(Math.max(winW * 0.24, 380), 480));
  const CARD_MAX_H = Math.round(Math.min(Math.max(winH * 0.62, 380), 760));

  const backdropOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(16);
  const cardScale = useSharedValue(0.96);
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      backdropOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
      cardOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
      cardTranslateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      cardScale.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
      setFocusedRow(0);
      setSelectedDownload(null);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) });
      cardOpacity.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) });
      cardTranslateY.value = withTiming(16, { duration: 180, easing: Easing.in(Easing.cubic) });
      cardScale.value = withTiming(0.97, { duration: 180, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setShouldRender)(false);
      });
    }
  }, [isOpen]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }, { scale: cardScale.value }],
  }));

  const allItems = useMemo(() => {
    return [...downloads, ...completed];
  }, [downloads, completed]);

  const totalRows = selectedDownload ? 1 : allItems.length;

  useEffect(() => {
    if (focusedRow > totalRows - 1) setFocusedRow(Math.max(0, totalRows - 1));
  }, [totalRows, focusedRow]);

  useEffect(() => {
    if (!isOpen) return;
    const rowH = selectedDownload ? 0 : 92;
    const idx = Math.max(0, focusedRow);
    scrollRef.current?.scrollTo({ y: idx * rowH, animated: true });
  }, [focusedRow, isOpen, selectedDownload]);

  const activateFocusedRow = () => {
    if (selectedDownload) return;
    const item = allItems[focusedRow];
    if (item && item.status !== 'completed') {
      setSelectedDownload(item);
      soundService.playActivation?.();
    }
  };

  const handleBackFromDetail = () => {
    setSelectedDownload(null);
    soundService.playBack?.();
  };

  useEffect(() => {
    if (!isOpen || Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        e.stopPropagation();
        if (selectedDownload) {
          handleBackFromDetail();
        } else {
          soundService.playBack?.();
          onClose();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedDownload) {
          setFocusedRow((prev) => Math.min(prev + 1, totalRows - 1));
          soundService.playNavigation();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedDownload) {
          setFocusedRow((prev) => Math.max(prev - 1, 0));
          soundService.playNavigation();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        activateFocusedRow();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, totalRows, focusedRow, allItems, selectedDownload]);

  if (!shouldRender) return null;

  if (selectedDownload) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents={isOpen ? 'auto' : 'none'}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }, backdropStyle]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={handleBackFromDetail} />

        <View style={styles.centerContainer} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.card,
              {
                width: CARD_W,
                maxHeight: CARD_MAX_H,
                boxShadow: '0 24px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
              },
              cardAnimStyle,
            ]}
          >
            <View style={styles.detailHeader}>
              {selectedDownload.platform && (
                <View style={styles.platformBadge}>
                  <Text style={styles.platformBadgeText}>{selectedDownload.platform}</Text>
                </View>
              )}
              <Text style={styles.detailHeaderTitle} numberOfLines={1}>{selectedDownload.appName}</Text>
            </View>

            <View style={styles.detailBody}>
              <View style={styles.detailCard}>
                <View style={styles.detailCardInner}>
                  <View style={styles.detailIconWrap}>
                    {selectedDownload.appCoverImage || selectedDownload.appIcon ? (
                      <Image
                        source={selectedDownload.appCoverImage || selectedDownload.appIcon}
                        style={styles.detailIcon}
                        contentFit={selectedDownload.appCoverImage ? 'cover' : 'contain'}
                      />
                    ) : (
                      <View style={[styles.detailIcon, styles.detailIconFallback]}>
                        <Ionicons name="game-controller" size={28} color="rgba(255,255,255,0.6)" />
                      </View>
                    )}
                  </View>

                  <View style={styles.detailMeta}>
                    <Text style={styles.detailTitle} numberOfLines={1}>{selectedDownload.appName}</Text>
                    <Text style={styles.detailSubtitle}>
                      {t('downloads.installTime', {
                        time: selectedDownload.timeRemaining,
                        downloaded: formatBytes(selectedDownload.downloadedSize),
                        total: formatBytes(selectedDownload.totalSize),
                      })}
                    </Text>
                  </View>
                </View>

                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.min(selectedDownload.progress, 100)}%` },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.footerHints}>
              <TouchableOpacity style={styles.hintItem} activeOpacity={0.7} onPress={handleBackFromDetail}>
                <PSIcon char={PSIcons.circle} size={16} color="rgba(255,255,255,0.9)" />
                <Text style={styles.hintText}>{t('downloads.back')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }, backdropStyle]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <View style={styles.centerContainer} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              width: CARD_W,
              maxHeight: CARD_MAX_H,
              boxShadow: '0 24px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
            },
            cardAnimStyle,
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('downloads.title')}</Text>
          </View>

          {downloads.length > 0 && (
            <View style={styles.section}>
              {downloads.map((item, idx) => {
                const isFocused = focusedRow === idx;
                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.85}
                    onPress={() => {
                      setFocusedRow(idx);
                      setSelectedDownload(item);
                      soundService.playActivation?.();
                    }}
                    style={[styles.downloadCard, isFocused && styles.downloadCardFocused]}
                  >
                    {isFocused && <SpinningBorderSearch size={50} spread={1} borderRadius={2} />}
                    <View style={styles.downloadCardInner}>
                      <View style={styles.downloadIconWrap}>
                        {item.appCoverImage || item.appIcon ? (
                          <Image
                            source={item.appCoverImage || item.appIcon}
                            style={styles.downloadIcon}
                            contentFit={item.appCoverImage ? 'cover' : 'contain'}
                          />
                        ) : (
                          <View style={[styles.downloadIcon, styles.downloadIconFallback]}>
                            <Ionicons name="game-controller" size={18} color="rgba(255,255,255,0.6)" />
                          </View>
                        )}
                      </View>

                      <View style={styles.downloadMeta}>
                        <View style={styles.downloadTopRow}>
                          <Text style={styles.downloadTitle} numberOfLines={1}>{item.appName}</Text>
                          <View style={styles.downloadInfoRight}>
                            {item.platform && (
                              <View style={styles.platformBadgeSmall}>
                                <Text style={styles.platformBadgeSmallText}>{item.platform}</Text>
                              </View>
                            )}
                            <Text style={styles.downloadTime}>
                              {t('downloads.timeRemaining', { time: item.timeRemaining })}
                              {' '}
                              {t('downloads.itemsRemaining', { count: 1, plural: '' })}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.progressBarContainer}>
                          <View style={styles.progressBarTrack}>
                            <View
                              style={[
                                styles.progressBarFill,
                                { width: `${Math.min(item.progress, 100)}%` },
                              ]}
                            />
                          </View>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('downloads.recentlyInstalled')}</Text>
            {completed.map((item, idx) => {
              const rowIndex = downloads.length + idx;
              const isFocused = focusedRow === rowIndex;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => setFocusedRow(rowIndex)}
                  style={[styles.completedRow, isFocused && styles.completedRowFocused]}
                >
                  {isFocused && <SpinningBorderSearch size={50} spread={1} borderRadius={2} />}
                  <View style={styles.completedIconWrap}>
                    {item.appCoverImage || item.appIcon ? (
                      <Image
                        source={item.appCoverImage || item.appIcon}
                        style={styles.completedIcon}
                        contentFit={item.appCoverImage ? 'cover' : 'contain'}
                      />
                    ) : (
                      <View style={[styles.completedIcon, styles.completedIconFallback]}>
                        <Ionicons name="game-controller" size={16} color="rgba(255,255,255,0.6)" />
                      </View>
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.completedTopRow}>
                      <Text style={styles.completedTitle} numberOfLines={1}>{item.appName}</Text>
                      <View style={styles.completedInfoRight}>
                        {item.platform && (
                          <View style={styles.platformBadgeSmall}>
                            <Text style={styles.platformBadgeSmallText}>{item.platform}</Text>
                          </View>
                        )}
                        <Text style={styles.completedStatus}>
                          {t('downloads.completed')} ({item.status === 'completed' ? 1 : 0} {t('downloads.itemsRemaining', { count: 1, plural: '' }).replace(/[()]/g, '')})
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footerHints}>
            <TouchableOpacity style={styles.hintItem} activeOpacity={0.7} onPress={activateFocusedRow}>
              <PSIcon char={PSIcons.cross} size={16} color="rgba(255,255,255,0.9)" />
              <Text style={styles.hintText}>{t('downloads.viewDetails')}</Text>
            </TouchableOpacity>
            <View style={styles.hintItem}>
              <PSIcon char={PSIcons.circle} size={16} color="rgba(255,255,255,0.9)" />
              <Text style={styles.hintText}>{t('downloads.back')}</Text>
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
    backgroundColor: 'rgba(18, 21, 26, 1)',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 0,
    paddingTop: 18,
    paddingHorizontal: 15,
    paddingBottom: 14,
  } as any,
  header: { marginBottom: 14 },
  headerTitle: { color: '#ffffffb9', fontSize: 18, fontFamily: 'SSTLight', letterSpacing: 0.2 },
  section: { marginBottom: 14 },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontFamily: 'SSTLight',
    marginBottom: 10,
    marginLeft: 4,
  },
  downloadCard: {
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0)',
    padding: 14,
    marginBottom: 10,
  },
  downloadCardFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  downloadCardInner: {
    flexDirection: 'row',
    gap: 12,
  },
  downloadIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 4,
    overflow: 'hidden',
  },
  downloadIcon: { width: '100%', height: '100%' },
  downloadIconFallback: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadMeta: { flex: 1, justifyContent: 'center' },
  downloadTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  downloadTitle: {
    color: '#ffffffce',
    fontSize: 16,
    fontFamily: 'SSTLight',
    flex: 1,
    marginRight: 8,
  },
  downloadInfoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadTime: {
    color: 'rgba(255, 255, 255, 0.67)',
    fontSize: 13,
    fontFamily: 'SSTLight',
  },
  platformBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  platformBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'SSTBold',
  },
  platformBadgeSmall: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  platformBadgeSmallText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'SSTBold',
  },
  progressBarContainer: { marginTop: 4 },
  progressBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  completedRowFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  completedIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 2,
    overflow: 'hidden',
  },
  completedIcon: { width: '100%', height: '100%' },
  completedIconFallback: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completedTitle: {
    color: '#ffffffce',
    fontSize: 15,
    fontFamily: 'SSTLight',
    flex: 1,
    marginRight: 8,
  },
  completedInfoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completedStatus: {
    color: 'rgba(255, 255, 255, 0.67)',
    fontSize: 13,
    fontFamily: 'SSTLight',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  detailHeaderTitle: {
    color: '#ffffffce',
    fontSize: 18,
    fontFamily: 'SSTLight',
    flex: 1,
  },
  detailBody: {
    flex: 1,
    paddingHorizontal: 4,
  },
  detailCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 16,
  },
  detailCardInner: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  detailIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 4,
    overflow: 'hidden',
  },
  detailIcon: { width: '100%', height: '100%' },
  detailIconFallback: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailMeta: { flex: 1, justifyContent: 'center' },
  detailTitle: {
    color: '#ffffffce',
    fontSize: 17,
    fontFamily: 'SSTLight',
    marginBottom: 6,
  },
  detailSubtitle: {
    color: 'rgba(255, 255, 255, 0.67)',
    fontSize: 14,
    fontFamily: 'SSTLight',
  },
  footerHints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  hintItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontFamily: 'SSTMedium' },
});
