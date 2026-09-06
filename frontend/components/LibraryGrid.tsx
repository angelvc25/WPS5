import React, { useState, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, useWindowDimensions, Image as RNImage, Modal } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { ConsoleItem } from '../app/(tabs)/index';
import { useEffect } from 'react';
import GameDetailView from './GameDetailView';
import RadarFocusWrapper from './RadarFocusWrapper';
import { isSteamGame, isSteamGameInstalled } from '@/services/steamLaunchService';
import { useTranslation } from '@/contexts/LanguageContext';
import { PLATFORMS, PLATFORM_IDS, PLATFORM_ICONS } from '@/constants/platforms';

interface LibraryGridProps {
  games: ConsoleItem[];
  isFocused?: boolean;
  focusedIndex?: number;
  onItemPress?: (index: number, game: ConsoleItem) => void;
  onLaunch?: (id: string, path: string) => void;
  onRefresh?: () => void;
  isLaunching?: boolean;
  inputMode?: 'keyboard' | 'gamepad';
  onDetailVisibilityChange?: (isVisible: boolean) => void;
  activeTab?: 'installed' | 'collection';
  onTabChange?: (tab: 'installed' | 'collection') => void;
  isLoading?: boolean;
  installedSteamAppIds?: Set<string> | null;
  // gridActive: true cuando el foco real está sobre las tarjetas del grid
  // (no sobre las pestañas). isFocused sigue indicando "estás dentro de la
  // sección de biblioteca" (controla si se muestran las pestañas).
  gridActive?: boolean;
  // tabsFocused: true cuando el foco de teclado/mando está sobre la fila de
  // pestañas (Instalados | Tu Colección) en lugar de sobre el grid.
  tabsFocused?: boolean;
  // filterButtonFocused: true cuando el foco de teclado/mando está sobre el
  // botón de filtro (nueva zona de foco, a la izquierda del grid).
  filterButtonFocused?: boolean;
  // Avisa al padre cuando el panel de filtros se abre/cierra, para que
  // pueda pausar su propio manejo de teclado/mando mientras está abierto
  // (mismo patrón que onDetailVisibilityChange).
  onFilterPanelVisibilityChange?: (isVisible: boolean) => void;
  // Notifica al padre la lista de juegos REALMENTE visible (ya ordenada y
  // filtrada por pestaña/plataforma/fuente). El padre debe usar esta lista
  // — y no la prop `games` original — para resolver índices de foco
  // (teclado/mando), o el juego abierto no coincidirá con la tarjeta
  // resaltada cuando haya un filtro activo.
  onVisibleGamesChange?: (games: ConsoleItem[]) => void;
}

// Métodos expuestos para que el componente padre (dueño del estado de foco
// y del listener de teclado/mando) pueda controlar el botón de filtro y su
// panel como una zona de foco más, igual que ya hace con el grid y las
// pestañas.
export interface LibraryGridHandle {
  // Abre/cierra el panel de filtros (equivalente a "pulsar" el botón
  // cuando filterButtonFocused === true).
  activateFilterButton: () => void;
  // Mueve la selección dentro del panel de filtros ya abierto.
  movePanelSelection: (direction: 'up' | 'down') => void;
  // Activa la fila actualmente seleccionada dentro del panel
  // (equivalente a pulsar Cross/A o Enter sobre ella).
  activatePanelSelection: () => void;
  // Cierra el panel de filtros (equivalente a Circle/B o Escape).
  closeFilterPanel: () => void;
  isFilterPanelOpen: () => boolean;
}

const COLUMNS = 5;
const FILTER_RAIL_WIDTH = 88;

// ─── SpinningBorder Component (adapted for square/library cards) ──────────────
// Web-only: conic-gradient spinning halo + diagonal shimmer sweep.
// Placed INSIDE the card's TouchableOpacity so it inherits transforms.
const SpinningBorder = ({ id }: { id: string }) => {
  if (Platform.OS !== 'web') return null;

  return (
    <>
      <style>{`
        /* --- SPINNING HALO ANIMATION --- */
        @keyframes lib-spin-border-${id} {
          0%   { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .lib-spinning-inner-${id} {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 300%;
          height: 300%;
          animation: lib-spin-border-${id} 9.8s linear infinite;
          background: conic-gradient(
            from 0deg,
            rgba(255, 255, 255, 0.10) 0%,
            rgba(255, 255, 255, 0.79) 28%,
            rgba(180, 210, 255, 0.86) 33%,
            rgba(220, 235, 255, 0.95) 48%,
            rgba(255, 255, 255, 1.0)  50%,
            rgba(223, 248, 182, 0.95) 52%,
            rgba(180, 210, 255, 0.88) 57%,
            rgba(255, 255, 255, 0.75) 62%,
            rgba(255, 255, 255, 0.10) 100%
          );
          border-radius: 50%;
        }

        /* --- DIAGONAL SHIMMER SWEEP ANIMATION --- */
        @keyframes lib-shimmer-${id} {
          0%   { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
          15%  { opacity: 1; }
          50%  { opacity: 1; }
          70%  { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
        }
        .lib-shimmer-line-${id} {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 140%;
          height: 420%;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(255, 255, 255, 0.01) 20%,
            rgba(255, 255, 255, 0.15) 50%,
            rgba(255, 255, 255, 0.01) 80%,
            transparent 100%
          );
          animation: lib-shimmer-${id} 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
        }
      `}</style>

      {/* LAYER 1: Spinning halo behind the card */}
      <View
        style={{
          position: 'absolute',
          top: -5,
          left: -5,
          right: -5,
          bottom: -5,
          borderRadius: 10,
          zIndex: -1,
          overflow: 'hidden',
        } as any}
        pointerEvents="none"
      >
        {/* @ts-ignore */}
        <div className={`lib-spinning-inner-${id}`} />
      </View>

      {/* LAYER 2: Diagonal shimmer sweep over the card surface */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 16,
          zIndex: 5,
          overflow: 'hidden',
        } as any}
        pointerEvents="none"
      >
        {/* @ts-ignore */}
        <div className={`lib-shimmer-line-${id}`} />
      </View>
    </>
  );
};

const SlidingGameTitle = ({
  title,
  focused,
}: {
  title: string;
  focused: boolean;
}) => {
  const shouldScroll = title.length > 18;

  const translateX = useSharedValue(0);

  useEffect(() => {
    if (!shouldScroll) return;

    if (focused) {
      translateX.value = 0;

      translateX.value = withDelay(
        2000,
        withTiming(-300, {
          duration: 8000,
        })
      );
    } else {
      translateX.value = withTiming(0, {
        duration: 250,
      });
    }
  }, [focused, shouldScroll]);

  useEffect(() => {
    if (!focused || !shouldScroll) return;

    const interval = setInterval(() => {
      translateX.value = 0;

      translateX.value = withDelay(
        100,
        withTiming(-300, {
          duration: 8000,
        })
      );
    }, 8100);

    return () => clearInterval(interval);
  }, [focused, shouldScroll]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // ─── Texto corto: normal ─────────────────────────────
  if (!shouldScroll) {
    return (
      <View style={styles.gameTitleWrapper}>
        <Text
          numberOfLines={1}
          style={styles.gameTitleCentered}
        >
          {title}
        </Text>
      </View>
    );
  }

  // ─── Texto largo: marquee infinito ──────────────────
  return (
    <View style={styles.gameTitleWrapper}>
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            width: 1000,
          },
          animatedStyle,
        ]}
      >
        <Text style={styles.gameTitleMarquee}>
          {title}
        </Text>

        <Text style={styles.gameTitleMarquee}>
          {title}
        </Text>
      </Animated.View>
    </View>
  );
};

const LibraryGrid = forwardRef<LibraryGridHandle, LibraryGridProps>(function LibraryGrid({
  games = [], // Aseguramos un fallback vacío por si viene undefined
  isFocused = false,
  focusedIndex = 0,
  onItemPress,
  onLaunch,
  onRefresh,
  isLaunching = false,
  inputMode = 'keyboard',
  onDetailVisibilityChange,
  activeTab = 'installed',
  onTabChange,
  isLoading = false,
  installedSteamAppIds = null,
  gridActive = isFocused,
  tabsFocused = false,
  filterButtonFocused = false,
  onFilterPanelVisibilityChange,
  onVisibleGamesChange,
}: LibraryGridProps, ref) {
  const { t } = useTranslation();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [selectedGame, setSelectedGame] = useState<ConsoleItem | null>(null);

  // Ref + posición medida del botón de filtro, usados para anclar el panel
  // (renderizado en un Modal) justo debajo del botón, sin quedar tapado
  // por las tarjetas del grid (que crean su propio stacking context al
  // usar `transform`).
  const filterButtonRef = useRef<any>(null);
  const [filterPanelPos, setFilterPanelPos] = useState({ top: 140, left: 100 });

  // 1. Estado para controlar la dirección del ordenamiento: 'none' (Más reciente) | 'asc' (A-Z) | 'desc' (Z-A)
  const [sortDirection, setSortDirection] = useState<'none' | 'asc' | 'desc'>('none');

  // 2. Estado del panel de filtros/ordenamiento (dropdown estilo PS5)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isPlatformSectionOpen, setIsPlatformSectionOpen] = useState(false);
  const [isSourceSectionOpen, setIsSourceSectionOpen] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<'steam' | 'local'>>(new Set());

  const sortLabel = sortDirection === 'none' ? t('edit.more') : sortDirection === 'asc' ? 'A-Z' : 'Z-A';

  // 2b. Índice de la fila resaltada dentro del panel (navegación por
  // teclado/mando). Se recalcula la lista de filas cada vez que cambian
  // las secciones expandidas, para que las filas de checkboxes entren y
  // salgan de la navegación junto con su sección.
  const [panelFocusIndex, setPanelFocusIndex] = useState(0);

  type PanelRow =
    | { type: 'sort' }
    | { type: 'platformHeader' }
    | { type: 'platformOption'; id: string }
    | { type: 'sourceHeader' }
    | { type: 'sourceOption'; id: 'steam' | 'local' }
    | { type: 'reset' };

  // Ciclo del ordenamiento: Más reciente -> A-Z -> Z-A -> Más reciente
  const cycleSort = () => {
    setSortDirection((prev) => {
      if (prev === 'none') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'none';
    });
  };

  // Determina si un juego del grid ya está instalado/descargado.
  const isGameInstalled = (game: ConsoleItem) => {
    if (!isSteamGame(game)) return true;
    return isSteamGameInstalled(game as { id: string }, installedSteamAppIds);
  };

  // Plataformas presentes realmente en la lista de juegos (evita mostrar
  // checkboxes de plataformas que no tienen ningún juego asociado).
  const availablePlatforms = PLATFORM_IDS.filter((id) =>
    games.some((g) => (g.platform || (isSteamGame(g) ? 'Steam' : 'PC')) === id)
  );
  const platformOptions = availablePlatforms.length > 0 ? availablePlatforms : PLATFORM_IDS;

  // Lista de filas navegables del panel de filtros. Se recalcula cuando
  // cambian las secciones expandidas, para que las filas de checkboxes
  // entren y salgan de la navegación junto con su sección.
  const panelRows: PanelRow[] = useMemo(() => {
    const rows: PanelRow[] = [{ type: 'sort' }, { type: 'platformHeader' }];
    if (isPlatformSectionOpen) {
      platformOptions.forEach((id) => rows.push({ type: 'platformOption', id }));
    }
    rows.push({ type: 'sourceHeader' });
    if (isSourceSectionOpen) {
      rows.push({ type: 'sourceOption', id: 'steam' }, { type: 'sourceOption', id: 'local' });
    }
    rows.push({ type: 'reset' });
    return rows;
  }, [isPlatformSectionOpen, isSourceSectionOpen, platformOptions]);

  // Mantiene el índice resaltado dentro de rango si la lista de filas
  // cambia de tamaño (p.ej. al cerrar una sección expandida).
  useEffect(() => {
    setPanelFocusIndex((prev) => Math.min(prev, panelRows.length - 1));
  }, [panelRows.length]);

  // Ejecuta la acción de la fila actualmente resaltada del panel
  // (equivalente a "activar" con Enter / Cross / A).
  const activateCurrentPanelRow = () => {
    const row = panelRows[panelFocusIndex];
    if (!row) return;
    switch (row.type) {
      case 'sort':
        cycleSort();
        break;
      case 'platformHeader':
        setIsPlatformSectionOpen((v) => !v);
        break;
      case 'platformOption':
        togglePlatformFilter(row.id);
        break;
      case 'sourceHeader':
        setIsSourceSectionOpen((v) => !v);
        break;
      case 'sourceOption':
        toggleSourceFilter(row.id);
        break;
      case 'reset':
        if (hasActiveFilters) resetFilters();
        break;
    }
  };

  const movePanelFocus = (direction: 'up' | 'down') => {
    setPanelFocusIndex((prev) => {
      const delta = direction === 'down' ? 1 : -1;
      const next = (prev + delta + panelRows.length) % panelRows.length;
      return next;
    });
  };

  const togglePlatformFilter = (platformId: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platformId)) next.delete(platformId);
      else next.add(platformId);
      return next;
    });
  };

  const toggleSourceFilter = (source: 'steam' | 'local') => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const hasActiveFilters = selectedPlatforms.size > 0 || selectedSources.size > 0 || sortDirection !== 'none';

  const resetFilters = () => {
    setSortDirection('none');
    setSelectedPlatforms(new Set());
    setSelectedSources(new Set());
  };

  // Mide la posición real del botón en pantalla antes de abrir el panel,
  // para anclarlo justo debajo (el panel se renderiza en un Modal aparte).
  const openFilterPanel = () => {
    filterButtonRef.current?.measureInWindow((x: number, y: number, _width: number, height: number) => {
      setFilterPanelPos({ top: y + height + 8, left: x });
    });
    setPanelFocusIndex(0);
    setIsFilterPanelOpen(true);
    onFilterPanelVisibilityChange?.(true);
  };

  const closeFilterPanel = () => {
    setIsFilterPanelOpen(false);
    onFilterPanelVisibilityChange?.(false);
  };

  useImperativeHandle(ref, () => ({
    activateFilterButton: () => {
      if (isFilterPanelOpen) closeFilterPanel();
      else openFilterPanel();
    },
    movePanelSelection: (direction: 'up' | 'down') => movePanelFocus(direction),
    activatePanelSelection: () => activateCurrentPanelRow(),
    closeFilterPanel: () => closeFilterPanel(),
    isFilterPanelOpen: () => isFilterPanelOpen,
  }));

  // 3. Ordenar los juegos basados en el estado actual
  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      if (sortDirection === 'none') return 0; // Mantiene el orden original que viene del backend/prop

      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();

      if (sortDirection === 'asc') {
        return titleA.localeCompare(titleB); // A-Z
      } else {
        return titleB.localeCompare(titleA); // Z-A
      }
    });
  }, [games, sortDirection]);

  // 4. Filtrar los juegos basados en la pestaña activa, la plataforma y la fuente elegidas
  const filteredGames = useMemo(() => {
    return sortedGames.filter((game) => {
      if (activeTab === 'installed' && !isGameInstalled(game)) return false;

      if (selectedPlatforms.size > 0) {
        const gamePlatform = game.platform || (isSteamGame(game) ? 'Steam' : 'PC');
        if (!selectedPlatforms.has(gamePlatform)) return false;
      }

      if (selectedSources.size > 0) {
        const source: 'steam' | 'local' = isSteamGame(game) ? 'steam' : 'local';
        if (!selectedSources.has(source)) return false;
      }

      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedGames, activeTab, selectedPlatforms, selectedSources, installedSteamAppIds]);

  // Avisa al padre cada vez que la lista visible (filtrada+ordenada)
  // cambia, para que su propio índice de foco (teclado/mando) resuelva
  // el juego correcto en vez de indexar sobre la lista sin filtrar.
  useEffect(() => {
    onVisibleGamesChange?.(filteredGames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGames]);

  const handleItemPress = (index: number, game: ConsoleItem) => {
    setSelectedGame(game);
    onDetailVisibilityChange?.(true);
    onItemPress?.(index, game);
  };

  const translateY = useSharedValue(0);

  const GAP = 20;
  const gridWidth = windowWidth - 200 - FILTER_RAIL_WIDTH;
  const cardWidth = (gridWidth - GAP * (COLUMNS - 1)) / COLUMNS;
  const cardHeight = cardWidth;
  const rowHeight = Platform.OS === 'web' ? cardHeight + GAP : 180;

  useEffect(() => {
    if (isFocused) {
      const row = Math.floor(focusedIndex / COLUMNS);
      const targetY = row > 1 ? -(row - 1) * rowHeight : 0;
      translateY.value = withTiming(targetY, { duration: 300 });
    } else {
      translateY.value = withTiming(0, { duration: 300 });
    }
  }, [focusedIndex, isFocused, rowHeight]);

  const animatedGridStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }]
  }));

  const currentRow = isFocused ? Math.floor(focusedIndex / COLUMNS) : 0;
  const hasScrolled = isFocused && currentRow > 1;

  // ─── Teclado (web) ────────────────────────────────────────────────
  // Con el panel abierto: flechas arriba/abajo mueven la selección,
  // Enter/Espacio la activa, Escape cierra el panel. Con el panel
  // cerrado y el botón de filtro enfocado (prop `filterButtonFocused`,
  // controlada por el padre igual que `tabsFocused`/`gridActive`):
  // Enter/Espacio lo abre.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFilterPanelOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          movePanelFocus('down');
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          movePanelFocus('up');
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activateCurrentPanelRow();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeFilterPanel();
        }
      } else if (filterButtonFocused && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openFilterPanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFilterPanelOpen, filterButtonFocused, panelRows, panelFocusIndex]);

  // Nota: la navegación por mando (D-Pad, Cross/A, Circle/B, L1/R1) llega
  // aquí como eventos de teclado sintéticos ya despachados por el
  // componente padre (ver poll de Gamepad API en index.tsx), así que el
  // listener de teclado de arriba cubre ambos casos sin necesitar un
  // segundo polling de la Gamepad API en este componente.

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.container}>
      <View style={styles.contentRow}>
        {/* ─── Riel del botón de filtro, a la izquierda del grid ─── */}
        <View style={styles.filterRail}>
          <RadarFocusWrapper id="library-filter" isFocused={filterButtonFocused} size={64} innerSize={48}>
            <TouchableOpacity
              ref={filterButtonRef}
              onPress={() => (isFilterPanelOpen ? closeFilterPanel() : openFilterPanel())}
              style={[
                styles.filterButton,
                hasActiveFilters && { backgroundColor: 'rgba(70, 103, 119, 0.1)' }, // Se ilumina si hay algún filtro activo
                filterButtonFocused && styles.filterButtonFocused, // Foco de teclado/mando
              ]}
            > {filterButtonFocused ? (
              <Image
                source={require('@/assets/images/PS5_Filters_Dark.png')}
                style={{ width: 48, height: 48 }}
                contentFit="contain"
              />)
              : (
                <Image
                  source={require('@/assets/images/PS5_Filters.png')}
                  style={{ width: 48, height: 48 }}
                  contentFit="contain"
                />
              )}
            </TouchableOpacity>
          </RadarFocusWrapper>

          <Modal
            visible={isFilterPanelOpen}
            transparent
            animationType="fade"
            onRequestClose={() => closeFilterPanel()}
          >
            {/* Backdrop invisible para cerrar el panel al tocar fuera */}
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => closeFilterPanel()}
            />

            <View style={[styles.filterPanel, { top: filterPanelPos.top, left: filterPanelPos.left }]}>
              {/* SORT BY */}
              <View style={[styles.filterPanelSortRow, panelRows[panelFocusIndex]?.type === 'sort' && styles.filterPanelRowFocused]}>
                <Text style={styles.filterPanelSortLabel}>Sort by</Text>
                <TouchableOpacity onPress={cycleSort}>
                  <Text style={styles.filterPanelSortValue}>{sortLabel}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.filterPanelDivider} />

              <Text style={styles.filterPanelHeading}>Filters</Text>

              {/* PLATFORM */}
              <TouchableOpacity
                style={[styles.filterPanelOptionRow, panelRows[panelFocusIndex]?.type === 'platformHeader' && styles.filterPanelRowFocused]}
                onPress={() => setIsPlatformSectionOpen((v) => !v)}
              >
                <Text style={styles.filterPanelOptionText}>Platform</Text>
                <Ionicons
                  name={isPlatformSectionOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="rgba(255,255,255,0.5)"
                />
              </TouchableOpacity>

              {isPlatformSectionOpen && (
                <View style={styles.filterPanelCheckList}>
                  {platformOptions.map((platformId) => {
                    const checked = selectedPlatforms.has(platformId);
                    const currentRow = panelRows[panelFocusIndex];
                    const rowFocused = currentRow?.type === 'platformOption' && currentRow.id === platformId;
                    return (
                      <TouchableOpacity
                        key={platformId}
                        style={[styles.filterPanelCheckRow, rowFocused && styles.filterPanelRowFocused]}
                        onPress={() => togglePlatformFilter(platformId)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.filterPanelCheckbox, checked && styles.filterPanelCheckboxChecked]}>
                          {checked && <Ionicons name="checkmark" size={14} color="#000" />}
                        </View>
                        <Text style={styles.filterPanelCheckLabel}>{platformId}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* SOURCE */}
              <TouchableOpacity
                style={[styles.filterPanelOptionRow, panelRows[panelFocusIndex]?.type === 'sourceHeader' && styles.filterPanelRowFocused]}
                onPress={() => setIsSourceSectionOpen((v) => !v)}
              >
                <Text style={styles.filterPanelOptionText}>Source</Text>
                <Ionicons
                  name={isSourceSectionOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="rgba(255,255,255,0.5)"
                />
              </TouchableOpacity>

              {isSourceSectionOpen && (
                <View style={styles.filterPanelCheckList}>
                  {([
                    { id: 'steam', label: 'Steam' },
                    { id: 'local', label: 'Local' },
                  ] as const).map((opt) => {
                    const checked = selectedSources.has(opt.id);
                    const currentRow = panelRows[panelFocusIndex];
                    const rowFocused = currentRow?.type === 'sourceOption' && currentRow.id === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.filterPanelCheckRow, rowFocused && styles.filterPanelRowFocused]}
                        onPress={() => toggleSourceFilter(opt.id)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.filterPanelCheckbox, checked && styles.filterPanelCheckboxChecked]}>
                          {checked && <Ionicons name="checkmark" size={14} color="#000" />}
                        </View>
                        <Text style={styles.filterPanelCheckLabel}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                style={[styles.filterPanelResetBtn, panelRows[panelFocusIndex]?.type === 'reset' && styles.filterPanelRowFocused]}
                onPress={resetFilters}
                disabled={!hasActiveFilters}
              >
                <Text
                  style={[
                    styles.filterPanelResetText,
                    !hasActiveFilters && styles.filterPanelResetTextDisabled,
                  ]}
                >
                  Reset Filters
                </Text>
              </TouchableOpacity>
            </View>
          </Modal>
        </View>

        {/* ─── Columna principal: pestañas + contador + grid ─── */}
        <View style={styles.mainColumn}>
          <View style={styles.tabsRow}>
            {isFocused && (
              <View style={styles.tabsContainer}>
                <TouchableOpacity onPress={() => { setSortDirection('none'); onTabChange?.('installed'); }}>
                  <View style={[styles.tabPill, tabsFocused && activeTab === 'installed' && styles.tabPillFocused]}>
                    <Text style={[styles.tabText, activeTab === 'installed' && styles.tabTextActive]}>{t('library.installed')}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setSortDirection('none'); onTabChange?.('collection'); }}>
                  <View style={[styles.tabPill, tabsFocused && activeTab === 'collection' && styles.tabPillFocused]}>
                    <Text style={[styles.tabText, activeTab === 'collection' && styles.tabTextActive]}>{t('library.collection')}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.header}>
            {filteredGames.length > 0 && (
              <Text style={styles.headerTitle}>
                {activeTab === 'installed' ? t('library.consoleStorage', { count: filteredGames.length }) : t('library.steamGames', { count: filteredGames.length })}
              </Text>
            )}
          </View>

          <View style={{ height: windowHeight - 220, overflow: 'hidden', paddingTop: 20, marginTop: -20, paddingHorizontal: 20, marginHorizontal: -20 }}>
            {hasScrolled && (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 100,
                  ...(Platform.OS === 'web' ? { boxShadow: 'inset 0px 26px 15px -10px rgb(0 0 0 / 90%)' } : {}),
                }}
              />
            )}

            {filteredGames.length === 0 ? (
              <View style={styles.emptyContainer}>
                {isLoading ? (
                  <Text style={styles.emptyText}>{t('library.loadingSteam')}</Text>
                ) : (
                  <>
                    <MaterialCommunityIcons name="folder-outline" size={64} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.emptyText}>{t('library.empty')}</Text>
                  </>
                )}
              </View>
            ) : (
              <Animated.View style={animatedGridStyle}>
                <View style={styles.grid}>
                  {(() => {
                    const totalRows = Math.ceil(filteredGames.length / COLUMNS);
                    const visibleRowCount = Math.ceil((windowHeight - 220) / rowHeight);
                    const BUFFER = 2;
                    const startRow = Math.max(0, currentRow - BUFFER);
                    const endRow = Math.min(totalRows - 1, currentRow + visibleRowCount + BUFFER);

                    return filteredGames.map((game, index) => {
                      const itemRow = Math.floor(index / COLUMNS);

                      if (itemRow < startRow || itemRow > endRow) {
                        return (
                          <View
                            key={game.id ?? index}
                            style={styles.gameCardPlaceholder}
                          />
                        );
                      }

                      const isItemFocused = gridActive && focusedIndex === index;
                      const isInstalled = isGameInstalled(game);
                      const borderId = `lib-${game.id ?? index}`;
                      const staggerDelay = Math.min(index * 24, 220);

                      return (
                        <Animated.View
                          key={game.id ?? index}
                          entering={FadeInDown.delay(staggerDelay).duration(360)}
                          style={styles.gameCardAnimationWrapper}
                        >
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => handleItemPress(index, game)}
                            style={[
                              styles.gameCardWrapper,
                              isItemFocused && styles.gameCardWrapperFocused,
                            ]}
                          >
                            {isItemFocused && <SpinningBorder id={borderId} />}

                            <BlurView
                              intensity={isItemFocused ? 45 : 10}
                              tint="dark"
                              style={[
                                styles.gameCard,
                                isItemFocused && styles.gameCardFocused,
                              ]}
                            >
                              <View style={styles.imageContainer}>
                                {game.image ? (
                                  <Image source={game.image} style={styles.gameImage} contentFit="cover" />
                                ) : (
                                  <View style={styles.placeholderImage}>
                                    <MaterialCommunityIcons name="controller-classic" size={48} color="rgba(255,255,255,0.2)" />
                                  </View>
                                )}

                                {!isInstalled && (
                                  <View style={styles.notInstalledDarken} pointerEvents="none" />
                                )}

                                {!isInstalled && (
                                  <View style={styles.installBadge} pointerEvents="none">
                                    <RNImage
                                      source={require('@/assets/images/install.png')}
                                      style={styles.installBadgeIcon}
                                      resizeMode="contain"
                                    />
                                  </View>
                                )}

                                {isItemFocused && (
                                  <View style={styles.focusedOverlay}>
                                    <View style={styles.gradientOverlay} />

                                    <View style={styles.gameInfoContainer}>
                                      {(() => {
                                        const steamGame = isSteamGame(game);
                                        const platformId = game.platform || (steamGame ? 'Steam' : 'PC');
                                        const iconName = PLATFORM_ICONS[platformId] || 'controller-classic';

                                        const isEpicGame = platformId === 'Epic';
                                        const isSteam = steamGame || platformId === 'Steam';
                                        const platformBgColor = isEpicGame ? '#000000' : isSteam ? 'rgba(2, 15, 36, 1)' : 'white';

                                        return (
                                          <View style={[styles.platformRow, { backgroundColor: platformBgColor }]}>
                                            {steamGame ? (
                                              <Image
                                                source={require('@/assets/images/SteamBadge.png')}
                                                style={styles.platformBadgeImage}
                                                contentFit="contain"
                                              />
                                            ) : isEpicGame ? (
                                              <Image
                                                source={require('@/assets/images/EpicBadge.png')}
                                                style={styles.platformBadgeImage}
                                                contentFit="contain"
                                              />
                                            ) : (
                                              <Text
                                                style={{
                                                  color: '#000000',
                                                  fontFamily: 'SSTBadge',
                                                  fontSize: 12,
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                }}
                                              >
                                                {' '}{platformId}
                                              </Text>
                                            )}
                                          </View>
                                        );
                                      })()}

                                      <SlidingGameTitle
                                        title={game.title || 'Juego'}
                                        focused={isItemFocused}
                                      />
                                    </View>
                                  </View>
                                )}

                                {gridActive && !isItemFocused && (
                                  <View style={styles.unfocusedOverlay} />
                                )}
                              </View>
                            </BlurView>
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    });
                  })()}
                </View>
              </Animated.View>
            )}
          </View>
        </View>
      </View>

      <GameDetailView
        isVisible={selectedGame !== null}
        item={selectedGame}
        onClose={() => { setSelectedGame(null); onDetailVisibilityChange?.(false); }}
        onLaunch={onLaunch}
        onRefresh={onRefresh}
        isLaunching={isLaunching}
        inputMode={inputMode}
        installedSteamAppIds={installedSteamAppIds}
      />
    </Animated.View>
  );
});

LibraryGrid.displayName = 'LibraryGrid';

export default LibraryGrid;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 100,
    paddingBottom: 80,
    marginTop: 120,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  filterRail: {
    width: FILTER_RAIL_WIDTH,
    alignItems: 'flex-start',
    marginRight: 24,
  },
  mainColumn: {
    flex: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterButtonFocused: {
    borderColor: 'rgba(255, 255, 255, 0.19)',
    backgroundColor: 'rgba(255, 255, 255, 1)',
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
  },
  filterPanel: {
    position: 'absolute',
    width: 300,
    backgroundColor: 'rgba(11, 12, 19, 1)',
    borderRadius: 4,
    paddingVertical: 16,
    paddingHorizontal: 18,
  } as any,
  filterPanelSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  filterPanelSortLabel: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'SSTLight',
  },
  filterPanelSortValue: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 17,
    fontFamily: 'SSTLight',
  },
  filterPanelDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    marginVertical: 24,
  },
  filterPanelHeading: {
    color: 'rgba(255, 255, 255, 0.56)',
    fontSize: 16,
    fontFamily: 'SSTLight',
    marginTop: -10,
    marginBottom: 10,
  },
  filterPanelOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  filterPanelRowFocused: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  filterPanelOptionText: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'SSTLight',
  },
  filterPanelCheckList: {
    paddingLeft: 4,
    paddingBottom: 6,
    gap: 4,
  },
  filterPanelCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  filterPanelCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.27)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPanelCheckboxChecked: {
    backgroundColor: '#FFF',
    borderColor: '#FFF',
  },
  filterPanelCheckLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontFamily: 'SSTLight',
  },
  filterPanelResetBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(32, 78, 124, 0.16)',
    alignItems: 'center',
  },
  filterPanelResetText: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'SSTMedium',
  },
  filterPanelResetTextDisabled: {
    color: 'rgba(255, 255, 255, 0.61)',
  },
  tabText: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'SSTLight',
  },
  tabTextActive: {
    color: '#FFF',
    fontFamily: 'SSTLight',
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabPillFocused: {
    borderColor: 'rgba(255, 255, 255, 0.29)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingBottom: 18,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 24,
    fontFamily: 'SSTLight',
    letterSpacing: 1.2,
  },
  grid: {
    ...Platform.select({
      web: {
        display: 'grid',
        gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
        gap: '20px',
      } as any,
      default: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
      },
    }),
  },
  gameCardPlaceholder: {
    // Invisible placeholder that maintains grid layout for off-screen items
    aspectRatio: 1,
    borderRadius: 16,
    opacity: 0,
  },
  gameCardAnimationWrapper: {
    width: '100%',
  },
  gameCardWrapper: {
    borderRadius: 16,
    ...Platform.select({
      web: {
        // sizing is handled by grid
      } as any,
      default: {
        width: '18%',
        marginBottom: 20,
      },
    }),
    transform: [{ scale: 1 }],
    transition: 'transform 0.2s',
    zIndex: 1,
  } as any,
  gameCardWrapperFocused: {
    transform: [{ scale: 1 }],
    zIndex: 10,
    // overflow visible so the spinning halo bleeds outside card bounds
    overflow: 'visible',
  } as any,
  gameCard: {
    borderRadius: 1,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(20, 20, 30, 0.6)',
    height: '100%',
  },
  gameCardFocused: {
    borderColor: 'rgba(255, 255, 255, 0)',
    backgroundColor: 'rgba(40, 50, 70, 0)',
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1 / 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    position: 'relative',
  },
  gameImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unfocusedOverlay: {
    //...StyleSheet.absoluteFillObject,
    //backgroundColor: 'rgba(0,0,0,0.38)',
  },
  notInstalledDarken: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.32)',
    zIndex: 1,
  },
  installBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 30,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  installBadgeIcon: {
    width: '100%',
    height: '100%',
  },
  emptyContainer: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 40,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontFamily: 'SSTLight',
    marginTop: 15,
  },
  focusedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 20,
  },

  gradientOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',

    ...Platform.select({
      web: {
        backgroundImage:
          'linear-gradient(to top, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0.0) 100%)',
      } as any,
      default: {
        backgroundColor: 'rgba(0,0,0,0.55)',
      },
    }),
  },

  gameTitle: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: 'SSTLight',
    //paddingHorizontal: 16,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,

    // importante para que el texto pueda deslizarse
    minWidth: '140%',
  },
  gameTitleWrapper: {
    overflow: 'hidden',
    width: '100%',
    //paddingBottom: 14,
  },
  gameTitleMarquee: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: 'SSTLight',
    paddingHorizontal: 10,

    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  gameTitleCentered: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: 'SSTLight',
    //paddingHorizontal: 16,
    textAlign: 'left',

    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  gameInfoContainer: {
    width: '100%',
    paddingHorizontal: 14,
    paddingBottom: 14,
  },

  platformLogo: {
    width: 52,
    height: 22,
    marginBottom: 8,
  },
  platformRow: {
    backgroundColor: 'white',
    borderRadius: 4,
    paddingHorizontal: 8,
    width: '25%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    height: 30,
  },
  platformBadgeImage: {
    width: 60,
    height: 24,
    marginTop: 4,
  },
});