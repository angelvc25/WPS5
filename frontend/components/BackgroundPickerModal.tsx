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
  { id: 'playstation', label: 'De PlayStation' },
  { id: 'games', label: 'Juegos' },
  { id: 'gallery', label: 'Galería multimedia' },
  { id: 'slideshow', label: 'Diapositivas' },
] as const;

type TabId = typeof TABS[number]['id'];

interface BackgroundTileProps {
  previewUri: string;
  isFocused: boolean;
  isSelected: boolean;
  shouldLoad: boolean;
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
  tileWidth,
  tileHeight,
  onPress,
  onFocus,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

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
      paddingHorizontal: s(92),
      paddingBottom: s(40),
    },
    title: {
      color: '#FFF',
      fontSize: s(28),
      fontWeight: '300',
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
      fontSize: s(15),
      fontWeight: '400',
    },
    tabTextActive: {
      color: '#FFF',
    },
    sortRow: {
      position: 'absolute',
      top: s(48 + 28 + 24 + 10),
      right: s(72),
    },
    sortText: {
      color: 'rgba(255,255,255,0.45)',
      fontSize: s(13),
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
      color: 'rgba(255,255,255,0.55)',
      fontSize: s(13),
    },
    footerKey: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: s(13),
      fontWeight: '600',
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
    },
  }), [s]);

  const emptyMessages: Record<TabId, string> = {
    playstation: wallpaperPath
      ? 'No hay imágenes en la carpeta configurada de fondos de PlayStation.'
      : 'No hay fondos disponibles. Configura una carpeta en Ajustes → Inicio → Carpeta de Fondos, o añade imágenes a la carpeta predeterminada.',
    games: 'Los fondos de juegos estarán disponibles próximamente.',
    gallery: 'No hay capturas en la carpeta de capturas. Configúrala en Ajustes → Inicio.',
    slideshow: 'Las diapositivas estarán disponibles próximamente.',
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
          <Text style={uiStyles.title}>Cambiar fondo</Text>

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
            >
              <View style={uiStyles.grid}>
                {images.map((img, idx) => (
                  <BackgroundTile
                    key={img.uri}
                    previewUri={img.thumbnail || img.uri}
                    isFocused={focusArea === 'grid' && gridFocusIndex === idx}
                    isSelected={currentBackgroundUri === img.uri}
                    shouldLoad={true}
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
          <Text style={uiStyles.footerKey}>↑↓←→</Text>
          <Text style={uiStyles.footerText}>Navegar</Text>
          <Text style={uiStyles.footerKey}>Enter</Text>
          <Text style={uiStyles.footerText}>Seleccionar</Text>
        </View>

        <View style={uiStyles.footer}>
          <Text style={uiStyles.footerKey}>[L1]</Text>
          <Text style={uiStyles.footerText}>/</Text>
          <Text style={uiStyles.footerKey}>[R1]</Text>
          <Text style={uiStyles.footerText}>Cambiar pestañas</Text>
        </View>
      </Animated.View>
    </Modal>
  );
};

export default BackgroundPickerModal;
