import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTranslation } from '@/contexts/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';
import { useAchievementWatcher } from '@/hooks/useAchievementWatcher';
import {
  canHaveTrophies,
  fetchGameTrophies,
  getCachedGameTrophies,
  getTrophyContextFromUser,
  type TrophyContext,
  type TrophyGameRef,
  type TrophySource,
} from '@/services/gameTrophiesService';
import { getOnlineSession } from '@/services/onlineAccountService';
import { fetchUserTrophies, type TrophyGameSummary } from '@/services/onlineTrophiesService';
import { soundService } from '@/services/soundService';
import { STEAM_API_LANG } from '@/services/steamLanguage';
import type { SteamGameAchievementsSummary } from '@/services/steamUserService';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';

type TrophyFilter = 'all' | 'unlocked' | 'locked';
type FocusArea = 'sidebar' | 'tabs' | 'list';

interface TrophyEntry {
  key: string;
  title: string;
  image: any;
  item: TrophyGameRef;
  summary: SteamGameAchievementsSummary | null;
  source: TrophySource;
  /** Conteo conocido de antemano (resumen online) sin haber resuelto el juego. */
  onlineSummary?: TrophyGameSummary | null;
  resolved: boolean;
  resolving: boolean;
}

interface TrophiesViewProps {
  visible: boolean;
  onClose: () => void;
  activeUser: any;
  inputMode: 'keyboard' | 'gamepad';
  gamepadConnected?: boolean;
  /** Juego desde el que se abre la vista (foco inicial de la lista). */
  initialItem: TrophyGameRef | null;
  /** Biblioteca local: de aquí salen los juegos que pueden tener trofeos. */
  libraryGames: TrophyGameRef[];
}

const TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze'] as const;
type Tier = (typeof TIER_ORDER)[number];

const TIER_META: Record<Tier, { color: string; glow: string; icon: any }> = {
  platinum: { color: '#B0C4DE', glow: 'rgba(176,196,222,0.55)', icon: require('@/assets/images/platino.png') },
  gold: { color: '#FFD700', glow: 'rgba(255,215,0,0.55)', icon: require('@/assets/images/oro.png') },
  silver: { color: '#C0C0C0', glow: 'rgba(192,192,192,0.45)', icon: require('@/assets/images/plata.png') },
  bronze: { color: '#CD7F32', glow: 'rgba(205,127,50,0.45)', icon: require('@/assets/images/bronce.png') },
};

const FILTERS: { id: TrophyFilter; labelKey: TranslationKey }[] = [
  { id: 'all', labelKey: 'trophies.tabAll' },
  { id: 'unlocked', labelKey: 'trophies.tabUnlocked' },
  { id: 'locked', labelKey: 'trophies.tabLocked' },
];

/** Máximo de juegos que se resuelven en segundo plano al abrir la vista. */
const BACKGROUND_SCAN_LIMIT = 25;
const BACKGROUND_SCAN_DELAY_MS = 180;

const TrophiesView: React.FC<TrophiesViewProps> = ({
  visible,
  onClose,
  activeUser,
  // `inputMode` no se usa: los avisos de controles (PSIcon) ya eligen solos
  // entre el botón del mando y su tecla equivalente.
  initialItem,
  libraryGames,
}) => {
  const { t, language } = useTranslation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { isAvailable: awAvailable } = useAchievementWatcher();

  const scale = Math.min(
    Math.max(Math.max(windowWidth / 1920, windowHeight / 1080), 0.6),
    1.25
  );
  const s = (v: number) => Math.round(v * scale);

  const [entries, setEntries] = useState<TrophyEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<TrophyFilter>('all');
  const [focusArea, setFocusArea] = useState<FocusArea>('sidebar');
  const [sidebarIndex, setSidebarIndex] = useState(0);
  const [tabIndex, setTabIndex] = useState(0);
  const [listIndex, setListIndex] = useState(0);
  const [scanning, setScanning] = useState(false);

  const sidebarScrollRef = useRef<ScrollView>(null);
  const listScrollRef = useRef<ScrollView>(null);
  const cancelScanRef = useRef(false);

  // Refs espejo: el listener de teclado lee siempre el valor actual.
  const entriesRef = useRef(entries);
  const selectedKeyRef = useRef(selectedKey);
  const filterRef = useRef(filter);
  const focusAreaRef = useRef(focusArea);
  const sidebarIndexRef = useRef(sidebarIndex);
  const tabIndexRef = useRef(tabIndex);
  const listIndexRef = useRef(listIndex);
  entriesRef.current = entries;
  selectedKeyRef.current = selectedKey;
  filterRef.current = filter;
  focusAreaRef.current = focusArea;
  sidebarIndexRef.current = sidebarIndex;
  tabIndexRef.current = tabIndex;
  listIndexRef.current = listIndex;

  const context: TrophyContext = useMemo(
    () => getTrophyContextFromUser(activeUser, STEAM_API_LANG[language] ?? 'english', awAvailable),
    [activeUser, language, awAvailable]
  );

  // ── Datos derivados ────────────────────────────────────────────────────────
  const selectedEntry = useMemo(
    () => entries.find((e) => e.key === selectedKey) ?? null,
    [entries, selectedKey]
  );

  const selectedSummary = selectedEntry?.summary ?? null;

  const visibleTrophies = useMemo(() => {
    if (!selectedSummary) return [];
    const all = selectedSummary.achievements ?? [];
    if (filter === 'unlocked') return all.filter((a) => a.achieved);
    if (filter === 'locked') return all.filter((a) => !a.achieved);
    return all;
  }, [selectedSummary, filter]);

  const totals = useMemo(() => {
    const acc = { total: 0, unlocked: 0, platinum: 0, gold: 0, silver: 0, bronze: 0 };
    for (const entry of entries) {
      const counts = entry.summary?.rarityCounts;
      if (counts) {
        acc.platinum += counts.platinum || 0;
        acc.gold += counts.gold || 0;
        acc.silver += counts.silver || 0;
        acc.bronze += counts.bronze || 0;
        acc.total += entry.summary?.total || 0;
        acc.unlocked += entry.summary?.unlocked || 0;
      } else if (entry.onlineSummary) {
        acc.platinum += entry.onlineSummary.platinum || 0;
        acc.gold += entry.onlineSummary.gold || 0;
        acc.silver += entry.onlineSummary.silver || 0;
        acc.bronze += entry.onlineSummary.bronze || 0;
        acc.total += entry.onlineSummary.total || 0;
        acc.unlocked += entry.onlineSummary.unlocked || 0;
      }
    }
    return acc;
  }, [entries]);

  // Total de trofeos por categoría (el resumen solo da los desbloqueados).
  const tierTotals = useMemo(() => {
    const acc: Record<Tier, number> = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
    for (const a of selectedSummary?.achievements ?? []) {
      if (acc[a.rarity] !== undefined) acc[a.rarity] += 1;
    }
    return acc;
  }, [selectedSummary]);

  // ── Resolución de un juego ─────────────────────────────────────────────────
  const resolveEntry = useCallback(
    async (entry: TrophyEntry, ctx: TrophyContext) => {
      setEntries((prev) =>
        prev.map((e) => (e.key === entry.key ? { ...e, resolving: true } : e))
      );
      try {
        const result = await fetchGameTrophies(entry.item, ctx);
        setEntries((prev) =>
          prev.map((e) =>
            e.key === entry.key
              ? { ...e, summary: result.summary, source: result.source, resolved: true, resolving: false }
              : e
          )
        );
        return result;
      } catch {
        setEntries((prev) =>
          prev.map((e) => (e.key === entry.key ? { ...e, resolved: true, resolving: false } : e))
        );
        return { summary: null, source: null };
      }
    },
    []
  );

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    cancelScanRef.current = false;

    setEntries([]);
    setSelectedKey(null);
    setFilter('all');
    setFocusArea('sidebar');
    setSidebarIndex(0);
    setTabIndex(0);
    setListIndex(0);
    setScanning(false);

    let cancelled = false;

    const buildCandidates = (): TrophyEntry[] => {
      const out: TrophyEntry[] = [];
      const seen = new Set<string>();
      const push = (item: any, force = false) => {
        if (!item || !item.id || seen.has(item.id)) return;
        // Solo entran los juegos que pueden tener trofeos (Steam, PS3/RPCS3,
        // PC con ejecutable o consolas clásicas). El juego con el que se abre
        // la vista se incluye siempre.
        if (!force && !canHaveTrophies(item)) return;
        seen.add(item.id);
        out.push({
          key: String(item.id),
          title: item.title || String(item.id),
          image: item.image ?? null,
          item: item as TrophyGameRef,
          summary: null,
          source: null,
          onlineSummary: null,
          resolved: false,
          resolving: false,
        });
      };
      push(initialItem, true);
      (libraryGames || []).forEach((g) => push(g));
      return out;
    };

    const bootstrap = async () => {
      const candidates = buildCandidates();
      if (cancelled) return;

      // 1) Resumen online: da los contadores al instante para los juegos que
      //    ya se sincronizaron con la cuenta WPS5.
      let online: TrophyGameSummary[] = [];
      try {
        const session = getOnlineSession();
        const onlineUserId =
          session?.user?.id || (activeUser?.settings as any)?.onlineUserId;
        if (onlineUserId) {
          const res = await fetchUserTrophies(onlineUserId).catch(() => null);
          if (res?.visible && Array.isArray(res.trophies)) online = res.trophies;
        }
      } catch {
        online = [];
      }
      if (cancelled) return;

      const onlineById = new Map(online.map((g) => [g.gameId, g]));

      // Los candidatos que el resumen online confirma que tienen trofeos, más
      // el juego con el que se ha abierto la vista.
      const withTrophies = candidates.filter(
        (c) => onlineById.has(c.key) || c.key === String(initialItem?.id ?? '')
      );
      const seed = (withTrophies.length ? withTrophies : candidates.slice(0, 1)).map((c) => ({
        ...c,
        onlineSummary: onlineById.get(c.key) ?? null,
      }));

      setEntries(seed);
      const firstKey = seed[0]?.key ?? null;
      setSelectedKey(firstKey);
      setSidebarIndex(0);

      if (firstKey) {
        const first = seed[0];
        // La caché en memoria suele resolverlo sin tocar la red.
        const cached = getCachedGameTrophies(first.item, context);
        if (cached) {
          setEntries((prev) =>
            prev.map((e) =>
              e.key === first.key
                ? { ...e, summary: cached.summary, source: cached.source, resolved: true }
                : e
            )
          );
        } else {
          void resolveEntry(first, context);
        }
      }

      // 2) Barrido en segundo plano: resuelve el resto de la biblioteca para
      //    completar la lista de juegos con trofeos.
      setScanning(true);
      const pending = candidates.filter((c) => !seed.some((s) => s.key === c.key)).slice(0, BACKGROUND_SCAN_LIMIT);
      for (const candidate of pending) {
        if (cancelled || cancelScanRef.current) break;
        const result = await resolveEntry(
          { ...candidate, onlineSummary: onlineById.get(candidate.key) ?? null },
          context
        );
        if (cancelled || cancelScanRef.current) break;
        if (result.summary && result.summary.total > 0) {
          const withSummary = {
            ...candidate,
            summary: result.summary,
            source: result.source,
            onlineSummary: onlineById.get(candidate.key) ?? null,
            resolved: true,
            resolving: false,
          };
          setEntries((prev) =>
            prev.some((e) => e.key === candidate.key) ? prev : [...prev, withSummary]
          );
        } else {
          // El juego no tiene trofeos: se retira de la lista.
          setEntries((prev) => prev.filter((e) => e.key !== candidate.key));
        }
        await new Promise((r) => setTimeout(r, BACKGROUND_SCAN_DELAY_MS));
      }
      if (!cancelled) setScanning(false);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      cancelScanRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Cambio de juego seleccionado ───────────────────────────────────────────
  useEffect(() => {
    if (!visible || !selectedEntry) return;
    if (selectedEntry.resolved || selectedEntry.resolving) return;
    void resolveEntry(selectedEntry, context);
  }, [visible, selectedEntry, context, resolveEntry]);

  // ── Teclado / mando ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const list = entriesRef.current;
      const area = focusAreaRef.current;
      const key = e.key;

      // La vista es modal: el evento no debe llegar a los handlers globales
      // de navegación (Home, detalle del juego, ajustes...).
      e.stopPropagation();

      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(key)) {
        e.preventDefault();
      }

      const selected = list.find((entry) => entry.key === selectedKeyRef.current);
      const trophies = selected?.summary?.achievements ?? [];
      const filtered = filterRef.current === 'unlocked'
        ? trophies.filter((a) => a.achieved)
        : filterRef.current === 'locked'
          ? trophies.filter((a) => !a.achieved)
          : trophies;

      if (key === 'Escape' || key === 'b' || key === 'B') {
        soundService.playBack?.();
        onClose();
        return;
      }

      if (key === 'ArrowDown' || key === 'ArrowUp') {
        const delta = key === 'ArrowDown' ? 1 : -1;
        soundService.playNavigation();

        if (area === 'sidebar') {
          const next = sidebarIndexRef.current + delta;
          if (next < 0) return; // arriba del todo: se queda
          if (next >= list.length) {
            // Abajo del todo: pasa a las pestañas.
            setFocusArea('tabs');
            setTabIndex(tabIndexRef.current);
            return;
          }
          setSidebarIndex(next);
          setSelectedKey(list[next]?.key ?? null);
          setListIndex(0);
          return;
        }

        if (area === 'tabs') {
          // Las pestañas son una fila horizontal: con ↑↓ se sale de ellas.
          if (delta > 0) {
            setFocusArea('list');
            setListIndex(0);
          } else {
            setFocusArea('sidebar');
            setSidebarIndex(Math.max(0, list.findIndex((e) => e.key === selectedKeyRef.current)));
          }
          return;
        }

        // area === 'list' — la lista de trofeos es vertical.
        const next = listIndexRef.current + delta;
        if (next < 0) {
          // Arriba del todo: vuelve a las pestañas.
          setFocusArea('tabs');
          setTabIndex(tabIndexRef.current);
          return;
        }
        if (next >= filtered.length) return; // abajo del todo: se queda
        setListIndex(next);
        return;
      }

      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        const delta = key === 'ArrowRight' ? 1 : -1;
        soundService.playNavigation();

        if (area === 'sidebar') {
          // La barra de juegos está a la izquierda de las pestañas.
          if (delta > 0) {
            setFocusArea('tabs');
            setTabIndex(tabIndexRef.current);
          }
          return;
        }

        if (area === 'tabs') {
          // ← → cambian de pestaña.
          const next = tabIndexRef.current + delta;
          if (next < 0) {
            // Al salir por la izquierda se vuelve a la lista de juegos.
            setFocusArea('sidebar');
            setSidebarIndex(Math.max(0, list.findIndex((e) => e.key === selectedKeyRef.current)));
            return;
          }
          if (next >= FILTERS.length) return;
          setTabIndex(next);
          setFilter(FILTERS[next].id);
          setListIndex(0);
          return;
        }

        // area === 'list' — ← vuelve a la columna de la izquierda.
        if (delta < 0) {
          setFocusArea('sidebar');
          setSidebarIndex(Math.max(0, list.findIndex((entry) => entry.key === selectedKeyRef.current)));
        }
        return;
      }

      // L1 / R1 (q / e): cambiar de pestaña desde cualquier zona.
      if (key === 'q' || key === 'e' || key === 'Q' || key === 'E') {
        const delta = key === 'e' || key === 'E' ? 1 : -1;
        const next = tabIndexRef.current + delta;
        if (next < 0 || next >= FILTERS.length) return;
        soundService.playNavigation();
        setTabIndex(next);
        setFilter(FILTERS[next].id);
        setListIndex(0);
        setFocusArea('tabs');
        return;
      }

      if (key === 'Enter' || key === ' ') {
        soundService.playActivation?.();
        if (area === 'tabs') {
          setFilter(FILTERS[tabIndexRef.current].id);
          setListIndex(0);
          return;
        }
        if (area === 'sidebar') {
          const entry = list[sidebarIndexRef.current];
          if (!entry) return;
          setSelectedKey(entry.key);
          setListIndex(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, onClose]);

  // ── Autoscroll de las listas ───────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (focusArea === 'sidebar' && sidebarScrollRef.current) {
      sidebarScrollRef.current.scrollTo({ y: sidebarIndex * 78 * scale, animated: true });
    }
  }, [sidebarIndex, focusArea, visible, scale]);

  useEffect(() => {
    if (!visible) return;
    if (focusArea === 'list' && listScrollRef.current) {
      listScrollRef.current.scrollTo({ y: listIndex * 96 * scale, animated: true });
    }
  }, [listIndex, focusArea, visible, scale]);

  if (!visible) return null;

  const selectedProgress = selectedSummary?.total
    ? Math.round((selectedSummary.unlocked / selectedSummary.total) * 100)
    : selectedEntry?.onlineSummary?.total
      ? Math.round((selectedEntry.onlineSummary.unlocked / selectedEntry.onlineSummary.total) * 100)
      : 0;

  const selectedTotal = selectedSummary?.total ?? selectedEntry?.onlineSummary?.total ?? 0;
  const selectedUnlocked = selectedSummary?.unlocked ?? selectedEntry?.onlineSummary?.unlocked ?? 0;

  /** Chip con el total global de una categoría (cabecera de la vista). */
  const renderTotalChip = (tier: Tier) => (
    <View
      key={tier}
      style={[
        styles.tierChip,
        {
          paddingHorizontal: s(9),
          paddingVertical: s(4),
          borderRadius: s(14),
          // backgroundColor: TIER_META[tier].glow,
        },
      ]}
    >
      <Image
        source={TIER_META[tier].icon}
        style={{ width: s(15), height: s(15) }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
      <Text style={[styles.tierChipText, { fontSize: s(17), color: "#FFF" }]}>
        {totals[tier]}
      </Text>
    </View>
  );

  /** Chip con los desbloqueados/total de una categoría (cabecera del juego). */
  const renderTierChip = (tier: Tier, unlocked: number, total: number) => (
    <View
      key={tier}
      style={[
        styles.tierChip,
        {
          paddingHorizontal: s(8),
          paddingVertical: s(4),
          borderRadius: s(14),
          // backgroundColor: TIER_META[tier].glow,
        },
      ]}
    >
      <Image
        source={TIER_META[tier].icon}
        style={{ width: s(15), height: s(15) }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
      <Text style={[styles.tierChipText, { fontSize: s(14), color: "#FFF" }]}>
        {unlocked}/{total}
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={styles.root} entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)}>
        {/* Fondo */}
        <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
        <View style={[StyleSheet.absoluteFill, styles.backdropGlow]} />

        {/* ── Cabecera ─────────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingHorizontal: s(36), paddingVertical: s(18) }]}>
          <View style={styles.headerLeft}>
            <Image
              source={require('@/assets/images/logo-trophy.png')}
              style={{ width: s(40), height: s(40) }}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
            <View style={{ marginLeft: s(14) }}>
              <Text style={[styles.headerTitle, { fontSize: s(34) }]}>{t('trophies.title')}</Text>
              <Text style={[styles.headerSubtitle, { fontSize: s(14) }]}>{t('trophies.subtitle')}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            {TIER_ORDER.map((tier) => renderTotalChip(tier))}
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              style={[styles.closeButton, { width: s(38), height: s(38), borderRadius: s(19) }]}
            >
              <Ionicons name="close" size={s(20)} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Cuerpo ───────────────────────────────────────────────────── */}
        <View style={styles.body}>
          {/* Columna izquierda: lista de juegos */}
          <View style={[styles.sidebar, { width: s(360) }]}>
            <Text style={[styles.sidebarTitle, { fontSize: s(15) }]}>{t('trophies.allGames')}</Text>
            <ScrollView
              ref={sidebarScrollRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: s(24) }}
            >
              {entries.length === 0 && (
                <View style={{ padding: s(20) }}>
                  <Text style={styles.emptyText}>
                    {scanning ? t('trophies.scanning') : t('trophies.noGames')}
                  </Text>
                </View>
              )}
              {entries.map((entry, index) => {
                const isSelected = entry.key === selectedKey;
                const isFocused = focusArea === 'sidebar' && sidebarIndex === index;
                const total = entry.summary?.total ?? entry.onlineSummary?.total ?? 0;
                const unlocked = entry.summary?.unlocked ?? entry.onlineSummary?.unlocked ?? 0;
                const pct = total ? Math.round((unlocked / total) * 100) : 0;
                return (
                  <TouchableOpacity
                    key={entry.key}
                    testID="trophies-game-row"
                    activeOpacity={0.85}
                    onPress={() => {
                      setSelectedKey(entry.key);
                      setSidebarIndex(index);
                      setListIndex(0);
                    }}
                    style={[
                      styles.gameRow,
                      { padding: s(10), borderRadius: s(12), marginBottom: s(6) },
                      isSelected && styles.gameRowSelected,
                      isFocused && styles.gameRowFocused,
                    ]}
                  >
                    {entry.image ? (
                      <Image
                        source={entry.image}
                        style={{ width: s(56), height: s(56), borderRadius: s(8) }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={{ effect: 'cross-dissolve', duration: 180 }}
                      />
                    ) : (
                      <View style={[styles.gameRowPlaceholder, { width: s(56), height: s(56), borderRadius: s(8) }]}>
                        <MaterialCommunityIcons name="trophy" size={s(24)} color="rgba(255,255,255,0.35)" />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: s(12) }}>
                      <Text numberOfLines={1} style={[styles.gameRowTitle, { fontSize: s(15) }]}>
                        {entry.title}
                      </Text>
                      <Text style={[styles.gameRowMeta, { fontSize: s(14) }]}>
                        {total > 0 ? `${unlocked}/${total} · ${pct}%` : t('trophies.loading')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Columna derecha: detalle del juego */}
          <View style={styles.detail}>
            {!selectedEntry ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{t('trophies.noGames')}</Text>
              </View>
            ) : (
              <>
                {/* Cabecera del juego */}
                <View style={[styles.gameHeader, { padding: s(18), borderRadius: s(16) }]}>
                  {selectedEntry.image ? (
                    <Image
                      source={selectedEntry.image}
                      style={{ width: s(104), height: s(104), borderRadius: s(10) }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.gameRowPlaceholder, { width: s(104), height: s(104), borderRadius: s(10) }]}>
                      <MaterialCommunityIcons name="trophy" size={s(40)} color="rgba(255,255,255,0.35)" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: s(20) }}>
                    <Text style={[styles.gameTitle, { fontSize: s(26) }]} numberOfLines={2}>
                      {selectedEntry.title}
                    </Text>
                    <View style={[styles.progressRow, { marginTop: s(12) }]}>
                      <View style={[styles.progressTrack, { height: s(5) }]}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${selectedProgress}%`, height: '100%' },
                          ]}
                        />
                      </View>
                      <Text style={[styles.progressLabel, { fontSize: s(15) }]}>
                        {selectedUnlocked}/{selectedTotal} · {t('trophies.completed', { pct: selectedProgress })}
                      </Text>
                    </View>
                    <View style={[styles.tierRow, { marginTop: s(12) }]}>
                      {TIER_ORDER.map((tier) =>
                        renderTierChip(
                          tier,
                          selectedSummary?.rarityCounts?.[tier] ?? selectedEntry.onlineSummary?.[tier] ?? 0,
                          selectedSummary ? tierTotals[tier] : selectedEntry.onlineSummary?.total ?? 0
                        )
                      )}
                    </View>
                  </View>
                </View>

                {/* Pestañas de filtro */}
                <View style={[styles.tabsRow, { marginTop: s(18) }]}>
                  {FILTERS.map((f, index) => {
                    const isActive = filter === f.id;
                    const isFocused = focusArea === 'tabs' && tabIndex === index;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        testID="trophies-tab"
                        activeOpacity={0.8}
                        onPress={() => {
                          setFilter(f.id);
                          setTabIndex(index);
                          setFocusArea('tabs');
                          setListIndex(0);
                        }}
                        style={[
                          styles.tab,
                          { paddingHorizontal: s(14), paddingVertical: s(6) },
                          isActive && styles.tabActive,
                          isFocused && styles.tabFocused,
                        ]}
                      >
                        <Text style={[styles.tabText, { fontSize: s(15) }, isActive && styles.tabTextActive]}>
                          {t(f.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Lista de trofeos */}
                <ScrollView
                  ref={listScrollRef}
                  style={{ flex: 1, marginTop: s(10) }}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: s(30) }}
                >
                  {visibleTrophies.length === 0 && (
                    <View style={{ padding: s(24) }}>
                      <Text style={styles.emptyText}>
                        {selectedEntry.resolving || selectedEntry.resolved === false
                          ? t('trophies.loading')
                          : t('trophies.noTrophies')}
                      </Text>
                    </View>
                  )}
                  {visibleTrophies.map((trophy, index) => {
                    const isFocused = focusArea === 'list' && listIndex === index;
                    const tier = TIER_META[trophy.rarity] ? trophy.rarity : 'bronze';
                    const globalPct = Number(trophy.globalPercentage);
                    const hasGlobalPct = Number.isFinite(globalPct);
                    return (
                      <TouchableOpacity
                        key={trophy.apiName || trophy.name}
                        testID="trophies-row"
                        activeOpacity={0.9}
                        onPress={() => {
                          setFocusArea('list');
                          setListIndex(index);
                        }}
                        style={[
                          styles.trophyRow,
                          { padding: s(14), borderRadius: s(12), marginBottom: s(8) },
                          isFocused && styles.trophyRowFocused,
                        ]}
                      >
                        <View style={[styles.trophyIconBox, { width: s(48), height: s(48), borderRadius: s(8) }]}>
                          {trophy.icon || trophy.lockedIcon ? (
                            <Image
                              source={{ uri: trophy.achieved ? trophy.icon : (trophy.lockedIcon || trophy.icon) }}
                              style={{ width: '100%', height: '100%', borderRadius: s(8), opacity: trophy.achieved ? 1 : 0.35 }}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              transition={{ effect: 'cross-dissolve', duration: 200 }}
                            />
                          ) : (
                            <MaterialCommunityIcons name="trophy" size={s(24)} color="rgba(255,255,255,0.4)" />
                          )}
                          {!trophy.achieved && (
                            <View style={styles.trophyLock}>
                              <Ionicons name="lock-closed" size={s(16)} color="rgba(255,255,255,0.9)" />
                            </View>
                          )}
                        </View>

                        <View style={{ flex: 1, marginLeft: s(16) }}>
                          <Text style={[styles.trophyName, { fontSize: s(17) }]} numberOfLines={1}>
                            {trophy.name}
                          </Text>
                          {!!trophy.description && (
                            <Text style={[styles.trophyDesc, { fontSize: s(15) }]} numberOfLines={2}>
                              {trophy.description}
                            </Text>
                          )}
                          <Text style={[styles.trophyStatus, { fontSize: s(11) }]}>
                            {trophy.achieved ? t('game.trophiesUnlock') : t('game.trophiesLock')}
                            {hasGlobalPct ? ` · ${globalPct.toFixed(1)}%` : ''}
                          </Text>
                        </View>

                        <Text style={[styles.trophyRarity, { fontSize: s(15), color: TIER_META[tier].color }]}>
                          {t(`trophies.rarity.${tier}`)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </View>
        </View>

        {/* ── Pie con los controles ───────────────────────────────────────── */}
        <View style={[styles.footer, { paddingHorizontal: s(36), paddingVertical: s(12) }]}>
          <View style={styles.footerHint}>
            <PSIcon char={PSIcons.cross} size={s(18)} color="rgba(255,255,255,0.8)" />
            <Text style={styles.footerText}>{t('trophies.hintSelect')}</Text>
          </View>
          <View style={styles.footerHint}>
            <PSIcon char={PSIcons.circle} size={s(18)} color="rgba(255,255,255,0.8)" />
            <Text style={styles.footerText}>{t('trophies.hintBack')}</Text>
          </View>
          <View style={styles.footerHint}>
            <PSIcon char={PSIcons.l1} size={s(18)} color="rgba(255,255,255,0.8)" />
            <PSIcon char={PSIcons.r1} size={s(18)} color="rgba(255,255,255,0.8)" />
            <Text style={styles.footerText}>{t('trophies.hintSwitchTab')}</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1a1bff',
  },
  backdrop: {
    backgroundColor: '#0f0f13ff',
  },
  backdropGlow: {
    backgroundColor: 'rgba(55, 60, 75, 0.18)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: '#FFF',
    fontFamily: 'SSTBold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'SSTLight',
    marginTop: 2,
  },
  closeButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginLeft: 14,
  },
  divider: {
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    paddingTop: 18,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  sidebarTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'SSTMedium',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 6,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  gameRowSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  gameRowFocused: {
    borderLeftWidth: 3,
    borderColor: 'rgba(219, 239, 253, 0.85)',
  },
  gameRowPlaceholder: {
    backgroundColor: 'rgba(255, 0, 0, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameRowTitle: {
    color: '#FFF',
    fontFamily: 'SSTLight',
  },
  gameRowMeta: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'SSTLight',
    marginTop: 4,
  },
  detail: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: 22,
  },
  gameHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  gameTitle: {
    color: '#FFF',
    fontFamily: 'SSTLight',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: '#E7E9EE',
    borderRadius: 3,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'SSTMedium',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tierChipText: {
    fontFamily: 'SSTLight',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 5,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255, 255, 255, 0.07)'
  },
  tab: {
    borderRadius: 0,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255,255,255,0.85)'
  },
  tabFocused: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'SSTLight',
  },
  tabTextActive: {
    color: '#FFF',
    fontFamily: 'SSTMedium',
  },
  trophyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  trophyRowFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  trophyIconBox: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyLock: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 9,
    padding: 2,
  },
  trophyName: {
    color: '#FFF',
    fontFamily: 'SSTLight',
  },
  trophyDesc: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: 'SSTLight',
    marginTop: 3,
  },
  trophyStatus: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'SSTLight',
    marginTop: 5,
  },
  trophyRarity: {
    fontFamily: 'SSTMedium',
    marginLeft: 10,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'SSTLight',
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.07)',
  },
  footerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  footerText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'SSTLight',
    fontSize: 15,
  },
});

export default TrophiesView;
