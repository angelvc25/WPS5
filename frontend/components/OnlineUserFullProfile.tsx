import { useTranslation } from '@/contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { getOnlineSession } from '../services/onlineAccountService';
import {
  acceptOnlineFriendRequest,
  fetchOnlineFriendRequests,
  fetchOnlineFriends,
  fetchOnlineUserProfile,
  rejectOnlineFriendRequest,
  removeOnlineFriend,
  sendOnlineFriendRequest,
  type UserProfileResult,
} from '../services/onlineFriendsService';
import { fetchOnlineUserLibrary, fetchOwnOnlineLibrary, type OnlineLibraryGame } from '../services/onlineLibraryService';
import {
  fetchMutualFriends,
  fetchUserTrophies,
  type TrophyGameSummary,
} from '../services/onlineTrophiesService';
import type { OnlineUser } from '../services/onlineAccountService';
import { formatPlaytime } from '../services/playtimeService';
import { soundService } from '../services/soundService';
import { toastService } from '../services/toastService';
import SpinningBorderSearch from './SpinningBorderSearch';

interface OnlineUserFullProfileProps {
  username: string | null;
  onClose: () => void;
  onChanged?: () => void;
}

interface LibraryGameView {
  id: string;
  name: string;
  coverUrl: string | null;
  platform: string | null;
  playtimeMinutes: number;
  addedAt: string | null;
  isFavorite: boolean;
}

function parseLibraryGame(entry: OnlineLibraryGame): LibraryGameView {
  let meta: any = null;
  try {
    meta = entry.metadata_json ? JSON.parse(entry.metadata_json) : null;
  } catch {
    meta = null;
  }
  return {
    id: entry.id,
    name: entry.game_name,
    coverUrl: entry.cover_url,
    platform: typeof meta?.platform === 'string' ? meta.platform : null,
    playtimeMinutes: Number(meta?.playtimeMinutes) || 0,
    addedAt: entry.added_at,
    isFavorite: meta?.isFavorite === true || meta?.favorite === true,
  };
}

function formatLastSeen(
  t: (key: any, params?: any) => string,
  iso: string | null,
): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const absSec = Math.abs(Math.round((ms - Date.now()) / 1000));
  if (absSec < 60) return t('common.justNow');
  if (absSec < 3600) return `${Math.floor(absSec / 60)} ${t('common.minutesAgo')}`;
  if (absSec < 86400) return `${Math.floor(absSec / 3600)} ${t('common.hoursAgo')}`;
  return `${Math.floor(absSec / 86400)} ${t('common.daysAgo')}`;
}

function formatCompactMinutes(minutes: number): string {
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.max(0, Math.round(minutes))}m`;
}

/** Iconos propios de tiers de trofeos. */
const TIER_ICONS = {
  platinum: require('@/assets/images/platino.png'),
  gold: require('@/assets/images/oro.png'),
  silver: require('@/assets/images/plata.png'),
  bronze: require('@/assets/images/bronce.png'),
} as const;

/** Pestañas y tarjetas navegables del perfil. */
const TAB_KEYS = ['overview', 'games', 'friends'] as const;
type TabKey = (typeof TAB_KEYS)[number];
const TAB_IDS: string[] = TAB_KEYS.map((k) => `tab:${k}`);
const CARD_IDS: string[] = ['card:trophies', 'card:top', 'card:games', 'card:friends'];

/** Normaliza títulos para detectar juegos en común entre bibliotecas. */
function normalizeGameTitle(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const OnlineUserFullProfile = ({ username, onClose, onChanged }: OnlineUserFullProfileProps) => {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  // Escala relativa a 1920px de ancho (los mismos valores base de UserProfileView).
  // Si prefieres tamaños fijos, cambia por: const s = (px: number) => px;
  const s = useMemo(() => {
    const k = Math.max(0.6, Math.min(1.5, windowWidth / 1920));
    return (px: number) => Math.round(px * k);
  }, [windowWidth]);
  const styles = useMemo(() => createStyles(s), [s]);
  // t() devuelve la clave si falta la traducción: respaldo en inglés.
  const tr = (key: string, fallback: string): string => {
    const value = (t as any)(key);
    return !value || value === key ? fallback : value;
  };
  const [profile, setProfile] = useState<UserProfileResult | null>(null);
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'games' | 'friends'>('overview');
  const [games, setGames] = useState<LibraryGameView[]>([]);
  const [libraryState, setLibraryState] = useState<'idle' | 'loading' | 'hidden' | 'error' | 'ready'>('idle');
  const [trophies, setTrophies] = useState<TrophyGameSummary[]>([]);
  const [trophiesState, setTrophiesState] = useState<'idle' | 'loading' | 'hidden' | 'error' | 'ready'>('idle');
  const [mutualFriends, setMutualFriends] = useState<OnlineUser[]>([]);
  const [ownGameNames, setOwnGameNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfile(null);
    setGames([]);
    setLibraryState('idle');
    setTrophies([]);
    setTrophiesState('idle');
    setMutualFriends([]);
    setOwnGameNames([]);
    setTab('overview');
    setIncomingRequestId(null);
    setFriendshipId(null);
    (async () => {
      try {
        const [prof, reqs] = await Promise.all([
          fetchOnlineUserProfile(username),
          fetchOnlineFriendRequests().catch(() => []),
        ]);
        if (cancelled) return;
        setProfile(prof);
        const incoming = reqs.find((r) => r.user.id === prof.user.id);
        setIncomingRequestId(incoming ? incoming.id : null);
        if (prof.friendship === 'accepted') {
          const friends = await fetchOnlineFriends().catch(() => []);
          if (cancelled) return;
          const match = friends.find((f) => f.user.id === prof.user.id);
          setFriendshipId(match ? match.friendshipId : null);
        }
        // Biblioteca para stats + pestaña Juegos (respeta visibilidad).
        setLibraryState('loading');
        try {
          const res = await fetchOnlineUserLibrary(prof.user.id);
          if (cancelled) return;
          if (!res.visible) {
            setLibraryState('hidden');
          } else {
            setGames(res.library.map(parseLibraryGame));
            setLibraryState('ready');
          }
        } catch {
          if (!cancelled) setLibraryState('error');
        }
        // Trofeos + amigos en común + mi biblioteca (juegos en común).
        setTrophiesState('loading');
        try {
          const [tRes, mRes, ownLib] = await Promise.all([
            fetchUserTrophies(prof.user.id).catch(() => null),
            prof.isSelf
              ? Promise.resolve([] as OnlineUser[])
              : fetchMutualFriends(prof.user.id).catch(() => [] as OnlineUser[]),
            fetchOwnOnlineLibrary().catch(() => []),
          ]);
          if (cancelled) return;
          if (!tRes || !tRes.visible) {
            setTrophies([]);
            setTrophiesState(!tRes ? 'error' : 'hidden');
          } else {
            setTrophies(tRes.trophies);
            setTrophiesState('ready');
          }
          setMutualFriends(mRes || []);
          setOwnGameNames((ownLib || []).map((g) => normalizeGameTitle(g.game_name)));
        } catch {
          if (!cancelled) {
            setTrophies([]);
            setTrophiesState('error');
            setMutualFriends([]);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message === 'network' ? t('onlineProfile.errorNetwork') : t('onlineProfile.errorLoad'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const reloadProfile = async () => {
    if (!username) return;
    try {
      const prof = await fetchOnlineUserProfile(username);
      setProfile(prof);
      if (prof.friendship !== 'accepted') setFriendshipId(null);
      else {
        const friends = await fetchOnlineFriends().catch(() => []);
        const match = friends.find((f) => f.user.id === prof.user.id);
        setFriendshipId(match ? match.friendshipId : null);
      }
      onChanged?.();
    } catch {
      /* noop */
    }
  };

  const runAction = async (fn: () => Promise<void>, doneMsg?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (doneMsg) toastService.show(doneMsg);
      await reloadProfile();
    } catch (e: any) {
      toastService.show(
        e?.status === 409 ? t('friends.alreadyRelated') : e?.message === 'network' ? t('friends.errorNetwork') : t('friends.errorGeneric'),
      );
    } finally {
      setBusy(false);
    }
  };

  const session = getOnlineSession();
  const totalMinutes = games.reduce((acc, g) => acc + g.playtimeMinutes, 0);
  const playedGames = games.filter((g) => g.playtimeMinutes > 0);
  const averageMinutes = playedGames.length ? Math.round(totalMinutes / playedGames.length) : 0;
  const favoritesCount = games.filter((g) => g.isFavorite).length;

  // ── Navegación por teclado/mando en fase de captura ───────────────────
  // Filas (arriba/abajo): atrás → acciones → pestañas → tarjetas (solo en Overview).
  // Dentro de una fila (izquierda/derecha): el foco se mueve entre sus elementos.
  // Q / E: pestaña anterior / siguiente, desde cualquier sitio.
  // Todo con stopPropagation: la vista de detrás no se mueve ni reacciona.
  const [focusId, setFocusId] = useState('back');
  const focusRefs = useRef(new Map<string, any>());
  const lastCardRef = useRef<string>(CARD_IDS[0]);

  const actionIds = useMemo(() => {
    if (!(profile && !loading && !profile.isSelf && !!session)) return [];
    if (profile.friendship === 'accepted') return friendshipId ? ['action:remove'] : [];
    if (profile.friendship === 'pending' && incomingRequestId) return ['action:accept', 'action:reject'];
    if (profile.friendship !== 'pending') return ['action:add'];
    return [];
  }, [profile, loading, session, friendshipId, incomingRequestId]);

  const rows = useMemo(() => {
    const r: string[][] = [['back']];
    if (actionIds.length > 0) r.push(actionIds);
    r.push(TAB_IDS);
    if (tab === 'overview') r.push(CARD_IDS);
    return r;
  }, [actionIds, tab]);

  const moveFocus = (id: string) => {
    if (id.startsWith('card:')) lastCardRef.current = id;
    setFocusId(id);
  };

  const setFocusRefById = (id: string) => (el: any) => {
    if (el) focusRefs.current.set(id, el);
    else focusRefs.current.delete(id);
  };

  // Ejecutor siempre fresco (el efecto de teclado lo llama vía ref).
  const focusRunnerRef = useRef((_id: string) => { });
  focusRunnerRef.current = (id: string) => {
    if (id === 'back') {
      soundService.playBack?.();
      onClose();
    } else if (id === 'action:add' && profile) {
      runAction(() => sendOnlineFriendRequest(profile.user.id), t('friends.requestSent'));
    } else if (id === 'action:accept' && incomingRequestId) {
      runAction(() => acceptOnlineFriendRequest(incomingRequestId));
    } else if (id === 'action:reject' && incomingRequestId) {
      runAction(() => rejectOnlineFriendRequest(incomingRequestId));
    } else if (id === 'action:remove' && friendshipId) {
      runAction(() => removeOnlineFriend(friendshipId));
    } else if (id.startsWith('tab:')) {
      soundService.playNavigation?.();
      setTab(id.slice(4) as TabKey);
      setFocusId(id);
    } else if (id === 'card:games' || id === 'card:friends') {
      // Las tarjetas de "en común" abren su pestaña completa.
      soundService.playActivation?.();
      const key: TabKey = id === 'card:games' ? 'games' : 'friends';
      setTab(key);
      setFocusId(`tab:${key}`);
    }
    // card:trophies y card:top: solo enfocables, sin acción.
  };

  useEffect(() => {
    if (!username || Platform.OS !== 'web') return;
    const handleKey = (e: KeyboardEvent) => {
      const cur = focusId;
      const rowIdx = rows.findIndex((r) => r.includes(cur));
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      const k = e.key;
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;

      if (k === 'Escape' || k === 'b' || k === 'B') {
        stop();
        soundService.playBack?.();
        onClose();
      } else if (plain && (k === 'q' || k === 'Q' || k === 'e' || k === 'E')) {
        // Q/E: cambia de pestaña sin importar dónde esté el foco.
        const dir = k.toLowerCase() === 'e' ? 1 : -1;
        const pos = TAB_KEYS.indexOf(tab);
        const next = Math.max(0, Math.min(TAB_KEYS.length - 1, pos + dir));
        if (next === pos) return;
        stop();
        soundService.playNavigation?.();
        setTab(TAB_KEYS[next]);
        // Si el foco estaba en las pestañas o en las tarjetas (que pueden
        // desaparecer), pasa a la pestaña nueva.
        if (cur.startsWith('tab:') || cur.startsWith('card:')) setFocusId(`tab:${TAB_KEYS[next]}`);
      } else if (k === 'ArrowDown' || k === 'ArrowUp') {
        if (rowIdx < 0) {
          stop();
          setFocusId(`tab:${tab}`);
          return;
        }
        const nextRow = rowIdx + (k === 'ArrowDown' ? 1 : -1);
        if (nextRow < 0 || nextRow >= rows.length) return;
        stop();
        soundService.playNavigation?.();
        const target = rows[nextRow];
        if (target[0].startsWith('tab:')) moveFocus(`tab:${tab}`); // cae en la pestaña activa
        else if (target[0].startsWith('card:')) {
          moveFocus(target.includes(lastCardRef.current) ? lastCardRef.current : target[0]);
        } else moveFocus(target[0]);
      } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
        if (rowIdx < 0) return;
        const row = rows[rowIdx];
        const pos = row.indexOf(cur);
        const next = Math.max(0, Math.min(row.length - 1, pos + (k === 'ArrowRight' ? 1 : -1)));
        if (next === pos) return;
        stop();
        soundService.playNavigation?.();
        moveFocus(row[next]);
      } else if (k === 'Enter' || k === 'x' || k === 'X' || k === ' ') {
        stop();
        soundService.playActivation?.();
        focusRunnerRef.current(cur);
      } else if (k === 'Tab') {
        stop();
        const order = rows.flat();
        const pos = order.indexOf(cur);
        const next = order[(pos + (e.shiftKey ? order.length - 1 : 1)) % order.length];
        soundService.playNavigation?.();
        moveFocus(next);
      }
    };
    window.addEventListener('keydown', handleKey as any, true);
    return () => window.removeEventListener('keydown', handleKey as any, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, focusId, rows, tab]);

  // Mantiene visible el elemento enfocado dentro del ScrollView.
  useEffect(() => {
    if (!username || Platform.OS !== 'web') return;
    try {
      const { findNodeHandle } = require('react-native');
      const node = findNodeHandle(focusRefs.current.get(focusId));
      (node as any)?.scrollIntoView?.({ block: 'nearest' });
    } catch {
      /* noop */
    }
  }, [focusId, username, tab]);

  // Si el foco queda en algo que ya no existe, cae en la pestaña activa.
  useEffect(() => {
    if (!rows.flat().includes(focusId)) setFocusId(`tab:${tab}`);
  }, [rows, focusId, tab]);
  const mostPlayed = games.reduce<LibraryGameView | null>(
    (best, g) =>
      g.playtimeMinutes > 0 && (!best || g.playtimeMinutes > best.playtimeMinutes) ? g : best,
    null,
  );

  const trophyTotals = useMemo(() => {
    const acc = { total: 0, unlocked: 0, platinum: 0, gold: 0, silver: 0, bronze: 0 };
    for (const g of trophies) {
      acc.total += g.total;
      acc.unlocked += g.unlocked;
      acc.platinum += g.platinum;
      acc.gold += g.gold;
      acc.silver += g.silver;
      acc.bronze += g.bronze;
    }
    return acc;
  }, [trophies]);
  const trophyPct = trophyTotals.total > 0
    ? Math.round((trophyTotals.unlocked * 100) / trophyTotals.total)
    : 0;
  const topPlayed = useMemo(
    () => [...games].sort((a, b) => b.playtimeMinutes - a.playtimeMinutes).slice(0, 3),
    [games],
  );
  const mutualGames = useMemo(() => {
    if (ownGameNames.length === 0 || games.length === 0) return [];
    const mine = new Set(ownGameNames);
    return games.filter((g) => mine.has(normalizeGameTitle(g.name)));
  }, [games, ownGameNames]);

  // ── Piezas de la vista (mismo layout que UserProfileView) ──────────────
  const coverUrl =
    profile?.user.coverUrl && /^https?:\/\//i.test(profile.user.coverUrl) ? profile.user.coverUrl : null;
  const avatarUrl =
    profile?.user.avatarUrl && /^https?:\/\//i.test(profile.user.avatarUrl) ? profile.user.avatarUrl : null;

  const cardStyle = (id: string) => [styles.profileCard, focusId === id && styles.profileCardFocused];

  const actionButton = (
    id: string,
    icon: React.ComponentProps<typeof Ionicons>['name'],
    label: string,
    danger = false,
  ) => {
    const focused = focusId === id;
    return (
      <TouchableOpacity
        key={id}
        ref={setFocusRefById(id)}
        style={[styles.profileActionButton, focused && styles.profileActionButtonFocused]}
        disabled={busy}
        onPress={() => {
          setFocusId(id);
          focusRunnerRef.current(id);
        }}
      >
        {focused && <SpinningBorderSearch size={s(180)} spread={4} borderRadius={18} />}
        <Ionicons name={icon} size={s(20)} color={danger ? '#FF8899' : '#FFF'} />
        <Text style={[styles.profileActionButtonLabel, danger && { color: '#FF8899' }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderActions = () => {
    if (!profile || profile.isSelf || !session) return null;
    if (profile.friendship === 'accepted') {
      return (
        <View style={styles.profileHeaderActions}>
          <View style={styles.profileStatusBadge}>
            <Ionicons name="checkmark-circle-outline" size={s(20)} color="rgba(255,255,255,0.7)" />
            <Text style={styles.profileStatusBadgeText}>{t('onlineProfile.friend')}</Text>
          </View>
          {friendshipId ? actionButton('action:remove', 'person-remove-outline', t('onlineProfile.remove'), true) : null}
        </View>
      );
    }
    if (profile.friendship === 'pending' && incomingRequestId) {
      return (
        <View style={styles.profileHeaderActions}>
          {actionButton('action:accept', 'checkmark', t('onlineProfile.accept'))}
          {actionButton('action:reject', 'close', t('onlineProfile.reject'))}
        </View>
      );
    }
    if (profile.friendship === 'pending') {
      return (
        <View style={styles.profileHeaderActions}>
          <View style={styles.profileStatusBadge}>
            <Ionicons name="time-outline" size={s(20)} color="#FFB300" />
            <Text style={[styles.profileStatusBadgeText, { color: '#FFB300' }]}>{t('onlineProfile.pending')}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.profileHeaderActions}>
        {actionButton('action:add', 'person-add-outline', t('onlineProfile.addFriend'))}
      </View>
    );
  };

  const statCell = (
    icon: React.ComponentProps<typeof Ionicons>['name'],
    color: string,
    value: string | number,
    label: string,
  ) => (
    <View style={[styles.statCell, { flex: 1 }]}>
      <View style={styles.statCellBody}>
        <Ionicons name={icon} size={s(28)} color={color} />
        <Text style={styles.statNumber}>{value}</Text>
      </View>
      <View style={styles.statCellFooter}>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );

  const renderAvatar = (u: OnlineUser, style: any, textStyle: any) => {
    const url = u.avatarUrl && /^https?:\/\//i.test(u.avatarUrl) ? u.avatarUrl : null;
    return (
      <View style={style}>
        {url ? (
          <Image source={{ uri: url }} style={styles.cardAvatarImg} contentFit="cover" />
        ) : (
          <Text style={textStyle}>{(u.displayName || u.username).slice(0, 1).toUpperCase()}</Text>
        )}
      </View>
    );
  };

  return (
    <Modal visible={!!username} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.profilePageContent}>
          {/* Banner a sangre que se funde con el gris base */}
          <View style={styles.profileBannerContainer}>
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            ) : (
              <View
                style={[
                  styles.profileBannerGradient,
                  {
                    background: `linear-gradient(135deg, ${PROFILE_ACCENT}33 0%, rgba(20, 20, 30, 0.8) 100%)`,
                  } as any,
                ]}
              />
            )}
            <View style={styles.profileBannerOverlay} pointerEvents="none" />
            <LinearGradient
              colors={['rgba(20, 20, 20, 0)', PROFILE_BG]}
              style={styles.profileBannerFade}
              pointerEvents="none"
            />

            <TouchableOpacity
              ref={setFocusRefById('back')}
              style={[styles.profileBackButton, focusId === 'back' && styles.focusedRing]}
              onPress={() => {
                setFocusId('back');
                focusRunnerRef.current('back');
              }}
            >
              <Ionicons name="arrow-back" size={s(22)} color="#FFF" />
            </TouchableOpacity>

            {/* Avatar + nombre sobre el banner */}
            {profile && !loading ? (
              <View style={styles.profileHeaderContent} pointerEvents="none">
                <View style={styles.profileAvatarWrapper}>
                  <View style={[styles.profileAvatarCircle, { borderColor: PROFILE_ACCENT }]}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.profileAvatarImg} contentFit="cover" />
                    ) : (
                      <Text style={styles.profileAvatarInitial}>
                        {(profile.user.displayName || profile.user.username).slice(0, 1).toUpperCase()}
                      </Text>
                    )}
                    <View style={styles.profileOnlineDot} />
                  </View>

                  <View style={styles.profileInfoDetails}>
                    <View style={styles.profileNameRow}>
                      <Text style={[styles.profileDisplayName, styles.profileTextShadow]}>
                        {profile.user.displayName || profile.user.username}
                      </Text>
                      <View style={styles.profilePlusBadge}>
                        <Ionicons name="add" size={s(14)} color="#000" />
                      </View>
                    </View>
                    <View style={styles.profileHandleRow}>
                      <Text style={[styles.profileHandleText, styles.profileTextShadow]}>
                        @{profile.user.username}
                      </Text>
                      <Text style={styles.profileHandleSep}>|</Text>
                      <Ionicons name="game-controller" size={s(14)} color="rgba(255,255,255,0.6)" />
                      {profile.user.lastSeenAt ? (
                        <Text style={[styles.profileHandleText, styles.profileTextShadow]}>
                          {formatLastSeen(t, profile.user.lastSeenAt)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          {loading || !profile ? (
            <View style={styles.center}>
              {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#FFF" size="large" />}
            </View>
          ) : (
            <>
              {/* Acciones de amistad: debajo del usuario, encima de las pestañas */}
              {renderActions()}

              {/* Pestañas */}
              <View style={styles.profileTabsRow}>
                <View style={styles.profileTabsBar}>
                  {TAB_KEYS.map((key) => {
                    const tabId = `tab:${key}`;
                    const isActive = tab === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        ref={setFocusRefById(tabId)}
                        style={[styles.profileTabItem, isActive && styles.profileTabItemActive]}
                        onPress={() => {
                          setFocusId(tabId);
                          focusRunnerRef.current(tabId);
                        }}
                      >
                        {focusId === tabId && <SpinningBorderSearch size={s(180)} spread={0} borderRadius={1} />}
                        <Text style={[styles.profileTabText, isActive && styles.profileTabTextActive]}>
                          {t(`profile.${key}` as any)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.profilePageBody}>
                {/* ── Overview ── */}
                {tab === 'overview' && (
                  <View>
                    {/* Barra de estadísticas: valor arriba, etiqueta abajo */}
                    <View style={styles.statsBar}>
                      {statCell('time-outline', '#FFCC00', formatCompactMinutes(totalMinutes), t('profile.totalPlaytime'))}
                      {statCell('game-controller-outline', '#00D4FF', games.length, t('profile.gamesCount'))}
                      {statCell(
                        'hourglass-outline',
                        '#B388FF',
                        formatCompactMinutes(averageMinutes),
                        tr('profile.averagePlaytime', 'Average playtime'),
                      )}

                      <View style={[styles.statCell, { flex: 2 }]}>
                        <View style={[styles.statCellBody, styles.statCellBodyTopGame]}>
                          {mostPlayed ? (
                            <>
                              <BlurredArt
                                uri={mostPlayed.coverUrl}
                                style={styles.topGameThumb}
                                radius={s(8)}
                                placeholderSize={s(22)}
                              />
                              <View style={styles.topGameInfo}>
                                <Text style={styles.topGameTitle} numberOfLines={2}>{mostPlayed.name}</Text>
                                <Text style={styles.topGamePlaytime}>
                                  {formatPlaytime(mostPlayed.playtimeMinutes, t)}
                                </Text>
                              </View>
                            </>
                          ) : (
                            <Text style={styles.statNumber}>--</Text>
                          )}
                        </View>
                        <View style={styles.statCellFooter}>
                          <Text style={styles.statLabel}>{tr('profile.topGame', 'Most played')}</Text>
                        </View>
                      </View>

                      {statCell('heart-outline', '#FF3B30', favoritesCount, t('profile.favoriteGames'))}
                    </View>

                    {/* 4 tarjetas: trofeos · más jugados · juegos en común · amigos en común */}
                    <View style={styles.profileCardsRow}>
                      {/* 1) Trofeos */}
                      <View ref={setFocusRefById('card:trophies')} style={cardStyle('card:trophies')}>
                        <View style={styles.profileCardBody}>
                          {trophiesState === 'loading' ? (
                            <ActivityIndicator color="#FFF" />
                          ) : trophiesState !== 'ready' ? (
                            <Text style={styles.profileCardHint}>
                              {trophiesState === 'hidden'
                                ? tr('onlineProfile.trophiesHidden', 'Private trophies')
                                : tr('onlineProfile.noTrophies', 'No synced trophies')}
                            </Text>
                          ) : (
                            <>
                              <View style={styles.trophyHeadRow}>
                                <Image source={TIER_ICONS.bronze} style={styles.trophyHeadIcon} contentFit="contain" />
                                <Text style={styles.trophyLevel}>{trophyTotals.unlocked}</Text>
                                <View style={styles.trophyProgressCol}>
                                  <Text style={styles.trophyProgressPct}>{trophyPct} %</Text>
                                  <View style={styles.trophyProgressTrack}>
                                    <View style={[styles.trophyProgressFill, { width: `${trophyPct}%` }]} />
                                  </View>
                                </View>
                              </View>
                              <View style={styles.trophyTiersRow}>
                                {(['platinum', 'gold', 'silver', 'bronze'] as const).map((tier) => (
                                  <View key={tier} style={styles.trophyTier}>
                                    <Image source={TIER_ICONS[tier]} style={styles.trophyTierIcon} contentFit="contain" />
                                    <Text style={styles.trophyTierCount}>{trophyTotals[tier]}</Text>
                                  </View>
                                ))}
                              </View>
                            </>
                          )}
                        </View>
                        <View>
                          <Text style={styles.profileCardLabel}>{tr('onlineProfile.trophiesWon', 'Trophies won')}:</Text>
                          <Text style={styles.profileCardValue}>{trophiesState === 'ready' ? trophyTotals.unlocked : '--'}</Text>
                        </View>
                      </View>

                      {/* 2) Más jugados */}
                      <View ref={setFocusRefById('card:top')} style={cardStyle('card:top')}>
                        <View style={styles.cardRecentList}>
                          {topPlayed.length > 0 ? (
                            topPlayed.map((g) => (
                              <View key={g.id} style={styles.cardRecentRow}>
                                <BlurredArt
                                  uri={g.coverUrl}
                                  style={styles.cardRecentThumb}
                                  radius={s(4)}
                                  placeholderSize={s(18)}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.cardRecentTitle} numberOfLines={2}>{g.name}</Text>
                                  <Text style={styles.cardRecentSub} numberOfLines={1}>
                                    {g.playtimeMinutes > 0 ? formatPlaytime(g.playtimeMinutes, t) : '--'}
                                  </Text>
                                </View>
                              </View>
                            ))
                          ) : (
                            <View style={styles.profileCardBody}>
                              <Text style={styles.profileCardHint}>{libraryHint(t, libraryState)}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.profileCardLabel}>{tr('onlineProfile.mostPlayedTop', 'Most played')}</Text>
                      </View>

                      {/* 3) Juegos en común; al abrirla va a la pestaña Games */}
                      <TouchableOpacity
                        ref={setFocusRefById('card:games')}
                        style={cardStyle('card:games')}
                        activeOpacity={0.85}
                        onPress={() => focusRunnerRef.current('card:games')}
                      >
                        <View style={styles.cardCoverRow}>
                          {libraryState !== 'ready' ? (
                            <Text style={styles.profileCardHint}>{libraryHint(t, libraryState)}</Text>
                          ) : mutualGames.length === 0 ? (
                            <Text style={styles.profileCardHint}>{tr('onlineProfile.noMutualGames', 'No mutual games')}</Text>
                          ) : (
                            mutualGames.slice(0, PROFILE_LIBRARY_PREVIEW).map((g) => (
                              <BlurredArt
                                key={g.id}
                                uri={g.coverUrl}
                                style={styles.cardCover}
                                radius={s(6)}
                                placeholderSize={s(22)}
                              />
                            ))
                          )}
                        </View>
                        <View>
                          <Text style={styles.profileCardLabel}>{tr('onlineProfile.mutualGames', 'Mutual games')}:</Text>
                          <Text style={styles.profileCardValue}>{libraryState === 'ready' ? mutualGames.length : '--'}</Text>
                        </View>
                      </TouchableOpacity>

                      {/* 4) Amigos en común; al abrirla va a la pestaña Friends */}
                      <TouchableOpacity
                        ref={setFocusRefById('card:friends')}
                        style={cardStyle('card:friends')}
                        activeOpacity={0.85}
                        onPress={() => focusRunnerRef.current('card:friends')}
                      >
                        <View style={styles.cardAvatarRow}>
                          {mutualFriends.length > 0 ? (
                            mutualFriends.slice(0, PROFILE_FRIENDS_PREVIEW).map((u, idx) => (
                              <View key={u.id} style={idx > 0 ? { marginLeft: s(-10) } : undefined}>
                                {renderAvatar(u, styles.cardAvatar, styles.cardAvatarInitial)}
                              </View>
                            ))
                          ) : (
                            <Text style={styles.profileCardHint}>
                              {profile.isSelf
                                ? t('friends.comingSoon')
                                : tr('onlineProfile.noMutualFriends', 'No mutual friends')}
                            </Text>
                          )}
                        </View>
                        <View>
                          <Text style={styles.profileCardLabel}>{tr('onlineProfile.mutualFriends', 'Mutual friends')}:</Text>
                          <Text style={styles.profileCardValue}>{profile.isSelf ? '--' : mutualFriends.length}</Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    {/* Acerca de */}
                    {profile.user.bio ? (
                      <View style={styles.aboutCard}>
                        <Text style={styles.aboutCardTitle}>{t('profile.about')}</Text>
                        <Text style={styles.aboutCardText}>{profile.user.bio}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {/* ── Games (biblioteca completa, lista vertical) ── */}
                {tab === 'games' && (
                  <View style={styles.profileSection}>
                    <View style={styles.profileSectionHeader}>
                      <Text style={styles.profileSectionTitle}>{t('profile.games')}</Text>
                      {games.length > 0 && <Text style={styles.profileSectionCount}>{games.length}</Text>}
                    </View>
                    {libraryState === 'loading' ? (
                      <ActivityIndicator color="#FFF" style={{ marginTop: s(12) }} />
                    ) : libraryState !== 'ready' ? (
                      <Text style={styles.hint}>{libraryHint(t, libraryState)}</Text>
                    ) : games.length === 0 ? (
                      <Text style={styles.hint}>{t('onlineProfile.libraryEmpty')}</Text>
                    ) : (
                      games.map((game) => (
                        <View key={game.id} style={styles.recentRow}>
                          <BlurredArt uri={game.coverUrl} style={styles.recentThumb} radius={0} placeholderSize={s(30)} />
                          <View style={styles.recentInfo}>
                            <Text style={styles.recentTitle} numberOfLines={1}>{game.name}</Text>
                            <Text style={styles.recentSub}>
                              {game.playtimeMinutes > 0 ? formatPlaytime(game.playtimeMinutes, t) : t('lastPlayed.never')}
                            </Text>
                          </View>
                          <Text style={styles.recentPlaytime}>{game.platform || ''}</Text>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* ── Friends (en común) ── */}
                {tab === 'friends' && (
                  <View style={styles.profileSection}>
                    <View style={styles.profileSectionHeader}>
                      <Text style={styles.profileSectionTitle}>{t('profile.friends')}</Text>
                      {!profile.isSelf && mutualFriends.length > 0 && (
                        <Text style={styles.profileSectionCount}>{mutualFriends.length}</Text>
                      )}
                    </View>
                    {profile.isSelf ? (
                      <Text style={styles.hint}>{t('friends.comingSoon')}</Text>
                    ) : mutualFriends.length === 0 ? (
                      <Text style={styles.hint}>{tr('onlineProfile.noMutualFriends', 'No mutual friends')}</Text>
                    ) : (
                      mutualFriends.map((u) => (
                        <View key={u.id} style={styles.recentRow}>
                          {renderAvatar(u, styles.friendRowAvatar, styles.cardAvatarInitial)}
                          <View style={styles.recentInfo}>
                            <Text style={styles.recentTitle} numberOfLines={1}>{u.displayName}</Text>
                            <Text style={styles.recentSub} numberOfLines={1}>@{u.username}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

function libraryHint(t: (key: any) => string, state: string): string {
  if (state === 'hidden') return t('onlineProfile.libraryHidden');
  if (state === 'error') return t('onlineProfile.errorLoad');
  return t('onlineProfile.libraryEmpty');
}

// Gris base del perfil: el banner se funde hacia este color (igual que UserProfileView).
const PROFILE_BG = '#141414';
// Color de acento del avatar (mismo fallback que usa UserProfileView).
const PROFILE_ACCENT = '#00D4FF';
const PROFILE_LIBRARY_PREVIEW = 3; // portadas visibles en la tarjeta de juegos en común
const PROFILE_FRIENDS_PREVIEW = 4; // avatares visibles en la tarjeta de amigos en común

// Portada con fondo difuminado de la misma imagen: se ve bien sin importar la
// proporción del arte original (cuadrado, vertical o apaisado).
// (Copia local de BlurredArt de UserProfileView; se duplica para no crear un
// import circular, ya que UserProfileView importa este archivo.)
function BlurredArt({
  uri,
  style,
  radius = 8,
  placeholderSize = 28,
}: {
  uri?: string | null;
  style?: any;
  radius?: number;
  placeholderSize?: number;
}) {
  return (
    <View
      style={[
        { overflow: 'hidden', borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.06)' },
        style,
      ]}
    >
      {uri ? (
        <>
          <Image source={{ uri }} blurRadius={24} contentFit="cover" style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
          <Image source={{ uri }} contentFit="contain" style={StyleSheet.absoluteFillObject} />
        </>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="game-controller-outline" size={placeholderSize} color="rgba(255,255,255,0.3)" />
        </View>
      )}
    </View>
  );
}

// Estilos escalados con `s` (mismos valores base que UserProfileView, pensado
// para una pantalla de 1920px de ancho).
const createStyles = (s: (px: number) => number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: PROFILE_BG,
    },
    profilePageContent: {
      paddingBottom: s(60),
    },
    center: {
      padding: s(60),
      alignItems: 'center',
    },
    error: {
      color: '#e2e2e2ff',
      fontSize: s(14),
    },
    hint: {
      color: 'rgba(255,255,255,0.5)',
      fontSize: s(14),
      fontFamily: 'SSTLight',
      marginTop: s(12),
    },
    focusedRing: {
      // @ts-ignore sombra web sin mover el layout
      boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
    },

    // ── Banner ──
    profileBannerContainer: {
      width: '100%',
      height: s(340),
      overflow: 'hidden',
      position: 'relative',
    },
    profileBannerGradient: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#0d0d0dff',
    },
    profileBannerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.15)',
    },
    profileBannerFade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: s(230),
    },
    profileBackButton: {
      position: 'absolute',
      top: s(28),
      left: s(40),
      width: s(38),
      height: s(38),
      borderRadius: s(19),
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    profileHeaderContent: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: s(14),
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: s(72),
    },
    profileAvatarWrapper: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: s(18),
    },
    profileAvatarCircle: {
      width: s(90),
      height: s(90),
      borderRadius: s(45),
      borderWidth: 3,
      backgroundColor: 'rgba(255,255,255,0.14)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileAvatarImg: {
      width: '100%',
      height: '100%',
      borderRadius: s(45),
    },
    profileAvatarInitial: {
      color: '#FFF',
      fontSize: s(36),
      fontFamily: 'SSTBold',
    },
    profileOnlineDot: {
      position: 'absolute',
      bottom: s(4),
      right: s(4),
      width: s(14),
      height: s(14),
      borderRadius: s(7),
      backgroundColor: '#4CD964',
    },
    profileInfoDetails: {
      paddingBottom: s(6),
      gap: s(4),
    },
    profileNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
    },
    profileDisplayName: {
      color: '#FFF',
      fontSize: s(28),
      fontFamily: 'SSTMedium',
    },
    profilePlusBadge: {
      width: s(20),
      height: s(20),
      borderRadius: s(10),
      backgroundColor: '#FFCC00',
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileHandleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
    },
    profileHandleText: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: s(14),
      fontFamily: 'SSTLight',
    },
    profileHandleSep: {
      color: 'rgba(255,255,255,0.4)',
      fontSize: s(14),
    },
    profileTextShadow: {
      textShadowColor: 'rgba(0, 0, 0, 0.7)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 5,
    },

    // ── Pestañas + acciones ──
    profileTabsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: s(72),
      marginBottom: s(24),
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    },
    profileTabsBar: {
      flexDirection: 'row',
    },
    profileTabItem: {
      paddingHorizontal: s(22),
      paddingVertical: s(14),
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
      marginBottom: -1,
    },
    profileTabItemActive: {
      borderBottomColor: '#FFF',
    },
    profileTabText: {
      color: 'rgba(255,255,255,0.5)',
      fontSize: s(16),
      fontFamily: 'SSTLight',
    },
    profileTabTextActive: {
      color: '#FFF',
      fontFamily: 'SSTMedium',
    },
    profileHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(10),
      marginHorizontal: s(72),
      marginTop: s(4),
      marginBottom: s(16),
    },
    profileActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(8),
      height: s(44),
      paddingHorizontal: s(20),
      borderRadius: s(22),
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    profileActionButtonFocused: {
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
    profileActionButtonLabel: {
      color: '#FFF',
      fontSize: s(14),
      fontFamily: 'SSTMedium',
    },
    profileStatusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
      height: s(44),
      paddingHorizontal: s(12),
    },
    profileStatusBadgeText: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: s(14),
      fontFamily: 'SSTLight',
    },
    profilePageBody: {
      paddingHorizontal: s(72),
    },

    // ── Barra de estadísticas ──
    statsBar: {
      flexDirection: 'row',
      gap: s(12),
      marginBottom: s(32),
    },
    statCell: {
      borderRadius: s(8),
      overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    statCellBody: {
      height: s(96),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(14),
    },
    statCellBodyTopGame: {
      justifyContent: 'flex-start',
      paddingHorizontal: s(16),
    },
    statCellFooter: {
      height: s(40),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    statNumber: {
      color: '#FFF',
      fontSize: s(32),
      fontFamily: 'SSTMedium',
    },
    statLabel: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: s(14),
      fontFamily: 'SSTLight',
    },
    topGameThumb: {
      width: s(64),
      height: s(64),
    },
    topGameInfo: {
      flex: 1,
      gap: s(2),
    },
    topGameTitle: {
      color: '#FFF',
      fontSize: s(15),
      fontFamily: 'SSTMedium',
    },
    topGamePlaytime: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: s(13),
      fontFamily: 'SSTLight',
    },

    // ── Tarjetas del Overview (estilo PS5) ──
    profileCardsRow: {
      flexDirection: 'row',
      gap: s(12),
    },
    profileCard: {
      flex: 1,
      minWidth: 0,
      minHeight: s(300),
      padding: s(18),
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      justifyContent: 'space-between',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    profileCardFocused: {
      borderColor: 'rgba(255, 255, 255, 0.92)',
    },
    profileCardBody: {
      flex: 1,
      justifyContent: 'center',
      gap: s(14),
    },
    profileCardLabel: {
      color: 'rgba(255, 255, 255, 0.6)',
      fontSize: s(16),
      fontFamily: 'SSTLight',
    },
    profileCardValue: {
      color: '#FFF',
      fontSize: s(24),
      fontFamily: 'SSTMedium',
      marginTop: s(2),
    },
    profileCardHint: {
      color: 'rgba(255, 255, 255, 0.4)',
      fontSize: s(14),
      fontFamily: 'SSTLight',
      textAlign: 'center',
    },
    // Trofeos
    trophyHeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(12),
    },
    trophyHeadIcon: {
      width: s(34),
      height: s(34),
    },
    trophyLevel: {
      color: '#FFF',
      fontSize: s(26),
      fontFamily: 'SSTLight',
    },
    trophyProgressCol: {
      width: s(90),
      gap: s(4),
    },
    trophyProgressPct: {
      color: 'rgba(255, 255, 255, 0.75)',
      fontSize: s(13),
      fontFamily: 'SSTLight',
    },
    trophyProgressTrack: {
      height: s(3),
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      overflow: 'hidden',
    },
    trophyProgressFill: {
      height: s(3),
      backgroundColor: '#FFF',
    },
    trophyTiersRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    trophyTier: {
      alignItems: 'center',
      gap: s(4),
    },
    trophyTierIcon: {
      width: s(24),
      height: s(24),
    },
    trophyTierCount: {
      color: '#FFF',
      fontSize: s(14),
      fontFamily: 'SSTLight',
    },
    // Más jugados
    cardRecentList: {
      flex: 1,
      gap: s(8),
    },
    cardRecentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(12),
      padding: s(4),
      borderRadius: s(6),
    },
    cardRecentThumb: {
      width: s(60),
      height: s(60),
    },
    cardRecentTitle: {
      color: '#FFF',
      fontSize: s(15),
      fontFamily: 'SSTMedium',
    },
    cardRecentSub: {
      color: 'rgba(255, 255, 255, 0.55)',
      fontSize: s(13),
      fontFamily: 'SSTLight',
      marginTop: s(2),
    },
    // Juegos en común
    cardCoverRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(10),
    },
    cardCover: {
      width: s(96),
      height: s(96),
    },
    // Amigos en común
    cardAvatarRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardAvatar: {
      width: s(64),
      height: s(64),
      borderRadius: s(32),
      backgroundColor: '#2a2a2e',
      borderWidth: 2,
      borderColor: '#1a1a1a',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    cardAvatarImg: {
      width: '100%',
      height: '100%',
    },
    cardAvatarInitial: {
      color: '#FFF',
      fontSize: s(24),
      fontFamily: 'SSTBold',
    },

    // ── Acerca de ──
    aboutCard: {
      marginTop: s(32),
      padding: s(20),
      borderRadius: s(12),
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      backgroundColor: 'rgba(255,255,255,0.04)',
      gap: s(8),
    },
    aboutCardTitle: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: s(15),
      fontFamily: 'SSTBold',
    },
    aboutCardText: {
      color: 'rgba(255,255,255,0.8)',
      fontSize: s(15),
      fontFamily: 'SSTLight',
      lineHeight: s(22),
    },

    // ── Pestañas Games / Friends ──
    profileSection: {
      paddingBottom: s(20),
    },
    profileSectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: s(12),
      marginBottom: s(16),
    },
    profileSectionTitle: {
      color: '#FFF',
      fontSize: s(22),
      fontFamily: 'SSTMedium',
    },
    profileSectionCount: {
      color: 'rgba(255,255,255,0.5)',
      fontSize: s(18),
      fontFamily: 'SSTLight',
    },
    recentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(16),
      paddingVertical: s(8),
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    recentThumb: {
      width: s(72),
      height: s(72),
    },
    friendRowAvatar: {
      width: s(64),
      height: s(64),
      borderRadius: s(32),
      backgroundColor: '#2a2a2e',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    recentInfo: {
      flex: 1,
      gap: s(4),
    },
    recentTitle: {
      color: '#FFF',
      fontSize: s(16),
      fontFamily: 'SSTMedium',
    },
    recentSub: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: s(14),
      fontFamily: 'SSTLight',
    },
    recentPlaytime: {
      color: 'rgba(255,255,255,0.5)',
      fontSize: s(14),
      fontFamily: 'SSTLight',
    },
  });