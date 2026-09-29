import { useTranslation } from '@/contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getOnlineSession, subscribeOnlineSession } from '../services/onlineAccountService';
import {
  fetchOnlineFriendRequests,
  fetchOnlineFriends,
  removeOnlineFriend,
  searchOnlineUsers,
  type FriendItem,
  type FriendRequestItem,
} from '../services/onlineFriendsService';
import {
  acceptFriendRequestTracked,
  rejectFriendRequestTracked,
  sendFriendRequestTracked,
  subscribeFriendUpdates,
} from '../services/onlineFriendWatcher';
import type { OnlineUser } from '../services/onlineAccountService';
import { toastService } from '../services/toastService';

export interface OnlineFriendsPanelHandle {
  refresh: () => void;
  focusSearch: () => void;
}

function formatLastSeen(
  t: (key: any, params?: any) => string,
  iso: string | null,
): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const absSec = Math.abs(Math.round((ms - Date.now()) / 1000));
  if (absSec < 60) return t('common.justNow');
  if (absSec < 3600) return `${Math.floor(absSec / 60)} ${t('common.minutesAgo')}`;
  if (absSec < 86400) return `${Math.floor(absSec / 3600)} ${t('common.hoursAgo')}`;
  return `${Math.floor(absSec / 86400)} ${t('common.daysAgo')}`;
}

function UserRow({
  user,
  subtitle,
  action,
  onPress,
}: {
  user: OnlineUser;
  subtitle?: string;
  action?: React.ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <>
      {user.avatarUrl && /^https?:\/\//i.test(user.avatarUrl) ? (
        <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user.displayName || user.username).slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{user.displayName}</Text>
        <Text style={styles.sub}>@{user.username}{subtitle ? ` · ${subtitle}` : ''}</Text>
      </View>
      {action}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress}>
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={styles.row}>{body}</View>;
}

export const OnlineFriendsPanel = forwardRef<OnlineFriendsPanelHandle, { hideSearch?: boolean; onSelectUser?: (username: string) => void; refreshSignal?: number }>(
  function OnlineFriendsPanel({ hideSearch = false, onSelectUser, refreshSignal = 0 }, ref) {
  const { t } = useTranslation();
  const [hasSession, setHasSession] = useState(() => !!getOnlineSession());
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<FriendRequestItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const searchInputRef = useRef<any>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = async () => {
    const session = getOnlineSession();
    setHasSession(!!session);
    if (!session) {
      setFriends([]);
      setRequests([]);
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const [f, r] = await Promise.all([fetchOnlineFriends(), fetchOnlineFriendRequests()]);
      setFriends(f);
      setRequests(r);
    } catch (error: any) {
      setNotice(error?.message === 'network' ? t('friends.errorNetwork') : t('friends.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    return subscribeOnlineSession((session) => {
      setHasSession(!!session);
      if (session) reload();
      else {
        setFriends([]);
        setRequests([]);
        setResults([]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshSignal > 0) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // Recarga si una solicitud se resuelve desde otro lugar (card de notificaciones).
  useEffect(() => subscribeFriendUpdates(() => {
    if (getOnlineSession()) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        setResults(await searchOnlineUsers(q));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  useImperativeHandle(ref, () => ({
    refresh: () => {
      reload();
    },
    focusSearch: () => {
      searchInputRef.current?.focus?.();
    },
  }));

  const runAction = async (id: string, fn: () => Promise<void>, done?: () => void) => {
    setBusyId(id);
    setNotice(null);
    try {
      await fn();
      if (done) done();
      await reload();
    } catch (error: any) {
      const msg = error?.message;
      if (error?.status === 409) setNotice(t('friends.alreadyRelated'));
      else if (msg === 'network') setNotice(t('friends.errorNetwork'));
      else setNotice(msg || t('friends.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  if (!hasSession) {
    return (
      <View style={styles.card}>
        <Ionicons name="people-outline" size={28} color="rgba(255,255,255,0.5)" />
        <Text style={styles.empty}>{t('friends.needAccount')}</Text>
        <Text style={styles.hint}>{t('friends.needAccountHint')}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {requests.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {t('friends.requests')} ({requests.length})
          </Text>
          {requests.map((req) => (
            <UserRow
              key={req.id}
              user={req.user}
              onPress={onSelectUser ? () => onSelectUser(req.user.username) : undefined}
              action={
                <View style={styles.inlineBtns}>
                  <TouchableOpacity
                    style={styles.btnAccept}
                    disabled={busyId === req.id}
                    onPress={() => runAction(req.id, () => acceptFriendRequestTracked(req.id))}
                  >
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnReject}
                    disabled={busyId === req.id}
                    onPress={() => runAction(req.id, () => rejectFriendRequestTracked(req.id))}
                  >
                    <Ionicons name="close" size={16} color="#FFF" />
                  </TouchableOpacity>
                </View>
              }
            />
          ))}
        </View>
      )}

      {!hideSearch && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('friends.search')}</Text>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.5)" />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('friends.searchPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
          />
          {searching && <ActivityIndicator size="small" color="#FFF" />}
        </View>
        {results.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            onPress={onSelectUser ? () => onSelectUser(user.username) : undefined}
            action={
              <TouchableOpacity
                style={styles.btnAdd}
                disabled={busyId === user.id}
                onPress={() =>
                  runAction(user.id, () => sendFriendRequestTracked(user.id), () => {
                    setResults((prev) => prev.filter((u) => u.id !== user.id));
                    toastService.show(t('friends.requestSent'));
                  })
                }
              >
                <Ionicons name="person-add-outline" size={16} color="#FFF" />
                <Text style={styles.btnAddText}>{t('friends.add')}</Text>
              </TouchableOpacity>
            }
          />
        ))}
        {query.trim().length >= 2 && !searching && results.length === 0 && (
          <Text style={styles.hint}>{t('friends.noResults')}</Text>
        )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          {t('friends.myFriends')} ({friends.length})
        </Text>
        {loading && friends.length === 0 ? (
          <ActivityIndicator color="#FFF" />
        ) : friends.length === 0 ? (
          <Text style={styles.hint}>{t('friends.empty')}</Text>
        ) : (
          friends.map((f) => (
            <UserRow
              key={f.friendshipId}
              user={f.user}
              subtitle={formatLastSeen(t, f.user.lastSeenAt) || undefined}
              onPress={onSelectUser ? () => onSelectUser(f.user.username) : undefined}
              action={
                <TouchableOpacity
                  style={styles.btnRemove}
                  disabled={busyId === f.friendshipId}
                  onPress={() => runAction(f.friendshipId, () => removeOnlineFriend(f.friendshipId))}
                >
                  <Ionicons name="trash-outline" size={15} color="#FF8899" />
                </TouchableOpacity>
              }
            />
          ))
        )}
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'stretch',
    gap: 6,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTMedium',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'SSTBold',
  },
  name: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'SSTMedium',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
    paddingVertical: 10,
  },
  inlineBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  btnAccept: {
    backgroundColor: '#1DB954',
    borderRadius: 16,
    padding: 8,
  },
  btnReject: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 8,
  },
  btnAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  btnAddText: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'SSTMedium',
  },
  btnRemove: {
    padding: 8,
  },
  empty: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTMedium',
    marginTop: 10,
    textAlign: 'center',
  },
  hint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  notice: {
    color: '#FFB300',
    fontSize: 13,
    textAlign: 'center',
  },
});
