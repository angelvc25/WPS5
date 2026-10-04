import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { soundService } from '@/services/soundService';
import { toastService } from '@/services/toastService';
import VirtualKeyboard from './VirtualKeyboard';
import {
  BUNDLED_AUDIO_PACKS,
  getInstalledAudioPack,
  listInstalledAudioPacks,
  mapDeckFilesToRoles,
  pickDeckMusicFile,
  removeInstalledAudioPack,
  saveInstalledAudioPack,
  searchDeckAudioPacks,
  type DeckAudioKind,
  type DeckAudioPack,
  type DeckAudioSort,
  type InstalledAudioPack,
} from '@/services/deckAudioService';
import type { SoundName } from '@/constants/themes';

type ScaleFn = (px: number) => number;
type TabId = DeckAudioKind | 'downloaded';

interface DownloadedEntry {
  key: string;
  kind: DeckAudioKind;
  name: string;
  author: string;
  version: string;
  bundled: boolean;
  installed?: InstalledAudioPack;
}

const SORTS: DeckAudioSort[] = ['downloads', 'likes', 'newest', 'name'];

function formatDownloads(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function isElectron(): boolean {
  return Platform.OS === 'web' && !!(window as any).electronAPI?.downloadDeckAudioPack;
}

export default function AudioPackBrowser({
  active,
  gamepadConnected,
}: {
  active: boolean;
  /** Hay un mando conectado. El teclado virtual solo se muestra si es true. */
  gamepadConnected: boolean;
}) {
  const { t } = useTranslation();
  const {
    audioPackId, audioPackName, musicPackId, musicPackName,
    setAudioPack, setMusicPack,
  } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

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

  const [tab, setTab] = useState<TabId>('audio');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DeckAudioSort>('downloads');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<DeckAudioPack[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [registryBump, setRegistryBump] = useState(0);
  const [preview, setPreview] = useState<DeckAudioPack | DownloadedEntry | null>(null);

  // Foco por mando/teclado (capture, para no chocar con SettingsView).
  const [showVK, setShowVKState] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  // Abrir el teclado virtual solo si hay mando conectado. Sin mando se enfoca
  // el input nativo para escribir con teclado físico / del sistema.
  const setShowVK = (show: boolean) => {
    if (show && !gamepadConnected) {
      searchInputRef.current?.focus();
      return;
    }
    setShowVKState(show);
  };

  // Si el mando se desconecta con el teclado virtual abierto, ciérralo y
  // devuelve el foco al input nativo.
  useEffect(() => {
    if (!gamepadConnected && showVK) {
      setShowVKState(false);
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [gamepadConnected, showVK]);
  const [zone, setZone] = useState<'pills' | 'search' | 'grid' | 'pager'>('pills');
  const [pillIndex, setPillIndex] = useState(0);
  const [gridIndex, setGridIndex] = useState(0);
  const [pagerIndex, setPagerIndex] = useState(0);
  const [modalIndex, setModalIndex] = useState(0);

  const TABS: { id: TabId; label: string }[] = [
    { id: 'audio', label: t('settings.audioTabFx') },
    { id: 'music', label: t('settings.audioTabMusic') },
    { id: 'downloaded', label: t('settings.audioTabDownloaded') },
  ];
  // Pills aplanadas: 3 tabs + 4 sorts (solo online).
  const pills = tab === 'downloaded'
    ? TABS.map((tb) => ({ kind: 'tab' as const, id: tb.id, label: tb.label }))
    : [
      ...TABS.map((tb) => ({ kind: 'tab' as const, id: tb.id, label: tb.label })),
      ...SORTS.map((st) => ({ kind: 'sort' as const, id: st, label: t(`settings.audioSort${st[0].toUpperCase()}${st.slice(1)}` as any) })),
    ];

  const downloaded: DownloadedEntry[] = useMemo(() => {
    const installed = listInstalledAudioPacks();
    const entries: DownloadedEntry[] = [
      ...BUNDLED_AUDIO_PACKS.map((b) => ({
        key: b.id, kind: b.kind, name: b.name, author: b.author,
        version: b.version, bundled: true,
      })),
      ...installed.map((p) => ({
        key: p.id, kind: p.kind, name: p.name, author: p.author,
        version: p.version, bundled: false, installed: p,
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void registryBump;
    return entries;
  }, [registryBump]);

  const isDownloadedTab = tab === 'downloaded';
  const gridCount = isDownloadedTab ? downloaded.length : items.length;
  const GRID_COLS = 3;

  // ── Búsqueda online ────────────────────────────────────────────────
  useEffect(() => {
    if (isDownloadedTab) { setLoading(false); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timeout = setTimeout(async () => {
      try {
        const res = await searchDeckAudioPacks({ query, kind: tab, sort, page, limit: 12 });
        if (!cancelled) {
          setItems(res.items);
          setTotalPages(res.totalPages || 1);
        }
      } catch (err: any) {
        if (!cancelled) {
          setItems([]);
          setError(err?.message || 'DeckThemes');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [tab, query, sort, page, isDownloadedTab]);

  useEffect(() => { setPage(1); }, [query, tab, sort]);
  useEffect(() => { setGridIndex(0); }, [items.length, downloaded.length, tab]);
  useEffect(() => { setZone('pills'); setPillIndex(0); }, [tab]);

  const isApplied = useCallback((entry: DownloadedEntry | DeckAudioPack): boolean => {
    if ('target' in entry) {
      // Online: aplicado si su id instalado coincide con el slot.
      const installed = listInstalledAudioPacks().find((p) => p.deckId === entry.id);
      if (!installed) return false;
      return entry.target === 'Audio' ? audioPackId === installed.id : musicPackId === installed.id;
    }
    return entry.kind === 'audio' ? audioPackId === entry.key : musicPackId === entry.key;
  }, [audioPackId, musicPackId]);

  const applyEntry = useCallback((entry: DownloadedEntry | DeckAudioPack) => {
    if ('target' in entry) {
      const installed = listInstalledAudioPacks().find((p) => p.deckId === entry.id);
      if (!installed) return;
      if (entry.target === 'Audio') setAudioPack(installed.id);
      else setMusicPack(installed.id);
    } else {
      if (entry.kind === 'audio') setAudioPack(entry.key);
      else setMusicPack(entry.key);
    }
    // Deja que los players recarguen antes de la demo.
    setTimeout(() => soundService.playActivation?.().catch(() => { }), 800);
  }, [setAudioPack, setMusicPack]);

  const openPreview = (entry: DownloadedEntry | DeckAudioPack) => {
    setPreview(entry);
    setModalIndex(0);
  };

  // ── Descarga e instalación ─────────────────────────────────────────
  const handleDownloadAndUse = async (pack: DeckAudioPack) => {
    if (!isElectron()) {
      toastService.show(t('settings.desktopOnly'));
      return;
    }
    const kind: DeckAudioKind = pack.target === 'Music' ? 'music' : 'audio';
    const safeId = `deck-${pack.id}`;
    setDownloadingId(`${pack.id}:${kind}`);
    try {
      const res = await (window as any).electronAPI.downloadDeckAudioPack(pack.downloadUrl, safeId, kind);
      if (!res?.success) {
        toastService.show(res?.error || 'DeckThemes');
        return;
      }
      const files: { name: string; rel: string; size: number }[] = (res.files || []).map((f: any) => ({
        name: String(f.name || ''),
        rel: String(f.rel || f.name || ''),
        size: Number(f.size || 0),
      }));
      const ignore: string[] = Array.isArray(res.packJson?.ignore) ? res.packJson.ignore : [];
      let roles: Partial<Record<SoundName, string>> = {};
      if (kind === 'audio') {
        roles = mapDeckFilesToRoles(files, ignore);
        if (Object.keys(roles).length === 0) {
          await (window as any).electronAPI.removeDeckAudioPack(res.dir).catch(() => { });
          toastService.show(t('settings.audioNoCompatible'));
          return;
        }
      } else {
        const musicFile = pickDeckMusicFile(files, ignore);
        if (!musicFile) {
          await (window as any).electronAPI.removeDeckAudioPack(res.dir).catch(() => { });
          toastService.show(t('settings.audioNoCompatible'));
          return;
        }
        roles = { background: musicFile };
      }
      saveInstalledAudioPack({
        id: safeId,
        kind,
        name: pack.name,
        author: pack.author,
        version: pack.version,
        deckId: pack.id,
        dir: res.dir,
        files: files.map((f) => f.rel),
        roles,
        downloadedAt: Date.now(),
      });
      setRegistryBump((b) => b + 1);
      if (kind === 'audio') setAudioPack(safeId);
      else setMusicPack(safeId);
      // La música arranca sola al aplicar; los efectos necesitan demo diferida.
      if (kind === 'audio') {
        setTimeout(() => soundService.playActivation?.().catch(() => { }), 900);
      }
      setPreview(null);
    } catch (err: any) {
      toastService.show(err?.message || 'DeckThemes');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRemove = async (entry: DownloadedEntry) => {
    if (entry.bundled || !entry.installed) return;
    try {
      if (isElectron()) {
        await (window as any).electronAPI.removeDeckAudioPack(entry.installed.dir).catch(() => { });
      }
      removeInstalledAudioPack(entry.key);
      if (entry.kind === 'audio' && audioPackId === entry.key) setAudioPack(null);
      if (entry.kind === 'music' && musicPackId === entry.key) setMusicPack(null);
      setRegistryBump((b) => b + 1);
      setPreview(null);
      soundService.playBack?.().catch(() => { });
    } catch { /* noop */ }
  };

  // Acciones del modal según estado.
  const modalActions = useMemo(() => {
    if (!preview) return [];
    const actions: { id: string; label: string; danger?: boolean }[] = [];
    if ('target' in preview) {
      const installed = getInstalledAudioPack(`deck-${preview.id}`);
      if (installed) {
        const applied = preview.target === 'Audio' ? audioPackId === installed.id : musicPackId === installed.id;
        if (!applied) actions.push({ id: 'use', label: t('settings.audioUse') });
        else actions.push({ id: 'noop', label: t('settings.audioUsing') });
        actions.push({ id: 'remove', label: t('settings.audioRemove'), danger: true });
      } else {
        actions.push({ id: 'download', label: t('settings.audioDownloadUse') });
      }
    } else if (!preview.bundled) {
      const applied = preview.kind === 'audio' ? audioPackId === preview.key : musicPackId === preview.key;
      if (!applied) actions.push({ id: 'use', label: t('settings.audioUse') });
      else actions.push({ id: 'noop', label: t('settings.audioUsing') });
      actions.push({ id: 'remove', label: t('settings.audioRemove'), danger: true });
    } else {
      const applied = preview.kind === 'audio' ? audioPackId === preview.key : musicPackId === preview.key;
      if (!applied) actions.push({ id: 'use', label: t('settings.audioUse') });
      else actions.push({ id: 'noop', label: t('settings.audioUsing') });
    }
    actions.push({ id: 'close', label: t('settings.audioClose') });
    return actions;
  }, [preview, audioPackId, musicPackId, t]);

  const runModalAction = (actionId?: string) => {
    const targetAction = modalActions.find((a) => a.id === actionId) || modalActions[modalIndex];
    if (!preview || !targetAction || downloadingId) return;
    if (targetAction.id === 'close' || targetAction.id === 'noop') { setPreview(null); return; }
    if (targetAction.id === 'use') { applyEntry(preview); setPreview(null); return; }
    if (targetAction.id === 'download' && 'target' in preview) { handleDownloadAndUse(preview); return; }
    if (targetAction.id === 'remove' && !('target' in preview)) { handleRemove(preview); return; }
    if (targetAction.id === 'remove' && 'target' in preview) {
      const installed = getInstalledAudioPack(`deck-${preview.id}`);
      if (installed) handleRemove({ key: installed.id, kind: installed.kind, name: installed.name, author: installed.author, version: installed.version, bundled: false, installed });
    }
  };

  // ── Teclado/mando (capture: va antes que el handler de SettingsView) ──
  const activeRef = useRef(active);
  activeRef.current = active;
  const cardRefs = useRef(new Map<number, any>());
  const stateRef = useRef({
    zone,
    pillIndex,
    gridIndex,
    pagerIndex,
    page,
    totalPages,
    gridCount,
    pillsLen: pills.length,
    modalActionsLen: modalActions.length,
    preview: !!preview,
    isDownloadedTab,
  });
  stateRef.current = {
    zone,
    pillIndex,
    gridIndex,
    pagerIndex,
    page,
    totalPages,
    gridCount,
    pillsLen: pills.length,
    modalActionsLen: modalActions.length,
    preview: !!preview,
    isDownloadedTab,
  };

  useEffect(() => {
    if (zone === 'grid' && Platform.OS === 'web') {
      try {
        const { findNodeHandle } = require('react-native');
        const node = findNodeHandle(cardRefs.current.get(gridIndex));
        (node as any)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      } catch {
        /* noop */
      }
    }
  }, [gridIndex, zone]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      const st = stateRef.current;

      if (st.preview) {
        if (isInput) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') setPreview(null);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setModalIndex((p) => Math.max(0, p - 1)); soundService.playNavigation(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setModalIndex((p) => Math.min(st.modalActionsLen - 1, p + 1)); soundService.playNavigation(); }
        else if (e.key === 'Enter') { soundService.playActivation?.(); runModalAction(); }
        return;
      }

      if (showVK) return;

      if (isInput) {
        if (e.key === 'Escape') (target as HTMLElement)?.blur?.();
        return;
      }
      if (
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowRight' &&
        e.key !== 'ArrowUp' &&
        e.key !== 'ArrowDown' &&
        e.key !== 'Enter' &&
        e.key !== 'Escape' &&
        e.key !== 'x' && e.key !== 'X' &&
        e.key !== 'q' && e.key !== 'Q' &&
        e.key !== 'e' && e.key !== 'E'
      ) return;

      if (gamepadConnected && (e.key === 'x' || e.key === 'X')) {
        if (st.zone === 'search') {
          e.preventDefault();
          e.stopPropagation();
          setShowVK(true);
          soundService.playActivation?.();
          return;
        }
      }

      // Escape en pills sin modal: deja que SettingsView vuelva atrás.
      if (e.key === 'Escape' && st.zone === 'pills') return;

      // ArrowUp en pills: deja que el componente padre navegue hacia arriba.
      if (e.key === 'ArrowUp' && st.zone === 'pills') return;

      // Q/E: paginar (solo online).
      if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
        if (tab === 'downloaded') return;
        e.preventDefault();
        e.stopPropagation();
        setPage((p) => e.key.toLowerCase() === 'q' ? Math.max(1, p - 1) : Math.min(st.totalPages, p + 1));
        soundService.playNavigation();
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') { setZone('pills'); return; }

      if (st.zone === 'pills') {
        if (e.key === 'ArrowLeft') {
          setPillIndex((p) => Math.max(0, p - 1));
          soundService.playNavigation();
        } else if (e.key === 'ArrowRight') {
          setPillIndex((p) => Math.min(st.pillsLen - 1, p + 1));
          soundService.playNavigation();
        } else if (e.key === 'ArrowDown') {
          if (!st.isDownloadedTab) {
            setZone('search');
            soundService.playNavigation();
          } else if (st.gridCount > 0) {
            setZone('grid');
            setGridIndex((p) => Math.min(p, st.gridCount - 1));
            soundService.playNavigation();
          }
        } else if (e.key === 'Enter') {
          const pill = pills[pillIndex];
          if (pill?.kind === 'tab') setTab(pill.id as TabId);
          else if (pill?.kind === 'sort') setSort(pill.id as DeckAudioSort);
          soundService.playActivation?.();
        }
      } else if (st.zone === 'search') {
        if (e.key === 'ArrowUp') {
          setZone('pills');
          soundService.playNavigation();
        } else if (e.key === 'ArrowDown') {
          if (st.gridCount > 0) {
            setZone('grid');
            setGridIndex(0);
            soundService.playNavigation();
          }
        } else if (e.key === 'Enter') {
          setShowVK(true);
          soundService.playActivation?.();
        }
      } else if (st.zone === 'grid') {
        const maxFlat = Math.max(0, st.gridCount - 1);
        if (e.key === 'ArrowLeft') {
          setGridIndex((p) => Math.max(0, p - 1));
          soundService.playNavigation();
        } else if (e.key === 'ArrowRight') {
          setGridIndex((p) => Math.min(maxFlat, p + 1));
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          if (st.gridIndex >= 3) {
            setGridIndex((p) => p - 3);
            soundService.playNavigation();
          } else {
            setZone(!st.isDownloadedTab ? 'search' : 'pills');
            soundService.playNavigation();
          }
        } else if (e.key === 'ArrowDown') {
          if (st.gridIndex + 3 <= maxFlat) {
            setGridIndex((p) => p + 3);
            soundService.playNavigation();
          } else {
            const currentRow = Math.floor(st.gridIndex / 3);
            const maxRow = Math.floor(maxFlat / 3);
            if (maxRow > currentRow) {
              setGridIndex(maxFlat);
              soundService.playNavigation();
            } else if (!st.isDownloadedTab && st.totalPages > 1) {
              setZone('pager');
              setPagerIndex(0);
              soundService.playNavigation();
            }
          }
        } else if (e.key === 'Enter') {
          const entry = st.isDownloadedTab ? downloaded[st.gridIndex] : items[st.gridIndex];
          if (entry) { openPreview(entry); soundService.playActivation?.(); }
        }
      } else if (st.zone === 'pager') {
        if (e.key === 'ArrowLeft') {
          setPagerIndex(0);
          soundService.playNavigation();
        } else if (e.key === 'ArrowRight') {
          setPagerIndex(1);
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          setZone('grid');
          setGridIndex(Math.max(0, st.gridCount - 1));
          soundService.playNavigation();
        } else if (e.key === 'Enter') {
          setPage((p) => pagerIndex === 0 ? Math.max(1, p - 1) : Math.min(st.totalPages, p + 1));
          soundService.playActivation?.();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isDownloadedTab, items, downloaded, pills, pillIndex, pagerIndex, modalActions, downloadingId, showVK, gamepadConnected]);

  const goGrid = () => setZone('grid');

  const renderCard = (entry: DownloadedEntry | DeckAudioPack, idx: number) => {
    const isFocused = zone === 'grid' && gridIndex === idx;
    const applied = isApplied(entry);
    const title = entry.name;
    const author = entry.author;
    const image = 'target' in entry ? entry.imageUrl : null;
    const meta = 'target' in entry
      ? `${formatDownloads(entry.downloads)} ↓ · ★${entry.stars}`
      : t('settings.audioIncluded');
    return (
      <TouchableOpacity
        key={'target' in entry ? entry.id : entry.key}
        ref={(el) => {
          if (el) cardRefs.current.set(idx, el);
          else cardRefs.current.delete(idx);
        }}
        style={[styles.card, isFocused && styles.cardFocused, applied && styles.cardApplied]}
        activeOpacity={0.9}
        onPress={() => { setGridIndex(idx); setZone('grid'); openPreview(entry); }}
      >
        {image ? (
          <Image source={{ uri: image }} style={styles.cardImage} contentFit="cover" />
        ) : (
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Ionicons name={('target' in entry ? entry.target : entry.kind) === 'Music' || (!('target' in entry) && entry.kind === 'music') ? 'musical-notes' : 'volume-high'} size={s(40)} color="rgba(255,255,255,0.4)" />
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.cardAuthor} numberOfLines={1}>{t('settings.audioBy', { author })}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>{meta}</Text>
        </View>
        {applied && (
          <View style={styles.appliedBadge}>
            <Ionicons name="checkmark-circle" size={s(22)} color="#4CD964" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View>
      {/* Estado actual + restaurar */}
      <View style={styles.currentRow}>
        <View style={styles.currentChip}>
          <Ionicons name="volume-high" size={s(16)} color="rgba(255,255,255,0.7)" />
          <Text style={styles.currentText} numberOfLines={1}>
            {audioPackName || t('settings.audioOriginal')}
          </Text>
          {!!audioPackId && (
            <TouchableOpacity onPress={() => setAudioPack(null)} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={s(16)} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.currentChip}>
          <Ionicons name="musical-notes" size={s(16)} color="rgba(255,255,255,0.7)" />
          <Text style={styles.currentText} numberOfLines={1}>
            {musicPackName || t('settings.audioOriginal')}
          </Text>
          {!!musicPackId && (
            <TouchableOpacity onPress={() => setMusicPack(null)} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={s(16)} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Pills: tabs + orden */}
      <View style={styles.pillsRow}>
        {pills.map((pill, idx) => {
          const selected = pill.kind === 'tab'
            ? tab === pill.id
            : sort === pill.id;
          const focusedPill = zone === 'pills' && pillIndex === idx;
          return (
            <TouchableOpacity
              key={`${pill.kind}-${pill.id}`}
              style={[styles.pill, selected && styles.pillSelected, focusedPill && styles.pillFocused]}
              onPress={() => {
                setPillIndex(idx);
                setZone('pills');
                if (pill.kind === 'tab') setTab(pill.id as TabId);
                else setSort(pill.id as DeckAudioSort);
              }}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{pill.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Buscador (solo online) */}
      {!isDownloadedTab && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            setZone('search');
            setShowVK(true);
          }}
          style={[styles.searchRow, zone === 'search' && { borderColor: '#FFFFFF', borderWidth: s(1.5) }]}
        >
          <Ionicons name="search" size={s(16)} color="rgba(255,255,255,0.5)" />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('settings.audioSearch')}
            placeholderTextColor="rgba(255,255,255,0.35)"
            showSoftInputOnFocus={!gamepadConnected}
            onFocus={() => {
              setZone('search');
              setShowVK(true);
              if (gamepadConnected) setTimeout(() => searchInputRef.current?.blur(), 60);
            }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={s(16)} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      )}

      {/* Grid */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      ) : error ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="cloud-offline-outline" size={s(40)} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : gridCount === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="musical-notes-outline" size={s(40)} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyText}>{t('settings.audioDownloadedEmpty')}</Text>
        </View>
      ) : (
        <View style={styles.grid} onTouchStart={goGrid}>
          {(isDownloadedTab ? downloaded : items).map((entry, idx) => renderCard(entry, idx))}
        </View>
      )}

      {/* Paginación (solo online) */}
      {!isDownloadedTab && totalPages > 1 && (
        <View style={styles.pagerRow}>
          <TouchableOpacity
            style={[styles.pagerBtn, zone === 'pager' && pagerIndex === 0 && styles.pagerBtnFocused]}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
          >
            <Text style={styles.pagerText}>‹ {t('settings.audioPrev')}</Text>
          </TouchableOpacity>
          <Text style={styles.pageLabel}>{page} / {totalPages}</Text>
          <TouchableOpacity
            style={[styles.pagerBtn, zone === 'pager' && pagerIndex === 1 && styles.pagerBtnFocused]}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <Text style={styles.pagerText}>{t('settings.audioNext')} ›</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal preview */}
      {preview && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {'target' in preview && preview.imageUrl ? (
              <Image source={{ uri: preview.imageUrl }} style={styles.modalImage} contentFit="cover" />
            ) : (
              <View style={[styles.modalImage, styles.cardImageFallback]}>
                <Ionicons name="musical-notes" size={s(48)} color="rgba(255,255,255,0.4)" />
              </View>
            )}
            <Text style={styles.modalTitle}>{preview.name}</Text>
            <Text style={styles.modalAuthor}>{t('settings.audioBy', { author: preview.author })}</Text>
            {'target' in preview && (
              <Text style={styles.modalMeta}>
                {`${formatDownloads(preview.downloads)} ${t('settings.audioDownloads')} · ★${preview.stars} · ${preview.version}`}
              </Text>
            )}
            <View style={styles.modalActions}>
              {modalActions.map((a, idx) => {
                const busy = downloadingId && (a.id === 'download');
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.modalBtn, idx === modalIndex && styles.modalBtnFocused, a.danger && styles.modalBtnDanger]}
                    onPress={() => { setModalIndex(idx); runModalAction(a.id); }}
                    disabled={!!busy}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.modalBtnText}>{a.label}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Virtual Keyboard */}
      <VirtualKeyboard
        visible={showVK && gamepadConnected}
        value={query}
        onChange={setQuery}
        onClose={() => setShowVK(false)}
      />
    </View>
  );
}

function createStyles(s: ScaleFn) {
  return StyleSheet.create({
    currentRow: { flexDirection: 'row', gap: s(10), marginBottom: s(12), flexWrap: 'wrap' },
    currentChip: {
      flexDirection: 'row', alignItems: 'center', gap: s(6),
      backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: s(16),
      paddingHorizontal: s(10), paddingVertical: s(6), maxWidth: '48%',
    },
    currentText: { color: '#FFF', fontSize: s(12), fontFamily: 'SSTMedium', flex: 1 },
    clearBtn: { padding: s(2) },
    pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: s(8), marginBottom: s(12) },
    pill: {
      paddingHorizontal: s(12), paddingVertical: s(7), borderRadius: s(14),
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)',
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    pillSelected: { borderColor: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.1)' },
    pillFocused: { borderColor: '#FFF' },
    pillText: { color: 'rgba(255,255,255,0.6)', fontSize: s(12), fontFamily: 'SSTMedium' },
    pillTextSelected: { color: '#FFF' },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: s(8),
      backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: s(8),
      paddingHorizontal: s(12), paddingVertical: s(9), marginBottom: s(12),
    },
    searchInput: { flex: 1, color: '#FFF', fontSize: s(14), fontFamily: 'SSTLight', outlineStyle: 'none' as any },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: s(12) },
    card: {
      width: s(220), borderRadius: s(8), overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.05)',
      borderWidth: 3, borderColor: 'transparent',
    },
    cardFocused: { borderColor: 'rgba(255,255,255,0.6)' },
    cardApplied: { borderColor: 'rgba(76,217,100,0.7)' },
    cardImage: { width: '100%', height: s(150) },
    cardImageFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
    cardBody: { padding: s(8), gap: s(2) },
    cardTitle: { color: '#FFF', fontSize: s(13), fontFamily: 'SSTMedium' },
    cardAuthor: { color: 'rgba(255,255,255,0.5)', fontSize: s(11), fontFamily: 'SSTLight' },
    cardMeta: { color: 'rgba(255,255,255,0.45)', fontSize: s(11), fontFamily: 'SSTLight' },
    appliedBadge: { position: 'absolute', top: s(6), right: s(6) },
    loadingWrap: { alignItems: 'center', paddingVertical: s(30) },
    emptyWrap: { alignItems: 'center', paddingVertical: s(30), gap: s(10) },
    emptyText: { color: 'rgba(255,255,255,0.45)', fontSize: s(13), fontFamily: 'SSTLight', textAlign: 'center' },
    pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(12), marginTop: s(14) },
    pagerBtn: { paddingHorizontal: s(14), paddingVertical: s(8), borderRadius: s(6), borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)' },
    pagerBtnFocused: { borderColor: '#FFF' },
    pagerText: { color: '#FFF', fontSize: s(13), fontFamily: 'SSTMedium' },
    pageLabel: { color: 'rgba(255,255,255,0.55)', fontSize: s(13), fontFamily: 'SSTLight' },
    modalOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    },
    modalBox: {
      width: s(380), backgroundColor: '#14161c', borderRadius: s(12),
      padding: s(18), gap: s(8), borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    },
    modalImage: { width: '100%', height: s(160), borderRadius: s(8) },
    modalTitle: { color: '#FFF', fontSize: s(18), fontFamily: 'SSTMedium' },
    modalAuthor: { color: 'rgba(255,255,255,0.55)', fontSize: s(13), fontFamily: 'SSTLight' },
    modalMeta: { color: 'rgba(255,255,255,0.45)', fontSize: s(12), fontFamily: 'SSTLight' },
    modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: s(8), marginTop: s(8) },
    modalBtn: {
      paddingHorizontal: s(14), paddingVertical: s(10), borderRadius: s(8),
      backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 2, borderColor: 'transparent',
      minWidth: s(100), alignItems: 'center',
    },
    modalBtnFocused: { borderColor: '#FFF' },
    modalBtnDanger: { backgroundColor: 'rgba(255,59,48,0.2)' },
    modalBtnText: { color: '#FFF', fontSize: s(13), fontFamily: 'SSTMedium' },
  });
}