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
    (best, g) => (!best || g.playtimeMinutes > best.playtimeMinutes ? g : best),
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

  return (
    <Modal visible={!!username} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          {/* Banner con cabecera superpuesta (estilo PSN) */}
          <View style={styles.banner}>
            {profile?.user.coverUrl && /^https?:\/\//i.test(profile.user.coverUrl) ? (
              <Image source={{ uri: profile.user.coverUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            ) : (
              <View style={styles.bannerGradient} />
            )}
            <View style={styles.bannerOverlay} pointerEvents="none" />
            <LinearGradient
              colors={['rgba(22, 22, 22, 0)', '#141414ff']}
              style={styles.bannerFade}
              pointerEvents="none"
            />
            <TouchableOpacity
              ref={setFocusRefById('back')}
              style={[styles.backBtn, focusId === 'back' && styles.focusedRing]}
              onPress={() => {
                setFocusId('back');
                focusRunnerRef.current('back');
              }}
            >
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>

            {profile && !loading ? (
              <View style={styles.bannerHeader}>
                {profile.user.avatarUrl && /^https?:\/\//i.test(profile.user.avatarUrl) ? (
                  <View>
                    <Image source={{ uri: profile.user.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                    <View style={styles.onlineDot} />
                  </View>
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(profile.user.displayName || profile.user.username).slice(0, 1).toUpperCase()}
                    </Text>
                    <View style={styles.onlineDot} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.displayName}>{profile.user.displayName}</Text>
                  <Text style={styles.username}>
                    {profile.user.username}
                    {profile.user.lastSeenAt ? `  |  ${formatLastSeen(t, profile.user.lastSeenAt)}` : ''}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.content}>
            {loading || !profile ? (
              <View style={styles.center}>
                {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#FFF" size="large" />}
              </View>
            ) : (
              <>
                {profile.user.bio ? <Text style={styles.bio} numberOfLines={2}>{profile.user.bio}</Text> : null}

                {/* Acciones */}
                {!profile.isSelf && !!session && (
                  <View style={styles.actions}>
                    {profile.friendship === 'accepted' ? (
                      <>
                        <View style={styles.friendBadge}>
                          {/* <Ionicons name="checkmark" size={14} color="#7BDD7B" /> */}
                          <Text style={styles.friendBadgeText}>{t('onlineProfile.friend')}</Text>
                        </View>
                        {friendshipId && (
                          <TouchableOpacity
                            ref={setFocusRefById('action:remove')}
                            style={[styles.btnGhost, focusId === 'action:remove' && styles.focusedRing]}
                            disabled={busy}
                            onPress={() => {
                              setFocusId('action:remove');
                              focusRunnerRef.current('action:remove');
                            }}
                          >
                            <Text style={styles.btnGhostText}>{t('onlineProfile.remove')}</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    ) : profile.friendship === 'pending' && incomingRequestId ? (
                      <>
                        <TouchableOpacity
                          ref={setFocusRefById('action:accept')}
                          style={[styles.btnPrimary, focusId === 'action:accept' && styles.focusedRing]}
                          disabled={busy}
                          onPress={() => {
                            setFocusId('action:accept');
                            focusRunnerRef.current('action:accept');
                          }}
                        >
                          <Text style={styles.btnPrimaryText}>{t('onlineProfile.accept')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          ref={setFocusRefById('action:reject')}
                          style={[styles.btnSecondary, focusId === 'action:reject' && styles.focusedRing]}
                          disabled={busy}
                          onPress={() => {
                            setFocusId('action:reject');
                            focusRunnerRef.current('action:reject');
                          }}
                        >
                          <Text style={styles.btnSecondaryText}>{t('onlineProfile.reject')}</Text>
                        </TouchableOpacity>
                      </>
                    ) : profile.friendship === 'pending' ? (
                      <View style={styles.friendBadge}>
                        {/* <Ionicons name="time-outline" size={14} color="#FFB300" /> */}
                        <Text style={[styles.friendBadgeText, { color: '#FFB300' }]}>{t('onlineProfile.pending')}</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        ref={setFocusRefById('action:add')}
                        style={[styles.btnPrimary, focusId === 'action:add' && styles.focusedRing]}
                        disabled={busy}
                        onPress={() => {
                          setFocusId('action:add');
                          focusRunnerRef.current('action:add');
                        }}
                      >
                        {/* <Ionicons name="person-add-outline" size={16} color="#ffffffff" /> */}
                        <Text style={styles.btnPrimaryText}>{t('onlineProfile.addFriend')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Pestañas */}
                <View style={styles.tabsBar}>
                  {(['overview', 'games', 'friends'] as const).map((key) => {
                    const tabId = `tab:${key}`;
                    return (
                      <TouchableOpacity
                        key={key}
                        ref={setFocusRefById(tabId)}
                        style={[styles.tabItem, tab === key && styles.tabItemActive, focusId === tabId && styles.focusedRing]}
                        onPress={() => {
                          setFocusId(tabId);
                          focusRunnerRef.current(tabId);
                        }}
                      >
                        <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                          {key === 'overview' ? t('profile.overview') : key === 'games' ? t('profile.games') : t('profile.friends')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {tab === 'overview' && (
                  <>
                    <View style={styles.statsBar}>
                      <View style={styles.statCell}>
                        <Ionicons name="time-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.statIcon} />
                        <Text style={styles.statNumber}>{formatCompactMinutes(totalMinutes)}</Text>
                        <Text style={styles.statLabel}>{t('profile.totalPlaytime')}</Text>
                      </View>
                      <View style={styles.statCell}>
                        <Ionicons name="game-controller-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.statIcon} />
                        <Text style={styles.statNumber}>{games.length}</Text>
                        <Text style={styles.statLabel}>{t('profile.gamesCount')}</Text>
                      </View>
                      <View style={[styles.statCell, styles.statCellWide]}>
                        {mostPlayed ? (
                          <>
                            {mostPlayed.coverUrl ? (
                              <Image source={{ uri: mostPlayed.coverUrl }} style={styles.statGameCover} contentFit="cover" />
                            ) : null}
                            <View style={{ flex: 1 }}>
                              <Text style={styles.statGame} numberOfLines={1}>{mostPlayed.name}</Text>
                              <Text style={styles.statLabel}>{tr('profile.topGame', 'Most played')}</Text>
                            </View>
                          </>
                        ) : (
                          <>
                            <Text style={styles.statNumber}>--</Text>
                            <Text style={styles.statLabel}>{tr('profile.topGame', 'Most played')}</Text>
                          </>
                        )}
                      </View>
                    </View>

                    {/* Vitrina estilo PSN: trofeos, más jugado y en común */}
                    <View style={styles.showcaseRow}>
                      <View
                        ref={setFocusRefById('card:trophies')}
                        style={[styles.showcaseCard, focusId === 'card:trophies' && styles.focusedRing]}
                      >
                        {trophiesState === 'loading' ? (
                          <ActivityIndicator color="#FFF" style={{ marginVertical: 12 }} />
                        ) : trophiesState !== 'ready' ? (
                          <Text style={styles.showcaseHint}>
                            {trophiesState === 'hidden'
                              ? tr('onlineProfile.trophiesHidden', 'Private trophies')
                              : tr('onlineProfile.noTrophies', 'No synced trophies')}
                          </Text>
                        ) : (
                          <>
                            <View style={styles.trophyHead}>
                              <Image source={TIER_ICONS.gold} style={styles.trophyHeadIcon} contentFit="contain" />
                              <Text style={styles.trophyTotal}>{trophyTotals.unlocked}</Text>
                              <Text style={styles.trophyPct}>{trophyPct} %</Text>
                            </View>
                            <View style={styles.trophyProgressTrack}>
                              <View style={[styles.trophyProgressFill, { width: `${trophyPct}%` }]} />
                            </View>
                            <View style={styles.trophyTiers}>
                              {(['platinum', 'gold', 'silver', 'bronze'] as const).map((tier) => (
                                <View key={tier} style={styles.trophyTier}>
                                  <Image source={TIER_ICONS[tier]} style={styles.trophyTierIcon} contentFit="contain" />
                                  <Text style={styles.trophyTierCount}>{trophyTotals[tier]}</Text>
                                </View>
                              ))}
                            </View>
                          </>
                        )}
                        <Text style={styles.showcaseLabel}>
                          {tr('onlineProfile.trophiesWon', 'Trophies won')}
                        </Text>
                      </View>

                      <View
                        ref={setFocusRefById('card:top')}
                        style={[styles.showcaseCard, focusId === 'card:top' && styles.focusedRing]}
                      >
                        {topPlayed.length === 0 ? (
                          <Text style={styles.showcaseHint}>
                            {tr('onlineProfile.noTrophies', 'No synced trophies')}
                          </Text>
                        ) : (
                          topPlayed.map((g) => (
                            <View key={g.id} style={styles.topPlayedRow}>
                              {g.coverUrl ? (
                                <Image source={{ uri: g.coverUrl }} style={styles.topPlayedCover} contentFit="cover" />
                              ) : null}
                              <Text style={styles.topPlayedName} numberOfLines={1}>{g.name}</Text>
                              <Text style={styles.topPlayedHours}>
                                {g.playtimeMinutes > 0 ? formatCompactMinutes(g.playtimeMinutes) : '--'}
                              </Text>
                            </View>
                          ))
                        )}
                        <Text style={styles.showcaseLabel}>
                          {tr('onlineProfile.mostPlayedTop', 'Most played')}
                        </Text>
                      </View>

                      <TouchableOpacity
                        ref={setFocusRefById('card:games')}
                        style={[styles.showcaseCard, focusId === 'card:games' && styles.focusedRing]}
                        activeOpacity={0.8}
                        onPress={() => {
                          focusRunnerRef.current('card:games');
                        }}
                      >
                        {libraryState !== 'ready' ? (
                          <Text style={styles.showcaseHint}>{libraryHint(t, libraryState)}</Text>
                        ) : mutualGames.length === 0 ? (
                          <Text style={styles.showcaseHint}>
                            {tr('onlineProfile.noMutualGames', 'No mutual games')}
                          </Text>
                        ) : (
                          <View style={styles.mutualPreviewRow}>
                            {mutualGames.slice(0, 3).map((g) => (
                              g.coverUrl ? (
                                <Image key={g.id} source={{ uri: g.coverUrl }} style={styles.mutualCover} contentFit="cover" />
                              ) : (
                                <View key={g.id} style={[styles.mutualCover, styles.gameCoverEmpty]}>
                                  <Ionicons name="game-controller-outline" size={16} color="rgba(255,255,255,0.4)" />
                                </View>
                              )
                            ))}
                          </View>
                        )}
                        <Text style={styles.showcaseLabel}>
                          {tr('onlineProfile.mutualGames', 'Mutual games')}
                          {libraryState === 'ready' ? `: ${mutualGames.length}` : ''}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        ref={setFocusRefById('card:friends')}
                        style={[styles.showcaseCard, focusId === 'card:friends' && styles.focusedRing]}
                        activeOpacity={0.8}
                        onPress={() => {
                          focusRunnerRef.current('card:friends');
                        }}
                      >
                        {mutualFriends.length === 0 ? (
                          <Text style={styles.showcaseHint}>
                            {profile.isSelf
                              ? t('friends.comingSoon')
                              : tr('onlineProfile.noMutualFriends', 'No mutual friends')}
                          </Text>
                        ) : (
                          <View style={styles.mutualPreviewRow}>
                            {mutualFriends.slice(0, 3).map((u) => (
                              u.avatarUrl && /^https?:\/\//i.test(u.avatarUrl) ? (
                                <Image key={u.id} source={{ uri: u.avatarUrl }} style={styles.mutualAvatar} contentFit="cover" />
                              ) : (
                                <View key={u.id} style={[styles.mutualAvatar, styles.mutualAvatarEmpty]}>
                                  <Text style={styles.mutualAvatarText}>
                                    {(u.displayName || u.username).slice(0, 1).toUpperCase()}
                                  </Text>
                                </View>
                              )
                            ))}
                          </View>
                        )}
                        <Text style={styles.showcaseLabel}>
                          {tr('onlineProfile.mutualFriends', 'Mutual friends')}
                          {profile.isSelf ? '' : `: ${mutualFriends.length}`}
                        </Text>
                      </TouchableOpacity>
                    </View>

                  </>
                )}

                {tab === 'games' && (
                  <>
                    {libraryState === 'loading' ? (
                      <ActivityIndicator color="#FFF" style={{ marginTop: 12 }} />
                    ) : libraryState !== 'ready' ? (
                      <Text style={styles.hint}>{libraryHint(t, libraryState)}</Text>
                    ) : games.length === 0 ? (
                      <Text style={styles.hint}>{t('onlineProfile.libraryEmpty')}</Text>
                    ) : (
                      <>
                        <View style={styles.gamesTabHeader}>
                          <Text style={styles.gamesTabCount}>
                            {tr('profile.allGames', 'All games')}: {games.length}
                          </Text>
                          <Text style={styles.gamesTabSort}>
                            {tr('profile.sortBy', 'Sort by')}: {tr('profile.lastPlayed', 'Last played')}
                          </Text>
                        </View>
                        {games.map((game) => (
                          <GameRow key={game.id} game={game} t={t} expanded />
                        ))}
                      </>
                    )}
                  </>
                )}

                {tab === 'friends' && (
                  <>
                    {profile.isSelf ? (
                      <Text style={styles.hint}>{t('friends.comingSoon')}</Text>
                    ) : mutualFriends.length === 0 ? (
                      <Text style={styles.hint}>{tr('onlineProfile.noMutualFriends', 'No mutual friends')}</Text>
                    ) : (
                      mutualFriends.map((u) => (
                        <View key={u.id} style={styles.gameRow}>
                          {u.avatarUrl && /^https?:\/\//i.test(u.avatarUrl) ? (
                            <Image source={{ uri: u.avatarUrl }} style={styles.mutualAvatar} contentFit="cover" />
                          ) : (
                            <View style={[styles.mutualAvatar, styles.mutualAvatarEmpty]}>
                              <Text style={styles.mutualAvatarText}>
                                {(u.displayName || u.username).slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={styles.gameName} numberOfLines={1}>{u.displayName}</Text>
                            <Text style={styles.gameSub} numberOfLines={1}>@{u.username}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </>
                )}
              </>
            )}
          </View>
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

function GameRow({
  game,
  t,
  expanded,
}: {
  game: LibraryGameView;
  t: (key: any, params?: any) => string;
  expanded?: boolean;
}) {
  if (!expanded) {
    return (
      <View style={styles.gameRow}>
        {game.coverUrl ? (
          <Image source={{ uri: game.coverUrl }} style={styles.gameCover} contentFit="cover" />
        ) : (
          <View style={[styles.gameCover, styles.gameCoverEmpty]}>
            <Ionicons name="game-controller-outline" size={22} color="rgba(255,255,255,0.4)" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.gameName} numberOfLines={1}>{game.name}</Text>
          <Text style={styles.gameSub} numberOfLines={1}>
            {[game.platform, game.playtimeMinutes > 0 ? formatPlaytime(game.playtimeMinutes, t) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>
    );
  }

  // Fila estilo PSN: portada más grande, badge de plataforma y meta alineada a la derecha.
  return (
    <View style={styles.gameRowExpanded}>
      {game.coverUrl ? (
        <Image source={{ uri: game.coverUrl }} style={styles.gameCoverLarge} contentFit="cover" />
      ) : (
        <View style={[styles.gameCoverLarge, styles.gameCoverEmpty]}>
          <Ionicons name="game-controller-outline" size={26} color="rgba(255,255,255,0.4)" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        {game.platform ? (
          <View style={styles.platformBadge}>
            <Text style={styles.platformBadgeText}>{game.platform}</Text>
          </View>
        ) : null}
        <Text style={styles.gameName} numberOfLines={1}>{game.name}</Text>
        {game.addedAt ? (
          <Text style={styles.gameSub} numberOfLines={1}>
            {tr(t, 'profile.playedAgo', 'Played')}: {formatLastSeen(t, game.addedAt)}
          </Text>
        ) : null}
      </View>
      <Text style={styles.gameHours} numberOfLines={1}>
        {tr(t, 'profile.hoursPlayed', 'Hours played')}
        {'\n'}
        <Text style={styles.gameHoursValue}>
          {game.playtimeMinutes > 0 ? formatPlaytime(game.playtimeMinutes, t) : '--'}
        </Text>
      </Text>
    </View>
  );
}

function tr(t: (key: any, params?: any) => string, key: string, fallback: string): string {
  const value = (t as any)(key);
  return !value || value === key ? fallback : value;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141414ff',
  },
  content: {
    paddingHorizontal: 94,
    paddingBottom: 28,
  },
  banner: {
    height: 320,
    backgroundColor: '#1f1f1fff',
    justifyContent: 'flex-end',
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0d0d0dff',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 10, 0.48)',
  },
  bannerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 210,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 94,
    paddingBottom: 28,
  },
  backBtn: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    opacity: 0.4
  },
  center: {
    padding: 60,
    alignItems: 'center',
  },
  error: {
    color: '#e2e2e2ff',
    fontSize: 14,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 32,
    fontFamily: 'SSTBold',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
  },
  displayName: {
    color: '#FFF',
    fontSize: 26,
    fontFamily: 'SSTLight',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginLeft: 10
  },
  username: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginLeft: 10
  },
  bio: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 14,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff0e',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  btnPrimaryText: {
    color: '#ffffffff',
    fontSize: 14,
    fontFamily: 'SSTBold',
  },
  btnSecondary: {
    backgroundColor: '#ffffff0e',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  btnSecondaryText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'SSTLight',
  },
  btnGhost: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnGhostText: {
    color: '#FF8899',
    fontSize: 13,
    fontFamily: 'SSTLight',
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  friendBadgeText: {
    color: '#d4d4d4ff',
    fontSize: 13,
    fontFamily: 'SSTLight',
  },
  tabsBar: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tabItem: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderColor: '#ffffffc2',
    borderWidth: 1,
    borderBottomColor: '#ffffffc2',
  },
  tabText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontFamily: 'SSTLight',
  },
  tabTextActive: {
    color: '#FFF',
  },
  statsBar: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  statCell: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statCellWide: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statIcon: {
    marginBottom: 6,
  },
  statGameCover: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  statNumber: {
    color: '#FFF',
    fontSize: 26,
    fontFamily: 'SSTLight',
  },
  statGame: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTMedium',
    textAlign: 'left',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  showcaseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 20,
  },
  showcaseCard: {
    flex: 1,
    minWidth: 170,
    minHeight: 210,
    backgroundColor: 'rgba(0, 0, 0, 0.51)',
    borderRadius: 0,
    padding: 16,
    gap: 10,
    justifyContent: 'space-between',
  },
  showcaseLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontFamily: 'SSTLight',
    marginTop: 4,
  },
  showcaseHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'SSTLight',
  },
  trophyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trophyTotal: {
    color: '#ffffffa6',
    fontSize: 24,
    fontFamily: 'SSTLight',
  },
  trophyPct: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginLeft: 'auto',
  },
  trophyProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  trophyProgressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4CD964',
  },
  trophyTiers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trophyTier: {
    alignItems: 'center',
    gap: 2,
  },
  trophyHeadIcon: {
    width: 26,
    height: 26,
  },
  trophyTierIcon: {
    width: 22,
    height: 22,
  },
  trophyTierCount: {
    color: '#FFF',
    fontSize: 12,
  },
  topPlayedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topPlayedCover: {
    width: 46,
    height: 46,
    borderRadius: 6,
  },
  topPlayedName: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'SSTLight',
  },
  topPlayedHours: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  mutualPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mutualCover: {
    width: 66,
    height: 88,
    borderRadius: 7,
  },
  mutualAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2e',
  },
  mutualAvatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutualAvatarText: {
    color: '#FFF',
    fontSize: 16,
  },
  focusedRing: {
    // @ts-ignore sombra web sin mover el layout
    boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
  },
  gamesTabHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 6,
  },
  gamesTabCount: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'SSTMedium',
  },
  gamesTabSort: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'SSTMedium',
    marginTop: 22,
    marginBottom: 6,
  },
  hint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 12,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  gameCover: {
    width: 62,
    height: 62,
    borderRadius: 0,
  },
  gameCoverEmpty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameName: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTLight',
  },
  gameSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
  },
  gameRowExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  gameCoverLarge: {
    width: 56,
    height: 74,
    borderRadius: 6,
  },
  platformBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  platformBadgeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontFamily: 'SSTMedium',
    letterSpacing: 0.5,
  },
  gameHours: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'right',
    lineHeight: 16,
  },
  gameHoursValue: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'SSTMedium',
  },
});