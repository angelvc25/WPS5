import { useTranslation } from '@/contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
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
import { fetchOnlineUserLibrary, type OnlineLibraryGame } from '../services/onlineLibraryService';
import { formatPlaytime } from '../services/playtimeService';
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

  // Captura Escape en fase de captura: cierra solo este perfil sin que los
  // handlers globales (búsqueda, ajustes) actúen sobre la misma tecla.
  useEffect(() => {
    if (!username || Platform.OS !== 'web') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey as any, true);
    return () => window.removeEventListener('keydown', handleKey as any, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);
  const mostPlayed = games.reduce<LibraryGameView | null>(
    (best, g) => (!best || g.playtimeMinutes > best.playtimeMinutes ? g : best),
    null,
  );
  const recentGames = games.slice(0, 5);

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
            <TouchableOpacity style={styles.backBtn} onPress={onClose}>
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
                          <Ionicons name="checkmark" size={14} color="#7BDD7B" />
                          <Text style={styles.friendBadgeText}>{t('onlineProfile.friend')}</Text>
                        </View>
                        {friendshipId && (
                          <TouchableOpacity
                            style={styles.btnGhost}
                            disabled={busy}
                            onPress={() => runAction(() => removeOnlineFriend(friendshipId))}
                          >
                            <Text style={styles.btnGhostText}>{t('onlineProfile.remove')}</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    ) : profile.friendship === 'pending' && incomingRequestId ? (
                      <>
                        <TouchableOpacity
                          style={styles.btnPrimary}
                          disabled={busy}
                          onPress={() => runAction(() => acceptOnlineFriendRequest(incomingRequestId))}
                        >
                          <Text style={styles.btnPrimaryText}>{t('onlineProfile.accept')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.btnSecondary}
                          disabled={busy}
                          onPress={() => runAction(() => rejectOnlineFriendRequest(incomingRequestId))}
                        >
                          <Text style={styles.btnSecondaryText}>{t('onlineProfile.reject')}</Text>
                        </TouchableOpacity>
                      </>
                    ) : profile.friendship === 'pending' ? (
                      <View style={styles.friendBadge}>
                        <Ionicons name="time-outline" size={14} color="#FFB300" />
                        <Text style={[styles.friendBadgeText, { color: '#FFB300' }]}>{t('onlineProfile.pending')}</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.btnPrimary}
                        disabled={busy}
                        onPress={() => runAction(() => sendOnlineFriendRequest(profile.user.id), t('friends.requestSent'))}
                      >
                        <Ionicons name="person-add-outline" size={16} color="#111" />
                        <Text style={styles.btnPrimaryText}>{t('onlineProfile.addFriend')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Pestañas */}
                <View style={styles.tabsBar}>
                  {(['overview', 'games', 'friends'] as const).map((key) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.tabItem, tab === key && styles.tabItemActive]}
                      onPress={() => setTab(key)}
                    >
                      <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                        {key === 'overview' ? t('profile.overview') : key === 'games' ? t('profile.games') : t('profile.friends')}
                      </Text>
                    </TouchableOpacity>
                  ))}
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

                    <View style={styles.recentCard}>
                      {libraryState === 'loading' ? (
                        <ActivityIndicator color="#FFF" style={{ marginVertical: 12 }} />
                      ) : libraryState !== 'ready' ? (
                        <Text style={styles.hint}>{libraryHint(t, libraryState)}</Text>
                      ) : recentGames.length === 0 ? (
                        <Text style={styles.hint}>{t('onlineProfile.libraryEmpty')}</Text>
                      ) : (
                        recentGames.map((game) => (
                          <GameRow key={game.id} game={game} t={t} />
                        ))
                      )}
                      <Text style={styles.recentCardTitle}>{t('onlineProfile.recentlyAdded')}</Text>
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
                  <Text style={styles.hint}>{t('friends.comingSoon')}</Text>
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
    paddingHorizontal: 24,
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
    height: 110,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingBottom: 18,
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
    color: '#FF8899',
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
    borderWidth: 2,
    borderColor: '#0d1015',
  },
  displayName: {
    color: '#FFF',
    fontSize: 26,
    fontFamily: 'SSTMedium',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  username: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  btnPrimaryText: {
    color: '#111',
    fontSize: 14,
    fontFamily: 'SSTBold',
  },
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  btnSecondaryText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'SSTMedium',
  },
  btnGhost: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnGhostText: {
    color: '#FF8899',
    fontSize: 13,
    fontFamily: 'SSTMedium',
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
    color: '#7BDD7B',
    fontSize: 13,
    fontFamily: 'SSTMedium',
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
    borderBottomColor: '#FFF',
  },
  tabText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontFamily: 'SSTMedium',
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
  recentCard: {
    backgroundColor: '#000000',
    borderRadius: 14,
    padding: 14,
    marginTop: 20,
  },
  recentCardTitle: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTMedium',
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
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
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  gameCoverEmpty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameName: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTMedium',
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