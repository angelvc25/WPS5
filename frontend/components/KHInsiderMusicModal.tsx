import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  TextInput,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import {
  khinsiderService,
  type KHInsiderAlbum,
  type KHInsiderTrack,
  type KHInsiderAlbumDetail,
} from '@/services/khinsiderService';
import { toastService } from '@/services/toastService';
import { useTranslation } from '@/contexts/LanguageContext';
import ControlPrompt from './ControlPrompt';
import VirtualKeyboard from './VirtualKeyboard';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';

interface KHInsiderMusicModalProps {
  isVisible: boolean;
  onClose: () => void;
  currentGameTitle?: string;
  currentFocusAudio?: string;
  onSelectTrack: (localAudioUri: string, trackTitle: string, albumTitle?: string) => Promise<void> | void;
  onRemoveAudio?: () => Promise<void> | void;
  gamepadConnected?: boolean;
}

export const KHInsiderMusicModal: React.FC<KHInsiderMusicModalProps> = ({
  isVisible,
  onClose,
  currentGameTitle = '',
  currentFocusAudio,
  onSelectTrack,
  onRemoveAudio,
  gamepadConnected = false,
}) => {
  const { t } = useTranslation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Escala adaptable para resoluciones PS5 (1080p / 4K / 720p)
  const s = useMemo(() => {
    const scaleW = windowWidth / 1920;
    const scaleH = windowHeight / 1080;
    const scale = Math.min(Math.max(Math.max(scaleW, scaleH), 0.6), 1.25);
    return (px: number) => {
      if (px === 0) return 0;
      const scaled = Math.round(px * scale);
      return scaled === 0 ? Math.sign(px) : scaled;
    };
  }, [windowWidth, windowHeight]);

  // Limpia el título inicial quitando coletillas tipo "(GOTY)", "- Remastered", etc.
  const cleanInitialTitle = useMemo(() => {
    if (!currentGameTitle) return '';
    return currentGameTitle
      .replace(/\s*[\(\[](GOTY|Game of the Year|Remastered|Edition|Director's Cut|Deluxe|Standard|Bundle).*?[\)\]]/gi, '')
      .replace(/\s*-\s*(GOTY|Game of the Year|Remastered|Edition).*$/gi, '')
      .trim();
  }, [currentGameTitle]);

  const [searchQuery, setSearchQuery] = useState(cleanInitialTitle);
  const [isSearching, setIsSearching] = useState(false);
  const [albums, setAlbums] = useState<KHInsiderAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<KHInsiderAlbum | null>(null);

  const [albumDetail, setAlbumDetail] = useState<KHInsiderAlbumDetail | null>(null);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState(false);

  // Reproducción de vista previa
  const [currentPlayingTrack, setCurrentPlayingTrack] = useState<KHInsiderTrack | null>(null);
  const [playbackAudioUrl, setPlaybackAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Descarga y aplicación de música
  const [applyingTrackUrl, setApplyingTrackUrl] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Teclado virtual
  const [isVKVisible, setVKVisible] = useState(false);

  // Enfoque gamepad
  // 'search' | 'albums' | 'tracks' | 'player'
  const [focusArea, setFocusArea] = useState<'search' | 'albums' | 'tracks' | 'player'>('albums');
  const [focusedAlbumIdx, setFocusedAlbumIdx] = useState(0);
  const [focusedTrackIdx, setFocusedTrackIdx] = useState(0);

  const playerRef = useRef<AudioPlayer | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const albumScrollRef = useRef<ScrollView>(null);
  const trackScrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);

  // Desplazamiento confiable y reactivo al item enfocado
  const scrollToTop = (scrollRef: React.RefObject<ScrollView | null>) => {
    try {
      const node = (scrollRef.current as any)?.getScrollableNode?.() || (scrollRef.current as any);
      if (node && 'scrollTop' in node) {
        node.scrollTop = 0;
      }
    } catch (_) { }
    try {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } catch (_) { }
  };

  const scrollListToFocusedItem = (
    scrollRef: React.RefObject<ScrollView | null>,
    elementId: string,
    idx: number,
    approxItemHeight: number
  ) => {
    if (idx <= 0) {
      scrollToTop(scrollRef);
      return;
    }

    if (typeof document !== 'undefined') {
      const el = document.getElementById(elementId);
      const container = (scrollRef.current as any)?.getScrollableNode?.() || (scrollRef.current as any);

      if (
        container &&
        el &&
        typeof container.getBoundingClientRect === 'function' &&
        typeof el.getBoundingClientRect === 'function'
      ) {
        const cRect = container.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        const padding = 16;

        // Si el elemento sobresale por arriba de la ventana visible
        if (eRect.top < cRect.top + padding) {
          const diff = eRect.top - (cRect.top + padding);
          const nextY = Math.max(0, container.scrollTop + diff);
          try {
            container.scrollTop = nextY;
          } catch (_) { }
          try {
            scrollRef.current?.scrollTo({ y: nextY, animated: false });
          } catch (_) { }
          return;
        }

        // Si el elemento sobresale por abajo de la ventana visible
        if (eRect.bottom > cRect.bottom - padding) {
          const diff = eRect.bottom - (cRect.bottom - padding);
          const nextY = Math.max(0, container.scrollTop + diff);
          try {
            container.scrollTop = nextY;
          } catch (_) { }
          try {
            scrollRef.current?.scrollTo({ y: nextY, animated: false });
          } catch (_) { }
          return;
        }

        // Ya está completamente visible dentro del contenedor, no mover nada
        return;
      }

      if (el && typeof el.scrollIntoView === 'function') {
        try {
          el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
          return;
        } catch (_) { }
      }
    }

    // Fallback matemático si los elementos DOM aún no están disponibles
    try {
      const fallbackY = Math.max(0, (idx - 2) * approxItemHeight);
      scrollRef.current?.scrollTo({ y: fallbackY, animated: false });
    } catch (_) { }
  };

  // Detiene y limpia el reproductor
  const stopAudio = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.remove();
      } catch (_) { }
      playerRef.current = null;
    }
    setIsPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
  }, []);

  // Limpieza al cerrar o desmontar
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  // Al abrir el modal, realiza búsqueda inicial automática con el título del juego
  useEffect(() => {
    if (isVisible) {
      const q = cleanInitialTitle || searchQuery;
      if (q && albums.length === 0) {
        handleSearch(q);
      }
    } else {
      stopAudio();
      setCurrentPlayingTrack(null);
      setPlaybackAudioUrl(null);
    }
  }, [isVisible]);

  // Función de búsqueda
  const handleSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q) return;
    setIsSearching(true);
    stopAudio();
    setSelectedAlbum(null);
    setAlbumDetail(null);
    try {
      const results = await khinsiderService.search(q);
      setAlbums(results);
      setFocusedAlbumIdx(0);
      if (results.length > 0) {
        // Carga automáticamente el primer álbum
        handleSelectAlbum(results[0]);
      }
    } catch (err: any) {
      toastService.show(t('khinsider.error') || 'Error al buscar en KHInsider');
    } finally {
      setIsSearching(false);
    }
  };

  // Seleccionar álbum y cargar canciones
  const handleSelectAlbum = async (album: KHInsiderAlbum) => {
    setSelectedAlbum(album);
    setIsLoadingAlbum(true);
    setAlbumDetail(null);
    setFocusedTrackIdx(0);
    scrollToTop(trackScrollRef);
    try {
      const detail = await khinsiderService.getAlbum(album.albumUrl);
      setAlbumDetail(detail);
      scrollToTop(trackScrollRef);
    } catch (err) {
      toastService.show(t('khinsider.error') || 'Error al cargar canciones');
    } finally {
      setIsLoadingAlbum(false);
    }
  };

  // Reproducir o pausar pista
  const handleTogglePlayTrack = async (track: KHInsiderTrack) => {
    // Si ya es la pista actual
    if (currentPlayingTrack?.trackUrl === track.trackUrl) {
      if (isPlaying && playerRef.current) {
        playerRef.current.pause();
        setIsPlaying(false);
      } else if (playerRef.current) {
        const p = playerRef.current.play() as any;
        if (p && typeof p.catch === 'function') p.catch(() => {});
        setIsPlaying(true);
      }
      return;
    }

    // Detener la anterior
    stopAudio();
    setCurrentPlayingTrack(track);
    setIsLoadingAudio(true);

    try {
      const directAudioUrl = await khinsiderService.getTrackAudio(track.trackUrl);
      if (!directAudioUrl) {
        toastService.show('No se pudo obtener el audio de esta canción');
        setIsLoadingAudio(false);
        return;
      }

      setPlaybackAudioUrl(directAudioUrl);

      // Reproducción usando expo-audio
      const player = createAudioPlayer(directAudioUrl);
      player.loop = true;
      player.volume = 0.9;
      playerRef.current = player;
      const p = player.play() as any;
      if (p && typeof p.catch === 'function') p.catch(() => {});
      setIsPlaying(true);

      // Temporizador para progreso estimado a partir de la duración del track
      const durSeconds = parseDurationToSeconds(track.duration);
      setAudioDuration(durSeconds || 120);
      setAudioCurrentTime(0);

      progressTimerRef.current = setInterval(() => {
        setAudioCurrentTime((prev) => {
          if (durSeconds && prev >= durSeconds) return 0;
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.warn('[KHInsiderModal] Error al reproducir audio:', err);
      toastService.show('Error al reproducir audio');
    } finally {
      setIsLoadingAudio(false);
    }
  };

  // Convertir "02:45" o "1:02:45" en segundos
  const parseDurationToSeconds = (durStr: any): number => {
    if (!durStr || typeof durStr !== 'string') return 0;
    const parts = durStr.split(':').map((p) => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  };

  const formatSeconds = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const sRem = Math.floor(sec % 60);
    return `${m}:${sRem < 10 ? '0' : ''}${sRem}`;
  };

  // Aplicar canción como música de fondo al juego
  const handleApplyTrack = async (track: KHInsiderTrack) => {
    setApplyingTrackUrl(track.trackUrl);
    try {
      let directUrl = playbackAudioUrl;
      if (!directUrl || currentPlayingTrack?.trackUrl !== track.trackUrl) {
        directUrl = await khinsiderService.getTrackAudio(track.trackUrl);
      }

      if (!directUrl) {
        toastService.show('No se pudo obtener la URL de descarga');
        return;
      }

      // Descarga y almacena localmente
      const localUri = await khinsiderService.downloadAndCacheTrack(directUrl);

      await onSelectTrack(localUri || directUrl, track.title, selectedAlbum?.title);
      toastService.show(t('khinsider.appliedSuccess') || 'Música aplicada correctamente para el carrusel');
    } catch (err: any) {
      console.error('[KHInsiderModal] Error al aplicar música:', err);
      toastService.show(t('khinsider.error') || 'Error al aplicar pista');
    } finally {
      setApplyingTrackUrl(null);
    }
  };

  // Quitar música actual
  const handleRemoveCurrentAudio = async () => {
    if (!onRemoveAudio) return;
    setIsRemoving(true);
    try {
      await onRemoveAudio();
      toastService.show(t('khinsider.audioRemoved') || 'Música eliminada del juego');
    } catch (_) {
    } finally {
      setIsRemoving(false);
    }
  };

  // Manejo de teclado físico y mando aislado
  useEffect(() => {
    if (!isVisible || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // Si está escribiendo en el input y presiona una tecla de texto normal, permitirlo
      if (isInput && !['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
        return;
      }

      // Bloquear COMPLETAMENTE la propagación a las vistas de fondo (GameDetailView, Home Carousel, etc.)
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }

      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape'].includes(e.key)) {
        e.preventDefault();
      }

      if (isVKVisible) return;

      // Cerrar modal con Escape, B o b
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        if (isInput) {
          searchInputRef.current?.blur();
          setFocusArea('albums');
          return;
        }
        onClose();
        return;
      }

      // Si está en la búsqueda
      if (focusArea === 'search') {
        if (e.key === 'Enter') {
          searchInputRef.current?.blur();
          handleSearch();
          return;
        }
        if (e.key === 'ArrowDown') {
          searchInputRef.current?.blur();
          setFocusArea('albums');
          return;
        }
        return;
      }

      // Atajo botón Triángulo / T para ir a la búsqueda
      if (e.key === 't' || e.key === 'T') {
        setFocusArea('search');
        searchInputRef.current?.focus();
        return;
      }

      // Atajo botón Cuadrado / X para aplicar la pista enfocada al juego
      if (e.key === 'x' || e.key === 'X' || (e as any).code === 'KeyX') {
        if (focusArea === 'tracks' && albumDetail?.tracks?.[focusedTrackIdx]) {
          handleApplyTrack(albumDetail.tracks[focusedTrackIdx]);
        } else if (currentPlayingTrack) {
          handleApplyTrack(currentPlayingTrack);
        } else if (albumDetail?.tracks?.[0]) {
          handleApplyTrack(albumDetail.tracks[0]);
        }
        return;
      }

      // Flechas para navegar
      if (e.key === 'ArrowDown') {
        if (focusArea === 'albums' && albums.length > 0) {
          const next = Math.min(focusedAlbumIdx + 1, albums.length - 1);
          setFocusedAlbumIdx(next);
          handleSelectAlbum(albums[next]);
        } else if (focusArea === 'tracks' && albumDetail?.tracks) {
          setFocusedTrackIdx((prev) => Math.min(prev + 1, (albumDetail.tracks.length || 1) - 1));
        }
      } else if (e.key === 'ArrowUp') {
        if (focusArea === 'albums') {
          if (focusedAlbumIdx === 0) {
            setFocusArea('search');
            searchInputRef.current?.focus();
          } else {
            const prev = Math.max(focusedAlbumIdx - 1, 0);
            setFocusedAlbumIdx(prev);
            handleSelectAlbum(albums[prev]);
          }
        } else if (focusArea === 'tracks') {
          if (focusedTrackIdx === 0) {
            setFocusArea('search');
            searchInputRef.current?.focus();
          } else {
            setFocusedTrackIdx((prev) => Math.max(prev - 1, 0));
          }
        }
      } else if (e.key === 'ArrowRight') {
        if (focusArea === 'albums' && albumDetail?.tracks && albumDetail.tracks.length > 0) {
          setFocusArea('tracks');
        }
      } else if (e.key === 'ArrowLeft') {
        if (focusArea === 'tracks') {
          setFocusArea('albums');
        }
      } else if (e.key === 'Enter') {
        if (focusArea === 'tracks' && albumDetail?.tracks?.[focusedTrackIdx]) {
          const track = albumDetail.tracks[focusedTrackIdx];
          handleTogglePlayTrack(track);
        } else if (focusArea === 'albums' && albums[focusedAlbumIdx]) {
          handleSelectAlbum(albums[focusedAlbumIdx]);
        }
      }
    };

    // Usar 'true' (fase de captura) para interceptar antes de cualquier otro listener
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isVisible, isVKVisible, focusArea, focusedAlbumIdx, focusedTrackIdx, albums, albumDetail, currentPlayingTrack]);

  // Auto-scroll para seguir el álbum enfocado
  useEffect(() => {
    if (focusArea !== 'albums') return;
    const run = () => {
      scrollListToFocusedItem(albumScrollRef, `kh-album-item-${focusedAlbumIdx}`, focusedAlbumIdx, s(86));
    };
    run();
    const raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [focusedAlbumIdx, focusArea, albums.length, s]);

  // Auto-scroll para seguir la canción enfocada
  useEffect(() => {
    if (focusArea !== 'tracks') return;
    const run = () => {
      scrollListToFocusedItem(trackScrollRef, `kh-track-item-${focusedTrackIdx}`, focusedTrackIdx, s(62));
    };
    run();
    const raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [focusedTrackIdx, focusArea, albumDetail?.tracks?.length, s]);

  const styles = useMemo(() => createStyles(s), [s]);

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.overlayGlow} />

        <View style={styles.shell}>
          <View style={styles.container}>
            {/* HEADER */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconBadge}>
                  <Ionicons name="disc" size={s(28)} color="#38ef47ff" />
                </View>
                <View>
                  <Text style={styles.headerTitle}>{t('khinsider.title')}</Text>
                  <Text style={styles.headerSubtitle}>
                    {currentGameTitle ? `OST para: ${currentGameTitle}` : t('khinsider.subtitle')}
                  </Text>
                </View>
              </View>

              <View style={styles.headerActions}>
                {currentFocusAudio && (
                  <TouchableOpacity
                    style={[styles.removeAudioBtn, isRemoving && { opacity: 0.5 }]}
                    onPress={handleRemoveCurrentAudio}
                    disabled={isRemoving}
                  >
                    <Ionicons name="trash-outline" size={s(16)} color="#FF3B30" />
                    <Text style={styles.removeAudioBtnText}>{t('khinsider.removeAudio')}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                  <Ionicons name="close" size={s(24)} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* SEARCH BAR */}
            <View style={styles.searchBarContainer}>
              <View style={[styles.searchInputWrapper, focusArea === 'search' && styles.searchInputWrapperFocused]}>
                <Ionicons name="search" size={s(20)} color="rgba(255,255,255,0.6)" style={{ marginRight: s(10) }} />
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t('khinsider.searchPlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  onSubmitEditing={() => handleSearch()}
                  onFocus={() => {
                    setFocusArea('search');
                    if (gamepadConnected) setVKVisible(true);
                  }}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: s(4) }}>
                    <Ionicons name="close-circle" size={s(18)} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.searchBtn, isSearching && { opacity: 0.6 }]}
                onPress={() => handleSearch()}
                disabled={isSearching}
              >
                {isSearching ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="search" size={s(18)} color="#FFF" />
                    <Text style={styles.searchBtnText}>{t('profile.coverSearchButton')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* MAIN CONTENT: 2 COLUMNS */}
            <View style={styles.contentRow}>
              {/* LEFT COLUMN: ALBUMS LIST */}
              <View style={styles.albumsColumn}>
                <View style={styles.columnHeader}>
                  <Text style={styles.columnTitle}>Álbumes</Text>
                  <Text style={styles.columnCount}>{albums.length > 0 ? `${albums.length} encontrados` : ''}</Text>
                </View>

                {isSearching ? (
                  <View style={styles.centeredState}>
                    <ActivityIndicator size="large" color="#38EF7D" />
                    <Text style={styles.stateText}>{t('khinsider.searching')}</Text>
                  </View>
                ) : albums.length === 0 ? (
                  <View style={styles.centeredState}>
                    <Ionicons name="musical-notes-outline" size={s(48)} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.stateText}>{t('khinsider.noResults')}</Text>
                    <Text style={styles.stateSubText}>Intenta buscar con otro término o el nombre oficial del juego.</Text>
                  </View>
                ) : (
                  <ScrollView
                    ref={albumScrollRef}
                    style={styles.albumsScrollView}
                    contentContainerStyle={styles.albumsScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {albums.map((album, idx) => {
                      const isSelected = selectedAlbum?.id === album.id;
                      const isFocused = focusArea === 'albums' && focusedAlbumIdx === idx;
                      return (
                        <TouchableOpacity
                          key={album.id || idx}
                          nativeID={`kh-album-item-${idx}`}
                          {...({ id: `kh-album-item-${idx}` } as any)}
                          style={[
                            styles.albumCard,
                            isSelected && styles.albumCardSelected,
                            isFocused && styles.albumCardFocused,
                          ]}
                          onPress={() => {
                            setFocusArea('albums');
                            setFocusedAlbumIdx(idx);
                            handleSelectAlbum(album);
                          }}
                        >
                          <Image
                            source={album.cover ? { uri: album.cover } : require('@/assets/images/music.png')}
                            style={styles.albumThumb}
                            contentFit="cover"
                          />
                          <View style={styles.albumInfo}>
                            <Text style={[styles.albumTitle, isSelected && styles.albumTitleSelected]} numberOfLines={2}>
                              {album.title}
                            </Text>
                            <View style={styles.albumMetaRow}>
                              {album.platform ? (
                                <View style={styles.metaBadge}>
                                  <Text style={styles.metaBadgeText} numberOfLines={1}>
                                    {album.platform}
                                  </Text>
                                </View>
                              ) : null}
                              {album.year ? (
                                <View style={styles.metaBadgeYear}>
                                  <Text style={styles.metaBadgeText}>{album.year}</Text>
                                </View>
                              ) : null}
                              {album.type ? (
                                <View style={styles.metaBadgeType}>
                                  <Text style={styles.metaBadgeText}>{album.type}</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                          {isSelected && (
                            <Ionicons name="chevron-forward" size={s(20)} color="#38EF7D" style={{ marginLeft: s(6) }} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              {/* RIGHT COLUMN: TRACKS & DETAIL */}
              <View style={styles.tracksColumn}>
                {!selectedAlbum ? (
                  <View style={styles.centeredState}>
                    <Ionicons name="disc-outline" size={s(64)} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.stateText}>{t('khinsider.selectAlbumPrompt')}</Text>
                  </View>
                ) : isLoadingAlbum ? (
                  <View style={styles.centeredState}>
                    <ActivityIndicator size="large" color="#38EF7D" />
                    <Text style={styles.stateText}>{t('khinsider.loadingTracks')}</Text>
                  </View>
                ) : (
                  <>
                    {/* ALBUM BANNER */}
                    <View style={styles.albumBanner}>
                      <Image
                        source={
                          albumDetail?.cover || selectedAlbum.cover
                            ? { uri: albumDetail?.cover || selectedAlbum.cover }
                            : require('@/assets/images/music.png')
                        }
                        style={styles.albumBannerCover}
                        contentFit="cover"
                      />
                      <View style={styles.albumBannerInfo}>
                        <Text style={styles.albumBannerTitle} numberOfLines={2}>
                          {albumDetail?.title || selectedAlbum.title}
                        </Text>
                        <View style={styles.albumBannerMetaRow}>
                          {selectedAlbum.platform ? (
                            <Text style={styles.bannerMetaText}>🎮 {selectedAlbum.platform}</Text>
                          ) : null}
                          {selectedAlbum.year ? <Text style={styles.bannerMetaText}>📅 {selectedAlbum.year}</Text> : null}
                          <Text style={styles.bannerMetaText}>
                            🎵 {albumDetail?.tracks?.length || 0} {t('khinsider.tracks').toLowerCase()}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* TRACKS LIST */}
                    <ScrollView
                      ref={trackScrollRef}
                      style={styles.tracksScrollView}
                      contentContainerStyle={styles.tracksScrollContent}
                      showsVerticalScrollIndicator={false}
                    >
                      {albumDetail?.tracks && albumDetail.tracks.length > 0 ? (
                        albumDetail.tracks.map((track, idx) => {
                          const isCurrentPlaying = currentPlayingTrack?.trackUrl === track.trackUrl;
                          const isThisApplying = applyingTrackUrl === track.trackUrl;
                          const isFocused = focusArea === 'tracks' && focusedTrackIdx === idx;

                          return (
                            <View
                              key={track.trackUrl || idx}
                              nativeID={`kh-track-item-${idx}`}
                              {...({ id: `kh-track-item-${idx}` } as any)}
                              style={[
                                styles.trackRow,
                                isCurrentPlaying && styles.trackRowPlaying,
                                isFocused && styles.trackRowFocused,
                              ]}
                            >
                              <TouchableOpacity
                                style={styles.trackPlayBtn}
                                onPress={() => {
                                  setFocusArea('tracks');
                                  setFocusedTrackIdx(idx);
                                  handleTogglePlayTrack(track);
                                }}
                              >
                                {isLoadingAudio && isCurrentPlaying ? (
                                  <ActivityIndicator size="small" color="#38EF7D" />
                                ) : (
                                  <Ionicons
                                    name={isCurrentPlaying && isPlaying ? 'pause-circle' : 'play-circle'}
                                    size={s(32)}
                                    color={isCurrentPlaying ? '#38EF7D' : '#FFF'}
                                  />
                                )}
                              </TouchableOpacity>

                              <View style={styles.trackInfo}>
                                <Text
                                  style={[styles.trackTitle, isCurrentPlaying && styles.trackTitlePlaying]}
                                  numberOfLines={1}
                                >
                                  {track.number ? `${track.number}. ` : ''}
                                  {track.title}
                                </Text>
                                <View style={styles.trackMetaRow}>
                                  {track.duration ? <Text style={styles.trackDuration}>{track.duration}</Text> : null}
                                  {track.size ? <Text style={styles.trackSize}>• {track.size}</Text> : null}
                                </View>
                              </View>

                              <View style={styles.trackActions}>
                                <TouchableOpacity
                                  style={[styles.applyTrackBtn, isThisApplying && { opacity: 0.6 }]}
                                  onPress={() => handleApplyTrack(track)}
                                  disabled={isThisApplying}
                                >
                                  {isThisApplying ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                  ) : (
                                    <>
                                      <Ionicons name="checkmark-circle-outline" size={s(16)} color="#FFF" />
                                      <Text style={styles.applyTrackBtnText}>{t('khinsider.applyMusic')}</Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })
                      ) : (
                        <View style={styles.centeredState}>
                          <Text style={styles.stateText}>No se encontraron pistas en este álbum.</Text>
                        </View>
                      )}
                    </ScrollView>
                  </>
                )}
              </View>
            </View>

            {/* BOTTOM PLAYER BAR */}
            {currentPlayingTrack && (
              <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={styles.playerBar}>
                <View style={styles.playerBarLeft}>
                  <Image
                    source={
                      selectedAlbum?.cover ? { uri: selectedAlbum.cover } : require('@/assets/images/music.png')
                    }
                    style={styles.playerThumb}
                    contentFit="cover"
                  />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerTrackTitle} numberOfLines={1}>
                      {currentPlayingTrack.title}
                    </Text>
                    <Text style={styles.playerAlbumTitle} numberOfLines={1}>
                      {selectedAlbum?.title || ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.playerControls}>
                  <TouchableOpacity
                    style={styles.playerPlayPauseBtn}
                    onPress={() => handleTogglePlayTrack(currentPlayingTrack)}
                  >
                    {isLoadingAudio ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Ionicons name={isPlaying ? 'pause' : 'play'} size={s(20)} color="#000" />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.playerStopBtn} onPress={stopAudio}>
                    <Ionicons name="stop" size={s(18)} color="#FFF" />
                  </TouchableOpacity>

                  <View style={styles.playerTimeContainer}>
                    <Text style={styles.playerTimeText}>
                      {formatSeconds(audioCurrentTime)} / {formatSeconds(audioDuration)}
                    </Text>
                    <View style={styles.playerProgressTrack}>
                      <View
                        style={[
                          styles.playerProgressBar,
                          {
                            width: `${audioDuration > 0 ? Math.min((audioCurrentTime / audioDuration) * 100, 100) : 0}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.playerBarRight}>
                  <TouchableOpacity
                    style={[
                      styles.playerApplyBtn,
                      applyingTrackUrl === currentPlayingTrack.trackUrl && { opacity: 0.6 },
                    ]}
                    onPress={() => handleApplyTrack(currentPlayingTrack)}
                    disabled={applyingTrackUrl === currentPlayingTrack.trackUrl}
                  >
                    {applyingTrackUrl === currentPlayingTrack.trackUrl ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Text style={styles.playerApplyBtnText}>{t('khinsider.applyMusic')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* VIRTUAL KEYBOARD */}
            <VirtualKeyboard
              visible={isVKVisible && gamepadConnected}
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
              onClose={() => {
                setVKVisible(false);
                handleSearch();
              }}
            />
          </View>

          {/* GAMEPAD CONTROL PROMPTS (fuera del contenedor, debajo) */}
          {gamepadConnected && (
            <View style={styles.controlPromptsBar}>
              <PSIcon
                char={PSIcons.cross}
                size={s(22)}
                color='#fff'

              />
              <Text style={styles.promptItemText}>{t('musicExpanded.playPause')}</Text>
              <PSIcon
                char={PSIcons.square}
                size={s(22)}
                color='#fff'
              />
              <Text style={styles.promptItemText}>{t('khinsider.applyMusic')}</Text>
              <PSIcon
                char={PSIcons.triangle}
                size={s(22)}
                color='#fff'
              />
              <Text style={styles.promptItemText}>{t('profile.coverSearchButton')}</Text>
              <PSIcon
                char={PSIcons.circle}
                size={s(22)}
                color='#fff'

              />
              <Text style={styles.promptItemText}>{t('account.back')}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (s: (px: number) => number) =>
  StyleSheet.create({
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 1)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    overlayGlow: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.89)',
    },
    shell: {
      width: '92%',
      height: '94%',
      flexDirection: 'column',
    },
    container: {
      flex: 1,
      backgroundColor: 'rgba(9, 12, 14, 1)',
      borderRadius: s(18),
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: s(28),
      paddingVertical: s(20),
      backgroundColor: 'rgba(22, 28, 32, 1)',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(16),
    },
    headerIconBadge: {
      width: s(50),
      height: s(50),
      borderRadius: s(14),
      backgroundColor: 'rgba(0, 0, 0, 1)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: s(24),
      fontFamily: "SSTLight",
      color: '#FFFFFF',
      letterSpacing: 0.4,
    },
    headerSubtitle: {
      fontSize: s(14),
      fontFamily: "SSTLight",
      color: 'rgba(255, 255, 255, 0.6)',
      marginTop: s(2),
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(12),
    },
    removeAudioBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(6),
      paddingHorizontal: s(14),
      paddingVertical: s(8),
      borderRadius: s(10),
      backgroundColor: 'rgba(255, 59, 48, 0.15)',
    },
    removeAudioBtnText: {
      color: '#FF3B30',
      fontSize: s(13),
      fontWeight: '600',
    },
    closeBtn: {
      width: s(40),
      height: s(40),
      borderRadius: s(20),
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: s(28),
      paddingVertical: s(14),
      gap: s(14),
      backgroundColor: 'rgba(14, 19, 22, 0.9)',
    },
    searchInputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(22, 28, 32, 1)',
      borderRadius: s(12),
      paddingHorizontal: s(16),
      height: s(46),
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    searchInputWrapperFocused: {
      borderColor: '#38EF7D',
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
    },
    searchInput: {
      flex: 1,
      color: '#FFF',
      fontSize: s(17),
      fontFamily: "SSTLight",
      paddingVertical: 0,
    },
    searchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
      backgroundColor: 'rgba(56, 239, 102, 0.16)',
      paddingHorizontal: s(20),
      height: s(46),
      borderRadius: s(12),
      justifyContent: 'center',
    },
    searchBtnText: {
      color: '#FFF',
      fontFamily: "SSTMedium",
      fontSize: s(17),
    },
    contentRow: {
      flex: 1,
      flexDirection: 'row',
    },
    albumsColumn: {
      width: '38%',
      display: 'flex',
      flexDirection: 'column',
    },
    tracksColumn: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'rgba(14, 19, 22, 1)',
    },
    columnHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: s(20),
      paddingVertical: s(12),
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    },
    columnTitle: {
      fontSize: s(24),
      fontFamily: "SSTLight",
      color: 'rgba(255, 255, 255, 0.8)',
      letterSpacing: 0.4,
    },
    columnCount: {
      fontSize: s(15),
      fontFamily: "SSTLight",
      color: 'rgba(255, 255, 255, 0.5)',
    },
    albumsScrollView: {
      flex: 1,
    },
    albumsScrollContent: {
      paddingHorizontal: s(14),
      paddingTop: s(12),
      paddingBottom: s(20),
    },
    albumCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: s(10),
      borderRadius: 0,
      backgroundColor: 'rgba(255, 255, 255, 0)',
      marginBottom: s(10),
      borderBottomWidth: s(2),
      borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    },
    albumCardSelected: {
      backgroundColor: 'rgba(56, 239, 125, 0.12)',
      borderColor: '#38EF7D',
    },
    albumCardFocused: {
      borderColor: '#FFF',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    albumThumb: {
      width: s(72),
      height: s(72),
      borderRadius: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      marginRight: s(12),
    },
    albumInfo: {
      flex: 1,
    },
    albumTitle: {
      fontSize: s(20),
      fontFamily: "SSTLight",
      color: '#FFFFFF',
      letterSpacing: 0.8,
      lineHeight: s(20),
    },
    albumTitleSelected: {
      color: '#38EF7D',
    },
    albumMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(6),
      marginTop: s(6),
      flexWrap: 'wrap',
    },
    metaBadge: {
      paddingHorizontal: s(6),
      paddingVertical: s(2),
      borderRadius: s(6),
      backgroundColor: 'rgba(0, 112, 209, 0.3)',
    },
    metaBadgeYear: {
      paddingHorizontal: s(6),
      paddingVertical: s(2),
      borderRadius: s(6),
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    metaBadgeType: {
      paddingHorizontal: s(6),
      paddingVertical: s(2),
      borderRadius: s(6),
      backgroundColor: 'rgba(56, 239, 125, 0.2)',
    },
    metaBadgeText: {
      fontSize: s(12),
      fontFamily: "SSTLight",
      color: '#FFF',
    },
    centeredState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: s(30),
      gap: s(12),
    },
    stateText: {
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: s(20),
      fontFamily: "SSTLight",
      textAlign: 'center',
    },
    stateSubText: {
      color: 'rgba(255, 255, 255, 0.4)',
      fontFamily: "SSTLight",
      fontSize: s(15),
      textAlign: 'center',
      maxWidth: s(320),
    },
    albumBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: s(24),
      paddingVertical: s(16),
      backgroundColor: 'rgba(14, 19, 22, 1)',
      gap: s(16),
    },
    albumBannerCover: {
      width: s(72),
      height: s(72),
      borderRadius: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    albumBannerInfo: {
      flex: 1,
    },
    albumBannerTitle: {
      fontSize: s(20),
      fontFamily: "SSTLight",
      color: 'rgba(255, 255, 255, 0.85)',
      lineHeight: s(22),
    },
    albumBannerMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(14),
      marginTop: s(8),
    },
    bannerMetaText: {
      fontSize: s(13),
      color: 'rgba(255, 255, 255, 0.65)',
      fontFamily: "SSTLight",
    },
    tracksScrollView: {
      flex: 1,
    },
    tracksScrollContent: {
      paddingHorizontal: s(20),
      paddingTop: s(12),
      paddingBottom: s(20),
    },
    trackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: s(10),
      paddingHorizontal: s(12),
      backgroundColor: 'rgba(255, 255, 255, 0)',
      marginBottom: s(8),
      borderBottomWidth: s(2),
      borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    },
    trackRowPlaying: {
      backgroundColor: 'rgba(56, 239, 125, 0.1)',
      borderColor: 'rgba(56, 239, 125, 0.4)',
    },
    trackRowFocused: {
      borderColor: '#FFF',
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
    },
    trackPlayBtn: {
      marginRight: s(12),
    },
    trackInfo: {
      flex: 1,
    },
    trackTitle: {
      fontSize: s(21),
      fontFamily: "SSTLight",
      letterSpacing: 0.8,
      color: 'rgba(255, 255, 255, 1)',
    },
    trackTitlePlaying: {
      color: '#38EF7D',
    },
    trackMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(6),
      marginTop: s(2),
    },
    trackDuration: {
      fontSize: s(13),
      color: 'rgba(255, 255, 255, 0.5)',
      fontFamily: "SSTLight",
      letterSpacing: 0.4,
    },
    trackSize: {
      fontSize: s(13),
      fontFamily: "SSTLight",
      letterSpacing: 0.8,
      color: 'rgba(255, 255, 255, 0.4)',
    },
    trackActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
    },
    applyTrackBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(6),
      backgroundColor: 'rgba(56, 239, 126, 0.12)',
      paddingHorizontal: s(12),
      paddingVertical: s(6),
      borderRadius: s(8)
    },
    applyTrackBtnText: {
      color: '#FFF',
      fontSize: s(15),
      fontFamily: "SSTLight",
      letterSpacing: 0.4,
    },
    playerBar: {
      height: s(80),
      backgroundColor: 'rgba(14, 19, 22, 1)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: s(24),
      justifyContent: 'space-between',
      shadowColor: '#38EF7D',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
    },
    playerBarLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '32%',
      gap: s(12),
    },
    playerThumb: {
      width: s(48),
      height: s(48),
      borderRadius: s(8),
    },
    playerInfo: {
      flex: 1,
    },
    playerTrackTitle: {
      fontSize: s(14),
      fontWeight: '700',
      color: '#FFF',
    },
    playerAlbumTitle: {
      fontSize: s(12),
      color: 'rgba(255, 255, 255, 0.5)',
      marginTop: s(2),
    },
    playerControls: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(16),
      paddingHorizontal: s(20),
    },
    playerPlayPauseBtn: {
      width: s(42),
      height: s(42),
      borderRadius: s(21),
      backgroundColor: '#38EF7D',
      alignItems: 'center',
      justifyContent: 'center',
    },
    playerStopBtn: {
      width: s(36),
      height: s(36),
      borderRadius: s(18),
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    playerTimeContainer: {
      flex: 1,
      maxWidth: s(240),
    },
    playerTimeText: {
      fontSize: s(12),
      fontFamily: "SSTLight",
      letterSpacing: 0.2,
      color: 'rgba(255, 255, 255, 0.6)',
      textAlign: 'center',
      marginBottom: s(4),
    },
    playerProgressTrack: {
      height: s(4),
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      borderRadius: s(2),
      overflow: 'hidden',
    },
    playerProgressBar: {
      height: '100%',
      backgroundColor: '#fdfdfdff',
      borderRadius: s(2),
    },
    playerBarRight: {
      width: '24%',
      alignItems: 'flex-end',
    },
    playerApplyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(56, 239, 102, 0.16)',
      paddingHorizontal: s(18),
      paddingVertical: s(10),
      borderRadius: s(12),
      shadowColor: '#38EF7D',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
    },
    playerApplyBtnText: {
      color: '#FFF',
      fontFamily: "SSTMedium",
      fontSize: s(15),
      letterSpacing: 0.2,
    },
    controlPromptsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(14),
      paddingTop: s(14),
      paddingBottom: s(0),
    },
    promptItemText: {
      color: '#fff',
      fontSize: s(13),
      fontFamily: 'SSTLight',
    }
  });

export default KHInsiderMusicModal;