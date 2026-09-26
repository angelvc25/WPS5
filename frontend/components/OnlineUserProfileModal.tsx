import { useTranslation } from '@/contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { toastService } from '../services/toastService';

interface OnlineUserProfileModalProps {
  username: string | null;
  onClose: () => void;
  onChanged?: () => void;
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

function formatMemberSince(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export const OnlineUserProfileModal = ({ username, onClose, onChanged }: OnlineUserProfileModalProps) => {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const [profile, setProfile] = useState<UserProfileResult | null>(null);
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [tab, setTab] = useState<'general' | 'games'>('general');
  const [library, setLibrary] = useState<OnlineLibraryGame[] | null>(null);
  const [libraryState, setLibraryState] = useState<'idle' | 'loading' | 'hidden-private' | 'hidden-friends' | 'error' | 'ready'>('idle');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfile(null);
    setLibrary(null);
    setLibraryState('idle');
    setTab('general');
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
        } else {
          setFriendshipId(null);
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

  useEffect(() => {
    if (!username || tab !== 'games' || !profile || libraryState !== 'idle') return;
    let cancelled = false;
    setLibraryState('loading');
    fetchOnlineUserLibrary(profile.user.id)
      .then((res) => {
        if (cancelled) return;
        if (!res.visible) {
          setLibraryState(res.reason === 'private' ? 'hidden-private' : 'hidden-friends');
          return;
        }
        setLibrary(res.library);
        setLibraryState('ready');
      })
      .catch(() => {
        if (!cancelled) setLibraryState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, profile?.user?.id]);

  const reloadProfile = async () => {
    if (!username) return;
    try {
      const prof = await fetchOnlineUserProfile(username);
      setProfile(prof);
      if (prof.friendship !== 'accepted') setFriendshipId(null);
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
      const msg = e?.message;
      toastService.show(
        e?.status === 409 ? t('friends.alreadyRelated') : msg === 'network' ? t('friends.errorNetwork') : t('friends.errorGeneric'),
      );
    } finally {
      setBusy(false);
    }
  };

  const session = getOnlineSession();
  const isSelf = !!profile?.isSelf;

  return (
    <Modal visible={!!username} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.box, { width: Math.min(windowWidth * 0.72, 860), maxHeight: '88%' }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {profile ? `@${profile.user.username}` : t('onlineProfile.title')}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>

          {loading || !profile ? (
            <View style={styles.center}>
              {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#FFF" />}
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 22 }}>
              <View style={styles.userRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(profile.user.displayName || profile.user.username).slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.displayName}>{profile.user.displayName}</Text>
                  <Text style={styles.username}>
                    @{profile.user.username}
                    {profile.user.lastSeenAt ? ` · ${t('onlineProfile.lastSeen')} ${formatLastSeen(t, profile.user.lastSeenAt)}` : ''}
                  </Text>
                  {profile.user.bio ? <Text style={styles.bio} numberOfLines={3}>{profile.user.bio}</Text> : null}
                </View>
              </View>

              {!isSelf && !!session && (
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
                          <Ionicons name="trash-outline" size={15} color="#FF8899" />
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
                      onPress={() =>
                        runAction(() => sendOnlineFriendRequest(profile.user.id), t('friends.requestSent'))
                      }
                    >
                      <Ionicons name="person-add-outline" size={16} color="#111" />
                      <Text style={styles.btnPrimaryText}>{t('onlineProfile.addFriend')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={styles.tabs}>
                {(['general', 'games'] as const).map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.tab, tab === key && styles.tabActive]}
                    onPress={() => setTab(key)}
                  >
                    <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                      {key === 'general' ? t('profile.overview') : t('profile.games')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {tab === 'general' ? (
                <View style={styles.infoBox}>
                  <InfoRow label={t('onlineProfile.memberSince')} value={formatMemberSince(profile.user.createdAt)} />
                  <InfoRow
                    label={t('onlineProfile.lastSeen')}
                    value={profile.user.lastSeenAt ? formatLastSeen(t, profile.user.lastSeenAt) : '—'}
                  />
                  <InfoRow
                    label={t('onlineProfile.libraryVisibility')}
                    value={t(`onlineProfile.visibility_${profile.user.libraryVisibility}` as any)}
                  />
                  {profile.user.bio ? <InfoRow label={t('profile.about')} value={profile.user.bio} /> : null}
                </View>
              ) : (
                <View>
                  {libraryState === 'loading' || libraryState === 'idle' ? (
                    <ActivityIndicator color="#FFF" style={{ marginTop: 16 }} />
                  ) : libraryState === 'hidden-private' ? (
                    <Text style={styles.hint}>{t('onlineProfile.libraryPrivate')}</Text>
                  ) : libraryState === 'hidden-friends' ? (
                    <Text style={styles.hint}>{t('onlineProfile.libraryFriendsOnly')}</Text>
                  ) : libraryState === 'error' ? (
                    <Text style={styles.hint}>{t('onlineProfile.errorLoad')}</Text>
                  ) : (library || []).length === 0 ? (
                    <Text style={styles.hint}>{t('onlineProfile.libraryEmpty')}</Text>
                  ) : (
                    (library || []).map((game) => (
                      <View key={game.id} style={styles.gameRow}>
                        {game.cover_url ? (
                          <Image source={{ uri: game.cover_url }} style={styles.gameCover} contentFit="cover" />
                        ) : (
                          <View style={[styles.gameCover, styles.gameCoverEmpty]}>
                            <Ionicons name="game-controller-outline" size={20} color="rgba(255,255,255,0.4)" />
                          </View>
                        )}
                        <Text style={styles.gameName} numberOfLines={1}>{game.game_name}</Text>
                      </View>
                    ))
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    backgroundColor: '#16181d',
    borderRadius: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'SSTMedium',
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  center: {
    padding: 40,
    alignItems: 'center',
  },
  error: {
    color: '#FF8899',
    fontSize: 14,
  },
  userRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 26,
    fontFamily: 'SSTBold',
  },
  displayName: {
    color: '#FFF',
    fontSize: 20,
    fontFamily: 'SSTMedium',
  },
  username: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    marginTop: 2,
  },
  bio: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontFamily: 'SSTMedium',
  },
  tabTextActive: {
    color: '#FFF',
  },
  infoBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  infoValue: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'SSTMedium',
    textAlign: 'right',
    flex: 1,
  },
  hint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  gameCover: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  gameCoverEmpty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameName: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'SSTMedium',
    flex: 1,
  },
});
