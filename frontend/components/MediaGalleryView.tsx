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
  TextInput,
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

interface MediaGalleryViewProps {
  visible: boolean;
  onClose: () => void;
  capturePath?: string;
  wallpaperPath?: string;
}

const TABS = [
  { id: 'all', labelKey: 'mediaGallery.all' },
  { id: 'favorites', labelKey: 'mediaGallery.favorites' },
  { id: 'albums', labelKey: 'mediaGallery.albums' },
] as const;

type TabId = typeof TABS[number]['id'];

interface Album {
  name: string;
  items: string[];
}

type FocusArea = 'tabs' | 'grid' | 'selectBtn' | 'lightbox' | 'lightboxActions' | 'selectPanel';

const MediaGalleryTile = React.memo<{
  previewUri: string;
  isFocused: boolean;
  isSelected: boolean;
  isSelectMode: boolean;
  shouldLoad: boolean;
  tileWidth: number;
  tileHeight: number;
  onPress: () => void;
  onFocus: () => void;
}>(({ previewUri, isFocused, isSelected, isSelectMode, shouldLoad, tileWidth, tileHeight, onPress, onFocus }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => { setIsLoaded(false); }, [previewUri]);

  return (
    <View style={{ width: tileWidth, height: tileHeight, position: 'relative' }}>
      {isFocused && <SpinningBorderSearch size={tileWidth} spread={2} borderRadius={6} />}
      <TouchableOpacity
        style={[
          tileStyles.inner,
          isFocused && tileStyles.focused,
          isSelected && tileStyles.selected,
        ]}
        onPress={() => { onFocus(); onPress(); }}
        activeOpacity={0.92}
      >
        {shouldLoad ? (
          <>
            {!isLoaded && (
              <View style={tileStyles.placeholder}>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.55)" />
              </View>
            )}
            <Image
              source={{ uri: previewUri }}
              style={[tileStyles.image, !isLoaded && tileStyles.imageHidden]}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={previewUri}
              transition={120}
              onLoad={() => setIsLoaded(true)}
              onError={() => setIsLoaded(true)}
            />
            {isSelectMode && (
              <View style={tileStyles.checkbox}>
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={26}
                  color={isSelected ? '#4a90e2' : 'rgba(255,255,255,0.6)'}
                />
              </View>
            )}
          </>
        ) : (
          <View style={tileStyles.placeholder} />
        )}
      </TouchableOpacity>
    </View>
  );
});
MediaGalleryTile.displayName = 'MediaGalleryTile';

const tileStyles = StyleSheet.create({
  inner: { flex: 1, borderRadius: 6, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.05)' },
  focused: { borderColor: '#ffffff0a' },
  selected: { borderColor: 'rgba(74, 144, 226, 0.9)' },
  image: { width: '100%', height: '100%' },
  imageHidden: { opacity: 0 },
  placeholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  checkbox: { position: 'absolute', top: 8, left: 8 },
});

const loadPersisted = <T,>(key: string, fallback: T): T => {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};

const MediaGalleryView: React.FC<MediaGalleryViewProps> = ({ visible, onClose, capturePath, wallpaperPath }) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [focusArea, setFocusArea] = useState<FocusArea>('tabs');
  const [tabFocusIndex, setTabFocusIndex] = useState(0);
  const [gridFocusIndex, setGridFocusIndex] = useState(0);
  const [images, setImages] = useState<FolderImage[]>([]);
  const [loading, setLoading] = useState(false);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectPanelFocusIndex, setSelectPanelFocusIndex] = useState(0);

  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxActionFocus, setLightboxActionFocus] = useState(0);

  const [albums, setAlbums] = useState<Album[]>(() => loadPersisted<Album[]>('mediaGallery_albums', []));
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(loadPersisted<string[]>('mediaGallery_favorites', [])));
  const [albumModalVisible, setAlbumModalVisible] = useState(false);
  const [albumName, setAlbumName] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const focusAreaRef = useRef(focusArea);
  const tabFocusIndexRef = useRef(tabFocusIndex);
  const gridFocusIndexRef = useRef(gridFocusIndex);
  const imagesRef = useRef(images);
  const selectedItemsRef = useRef(selectedItems);
  const isSelectModeRef = useRef(isSelectMode);
  const lightboxVisibleRef = useRef(lightboxVisible);
  const lightboxIndexRef = useRef(lightboxIndex);
  const lightboxActionFocusRef = useRef(lightboxActionFocus);
  const selectPanelFocusIndexRef = useRef(selectPanelFocusIndex);
  const lastNavSoundRef = useRef(0);

  const [gridScrollY, setGridScrollY] = useState(0);
  const [gridViewportHeight, setGridViewportHeight] = useState(windowHeight);

  const scale = useMemo(() => Math.min(windowWidth / 1920, windowHeight / 1080), [windowWidth, windowHeight]);
  const s = (v: number) => Math.round(v * scale);
  const columns = windowWidth >= 1400 ? 3 : windowWidth >= 900 ? 2 : 1;
  const selectPanelWidth = s(320);
  const contentWidth = isSelectMode ? windowWidth - selectPanelWidth - s(20) : windowWidth;
  const tileWidth = (contentWidth - s(100) * 2 - s(20) * (columns - 1)) / columns;
  const tileHeight = s(320);
  const tileStrideY = tileHeight + s(20);

  focusAreaRef.current = focusArea;
  tabFocusIndexRef.current = tabFocusIndex;
  gridFocusIndexRef.current = gridFocusIndex;
  imagesRef.current = images;
  selectedItemsRef.current = selectedItems;
  isSelectModeRef.current = isSelectMode;
  lightboxVisibleRef.current = lightboxVisible;
  lightboxIndexRef.current = lightboxIndex;
  lightboxActionFocusRef.current = lightboxActionFocus;
  selectPanelFocusIndexRef.current = selectPanelFocusIndex;

  const playGridNavSound = useCallback(() => {
    const now = Date.now();
    if (now - lastNavSoundRef.current > 55) { lastNavSoundRef.current = now; soundService.playNavigation(); }
  }, []);

  const loadImages = useCallback(async () => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI) { setImages([]); return; }
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
        } catch { /* skip */ }
      }
      allImages.sort((a, b) => b.mtime - a.mtime);
      setImages(allImages);
      setGridFocusIndex(0);
      setFocusArea(allImages.length > 0 ? 'tabs' : 'tabs');
    } catch { setImages([]); } finally { setLoading(false); }
  }, [capturePath, wallpaperPath]);

  useEffect(() => {
    if (visible) {
      setActiveTab('all');
      setTabFocusIndex(0);
      setGridFocusIndex(0);
      setFocusArea('tabs');
      setSelectedItems(new Set());
      setIsSelectMode(false);
      setLightboxVisible(false);
    }
  }, [visible]);

  useEffect(() => { if (visible) loadImages(); }, [visible, loadImages]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('mediaGallery_favorites', JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('mediaGallery_albums', JSON.stringify(albums));
  }, [albums]);

  const filteredImages = useMemo(() => {
    if (activeTab === 'all') return images;
    if (activeTab === 'favorites') return images.filter(img => favorites.has(img.uri));
    return images;
  }, [images, activeTab, favorites]);

  const scrollToFocusedTile = useCallback((index: number) => {
    const row = Math.floor(index / columns);
    const targetY = Math.max(0, row * tileStrideY - s(40));
    scrollRef.current?.scrollTo({ y: targetY, animated: false });
  }, [columns, tileStrideY, s]);

  const handleGridScroll = useCallback((e: any) => setGridScrollY(e.nativeEvent.contentOffset.y), []);
  const handleGridLayout = useCallback((e: any) => setGridViewportHeight(e.nativeEvent.layout.height), []);

  const isRowVisible = useCallback((idx: number) => {
    const row = Math.floor(idx / columns);
    const rowTop = row * tileStrideY;
    const rowBottom = rowTop + tileHeight;
    const buffer = Math.max(gridViewportHeight, 1);
    return rowBottom >= gridScrollY - buffer && rowTop <= gridScrollY + gridViewportHeight + buffer;
  }, [columns, tileStrideY, tileHeight, gridScrollY, gridViewportHeight]);

  useEffect(() => { setGridScrollY(0); }, [filteredImages]);

  useEffect(() => {
    if (!visible || focusArea !== 'grid' || lightboxVisible || filteredImages.length === 0) return;
    scrollToFocusedTile(gridFocusIndex);
  }, [visible, focusArea, gridFocusIndex, filteredImages.length, scrollToFocusedTile, lightboxVisible]);

  const switchTab = useCallback((direction: -1 | 1) => {
    const currentIdx = TABS.findIndex(tb => tb.id === activeTab);
    const nextIdx = Math.max(0, Math.min(TABS.length - 1, currentIdx + direction));
    if (nextIdx !== currentIdx) { setActiveTab(TABS[nextIdx].id); setTabFocusIndex(nextIdx); setFocusArea('tabs'); soundService.playTab(); }
  }, [activeTab]);

  const toggleSelectItem = useCallback((uri: string) => {
    setSelectedItems(prev => { const next = new Set(prev); if (next.has(uri)) next.delete(uri); else next.add(uri); return next; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedItems.size === filteredImages.length) setSelectedItems(new Set());
    else setSelectedItems(new Set(filteredImages.map(img => img.uri)));
    soundService.playActivation();
  }, [selectedItems.size, filteredImages]);

  const toggleFavoriteSingle = useCallback((uri: string) => {
    setFavorites(prev => { const next = new Set(prev); if (next.has(uri)) next.delete(uri); else next.add(uri); return next; });
  }, []);

  const handleFavoriteSelected = useCallback(() => {
    setFavorites(prev => {
      const next = new Set(prev);
      let allFav = true;
      for (const uri of selectedItems) { if (!next.has(uri)) { allFav = false; break; } }
      for (const uri of selectedItems) { if (allFav) next.delete(uri); else next.add(uri); }
      return next;
    });
    soundService.playActivation();
  }, [selectedItems]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxVisible(true);
    setLightboxActionFocus(0);
    setFocusArea('lightbox');
    soundService.playActivation();
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxVisible(false);
    setFocusArea('grid');
    soundService.playBack();
  }, []);

  const confirmCreateAlbum = useCallback(() => {
    if (selectedItems.size > 0) {
      const newAlbum: Album = { name: albumName.trim() || t('mediaGallery.newAlbum'), items: Array.from(selectedItems) };
      setAlbums(prev => [...prev, newAlbum]);
      setSelectedItems(new Set());
      setIsSelectMode(false);
    }
    setAlbumModalVisible(false);
    setAlbumName('');
  }, [selectedItems, albumName, t]);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape'].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }

      const area = focusAreaRef.current;
      const isLB = lightboxVisibleRef.current;
      const isSel = isSelectModeRef.current;

      // ── Lightbox mode ──
      if (isLB) {
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') { soundService.playBack(); closeLightbox(); return; }

        if (area === 'lightbox') {
          if (e.key === 'ArrowLeft' || e.key === 'q' || e.key === 'Q') { playGridNavSound(); setLightboxIndex(prev => Math.max(0, prev - 1)); setLightboxActionFocus(0); return; }
          if (e.key === 'ArrowRight' || e.key === 'e' || e.key === 'E') { playGridNavSound(); setLightboxIndex(prev => Math.min(imagesRef.current.length - 1, prev + 1)); setLightboxActionFocus(0); return; }
          if (e.key === 'ArrowDown') { soundService.playNavigation(); setFocusArea('lightboxActions'); setLightboxActionFocus(0); return; }
        }

        if (area === 'lightboxActions') {
          if (e.key === 'ArrowRight') { soundService.playNavigation(); setLightboxActionFocus(prev => Math.min(prev + 1, 3)); return; }
          if (e.key === 'ArrowLeft') { soundService.playNavigation(); setLightboxActionFocus(prev => Math.max(prev - 1, 0)); return; }
          if (e.key === 'ArrowUp') { soundService.playNavigation(); setFocusArea('lightbox'); return; }
          if (e.key === 'Enter' || e.key === ' ') {
            soundService.playActivation();
            const lbImg = imagesRef.current[lightboxIndexRef.current];
            if (!lbImg) return;
            if (lightboxActionFocusRef.current === 0) { toggleFavoriteSingle(lbImg.uri); }
            else if (lightboxActionFocusRef.current === 2) { /* delete placeholder */ }
            return;
          }
        }
        return;
      }

      // ── Escape / Back ──
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        if (albumModalVisible) { setAlbumModalVisible(false); soundService.playBack(); return; }
        if (isSel) { setIsSelectMode(false); setSelectedItems(new Set()); setFocusArea('grid'); soundService.playBack(); return; }
        soundService.playBack();
        onClose();
        return;
      }

      // ── Select panel ──
      if (isSel && area === 'selectPanel') {
        const panelItems = 5;
        if (e.key === 'ArrowDown') { soundService.playNavigation(); setSelectPanelFocusIndex(prev => Math.min(prev + 1, panelItems - 1)); return; }
        if (e.key === 'ArrowUp') { soundService.playNavigation(); setSelectPanelFocusIndex(prev => Math.max(prev - 1, 0)); return; }
        if (e.key === 'ArrowLeft') { soundService.playNavigation(); setFocusArea('grid'); return; }
        if (e.key === 'Enter' || e.key === ' ') {
          soundService.playActivation();
          const idx = selectPanelFocusIndexRef.current;
          if (idx === 0) toggleSelectAll();
          else if (idx === 1) { setSelectedItems(new Set()); }
          else if (idx === 2) handleFavoriteSelected();
          else if (idx === 3) { if (selectedItems.size > 0) { setAlbumName(''); setAlbumModalVisible(true); } }
          else if (idx === 4) { setIsSelectMode(false); setSelectedItems(new Set()); setFocusArea('grid'); }
          return;
        }
        return;
      }

      // ── Tabs ──
      if (area === 'tabs') {
        if (e.key === 'ArrowRight') { soundService.playNavigation(); const next = Math.min(tabFocusIndexRef.current + 1, TABS.length - 1); tabFocusIndexRef.current = next; setTabFocusIndex(next); setActiveTab(TABS[next].id); }
        else if (e.key === 'ArrowLeft') { soundService.playNavigation(); const next = Math.max(tabFocusIndexRef.current - 1, 0); tabFocusIndexRef.current = next; setTabFocusIndex(next); setActiveTab(TABS[next].id); }
        else if (e.key === 'ArrowDown') { soundService.playNavigation(); setFocusArea('grid'); }
        else if (e.key === 'ArrowRight' && !isSel && tabFocusIndexRef.current === TABS.length - 1) { /* stay */ }
        return;
      }

      // ── Grid ──
      if (area === 'grid') {
        const filtered = imagesRef.current.filter(img => {
          const activeTabVal = TABS[tabFocusIndexRef.current]?.id || 'all';
          if (activeTabVal === 'favorites') return favorites.has(img.uri);
          return true;
        });
        if (filtered.length === 0) { if (e.key === 'ArrowUp') { soundService.playNavigation(); setFocusArea('tabs'); } return; }

        if (e.key === 'ArrowRight') { playGridNavSound(); setGridFocusIndex(prev => Math.min(prev + 1, filtered.length - 1)); }
        else if (e.key === 'ArrowLeft') { playGridNavSound(); setGridFocusIndex(prev => Math.max(prev - 1, 0)); }
        else if (e.key === 'ArrowDown') { playGridNavSound(); setGridFocusIndex(prev => Math.min(prev + columns, filtered.length - 1)); }
        else if (e.key === 'ArrowUp') {
          playGridNavSound();
          setGridFocusIndex(prev => {
            const next = prev - columns;
            if (next < 0) { setFocusArea('tabs'); return prev; }
            return next;
          });
        }
        else if (e.key === 'Enter' || e.key === ' ') {
          const img = filtered[gridFocusIndexRef.current];
          if (img) {
            if (isSel) { toggleSelectItem(img.uri); soundService.playActivation(); }
            else { openLightbox(gridFocusIndexRef.current); }
          }
        }
        else if ((e.key === 'm' || e.key === 'M') && isSel && selectedItemsRef.current.size > 0) {
          soundService.playActivation();
          setFocusArea('selectPanel');
          setSelectPanelFocusIndex(0);
        }
        else if (e.key === 's' || e.key === 'S') {
          if (!isSel) { setIsSelectMode(true); setFocusArea('grid'); soundService.playActivation(); }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    visible, columns, onClose, switchTab, playGridNavSound, filteredImages, favorites,
    toggleSelectItem, toggleSelectAll, handleFavoriteSelected, openLightbox, closeLightbox,
    toggleFavoriteSingle, isSelectMode, selectedItems, albumModalVisible,
  ]);

  const lightboxImage = filteredImages[lightboxIndex];

  const uiStyles = useMemo(() => StyleSheet.create({
    content: { flex: 1, paddingTop: s(48), paddingHorizontal: s(72), paddingBottom: s(40) },
    title: { color: '#FFF', fontSize: s(32), fontWeight: '300', fontFamily: 'SSTLight', marginBottom: s(36) },
    tabsRow: { flexDirection: 'row', alignItems: 'center', gap: s(12), marginBottom: s(90), marginLeft: s(40) },
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
    selectBtn: {
      position: 'absolute', left: s(20), top: s(160), width: s(48), height: s(48),
      borderRadius: s(24), backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 2, borderColor: 'transparent',
      alignItems: 'center', justifyContent: 'center', zIndex: 10, marginLeft: s(25), marginTop: s(190)
    },
    selectBtnFocused: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.18)' },
    selectBtnActive: { borderColor: '#4a90e2', backgroundColor: 'rgba(74,144,226,0.25)' },
    selectPanel: {
      width: selectPanelWidth, padding: s(24), paddingTop: s(48),
      backgroundColor: 'rgba(0,0,0,0.4)', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.1)',
    },
    selectPanelTitle: { color: '#FFF', fontSize: s(20), fontFamily: 'SSTBold', marginBottom: s(24) },
    selectPanelItem: {
      flexDirection: 'row', alignItems: 'center', gap: s(12), paddingVertical: s(14),
      paddingHorizontal: s(16), borderRadius: s(8), borderWidth: 1.5, borderColor: 'transparent', marginBottom: s(4),
    },
    selectPanelItemFocused: { borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.08)' },
    selectPanelText: { color: 'rgba(255,255,255,0.8)', fontFamily: 'SSTLight', fontSize: s(15) },
    selectPanelTextFocused: { color: '#fff', fontFamily: 'SSTBold' },
    selectPanelCount: { color: 'rgba(255,255,255,0.45)', fontFamily: 'SSTLight', fontSize: s(14), marginTop: s(16), marginBottom: s(16), paddingHorizontal: s(16) },
    footer: { position: 'absolute', bottom: s(28), right: s(72), flexDirection: 'row', alignItems: 'center', gap: s(8), zIndex: 3 },
    footerText: { color: 'rgba(255,255,255,1)', fontSize: s(20), fontFamily: 'SSTMedium' },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: s(2), paddingHorizontal: s(18), paddingVertical: s(10) },
    albumModalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
    albumModal: { width: s(420), backgroundColor: 'rgba(20,20,30,0.97)', borderRadius: s(16), borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', padding: s(28) },
    albumModalTitle: { color: '#fff', fontFamily: 'SSTBold', fontSize: s(20), marginBottom: s(20) },
    albumInput: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: s(8), borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', color: '#fff', fontFamily: 'SSTLight', fontSize: s(16), paddingHorizontal: s(16), paddingVertical: s(12), marginBottom: s(20) },
    albumModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: s(12) },
    albumModalBtn: { paddingHorizontal: s(20), paddingVertical: s(10), borderRadius: s(8) },
    albumModalBtnPrimary: { backgroundColor: 'rgba(74,144,226,0.9)' },
    albumModalBtnText: { color: '#fff', fontFamily: 'SSTMedium', fontSize: s(14) },
  }), [s, selectPanelWidth]);

  const selectPanelItems = useMemo(() => [
    { icon: selectedItems.size === filteredImages.length ? 'checkbox' : 'square-outline', labelKey: selectedItems.size === filteredImages.length ? 'mediaGallery.deselectAll' as const : 'mediaGallery.selectAll' as const, onPress: toggleSelectAll },
    { icon: 'close-circle-outline', labelKey: 'mediaGallery.deselectAll' as const, onPress: () => { setSelectedItems(new Set()); soundService.playActivation(); } },
    { icon: Array.from(selectedItems).every(uri => favorites.has(uri)) ? 'heart' : 'heart-outline', labelKey: 'mediaGallery.markFavorite' as const, onPress: handleFavoriteSelected },
    { icon: 'folder-open-outline', labelKey: 'mediaGallery.createAlbum' as const, onPress: () => { if (selectedItems.size > 0) { setAlbumName(''); setAlbumModalVisible(true); } } },
    { icon: 'close', labelKey: 'mediaGallery.cancel' as const, onPress: () => { setIsSelectMode(false); setSelectedItems(new Set()); setFocusArea('grid'); soundService.playBack(); } },
  ], [selectedItems, filteredImages, favorites, toggleSelectAll, handleFavoriteSelected]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { }}>
      <Animated.View style={rootStyles.root} entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
        <View style={rootStyles.backdropDim} />

        <Animated.View style={[rootStyles.content, uiStyles.content, isSelectMode && { paddingRight: s(72) + selectPanelWidth + s(20) }]} entering={FadeIn.delay(60).duration(240)}>
          <Text style={uiStyles.title}>{isSelectMode ? t('mediaGallery.selectTitle') : t('mediaGallery.title')}</Text>

          <View style={uiStyles.tabsRow}>
            {TABS.map((tab, idx) => {
              const isActive = activeTab === tab.id;
              const isFocused = focusArea === 'tabs' && tabFocusIndex === idx;
              return (
                <TouchableOpacity key={tab.id} style={[uiStyles.tab, isActive && uiStyles.tabActive, isFocused && uiStyles.tabFocused]} onPress={() => { setActiveTab(tab.id); setTabFocusIndex(idx); setFocusArea('tabs'); }} activeOpacity={0.8}>
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
          ) : filteredImages.length > 0 ? (
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: s(80) }} keyboardShouldPersistTaps="handled" onScroll={handleGridScroll} onLayout={handleGridLayout} scrollEventThrottle={50}>
              <View style={uiStyles.grid}>
                {filteredImages.map((img, idx) => (
                  <MediaGalleryTile
                    key={img.uri}
                    previewUri={img.thumbnail || img.uri}
                    isFocused={focusArea === 'grid' && gridFocusIndex === idx}
                    isSelected={selectedItems.has(img.uri)}
                    isSelectMode={isSelectMode}
                    shouldLoad={isRowVisible(idx)}
                    tileWidth={tileWidth}
                    tileHeight={tileHeight}
                    onFocus={() => { setGridFocusIndex(idx); setFocusArea('grid'); }}
                    onPress={() => {
                      if (isSelectMode) toggleSelectItem(img.uri);
                      else openLightbox(idx);
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

        {/* Select mode toggle button (left side) */}
        {!isSelectMode && !loading && filteredImages.length > 0 && (
          <TouchableOpacity
            style={[uiStyles.selectBtn, focusArea === 'selectBtn' && uiStyles.selectBtnFocused]}
            activeOpacity={0.8}
            onPress={() => { setIsSelectMode(true); setFocusArea('grid'); soundService.playActivation(); }}
          >
            <Ionicons name="checkmark-circle-outline" size={24} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        )}

        {/* Select panel (right side) */}
        {isSelectMode && (
          <View style={uiStyles.selectPanel}>
            <Text style={uiStyles.selectPanelTitle}>{t('mediaGallery.selectTitle')}</Text>
            <Text style={uiStyles.selectPanelCount}>{t('mediaGallery.selected', { count: selectedItems.size })}</Text>
            {selectPanelItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[uiStyles.selectPanelItem, focusArea === 'selectPanel' && selectPanelFocusIndex === idx && uiStyles.selectPanelItemFocused]}
                activeOpacity={0.8}
                onPress={item.onPress}
              >
                <Ionicons name={item.icon as any} size={20} color={focusArea === 'selectPanel' && selectPanelFocusIndex === idx ? '#fff' : 'rgba(255,255,255,0.7)'} />
                <Text style={[uiStyles.selectPanelText, focusArea === 'selectPanel' && selectPanelFocusIndex === idx && uiStyles.selectPanelTextFocused]}>
                  {t(item.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Lightbox */}
        {lightboxVisible && lightboxImage && (
          <Animated.View style={lightboxStyles.overlay} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
            <View style={lightboxStyles.imageContainer}>
              <Image source={{ uri: lightboxImage.uri }} style={lightboxStyles.image} contentFit="contain" cachePolicy="memory-disk" recyclingKey={lightboxImage.uri} />
            </View>
            <Text style={lightboxStyles.counter}>{lightboxIndex + 1}/{filteredImages.length}</Text>
            <View style={lightboxStyles.l1r1}>
              <View style={lightboxStyles.lrBadge}><Text style={lightboxStyles.lrText}>L1</Text></View>
            </View>
            <View style={lightboxStyles.l1r1Right}>
              <View style={lightboxStyles.lrBadge}><Text style={lightboxStyles.lrText}>R1</Text></View>
            </View>

            {focusArea === 'lightboxActions' && (
              <>
                <Animated.View style={lightboxStyles.topGradient} pointerEvents="none" entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} />
                <Animated.View style={lightboxStyles.bottomGradient} pointerEvents="none" entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} />
                <Animated.View style={lightboxStyles.actionBar} entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}>
                  {[
                    { icon: favorites.has(lightboxImage.uri) ? 'heart' : 'heart-outline', label: favorites.has(lightboxImage.uri) ? t('mediaGallery.unmarkFavorite') : t('mediaGallery.markFavorite') },
                    { icon: 'create-outline', label: '' },
                    { icon: 'trash-outline', label: t('mediaGallery.delete') },
                    { icon: 'ellipsis-horizontal', label: '' },
                  ].map((action, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[lightboxStyles.actionBtn, lightboxActionFocus === idx && lightboxStyles.actionBtnFocused]}
                      activeOpacity={0.8}
                      onPress={() => {
                        if (idx === 0) toggleFavoriteSingle(lightboxImage.uri);
                        soundService.playActivation();
                      }}
                    >
                      <Ionicons name={action.icon as any} size={28} color={lightboxActionFocus === idx ? '#fff' : 'rgba(255,255,255,0.8)'} />
                      {action.label ? <Text style={[lightboxStyles.actionLabel, lightboxActionFocus === idx && lightboxStyles.actionLabelFocused]}>{action.label}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </Animated.View>
              </>
            )}
          </Animated.View>
        )}

        {albumModalVisible && (
          <View style={uiStyles.albumModalOverlay}>
            <View style={uiStyles.albumModal}>
              <Text style={uiStyles.albumModalTitle}>{t('mediaGallery.newAlbum')}</Text>
              <TextInput style={uiStyles.albumInput} placeholder={t('mediaGallery.albumName')} placeholderTextColor="rgba(255,255,255,0.35)" value={albumName} onChangeText={setAlbumName} autoFocus />
              <View style={uiStyles.albumModalActions}>
                <TouchableOpacity style={uiStyles.albumModalBtn} onPress={() => { setAlbumModalVisible(false); setAlbumName(''); }}>
                  <Text style={uiStyles.albumModalBtnText}>{t('mediaGallery.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[uiStyles.albumModalBtn, uiStyles.albumModalBtnPrimary]} onPress={confirmCreateAlbum}>
                  <Text style={uiStyles.albumModalBtnText}>{t('mediaGallery.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={uiStyles.footer}>
          <View style={uiStyles.footerRow}>
            <PSIcon char={PSIcons.r1} size={22} color="#d3d3d3ff" />
            <Text style={uiStyles.footerText}>/</Text>
            <PSIcon char={PSIcons.l1} size={22} color="#d3d3d3ff" />
            <Text style={uiStyles.footerText}>{t('search.changeTabs')}</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

const rootStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07080cff' },
  backdropDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,8,12,0.85)' },
  content: { flex: 1, zIndex: 2 },
});

const lightboxStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.14)', zIndex: 50, justifyContent: 'center', alignItems: 'center' },
  imageContainer: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', padding: 40 },
  image: { width: '100%', height: '100%' },
  counter: { position: 'absolute', top: 40, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 18, fontFamily: 'SSTLight', zIndex: 51 },
  l1r1: { position: 'absolute', top: 40, left: 40, zIndex: 51 },
  l1r1Right: { position: 'absolute', top: 40, right: 40, zIndex: 51 },
  lrBadge: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  lrText: { color: '#fff', fontSize: 14, fontFamily: 'SSTBold' },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 220, zIndex: 49, backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.4) 40%, transparent)' } as any,
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 220, zIndex: 49, backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.45) 45%, transparent)' } as any,
  actionBar: { position: 'absolute', bottom: 50, left: 40, flexDirection: 'row', alignItems: 'center', gap: 20, zIndex: 51 },
  actionBtn: { alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: 'transparent' },
  actionBtnFocused: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.12)' },
  actionLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'SSTLight', marginTop: 4, textAlign: 'center' },
  actionLabelFocused: { color: '#fff', fontFamily: 'SSTBold' },
});

export default MediaGalleryView;
