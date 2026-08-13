/**
 * MusicPlayerCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Reproductor de música que funciona tanto en desarrollo como en producción.
 *
 * - Desarrollo: lee tracks precargados desde constants/tracks.ts (via sync-music.mjs)
 * - Producción : el usuario importa .mp3 desde su dispositivo/PC con el botón "+"
 *                Los archivos se persisten en expo-file-system + AsyncStorage
 *
 * Coloca en:  components/MusicPlayerCard.tsx
 *
 * Dependencias (ya deberías tenerlas en un proyecto Expo):
 *   expo-av, expo-file-system, expo-document-picker,
 *   expo-image, react-native-reanimated, @expo/vector-icons
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import staticTracks, { Track as StaticTrack } from '@/constants/tracks';
import { useSystemMedia } from '@/hooks/useSystemMedia';
import {
  formatMediaTime,
  getAppIconName,
  sendMediaControl,
  getMediaControlTarget,
} from '@/services/systemMediaService';
import { soundService } from '@/services/soundService';

type MediaControlAction = 'prev' | 'play_pause' | 'next';
const MEDIA_CONTROLS: MediaControlAction[] = ['prev', 'play_pause', 'next'];

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Track en runtime: puede venir de require() estático o de una URI local */
interface RuntimeTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  /** require() para tracks estáticos, o string URI para tracks importados en runtime */
  source: number | string;
  /** require() o URI de la portada, si existe */
  artwork?: any;
  color?: string;
  /** true = fue añadido por el usuario en runtime (persistido en FS) */
  userAdded?: boolean;
}

interface MusicPlayerCardProps {
  isFocused?: boolean;
}

// ─── Constantes ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'music_player_user_tracks_v1';
const MUSIC_DIR = (FileSystem as any).documentDirectory + 'music/';
const FALLBACK_COLORS = [
  '#1DB954', '#e40d60', '#6a5acd', '#e67e22',
  '#2980b9', '#c0392b', '#16a085', '#8e44ad',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function filenameToTitle(name: string) {
  return name
    .replace(/\.[^.]+$/, '')          // quitar extensión
    .replace(/[-_]+/g, ' ')           // guiones/underscores → espacio
    .replace(/\b\w/g, c => c.toUpperCase()); // Title Case
}

/** Convierte tracks estáticos al tipo RuntimeTrack */
function staticToRuntime(t: StaticTrack, index: number): RuntimeTrack {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    source: t.source,
    artwork: t.artwork,
    color: t.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    userAdded: false,
  };
}

function getAccentFromApp(appName: string) {
  const icon = getAppIconName(appName);
  if (icon.bg === 'rgba(255,255,255,0.92)') return '#1DB954';
  return icon.bg;
}

// ─── Persistencia ─────────────────────────────────────────────────────────────
async function loadUserTracks(): Promise<RuntimeTrack[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveUserTracks(tracks: RuntimeTrack[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
  } catch { /* noop */ }
}

async function deleteUserTrack(track: RuntimeTrack) {
  try {
    if (typeof track.source === 'string') {
      await FileSystem.deleteAsync(track.source, { idempotent: true });
    }
    if (track.artwork && typeof track.artwork === 'string') {
      await FileSystem.deleteAsync(track.artwork, { idempotent: true });
    }
  } catch { /* noop */ }
}

// ─── Importar archivo desde el dispositivo ───────────────────────────────────
async function importAudioFile(existingCount: number): Promise<RuntimeTrack | null> {
  // Web: usa input[type=file] nativo
  if (Platform.OS === 'web') {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,.mp3,.flac,.ogg,.m4a,.aac,.wav';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }

        // En web usamos una object URL (no persiste entre recargas, pero funciona en runtime)
        const uri = URL.createObjectURL(file);
        const title = filenameToTitle(file.name);
        const id = `user-${Date.now()}`;
        resolve({
          id,
          title,
          artist: 'Importado',
          source: uri,
          color: FALLBACK_COLORS[existingCount % FALLBACK_COLORS.length],
          userAdded: true,
        });
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  // Móvil / Desktop nativo: expo-document-picker
  const result = await DocumentPicker.getDocumentAsync({
    type: ['audio/*'],
    copyToCacheDirectory: false,
  });

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];

  // Copiar al directorio persistente de la app
  await FileSystem.makeDirectoryAsync(MUSIC_DIR, { intermediates: true });
  const destName = `${Date.now()}_${asset.name}`;
  const destUri = MUSIC_DIR + destName;
  await FileSystem.copyAsync({ from: asset.uri, to: destUri });

  const id = `user-${Date.now()}`;
  const title = filenameToTitle(asset.name);

  return {
    id,
    title,
    artist: 'Importado',
    source: destUri,
    color: FALLBACK_COLORS[existingCount % FALLBACK_COLORS.length],
    userAdded: true,
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MusicPlayerCard({ isFocused = false }: MusicPlayerCardProps) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const { nowPlaying } = useSystemMedia();
  const systemActive = Boolean(nowPlaying);
  const systemTarget = getMediaControlTarget(nowPlaying);

  const [allTracks, setAllTracks] = useState<RuntimeTrack[]>([]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showList, setShowList] = useState(false);
  const [controlFocusIndex, setControlFocusIndex] = useState(1);

  const track = allTracks[trackIndex];

  useEffect(() => {
    if (isFocused) setControlFocusIndex(1);
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        setControlFocusIndex((prev) => Math.max(0, prev - 1));
        soundService.playNavigation();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        setControlFocusIndex((prev) => Math.min(MEDIA_CONTROLS.length - 1, prev + 1));
        soundService.playNavigation();
      } else if (e.key === 'Enter' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        e.stopPropagation();
        soundService.playActivation?.();
        const action = MEDIA_CONTROLS[controlFocusIndex];
        if (systemActive) {
          void sendMediaControl(action, systemTarget);
        } else if (action === 'prev') {
          void skipPrev();
        } else if (action === 'next') {
          void skipNext();
        } else {
          void togglePlay();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isFocused, controlFocusIndex, systemActive, systemTarget]);

  useEffect(() => {
    if (!systemActive || !soundRef.current) return;
    soundRef.current.pauseAsync().catch(() => {});
    setIsPlaying(false);
  }, [systemActive, nowPlaying?.id]);

  // ── Cargar tracks al montar ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const staticRT = staticTracks.map(staticToRuntime);
      const userTracks = await loadUserTracks();
      setAllTracks([...staticRT, ...userTracks]);
    })();

    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    }).catch(() => { });

    return () => { soundRef.current?.unloadAsync().catch(() => { }); };
  }, []);

  // ── Cargar audio cuando cambia el track ───────────────────────────────────
  useEffect(() => {
    if (systemActive || !track) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setPositionMs(0);
      setDurationMs(0);
      await soundRef.current?.unloadAsync().catch(() => { });
      soundRef.current = null;

      try {
        const source = typeof track.source === 'string'
          ? { uri: track.source }
          : track.source;

        const { sound } = await Audio.Sound.createAsync(
          source,
          { shouldPlay: isPlaying },
          onStatusUpdate,
        );
        if (!cancelled) {
          soundRef.current = sound;
          if (isPlaying) sound.playAsync().catch(() => { });
        } else {
          sound.unloadAsync().catch(() => { });
        }
      } catch (e) {
        console.warn('Error cargando track:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIndex, allTracks, systemActive]);

  const onStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPositionMs(status.positionMillis ?? 0);
    setDurationMs(status.durationMillis ?? 0);
    setIsPlaying(status.isPlaying);
    if (status.didJustFinish) {
      setTrackIndex(i => (i + 1) % allTracks.length);
    }
  }, [allTracks.length]);

  // ── Controles de reproducción ─────────────────────────────────────────────
  const togglePlay = async () => {
    if (systemActive) {
      await sendMediaControl('play_pause', systemTarget);
      return;
    }
    if (!soundRef.current) return;
    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch (e) {
      console.warn('Cannot play/pause: sound not loaded', e);
    }
  };

  const skipNext = async () => {
    if (systemActive) {
      await sendMediaControl('next', systemTarget);
      return;
    }
    setTrackIndex(i => (i + 1) % allTracks.length);
  };

  const skipPrev = async () => {
    if (systemActive) {
      await sendMediaControl('prev', systemTarget);
      return;
    }
    if (positionMs > 3000) {
      try {
        await soundRef.current?.setPositionAsync(0);
      } catch (e) {
        console.warn('Cannot set position: sound not loaded', e);
      }
    } else {
      setTrackIndex(i => (i - 1 + allTracks.length) % allTracks.length);
    }
  };

  // ── Importar nuevo track ──────────────────────────────────────────────────
  const handleImport = async () => {
    setIsImporting(true);
    try {
      const newTrack = await importAudioFile(allTracks.length);
      if (!newTrack) return;

      const userOnly = [...allTracks.filter(t => t.userAdded), newTrack];
      await saveUserTracks(userOnly);
      setAllTracks(prev => [...prev, newTrack]);
      // Saltar al nuevo track automáticamente
      setTrackIndex(allTracks.length);
    } catch (e) {
      console.warn('Error importando:', e);
    } finally {
      setIsImporting(false);
    }
  };

  // ── Eliminar un track de la lista ─────────────────────────────────────────
  const handleDelete = async (id: string) => {
    const target = allTracks.find(t => t.id === id);
    if (!target?.userAdded) return; // no eliminar tracks estáticos
    await deleteUserTrack(target);
    const next = allTracks.filter(t => t.id !== id);
    const userOnly = next.filter(t => t.userAdded);
    await saveUserTracks(userOnly);
    setAllTracks(next);
    if (trackIndex >= next.length) setTrackIndex(Math.max(0, next.length - 1));
  };

  // ── Animación de barras ───────────────────────────────────────────────────
  const barAnim = useSharedValue(1);
  const displayPlaying = systemActive
    ? nowPlaying?.playbackStatus === 'playing'
    : isPlaying;

  useEffect(() => {
    barAnim.value = displayPlaying
      ? withRepeat(withTiming(0.35, { duration: 480, easing: Easing.inOut(Easing.ease) }), -1, true)
      : withTiming(0.5, { duration: 200 });
  }, [displayPlaying]);

  const bar1 = useAnimatedStyle(() => ({ height: interpolate(barAnim.value, [0.35, 1], [4, 15]) }));
  const bar2 = useAnimatedStyle(() => ({ height: interpolate(barAnim.value, [0.35, 1], [15, 5]) }));
  const bar3 = useAnimatedStyle(() => ({ height: interpolate(barAnim.value, [0.35, 1], [7, 17]) }));
  const bar4 = useAnimatedStyle(() => ({ height: interpolate(barAnim.value, [0.35, 1], [12, 4]) }));

  const displayTitle = systemActive ? nowPlaying!.title : track?.title;
  const displayArtist = systemActive ? nowPlaying!.artist : track?.artist;
  const displayAlbum = systemActive ? nowPlaying!.albumTitle : track?.album;
  const displayArtwork = systemActive ? nowPlaying!.thumbnail : track?.artwork;
  const displayPositionMs = systemActive ? nowPlaying!.positionMs : positionMs;
  const displayDurationMs = systemActive ? nowPlaying!.durationMs : durationMs;
  const accentColor = systemActive
    ? getAccentFromApp(nowPlaying!.appName)
    : (track?.color ?? '#1DB954');
  const headerLabel = systemActive
    ? `En ${nowPlaying!.appName}`
    : 'Música local';
  const progress = displayDurationMs > 0 ? displayPositionMs / displayDurationMs : 0;
  const fmtTime = (ms: number) => (systemActive ? formatMediaTime(ms) : fmt(ms));

  const runControlAction = async (action: MediaControlAction) => {
    if (action === 'prev') await skipPrev();
    else if (action === 'next') await skipNext();
    else await togglePlay();
  };

  const controlBtnStyle = (index: number) => [
    styles.controlBtn,
    isFocused && controlFocusIndex === index && styles.controlBtnFocused,
  ];

  const playBtnStyle = [
    styles.playBtn,
    { backgroundColor: accentColor, opacity: !systemActive && isLoading ? 0.6 : 1 },
    isFocused && controlFocusIndex === 1 && styles.playBtnFocused,
  ];

  // ── Sin tracks ni reproducción del sistema ────────────────────────────────
  if (!systemActive && allTracks.length === 0) {
    return (
      <View style={[styles.card, isFocused && styles.cardFocused]}>
        <View style={styles.header}>
          <Ionicons name="musical-notes-outline" size={13} color="rgba(255,255,255,0.3)" />
          <Text style={styles.headerLabel}>Música</Text>
          <TouchableOpacity onPress={handleImport} disabled={isImporting} style={styles.addBtn}>
            {isImporting
              ? <ActivityIndicator size="small" color="#1DB954" />
              : <Ionicons name="add" size={16} color="#1DB954" />}
          </TouchableOpacity>
        </View>
        <Text style={styles.emptyTitle}>Sin canciones</Text>
        <Text style={styles.emptyDesc}>
          Toca <Text style={{ color: '#1DB954' }}>+</Text> para importar un archivo de audio
          desde tu dispositivo.
        </Text>
      </View>
    );
  }

  // ── Reproductor ───────────────────────────────────────────────────────────
  return (
    <View style={[styles.card, isFocused && styles.cardFocused]}>

      {/* Glow dinámico */}
      {Platform.OS === 'web' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse at 15% 60%, ${accentColor}28 0%, transparent 60%)`,
          transition: 'background 600ms ease',
        }} />
      )}
      {Platform.OS === 'web' && isFocused && (
        <div className="widget-shimmer-line" style={{ animationDuration: '7s', opacity: 0.8 }} />
      )}

      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="musical-notes" size={13} color={accentColor} />
        <Text style={styles.headerLabel}>{headerLabel}</Text>

        {!systemActive && (
          <>
            <TouchableOpacity onPress={() => setShowList(v => !v)} style={styles.iconBtn}>
              <Ionicons
                name={showList ? 'chevron-up' : 'list'}
                size={14}
                color="rgba(255,255,255,0.45)"
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleImport} disabled={isImporting} style={styles.addBtn}>
              {isImporting
                ? <ActivityIndicator size="small" color={accentColor} />
                : <Ionicons name="add" size={16} color={accentColor} />}
            </TouchableOpacity>
          </>
        )}

        <View style={[styles.statusDot, { backgroundColor: displayPlaying ? accentColor : 'rgba(255,255,255,0.15)' }]} />
      </View>

      {/* Lista desplegable (solo música local) */}
      {!systemActive && showList && (
        <ScrollView style={styles.trackList} showsVerticalScrollIndicator={false}>
          {allTracks.map((t, i) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => { setTrackIndex(i); setShowList(false); }}
              style={[styles.trackListItem, i === trackIndex && { backgroundColor: `${accentColor}22` }]}
            >
              <Ionicons
                name={i === trackIndex && isPlaying ? 'volume-high' : 'musical-note'}
                size={12}
                color={i === trackIndex ? accentColor : 'rgba(255,255,255,0.3)'}
                style={{ marginRight: 8 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.listTitle, i === trackIndex && { color: '#fff' }]} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={styles.listArtist} numberOfLines={1}>{t.artist}</Text>
              </View>
              {t.userAdded && (
                <TouchableOpacity
                  onPress={() => handleDelete(t.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={13} color="rgba(255,255,255,0.25)" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {(systemActive || !showList) && (
        <>
          <View style={styles.trackRow}>
            {displayArtwork ? (
              <Image
                source={typeof displayArtwork === 'string' ? { uri: displayArtwork } : displayArtwork}
                style={styles.artwork}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.artworkPlaceholder, { backgroundColor: `${accentColor}33` }]}>
                <Ionicons name="musical-note" size={18} color={accentColor} />
              </View>
            )}

            <View style={styles.trackInfo}>
              <Text style={styles.trackTitle} numberOfLines={1}>{displayTitle ?? '—'}</Text>
              <Text style={styles.trackArtist} numberOfLines={1}>{displayArtist ?? '—'}</Text>
              {displayAlbum ? <Text style={styles.trackAlbum} numberOfLines={1}>{displayAlbum}</Text> : null}
            </View>

            <View style={styles.bars}>
              <Animated.View style={[styles.bar, { backgroundColor: accentColor }, bar1]} />
              <Animated.View style={[styles.bar, { backgroundColor: accentColor }, bar2]} />
              <Animated.View style={[styles.bar, { backgroundColor: accentColor }, bar3]} />
              <Animated.View style={[styles.bar, { backgroundColor: accentColor }, bar4]} />
            </View>
          </View>

          <View style={styles.progressSection}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {
                width: `${progress * 100}%` as any,
                backgroundColor: accentColor,
              }]} />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{fmtTime(displayPositionMs)}</Text>
              <Text style={styles.timeText}>{displayDurationMs ? fmtTime(displayDurationMs) : '--:--'}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity
              onPress={() => runControlAction('prev')}
              style={controlBtnStyle(0)}
            >
              <Ionicons name="play-skip-back" size={15} color="rgba(255,255,255,0.65)" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => runControlAction('play_pause')}
              disabled={!systemActive && isLoading}
              style={playBtnStyle}
            >
              {!systemActive && isLoading
                ? <ActivityIndicator size="small" color="#000" />
                : <Ionicons name={displayPlaying ? 'pause' : 'play'} size={14} color="#000" />}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => runControlAction('next')}
              style={controlBtnStyle(2)}
            >
              <Ionicons name="play-skip-forward" size={15} color="rgba(255,255,255,0.65)" />
            </TouchableOpacity>
          </View>

          {!systemActive && allTracks.length > 1 && (
            <Text style={styles.trackCount}>{trackIndex + 1} / {allTracks.length}</Text>
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgb(38, 41, 47)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    minWidth: 260,
    maxWidth: 310,
    overflow: 'hidden',
    position: 'relative',
  },
  cardFocused: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    zIndex: 1,
  },
  headerLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  iconBtn: { padding: 2 },
  addBtn: { padding: 2 },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  trackList: {
    maxHeight: 160,
    marginBottom: 8,
    zIndex: 1,
  },
  trackListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginBottom: 2,
  },
  listTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  listArtist: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 10,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    zIndex: 1,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  artworkPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackInfo: { flex: 1 },
  trackTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  trackArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 1 },
  trackAlbum: { color: 'rgba(255,255,255,0.28)', fontSize: 10, marginTop: 1 },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 18,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
  progressSection: { zIndex: 1, marginBottom: 10 },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 10,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    zIndex: 1,
  },
  controlBtn: { padding: 4, borderRadius: 8, borderWidth: 1.5, borderColor: 'transparent' },
  controlBtnFocused: {
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  playBtnFocused: {
    borderColor: 'rgba(255,255,255,0.95)',
  },
  trackCount: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
    zIndex: 1,
  },
  emptyTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    zIndex: 1,
  },
  emptyDesc: {
    color: 'rgba(255,255,255,0.22)',
    fontSize: 11,
    lineHeight: 18,
    zIndex: 1,
  },
});