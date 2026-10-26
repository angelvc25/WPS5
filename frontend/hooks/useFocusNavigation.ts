/**
 * useFocusNavigation — gestiona todo el foco del teclado/mando en index.tsx.
 *
 * Patrón idéntico a useGamepadInput: el listener 'keydown' se registra UNA SOLA
 * VEZ (useEffect con deps []). Dentro del listener se lee siempre desde
 * optionsRef.current para acceder al estado más reciente sin re-registrarse.
 */
import type { ConsoleItem } from '@/app/(tabs)/index';
import type { LibraryGridHandle } from '@/components/LibraryGrid';
import {
    computeWidgetColumns,
    PANEL_WIDGETS,
    saveWidgetOrder,
    saveWidgetVisibility,
    WIDGET_COLUMN_CAPACITY,
    WidgetSizes,
    WidgetVisibility
} from '@/components/WidgetEditPanel';
import { soundService } from '@/services/soundService';
import type { SteamMediaItem } from '@/services/steamMediaService';
import type { SteamNewsItem } from '@/services/steamNewsService';
import type { StoreOffer } from '@/services/storeService';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ─────────────────────────────────────────────────────────────────────────────

export type FocusArea =
  | 'header_user'
  | 'header_tabs'
  | 'main_carousel'
  | 'game_panel'
  | 'footer'
  | 'welcome_widgets'
  | 'welcome_toolbar'
  | 'library_grid'
  | 'header_avatar';

const TABS: { id: string }[] = [{ id: 'Games' }, { id: 'Media' }];

// ─────────────────────────────────────────────────────────────────────────────
// Interfaz de opciones — todo lo que handleKeyDown necesita leer pero que NO
// se declara dentro del hook. Se accede siempre via optionsRef.current.
// ─────────────────────────────────────────────────────────────────────────────

export interface UseFocusNavigationOptions {
  // Estado de UI (permanece en index.tsx)
  activeTab: string;
  storeOffers: StoreOffer[];
  steamMedia: SteamMediaItem[];
  steamNews: SteamNewsItem[];
  achievementCount: number;
  lastPlayedGame: ConsoleItem | null;
  isLaunching: boolean;
  isSettingsVisible: boolean;
  isWelcomeSettingsVisible: boolean;
  isAddModalVisible: boolean;
  isHomeBgModalVisible: boolean;
  isSlidesModalVisible: boolean;
  isSearchVisible: boolean;
  isMediaGalleryVisible: boolean;
  isTrophiesVisible: boolean;
  isDetailVisible: boolean;
  isLibraryDetailVisible: boolean;
  isContextMenuOpen: boolean;
  isProfileMenuOpen: boolean;
  isFavoritesVisible: boolean;
  isRandomSelectorVisible: boolean;
  deleteConfirmItem: ConsoleItem | null;
  selectedMediaIndex: number | null;
  isSystemNavCardExpanded: boolean;
  isFriendsCardOpen: boolean;
  isNotificationsCardOpen: boolean;
  isUserModalVisible: boolean;
  activeUser: any;
  widgetVisibility: WidgetVisibility;
  widgetOrder: string[];
  widgetSizes: WidgetSizes;
  isPresentationMode: boolean;
  row1Visible: number[];
  row2Visible: number[];
  widgetColumns: ReturnType<typeof computeWidgetColumns>;
  PANEL_WIDGETS: typeof PANEL_WIDGETS;

  // Datos calculados derivados de storeOffers
  storeDeals: StoreOffer[];
  storeUpcoming: StoreOffer[];

  // Datos de useLibrary
  currentData: ConsoleItem[];
  libraryTab: 'installed' | 'collection';

  // Ref de tiempo de montaje (se calcula en index.tsx)
  mountTimeRef: React.MutableRefObject<number>;

  // Refs de scroll
  scrollRef: React.RefObject<ScrollView | null>;
  mainScrollRef: React.RefObject<any>;
  mediaScrollRef: React.RefObject<ScrollView | null>;
  newsScrollRef: React.RefObject<ScrollView | null>;
  widgetScrollRef: React.RefObject<ScrollView | null>;

  // Ref de LibraryGrid (API imperativa)
  libraryGridRef: React.RefObject<LibraryGridHandle | null>;

  // Systemn nav
  systemNavLevel: number;
  systemNavMaxCardIndex: number;
  profileMenuFocusIndex: number;
  contextMenuFocusIndex: number;
  modalSelectedIndex: number;

  // Callbacks que handleKeyDown llama
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  handleLaunchApp: (item: ConsoleItem) => void;
  openContextMenu: () => void;
  handleContextMenuAction: (index: number) => void;
  handleToggleFavorite: () => void;
  handleTogglePin: () => void;
  handleProfileMenuAction: (index: number) => void;
  handleSystemNavAction: (index: number) => void;
  setAddModalVisible: (v: boolean) => void;
  setFavoritesVisible: (v: boolean) => void;
  setRandomSelectorVisible: (v: boolean) => void;
  setHomeBgModalVisible: (v: boolean) => void;
  setWelcomeSettingsVisible: (v: boolean) => void;
  setDetailVisible: (v: boolean) => void;
  setDetailInitialEditMode?: (v: boolean) => void;
  setSelectedItem: (item: ConsoleItem | null) => void;
  setSearchVisible: (v: boolean) => void;
  setUserModalVisible: (v: boolean) => void;
  setSettingsVisible: (v: boolean) => void;
  setIsProfileMenuOpen: (v: boolean) => void;
  setProfileMenuFocusIndex: React.Dispatch<React.SetStateAction<number>>;
  setIsContextMenuOpen: (v: boolean) => void;
  setContextMenuFocusIndex: React.Dispatch<React.SetStateAction<number>>;
  setModalSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  setSystemNavLevel: React.Dispatch<React.SetStateAction<number>>;
  setSystemNavCardIndex: React.Dispatch<React.SetStateAction<number>>;
  setSystemNavCardExpanded: (v: boolean) => void;
  setInputMode: (mode: 'keyboard' | 'gamepad') => void;
  setSelectedMediaIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setTrophiesVisible: React.Dispatch<React.SetStateAction<boolean>>;
  saveWidgetOrder: typeof saveWidgetOrder;
  saveWidgetVisibility: typeof saveWidgetVisibility;
  setWidgetVisibility: React.Dispatch<React.SetStateAction<WidgetVisibility>>;
  setWidgetOrder: React.Dispatch<React.SetStateAction<string[]>>;
  setIsWidgetEditOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setWidgetEditFocusIndex: React.Dispatch<React.SetStateAction<number>>;
  resizeWidget: (id: string, delta: 1 | -1) => void;
  resetInteraction: () => void;
  setLibraryTab: React.Dispatch<React.SetStateAction<'installed' | 'collection'>>;
  setIsFriendsCardOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsNotificationsCardOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Dimensiones de ventana (para auto-scroll)
  windowWidth: number;
  windowHeight: number;

  // ITEM_WIDTH del carrusel (para auto-scroll horizontal)
  ITEM_WIDTH: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retorno del hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseFocusNavigationResult {
  focusArea: FocusArea;
  setFocusArea: React.Dispatch<React.SetStateAction<FocusArea>>;
  focusIndex: number;
  setFocusIndex: React.Dispatch<React.SetStateAction<number>>;
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  gamePanelFocusIndex: number;
  setGamePanelFocusIndex: React.Dispatch<React.SetStateAction<number>>;
  toolbarFocusIndex: number;
  setToolbarFocusIndex: React.Dispatch<React.SetStateAction<number>>;
  isLibraryFocused: boolean;
  setIsLibraryFocused: React.Dispatch<React.SetStateAction<boolean>>;
  libraryGridFocusIndex: number;
  setLibraryGridFocusIndex: React.Dispatch<React.SetStateAction<number>>;
  visibleLibraryGames: ConsoleItem[];
  setVisibleLibraryGames: React.Dispatch<React.SetStateAction<ConsoleItem[]>>;
  libraryTabsFocused: boolean;
  setLibraryTabsFocused: React.Dispatch<React.SetStateAction<boolean>>;
  libraryFilterFocused: boolean;
  setLibraryFilterFocused: React.Dispatch<React.SetStateAction<boolean>>;
  libraryFilterFromTabs: boolean;
  setLibraryFilterFromTabs: React.Dispatch<React.SetStateAction<boolean>>;
  isLibraryFilterPanelOpen: boolean;
  setIsLibraryFilterPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isWidgetEditOpen: boolean;
  setIsWidgetEditOpen: React.Dispatch<React.SetStateAction<boolean>>;
  widgetEditFocusIndex: number;
  setWidgetEditFocusIndex: React.Dispatch<React.SetStateAction<number>>;
  isWidgetMoveMode: boolean;
  setIsWidgetMoveMode: React.Dispatch<React.SetStateAction<boolean>>;
  movingWidgetId: string | null;
  setMovingWidgetId: React.Dispatch<React.SetStateAction<string | null>>;
  preMoveOrderBackup: string[];
  setPreMoveOrderBackup: React.Dispatch<React.SetStateAction<string[]>>;
  startWidgetMove: (id: string) => void;
  getWidgetNeighbor: (slot: number, dir: 'left' | 'right' | 'up' | 'down') => number | 'toolbar' | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook principal
// ─────────────────────────────────────────────────────────────────────────────

export function useFocusNavigation(options: UseFocusNavigationOptions): UseFocusNavigationResult {

  // ── Estados de foco ──────────────────────────────────────────────────────
  const [focusArea, setFocusArea] = useState<FocusArea>('main_carousel');
  const [focusIndex, setFocusIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(1);
  const [gamePanelFocusIndex, setGamePanelFocusIndex] = useState(0);
  const [toolbarFocusIndex, setToolbarFocusIndex] = useState(2);
  const [isLibraryFocused, setIsLibraryFocused] = useState(false);
  const [libraryGridFocusIndex, setLibraryGridFocusIndex] = useState(0);
  const [visibleLibraryGames, setVisibleLibraryGames] = useState<ConsoleItem[]>([]);
  const [libraryTabsFocused, setLibraryTabsFocused] = useState(false);
  const [libraryFilterFocused, setLibraryFilterFocused] = useState(false);
  const [libraryFilterFromTabs, setLibraryFilterFromTabs] = useState(false);
  const [isLibraryFilterPanelOpen, setIsLibraryFilterPanelOpen] = useState(false);
  const [isWidgetEditOpen, setIsWidgetEditOpen] = useState(false);
  const [widgetEditFocusIndex, setWidgetEditFocusIndex] = useState(0);
  const [isWidgetMoveMode, setIsWidgetMoveMode] = useState(false);
  const [movingWidgetId, setMovingWidgetId] = useState<string | null>(null);
  const [preMoveOrderBackup, setPreMoveOrderBackup] = useState<string[]>([]);

  // ── Ref de throttle para navegación rápida ────────────────────────────────
  const lastNavTime = useRef<number>(0);

  // ── Refs estables para el patrón de listener ──────────────────────────────
  // Se actualiza en cada render para que el listener singleton siempre vea el
  // estado actual (mismo patrón que callbacksRef en useGamepadInput).
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // ── Refs de estado propio del hook ────────────────────────────────────────
  // El listener también necesita leer los propios estados del hook. Como los
  // setState no cambian, sólo necesitamos refs para el estado leído.
  const focusAreaRef = useRef<FocusArea>('main_carousel');
  const focusIndexRef = useRef(0);
  const activeIndexRef = useRef(1);
  const gamePanelFocusIndexRef = useRef(0);
  const toolbarFocusIndexRef = useRef(2);
  const libraryGridFocusIndexRef = useRef(0);
  const visibleLibraryGamesRef = useRef<ConsoleItem[]>([]);
  const libraryTabsFocusedRef = useRef(false);
  const libraryFilterFocusedRef = useRef(false);
  const libraryFilterFromTabsRef = useRef(false);
  const isLibraryFilterPanelOpenRef = useRef(false);
  const isWidgetEditOpenRef = useRef(false);
  const widgetEditFocusIndexRef = useRef(0);
  const isWidgetMoveModeRef = useRef(false);
  const movingWidgetIdRef = useRef<string | null>(null);
  const preMoveOrderBackupRef = useRef<string[]>([]);

  // Sincronizar refs con el estado actual en cada render
  focusAreaRef.current = focusArea;
  focusIndexRef.current = focusIndex;
  activeIndexRef.current = activeIndex;
  gamePanelFocusIndexRef.current = gamePanelFocusIndex;
  toolbarFocusIndexRef.current = toolbarFocusIndex;
  libraryGridFocusIndexRef.current = libraryGridFocusIndex;
  visibleLibraryGamesRef.current = visibleLibraryGames;
  libraryTabsFocusedRef.current = libraryTabsFocused;
  libraryFilterFocusedRef.current = libraryFilterFocused;
  libraryFilterFromTabsRef.current = libraryFilterFromTabs;
  isLibraryFilterPanelOpenRef.current = isLibraryFilterPanelOpen;
  isWidgetEditOpenRef.current = isWidgetEditOpen;
  widgetEditFocusIndexRef.current = widgetEditFocusIndex;
  isWidgetMoveModeRef.current = isWidgetMoveMode;
  movingWidgetIdRef.current = movingWidgetId;
  preMoveOrderBackupRef.current = preMoveOrderBackup;

  // ── startWidgetMove ───────────────────────────────────────────────────────
  const startWidgetMove = useCallback((id: string) => {
    const { widgetOrder, setWidgetOrder: _setWidgetOrder } = optionsRef.current;
    setPreMoveOrderBackup([...widgetOrder]);
    setMovingWidgetId(id);
    setIsWidgetMoveMode(true);
    setIsWidgetEditOpen(false);
    setFocusArea('welcome_widgets');
    const slot = widgetOrder.indexOf(id);
    setFocusIndex(slot !== -1 ? slot : 0);
    soundService.playActivation?.();
  }, []);

  // ── getWidgetNeighbor ─────────────────────────────────────────────────────
  const getWidgetNeighbor = useCallback(
    (slot: number, dir: 'left' | 'right' | 'up' | 'down'): number | 'toolbar' | null => {
      const { widgetColumns } = optionsRef.current;
      const cap = WIDGET_COLUMN_CAPACITY;
      let c = -1, r = -1;
      widgetColumns.forEach((col, ci) =>
        col.forEach((it, ri) => {
          if (it.slot === slot) { c = ci; r = ri; }
        })
      );
      if (c < 0) return null;

      const centerOf = (ci: number, ri: number) => {
        const col = widgetColumns[ci];
        const total = col.reduce((sum, it) => sum + it.rows, 0);
        const before = col.slice(0, ri).reduce((sum, it) => sum + it.rows, 0);
        return (cap - total) + before + col[ri].rows / 2;
      };

      if (dir === 'down') return r < widgetColumns[c].length - 1 ? widgetColumns[c][r + 1].slot : null;
      if (dir === 'up') return r > 0 ? widgetColumns[c][r - 1].slot : 'toolbar';

      const tc = dir === 'right' ? c + 1 : c - 1;
      if (tc < 0 || tc >= widgetColumns.length) return null;

      const cy = centerOf(c, r);
      let best = 0, bestDiff = Infinity;
      widgetColumns[tc].forEach((_, ri) => {
        const d = Math.abs(centerOf(tc, ri) - cy);
        if (d < bestDiff) { bestDiff = d; best = ri; }
      });
      return widgetColumns[tc][best].slot;
    },
    []
  );

  // ── Listener de teclado — registrado UNA SOLA VEZ (deps: []) ─────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Leer siempre desde las refs para acceder al estado actual sin re-registrar el listener
      const o = optionsRef.current;
      const fa = focusAreaRef.current;
      const fi = focusIndexRef.current;
      const ai = activeIndexRef.current;
      const gpfi = gamePanelFocusIndexRef.current;
      const tfi = toolbarFocusIndexRef.current;
      const lgfi = libraryGridFocusIndexRef.current;
      const vlg = visibleLibraryGamesRef.current;
      const ltf = libraryTabsFocusedRef.current;
      const lff = libraryFilterFocusedRef.current;
      const lfft = libraryFilterFromTabsRef.current;
      const ilfpo = isLibraryFilterPanelOpenRef.current;
      const iweo = isWidgetEditOpenRef.current;
      const wefi = widgetEditFocusIndexRef.current;
      const iwmm = isWidgetMoveModeRef.current;
      const mwid = movingWidgetIdRef.current;
      const pmob = preMoveOrderBackupRef.current;

      // activeItem y canPlay se derivan del estado interno del hook
      const activeItem = o.currentData[ai];
      const canPlay = activeItem != null && !activeItem.isFolder && !activeItem.isGrid && activeItem.id !== '1' && activeItem.id !== 'more_library';

      // Prevenir scroll del documento cuando está activo Welcome Settings
      o.resetInteraction();
      if (o.isPresentationMode) return;
      if (Date.now() - o.mountTimeRef.current < 400) return;
      if (!( e as any).fromGamepad) o.setInputMode('keyboard');
      if (o.isWelcomeSettingsVisible) return;
      if (o.isSettingsVisible) return;
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) e.preventDefault();
      if (o.isLaunching) return;
      if (o.isMediaGalleryVisible) return;
      if (o.isTrophiesVisible) return;
      if (o.isDetailVisible || o.isLibraryDetailVisible) return;
      if (o.deleteConfirmItem) return;

      if (ilfpo) {
        // El panel de filtros está abierto: delegamos la navegación al ref de LibraryGrid
        if (e.key === 'ArrowDown') {
          o.libraryGridRef.current?.movePanelSelection('down');
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          o.libraryGridRef.current?.movePanelSelection('up');
          soundService.playNavigation();
        } else if (e.key === 'Enter' || e.key === ' ') {
          o.libraryGridRef.current?.activatePanelSelection();
          soundService.playActivation();
        } else if (e.key === 'Escape') {
          o.libraryGridRef.current?.closeFilterPanel();
          soundService.playBack();
        }
        return;
      }

      if (e.target && ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable)) return;
      if (o.isSearchVisible) return;

      // Throttle para pulsaciones rápidas de flechas
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const now = Date.now();
        if (now - lastNavTime.current < 130) return;
        lastNavTime.current = now;
      }

      // ── Menú de perfil ─────────────────────────────────────────────────────
      if (o.isProfileMenuOpen) {
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          o.setIsProfileMenuOpen(false);
          soundService.playBack();
        } else if (e.key === 'ArrowDown') {
          o.setProfileMenuFocusIndex(prev => Math.min(prev + 1, 4));
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          o.setProfileMenuFocusIndex(prev => Math.max(prev - 1, 0));
          soundService.playNavigation();
        } else if (e.key === 'Enter') {
          o.handleProfileMenuAction(o.profileMenuFocusIndex);
          soundService.playActivation();
        }
        return;
      }

      // ── Tecla Home → Control Center ────────────────────────────────────────
      if (e.key === 'Home') {
        soundService.playContextMenu();
        if (fa === 'header_user') {
          setFocusArea('main_carousel');
          o.setSystemNavCardExpanded(false);
        } else {
          setFocusArea('header_user');
          o.setModalSelectedIndex(0);
          o.setSystemNavCardIndex(0);
          o.setSystemNavLevel(1);
          o.setSystemNavCardExpanded(false);
        }
        soundService.playNavigation();
        return;
      }

      // ── Triángulo → Buscar ─────────────────────────────────────────────────
      if (e.key === 't' || e.key === 'T') {
        if (
          !o.isContextMenuOpen &&
          !o.isProfileMenuOpen &&
          !o.isAddModalVisible &&
          !o.isSettingsVisible &&
          !o.isUserModalVisible &&
          !o.isFavoritesVisible &&
          !o.isRandomSelectorVisible &&
          fa !== 'header_user'
        ) {
          soundService.playContextMenu();
          setFocusArea('header_avatar');
          setFocusIndex(0);
          o.setSearchVisible(true);
        }
        return;
      }

      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        soundService.playExitMenu();
        if (!o.isContextMenuOpen && !(fa === 'header_user') && !iwmm && !iweo) {
          setFocusArea('main_carousel');
        }
      }

      if (e.key === 'o' || e.key === 'O') {
        if (!o.isLaunching) {
          const willBeVisible = !o.isAddModalVisible;
          o.setAddModalVisible(willBeVisible);
          if (willBeVisible) {
            o.setUserModalVisible(false);
            o.setSettingsVisible(false);
            o.setFavoritesVisible(false);
            o.setHomeBgModalVisible(false);
          }
        }
        return;
      }

      // ── Menú contextual ────────────────────────────────────────────────────
      if (o.isContextMenuOpen) {
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          o.setIsContextMenuOpen(false);
          soundService.playBack();
        } else if (e.key === 'ArrowDown') {
          o.setContextMenuFocusIndex(prev => Math.min(prev + 1, 4));
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          o.setContextMenuFocusIndex(prev => Math.max(prev - 1, 0));
          soundService.playNavigation();
        } else if (e.key === 'Enter') {
          if (o.contextMenuFocusIndex === 3) {
            o.handleToggleFavorite();
          } else if (o.contextMenuFocusIndex === 4) {
            o.handleTogglePin();
          } else {
            o.handleContextMenuAction(o.contextMenuFocusIndex);
          }
          soundService.playActivation();
        }
        return;
      }

      // ── Control Center (header_user) ───────────────────────────────────────
      if (fa === 'header_user') {
        if (o.isFriendsCardOpen) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            o.setIsFriendsCardOpen(false);
            soundService.playBack?.();
          }
          return;
        }
        if (o.isNotificationsCardOpen) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            o.setIsNotificationsCardOpen(false);
            soundService.playBack?.();
          }
          return;
        }
        if (o.isSystemNavCardExpanded) {
          if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            o.setSystemNavCardExpanded(false);
            soundService.playBack();
          }
          return;
        }

        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          setFocusArea('main_carousel');
        } else if (e.key === 'ArrowUp') {
          if (o.systemNavLevel === 0) {
            o.setSystemNavLevel(1);
            soundService.playNavigation();
          }
        } else if (e.key === 'ArrowDown') {
          if (o.systemNavLevel === 1) {
            o.setSystemNavLevel(0);
            soundService.playNavigation();
          }
        } else if (e.key === 'ArrowRight') {
          if (o.systemNavLevel === 0) {
            o.setModalSelectedIndex(prev => Math.min(prev + 1, 10));
          } else {
            o.setSystemNavCardIndex(prev => Math.min(prev + 1, o.systemNavMaxCardIndex));
          }
          soundService.playNavigation();
        } else if (e.key === 'ArrowLeft') {
          if (o.systemNavLevel === 0) {
            o.setModalSelectedIndex(prev => Math.max(prev - 1, 0));
          } else {
            o.setSystemNavCardIndex(prev => Math.max(prev - 1, 0));
          }
          soundService.playNavigation();
        } else if (e.key === 'Enter') {
          if (o.systemNavLevel === 0) {
            o.handleSystemNavAction(o.modalSelectedIndex);
          } else {
            o.setSystemNavCardExpanded(true);
            soundService.playActivation?.();
          }
        }
        return;
      }

      // ── Menú de opciones / contexto (□/x/s sin widget edit ni move) ────────
      if (!iweo && !iwmm && (e.key === 'x' || e.key === 'X' || e.key === 'm' || e.key === 'M' || e.key === 's' || e.key === 'S')) {
        soundService.playContextMenu();
        if (fa === 'main_carousel') {
          const item = o.currentData[ai];
          if (item && item.id !== 'more_library') {
            o.openContextMenu();
          }
        }
        return;
      }

      if (o.isSettingsVisible) return;

      // ── Lightbox de medios ─────────────────────────────────────────────────
      if (o.selectedMediaIndex !== null) {
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          o.setSelectedMediaIndex(null);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          o.setSelectedMediaIndex(prev => prev !== null && prev < o.steamMedia.length - 1 ? prev + 1 : prev);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          o.setSelectedMediaIndex(prev => prev !== null && prev > 0 ? prev - 1 : prev);
        }
        return;
      }

      if (o.isAddModalVisible) {
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') o.setAddModalVisible(false);
        return;
      }
      if (o.isHomeBgModalVisible) return;
      if (o.isSlidesModalVisible) return;
      if (o.isSearchVisible) return;
      if (o.isRandomSelectorVisible) {
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') o.setRandomSelectorVisible(false);
        return;
      }
      if (o.isFavoritesVisible) {
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') o.setFavoritesVisible(false);
        return;
      }

      // ── Modo mover widget ──────────────────────────────────────────────────
      if (iwmm && mwid) {
        const currentSlot = o.widgetOrder.indexOf(mwid);

        if (e.key === 'ArrowLeft') {
          if ((currentSlot >= 1 && currentSlot <= 4) || (currentSlot >= 6 && currentSlot <= 9)) {
            const targetSlot = currentSlot - 1;
            const nextOrder = [...o.widgetOrder];
            const temp = nextOrder[currentSlot];
            nextOrder[currentSlot] = nextOrder[targetSlot];
            nextOrder[targetSlot] = temp;
            o.setWidgetOrder(nextOrder);
            setFocusIndex(targetSlot);
            soundService.playNavigation();
          }
          return;
        }

        if (e.key === 'ArrowRight') {
          if ((currentSlot >= 0 && currentSlot <= 3) || (currentSlot >= 5 && currentSlot <= 8)) {
            const targetSlot = currentSlot + 1;
            const nextOrder = [...o.widgetOrder];
            const temp = nextOrder[currentSlot];
            nextOrder[currentSlot] = nextOrder[targetSlot];
            nextOrder[targetSlot] = temp;
            o.setWidgetOrder(nextOrder);
            setFocusIndex(targetSlot);
            soundService.playNavigation();
          }
          return;
        }

        if (e.key === 'ArrowDown') {
          if (currentSlot >= 0 && currentSlot <= 4) {
            const targetSlot = currentSlot + 5;
            const nextOrder = [...o.widgetOrder];
            const temp = nextOrder[currentSlot];
            nextOrder[currentSlot] = nextOrder[targetSlot];
            nextOrder[targetSlot] = temp;
            o.setWidgetOrder(nextOrder);
            setFocusIndex(targetSlot);
            soundService.playNavigation();
          }
          return;
        }

        if (e.key === 'ArrowUp') {
          if (currentSlot >= 5 && currentSlot <= 9) {
            const targetSlot = currentSlot - 5;
            const nextOrder = [...o.widgetOrder];
            const temp = nextOrder[currentSlot];
            nextOrder[currentSlot] = nextOrder[targetSlot];
            nextOrder[targetSlot] = temp;
            o.setWidgetOrder(nextOrder);
            setFocusIndex(targetSlot);
            soundService.playNavigation();
          }
          return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
          saveWidgetOrder(o.widgetOrder);
          setIsWidgetMoveMode(false);
          setMovingWidgetId(null);
          setIsWidgetEditOpen(true);
          const panelIdx = PANEL_WIDGETS.findIndex(w => w.id === mwid);
          if (panelIdx !== -1) setWidgetEditFocusIndex(panelIdx);
          soundService.playActivation?.();
          return;
        }

        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          if (pmob.length > 0) {
            o.setWidgetOrder(pmob);
          }
          setIsWidgetMoveMode(false);
          setMovingWidgetId(null);
          setIsWidgetEditOpen(true);
          const panelIdx = PANEL_WIDGETS.findIndex(w => w.id === mwid);
          if (panelIdx !== -1) setWidgetEditFocusIndex(panelIdx);
          soundService.playNavigation();
          return;
        }

        return;
      }

      // ── Panel de edición de widgets ────────────────────────────────────────
      if (iweo) {
        if (e.key === 'ArrowDown') {
          soundService.playNavigation();
          setWidgetEditFocusIndex(prev => Math.min(prev + 1, PANEL_WIDGETS.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          soundService.playNavigation();
          setWidgetEditFocusIndex(prev => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          soundService.playActivation?.();
          const currentWidget = PANEL_WIDGETS[wefi];
          if (currentWidget) {
            o.setWidgetVisibility(prev => {
              const next = { ...prev, [currentWidget.id]: prev[currentWidget.id] === false ? true : false };
              saveWidgetVisibility(next);
              return next;
            });
          }
          return;
        }
        // Cuadrado (x/X) → modo mover
        if (e.key === 'x' || e.key === 'X') {
          const currentWidget = PANEL_WIDGETS[wefi];
          if (currentWidget) {
            // Llama a la función startWidgetMove de este mismo hook a través de la ref de la función
            startWidgetMoveFnRef.current(currentWidget.id);
          }
          return;
        }
        // L1 (q) = Reducir · R1 (e) = Ampliar
        if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
          const currentWidget = PANEL_WIDGETS[wefi];
          if (currentWidget) {
            o.resizeWidget(currentWidget.id, (e.key === 'q' || e.key === 'Q') ? -1 : 1);
          }
          return;
        }
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          setIsWidgetEditOpen(false);
          return;
        }
        return;
      }

      // ── Navegación espacial ────────────────────────────────────────────────
      if (e.key === 'ArrowRight') {
        soundService.playNavigation();
        if (fa === 'library_grid') {
          if (lff) {
            setLibraryFilterFocused(false);
            if (lfft) setLibraryTabsFocused(true);
          } else if (ltf) {
            if (o.libraryTab !== 'collection') {
              o.setLibraryTab('collection');
              setLibraryGridFocusIndex(0);
            }
          } else {
            setLibraryGridFocusIndex(prev => Math.min(prev + 1, vlg.length - 1));
          }
        } else if (fa === 'header_avatar') {
          if (fi < 2) setFocusIndex(prev => prev + 1);
        } else if (fa === 'main_carousel') {
          const nextIdx = Math.min(ai + 1, o.currentData.length - 1);
          setActiveIndex(nextIdx);
          setFocusIndex(nextIdx);
        } else if (fa === 'header_tabs') {
          if (fi < TABS.length - 1) {
            setFocusIndex(fi + 1);
          } else {
            setFocusArea('header_avatar');
            setFocusIndex(0);
          }
        } else if (fa === 'game_panel') {
          if (activeItem?.id === '5') {
            if (gpfi < 10) {
              // Deals row
              const nextIdx = Math.min(gpfi + 1, o.storeDeals.length - 1);
              setGamePanelFocusIndex(nextIdx);
            } else if (gpfi >= 10 && gpfi < 20) {
              // Upcoming row
              const nextIdx = Math.min(gpfi + 1, 10 + o.storeUpcoming.length - 1);
              setGamePanelFocusIndex(nextIdx);
            }
          } else {
            if (gpfi === 0) {
              setGamePanelFocusIndex(1);
            } else if (gpfi === 2) {
              setGamePanelFocusIndex(3);
            } else if (gpfi === 300) {
              // Ficha de metadatos: no hay avance horizontal
            } else if (gpfi >= 200) {
              setGamePanelFocusIndex(prev => Math.min(prev + 1, 200 + o.achievementCount - 1));
            } else if (gpfi >= 100) {
              setGamePanelFocusIndex(prev => Math.min(prev + 1, 100 + o.steamMedia.length - 1));
            } else if (gpfi >= 4) {
              const panelItem = o.currentData[ai];
              const isMediaPanelItem = panelItem?.type === 'media' || panelItem?.type === 'web' || panelItem?.title?.toLowerCase().includes('spotify');
              if (!(isMediaPanelItem && gpfi === 4)) {
                setGamePanelFocusIndex(prev => Math.min(prev + 1, 4 + Math.min(o.steamNews.length, 8) - 1));
              }
            }
          }
        } else if (fa === 'welcome_widgets') {
          // Acceder al resultado de getWidgetNeighbor usando los valores actuales
          const nxt = getWidgetNeighborFromRefs(fi, 'right');
          if (typeof nxt === 'number') setFocusIndex(nxt);
        } else if (fa === 'welcome_toolbar') {
          if (tfi < 3) setToolbarFocusIndex(prev => prev + 1);
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        soundService.playNavigation();
        if (fa === 'library_grid') {
          if (lff) {
            // Ya está en el extremo izquierdo
          } else if (ltf) {
            if (o.libraryTab !== 'installed') {
              o.setLibraryTab('installed');
              setLibraryGridFocusIndex(0);
            } else {
              setLibraryTabsFocused(false);
              setLibraryFilterFromTabs(true);
              setLibraryFilterFocused(true);
            }
          } else if (lgfi % 5 === 0) {
            setLibraryFilterFromTabs(false);
            setLibraryFilterFocused(true);
          } else {
            setLibraryGridFocusIndex(prev => Math.max(prev - 1, 0));
          }
        } else if (fa === 'main_carousel') {
          const nextIdx = Math.max(ai - 1, 0);
          setActiveIndex(nextIdx);
          setFocusIndex(nextIdx);
        } else if (fa === 'header_tabs') {
          setFocusIndex(prev => Math.max(prev - 1, 0));
        } else if (fa === 'header_avatar') {
          if (fi > 0) {
            setFocusIndex(prev => prev - 1);
          } else {
            setFocusArea('header_tabs');
            setFocusIndex(Math.max(TABS.findIndex(tab => tab.id === o.activeTab), 0));
          }
        } else if (fa === 'game_panel') {
          if (activeItem?.id === '5') {
            if (gpfi < 10) {
              setGamePanelFocusIndex(prev => Math.max(prev - 1, 0));
            } else if (gpfi >= 10 && gpfi < 20) {
              setGamePanelFocusIndex(prev => Math.max(prev - 1, 10));
            }
          } else {
            if (gpfi === 1) {
              setGamePanelFocusIndex(0);
            } else if (gpfi === 3) {
              setGamePanelFocusIndex(2);
            } else if (gpfi === 300) {
              // Ficha de metadatos: no hay retroceso horizontal
            } else if (gpfi >= 200) {
              setGamePanelFocusIndex(prev => Math.max(prev - 1, 200));
            } else if (gpfi >= 100) {
              setGamePanelFocusIndex(prev => Math.max(prev - 1, 100));
            } else if (gpfi >= 4) {
              const panelItem = o.currentData[ai];
              const isMediaPanelItem = panelItem?.type === 'media' || panelItem?.type === 'web' || panelItem?.title?.toLowerCase().includes('spotify');
              if (!(isMediaPanelItem && gpfi === 4)) {
                setGamePanelFocusIndex(prev => Math.max(prev - 1, 4));
              }
            }
          }
        } else if (fa === 'welcome_widgets') {
          const nxt = getWidgetNeighborFromRefs(fi, 'left');
          if (typeof nxt === 'number') setFocusIndex(nxt);
        } else if (fa === 'welcome_toolbar') {
          if (tfi > 0) setToolbarFocusIndex(prev => prev - 1);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        soundService.playNavigation();
        if (fa === 'library_grid') {
          if (lff) {
            setLibraryFilterFocused(false);
            setLibraryGridFocusIndex(0);
          } else if (ltf) {
            setLibraryTabsFocused(false);
            setLibraryGridFocusIndex(0);
          } else {
            setLibraryGridFocusIndex(prev => Math.min(prev + 5, vlg.length - 1));
          }
        } else if (fa === 'header_avatar') {
          o.setActiveTab('Games');
          setActiveIndex(1);
          setFocusArea('main_carousel');
          setFocusIndex(1);
        } else if (fa === 'header_tabs') {
          const newTab = TABS[fi].id;
          if (newTab !== o.activeTab) {
            o.setActiveTab(newTab);
            const targetIdx = newTab === 'Games' ? 1 : 0;
            setActiveIndex(targetIdx);
            setFocusIndex(targetIdx);
          } else {
            setFocusIndex(ai);
          }
          setFocusArea('main_carousel');
        } else if (fa === 'main_carousel') {
          if (activeItem?.id === 'more_library') {
            setFocusArea('library_grid');
            setLibraryTabsFocused(true);
            setLibraryFilterFocused(false);
            setLibraryGridFocusIndex(0);
          } else if (activeItem?.id === '1') {
            setFocusArea('welcome_widgets');
            const firstVisible = o.row1Visible[0] ?? o.row2Visible[0] ?? 0;
            setFocusIndex(firstVisible);
          } else if (canPlay) {
            setFocusArea('game_panel');
            setGamePanelFocusIndex(0);
          }
        } else if (fa === 'game_panel') {
          if (activeItem?.id === '5') {
            if (gpfi < 10) {
              if (o.storeUpcoming.length > 0) {
                const targetCol = Math.min(gpfi, o.storeUpcoming.length - 1);
                setGamePanelFocusIndex(10 + targetCol);
              } else {
                setGamePanelFocusIndex(20);
              }
            } else if (gpfi >= 10 && gpfi < 20) {
              setGamePanelFocusIndex(20);
            }
          } else {
            if (gpfi === 0) {
              setGamePanelFocusIndex(2);
            } else if (gpfi === 1) {
              setGamePanelFocusIndex(3);
            } else if (gpfi === 2 || gpfi === 3) {
              const panelItem = o.currentData[ai];
              const isMediaPanelItem = panelItem?.type === 'media' || panelItem?.type === 'web' || panelItem?.title?.toLowerCase().includes('spotify');
              if (isMediaPanelItem) {
                setGamePanelFocusIndex(4);
              } else if (o.steamMedia.length > 0) {
                setGamePanelFocusIndex(100);
              } else if (o.achievementCount > 0) {
                setGamePanelFocusIndex(200);
              } else if (o.steamNews.length > 0) {
                setGamePanelFocusIndex(4);
              } else if (o.activeUser?.settings?.showGameMetadata !== false) {
                setGamePanelFocusIndex(300);
              }
            } else if (gpfi >= 100 && gpfi < 200) {
              if (o.achievementCount > 0) {
                setGamePanelFocusIndex(200);
              } else if (o.steamNews.length > 0) {
                setGamePanelFocusIndex(4);
              } else if (o.activeUser?.settings?.showGameMetadata !== false) {
                setGamePanelFocusIndex(300);
              }
            } else if (gpfi === 300) {
              // Ficha de metadatos: última sección, no hay más abajo
            } else if (gpfi >= 200) {
              if (o.steamNews.length > 0) {
                setGamePanelFocusIndex(4);
              } else if (o.activeUser?.settings?.showGameMetadata !== false) {
                setGamePanelFocusIndex(300);
              }
            } else if (gpfi >= 4 && gpfi < 100) {
              if (o.activeUser?.settings?.showGameMetadata !== false) {
                setGamePanelFocusIndex(300);
              }
            }
          }
        } else if (fa === 'welcome_widgets') {
          const nxt = getWidgetNeighborFromRefs(fi, 'down');
          if (typeof nxt === 'number') setFocusIndex(nxt);
        } else if (fa === 'welcome_toolbar') {
          setFocusArea('welcome_widgets');
          const firstVisible = o.row1Visible[0] ?? o.row2Visible[0] ?? 0;
          setFocusIndex(firstVisible);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        soundService.playNavigation();
        if (fa === 'library_grid') {
          if (lff) {
            setFocusArea('main_carousel');
            setLibraryFilterFocused(false);
          } else if (ltf) {
            setFocusArea('main_carousel');
            setLibraryTabsFocused(false);
          } else if (lgfi < 5) {
            setLibraryTabsFocused(true);
          } else {
            setLibraryGridFocusIndex(prev => Math.max(prev - 5, 0));
          }
        } else if (fa === 'game_panel') {
          if (activeItem?.id === '5') {
            if (gpfi === 20) {
              if (o.storeUpcoming.length > 0) {
                setGamePanelFocusIndex(10);
              } else {
                setGamePanelFocusIndex(0);
              }
            } else if (gpfi >= 10 && gpfi < 20) {
              const col = gpfi - 10;
              const targetCol = Math.min(col, o.storeDeals.length - 1);
              setGamePanelFocusIndex(targetCol);
            } else if (gpfi < 10) {
              setFocusArea('main_carousel');
              setFocusIndex(ai);
            }
          } else {
            if (gpfi === 0 || gpfi === 1) {
              setFocusArea('main_carousel');
              setFocusIndex(ai);
            } else if (gpfi === 2) {
              setGamePanelFocusIndex(0);
            } else if (gpfi === 3) {
              setGamePanelFocusIndex(1);
            } else if (gpfi === 300) {
              if (o.steamNews.length > 0) {
                setGamePanelFocusIndex(4);
              } else if (o.achievementCount > 0) {
                setGamePanelFocusIndex(200);
              } else if (o.steamMedia.length > 0) {
                setGamePanelFocusIndex(100);
              } else {
                setGamePanelFocusIndex(2);
              }
            } else if (gpfi >= 200) {
              setGamePanelFocusIndex(o.steamMedia.length > 0 ? 100 : 2);
            } else if (gpfi >= 100) {
              setGamePanelFocusIndex(2);
            } else if (gpfi >= 4) {
              const panelItem = o.currentData[ai];
              const isMediaPanelItem = panelItem?.type === 'media' || panelItem?.type === 'web' || panelItem?.title?.toLowerCase().includes('spotify');
              if (isMediaPanelItem && gpfi === 4) {
                setGamePanelFocusIndex(2);
              } else if (o.achievementCount > 0) {
                setGamePanelFocusIndex(200);
              } else if (o.steamMedia.length > 0) {
                setGamePanelFocusIndex(100);
              } else {
                const newsIndex = gpfi - 4;
                setGamePanelFocusIndex(newsIndex % 2 === 0 ? 2 : 3);
              }
            }
          }
        } else if (fa === 'main_carousel') {
          setFocusArea('header_tabs');
          setFocusIndex(TABS.findIndex(tab => tab.id === o.activeTab));
        } else if (fa === 'header_tabs') {
          setFocusArea('header_avatar');
          setFocusIndex(0);
        } else if (fa === 'welcome_widgets') {
          const nxt = getWidgetNeighborFromRefs(fi, 'up');
          if (typeof nxt === 'number') {
            setFocusIndex(nxt);
          } else if (nxt === 'toolbar') {
            setFocusArea('welcome_toolbar');
            setToolbarFocusIndex(2);
          }
        } else if (fa === 'welcome_toolbar') {
          setIsWidgetEditOpen(false);
          setFocusArea('main_carousel');
          setFocusIndex(ai);
        }
        return;
      }

      // ── Enter ──────────────────────────────────────────────────────────────
      if (e.key === 'Enter') {
        soundService.playActivation();
        if (fa === 'header_tabs') {
          const newTab = TABS[fi].id;
          o.setActiveTab(newTab);
          const targetIdx = newTab === 'Games' ? 1 : 0;
          setActiveIndex(targetIdx);
          setFocusIndex(targetIdx);
          setFocusArea('main_carousel');
          return;
        }
        if (fa === 'header_avatar') {
          if (fi === 0) {
            o.setSearchVisible(true);
          } else if (fi === 1) {
            o.setUserModalVisible(false);
            o.setSettingsVisible(true);
          } else if (fi === 2) {
            o.setIsProfileMenuOpen(true);
            o.setProfileMenuFocusIndex(0);
          }
          return;
        }
        if (fa === 'library_grid') {
          if (lff) {
            o.libraryGridRef.current?.activateFilterButton();
            return;
          }
          if (ltf) return; // usa ←/→ para cambiar de pestaña
          const game = vlg[lgfi];
          if (game) {
            o.setSelectedItem(game);
            o.setDetailVisible(true);
          }
          return;
        }
        if (fa === 'game_panel') {
          if (activeItem?.id === '5') {
            if (gpfi < 10) {
              const deal = o.storeDeals[gpfi];
              if (deal && deal.url) Linking.openURL(deal.url);
            } else if (gpfi >= 10 && gpfi < 20) {
              const item = o.storeUpcoming[gpfi - 10];
              if (item && item.url) Linking.openURL(item.url);
            } else if (gpfi === 20) {
              Linking.openURL('https://store.playstation.com');
            }
          } else {
            if (gpfi === 0) {
              if (activeItem) o.handleLaunchApp(activeItem);
            } else if (gpfi === 1) {
              if (activeItem) {
                const target = activeItem.isLastPlayed ? o.lastPlayedGame : activeItem;
                if (target) {
                  o.setSelectedItem(target);
                  o.setDetailInitialEditMode?.(true);
                  o.setDetailVisible(true);
                } else {
                  // Usar el toast para el caso de no juego lanzado
                }
              }
            } else if (gpfi === 2) {
              // El widget de trofeos abre la vista con la lista de logros.
              o.setTrophiesVisible?.(true);
            } else if (gpfi >= 200) {
              // Los logros son navegación; Enter no abre vista adicional
            } else if (gpfi >= 100) {
              const mediaItem = o.steamMedia[gpfi - 100];
              if (mediaItem) o.setSelectedMediaIndex(gpfi - 100);
            } else if (gpfi === 4) {
              const panelItem = o.currentData[ai];
              const isMediaPanelItem = panelItem?.type === 'media' || panelItem?.type === 'web' || panelItem?.title?.toLowerCase().includes('spotify');
              if (!isMediaPanelItem) {
                const newsItem = o.steamNews[gpfi - 4];
                if (newsItem && newsItem.url) Linking.openURL(newsItem.url);
              }
            } else if (gpfi > 4) {
              const newsItem = o.steamNews[gpfi - 4];
              if (newsItem && newsItem.url) Linking.openURL(newsItem.url);
            }
          }
          return;
        }
        if (fa === 'welcome_toolbar') {
          if (tfi === 0) {
            setIsWidgetEditOpen(prev => !prev);
            setWidgetEditFocusIndex(0);
          } else if (tfi === 2) {
            o.setHomeBgModalVisible(true);
          } else if (tfi === 3) {
            o.setWelcomeSettingsVisible(true);
          }
          return;
        }
        if (fa === 'welcome_widgets') {
          const currentWidgetId = o.widgetOrder[fi];
          if (currentWidgetId === 'store') {
            Linking.openURL('https://store.playstation.com');
          } else if (currentWidgetId === 'add_game') {
            o.setAddModalVisible(true);
          } else if (currentWidgetId === 'recently_played' && o.lastPlayedGame) {
            o.handleLaunchApp(o.lastPlayedGame);
          } else if (currentWidgetId === 'friends') {
            // welcomeWidgetsRef.current?.triggerFriendAction() — esta ref queda en index.tsx
          } else if (currentWidgetId === 'random_pick') {
            o.setRandomSelectorVisible(true);
          } else if (currentWidgetId === 'change_bg') {
            o.setHomeBgModalVisible(true);
          }
          return;
        }
        if (fa === 'main_carousel') {
          const item = o.currentData[ai];
          if (item) {
            if (item.id === 'more_library' || item.id === '1' || item.id === '5') return;
            if (item.isFolder || item.isGrid) { o.setFavoritesVisible(true); return; }
            if (item.isLastPlayed) {
              if (o.lastPlayedGame && o.lastPlayedGame.id !== '1' && o.lastPlayedGame.id !== '5') {
                o.handleLaunchApp(o.lastPlayedGame);
              }
            } else {
              o.handleLaunchApp(item);
            }
          }
        }
        return;
      }

      // ── L1/R1 — cambiar pestaña ────────────────────────────────────────────
      if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
        if (fa === 'library_grid') {
          soundService.playTab();
          o.setLibraryTab(prev => (prev === 'installed' ? 'collection' : 'installed'));
          setLibraryGridFocusIndex(0);
          setLibraryTabsFocused(false);
          setLibraryFilterFocused(false);
          return;
        }
        soundService.playTab();
        const direction = (e.key === 'q' || e.key === 'Q') ? -1 : 1;
        o.setActiveTab(prev => {
          const idx = TABS.findIndex(t => t.id === prev);
          const nextIdx = idx + direction;
          if (nextIdx >= 0 && nextIdx < TABS.length) {
            const nextTab = TABS[nextIdx].id;
            const targetIdx = nextTab === 'Games' ? 1 : 0;
            setActiveIndex(targetIdx);
            if (fa === 'header_tabs') setFocusIndex(nextIdx);
            else if (fa === 'main_carousel') setFocusIndex(targetIdx);
            return nextTab;
          }
          return prev;
        });
      }

      if (e.key === 'b' || e.key === 'B' || e.key === 'Escape') {
        soundService.playBack();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Ref estable para que startWidgetMove sea accesible dentro del listener ─
  const startWidgetMoveFnRef = useRef(startWidgetMove);
  startWidgetMoveFnRef.current = startWidgetMove;

  // Función interna helper para getWidgetNeighbor usando refs (llamada desde el listener)
  const getWidgetNeighborFromRefs = useCallback(
    (slot: number, dir: 'left' | 'right' | 'up' | 'down'): number | 'toolbar' | null => {
      return getWidgetNeighbor(slot, dir);
    },
    [getWidgetNeighbor]
  );

  // ── Effect: ajustar libraryGridFocusIndex cuando visibleLibraryGames cambia ─
  useEffect(() => {
    setLibraryGridFocusIndex(prev => {
      const maxIndex = Math.max(visibleLibraryGames.length - 1, 0);
      return Math.min(prev, maxIndex);
    });
  }, [visibleLibraryGames.length]);

  // ── Effect: ajustar focusIndex cuando widgetVisibility o widgetOrder cambian
  useEffect(() => {
    if (focusArea === 'welcome_widgets') {
      const { widgetVisibility: wv, widgetOrder: wo, row1Visible, row2Visible } = options;
      const currentWidgetId = wo[focusIndex];
      if (currentWidgetId && wv[currentWidgetId] === false) {
        const allVis = [...row1Visible, ...row2Visible];
        if (allVis.length > 0) {
          let closest = allVis[0];
          let minDiff = Math.abs(closest - focusIndex);
          for (const idx of allVis) {
            const d = Math.abs(idx - focusIndex);
            if (d < minDiff) { minDiff = d; closest = idx; }
          }
          setFocusIndex(closest);
        }
      }
    }
  }, [options.widgetVisibility, options.widgetOrder, focusArea, focusIndex, options.row1Visible, options.row2Visible]);

  // ── Auto-scroll: carrusel horizontal ──────────────────────────────────────
  useEffect(() => {
    const { scrollRef, ITEM_WIDTH: iw, currentData } = options;
    if (scrollRef.current) {
      const scrollX = activeIndex * iw;
      scrollRef.current.scrollTo({ x: scrollX, animated: true });
    }
  }, [activeIndex, options.currentData, options.ITEM_WIDTH]);

  // ── Auto-scroll: scroll vertical principal ────────────────────────────────
  useEffect(() => {
    const { mainScrollRef, windowHeight: wh } = options;
    if (!mainScrollRef.current) return;
    if (focusArea === 'library_grid') {
      mainScrollRef.current.scrollTo({ y: 0, animated: true });
    } else if (focusArea === 'welcome_widgets') {
      mainScrollRef.current.scrollTo({ y: wh * 0.35, animated: true });
    } else if (focusArea !== 'game_panel') {
      mainScrollRef.current.scrollTo({ y: 0, animated: true });
    } else {
      if (gamePanelFocusIndex === 0 || gamePanelFocusIndex === 1) {
        mainScrollRef.current.scrollTo({ y: 0, animated: true });
      } else if (gamePanelFocusIndex === 2 || gamePanelFocusIndex === 3) {
        mainScrollRef.current.scrollTo({ y: 220, animated: true });
      } else if (gamePanelFocusIndex >= 100 && gamePanelFocusIndex < 200) {
        mainScrollRef.current.scrollTo({ y: 220, animated: true });
      } else if (gamePanelFocusIndex === 300) {
        mainScrollRef.current.scrollTo({ y: 1000, animated: true });
      } else if (gamePanelFocusIndex >= 200) {
        mainScrollRef.current.scrollTo({ y: 220, animated: true });
      } else if (gamePanelFocusIndex >= 100) {
        mainScrollRef.current.scrollTo({ y: 480, animated: true });
      } else if (gamePanelFocusIndex >= 4) {
        mainScrollRef.current.scrollTo({ y: 700, animated: true });
      }
    }
  }, [focusArea, gamePanelFocusIndex, libraryGridFocusIndex]);

  // ── Auto-scroll: scroll horizontal de medios ──────────────────────────────
  useEffect(() => {
    const { mediaScrollRef } = options;
    if (focusArea === 'game_panel' && gamePanelFocusIndex >= 100 && gamePanelFocusIndex < 200 && mediaScrollRef.current) {
      const mediaIndex = gamePanelFocusIndex - 100;
      const cardWidth = 500 + 16;
      mediaScrollRef.current.scrollTo({ x: mediaIndex * cardWidth, animated: true });
    }
  }, [gamePanelFocusIndex, focusArea]);

  // ── Auto-scroll: scroll horizontal de noticias ────────────────────────────
  useEffect(() => {
    const { newsScrollRef } = options;
    if (focusArea === 'game_panel' && gamePanelFocusIndex >= 4 && gamePanelFocusIndex < 100 && newsScrollRef.current) {
      const newsIndex = gamePanelFocusIndex - 4;
      const cardWidth = 320;
      const gap = 16;
      newsScrollRef.current.scrollTo({ x: newsIndex * (cardWidth + gap), animated: true });
    }
    if (focusArea === 'game_panel' && gamePanelFocusIndex >= 100 && options.newsScrollRef.current) {
      options.newsScrollRef.current.scrollTo({ x: 0, animated: true });
    }
  }, [gamePanelFocusIndex, focusArea]);

  // ── Auto-scroll: scroll horizontal de widgets ─────────────────────────────
  useEffect(() => {
    const { widgetScrollRef, windowWidth: ww } = options;
    if (focusArea === 'welcome_widgets' && widgetScrollRef.current) {
      const colIndex = focusIndex % 5;
      const cardWidth = (ww - 40) / 5;
      const gap = 10;
      widgetScrollRef.current.scrollTo({ x: colIndex * (cardWidth + gap), animated: true });
    }
  }, [focusIndex, focusArea, options.windowWidth]);

  // ── Retorno ───────────────────────────────────────────────────────────────
  return {
    focusArea, setFocusArea,
    focusIndex, setFocusIndex,
    activeIndex, setActiveIndex,
    gamePanelFocusIndex, setGamePanelFocusIndex,
    toolbarFocusIndex, setToolbarFocusIndex,
    isLibraryFocused, setIsLibraryFocused,
    libraryGridFocusIndex, setLibraryGridFocusIndex,
    visibleLibraryGames, setVisibleLibraryGames,
    libraryTabsFocused, setLibraryTabsFocused,
    libraryFilterFocused, setLibraryFilterFocused,
    libraryFilterFromTabs, setLibraryFilterFromTabs,
    isLibraryFilterPanelOpen, setIsLibraryFilterPanelOpen,
    isWidgetEditOpen, setIsWidgetEditOpen,
    widgetEditFocusIndex, setWidgetEditFocusIndex,
    isWidgetMoveMode, setIsWidgetMoveMode,
    movingWidgetId, setMovingWidgetId,
    preMoveOrderBackup, setPreMoveOrderBackup,
    startWidgetMove,
    getWidgetNeighbor,
  };
}

