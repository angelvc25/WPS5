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
import SpinningBorderSearch from './SpinningBorderSearch';

interface FolderImage {
  uri: string;
  thumbnail: string;
  name: string;
  mtime: number;
}

interface Album {
  name: string;
  items: string[];
}

interface BackgroundPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectBackground: (uri: string) => void;
  currentBackgroundUri?: string | null;
  backdropUri?: string | null;
  wallpaperPath?: string;
  capturePath?: string;
  initialTab?: 'all' | 'favorites' | 'albums' | 'slides';
  onSelectAlbum?: (albumName: string, items: string[]) => void;
}

const TABS = [
  { id: 'all', labelKey: 'mediaGallery.all' },
  { id: 'favorites', labelKey: 'mediaGallery.favorites' },
  { id: 'albums', labelKey: 'mediaGallery.albums' },
  { id: 'slides', labelKey: 'bg.slideshow' },
] as const;

type TabId = typeof TABS[number]['id'];

const loadPersisted = <T,>(key: string, fallback: T): T => {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

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
      {isFocused && <SpinningBorderSearch size={tileWidth} spread={1} borderRadius={6} />}
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

const BackgroundPickerModal: React.FC<BackgroundPickerModalProps> = ({
  visible,
  onClose,
  onSelectBackground,
  currentBackgroundUri,
  backdropUri,
  wallpaperPath,
  capturePath,
  initialTab = 'all',
  onSelectAlbum,
}) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [focusArea, setFocusArea] = useState<'tabs' | 'grid'>('grid');
  const [tabFocusIndex, setTabFocusIndex] = useState(0);
  const [gridFocusIndex, setGridFocusIndex] = useState(0);
  const [images, setImages] = useState<FolderImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [slideshowSelectedAlbum, setSlideshowSelectedAlbum] = useState<string | null>(null);

  // Estados de álbumes y favoritos sincronizados con MediaGalleryView
  const [albums] = useState<Album[]>(() => loadPersisted<Album[]>('mediaGallery_albums', []));
  const [favorites] = useState<Set<string>>(() => new Set(loadPersisted<string[]>('mediaGallery_favorites', [])));
  const [openAlbumIndex, setOpenAlbumIndex] = useState<number | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const focusAreaRef = useRef(focusArea);
  const tabFocusIndexRef = useRef(tabFocusIndex);
  const gridFocusIndexRef = useRef(gridFocusIndex);
  const imagesRef = useRef(images);
  const activeTabRef = useRef(activeTab);
  const albumsRef = useRef(albums);
  const openAlbumIndexRef = useRef(openAlbumIndex);
  const lastNavSoundRef = useRef(0);

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
  activeTabRef.current = activeTab;
  albumsRef.current = albums;
  openAlbumIndexRef.current = openAlbumIndex;

  const playGridNavSound = useCallback(() => {
    const now = Date.now();
    if (now - lastNavSoundRef.current > 55) {
      lastNavSoundRef.current = now;
      soundService.playNavigation();
    }
  }, []);

  // Carga simultánea de Capturas y Wallpapers (igual que en MediaGalleryView)
  const loadImages = useCallback(async () => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI) {
      setImages([]);
      return;
    }

    setLoading(true);
    setImages([]);
    try {
      const api = (window as any).electronAPI;
      const allImages: FolderImage[] = [];
      const folders: { path?: string; source: string }[] = [];

      if (capturePath) folders.push({ path: capturePath, source: 'capture' });
      if (wallpaperPath) folders.push({ path: wallpaperPath, source: 'wallpaper' });
      if (!capturePath && !wallpaperPath) {
        const dc = await api.getDefaultCaptureFolder?.();
        const dw = await api.getDefaultWallpaperFolder?.();
        if (dc) folders.push({ path: dc, source: 'capture' });
        if (dw) folders.push({ path: dw, source: 'wallpaper' });
      }

      for (const folder of folders) {
        if (!folder.path) continue;
        try {
          const result: FolderImage[] = await api.listFolderImages(folder.path);
          result.forEach(img => allImages.push({ ...img, name: `${folder.source}:${img.name}` }));
        } catch { /* ignorar carpetas no válidas */ }
      }

      allImages.sort((a, b) => b.mtime - a.mtime);
      setImages(allImages);
      setGridFocusIndex(0);
      setFocusArea(allImages.length > 0 ? 'grid' : 'tabs');
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [capturePath, wallpaperPath]);

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
      setTabFocusIndex(0);
      setGridFocusIndex(0);
      setFocusArea('grid');
      setOpenAlbumIndex(null);
      setSlideshowSelectedAlbum(null);
      loadImages();
    }
  }, [visible, loadImages, initialTab]);

  const filteredImages = useMemo(() => {
    if (activeTab === 'all') return images;
    if (activeTab === 'favorites') return images.filter(img => favorites.has(img.uri));
    if (activeTab === 'albums') {
      if (openAlbumIndex === null) return [];
      const album = albums[openAlbumIndex];
      if (!album) return [];
      const albumUris = new Set(album.items);
      return images.filter(img => albumUris.has(img.uri));
    }
    return images;
  }, [images, activeTab, favorites, albums, openAlbumIndex]);

  const isAlbumPickerActive = activeTab === 'slides';

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

  const isRowVisible = useCallback((idx: number) => {
    const row = Math.floor(idx / columns);
    const rowTop = row * tileStrideY;
    const rowBottom = rowTop + tileHeight;
    const buffer = Math.max(gridViewportHeight, 1);
    return rowBottom >= gridScrollY - buffer && rowTop <= gridScrollY + gridViewportHeight + buffer;
  }, [columns, tileStrideY, tileHeight, gridScrollY, gridViewportHeight]);

  useEffect(() => {
    setGridScrollY(0);
  }, [filteredImages]);

  useEffect(() => {
    if (!visible || focusArea !== 'grid' || filteredImages.length === 0) return;
    scrollToFocusedTile(gridFocusIndex);
  }, [visible, focusArea, gridFocusIndex, filteredImages.length, scrollToFocusedTile]);

  const switchTab = useCallback((direction: -1 | 1) => {
    const currentIdx = TABS.findIndex(t => t.id === activeTab);
    const nextIdx = Math.max(0, Math.min(TABS.length - 1, currentIdx + direction));
    if (nextIdx !== currentIdx) {
      setActiveTab(TABS[nextIdx].id);
      setTabFocusIndex(nextIdx);
      setFocusArea('tabs');
      setOpenAlbumIndex(null);
      setGridFocusIndex(0);
      soundService.playTab();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        if (activeTabRef.current === 'albums' && openAlbumIndexRef.current !== null) {
          setOpenAlbumIndex(null);
          setGridFocusIndex(0);
          setFocusArea('grid');
          soundService.playBack();
          return;
        }
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
          setFocusArea('grid');
        }
        return;
      }

      if (area === 'grid') {
        const isOverview = activeTabRef.current === 'albums' && openAlbumIndexRef.current === null;
        const isSlidesPicker = activeTabRef.current === 'slides';
        const itemCount = (isOverview || isSlidesPicker) ? albumsRef.current.length : filteredImages.length;

        if (itemCount === 0) {
          if (e.key === 'ArrowUp') {
            soundService.playNavigation();
            setFocusArea('tabs');
          }
          return;
        }

        if (e.key === 'ArrowRight') {
          playGridNavSound();
          setGridFocusIndex(prev => Math.min(prev + 1, itemCount - 1));
        } else if (e.key === 'ArrowLeft') {
          playGridNavSound();
          setGridFocusIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'ArrowDown') {
          playGridNavSound();
          setGridFocusIndex(prev => Math.min(prev + columns, itemCount - 1));
        } else if (e.key === 'ArrowUp') {
          playGridNavSound();
          setGridFocusIndex(prev => {
            const next = prev - columns;
            if (next < 0) {
              setFocusArea('tabs');
              return prev;
            }
            return next;
          });
        } else if (e.key === 'Enter' || e.key === ' ') {
          if (isOverview) {
            const albumIdx = gridFocusIndexRef.current;
            if (albumsRef.current[albumIdx]) {
              setOpenAlbumIndex(albumIdx);
              setGridFocusIndex(0);
              soundService.playActivation();
            }
          } else if (isSlidesPicker) {
            const albumIdx = gridFocusIndexRef.current;
            const album = albumsRef.current[albumIdx];
            if (album) {
              soundService.playActivation();
              onSelectAlbum?.(album.name, album.items);
              onClose();
            }
          } else {
            const selected = filteredImages[gridFocusIndexRef.current];
            if (selected) {
              soundService.playActivation();
              onSelectBackground(selected.uri);
              onClose();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, columns, onClose, switchTab, playGridNavSound, filteredImages, albums, onSelectBackground, onSelectAlbum]);

  const uiStyles = useMemo(() => StyleSheet.create({
    content: { flex: 1, paddingTop: s(48), paddingHorizontal: s(72), paddingBottom: s(40) },
    title: { color: '#FFF', fontSize: s(32), fontWeight: '300', fontFamily: 'SSTLight', marginBottom: s(36) },
    tabsRow: { flexDirection: 'row', alignItems: 'center', gap: s(12), marginBottom: s(30), marginLeft: s(40) },
    tab: { paddingHorizontal: s(18), paddingVertical: s(10), borderRadius: s(4), borderWidth: 2, borderColor: 'transparent' },
    tabActive: { borderColor: 'rgba(255, 255, 255, 0)', backgroundColor: 'rgba(255, 255, 255, 0)' },
    tabFocused: { borderColor: 'rgba(255, 255, 255, 0)', backgroundColor: 'rgba(255, 255, 255, 0)' },
    tabText: { color: 'rgba(255,255,255,0.55)', fontFamily: 'SSTLight', fontSize: s(20) },
    tabTextActive: { color: '#FFF', fontFamily: 'SSTLight' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: s(20), paddingTop: s(8), marginLeft: s(40) },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: s(80) },
    emptyText: { color: 'rgba(255,255,255,0.45)', fontSize: s(16), textAlign: 'center', maxWidth: s(480), lineHeight: s(24) },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: s(60), gap: s(16) },
    loadingText: { color: 'rgba(255,255,255,0.45)', fontSize: s(14), fontFamily: 'SSTLight' },
    footer: { position: 'absolute', bottom: s(28), right: s(72), flexDirection: 'row', alignItems: 'center', gap: s(8), zIndex: 3 },
    footerLeft: { position: 'absolute', bottom: s(28), left: s(72), flexDirection: 'row', alignItems: 'center', gap: s(16), zIndex: 3 },
    footerText: { color: 'rgba(255, 255, 255, 1)', fontSize: s(15), fontFamily: 'SSTMedium' },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0, 0, 0, 0.9)', borderRadius: s(2), paddingHorizontal: s(18), paddingVertical: s(10) },
    albumCard: { width: tileWidth, height: tileHeight, borderRadius: 6, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.05)', position: 'relative' },
    albumCardFocused: { borderColor: '#ffffff93' },
    albumCardInner: { flex: 1, justifyContent: 'flex-end' },
    albumCardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    albumCardPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
    albumCardOverlay: { backgroundColor: 'rgba(0,0,0,0.6)', padding: s(12), flexDirection: 'row', alignItems: 'center', gap: s(8) },
    albumCardName: { color: '#fff', fontFamily: 'SSTBold', fontSize: s(14), flex: 1 },
    albumCardCount: { color: 'rgba(255,255,255,0.6)', fontFamily: 'SSTLight', fontSize: s(12) },
  }), [s, tileWidth, tileHeight]);

  const isAlbumsOverview = activeTab === 'albums' && openAlbumIndex === null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={styles.root} entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
        {backdropUri && (
          <Image source={{ uri: backdropUri }} style={[styles.backdropImage, { opacity: 0.22 }]} contentFit="cover" />
        )}
        <View style={styles.backdropDim} />

        <Animated.View style={[styles.content, uiStyles.content]} entering={FadeIn.delay(60).duration(240)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12), marginBottom: s(8) }}>
            {activeTab === 'albums' && openAlbumIndex !== null && (
              <TouchableOpacity onPress={() => { setOpenAlbumIndex(null); setGridFocusIndex(0); soundService.playBack(); }} style={{ padding: s(8) }}>
                <Ionicons name="arrow-back" size={s(24)} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            )}
            <Text style={uiStyles.title}>
              {activeTab === 'albums' && openAlbumIndex !== null ? albums[openAlbumIndex]?.name || t('mediaGallery.albums') :
               activeTab === 'slides' ? t('bg.slideshow') : t('bg.change')}
            </Text>
          </View>

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
                    setOpenAlbumIndex(null);
                    setGridFocusIndex(0);
                  }}
                  activeOpacity={0.8}
                >
                  {isFocused && <SpinningBorderSearch size={s(180)} spread={1} borderRadius={0} />}
                  <Text style={[uiStyles.tabText, isActive && uiStyles.tabTextActive]}>{t(tab.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading ? (
            <View style={uiStyles.loadingWrap}>
              <ActivityIndicator size="large" color="#FFF" />
              <Text style={uiStyles.loadingText}>{t('bg.preparingThumbs')}</Text>
            </View>
          ) : isAlbumPickerActive ? (
            albums.length > 0 ? (
              <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: s(80) }} keyboardShouldPersistTaps="handled" onScroll={handleGridScroll} onLayout={handleGridLayout} scrollEventThrottle={50}>
                <View style={uiStyles.grid}>
                  {albums.map((album, idx) => {
                    const firstImg = images.find(img => album.items.includes(img.uri));
                    const previewUri = firstImg ? (firstImg.thumbnail || firstImg.uri) : '';
                    const isFocused = focusArea === 'grid' && gridFocusIndex === idx;
                    const isSelected = slideshowSelectedAlbum === album.name;
                    return (
                      <TouchableOpacity
                        key={album.name}
                        style={[uiStyles.albumCard, isFocused && uiStyles.albumCardFocused, isSelected && { borderColor: '#4CD964' }]}
                        activeOpacity={0.92}
                        onPress={() => {
                          setSlideshowSelectedAlbum(album.name);
                          soundService.playActivation();
                          onSelectAlbum?.(album.name, album.items);
                          onClose();
                        }}
                      >
                        {isFocused && <SpinningBorderSearch size={tileWidth} spread={1} borderRadius={6} />}
                        {isSelected && (
                          <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 5 }}>
                            <Ionicons name="checkmark-circle" size={s(24)} color="#4CD964" />
                          </View>
                        )}
                        <View style={uiStyles.albumCardInner}>
                          {previewUri ? (
                            <Image source={{ uri: previewUri }} style={uiStyles.albumCardImage} contentFit="cover" cachePolicy="memory-disk" />
                          ) : (
                            <View style={uiStyles.albumCardPlaceholder}>
                              <Ionicons name="folder-open-outline" size={s(48)} color="rgba(255,255,255,0.3)" />
                            </View>
                          )}
                          <View style={uiStyles.albumCardOverlay}>
                            <Ionicons name="folder" size={s(24)} color="rgba(255,255,255,0.9)" />
                            <Text style={uiStyles.albumCardName} numberOfLines={1}>{album.name}</Text>
                            <Text style={uiStyles.albumCardCount}>{album.items.length} {t('mediaGallery.all').toLowerCase()}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <View style={uiStyles.emptyState}>
                <Ionicons name="folder-open-outline" size={s(48)} color="rgba(255,255,255,0.25)" style={{ marginBottom: s(16) }} />
                <Text style={uiStyles.emptyText}>{t('mediaGallery.empty')}</Text>
              </View>
            )
          ) : isAlbumsOverview ? (
            albums.length > 0 ? (
              <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: s(80) }} keyboardShouldPersistTaps="handled" onScroll={handleGridScroll} onLayout={handleGridLayout} scrollEventThrottle={50}>
                <View style={uiStyles.grid}>
                  {albums.map((album, idx) => {
                    const firstImg = images.find(img => album.items.includes(img.uri));
                    const previewUri = firstImg ? (firstImg.thumbnail || firstImg.uri) : '';
                    const isFocused = focusArea === 'grid' && gridFocusIndex === idx;
                    return (
                      <TouchableOpacity
                        key={album.name}
                        style={[uiStyles.albumCard, isFocused && uiStyles.albumCardFocused]}
                        activeOpacity={0.92}
                        onPress={() => {
                          setGridFocusIndex(idx);
                          setFocusArea('grid');
                          setOpenAlbumIndex(idx);
                          setGridFocusIndex(0);
                          soundService.playActivation();
                        }}
                      >
                        {isFocused && <SpinningBorderSearch size={tileWidth} spread={1} borderRadius={6} />}
                        <View style={uiStyles.albumCardInner}>
                          {previewUri ? (
                            <Image source={{ uri: previewUri }} style={uiStyles.albumCardImage} contentFit="cover" cachePolicy="memory-disk" />
                          ) : (
                            <View style={uiStyles.albumCardPlaceholder}>
                              <Ionicons name="folder-open-outline" size={s(48)} color="rgba(255,255,255,0.3)" />
                            </View>
                          )}
                          <View style={uiStyles.albumCardOverlay}>
                            <Ionicons name="folder" size={s(24)} color="rgba(255,255,255,0.9)" />
                            <Text style={uiStyles.albumCardName} numberOfLines={1}>{album.name}</Text>
                            <Text style={uiStyles.albumCardCount}>{album.items.length} {t('mediaGallery.all').toLowerCase()}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <View style={uiStyles.emptyState}>
                <Ionicons name="folder-open-outline" size={s(48)} color="rgba(255,255,255,0.25)" style={{ marginBottom: s(16) }} />
                <Text style={uiStyles.emptyText}>{t('mediaGallery.empty')}</Text>
              </View>
            )
          ) : filteredImages.length > 0 ? (
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: s(80) }} keyboardShouldPersistTaps="handled" onScroll={handleGridScroll} onLayout={handleGridLayout} scrollEventThrottle={50}>
              <View style={uiStyles.grid}>
                {filteredImages.map((img, idx) => (
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
              <Text style={uiStyles.emptyText}>{t('mediaGallery.empty')}</Text>
            </View>
          )}
        </Animated.View>

        <View style={uiStyles.footerLeft}>
          <View style={uiStyles.footerRow}>
            <PSIcon char={PSIcons.dpadUp} size={22} color='#d3d3d3ff' />
            <PSIcon char={PSIcons.dpadDown} size={22} color='#d3d3d3ff' />
            <PSIcon char={PSIcons.dpadLeft} size={22} color='#d3d3d3ff' />
            <PSIcon char={PSIcons.dpadRight} size={22} color='#d3d3d3ff' />
            <Text style={uiStyles.footerText}>{t('common.navigate')}</Text>
            <PSIcon char={PSIcons.cross} size={22} color='#d3d3d3ff' />
            <Text style={uiStyles.footerText}>{t('common.select')}</Text>
          </View>
        </View>

        <View style={uiStyles.footer}>
          <View style={uiStyles.footerRow}>
            <PSIcon char={PSIcons.r1} size={22} color='#d3d3d3ff' />
            <Text style={uiStyles.footerText}>/</Text>
            <PSIcon char={PSIcons.l1} size={22} color='#d3d3d3ff' />
            <Text style={uiStyles.footerText}>{t('search.changeTabs')}</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07080cff' },
  backdropImage: { ...StyleSheet.absoluteFillObject },
  backdropDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7, 8, 12, 0.12)' },
  content: { flex: 1, zIndex: 2 },
  tileInner: { flex: 1, borderRadius: 6, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.05)' },
  tileFocused: { borderColor: '#ffffff0c' },
  tileSelected: { borderColor: 'rgba(255,255,255,0.45)' },
  tileImage: { width: '100%', height: '100%' },
  tileImageHidden: { opacity: 0 },
  tilePlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  gifBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0, 0, 0, 0.72)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)' },
  gifBadgeText: { color: '#FFF', fontSize: 15, fontFamily: 'SSTLight', letterSpacing: 0.3 },
});

export default BackgroundPickerModal;