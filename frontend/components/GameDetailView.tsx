import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform, TextInput, ScrollView, useWindowDimensions, Linking } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Video, ResizeMode } from './AppVideo';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, FadeIn, FadeInDown } from 'react-native-reanimated';
import { ConsoleItem } from '../app/(tabs)/index';
import YoutubePlayer from './YoutubePlayer';
import ControlPrompt from './ControlPrompt';
import GameInfoPanel from './GameInfoPanel';
import DeleteConfirmView from './DeleteConfirmView';
import { useUser } from '../contexts/UserContext';
import { fetchSteamNewsByName, SteamNewsItem } from '../services/steamNewsService';
import { resolveGameScreenshots, SteamMediaItem } from '../services/steamMediaService';
import { fetchSteamGridAssets as fetchSteamGridAssetsService, fetchSteamGridData as fetchSteamGridDataService } from '../services/steamGridService';
import { fetchRawgGameData, fetchRawgMediaByName, mapRawgScreenshotsToMedia } from '../services/rawgService';
import { searchPsnGames, psnLocaleForLanguage, isPsnEligiblePlatform } from '../services/psnMetadataService';
import { fetchGameVideosByName } from '../services/gameVideoService';
import { soundService } from '../services/soundService';
import { fetchSteamDescription, isPlaytimePlaceholder } from '../services/steamDescriptionService';
import { resolveFieldSyncPreferences } from '../services/metadataPreferences';
import {
  fetchIgdbFieldData,
  fetchPsnFieldData,
  fetchRawgFieldData,
  fetchSteamFieldData,
  type SourceFieldData,
} from '../services/metadataFields';
import { getSteamLaunchPath, isSteamGame, getSteamAppId, resolveLaunchPath, resolveSteamLaunchPath } from '../services/steamLaunchService';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';
import { PLATFORMS, PLATFORM_IDS } from '@/constants/platforms';
import { useTranslation } from '@/contexts/LanguageContext';
import BackgroundVideo from './BackgroundVideo';
import { toastService } from '@/services/toastService';


interface GameDetailViewProps {
  isVisible: boolean;
  item: ConsoleItem | null;
  onClose: () => void;
  onLaunch?: (id: string, path: string, launchArgs?: string) => void;
  onRefresh?: (updatedGame?: Partial<ConsoleItem>) => void;
  isLaunching?: boolean;
  inputMode: 'keyboard' | 'gamepad';
  installedSteamAppIds?: Set<string> | null;
  onOpenMediaGallery?: () => void;
}

// Normaliza un string de path/url de editData a un source { uri } válido.
// Maneja: http(s) URLs, paths locales con o sin prefijo local-file://.
const resolveEditSource = (val: string | undefined): { uri: string } | null => {
  if (!val) return null;
  if (val.startsWith('http')) return { uri: val };
  // Quitar cualquier variante de local-file:// que ya venga en el string
  const clean = val.replace(/^local-file:\/+/, '');
  // Reconstruir siempre con local-file:///
  return { uri: `local-file:///${clean}` };
};

const GameDetailView: React.FC<GameDetailViewProps> = ({ isVisible, item, onClose, onLaunch, onRefresh, isLaunching, inputMode, installedSteamAppIds = null, onOpenMediaGallery }) => {
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [editData, setEditData] = useState<Partial<ConsoleItem>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0); // 0:Jugar, 1:···, 2:Trofeos, 3:Amigos, 100+:Media, 200+:Logros, 4+:Noticias
  const prevFocusIndexRef = React.useRef(0);
  const [achievementCount, setAchievementCount] = useState(0);
  const bottomScrollRef = useRef<ScrollView>(null);
  const [editModalFocusIndex, setEditModalFocusIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'basic' | 'path' | 'art'>('basic');
  const { activeUser } = useUser();
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);

  // States for SteamGridDB Asset Selector Screen
  const [isAssetSelectorVisible, setAssetSelectorVisible] = useState(false);
  const [assetSelectorTab, setAssetSelectorTab] = useState<'capsule' | 'capsule_wide' | 'hero' | 'logo' | 'icon' | 'manage'>('capsule');
  const [assetsData, setAssetsData] = useState<{
    grids: any[];
    heroes: any[];
    logos: any[];
    icons: any[];
  }>({ grids: [], heroes: [], logos: [], icons: [] });
  const [selectedDimensionFilter, setSelectedDimensionFilter] = useState<'all' | '2:3' | '22:31' | '1:1' | '92:43'>('all');
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  // Fuente de imágenes: SteamGridDB (portadas/logos/iconos con dimensiones precisas),
  // RAWG (fondo principal + fondo adicional + capturas), IGDB (cover + artworks +
  // screenshots) o PSN (portadas y fondos de los candidatos del Store).
  // RAWG e IGDB solo aplican a cápsula, cápsula ancha e imagen
  // principal — no tienen logos ni iconos. PSN además aporta portadas
  // cuadradas que sirven como logo.
  const [assetSource, setAssetSource] = useState<'steamgrid' | 'rawg' | 'igdb' | 'psn'>('steamgrid');
  const [rawgAssetsData, setRawgAssetsData] = useState<{ background: any[]; screenshots: any[] }>({ background: [], screenshots: [] });
  const [isLoadingRawgAssets, setIsLoadingRawgAssets] = useState(false);
  const rawgAssetsLoadedForTitleRef = useRef<string | null>(null);
  const [igdbAssetsData, setIgdbAssetsData] = useState<{ covers: any[]; artworks: any[]; screenshots: any[] }>({ covers: [], artworks: [], screenshots: [] });
  const [isLoadingIgdbAssets, setIsLoadingIgdbAssets] = useState(false);
  const igdbAssetsLoadedForTitleRef = useRef<string | null>(null);
  const [psnAssetsData, setPsnAssetsData] = useState<{ covers: any[]; backgrounds: any[] }>({ covers: [], backgrounds: [] });
  const [isLoadingPsnAssets, setIsLoadingPsnAssets] = useState(false);
  const psnAssetsLoadedForTitleRef = useRef<string | null>(null);
  const [sliderValue, setSliderValue] = useState(5);
  const [assetSelectorFocusArea, setAssetSelectorFocusArea] = useState<'tabs' | 'filters' | 'grid'>('tabs');
  const [gridFocusIndex, setGridFocusIndex] = useState(0);
  const [filterFocusIndex, setFilterFocusIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [sliderWidth, setSliderWidth] = useState(160);
  const ITEMS_PER_PAGE = 15;
  // Ref to the slider's DOM node (used to measure it on every drag move, not just on layout)
  // and a ref (not state) to track "is the mouse currently down on the slider" so the
  // window-level mousemove/mouseup listeners always read the latest value without having
  // to be re-subscribed on every render.
  const sliderContainerRef = useRef<any>(null);
  const isDraggingSliderRef = useRef(false);

  useEffect(() => {
    setSelectedDimensionFilter('all');
  }, [assetSelectorTab]);

  const getAvailableDimensionFilters = (): ('all' | '2:3' | '22:31' | '1:1' | '92:43')[] => {
    if (assetSelectorTab === 'capsule') {
      return ['all', '2:3', '22:31', '1:1'];
    }
    if (assetSelectorTab === 'capsule_wide') {
      return ['all', '92:43', '1:1'];
    }
    return ['all'];
  };

  const getDimensionFilterLabel = (filter: string) => {
    if (assetSelectorTab !== 'capsule' && assetSelectorTab !== 'capsule_wide') {
      return t('edit.filters');
    }
    switch (filter) {
      case 'all': return t('edit.filterAll');
      case '2:3': return t('edit.filterVertical');
      case '22:31': return t('edit.filterGalaxy');
      case '92:43': return t('edit.filterHorizontal');
      case '1:1': return t('edit.filterSquare');
      default: return t('edit.filterBy');
    }
  };

  const cycleDimensionFilter = () => {
    const available = getAvailableDimensionFilters();
    const currentIdx = available.indexOf(selectedDimensionFilter);
    let nextIdx = currentIdx + 1;
    if (nextIdx >= available.length) nextIdx = 0;
    setSelectedDimensionFilter(available[nextIdx]);
    setGridFocusIndex(0);
    setCurrentPage(0);
  };

  const { t, language } = useTranslation();

  // Pestañas donde RAWG/IGDB pueden aportar imágenes (no tienen logos ni iconos).
  // PSN aporta portadas (cápsula y logo) y fondos (cápsula ancha e imagen principal).
  const isRawgEligibleTab = (tab: string) => tab === 'capsule' || tab === 'capsule_wide' || tab === 'hero';
  const isIgdbEligibleTab = (tab: string) => tab === 'capsule' || tab === 'capsule_wide' || tab === 'hero';
  const isPsnEligibleTab = (tab: string) => tab === 'capsule' || tab === 'capsule_wide' || tab === 'hero' || tab === 'logo';

  const getActiveTabList = () => {
    if (assetSource === 'rawg' && isRawgEligibleTab(assetSelectorTab)) {
      const combined = assetSelectorTab === 'capsule'
        ? [...rawgAssetsData.background]
        : [...rawgAssetsData.background, ...rawgAssetsData.screenshots];
      const seenUrls = new Set<string>();
      return combined.filter((a: any) => {
        if (!a?.url || seenUrls.has(a.url)) return false;
        seenUrls.add(a.url);
        return true;
      });
    }

    if (assetSource === 'igdb' && isIgdbEligibleTab(assetSelectorTab)) {
      const combined = assetSelectorTab === 'capsule'
        ? [...igdbAssetsData.covers]
        : [...igdbAssetsData.artworks, ...igdbAssetsData.screenshots];
      const seenUrls = new Set<string>();
      return combined.filter((a: any) => {
        if (!a?.url || seenUrls.has(a.url)) return false;
        seenUrls.add(a.url);
        return true;
      });
    }

    if (assetSource === 'psn' && isPsnEligibleTab(assetSelectorTab)) {
      const combined = (assetSelectorTab === 'capsule' || assetSelectorTab === 'logo')
        ? [...psnAssetsData.covers]
        : [...psnAssetsData.backgrounds];
      const seenUrls = new Set<string>();
      return combined.filter((a: any) => {
        if (!a?.url || seenUrls.has(a.url)) return false;
        seenUrls.add(a.url);
        return true;
      });
    }

    if (!assetsData) return [];

    const debugGrids = (assetsData.grids || []).map(g => ({
      id: g.id,
      w: g.width,
      h: g.height,
      wType: typeof g.width,
      hType: typeof g.height
    })).slice(0, 5);

    let list: any[] = [];
    switch (assetSelectorTab) {
      case 'capsule':
      case 'capsule_wide':
        list = assetsData.grids || [];
        break;
      case 'hero':
        return assetsData.heroes || [];
      case 'logo':
        return assetsData.logos || [];
      case 'icon':
        return assetsData.icons || [];
      default:
        return [];
    }

    const isCapsule = assetSelectorTab === 'capsule';

    let finalFiltered: any[] = [];

    if (selectedDimensionFilter === '1:1') {
      finalFiltered = list.filter((g: any) => {
        const w = Number(g.width) || 0;
        const h = Number(g.height) || 0;
        return w === h && w > 0;
      });
    } else if (isCapsule) {
      const verticalList = list.filter((g: any) => {
        const w = Number(g.width) || 0;
        const h = Number(g.height) || 0;
        return w < h;
      });

      if (selectedDimensionFilter === '2:3') {
        finalFiltered = verticalList.filter((g: any) => {
          const w = Number(g.width) || 0;
          const h = Number(g.height) || 0;
          return h > 0 && Math.abs(w / h - 2 / 3) < 0.05;
        });
      } else if (selectedDimensionFilter === '22:31') {
        finalFiltered = verticalList.filter((g: any) => {
          const w = Number(g.width) || 0;
          const h = Number(g.height) || 0;
          return h > 0 && Math.abs(w / h - 22 / 31) < 0.05;
        });
      } else {
        finalFiltered = verticalList;
      }
    } else {
      const horizontalList = list.filter((g: any) => {
        const w = Number(g.width) || 0;
        const h = Number(g.height) || 0;
        return w > h;
      });

      if (selectedDimensionFilter === '92:43') {
        finalFiltered = horizontalList.filter((g: any) => {
          const w = Number(g.width) || 0;
          const h = Number(g.height) || 0;
          return h > 0 && Math.abs(w / h - 92 / 43) < 0.05;
        });
      } else {
        finalFiltered = horizontalList;
      }
    }

    // Deduplicate to avoid React key collisions if the API returns duplicates
    const seen = new Set();
    const uniqueFiltered = finalFiltered.filter(g => {
      if (!g.id) return true;
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    });

    return uniqueFiltered;
  };


  const cycleTab = (direction: number) => {
    const tabIndices: ('capsule' | 'capsule_wide' | 'hero' | 'logo' | 'icon' | 'manage')[] = [
      'capsule', 'capsule_wide', 'hero', 'logo', 'icon', 'manage'
    ];
    const currentIdx = tabIndices.indexOf(assetSelectorTab);
    let nextIdx = currentIdx + direction;
    if (nextIdx < 0) nextIdx = tabIndices.length - 1;
    if (nextIdx >= tabIndices.length) nextIdx = 0;

    setAssetSelectorTab(tabIndices[nextIdx]);
    setSelectedDimensionFilter('all');
    setGridFocusIndex(0);
    setCurrentPage(0);
  };

  const openAssetSelector = async (initialTab: 'capsule' | 'capsule_wide' | 'hero' | 'logo' | 'icon' | 'manage') => {
    setAssetSelectorTab(initialTab);
    setSelectedDimensionFilter('all');
    setAssetSelectorVisible(true);
    setAssetSelectorFocusArea('tabs');
    setGridFocusIndex(0);
    setFilterFocusIndex(0);
    setCurrentPage(0);
    setAssetSource('steamgrid');
    rawgAssetsLoadedForTitleRef.current = null;
    setRawgAssetsData({ background: [], screenshots: [] });
    igdbAssetsLoadedForTitleRef.current = null;
    setIgdbAssetsData({ covers: [], artworks: [], screenshots: [] });
    psnAssetsLoadedForTitleRef.current = null;
    setPsnAssetsData({ covers: [], backgrounds: [] });

    setIsLoadingAssets(true);
    try {
      const result = await fetchSteamGridAssetsService(editData.title || '');
      setAssetsData(result);
    } catch (err) {
      console.error('Failed to load SteamGridDB assets', err);
      setAssetsData({ grids: [], heroes: [], logos: [], icons: [] });
    } finally {
      setIsLoadingAssets(false);
    }
  };

  // Carga bajo demanda las imágenes de RAWG (fondo principal, fondo adicional
  // y capturas) al elegir esa fuente en el selector de assets. Se cachea por
  // título dentro de la sesión del selector para no repetir la petición al
  // cambiar de pestaña o alternar la fuente varias veces.
  const loadRawgAssets = async () => {
    const title = editData.title || '';
    if (!title) {
      setRawgAssetsData({ background: [], screenshots: [] });
      return;
    }
    if (rawgAssetsLoadedForTitleRef.current === title) return;

    setIsLoadingRawgAssets(true);
    try {
      const [gameRes, shotsRes] = await Promise.all([
        fetchRawgGameData(title),
        fetchRawgMediaByName(title),
      ]);

      const background: any[] = [];
      if (gameRes.success && gameRes.data) {
        const gameId = gameRes.data.id;
        if (gameRes.data.background_image) {
          background.push({
            id: `rawg_bg_${gameId}`,
            url: gameRes.data.background_image,
            thumb: gameRes.data.background_image,
            width: 0,
            height: 0,
            author: null,
          });
        }
        if (gameRes.data.background_image_additional) {
          background.push({
            id: `rawg_bg2_${gameId}`,
            url: gameRes.data.background_image_additional,
            thumb: gameRes.data.background_image_additional,
            width: 0,
            height: 0,
            author: null,
          });
        }
      }

      const screenshots = (shotsRes.success && shotsRes.data)
        ? shotsRes.data.map((shot) => ({
          id: `rawg_shot_${shot.id}`,
          url: shot.image,
          thumb: shot.image,
          width: shot.width || 0,
          height: shot.height || 0,
          author: null,
        }))
        : [];

      setRawgAssetsData({ background, screenshots });
      rawgAssetsLoadedForTitleRef.current = title;
    } catch (err) {
      console.error('Failed to load RAWG assets', err);
      setRawgAssetsData({ background: [], screenshots: [] });
    } finally {
      setIsLoadingRawgAssets(false);
    }
  };

  // Carga bajo demanda las imágenes de IGDB (cover, artworks y capturas) al
  // elegir esa fuente en el selector de assets. Se cachea por título dentro
  // de la sesión del selector, igual que RAWG.
  const loadIgdbAssets = async () => {
    const title = editData.title || '';
    if (!title) {
      setIgdbAssetsData({ covers: [], artworks: [], screenshots: [] });
      return;
    }
    if (igdbAssetsLoadedForTitleRef.current === title) return;

    setIsLoadingIgdbAssets(true);
    try {
      const result = await (window as any).electronAPI.fetchIgdbAssets(title);
      if (result?.success && result.data) {
        setIgdbAssetsData({
          covers: result.data.covers || [],
          artworks: result.data.artworks || [],
          screenshots: result.data.screenshots || [],
        });
      } else {
        setIgdbAssetsData({ covers: [], artworks: [], screenshots: [] });
      }
      igdbAssetsLoadedForTitleRef.current = title;
    } catch (err) {
      console.error('Failed to load IGDB assets', err);
      setIgdbAssetsData({ covers: [], artworks: [], screenshots: [] });
    } finally {
      setIsLoadingIgdbAssets(false);
    }
  };

  // Carga bajo demanda las imágenes de PSN (portadas y fondos de los
  // candidatos del Store) al elegir esa fuente en el selector de assets.
  // Se cachea por título dentro de la sesión del selector, igual que RAWG.
  const loadPsnAssets = async () => {
    const title = editData.title || '';
    if (!title) {
      setPsnAssetsData({ covers: [], backgrounds: [] });
      return;
    }
    if (psnAssetsLoadedForTitleRef.current === title) return;

    setIsLoadingPsnAssets(true);
    try {
      const results = await searchPsnGames(title, { limit: 24, locale: psnLocaleForLanguage(language) });
      const covers = results
        .filter((r) => r.coverUrl)
        .map((r) => ({
          id: `psn_cover_${r.id}`,
          url: r.coverUrl,
          thumb: r.coverUrl,
          width: 0,
          height: 0,
          author: null,
        }));
      const backgrounds = results
        .filter((r) => r.backgroundUrl)
        .map((r) => ({
          id: `psn_bg_${r.id}`,
          url: r.backgroundUrl as string,
          thumb: r.backgroundUrl as string,
          width: 0,
          height: 0,
          author: null,
        }));
      setPsnAssetsData({ covers, backgrounds });
      psnAssetsLoadedForTitleRef.current = title;
    } catch (err) {
      console.error('Failed to load PSN assets', err);
      setPsnAssetsData({ covers: [], backgrounds: [] });
    } finally {
      setIsLoadingPsnAssets(false);
    }
  };

  // Al elegir RAWG como fuente (mientras el selector está abierto), dispara la carga.
  useEffect(() => {
    if (!isAssetSelectorVisible) return;
    if (assetSource !== 'rawg') return;
    if (!isRawgEligibleTab(assetSelectorTab)) return;
    loadRawgAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetSource, isAssetSelectorVisible, assetSelectorTab]);

  // Al elegir IGDB como fuente (mientras el selector está abierto), dispara la carga.
  useEffect(() => {
    if (!isAssetSelectorVisible) return;
    if (assetSource !== 'igdb') return;
    if (!isIgdbEligibleTab(assetSelectorTab)) return;
    loadIgdbAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetSource, isAssetSelectorVisible, assetSelectorTab]);

  // Al elegir PSN como fuente (mientras el selector está abierto), dispara la carga.
  useEffect(() => {
    if (!isAssetSelectorVisible) return;
    if (assetSource !== 'psn') return;
    if (!isPsnEligibleTab(assetSelectorTab)) return;
    loadPsnAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetSource, isAssetSelectorVisible, assetSelectorTab]);

  // Logo/icono no tienen equivalente en RAWG ni IGDB (PSN solo aporta logo):
  // si el usuario cambia a esas pestañas mientras una de esas fuentes está
  // activa, volvemos automáticamente a SteamGridDB.
  useEffect(() => {
    if (assetSource === 'rawg' && !isRawgEligibleTab(assetSelectorTab)) {
      setAssetSource('steamgrid');
    }
    if (assetSource === 'igdb' && !isIgdbEligibleTab(assetSelectorTab)) {
      setAssetSource('steamgrid');
    }
    if (assetSource === 'psn' && !isPsnEligibleTab(assetSelectorTab)) {
      setAssetSource('steamgrid');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetSelectorTab]);

  const applySelectedAsset = async (url: string) => {
    const tab = assetSelectorTab;
    let updatedData = { ...editData };

    if (tab === 'capsule' || tab === 'capsule_wide') {
      updatedData.image = url;
    } else if (tab === 'hero') {
      updatedData.backgroundImage = url;
    } else if (tab === 'logo') {
      updatedData.logo = url;
    } else if (tab === 'icon') {
      (updatedData as any).icon = url;
    }

    setEditData(updatedData);
    soundService.playActivation?.();
    // No cerramos el selector: el usuario puede cambiar de pestaña (cápsula,
    // imagen principal, logo, ícono) y seleccionar una imagen para cada una
    // antes de volver atrás, en vez de tener que reabrir el selector por cada tipo.

    // Auto-save to database
    if (Platform.OS === 'web' && (window as any).electronAPI && updatedData.id) {
      const cleanData = Object.fromEntries(
        Object.entries(updatedData).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
      );
      const result = await (window as any).electronAPI.updateApp(cleanData);
      if (result.success) {
        if (onRefresh) onRefresh(cleanData);
      }
    }
  };

  // Determina si un asset del grid es el que está actualmente asignado al
  // campo correspondiente a la pestaña activa (cápsula → image, imagen
  // principal → backgroundImage, logo → logo, ícono → icon), para mostrarle
  // un check de "seleccionado" sin necesidad de cerrar el selector.
  const isAssetCurrentlySelected = (asset: { url: string }) => {
    if (!asset?.url) return false;
    if (assetSelectorTab === 'capsule' || assetSelectorTab === 'capsule_wide') {
      return editData.image === asset.url;
    }
    if (assetSelectorTab === 'hero') {
      return editData.backgroundImage === asset.url;
    }
    if (assetSelectorTab === 'logo') {
      return editData.logo === asset.url;
    }
    if (assetSelectorTab === 'icon') {
      return (editData as any).icon === asset.url;
    }
    return false;
  };

  const handleLocalUpload = async () => {
    if (!(window as any).electronAPI) return;
    const img = await (window as any).electronAPI.selectImage();
    if (img) {
      applySelectedAsset(img);
    }
  };

  const handleManageAction = async (idx: number) => {
    if (!(window as any).electronAPI) return;
    let updatedData = { ...editData };

    if (idx === 0) {
      const img = await (window as any).electronAPI.selectImage();
      if (img) updatedData.image = img;
      else return;
    } else if (idx === 1) {
      const img = await (window as any).electronAPI.selectImage();
      if (img) updatedData.logo = img;
      else return;
    } else if (idx === 2) {
      const img = await (window as any).electronAPI.selectImage();
      if (img) updatedData.backgroundImage = img;
      else return;
    } else if (idx === 3) {
      updatedData.image = undefined;
      updatedData.logo = undefined;
      updatedData.backgroundImage = undefined;
    }

    setEditData(updatedData);

    // Auto-save to database
    if (updatedData.id) {
      const cleanData = Object.fromEntries(
        Object.entries(updatedData).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
      );
      const result = await (window as any).electronAPI.updateApp(cleanData);
      if (result.success) {
        if (onRefresh) onRefresh(cleanData);
        if (idx === 3) toastService.show(t('edit.assetsReset'));
      }
    }
  };

  const updateSliderFromClientX = useCallback((clientX: number) => {
    const node = sliderContainerRef.current;
    const rect = node?.getBoundingClientRect ? node.getBoundingClientRect() : null;
    if (!rect || rect.width === 0) return;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const val = Math.round(3 + pct * 5);
    setSliderValue(val);
  }, []);

  const handleSliderMouseDown = (e: any) => {
    isDraggingSliderRef.current = true;
    setAssetSelectorFocusArea('filters');
    setFilterFocusIndex(3);
    updateSliderFromClientX(e.clientX ?? e.nativeEvent?.clientX);
  };

  // Kept for non-web / fallback taps (single tap without drag)
  const handleSliderPress = (e: any) => {
    const x = e.nativeEvent.locationX;
    const pct = Math.max(0, Math.min(1, x / sliderWidth));
    const val = Math.round(3 + pct * 5);
    setSliderValue(val);
    setAssetSelectorFocusArea('filters');
    setFilterFocusIndex(3);
  };

  // Global listeners so dragging keeps working even if the cursor moves off the
  // slider track mid-drag, and so the slider never gets "stuck" after a click.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSliderRef.current) return;
      updateSliderFromClientX(e.clientX);
    };
    const handleMouseUp = () => {
      isDraggingSliderRef.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [updateSliderFromClientX]);

  const handleAssetSelectorKeyDown = (e: any) => {
    const paginatedList = currentList.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(currentList.length / ITEMS_PER_PAGE);
    const numCols = Math.round(sliderValue);

    // Q/e or L1/R1 tab switching
    if (e.key === 'q' || e.key === 'Q') {
      cycleTab(-1);
      return;
    }
    if (e.key === 'e' || e.key === 'E') {
      cycleTab(1);
      return;
    }

    // Square button to cycle dimension filters
    if (e.key === 'x' || e.key === 'X') {
      cycleDimensionFilter();
      return;
    }

    // L2 / R2 to navigate pages of image results
    if (e.key === 'z' || e.key === 'Z') {
      if (currentPage > 0) {
        setCurrentPage(prev => prev - 1);
        setGridFocusIndex(0);
        soundService.playNavigation();
      }
      return;
    }
    if (e.key === 'c' || e.key === 'C') {
      if (currentPage < totalPages - 1) {
        setCurrentPage(prev => prev + 1);
        setGridFocusIndex(0);
        soundService.playNavigation();
      }
      return;
    }

    if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
      setAssetSelectorVisible(false);
      return;
    }

    if (assetSelectorFocusArea === 'tabs') {
      if (e.key === 'ArrowRight') {
        cycleTab(1);
      } else if (e.key === 'ArrowLeft') {
        cycleTab(-1);
      } else if (e.key === 'ArrowDown') {
        setAssetSelectorFocusArea('filters');
        setFilterFocusIndex(0);
      } else if (e.key === 'Enter') {
        setAssetSelectorFocusArea('filters');
        setFilterFocusIndex(0);
      }
    }

    else if (assetSelectorFocusArea === 'filters') {
      const showAdjust = assetSelectorTab === 'logo' || assetSelectorTab === 'hero';

      if (e.key === 'ArrowRight') {
        if (filterFocusIndex === 1 && !showAdjust) {
          setFilterFocusIndex(3);
        } else if (filterFocusIndex < 3) {
          setFilterFocusIndex(prev => prev + 1);
        } else if (filterFocusIndex === 3) {
          setSliderValue(prev => Math.min(prev + 1, 8));
        }
      } else if (e.key === 'ArrowLeft') {
        if (filterFocusIndex === 3) {
          if (sliderValue > 3) {
            setSliderValue(prev => Math.max(prev - 1, 3));
          } else {
            if (!showAdjust) {
              setFilterFocusIndex(1);
            } else {
              setFilterFocusIndex(2);
            }
          }
        } else if (filterFocusIndex > 0) {
          setFilterFocusIndex(prev => prev - 1);
        }
      } else if (e.key === 'ArrowUp') {
        setAssetSelectorFocusArea('tabs');
      } else if (e.key === 'ArrowDown') {
        if (assetSelectorTab === 'manage') {
          setAssetSelectorFocusArea('grid');
          setGridFocusIndex(0);
        } else if (paginatedList.length > 0) {
          setAssetSelectorFocusArea('grid');
          setGridFocusIndex(0);
        }
      } else if (e.key === 'Enter') {
        if (filterFocusIndex === 0) {
          cycleDimensionFilter();
        } else if (filterFocusIndex === 1) {
          handleLocalUpload();
        } else if (filterFocusIndex === 2 && showAdjust) {
          toastService.show(t('edit.logoAdjustMode'));
        }
      }
    }

    else if (assetSelectorFocusArea === 'grid') {
      if (assetSelectorTab === 'manage') {
        if (e.key === 'ArrowRight') {
          setGridFocusIndex(prev => Math.min(prev + 1, 3));
        } else if (e.key === 'ArrowLeft') {
          setGridFocusIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'ArrowUp') {
          setAssetSelectorFocusArea('filters');
          setFilterFocusIndex(0);
        } else if (e.key === 'Enter') {
          handleManageAction(gridFocusIndex);
        }
      } else {
        const listLength = paginatedList.length;
        if (listLength === 0) return;

        if (e.key === 'ArrowRight') {
          setGridFocusIndex(prev => Math.min(prev + 1, listLength - 1));
        } else if (e.key === 'ArrowLeft') {
          setGridFocusIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'ArrowDown') {
          if (gridFocusIndex + numCols < listLength) {
            setGridFocusIndex(prev => prev + numCols);
          }
        } else if (e.key === 'ArrowUp') {
          if (gridFocusIndex - numCols >= 0) {
            setGridFocusIndex(prev => prev - numCols);
          } else {
            setAssetSelectorFocusArea('filters');
            setFilterFocusIndex(0);
          }
        } else if (e.key === 'Enter') {
          const selectedAsset = paginatedList[gridFocusIndex];
          if (selectedAsset && selectedAsset.url) {
            applySelectedAsset(selectedAsset.url);
          }
        }
      }
    }
  };

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Dimensiones en píxeles reales del lightbox de medios (16:9), calculadas a
  // partir del ancho de ventana. YoutubePlayer (WebView por debajo) necesita
  // height/width numéricos — no acepta '100%' como styles.lightboxVideo.


  // Escala de UI en función de la resolución real de la ventana.
  // Usa el eje MAS grande (no el mas chico) respecto a 1920x1080, para que
  // ventanas ultra-wide (mucho ancho, alto normal) no encojan todo el panel.
  const s = useMemo<ScaleFn>(() => {
    const scaleW = windowWidth / 1920;
    const scaleH = windowHeight / 1080;
    const scale = Math.min(Math.max(Math.max(scaleW, scaleH), 0.6), 1.25);
    return (px: number) => {
      if (px === 0) return 0;
      const scaled = Math.round(px * scale);
      return scaled === 0 ? Math.sign(px) : scaled;
    };
  }, [windowWidth, windowHeight]);
  const styles = useMemo(() => createStyles(s), [s]);

  const lightboxPlayerWidth = Math.min(windowWidth * 0.82, s(1060));
  const lightboxPlayerHeight = lightboxPlayerWidth * (9 / 16);
  const isSmallScreen = windowWidth < 1100;

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
    infoCardsAnim.value = withTiming(focusIndex >= 4 ? 0 : 1, { duration: 300 });
  }, [focusIndex]);

  // Auto-scroll del panel inferior en GameDetailView para mantener la fila enfocada en pantalla
  useEffect(() => {
    if (!isVisible || !bottomScrollRef.current) return;
    if (focusIndex <= 1) {
      bottomScrollRef.current.scrollTo({ y: 0, animated: true });
    } else if (focusIndex === 2 || focusIndex === 3) {
      bottomScrollRef.current.scrollTo({ y: 160, animated: true });
    } else if (focusIndex >= 100 && focusIndex < 200) {
      bottomScrollRef.current.scrollTo({ y: 240, animated: true });
    } else if (focusIndex === 300) {
      bottomScrollRef.current.scrollTo({ y: 900, animated: true });
    } else if (focusIndex >= 200) {
      bottomScrollRef.current.scrollTo({ y: 380, animated: true });
    } else if (focusIndex >= 4 && focusIndex < 100) {
      bottomScrollRef.current.scrollTo({ y: 620, animated: true });
    }
  }, [focusIndex, isVisible]);

  // Reset card layout cache whenever the paginated list (or page) changes
  useEffect(() => {
    cardLayoutsRef.current = [];
  }, [currentPage, assetSelectorTab, selectedDimensionFilter]);

  // Auto-scroll the asset grid so the focused card stays visible
  const assetGridScrollOffsetRef = React.useRef(0);
  const assetGridVisibleHeightRef = React.useRef(0);

  useEffect(() => {
    if (assetSelectorFocusArea !== 'grid') return;
    const layout = cardLayoutsRef.current[gridFocusIndex];
    if (!layout || !assetGridScrollRef.current) return;

    const cardTop = layout.y;
    const cardBottom = layout.y + layout.height;
    const scrollTop = assetGridScrollOffsetRef.current;
    const scrollBottom = scrollTop + assetGridVisibleHeightRef.current;

    // Only scroll if card is outside visible window
    if (cardBottom > scrollBottom - 20) {
      // Card is below: scroll so card bottom is visible with padding
      (assetGridScrollRef.current as any).scrollTo({
        y: cardBottom - assetGridVisibleHeightRef.current + 20,
        animated: true,
      });
    } else if (cardTop < scrollTop + 20) {
      // Card is above: scroll so card top is visible with padding
      (assetGridScrollRef.current as any).scrollTo({
        y: Math.max(0, cardTop - 20),
        animated: true,
      });
    }
  }, [gridFocusIndex, assetSelectorFocusArea]);


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

  const isGallery = item?.id === 'media_gallery';
  const scrollPaddingStyle = useAnimatedStyle(() => ({
    paddingTop: interpolate(panelLiftAnim.value, [0, 1], [isGallery ? 520 : 380, 60]),
    paddingBottom: 80,
  }));

  const darkOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(darkOverlayAnim.value, [0, 1], [0, 0.5]),
  }));

  const editTitleRef = React.useRef<TextInput>(null);
  const editDescRef = React.useRef<TextInput>(null);
  const editPathInputRef = React.useRef<TextInput>(null);
  const editLaunchArgsRef = React.useRef<TextInput>(null);
  const editPlatformScrollRef = React.useRef<ScrollView>(null);
  const editPlatformOffsets = React.useRef<number[]>([]);

  // Throttle para navegación horizontal en rows (capturas / noticias)
  const rowNavThrottleRef = React.useRef<number | null>(null);
  const ROW_NAV_INTERVAL = 150; // ms entre cada paso al mantener pulsado

  // Auto-scroll para el grid de assets
  const assetGridScrollRef = React.useRef<ScrollView>(null);
  const cardLayoutsRef = React.useRef<{ y: number; height: number }[]>([]);

  // Steam data
  const [steamNews, setSteamNews] = useState<SteamNewsItem[]>([]);
  const [steamMedia, setSteamMedia] = useState<SteamMediaItem[]>([]);
  const selectedMedia = selectedMediaIndex !== null ? steamMedia[selectedMediaIndex] ?? null : null;
  const [newsLoading, setNewsLoading] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);

  // Fetch steam data when item changes
  useEffect(() => {
    if (!item || !isVisible) return;
    const title = item.title;
    if (!title) return;
    let cancelled = false;

    setSteamMedia([]);
    setMediaLoading(true);
    (async () => {
      try {
        // Videos de fondo: siempre IGDB (embed de YouTube, siempre reproduce).
        // Capturas con filtro de plataforma (Steam solo en PC; resto, RAWG e IGDB).
        const [images, igdbVideos] = await Promise.all([
          resolveGameScreenshots(title, { platform: (item as any)?.platform, language }),
          fetchGameVideosByName(title),
        ]);

        if (cancelled) return;

        const videos: SteamMediaItem[] = (igdbVideos as unknown as SteamMediaItem[]) || [];

        if (!cancelled) {
          setSteamMedia([...videos, ...images]);
        }
      } catch (error) {
        console.error('[Media] Error obteniendo capturas:', error);
        if (!cancelled) setSteamMedia([]);
      } finally {
        if (!cancelled) setMediaLoading(false);
      }
    })();

    setSteamNews([]);
    if (activeUser?.settings?.showNews === false) {
      setNewsLoading(false);
    } else {
      setNewsLoading(true);
      fetchSteamNewsByName(title, language).then(news => {
        if (!cancelled) { setSteamNews(news); setNewsLoading(false); }
      });
    }

    return () => { cancelled = true; };
  }, [item?.id, isVisible, language, activeUser?.settings?.showNews]);


  useEffect(() => {
    if (item) {
      prevFocusIndexRef.current = 0;
      setFocusIndex(0); // Reset focus when opening
      setAchievementCount(0);
      const initialData: any = {
        id: item.id,
        title: item.title,
        description: isSteamGame(item) && isPlaytimePlaceholder(item.description) ? '' : item.description,
        rating: item.rating,
        image: item.image?.uri?.startsWith('local-file://') ? item.image.uri.replace(/^local-file:\/+/, '') : (item.image?.uri?.startsWith('http') ? item.image.uri : undefined),
        logo: item.logo?.uri?.startsWith('local-file://') ? item.logo.uri.replace(/^local-file:\/+/, '') : (item.logo?.uri?.startsWith('http') ? item.logo.uri : undefined),
        backgroundImage: item.backgroundImage?.uri?.startsWith('local-file://') ? item.backgroundImage.uri.replace(/^local-file:\/+/, '') : (item.backgroundImage?.uri?.startsWith('http') ? item.backgroundImage.uri : undefined),
        video: item.video?.uri?.startsWith('local-file://') ? item.video.uri.replace(/^local-file:\/+/, '') : (item.video?.uri?.startsWith('http') ? item.video.uri : undefined),
        focusAudio: item.focusAudio,
        youtubeId: item.youtubeId,
        platform: item.platform,
        path: getSteamLaunchPath(item) || item.path || undefined,
        type: item.type,
        launchArgs: item.launchArgs,
      };

      setEditData(initialData);
    }
  }, [item, isVisible]);

  // Steam: si la descripción es el placeholder de tiempo jugado (o está vacía),
  // traer la descripción real en el idioma del usuario
  useEffect(() => {
    if (!item || !isVisible || !isSteamGame(item)) return;
    if (!isPlaytimePlaceholder(item.description)) return;

    let cancelled = false;
    fetchSteamDescription(getSteamAppId(item as any) ?? item.title, language).then((desc) => {
      if (!cancelled && desc) setEditData((prev) => ({ ...prev, description: desc }));
    });
    return () => { cancelled = true; };
  }, [item?.id, isVisible, language]);

  useEffect(() => {
    if (isEditModalVisible) {
      setEditModalFocusIndex(23);
      setActiveTab('basic');
    }
  }, [isEditModalVisible]);

  useEffect(() => {
    if (isEditModalVisible) {
      if (editModalFocusIndex === 23) setActiveTab('basic');
      else if (editModalFocusIndex === 24) setActiveTab('path');
      else if (editModalFocusIndex === 25) setActiveTab('art');
    }
  }, [editModalFocusIndex, isEditModalVisible]);

  // Auto-scroll platform row in Edit modal so the focused platform stays visible
  useEffect(() => {
    if (!isEditModalVisible) return;
    const isGame = (editData.type || item?.type) !== 'media' && (editData.type || item?.type) !== 'web';
    if (!isGame) return;
    const platformIdx = editModalFocusIndex - 3;
    if (platformIdx < 0 || platformIdx >= PLATFORMS.length) return;
    const offset = editPlatformOffsets.current[platformIdx];
    if (offset !== undefined && editPlatformScrollRef.current) {
      editPlatformScrollRef.current.scrollTo({ x: Math.max(0, offset - 12), animated: true });
    }
  }, [editModalFocusIndex, isEditModalVisible]);

  // Keyboard navigation within Detail View
  useEffect(() => {
    if (isVisible && !isLaunching) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
        }

        if (isDeleteConfirmVisible) {
          return;
        }

        if (isAssetSelectorVisible) {
          handleAssetSelectorKeyDown(e);
          return;
        }

        if (selectedMediaIndex !== null) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setSelectedMediaIndex(null);
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            setSelectedMediaIndex(prev => prev !== null && prev < steamMedia.length - 1 ? prev + 1 : prev);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            setSelectedMediaIndex(prev => prev !== null && prev > 0 ? prev - 1 : prev);
          }
          return;
        }

        if (isEditModalVisible) {
          const isGame = (editData.type || item?.type) !== 'media' && (editData.type || item?.type) !== 'web';
          const platformCount = PLATFORMS.length;

          if (e.key === 'ArrowDown') {
            soundService.playNavigation();
            if (editModalFocusIndex === 23) setEditModalFocusIndex(24);
            else if (editModalFocusIndex === 24) setEditModalFocusIndex(25);
            else if (editModalFocusIndex === 25) { } // Tab end

            // Tab 1: basic
            else if (editModalFocusIndex === 2) setEditModalFocusIndex(isGame ? 3 : 14);
            else if (editModalFocusIndex >= 3 && editModalFocusIndex < 3 + platformCount) setEditModalFocusIndex(14);
            else if (editModalFocusIndex === 14) setEditModalFocusIndex(20); // to Cancel

            // Tab 2: path
            else if (editModalFocusIndex === 22) setEditModalFocusIndex(isExternalExeGame ? 27 : 20); // to launch args or Cancel
            else if (editModalFocusIndex === 27) setEditModalFocusIndex(20); // to Cancel

            // Tab 3: art
            else if (editModalFocusIndex === 0) setEditModalFocusIndex(15);
            else if (editModalFocusIndex === 15) setEditModalFocusIndex(17);
            else if (editModalFocusIndex === 16) setEditModalFocusIndex(18);
            else if (editModalFocusIndex === 17) setEditModalFocusIndex(20); // to Cancel
            else if (editModalFocusIndex === 18) setEditModalFocusIndex(26);
            else if (editModalFocusIndex === 26) setEditModalFocusIndex(21); // to Save

            // Actions
            else if (editModalFocusIndex >= 19 && editModalFocusIndex <= 21) { }
          }

          else if (e.key === 'ArrowUp') {
            soundService.playNavigation();
            if (editModalFocusIndex === 25) setEditModalFocusIndex(24);
            else if (editModalFocusIndex === 24) setEditModalFocusIndex(23);
            else if (editModalFocusIndex === 23) { } // Tab start

            // Tab 1: basic
            else if (editModalFocusIndex === 2) setEditModalFocusIndex(23); // Back to sidebar basic tab
            else if (editModalFocusIndex >= 3 && editModalFocusIndex < 3 + platformCount) setEditModalFocusIndex(2);
            else if (editModalFocusIndex === 14) setEditModalFocusIndex(isGame ? 3 : 2);

            // Tab 2: path
            else if (editModalFocusIndex === 22) setEditModalFocusIndex(24); // Back to sidebar path tab
            else if (editModalFocusIndex === 27) setEditModalFocusIndex(22); // Back to path selection

            // Tab 3: art
            else if (editModalFocusIndex === 0) setEditModalFocusIndex(25); // Back to sidebar art tab
            else if (editModalFocusIndex === 15) setEditModalFocusIndex(0);
            else if (editModalFocusIndex === 16) setEditModalFocusIndex(0);
            else if (editModalFocusIndex === 17) setEditModalFocusIndex(15);
            else if (editModalFocusIndex === 18) setEditModalFocusIndex(16);
            else if (editModalFocusIndex === 26) setEditModalFocusIndex(18);

            // Actions
            else if (editModalFocusIndex >= 19 && editModalFocusIndex <= 21) {
              if (activeTab === 'basic') setEditModalFocusIndex(14);
              else if (activeTab === 'path') setEditModalFocusIndex(isExternalExeGame ? 27 : 22);
              else if (activeTab === 'art') setEditModalFocusIndex(editModalFocusIndex === 21 ? 18 : 17);
            }
          }

          else if (e.key === 'ArrowRight') {
            soundService.playNavigation();
            // From tabs to content area
            if (editModalFocusIndex === 23) setEditModalFocusIndex(2); // Basic -> Title
            else if (editModalFocusIndex === 24) setEditModalFocusIndex(22); // Path -> Path selection
            else if (editModalFocusIndex === 25) setEditModalFocusIndex(0); // Art -> Sync

            // Within content elements
            else if (editModalFocusIndex >= 3 && editModalFocusIndex < 3 + platformCount - 1) setEditModalFocusIndex(prev => prev + 1);
            else if (editModalFocusIndex === 15) setEditModalFocusIndex(16);
            else if (editModalFocusIndex === 17) setEditModalFocusIndex(18);
            else if (editModalFocusIndex === 18) setEditModalFocusIndex(26);

            // Actions
            else if (editModalFocusIndex >= 19 && editModalFocusIndex < 21) setEditModalFocusIndex(prev => prev + 1);
          }

          else if (e.key === 'ArrowLeft') {
            soundService.playNavigation();
            // From content area to tabs sidebar
            if (editModalFocusIndex === 2) setEditModalFocusIndex(23);
            else if (editModalFocusIndex === 3) setEditModalFocusIndex(23);
            else if (editModalFocusIndex > 3 && editModalFocusIndex < 3 + platformCount) setEditModalFocusIndex(prev => prev - 1);
            else if (editModalFocusIndex === 14) setEditModalFocusIndex(23);

            else if (editModalFocusIndex === 22) setEditModalFocusIndex(24);
            else if (editModalFocusIndex === 27) setEditModalFocusIndex(24);

            else if (editModalFocusIndex === 0) setEditModalFocusIndex(25);
            else if (editModalFocusIndex === 15 || editModalFocusIndex === 17) setEditModalFocusIndex(25);
            else if (editModalFocusIndex === 16) setEditModalFocusIndex(15);
            else if (editModalFocusIndex === 18) setEditModalFocusIndex(17);
            else if (editModalFocusIndex === 26) setEditModalFocusIndex(25);

            // Actions
            else if (editModalFocusIndex > 19 && editModalFocusIndex <= 21) setEditModalFocusIndex(prev => prev - 1);
          }

          else if (e.key === 'Enter') {
            soundService.playActivation?.();
            if (editModalFocusIndex === 23) { setActiveTab('basic'); setEditModalFocusIndex(2); }
            else if (editModalFocusIndex === 24) { setActiveTab('path'); setEditModalFocusIndex(22); }
            else if (editModalFocusIndex === 25) { setActiveTab('art'); setEditModalFocusIndex(0); }
            else if (editModalFocusIndex === 0) handleUnifiedSync();
            else if (editModalFocusIndex === 2) editTitleRef.current?.focus();
            else if (editModalFocusIndex === 22) {
              if ((editData.type || item?.type) === 'web') editPathInputRef.current?.focus();
              else handleSelectPath();
            }
            else if (editModalFocusIndex === 27) editLaunchArgsRef.current?.focus();
            else if (editModalFocusIndex >= 3 && editModalFocusIndex < 3 + platformCount) {
              setEditData({ ...editData, platform: PLATFORM_IDS[editModalFocusIndex - 3] });
            }
            else if (editModalFocusIndex === 14) editDescRef.current?.focus();
            else if (editModalFocusIndex === 15) openAssetSelector('capsule');
            else if (editModalFocusIndex === 16) openAssetSelector('logo');
            else if (editModalFocusIndex === 17) openAssetSelector('hero');
            else if (editModalFocusIndex === 18) handleSelectVideo();
            else if (editModalFocusIndex === 26) handleSelectFocusAudio();
            else if (editModalFocusIndex === 19) handleDeleteApp();
            else if (editModalFocusIndex === 20) setEditModalVisible(false);
            else if (editModalFocusIndex === 21) handleSaveEdit();
          }

          else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setEditModalVisible(false);
          }
          return;
        }

        const moveFocus = (next: number) => {
          prevFocusIndexRef.current = focusIndex;
          setFocusIndex(next);
        };

        // moveFocus con throttle para navegación dentro de un row horizontal.
        // Permite el primer keydown inmediato y luego uno cada ROW_NAV_INTERVAL ms.
        // El sonido solo se reproduce cuando el movimiento realmente ocurre.
        const moveFocusThrottled = (next: number) => {
          const now = Date.now();
          if (rowNavThrottleRef.current !== null && now - rowNavThrottleRef.current < ROW_NAV_INTERVAL) {
            return;
          }
          rowNavThrottleRef.current = now;
          soundService.playNavigation();
          moveFocus(next);
        };

        if (e.key === 'ArrowRight') {
          if (focusIndex === 0) { soundService.playNavigation(); moveFocus(1); }
          else if (focusIndex === 2) { soundService.playNavigation(); moveFocus(3); }
          else if (focusIndex === 300) { } // Ficha de metadatos: tarjeta única
          // En row de logros: avanzar item (throttled)
          else if (focusIndex >= 200 && focusIndex < 200 + achievementCount - 1) moveFocusThrottled(focusIndex + 1);
          // En row de capturas: avanzar item (throttled)
          else if (focusIndex >= 100 && focusIndex < 200 && focusIndex < 100 + steamMedia.length - 1) moveFocusThrottled(focusIndex + 1);
          // En row de noticias: avanzar item (throttled)
          else if (focusIndex >= 4 && focusIndex < 100 && focusIndex < 4 + steamNews.length - 1) moveFocusThrottled(focusIndex + 1);
        } else if (e.key === 'ArrowLeft') {
          if (focusIndex === 1) { soundService.playNavigation(); moveFocus(0); }
          else if (focusIndex === 3) { soundService.playNavigation(); moveFocus(2); }
          else if (focusIndex === 300) { } // Ficha de metadatos: tarjeta única
          // En row de logros: retroceder item (mínimo 200, throttled)
          else if (focusIndex > 200) moveFocusThrottled(focusIndex - 1);
          else if (focusIndex === 200) { } // ya en el primero
          // En row de capturas: retroceder item (mínimo 100, throttled)
          else if (focusIndex > 100 && focusIndex < 200) moveFocusThrottled(focusIndex - 1);
          else if (focusIndex === 100) { } // ya en el primero
          // En row de noticias: retroceder item (mínimo 4, throttled)
          else if (focusIndex > 4 && focusIndex < 100) moveFocusThrottled(focusIndex - 1);
          else if (focusIndex === 4) { } // ya en el primero
        } else if (e.key === 'ArrowDown') {
          soundService.playNavigation();
          if (focusIndex <= 1) {
            moveFocus(2); // botones → trofeos
          } else if (focusIndex <= 3) {
            if (steamMedia.length > 0) moveFocus(100);
            else if (achievementCount > 0) moveFocus(200);
            else if (steamNews.length > 0) moveFocus(4);
            else if (activeUser?.settings?.showGameMetadata !== false) moveFocus(300);
          } else if (focusIndex >= 100 && focusIndex < 200) {
            if (achievementCount > 0) moveFocus(200);
            else if (steamNews.length > 0) moveFocus(4);
            else if (activeUser?.settings?.showGameMetadata !== false) moveFocus(300);
          } else if (focusIndex === 300) {
            // Ficha de metadatos: última sección, no hay más abajo.
          } else if (focusIndex >= 200) {
            if (steamNews.length > 0) moveFocus(4);
            else if (activeUser?.settings?.showGameMetadata !== false) moveFocus(300);
          } else if (focusIndex >= 4 && focusIndex < 100) {
            // De noticias se baja a la ficha de metadatos (si está activada).
            if (activeUser?.settings?.showGameMetadata !== false) moveFocus(300);
          }
        } else if (e.key === 'ArrowUp') {
          soundService.playNavigation();
          if (focusIndex === 300) {
            // De la ficha se vuelve a la fila de noticias.
            if (steamNews.length > 0) moveFocus(4);
            else if (achievementCount > 0) moveFocus(200);
            else if (steamMedia.length > 0) moveFocus(100);
            else moveFocus(2);
          } else if (focusIndex >= 4 && focusIndex < 100) {
            if (achievementCount > 0) moveFocus(200);
            else if (steamMedia.length > 0) moveFocus(100);
            else moveFocus(2);
          } else if (focusIndex >= 200) {
            moveFocus(steamMedia.length > 0 ? 100 : 2);
          } else if (focusIndex >= 100 && focusIndex < 200) {
            moveFocus(2); // capturas → trofeos
          } else if (focusIndex >= 2) {
            moveFocus(0); // trofeos → botones
          }
          // 0/1: no hace nada, no sale
        } else if (e.key === 'Enter') {
          soundService.playActivation?.();
          if (focusIndex === 0) {
            if (item?.id === 'media_gallery') {
              onOpenMediaGallery?.();
            } else if (item?.path) {
              if (onLaunch) onLaunch(item.id, item.path, item.launchArgs);
              else if ((window as any).electronAPI) (window as any).electronAPI.launchApp(item.id, item.path, item.launchArgs);
            }
          } else if (focusIndex === 1) {
            setEditModalVisible(true);
          } else if (focusIndex >= 100 && focusIndex < 200) {
            const media = steamMedia[focusIndex - 100];
            if (media) setSelectedMediaIndex(focusIndex - 100);
          } else if (focusIndex >= 4 && focusIndex < 100) {
            const news = steamNews[focusIndex - 4];
            if (news?.url) Linking.openURL(news.url);
          }
        } else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [
    isVisible,
    isEditModalVisible,
    isDeleteConfirmVisible,
    isAssetSelectorVisible,
    selectedMediaIndex,
    focusIndex,
    achievementCount,
    editModalFocusIndex,
    item,
    onLaunch,
    onClose,
    editData,
    steamMedia,
    steamNews,
    assetSelectorFocusArea,
    gridFocusIndex,
    filterFocusIndex,
    sliderValue,
    assetSelectorTab,
    selectedDimensionFilter,
    currentPage,
    assetsData,
    isLoadingAssets,
    onOpenMediaGallery,
    activeUser?.settings?.showGameMetadata,
  ]);

  // ─── Mando: botón Options/Start guarda y cierra el selector de imágenes ───
  // Se sondea directamente la Gamepad API (independiente del despacho de
  // teclado sintético usado para D-Pad/Cross en otras pantallas) para no
  // depender de que el botón Options/Start esté mapeado en el nivel superior.
  const optionsBtnPrevRef = useRef(false);
  useEffect(() => {
    if (!isAssetSelectorVisible || Platform.OS !== 'web') return;
    let rafId: number;
    const poll = () => {
      const gp = navigator.getGamepads?.()[0];
      // Botón Options/Start: índice 9 en el mapeo estándar de la Gamepad API
      // (algunos mandos/navegadores lo exponen también en el índice 8).
      const pressed = !!(gp?.buttons?.[9]?.pressed || gp?.buttons?.[8]?.pressed);
      if (pressed && !optionsBtnPrevRef.current) {
        soundService.playActivation?.();
        setAssetSelectorVisible(false);
      }
      optionsBtnPrevRef.current = pressed;
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [isAssetSelectorVisible]);

  const currentList = useMemo(() => getActiveTabList(), [getActiveTabList]);

  if (!item) return null;

  const handleSelectPath = async () => {
    if ((window as any).electronAPI) {
      const p = await (window as any).electronAPI.selectFile();
      if (p) setEditData({ ...editData, path: p });
    }
  };

  // El campo de argumentos de lanzamiento (-dx11, -windowed, etc.) solo
  // aplica a .exe externos lanzados directamente. Nunca a juegos de Steam
  // (se lanzan vía protocolo steam://, que no soporta esto de forma fiable)
  // ni a accesos directos .lnk (ya resuelven sus propios argumentos desde
  // el acceso directo original).
  const isExternalExeGame = (() => {
    const type = editData.type || item?.type;
    if (type === 'web') return false;
    if (isSteamGame(editData.id ? { id: editData.id, platform: editData.platform } : item)) return false;
    const p = (editData.path || item?.path || '').toLowerCase();
    if (p.endsWith('.lnk')) return false;
    return true;
  })();

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

  const handleSelectFocusAudio = async () => {
    if ((window as any).electronAPI) {
      const audio = await (window as any).electronAPI.selectAudio();
      if (audio) setEditData({ ...editData, focusAudio: audio });
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
        setEditData(prev => ({ ...prev, ...cleanData }));
        setEditModalVisible(false);
        if (onRefresh) onRefresh(cleanData);
      } else {
        toastService.show(t('edit.updateError', { error: result.error }));
      }
    }
  };

  const handleUnifiedSync = async () => {
    if (!(window as any).electronAPI || !editData.title) {
      console.warn('[Sync] Abortado: electronAPI o editData.title faltante', {
        hasElectronAPI: !!(window as any).electronAPI,
        title: editData.title,
      });
      return;
    }

    setIsSyncing(true);
    const prefs = resolveFieldSyncPreferences(activeUser?.settings?.syncPreferences);
    console.log('[Sync] Iniciando con preferencias:', prefs, 'título:', editData.title);

    let newEditData = { ...editData };
    const title = editData.title || '';

    // El Store moderno solo indexa PS4/PS5: en plataformas retro/emuladas
    // PSN traería el juego homónimo equivocado. Los campos de texto e info
    // caen a IGDB y el arte PSN se omite.
    const psnEligible = isPsnEligiblePlatform((item as any)?.platform);
    const eff = (src: string, isArt: boolean): string =>
      src === 'psn' && !psnEligible ? (isArt ? 'none' : 'igdb') : src;
    if (!psnEligible && Object.values(prefs).includes('psn')) {
      console.log('[Sync][PSN] Omitido por plataforma no elegible:', (item as any)?.platform);
    }

    const effPrefs = {
      description: eff(prefs.description, false),
      rating: eff(prefs.rating, false),
      publisher: eff(prefs.publisher, false),
      genres: eff(prefs.genres, false),
      releaseDate: eff(prefs.releaseDate, false),
      cover: eff(prefs.cover, true),
      background: eff(prefs.background, true),
      logo: eff(prefs.logo, true),
    };
    const uses = (source: string) => Object.values(effPrefs).includes(source);

    const steamAppId = item ? getSteamAppId(item as any) : null;
    const [steamData, igdbData, rawgData, psnData, steamGridRes] = await Promise.all([
      uses('steam') ? fetchSteamFieldData(steamAppId ?? title, language) : Promise.resolve(null),
      uses('igdb') ? fetchIgdbFieldData(title) : Promise.resolve(null),
      uses('rawg') ? fetchRawgFieldData(title) : Promise.resolve(null),
      uses('psn') ? fetchPsnFieldData(title, language) : Promise.resolve(null),
      uses('steamgrid')
        ? ((window as any).electronAPI?.fetchSteamGridData
          ? (window as any).electronAPI.fetchSteamGridData(title)
          : fetchSteamGridDataService(title))
        : Promise.resolve(null),
    ]);
    const bySource: Record<string, SourceFieldData | null> = {
      steam: steamData,
      igdb: igdbData,
      rawg: rawgData,
      psn: psnData,
    };
    console.log('[Sync] Fuentes resueltas:', {
      steam: !!steamData,
      igdb: !!igdbData,
      rawg: !!rawgData,
      psn: !!(psnData),
    });

    const fieldData = (key: 'description' | 'rating' | 'publisher' | 'genres' | 'releaseDate' | 'cover' | 'background') =>
      bySource[effPrefs[key]] || null;

    const descData = fieldData('description');
    if (descData?.description) newEditData.description = descData.description;
    if (effPrefs.description === 'igdb' && igdbData?.youtubeId) {
      newEditData.youtubeId = igdbData.youtubeId;
    }

    const ratingData = fieldData('rating');
    if (ratingData?.rating != null) newEditData.rating = ratingData.rating;

    const publisherData = fieldData('publisher');
    if (publisherData?.publisher) (newEditData as any).publisher = publisherData.publisher;

    const genresData = fieldData('genres');
    if (genresData?.genres && genresData.genres.length > 0) (newEditData as any).genres = genresData.genres;

    const dateData = fieldData('releaseDate');
    if (dateData?.releaseDate) (newEditData as any).releaseDate = dateData.releaseDate;

    if (effPrefs.cover === 'steamgrid') {
      if (steamGridRes?.success && steamGridRes.data?.grid) newEditData.image = steamGridRes.data.grid;
      else if (!steamGridRes?.success) console.log('SteamGrid Sync failed:', steamGridRes?.error);
    } else {
      const coverData = fieldData('cover');
      if (coverData?.coverUrl) newEditData.image = coverData.coverUrl;
    }

    if (effPrefs.background === 'steamgrid') {
      if (steamGridRes?.success && steamGridRes.data?.hero) newEditData.backgroundImage = steamGridRes.data.hero;
      else if (!steamGridRes?.success) console.log('SteamGrid Sync failed:', steamGridRes?.error);
    } else {
      const bgData = fieldData('background');
      if (bgData?.backgroundUrl) newEditData.backgroundImage = bgData.backgroundUrl;
    }

    if (effPrefs.logo === 'steamgrid') {
      if (steamGridRes?.success && steamGridRes.data?.logo) newEditData.logo = steamGridRes.data.logo;
      else if (!steamGridRes?.success) console.log('SteamGrid Sync failed:', steamGridRes?.error);
    } else if (effPrefs.logo === 'psn' && psnData?.coverUrl) {
      // Las portadas de PSN son cuadradas, sirven como logo/icono
      newEditData.logo = psnData.coverUrl;
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
        if (onRefresh) onRefresh({ id: item.id, isFavorite: newStatus });
      } else {
        toastService.show(t('edit.favoriteError', { error: result.error }));
      }
    } else {
      console.log('Missing electronAPI or item.id');
    }
  };

  const handleDeleteApp = async () => {
    setDeleteConfirmVisible(true);
  };

  const handleConfirmDeleteApp = async () => {
    setDeleteConfirmVisible(false);
    if ((window as any).electronAPI && item?.id) {
      const result = await (window as any).electronAPI.deleteApp(item.id);
      if (result.success) {
        setEditModalVisible(false);
        onClose();
        if (onRefresh) onRefresh({ id: item.id, _deleted: true } as any);
      } else {
        toastService.show(t('edit.deleteError', { error: result.error }));
      }
    }
  };


  const totalPages = Math.ceil(currentList.length / ITEMS_PER_PAGE);
  const paginatedList = currentList.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

  return (
    <>
      <Modal visible={isVisible} transparent={false} animationType="fade" onRequestClose={onClose}>
        <View style={styles.detailContainer}>

          {/* FULLSCREEN BACKGROUND */}
          {/* recyclingKey le indica a expo-image que, al cambiar de juego, esto
              es una imagen "nueva" (no debe reciclar la vista nativa de la
              anterior); transition hace un crossfade real entre la imagen
              previa y la nueva en vez de un corte/parpadeo negro. cachePolicy
              evita que un juego ya visto vuelva a mostrar el tirón al volver
              a entrar. */}
          {(() => {
            const isGallery = item?.id === 'media_gallery';
            const bgSource = isGallery
              ? require('@/assets/images/fondoGaleria2.png')
              : (resolveEditSource(editData.backgroundImage) ?? item?.backgroundImage);
            const imgSource = isGallery
              ? null
              : (resolveEditSource(editData.image) ?? item?.image);
            return bgSource ? (
              <Image
                recyclingKey={item.id}
                source={bgSource}
                style={styles.detailBg}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={{ effect: 'cross-dissolve', duration: 350 }}
              />
            ) : imgSource ? (
              <Image
                recyclingKey={item.id}
                source={imgSource}
                style={styles.detailBg}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={{ effect: 'cross-dissolve', duration: 350 }}
              />
            ) : null;
          })()}

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
            {(editData.image || item.image) && (
              <Image
                recyclingKey={item.id}
                source={resolveEditSource(editData.image) ?? item.image}
                style={styles.topHeaderImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={{ effect: 'cross-dissolve', duration: 250 }}
              />
            )}
            <Text style={styles.topHeaderTitle} numberOfLines={1}>{editData.title || item.title}</Text>
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
            ref={bottomScrollRef}
            style={styles.ps5BottomPanel}
            contentContainerStyle={{ paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={scrollPaddingStyle}>
              <GameInfoPanel
                activeItem={{
                  ...item,
                  ...editData,
                  image: resolveEditSource(editData.image) ?? item.image,
                  logo: resolveEditSource(editData.logo) ?? item.logo,
                  backgroundImage: resolveEditSource(editData.backgroundImage) ?? item.backgroundImage,
                } as ConsoleItem}
                activeIndex={0}
                lastPlayedGame={null}
                focusArea="game_panel"
                gamePanelFocusIndex={focusIndex}
                setGamePanelFocusIndex={setFocusIndex}
                setFocusArea={() => { }}
                handleLaunchApp={async () => {
                  const launchPath = resolveSteamLaunchPath({ ...item, ...editData } as ConsoleItem, installedSteamAppIds);
                  if (launchPath) {
                    if (onLaunch) onLaunch(item.id, launchPath, editData.launchArgs ?? item.launchArgs);
                    else if (Platform.OS === 'web' && (window as any).electronAPI)
                      (window as any).electronAPI.launchApp(item.id, launchPath, editData.launchArgs ?? item.launchArgs);
                  } else {
                    setActiveTab('path');
                    setEditModalVisible(true);
                  }
                }}
                setSelectedItem={() => { }}
                setDetailVisible={setEditModalVisible}
                steamMedia={steamMedia}
                mediaLoading={mediaLoading}
                setSelectedMediaIndex={setSelectedMediaIndex}
                steamNews={steamNews}
                newsLoading={newsLoading}
                activeUser={activeUser}
                windowWidth={windowWidth}
                windowHeight={windowHeight}
                gameInfoPanelStyle={{}}
                spacerStyle={{}}
                infoCardsStyle={infoCardsStyle}
                topPanelStyle={topPanelStyle}
                installedSteamAppIds={installedSteamAppIds}
                onAchievementCountChange={setAchievementCount}
                onOpenMediaGallery={onOpenMediaGallery}
              />
            </Animated.View>
          </ScrollView>

          {isLaunching && item && (
            <Animated.View
              entering={FadeIn.duration(800)}
              style={[StyleSheet.absoluteFill, { zIndex: 1000, backgroundColor: '#000' }]}
            >
              {/* Fondo del juego oscurecido */}
              {item.backgroundImage ? (
                <Image
                  source={item.backgroundImage}
                  style={[StyleSheet.absoluteFillObject, { opacity: 0.4 }]}
                  contentFit="cover"
                />
              ) : item.image ? (
                <Image
                  source={item.image}
                  style={[StyleSheet.absoluteFillObject, { opacity: 0.4 }]}
                  contentFit="cover"
                />
              ) : null}

              {/* Gradiente oscuro */}
              {Platform.OS === 'web' && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.3) 100%)',
                  pointerEvents: 'none',
                } as any} />
              )}

              <View style={styles.launchingOverlay}>
                <Animated.View
                  entering={FadeInDown.delay(300).duration(800)}
                  style={{ alignItems: 'center', marginBottom: 40 }}
                >
                  {item.logo ? (
                    <Image
                      source={item.logo}
                      style={{ width: 450, height: 180, marginBottom: 20 }}
                      contentFit="contain"
                    />
                  ) : (
                    <Text style={[styles.launchingText, { fontSize: 42, fontWeight: '200', letterSpacing: 2 }]}>
                      {item.title}
                    </Text>
                  )}
                </Animated.View>
              </View>
            </Animated.View>
          )}
        </View>

        {/* MEDIA LIGHTBOX MODAL */}
        <Modal
          visible={selectedMediaIndex !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedMediaIndex(null)}
        >
          <View style={styles.lightboxOverlay}>
            {/* Cierre con clic fuera */}
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setSelectedMediaIndex(null)}
            />

            {/* Contenido */}
            <View style={styles.lightboxContent} pointerEvents="box-none">
              {selectedMedia?.type === 'movie' && selectedMedia.mp4_url ? (
                <Video
                  source={{ uri: selectedMedia.mp4_url }}
                  style={styles.lightboxVideo}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  useNativeControls
                />
              ) : selectedMedia?.type === 'movie' && (selectedMedia as any).youtube_id ? (
                // Videos de IGDB: no hay archivo .mp4, solo un video_id de
                // YouTube. Se reproduce con el wrapper de react-native-youtube-iframe.
                <YoutubePlayer
                  key={(selectedMedia as any).youtube_id}
                  height={lightboxPlayerHeight}
                  width={lightboxPlayerWidth}
                  videoId={(selectedMedia as any).youtube_id}
                  play
                />
              ) : selectedMedia?.full ? (
                <Image
                  source={{ uri: selectedMedia.full }}
                  style={styles.lightboxImage}
                  contentFit="contain"
                />
              ) : null}

              {/* Botón cerrar */}
              <TouchableOpacity
                style={styles.lightboxCloseBtn}
                onPress={() => setSelectedMediaIndex(null)}
              >
                <Ionicons name="close" size={s(24)} color="#FFF" />
              </TouchableOpacity>

              {/* Badge tipo */}
              {selectedMedia?.type === 'movie' && (
                <View style={styles.lightboxBadge}>
                  <Ionicons name="play-circle" size={s(14)} color="#FFF" />
                  <Text style={styles.lightboxBadgeText}>Trailer</Text>
                </View>
              )}

              {/* Contador */}
              {steamMedia.length > 1 && selectedMediaIndex !== null && (
                <View style={styles.lightboxCounter}>
                  <Text style={styles.lightboxCounterText}>
                    {selectedMediaIndex + 1} / {steamMedia.length}
                  </Text>
                </View>
              )}
            </View>

            {/* Flecha anterior */}
            {selectedMediaIndex !== null && selectedMediaIndex > 0 && (
              <TouchableOpacity
                style={[styles.lightboxArrow, styles.lightboxArrowLeft]}
                onPress={() => setSelectedMediaIndex(prev => prev !== null ? prev - 1 : prev)}
              >
                <Ionicons name="chevron-back" size={s(28)} color="#FFF" />
              </TouchableOpacity>
            )}

            {/* Flecha siguiente */}
            {selectedMediaIndex !== null && selectedMediaIndex < steamMedia.length - 1 && (
              <TouchableOpacity
                style={[styles.lightboxArrow, styles.lightboxArrowRight]}
                onPress={() => setSelectedMediaIndex(prev => prev !== null ? prev + 1 : prev)}
              >
                <Ionicons name="chevron-forward" size={s(28)} color="#FFF" />
              </TouchableOpacity>
            )}

            {/* Miniaturas bottom strip */}
            {steamMedia.length > 1 && (
              <View style={styles.lightboxStrip} pointerEvents="box-none">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.lightboxStripContent}
                >
                  {steamMedia.map((m, i) => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setSelectedMediaIndex(i)}
                      style={[
                        styles.lightboxThumb,
                        selectedMediaIndex === i && styles.lightboxThumbActive,
                      ]}
                    >
                      <Image
                        source={{ uri: m.thumbnail }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                      {m.type === 'movie' && (
                        <View style={styles.lightboxThumbPlay}>
                          <Ionicons name="play" size={s(10)} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </Modal>

        {/* EDIT MODAL */}
        <Modal visible={isEditModalVisible} transparent animationType="fade">
          <View style={styles.editViewContainer}>
            {/* background video */}
            <BackgroundVideo
              source={require('../assets/video/waves_ajustes.mp4')}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              shouldPlay
              isLooping
              muted
            />
            {/* subtle dark overlay */}
            <View style={styles.editOverlayDark} />

            <View style={styles.editContentContainer}>
              {/* Title Header */}
              <Text style={styles.editMainTitleLarge}>{t('edit.title')}</Text>

              {/* Two Column Layout */}
              <View style={styles.editTwoColumns}>
                {/* SIDEBAR TABS */}
                <View style={styles.editSidebar}>
                  {[
                    { id: 'basic', label: t('edit.basic'), icon: 'information-circle-outline', index: 23 },
                    { id: 'path', label: t('edit.path'), icon: 'folder-open-outline', index: 24 },
                    { id: 'art', label: t('edit.art'), icon: 'image-outline', index: 25 },
                  ].map((tab) => {
                    const isTabActive = activeTab === tab.id;
                    const isTabFocused = editModalFocusIndex === tab.index;

                    return (
                      <TouchableOpacity
                        key={tab.id}
                        style={[
                          styles.editTab,
                          isTabActive && styles.editTabActive,
                          isTabFocused && styles.editTabFocused
                        ]}
                        onPress={() => {
                          setEditModalFocusIndex(tab.index);
                          setActiveTab(tab.id as any);
                        }}
                      >
                        <Ionicons
                          name={tab.icon as any}
                          size={s(22)}
                          color={isTabActive ? '#FFF' : 'rgba(255, 255, 255, 0.6)'}
                        />
                        <Text style={[
                          styles.editTabText,
                          isTabActive && styles.editTabTextActive
                        ]}>
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* RIGHT CONTENT AREA */}
                <View style={styles.editMainContent}>
                  <View style={{ flex: 1 }}>
                    {activeTab === 'basic' && (
                      <>
                        <Text style={styles.editSectionTitle}>{t('edit.basic')}</Text>
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                          <Text style={styles.editLabel}>{t('edit.gameTitle')}</Text>
                          <TextInput
                            ref={editTitleRef}
                            style={[styles.editInput, editModalFocusIndex === 2 && styles.editInputFocused]}
                            value={editData.title}
                            onChangeText={(text) => setEditData({ ...editData, title: text })}
                            onFocus={() => setEditModalFocusIndex(2)}
                          />

                          {((editData.type || item?.type) !== 'media' && (editData.type || item?.type) !== 'web') && (
                            <>
                              <Text style={styles.editLabel}>{t('library.sortPlatform')}</Text>
                              <View style={{ marginBottom: 25 }}>
                                <ScrollView ref={editPlatformScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformScrollContent}>
                                  {PLATFORMS.map((plat, idx) => {
                                    const focusIdx = 3 + idx;
                                    const isActive = editData.platform === plat.id;
                                    const isFocused = editModalFocusIndex === focusIdx;
                                    return (
                                      <TouchableOpacity
                                        key={plat.id}
                                        style={[
                                          styles.platformBtnNew,
                                          isActive && styles.platformBtnActiveNew,
                                          isFocused && styles.platformBtnFocusedNew
                                        ]}
                                        onPress={() => { setEditModalFocusIndex(focusIdx); setEditData({ ...editData, platform: plat.id }); }}
                                        onLayout={(e) => { editPlatformOffsets.current[idx] = e.nativeEvent.layout.x; }}
                                      >
                                        <MaterialCommunityIcons
                                          name={plat.icon as any}
                                          size={s(20)}
                                          color={isActive ? '#000' : '#FFF'}
                                        />
                                        <Text style={[
                                          styles.platformBtnTextNew,
                                          isActive && styles.platformBtnTextActiveNew
                                        ]}>
                                          {plat.id}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </ScrollView>
                              </View>
                            </>
                          )}

                          <Text style={styles.editLabel}>{t('edit.description')}</Text>
                          <TextInput
                            ref={editDescRef}
                            style={[styles.editInput, { height: 140, textAlignVertical: 'top' }, editModalFocusIndex === 14 && styles.editInputFocused]}
                            multiline
                            value={editData.description}
                            onChangeText={(text) => setEditData({ ...editData, description: text })}
                            onFocus={() => setEditModalFocusIndex(14)}
                          />

                          {(() => {
                            const raw = Number(editData.rating ?? 0);
                            const rating = raw > 5 ? raw / 20 : raw; // compatibilidad con valores viejos en escala 0-100
                            return (
                              <View>
                                <Text style={styles.editLabel}>{t('edit.rating')}</Text>
                                {rating > 0 ? (
                                  <View style={styles.editRatingRow}>
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <Ionicons
                                        key={n}
                                        name={rating >= n - 0.25 ? 'star' : rating >= n - 0.75 ? 'star-half' : 'star-outline'}
                                        size={s(22)}
                                        color="#FFD54A"
                                      />
                                    ))}
                                    <Text style={styles.editRatingValue}>{rating.toFixed(1)}</Text>
                                  </View>
                                ) : (
                                  <Text style={styles.editRatingEmpty}>{t('edit.noRating')}</Text>
                                )}
                              </View>
                            );
                          })()}
                        </ScrollView>
                      </>
                    )}

                    {activeTab === 'path' && (
                      <>
                        <Text style={styles.editSectionTitle}>{t('edit.path')}</Text>
                        <ScrollView showsVerticalScrollIndicator={false}>
                          <Text style={styles.editLabel}>{t('edit.executableLocation')}</Text>
                          {((editData.type || item?.type) === 'web') ? (
                            <TextInput
                              ref={editPathInputRef}
                              style={[styles.editInput, editModalFocusIndex === 22 && styles.editInputFocused]}
                              placeholder="URL (https://...)"
                              placeholderTextColor="#888"
                              value={editData.path}
                              onChangeText={(text) => setEditData({ ...editData, path: text })}
                              onFocus={() => setEditModalFocusIndex(22)}
                            />
                          ) : isSteamGame(editData.id ? { id: editData.id, platform: editData.platform } : item) ? (
                            <>
                              <TextInput
                                ref={editPathInputRef}
                                style={[styles.editInput, editModalFocusIndex === 22 && styles.editInputFocused]}
                                placeholder="steam://rungameid/..."
                                placeholderTextColor="#888"
                                value={editData.path}
                                onChangeText={(text) => setEditData({ ...editData, path: text })}
                                onFocus={() => setEditModalFocusIndex(22)}
                              />
                              <View style={styles.pathDisplayBox}>
                                <Text style={styles.pathDisplayTextHeader}>Lanzamiento vía Steam</Text>
                                <Text style={styles.pathDisplayText}>
                                  Este juego se ejecutará directamente desde Steam usando el protocolo steam://
                                </Text>
                              </View>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity
                                style={[styles.editSecondaryBtn, editModalFocusIndex === 22 && styles.editSecondaryBtnFocused]}
                                onPress={() => { setEditModalFocusIndex(22); handleSelectPath(); }}
                              >
                                <Ionicons name="folder-open-outline" size={s(20)} color="#FFF" />
                                <Text style={styles.editSecondaryBtnText}>{t('add.selectExe')}</Text>
                              </TouchableOpacity>
                              <View style={styles.pathDisplayBox}>
                                <Text style={styles.pathDisplayTextHeader}>{t('edit.currentPath')} </Text>
                                <Text style={styles.pathDisplayText}>{editData.path || t('edit.noPath')}</Text>
                              </View>

                              {isExternalExeGame && (
                                <>
                                  <Text style={[styles.editLabel, { marginTop: 20 }]}>{t('edit.launchArgs')}</Text>
                                  <TextInput
                                    ref={editLaunchArgsRef}
                                    style={[styles.editInput, editModalFocusIndex === 27 && styles.editInputFocused]}
                                    placeholder="-dx11 -windowed"
                                    placeholderTextColor="#888"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    value={editData.launchArgs}
                                    onChangeText={(text) => setEditData({ ...editData, launchArgs: text })}
                                    onFocus={() => setEditModalFocusIndex(27)}
                                  />
                                  <Text style={styles.pathDisplayText}>{t('edit.launchArgsHint')}</Text>
                                </>
                              )}
                            </>
                          )}
                        </ScrollView>
                      </>
                    )}

                    {activeTab === 'art' && (
                      <>
                        <Text style={styles.editSectionTitle}>{t('edit.art')}</Text>
                        <ScrollView showsVerticalScrollIndicator={false}>
                          <Text style={styles.editLabel}>{t('edit.smartSync')}</Text>
                          <View style={styles.syncRow}>
                            <TouchableOpacity
                              style={[styles.editSyncBtnUnified, isSyncing && { opacity: 0.7 }, editModalFocusIndex === 0 && styles.editSyncBtnUnifiedFocused]}
                              onPress={() => { setEditModalFocusIndex(0); handleUnifiedSync(); }}
                              disabled={isSyncing}
                            >
                              <Ionicons name="sync-outline" size={s(18)} color="#000" />
                              <Text style={styles.editSyncBtnUnifiedText}>{isSyncing ? t('edit.syncing') : t('edit.syncData')}</Text>
                            </TouchableOpacity>
                          </View>

                          <Text style={styles.editLabel}>{t('edit.localFiles')}</Text>
                          <View style={styles.artGrid}>
                            <TouchableOpacity
                              style={[styles.editArtFileBtn, editModalFocusIndex === 15 && styles.editArtFileBtnFocused]}
                              onPress={() => { setEditModalFocusIndex(15); openAssetSelector('capsule'); }}
                            >
                              <Ionicons name="image-outline" size={s(24)} color="#FFF" style={{ marginBottom: 6 }} />
                              <Text style={styles.artFileBtnTitle}>{t('edit.cover')}</Text>
                              <Text style={styles.artFileBtnSub}>{t('edit.coverSub')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.editArtFileBtn, editModalFocusIndex === 16 && styles.editArtFileBtnFocused]}
                              onPress={() => { setEditModalFocusIndex(16); openAssetSelector('logo'); }}
                            >
                              <Ionicons name="color-palette-outline" size={s(24)} color="#FFF" style={{ marginBottom: 6 }} />
                              <Text style={styles.artFileBtnTitle}>{t('edit.logoPng')}</Text>
                              <Text style={styles.artFileBtnSub}>{t('edit.transparent')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.editArtFileBtn, editModalFocusIndex === 17 && styles.editArtFileBtnFocused]}
                              onPress={() => { setEditModalFocusIndex(17); openAssetSelector('hero'); }}
                            >
                              <Ionicons name="images-outline" size={s(24)} color="#FFF" style={{ marginBottom: 6 }} />
                              <Text style={styles.artFileBtnTitle}>{t('edit.background')}</Text>
                              <Text style={styles.artFileBtnSub}>{t('edit.horizontal')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.editArtFileBtn, editModalFocusIndex === 18 && styles.editArtFileBtnFocused]}
                              onPress={() => { setEditModalFocusIndex(18); handleSelectVideo(); }}
                            >
                              <Ionicons name="videocam-outline" size={s(24)} color="#FFF" style={{ marginBottom: 6 }} />
                              <Text style={styles.artFileBtnTitle}>{t('edit.video')}</Text>
                              <Text style={styles.artFileBtnSub}>Trailer/Gameplay</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.editArtFileBtn, editModalFocusIndex === 26 && styles.editArtFileBtnFocused]}
                              onPress={() => { setEditModalFocusIndex(26); handleSelectFocusAudio(); }}
                            >
                              <Ionicons name="musical-notes-outline" size={s(24)} color="#FFF" style={{ marginBottom: 6 }} />
                              <Text style={styles.artFileBtnTitle}>Audio al enfocar</Text>
                              <Text style={styles.artFileBtnSub} numberOfLines={1}>
                                {editData.focusAudio ? 'Archivo seleccionado' : 'Música del juego en Inicio'}
                              </Text>
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
                      style={[styles.editDeleteBtn, editModalFocusIndex === 19 && styles.editDeleteBtnFocused]}
                      onPress={() => { setEditModalFocusIndex(19); handleDeleteApp(); }}
                    >
                      <Ionicons name="trash-outline" size={s(20)} color={editModalFocusIndex === 19 ? '#FFF' : '#FF3B30'} />
                    </TouchableOpacity>

                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 15 }}>
                      <TouchableOpacity
                        style={[styles.editSecondaryBtn, { paddingVertical: 14, paddingHorizontal: 24 }, editModalFocusIndex === 20 && styles.editSecondaryBtnFocused]}
                        onPress={() => { setEditModalFocusIndex(20); setEditModalVisible(false); }}
                      >
                        <Text style={styles.editSecondaryBtnText}>{t('common.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.editPrimaryBtn, editModalFocusIndex === 21 && styles.editPrimaryBtnFocused]}
                        onPress={() => { setEditModalFocusIndex(21); handleSaveEdit(); }}
                      >
                        <Text style={styles.editPrimaryBtnText}>{t('common.save')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* STEAMGRIDDB ASSET SELECTOR SCREEN OVERLAY */}
            {isAssetSelectorVisible && (
              <View style={styles.assetSelectorOverlay}>
                {/* background video */}
                <BackgroundVideo
                  source={require('../assets/video/waves_ajustes.mp4')}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                  shouldPlay
                  isLooping
                  muted
                />
                <View style={styles.editOverlayDark} />

                <View style={styles.editContentContainer}>
                  {/* Header */}
                  <View style={styles.assetHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                      <Text style={styles.editMainTitleLarge}>{t('edit.selectImage')}</Text>
                    </View>

                    {/* Tabs */}
                    <View style={styles.assetHeaderTabs}>
                      {[
                        { id: 'capsule', label: t('edit.capsule') },
                        { id: 'capsule_wide', label: t('edit.capsuleWide') },
                        { id: 'hero', label: t('edit.hero') },
                        { id: 'logo', label: 'Logo' },
                        { id: 'icon', label: t('edit.icon') },
                        { id: 'manage', label: t('edit.manage') },
                      ].map((tab, idx) => {
                        const isTabActive = assetSelectorTab === tab.id;
                        const isTabFocused = assetSelectorFocusArea === 'tabs' && tab.id === assetSelectorTab;
                        return (
                          <TouchableOpacity
                            key={tab.id}
                            style={[
                              styles.editTab,
                              { paddingVertical: 10, paddingHorizontal: 15, marginBottom: 0 },
                              isTabActive && styles.editTabActive,
                              isTabFocused && styles.editTabFocused
                            ]}
                            onPress={() => {
                              setAssetSelectorTab(tab.id as any);
                              setAssetSelectorFocusArea('tabs');
                              setGridFocusIndex(0);
                            }}
                          >
                            <Text style={[
                              styles.editTabText,
                              { fontSize: 15 },
                              isTabActive && styles.editTabTextActive
                            ]}>
                              {tab.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Filter and slider bar */}
                  <View style={styles.filterBar}>
                    <View style={styles.filterActions}>
                      {(isRawgEligibleTab(assetSelectorTab) || isIgdbEligibleTab(assetSelectorTab) || isPsnEligibleTab(assetSelectorTab)) && (
                        <View style={styles.sourceToggleRow}>
                          <TouchableOpacity
                            style={[styles.sourceToggleBtn, assetSource === 'steamgrid' && styles.sourceToggleBtnActive]}
                            onPress={() => {
                              setAssetSource('steamgrid');
                              setAssetSelectorFocusArea('filters');
                              setGridFocusIndex(0);
                              setCurrentPage(0);
                            }}
                          >
                            <Text style={[styles.sourceToggleText, assetSource === 'steamgrid' && styles.sourceToggleTextActive]}>
                              SteamGridDB
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.sourceToggleBtn, assetSource === 'rawg' && styles.sourceToggleBtnActive]}
                            onPress={() => {
                              setAssetSource('rawg');
                              setAssetSelectorFocusArea('filters');
                              setGridFocusIndex(0);
                              setCurrentPage(0);
                            }}
                          >
                            <Text style={[styles.sourceToggleText, assetSource === 'rawg' && styles.sourceToggleTextActive]}>
                              RAWG
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.sourceToggleBtn, assetSource === 'igdb' && styles.sourceToggleBtnActive]}
                            onPress={() => {
                              setAssetSource('igdb');
                              setAssetSelectorFocusArea('filters');
                              setGridFocusIndex(0);
                              setCurrentPage(0);
                            }}
                          >
                            <Text style={[styles.sourceToggleText, assetSource === 'igdb' && styles.sourceToggleTextActive]}>
                              IGDB
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.sourceToggleBtn, assetSource === 'psn' && styles.sourceToggleBtnActive]}
                            onPress={() => {
                              setAssetSource('psn');
                              setAssetSelectorFocusArea('filters');
                              setGridFocusIndex(0);
                              setCurrentPage(0);
                            }}
                          >
                            <Text style={[styles.sourceToggleText, assetSource === 'psn' && styles.sourceToggleTextActive]}>
                              PSN
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {assetSource !== 'rawg' && assetSource !== 'igdb' && assetSource !== 'psn' && (
                        <TouchableOpacity
                          style={[
                            styles.filterBtn,
                            assetSelectorFocusArea === 'filters' && filterFocusIndex === 0 && styles.filterBtnFocused
                          ]}
                          onPress={() => { setAssetSelectorFocusArea('filters'); setFilterFocusIndex(0); cycleDimensionFilter(); }}
                        >
                          <Ionicons name="funnel-outline" size={s(16)} color="#FFF" />
                          <Text style={styles.filterBtnText}>{getDimensionFilterLabel(selectedDimensionFilter)}</Text>
                        </TouchableOpacity>
                      )}

                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginLeft: 10, alignSelf: 'center' }}>v1.0.2</Text>

                      <TouchableOpacity
                        style={[
                          styles.filterBtn,
                          assetSelectorFocusArea === 'filters' && filterFocusIndex === 1 && styles.filterBtnFocused
                        ]}
                        onPress={() => { setAssetSelectorFocusArea('filters'); setFilterFocusIndex(1); handleLocalUpload(); }}
                      >
                        <Ionicons name="cloud-upload-outline" size={s(16)} color="#FFF" />
                        <Text style={styles.filterBtnText}>{t('edit.uploadImage')}</Text>
                      </TouchableOpacity>

                      {(assetSelectorTab === 'logo' || assetSelectorTab === 'hero') && (
                        <TouchableOpacity
                          style={[
                            styles.filterBtn,
                            assetSelectorFocusArea === 'filters' && filterFocusIndex === 2 && styles.filterBtnFocused
                          ]}
                          onPress={() => { setAssetSelectorFocusArea('filters'); setFilterFocusIndex(2); toastService.show(t('edit.logoAdjustMode')); }}
                        >
                          <Ionicons name="resize-outline" size={s(16)} color="#FFF" />
                          <Text style={styles.filterBtnText}>{t('edit.adjustLogoPosition')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.sliderWrapper}>
                      <Text style={styles.sliderLabel}>{t('edit.size')}</Text>
                      <View
                        ref={sliderContainerRef}
                        onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
                        {...(Platform.OS === 'web'
                          ? { onMouseDown: handleSliderMouseDown }
                          : { onTouchStart: handleSliderPress })}
                        style={[
                          styles.sliderContainer,
                          Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                          assetSelectorFocusArea === 'filters' && filterFocusIndex === 3 && styles.sliderFocused
                        ]}
                      >
                        <View style={styles.sliderTrackBackground} pointerEvents="none">
                          <View style={[styles.sliderTrackFill, { width: `${((sliderValue - 3) / 5) * 100}%` }]} />
                          <View style={[styles.sliderThumb, { left: `${((sliderValue - 3) / 5) * 100}%` }]} />
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* GRID OF ASSETS */}
                  <ScrollView
                    ref={assetGridScrollRef}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1 }}
                    scrollEventThrottle={16}
                    onScroll={(e) => {
                      assetGridScrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                    }}
                    onLayout={(e) => {
                      assetGridVisibleHeightRef.current = e.nativeEvent.layout.height;
                    }}
                  >
                    {(isLoadingAssets || (assetSource === 'rawg' && isLoadingRawgAssets) || (assetSource === 'igdb' && isLoadingIgdbAssets) || (assetSource === 'psn' && isLoadingPsnAssets)) ? (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                        <MaterialCommunityIcons name="loading" size={s(40)} color="#FFF" style={{ marginBottom: 12 }} />
                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>
                          {assetSource === 'rawg'
                            ? 'Buscando assets en RAWG...'
                            : assetSource === 'igdb'
                              ? 'Buscando assets en IGDB...'
                              : assetSource === 'psn'
                                ? 'Buscando assets en PSN...'
                                : 'Buscando assets en SteamGridDB...'}
                        </Text>
                      </View>
                    ) : assetSelectorTab === 'manage' ? (
                      <View style={{ flex: 1 }}>
                        <Text style={styles.editSectionTitle}>{t('edit.manageImages')}</Text>
                        <View style={[styles.gridContainer, { gap: 20 }]}>
                          {[
                            { title: t('edit.uploadCover'), desc: t('edit.coverSub'), icon: 'image-outline', index: 0 },
                            { title: t('edit.uploadLogo'), desc: t('edit.uploadLogoDesc'), icon: 'color-palette-outline', index: 1 },
                            { title: t('edit.uploadBg'), desc: t('edit.horizontal'), icon: 'images-outline', index: 2 },
                            { title: t('edit.resetAll'), desc: t('edit.resetAllDesc'), icon: 'trash-outline', index: 3, isDelete: true }
                          ].map((act) => {
                            const isFocused = assetSelectorFocusArea === 'grid' && gridFocusIndex === act.index;
                            return (
                              <TouchableOpacity
                                key={act.index}
                                style={[
                                  styles.manageCard,
                                  act.isDelete && { backgroundColor: 'rgba(255, 45, 85, 0.05)', borderColor: 'rgba(255, 45, 85, 0.2)' },
                                  isFocused && (act.isDelete ? styles.manageCardDeleteFocused : styles.manageCardFocused)
                                ]}
                                onPress={() => { setAssetSelectorFocusArea('grid'); setGridFocusIndex(act.index); handleManageAction(act.index); }}
                              >
                                <Ionicons
                                  name={act.icon as any}
                                  size={s(40)}
                                  color={act.isDelete ? '#FF3B30' : '#FFF'}
                                  style={{ marginBottom: 12 }}
                                />
                                <Text style={styles.manageCardTitle}>{act.title}</Text>
                                <Text style={styles.manageCardDesc}>{act.desc}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ) : currentList.length === 0 ? (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                        <Ionicons name="images-outline" size={s(48)} color="rgba(255,255,255,0.2)" style={{ marginBottom: 12 }} />
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>No se encontraron imágenes en esta categoría.</Text>
                      </View>
                    ) : (
                      <View style={styles.gridContainer}>
                        {paginatedList.map((asset, idx) => {
                          const isFocused = assetSelectorFocusArea === 'grid' && gridFocusIndex === idx;
                          const numColsLocal = Math.round(sliderValue);
                          const isFirstInRow = idx % numColsLocal === 0;
                          const cardWidthPercent = `${100 / Math.round(sliderValue) - 1.5}%`;

                          let cardAspectRatio = 2 / 3;
                          if (assetSelectorTab === 'capsule' || assetSelectorTab === 'capsule_wide') {
                            if (asset.width > 0 && asset.height > 0) {
                              cardAspectRatio = asset.width / asset.height;
                            } else {
                              cardAspectRatio = assetSelectorTab === 'capsule_wide' ? 16 / 7.5 : 2 / 3;
                            }
                          } else if (assetSelectorTab === 'hero') {
                            cardAspectRatio = 16 / 9;
                          } else if (assetSelectorTab === 'logo') {
                            cardAspectRatio = 16 / 10;
                          } else if (assetSelectorTab === 'icon') {
                            cardAspectRatio = 1;
                          }

                          const isSelected = isAssetCurrentlySelected(asset);

                          return (
                            <TouchableOpacity
                              key={`${asset.id}_${idx}`}
                              style={[
                                styles.assetCard,
                                { width: cardWidthPercent },
                                isFocused && styles.assetCardFocused,
                                isSelected && styles.assetCardSelected,
                              ]}
                              onLayout={(e) => {
                                cardLayoutsRef.current[idx] = {
                                  y: e.nativeEvent.layout.y,
                                  height: e.nativeEvent.layout.height,
                                };
                              }}
                              onPress={() => { setAssetSelectorFocusArea('grid'); setGridFocusIndex(idx); applySelectedAsset(asset.url); }}
                            >
                              <View style={[
                                styles.assetCardImageWrapper,
                                { aspectRatio: cardAspectRatio },
                                assetSelectorTab === 'logo' && styles.logoBgWrapper
                              ]}>
                                <Image
                                  source={{ uri: asset.thumb || asset.url }}
                                  style={styles.assetCardImage}
                                  contentFit={assetSelectorTab === 'logo' ? "contain" : "cover"}
                                />
                                {(asset.width > 0 && asset.height > 0) ? (
                                  <View style={styles.resolutionBadge}>
                                    <Text style={styles.resolutionText}>{asset.width}x{asset.height}</Text>
                                  </View>
                                ) : null}
                                {isSelected ? (
                                  <View style={styles.selectedCheckBadge}>
                                    <Ionicons name="checkmark" size={s(14)} color="#000" />
                                  </View>
                                ) : null}
                              </View>
                              <View style={styles.assetCardInfo}>
                                {asset.author ? (
                                  <>
                                    <Image
                                      source={asset.author.avatar ? { uri: asset.author.avatar } : require('../assets/images/Home.png')}
                                      style={styles.authorAvatar}
                                      contentFit="cover"
                                    />
                                    <Text style={styles.authorName} numberOfLines={1}>
                                      {asset.author.name || 'Anonymous'}
                                    </Text>
                                  </>
                                ) : (
                                  <Text style={styles.authorName} numberOfLines={1}>
                                    {assetSource === 'rawg' ? 'RAWG' : assetSource === 'igdb' ? 'IGDB' : assetSource === 'psn' ? 'PSN' : 'SteamGridDB'}
                                  </Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </ScrollView>

                  {/* Bottom navigation helper */}
                  <View style={styles.bottomBarPrompts}>
                    <View style={styles.promptLeft}>
                      <Ionicons name="game-controller-outline" size={s(20)} color="#FFF" />
                      <Text style={styles.promptLeftText}>{t('edit.menu')}</Text>
                    </View>
                    <View style={styles.promptRight}>
                      <View style={styles.promptItem}>
                        <View style={styles.promptBtnBadge}>
                          <PSIcon
                            char={PSIcons.r1}
                            size={s(22)}
                            color='#fff'

                          />
                          <Text style={styles.promptBtnText}>/</Text>
                          <PSIcon
                            char={PSIcons.l1}
                            size={s(22)}
                            color='#fff'
                          />
                        </View>
                        <Text style={styles.promptItemText}>{t('edit.tab')}</Text>
                      </View>
                      <View style={styles.promptItem}>
                        <View style={styles.promptBtnBadge}>
                          <PSIcon
                            char={PSIcons.l2}
                            size={s(22)}
                            color='#fff'
                          />
                          <Text style={styles.promptBtnText}>/</Text>
                          <PSIcon
                            char={PSIcons.r2}
                            size={s(22)}
                            color='#fff'
                          />
                        </View>
                        <Text style={styles.promptItemText}>{t('edit.page')}({currentPage + 1}/{totalPages || 1})</Text>
                      </View>
                      <View style={styles.promptItem}>
                        <View style={styles.promptBtnBadge}>
                          <PSIcon
                            char={PSIcons.square}
                            size={s(22)}
                            color='#fff'

                          />
                        </View>
                        <Text style={styles.promptItemText}>{t('edit.filters')}</Text>
                      </View>
                      <View style={styles.promptItem}>
                        <View style={styles.promptBtnBadge}>
                          <PSIcon
                            char={PSIcons.cross}
                            size={s(22)}
                            color='#fff'

                          />
                        </View>
                        <Text style={styles.promptItemText}>{t('common.select')}</Text>
                      </View>
                      <View style={styles.promptItem}>
                        <View style={styles.promptBtnBadge}>
                          <PSIcon
                            char={PSIcons.circle}
                            size={s(22)}
                            color='#fff'

                          />
                        </View>
                        <Text style={styles.promptItemText}>{t('common.back')}</Text>
                      </View>

                      <TouchableOpacity
                        style={styles.promptSaveItem}
                        onPress={() => {
                          soundService.playActivation?.();
                          setAssetSelectorVisible(false);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.promptBtnBadge}>
                          <PSIcon
                            char={PSIcons.options}
                            size={s(22)}
                            color='#000'
                          />
                        </View>
                        <Text style={styles.promptSaveItemText}>{t('common.save') || 'Guardar'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        </Modal>
      </Modal>

      <DeleteConfirmView
        visible={isDeleteConfirmVisible}
        item={{ title: editData.title || item.title, image: resolveEditSource(editData.image) ?? item.image }}
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={handleConfirmDeleteApp}
      />
    </>
  );
};

type ScaleFn = (px: number) => number;

const createStyles = (s: ScaleFn) => StyleSheet.create({
  detailContainer: {
    flex: 1,
    backgroundColor: '#000',
    outlineStyle: 'none',
  } as any,
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
    bottom: s(0),
    left: s(0),
    right: s(0),
    top: '10%',
    zIndex: 10,
  },

  // === TOP HEADER (game image + title, replaces back button) ===
  topHeader: {
    position: 'absolute',
    top: s(40),
    left: s(40),
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
  },
  topHeaderImage: {
    width: s(48),
    height: s(48),
    borderRadius: s(10),
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  topHeaderTitle: {
    color: '#FFFFFF',
    fontSize: s(16),
    fontWeight: '500',
    letterSpacing: 0.3,
    maxWidth: s(300),
    opacity: 0.9,
  },

  // === STEAM MEDIA / NEWS ===
  newsSectionWrapper: {
    marginTop: s(30),
  },
  newsScrollContent: {
    gap: s(16),
  },
  newsCard: {
    width: s(500),
    height: s(250),
    borderRadius: s(8),
    backgroundColor: 'rgba(20,20,30,0.4)',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  } as any,
  newsCard2: {
    width: s(320),
    borderRadius: s(8),
    backgroundColor: 'rgba(20,20,30,0.4)',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  } as any,
  newsCardFocused: {
    borderColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1.5,
    backgroundColor: 'rgba(35,35,45,0.6)',
    // transform: [{ scale: 1.03 }],
  } as any,
  newsCardThumbnail: {
    width: '100%',
    height: s(281),
    backgroundColor: '#333',
    position: 'relative',
  },
  newsCardContent: {
    padding: s(12),
    zIndex: 2,
  },
  newsCardTitle: {
    color: '#FFF',
    fontSize: s(14),
    fontWeight: '500',
    lineHeight: s(20),
    marginBottom: s(6),
  },
  newsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    paddingVertical: s(8),
  },
  newsEmptyText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: s(11),
    fontStyle: 'italic',
  },
  mediaPlayBadge: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 2,
  },
  infoCardsRow: {
    flexDirection: 'row',
    gap: s(16),
    marginTop: s(20),
  },
  infoCard: {
    padding: s(16),
    borderRadius: s(12),
    backgroundColor: 'rgb(38 41 47)',
    borderWidth: 1,
    borderColor: 'rgb(38 41 47)',
    minWidth: s(350),
    justifyContent: 'center',
  } as any,
  infoCardFocused: {
    borderColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1.5,
    //backgroundColor: 'rgba(40,40,50,0.6)',
    //transform: [{ scale: 0.99 }],
  } as any,
  detailBack: {
    position: 'absolute',
    top: s(40),
    left: s(40),
    zIndex: 30,
    width: s(50),
    height: s(50),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: s(25),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  favoriteButton: {
    position: 'absolute',
    top: s(40),
    right: 520, // Adjusted to be outside the info panel or inside it? Let's put it inside info panel or top right of the whole screen.
    zIndex: 30,
    width: s(50),
    height: s(50),
    borderRadius: s(25),
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
    paddingLeft: s(80),
    paddingBottom: s(100)
  },
  detailLogo: {
    width: s(450),
    height: s(220),
    resizeMode: 'contain'
  },
  detailCover: {
    width: s(320),
    height: s(190),
    borderRadius: s(18),
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
    maxWidth: s(480),
    minWidth: s(380),
    height: '100%',
    overflow: 'hidden',
  },
  infoPanel: {
    flex: 1,
    padding: s(50),
    paddingTop: s(120),
  },
  detailTitle: {
    color: '#FFF',
    fontSize: s(34),
    fontWeight: '800',
    marginBottom: s(8),
    letterSpacing: 0.5
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: s(12),
    paddingVertical: s(4),
    borderRadius: s(6),
    marginBottom: s(12),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)'
  },
  platformText: {
    color: '#00FFFF',
    fontSize: s(12),
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: s(30)
  },
  ratingText: {
    color: '#FFD700',
    fontSize: s(18),
    fontWeight: 'bold',
    marginLeft: s(8)
  },
  detailActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: s(40)
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00BD10',
    paddingHorizontal: s(30),
    paddingVertical: s(15),
    borderRadius: s(14),
    marginRight: s(12),
    shadowColor: '#00BD10',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  playButtonText: {
    color: '#FFF',
    fontSize: s(16),
    fontWeight: '800',
    letterSpacing: 1
  },
  optionsButton: {
    width: s(54),
    height: s(54),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: s(14),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)'
  },
  detailScrollView: {
    flex: 1
  },
  detailDescription: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
    lineHeight: s(24),
    marginBottom: s(30),
    fontWeight: '400'
  },
  mediaContainer: {
    width: '100%',
    height: s(200),
    borderRadius: s(16),
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: s(10),
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
  sidebarTitle: { color: '#FFF', fontSize: 20, fontFamily: 'SSTBold', marginBottom: 25, letterSpacing: 0.5 },
  tabButton: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  tabButtonActive: { backgroundColor: 'rgba(0, 255, 255, 0.08)', borderColor: 'rgba(0, 255, 255, 0.15)' },
  tabButtonText: { color: '#8E8E93', fontSize: 15, fontFamily: 'SSTLight' },
  tabButtonTextActive: { color: '#00FFFF', fontFamily: 'SSTBold' },
  contentArea: { flex: 1, padding: 30, justifyContent: 'space-between', backgroundColor: '#1C1C1E' },
  sectionTitle: { color: '#FFF', fontSize: 22, fontFamily: 'SSTBold', marginBottom: 20 },
  pathDisplayBox: { backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: 10 },
  pathDisplayTextHeader: { color: '#8E8E93', fontSize: 12, fontFamily: 'SSTBold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  pathDisplayText: { color: '#FFF', fontSize: 14 },
  syncRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  syncBtnCompact: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD700', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  syncBtnTextCompact: { color: '#000', fontFamily: 'SSTBold', marginLeft: 6, fontSize: 12 },
  syncBtnUnified: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00FFFF', paddingVertical: 15, paddingHorizontal: 15, borderRadius: 12, shadowColor: '#00FFFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10 },
  artGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  artFileBtn: { width: '47%', backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  artFileBtnTitle: { color: '#FFF', fontSize: 14, fontFamily: 'SSTBold', marginTop: 6 },
  artFileBtnSub: { color: '#8E8E93', fontSize: 11, marginTop: 2 },
  modalDivider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)', marginVertical: 15, width: '100%' },
  modalTitle: { color: '#FFF', fontSize: 24, fontFamily: 'SSTBold', marginBottom: 25, textAlign: 'center' },
  label: { color: '#8E8E93', fontSize: 13, marginBottom: 8, marginLeft: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: '#000', color: '#FFF', padding: 16, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#333', fontSize: 16 },
  inputFocused: {
    borderColor: '#00FFFF',
    backgroundColor: '#0A0A0A',
  },
  platformScrollContent: { gap: 10, paddingVertical: 5 },
  platformBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  platformBtnActive: { borderColor: '#00FFFF', backgroundColor: '#00FFFF' },
  platformBtnText: { color: '#FFF', fontFamily: 'SSTBold', marginLeft: 6, fontSize: 12 },
  platformBtnTextActive: { color: '#000' },
  fileBtn: { backgroundColor: '#2C2C2E', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  fileBtnText: { color: '#FFF', marginLeft: 12, fontSize: 15, fontFamily: 'SSTLight' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  cancelBtn: { flex: 1, padding: 16, backgroundColor: '#3A3A3C', borderRadius: 12, marginRight: 10, alignItems: 'center' },
  cancelBtnText: { color: '#FFF', fontFamily: 'SSTBold', fontSize: 16 },
  saveBtn: { flex: 1, padding: 16, backgroundColor: '#00FFFF', borderRadius: 12, marginLeft: 10, alignItems: 'center' },
  saveBtnText: { color: '#000', fontFamily: 'SSTBold', fontSize: 16 },
  deleteBtn: {
    width: s(54),
    height: s(54),
    backgroundColor: 'rgba(255, 45, 85, 0.1)',
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: 'rgba(255, 45, 85, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: s(10)
  },
  syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD700', padding: 16, borderRadius: 12, marginBottom: 20 },
  syncBtnText: { color: '#000', fontFamily: 'SSTBold', marginLeft: 10, fontSize: 15 },
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
    fontSize: s(28),
    fontFamily: 'SSTBold',
    marginTop: s(25),
    letterSpacing: 6,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 255, 255, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },

  // === NEW FULL SCREEN EDIT VIEW ===
  editViewContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1000,
    outlineStyle: 'none',
  } as any,
  editOverlayDark: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 8, 12, 0.45)',
  },
  editContentContainer: {
    flex: 1,
    paddingTop: s(60),
    paddingBottom: s(40),
    paddingHorizontal: s(80),
  },
  editMainTitleLarge: {
    color: '#FFF',
    fontSize: s(40),
    fontWeight: '200',
    fontFamily: 'SSTLight',
    letterSpacing: 0.5,
    marginBottom: s(30),
  },
  editTwoColumns: {
    flex: 1,
    flexDirection: 'row',
    gap: s(60),
  },
  editSidebar: {
    width: s(320),
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    paddingRight: s(40),
    justifyContent: 'flex-start',
  },
  editTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: s(18),
    paddingHorizontal: s(20),
    marginBottom: s(10),
    borderWidth: 2,
    borderColor: 'transparent',
    gap: s(15),
  },
  editTabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  editTabFocused: {
    borderColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    borderRadius: s(5),
  },
  editTabText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: s(18),
    fontWeight: '400',
    fontFamily: 'SSTLight'
  },
  editTabTextActive: {
    color: '#FFF',
    fontFamily: 'SSTMedium',
  },
  editMainContent: {
    flex: 1,
    paddingHorizontal: s(40),
    paddingVertical: s(20),
  },
  editSectionTitle: {
    color: '#FFF',
    fontSize: s(26),
    fontWeight: '300',
    fontFamily: 'SSTLight',
    marginBottom: s(30),
  },
  editRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(4),
  },
  editRatingValue: {
    color: '#FFF',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
    marginLeft: s(10),
  },
  editRatingEmpty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: s(14),
    fontFamily: 'SSTLight',
  },
  editLabel: {
    color: '#8E8E93',
    fontSize: s(13),
    fontFamily: 'SSTMedium',
    marginBottom: s(15),
    //textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  editInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    color: '#FFF',
    padding: s(16),
    borderRadius: s(14),
    fontSize: s(16),
    fontFamily: 'SSTLight',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: s(20),
  },
  editInputFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  editSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: s(16),
    borderRadius: s(14),
    gap: s(12),
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  editSecondaryBtnFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  editSecondaryBtnText: {
    color: '#FFF',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
  },
  editPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: s(16),
    paddingHorizontal: s(24),
    borderRadius: s(14),
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  editPrimaryBtnFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  editPrimaryBtnText: {
    color: '#000',
    fontSize: s(16),
    fontFamily: 'SSTBold',
  },
  editDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 45, 85, 0.1)',
    paddingHorizontal: s(20),
    paddingVertical: s(16),
    borderRadius: s(14),
    borderWidth: 2,
    borderColor: 'rgba(255, 45, 85, 0.3)',
  },
  editDeleteBtnFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 45, 85, 0.3)',
  },
  platformBtnNew: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: s(12),
    paddingHorizontal: s(20),
    borderRadius: s(10),
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  platformBtnActiveNew: {
    backgroundColor: '#FFF',
    borderColor: '#FFF',
  },
  platformBtnTextNew: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'SSTRg', // fuente del badge
    marginLeft: s(6),
  },
  platformBtnTextActiveNew: {
    color: '#000',
    fontFamily: 'SSTBold', // fuente del badge activo
    marginLeft: s(6),
  },
  platformBtnFocusedNew: {
    borderColor: '#FFFFFF',
  },
  editArtFileBtn: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: s(20),
    borderRadius: s(14),
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editArtFileBtnFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  editSyncBtnUnified: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: s(16),
    paddingHorizontal: s(16),
    borderRadius: s(14),
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  editSyncBtnUnifiedFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  editSyncBtnUnifiedText: {
    color: '#000',
    fontFamily: 'SSTBold',
    marginLeft: s(8),
    fontSize: s(15),
  },

  // === MEDIA LIGHTBOX ===
  lightboxOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3000,
  },
  lightboxContent: {
    width: '82%',
    maxWidth: s(1060),
    aspectRatio: 16 / 9,
    borderRadius: s(14),
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxVideo: {
    width: '100%',
    height: '100%',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: s(14),
    right: s(14),
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lightboxBadge: {
    position: 'absolute',
    top: s(14),
    left: s(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: s(10),
    paddingVertical: s(5),
    borderRadius: s(8),
    zIndex: 10,
  },
  lightboxBadgeText: {
    color: '#FFF',
    fontSize: s(12),
    fontFamily: 'SSTMedium',
    letterSpacing: 0.5,
  },
  lightboxCounter: {
    position: 'absolute',
    bottom: s(14),
    right: s(14),
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: s(10),
    paddingVertical: s(5),
    borderRadius: s(8),
    zIndex: 10,
  },
  lightboxCounterText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: s(12),
    fontFamily: 'SSTMedium',
  },
  lightboxArrow: {
    position: 'absolute',
    top: '50%' as any,
    marginTop: s(-24),
    width: s(48),
    height: s(48),
    borderRadius: s(24),
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lightboxArrowLeft: {
    left: '8%' as any,
  },
  lightboxArrowRight: {
    right: '8%' as any,
  },
  lightboxStrip: {
    position: 'absolute',
    bottom: s(28),
    left: s(0),
    right: s(0),
    alignItems: 'center',
  },
  lightboxStripContent: {
    paddingHorizontal: s(20),
    gap: s(8),
    flexDirection: 'row',
    alignItems: 'center',
  },
  lightboxThumb: {
    width: s(80),
    height: s(46),
    borderRadius: s(6),
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    opacity: 0.55,
  },
  lightboxThumbActive: {
    borderColor: '#FFFFFF',
    opacity: 1,
  },
  lightboxThumbPlay: {
    position: 'absolute',
    inset: 0 as any,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // === STEAMGRIDDB ASSET SELECTOR ===
  assetSelectorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 2000,
  },
  assetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: s(8),
    flexWrap: 'wrap',
    gap: s(16),
  },
  assetHeaderTabs: {
    flexDirection: 'row',
    gap: s(6),
    flexWrap: 'wrap',
  },

  // Filter bar
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: s(20),
    gap: s(12),
    flexWrap: 'wrap',
  },
  filterActions: {
    flexDirection: 'row',
    gap: s(10),
    flexWrap: 'wrap',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: s(10),
    paddingHorizontal: s(18),
    borderRadius: s(10),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterBtnFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  filterBtnText: {
    color: '#FFF',
    fontSize: s(14),
    fontFamily: 'SSTMedium',
  },
  sourceToggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: s(10),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 3,
    gap: 2,
  },
  sourceToggleBtn: {
    paddingVertical: s(8),
    paddingHorizontal: s(14),
    borderRadius: s(8),
  },
  sourceToggleBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  sourceToggleText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: s(13),
    fontFamily: 'SSTMedium',
  },
  sourceToggleTextActive: {
    color: '#000',
    fontFamily: 'SSTBold',
  },
  sliderWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(14),
  },
  sliderLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: s(13),
    fontFamily: 'SSTMedium',
    letterSpacing: 0.5,
  },
  sliderContainer: {
    width: s(160),
    paddingVertical: s(8),
    paddingHorizontal: s(4),
    borderRadius: s(10),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sliderFocused: {
    borderColor: '#FFFFFF',
  },
  sliderTrackBackground: {
    width: '100%',
    height: s(4),
    borderRadius: s(2),
    backgroundColor: 'rgba(255,255,255,0.15)',
    position: 'relative',
    justifyContent: 'center',
  },
  sliderTrackFill: {
    height: s(4),
    borderRadius: s(2),
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    left: s(0),
  } as any,
  sliderThumb: {
    position: 'absolute',
    width: s(14),
    height: s(14),
    borderRadius: s(7),
    backgroundColor: '#FFFFFF',
    top: s(-5),
    marginLeft: s(-7),
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  } as any,

  // Asset grid
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: s(12),
    paddingBottom: s(30),
  },
  assetCard: {
    borderRadius: s(10),
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.03)',
  } as any,
  assetCardFocused: {
    borderColor: '#FFFFFF',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  } as any,
  assetCardSelected: {
    borderColor: '#4CD964',
  } as any,
  selectedCheckBadge: {
    position: 'absolute',
    top: s(8),
    left: s(8),
    width: s(24),
    height: s(24),
    borderRadius: s(12),
    backgroundColor: '#4CD964',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  } as any,
  assetCardImageWrapper: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  logoBgWrapper: {
    backgroundColor: '#1C1C2E',
  },
  assetCardImage: {
    width: '100%',
    height: '100%',
  },
  assetCardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    paddingHorizontal: s(10),
    paddingVertical: s(8),
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  authorAvatar: {
    width: s(20),
    height: s(20),
    borderRadius: s(10),
    backgroundColor: '#333',
  },
  authorName: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: s(12),
    fontFamily: 'SSTMedium',
    flex: 1,
  },

  // Manage tab cards
  manageCard: {
    flex: 1,
    minWidth: s(160),
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: s(16),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: s(28),
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageCardFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  manageCardDeleteFocused: {
    borderColor: '#FF3B30',
    backgroundColor: 'rgba(255,45,85,0.15)',
  },
  manageCardTitle: {
    color: '#FFF',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
    marginBottom: s(4),
    textAlign: 'center',
  },
  manageCardDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: s(13),
    textAlign: 'center',
  },

  // Bottom navigation prompts
  bottomBarPrompts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: s(16),
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    marginTop: s(8),
  },
  promptLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
  },
  promptLeftText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: s(13),
    fontFamily: 'SSTMedium',
    letterSpacing: 1,
  },
  promptRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.69)',
    gap: s(20),
  },
  promptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
  },
  promptSaveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    backgroundColor: '#4CD964',
    borderRadius: s(20),
    paddingLeft: s(6),
    paddingRight: s(16),
    paddingVertical: s(4),
    marginLeft: s(4),
  } as any,
  promptSaveItemText: {
    color: '#000',
    fontSize: s(15),
    fontFamily: 'SSTBold',
  },
  promptBtnBadge: {
    paddingHorizontal: s(8),
    paddingVertical: s(4),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(4),
  },
  promptBtnText: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTMedium',
  },
  promptItemText: {
    color: 'rgba(255, 255, 255, 1)',
    fontSize: s(15),
    fontFamily: 'SSTMedium',
  },
  resolutionBadge: {
    position: 'absolute',
    top: s(8),
    right: s(8),
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: s(7),
    paddingVertical: s(4),
    borderRadius: s(5),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 10,
  },
  resolutionText: {
    color: '#FFF',
    fontSize: s(11),
    fontWeight: '700',
    fontFamily: 'SSTRg',
  },
});


export default GameDetailView;