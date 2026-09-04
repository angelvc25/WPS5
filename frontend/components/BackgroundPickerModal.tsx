import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { soundService } from '@/services/soundService';
import { useTranslation } from '@/contexts/LanguageContext';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';

interface FolderImage {
  uri: string;
  thumbnail: string;
  name: string;
  mtime: number;
}

interface BackgroundPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectBackground: (uri: string) => void;
  currentBackgroundUri?: string | null;
  backdropUri?: string | null;
  wallpaperPath?: string;
  capturePath?: string;
}

const TABS = [
  { id: 'playstation', label: 'From PlayStation' },
  { id: 'games', label: 'Games' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'slideshow', label: 'Slideshow' },
] as const;

type TabId = typeof TABS[number]['id'];

interface BackgroundTileProps {
  previewUri: string;
  isFocused: boolean;
  isSelected: boolean;
  shouldLoad: boolean;
  isGif: boolean;
  tileWidth: number;
  tileHeight: number;
  onPress: () => void;
  onFocus: () => void;
}

const BackgroundTile = React.memo<BackgroundTileProps>(({
  previewUri,
  isFocused,
  isSelected,
  shouldLoad,
  isGif,
  tileWidth,
  tileHeight,
  onPress,
  onFocus,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    setIsLoaded(false);
  }, [previewUri]);

  return (
    <View style={{ width: tileWidth, height: tileHeight }}>
      <TouchableOpacity
        style={[
          styles.tileInner,
          isFocused && styles.tileFocused,
          isSelected && !isFocused && styles.tileSelected,
        ]}
        onPress={() => {
          onFocus();
          onPress();
        }}
        activeOpacity={0.92}
      >
        {shouldLoad ? (
          <>
            {!isLoaded && (
              <View style={styles.tilePlaceholder}>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.55)" />
              </View>
            )}
            <Image
              source={{ uri: previewUri }}
              style={[styles.tileImage, !isLoaded && styles.tileImageHidden]}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={previewUri}
              transition={120}
              onLoad={() => setIsLoaded(true)}
              onError={() => setIsLoaded(true)}
            />
            {isGif && isLoaded && (
              <View style={styles.gifBadge}>
                <Text style={styles.gifBadgeText}>{t('bg.animated')}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.tilePlaceholder} />
        )}
      </TouchableOpacity>
    </View>
  );
});

BackgroundTile.displayName = 'BackgroundTile';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07080cff',
  },
  backdropImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 8, 12, 0.12)',
  },
  content: {
    flex: 1,
    zIndex: 2,
  },
  tileInner: {
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tileFocused: {
    borderColor: '#ffffff93',
  },
  tileSelected: {
    borderColor: 'rgba(255,255,255,0.45)',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileImageHidden: {
    opacity: 0,
  },
  tilePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  gifBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  gifBadgeText: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTLight',
    letterSpacing: 0.3,
  }
});


const BackgroundPickerModal: React.FC<BackgroundPickerModalProps> = ({
  visible,
  onClose,
  onSelectBackground,
  currentBackgroundUri,
  backdropUri,
  wallpaperPath,
  capturePath,
}) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<TabId>('playstation');
  const [focusArea, setFocusArea] = useState<'tabs' | 'grid'>('grid');
  const [tabFocusIndex, setTabFocusIndex] = useState(0);
  const [gridFocusIndex, setGridFocusIndex] = useState(0);
  const [images, setImages] = useState<FolderImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedWallpaperFolder, setResolvedWallpaperFolder] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const focusAreaRef = useRef(focusArea);
  const tabFocusIndexRef = useRef(tabFocusIndex);
  const gridFocusIndexRef = useRef(gridFocusIndex);
  const imagesRef = useRef(images);
  const lastNavSoundRef = useRef(0);
  const { t } = useTranslation();

  // Tracks the visible window of the grid ScrollView so we only mount/load
  // thumbnails for rows that are actually on screen (plus a small buffer),
  // instead of loading every image in the folder at once.
  const [gridScrollY, setGridScrollY] = useState(0);
  const [gridViewportHeight, setGridViewportHeight] = useState(windowHeight);

  const scale = useMemo(() => Math.min(windowWidth / 1920, windowHeight / 1080), [windowWidth, windowHeight]);
  const s = (v: number) => Math.round(v * scale);
  const columns = windowWidth >= 1400 ? 3 : windowWidth >= 900 ? 2 : 1;
  const tileWidth = (windowWidth - s(100) * 2 - s(20) * (columns - 1)) / columns;
  const tileHeight = s(320);
  const tileStrideY = tileHeight + s(20);

  focusAreaRef.current = focusArea;
  tabFocusIndexRef.current = tabFocusIndex;
  gridFocusIndexRef.current = gridFocusIndex;
  imagesRef.current = images;

  const playGridNavSound = useCallback(() => {
    const now = Date.now();
    if (now - lastNavSoundRef.current > 55) {
      lastNavSoundRef.current = now;
      soundService.playNavigation();
    }
  }, []);

  const loadImages = useCallback(async (tab: TabId) => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI) {
      setImages([]);
      return;
    }

    setLoading(true);
    setImages([]);
    try {
      const api = (window as any).electronAPI;
      let folder: string | null = null;

      if (tab === 'playstation') {
        folder = wallpaperPath || resolvedWallpaperFolder || await api.getDefaultWallpaperFolder?.();
        if (!resolvedWallpaperFolder && folder) setResolvedWallpaperFolder(folder);
      } else if (tab === 'gallery') {
        folder = capturePath || await api.getDefaultCaptureFolder?.();
      } else {
        setImages([]);
        return;
      }

      if (!folder) {
        setImages([]);
        return;
      }

      const result: FolderImage[] = await api.listFolderImages(folder);
      setImages(result);
      setGridFocusIndex(0);
      setFocusArea(result.length > 0 ? 'grid' : 'tabs');
    } catch (err) {
      console.error('Error loading background images:', err);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [wallpaperPath, capturePath, resolvedWallpaperFolder]);

  useEffect(() => {
    if (visible) {
      setActiveTab('playstation');
      setTabFocusIndex(0);
      setGridFocusIndex(0);
      setFocusArea('grid');
    }
  }, [visible]);

  useEffect(() => {
    if (visible) loadImages(activeTab);
  }, [visible, activeTab, loadImages]);

  const scrollToFocusedTile = useCallback((index: number) => {
    const row = Math.floor(index / columns);
    const targetY = Math.max(0, row * tileStrideY - s(40));
    scrollRef.current?.scrollTo({ y: targetY, animated: false });
  }, [columns, tileStrideY, s]);

  const handleGridScroll = useCallback((e: any) => {
    setGridScrollY(e.nativeEvent.contentOffset.y);
  }, []);

  const handleGridLayout = useCallback((e: any) => {
    setGridViewportHeight(e.nativeEvent.layout.height);
  }, []);

  // A tile "should load" its image if its row falls inside the visible
  // viewport, extended by one extra screen above and below (buffer) so
  // scrolling stays smooth instead of popping placeholders in at the edge.
  const isRowVisible = useCallback((idx: number) => {
    const row = Math.floor(idx / columns);
    const rowTop = row * tileStrideY;
    const rowBottom = rowTop + tileHeight;
    const buffer = Math.max(gridViewportHeight, 1);
    const viewTop = gridScrollY - buffer;
    const viewBottom = gridScrollY + gridViewportHeight + buffer;
    return rowBottom >= viewTop && rowTop <= viewBottom;
  }, [columns, tileStrideY, tileHeight, gridScrollY, gridViewportHeight]);

  useEffect(() => {
    // Reset the tracked scroll position whenever a new set of images loads
    // (tab switch, folder change, etc.) so visibility is recalculated from
    // the top instead of keeping a stale offset from the previous list.
    setGridScrollY(0);
  }, [images]);

  useEffect(() => {
    if (!visible || focusArea !== 'grid' || images.length === 0) return;
    scrollToFocusedTile(gridFocusIndex);
  }, [visible, focusArea, gridFocusIndex, images.length, scrollToFocusedTile]);

  const switchTab = useCallback((direction: -1 | 1) => {
    const currentIdx = TABS.findIndex(t => t.id === activeTab);
    const nextIdx = Math.max(0, Math.min(TABS.length - 1, currentIdx + direction));
    if (nextIdx !== currentIdx) {
      setActiveTab(TABS[nextIdx].id);
      setTabFocusIndex(nextIdx);
      setFocusArea('tabs');
      soundService.playTab();
    }
  }, [activeTab]);

  const selectFocusedImage = useCallback(() => {
    const selected = imagesRef.current[gridFocusIndexRef.current];
    if (selected) {
      onSelectBackground(selected.uri);
      onClose();
    }
  }, [onSelectBackground, onClose]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        soundService.playBack();
        onClose();
        return;
      }

      if (e.key === 'PageUp' || e.key === 'q' || e.key === 'Q') {
        switchTab(-1);
        return;
      }
      if (e.key === 'PageDown' || e.key === 'e' || e.key === 'E') {
        switchTab(1);
        return;
      }

      const currentImages = imagesRef.current;
      const area = focusAreaRef.current;

      if (area === 'tabs') {
        if (e.key === 'ArrowRight') {
          soundService.playNavigation();
          const next = Math.min(tabFocusIndexRef.current + 1, TABS.length - 1);
          tabFocusIndexRef.current = next;
          setTabFocusIndex(next);
          setActiveTab(TABS[next].id);
        } else if (e.key === 'ArrowLeft') {
          soundService.playNavigation();
          const next = Math.max(tabFocusIndexRef.current - 1, 0);
          tabFocusIndexRef.current = next;
          setTabFocusIndex(next);
          setActiveTab(TABS[next].id);
        } else if (e.key === 'ArrowDown') {
          soundService.playNavigation();
          if (currentImages.length > 0) {
            focusAreaRef.current = 'grid';
            setFocusArea('grid');
          }
        } else if (e.key === 'Enter' || e.key === ' ') {
          soundService.playActivation();
          if (currentImages.length > 0) {
            focusAreaRef.current = 'grid';
            setFocusArea('grid');
          }
        }
        return;
      }

      if (area === 'grid') {
        if (currentImages.length === 0) {
          if (e.key === 'ArrowUp') {
            soundService.playNavigation();
            focusAreaRef.current = 'tabs';
            setFocusArea('tabs');
          }
          return;
        }

        if (e.key === 'ArrowRight') {
          playGridNavSound();
          setGridFocusIndex(prev => {
            const next = Math.min(prev + 1, currentImages.length - 1);
            gridFocusIndexRef.current = next;
            return next;
          });
        } else if (e.key === 'ArrowLeft') {
          playGridNavSound();
          setGridFocusIndex(prev => {
            const next = Math.max(prev - 1, 0);
            gridFocusIndexRef.current = next;
            return next;
          });
        } else if (e.key === 'ArrowDown') {
          playGridNavSound();
          setGridFocusIndex(prev => {
            const next = Math.min(prev + columns, currentImages.length - 1);
            gridFocusIndexRef.current = next;
            return next;
          });
        } else if (e.key === 'ArrowUp') {
          playGridNavSound();
          setGridFocusIndex(prev => {
            const next = prev - columns;
            if (next < 0) {
              focusAreaRef.current = 'tabs';
              setFocusArea('tabs');
              return prev;
            }
            gridFocusIndexRef.current = next;
            return next;
          });
        } else if (e.key === 'Enter' || e.key === ' ') {
          soundService.playActivation();
          selectFocusedImage();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, columns, onClose, switchTab, selectFocusedImage, playGridNavSound]);

  const uiStyles = useMemo(() => StyleSheet.create({
    content: {
      flex: 1,
      paddingTop: s(48),
      paddingHorizontal: s(100),
      paddingBottom: s(40),
    },
    title: {
      color: '#FFF',
      fontSize: s(28),
      fontWeight: '300',
      fontFamily: 'SSTLight',
      marginLeft: s(-50),
      marginBottom: s(44),
    },
    tabsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(12),
      marginBottom: s(30),
    },
    tab: {
      paddingHorizontal: s(18),
      paddingVertical: s(10),
      borderRadius: s(22),
      borderWidth: 2,
      borderColor: 'transparent',
    },
    tabActive: {
      borderColor: 'rgba(255,255,255,0.85)',
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    tabFocused: {
      borderColor: '#FFF',
      backgroundColor: 'rgba(255,255,255,0.15)',
    },
    tabText: {
      color: 'rgba(255,255,255,0.55)',
      fontFamily: 'SSTLight',
      fontSize: s(15),
      fontWeight: '400',
    },
    tabTextActive: {
      color: '#FFF',
      fontFamily: 'SSTBold',
    },
    sortRow: {
      position: 'absolute',
      top: s(48 + 28 + 24 + 10),
      right: s(72),
    },
    sortText: {
      color: 'rgba(255,255,255,0.45)',
      fontSize: s(13),
      fontFamily: 'SSTLight',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: s(16),
      paddingTop: s(8),
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: s(80),
    },
    emptyText: {
      color: 'rgba(255,255,255,0.45)',
      fontSize: s(16),
      textAlign: 'center',
      maxWidth: s(480),
      lineHeight: s(24),
    },
    footer: {
      position: 'absolute',
      bottom: s(28),
      right: s(72),
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
      zIndex: 3,
    },
    footerLeft: {
      position: 'absolute',
      bottom: s(28),
      left: s(72),
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(16),
      zIndex: 3,
    },
    footerText: {
      color: 'rgba(255, 255, 255, 1)',
      fontSize: s(15),
      fontFamily: 'SSTMedium',
    },
    footerKey: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: s(15),
      fontFamily: 'SSTBold',
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: s(60),
      gap: s(16),
    },
    loadingText: {
      color: 'rgba(255,255,255,0.45)',
      fontSize: s(14),
      fontFamily: 'SSTLight',
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      borderRadius: s(2),
      paddingHorizontal: s(18),
      paddingVertical: s(10),
    },
  }), [s]);

  const emptyMessages: Record<TabId, string> = {
    playstation: wallpaperPath
      ? t('bg.emptyPsFolder')
      : t('bg.emptyWallpapers'),
    games: t('bg.emptyGames'),
    gallery: t('bg.emptyGallery'),
    slideshow: t('bg.emptySlideshow'),
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={styles.root} entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
        {backdropUri ? (
          <Image
            source={{ uri: backdropUri }}
            style={[styles.backdropImage, { opacity: 0.22 }]}
            contentFit="cover"
          />
        ) : null}
        <View style={styles.backdropDim} />

        <Animated.View style={[styles.content, uiStyles.content]} entering={FadeIn.delay(60).duration(240)}>
          <Text style={uiStyles.title}>{t('bg.change')}</Text>

          <View style={uiStyles.tabsRow}>
            {TABS.map((tab, idx) => {
              const isActive = activeTab === tab.id;
              const isFocused = focusArea === 'tabs' && tabFocusIndex === idx;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[uiStyles.tab, isActive && uiStyles.tabActive, isFocused && uiStyles.tabFocused]}
                  onPress={() => {
                    setActiveTab(tab.id);
                    setTabFocusIndex(idx);
                    setFocusArea('tabs');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[uiStyles.tabText, isActive && uiStyles.tabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={uiStyles.sortRow}>
            <Text style={uiStyles.sortText}>Ordenar por: Fecha en que se agregó (nuevo - antiguo)</Text>
          </View>

          {loading ? (
            <View style={uiStyles.loadingWrap}>
              <ActivityIndicator size="large" color="#FFF" />
              <Text style={uiStyles.loadingText}>Preparando miniaturas…</Text>
            </View>
          ) : images.length > 0 ? (
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: s(80) }}
              keyboardShouldPersistTaps="handled"
              onScroll={handleGridScroll}
              onLayout={handleGridLayout}
              scrollEventThrottle={50}
            >
              <View style={uiStyles.grid}>
                {images.map((img, idx) => (
                  <BackgroundTile
                    key={img.uri}
                    previewUri={img.thumbnail || img.uri}
                    isFocused={focusArea === 'grid' && gridFocusIndex === idx}
                    isSelected={currentBackgroundUri === img.uri}
                    shouldLoad={isRowVisible(idx)}
                    isGif={/\.gif(\?.*)?$/i.test(img.name || img.uri)}
                    tileWidth={tileWidth}
                    tileHeight={tileHeight}
                    onFocus={() => {
                      setGridFocusIndex(idx);
                      setFocusArea('grid');
                    }}
                    onPress={() => {
                      onSelectBackground(img.uri);
                      onClose();
                    }}
                  />
                ))}
              </View>
            </ScrollView>
          ) : (
            <View style={uiStyles.emptyState}>
              <Ionicons name="images-outline" size={s(48)} color="rgba(255,255,255,0.25)" style={{ marginBottom: s(16) }} />
              <Text style={uiStyles.emptyText}>{emptyMessages[activeTab]}</Text>
            </View>
          )}
        </Animated.View>

        <View style={uiStyles.footerLeft}>
          <View style={uiStyles.footerRow}>
            <PSIcon
              char={PSIcons.dpadUp}
              size={22}
              color='#d3d3d3ff'
            />
            <PSIcon
              char={PSIcons.dpadDown}
              size={22}
              color='#d3d3d3ff'
            />
            <PSIcon
              char={PSIcons.dpadLeft}
              size={22}
              color='#d3d3d3ff'
            />
            <PSIcon
              char={PSIcons.dpadRight}
              size={22}
              color='#d3d3d3ff'
            />
            <Text style={uiStyles.footerText}>{t('common.navigate')}</Text>
            <PSIcon
              char={PSIcons.cross}
              size={22}
              color='#d3d3d3ff'
            />
            <Text style={uiStyles.footerText}>{t('common.select')}</Text>
          </View>
        </View>

        <View style={uiStyles.footer}>
          <View style={uiStyles.footerRow}>
            <PSIcon
              char={PSIcons.r1}
              size={22}
              color='#d3d3d3ff'
            />
            <Text style={uiStyles.footerText}>/</Text>
            <PSIcon
              char={PSIcons.l1}
              size={22}
              color='#d3d3d3ff'
            />
            <Text style={uiStyles.footerText}>{t('search.changeTabs')}</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

export default BackgroundPickerModal;