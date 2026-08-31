import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, useWindowDimensions, Image as RNImage, Modal } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { ConsoleItem } from '../app/(tabs)/index';
import { useEffect } from 'react';
import GameDetailView from './GameDetailView';
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
}

const COLUMNS = 5;

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

export default function LibraryGrid({
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
}: LibraryGridProps) {
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
    setIsFilterPanelOpen(true);
  };

  // 3. Ordenar los juegos basados en el estado actual
  const sortedGames = [...games].sort((a, b) => {
    if (sortDirection === 'none') return 0; // Mantiene el orden original que viene del backend/prop

    const titleA = (a.title || '').toLowerCase();
    const titleB = (b.title || '').toLowerCase();

    if (sortDirection === 'asc') {
      return titleA.localeCompare(titleB); // A-Z
    } else {
      return titleB.localeCompare(titleA); // Z-A
    }
  });

  // 4. Filtrar los juegos basados en la pestaña activa, la plataforma y la fuente elegidas
  const filteredGames = sortedGames.filter((game) => {
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

  const handleItemPress = (index: number, game: ConsoleItem) => {
    setSelectedGame(game);
    onDetailVisibilityChange?.(true);
    onItemPress?.(index, game);
  };

  const translateY = useSharedValue(0);

  const GAP = 20;
  const gridWidth = windowWidth - 200;
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

  const currentRow = Math.floor(focusedIndex / COLUMNS);
  const hasScrolled = currentRow > 1;

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.container}>
      <View style={styles.tabsRow}>
        <View style={{ marginRight: 40 }}>
          <TouchableOpacity
            ref={filterButtonRef}
            onPress={() => (isFilterPanelOpen ? setIsFilterPanelOpen(false) : openFilterPanel())}
            style={[
              styles.filterButton,
              hasActiveFilters && { backgroundColor: 'rgba(255,255,255,0.3)' } // Se ilumina si hay algún filtro activo
            ]}
          >
            <Image
              source={require('@/assets/images/PS5_Filters.png')}
              style={{ width: 40, height: 40 }}
              contentFit="contain"
            />
          </TouchableOpacity>

          <Modal
            visible={isFilterPanelOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIsFilterPanelOpen(false)}
          >
            {/* Backdrop invisible para cerrar el panel al tocar fuera */}
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setIsFilterPanelOpen(false)}
            />

            <View style={[styles.filterPanel, { top: filterPanelPos.top, left: filterPanelPos.left }]}>
              {/* SORT BY */}
              <View style={styles.filterPanelSortRow}>
                <Text style={styles.filterPanelSortLabel}>Sort by</Text>
                <TouchableOpacity onPress={cycleSort}>
                  <Text style={styles.filterPanelSortValue}>{sortLabel}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.filterPanelDivider} />

              <Text style={styles.filterPanelHeading}>Filters</Text>

              {/* PLATFORM */}
              <TouchableOpacity
                style={styles.filterPanelOptionRow}
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
                    return (
                      <TouchableOpacity
                        key={platformId}
                        style={styles.filterPanelCheckRow}
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
                style={styles.filterPanelOptionRow}
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
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={styles.filterPanelCheckRow}
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
                style={styles.filterPanelResetBtn}
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
                const BUFFER = 3;
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

                  return (
                    <TouchableOpacity
                      key={game.id ?? index}
                      activeOpacity={0.8}
                      onPress={() => handleItemPress(index, game)}
                      style={[
                        styles.gameCardWrapper,
                        isItemFocused && styles.gameCardWrapperFocused,
                      ]}
                    >
                      {isItemFocused && <SpinningBorder id={borderId} />}

                      <BlurView
                        intensity={isItemFocused ? 45 : 25}
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

                                  return (
                                    <View style={styles.platformRow}>
                                      {steamGame ? (
                                        // 🎮 Juego de Steam
                                        <View
                                          style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                          }}
                                        >
                                          <MaterialCommunityIcons
                                            name={iconName as any}
                                            size={20}
                                            color="#000000"
                                            style={{ marginRight: 6 }}
                                          />

                                          <Text
                                            style={{
                                              color: '#000000',
                                              fontFamily: 'SSTBoldIt',
                                              fontSize: 12,
                                            }}
                                          >
                                            {platformId}
                                          </Text>
                                        </View>
                                      ) : (
                                        // 🎮 Resto de plataformas: mantener comportamiento actual
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
                  );
                });
              })()}
            </View>
          </Animated.View>
        )}
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
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 100,
    paddingBottom: 80,
    marginTop: 120,
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
    fontFamily: 'SSTMedium',
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabPillFocused: {
    borderColor: 'rgba(255,255,255,0.9)',
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
});