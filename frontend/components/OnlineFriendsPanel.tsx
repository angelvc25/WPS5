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

export interface FriendsGridInfo {
  count: number;
  columns: number;
  usernames: string[];
}

export interface OnlineFriendsPanelProps {
  hideSearch?: boolean;
  onSelectUser?: (username: string) => void;
  refreshSignal?: number;
  /** Índice de la tarjeta con el foco de mando/teclado (null = ninguna). */
  focusedIndex?: number | null;
  /** Tocar/clic en una tarjeta la enfoca (para compartir estado con el mando). */
  onFocusItem?: (index: number) => void;
  /** Registra el ref de cada tarjeta para que el padre haga scroll hasta ella. */
  registerItemRef?: (index: number) => (el: any) => void;
  /** Informa al padre de cuántas tarjetas hay y cuántas columnas se ven. */
  onGridChange?: (info: FriendsGridInfo) => void;
}

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

function FriendCard({
  user,
  lastSeen,
  avatarSize,
  focused,
  onPress,
  onRemove,
  removing,
  itemRef,
}: {
  user: OnlineUser;
  lastSeen?: string | null;
  avatarSize: number;
  focused?: boolean;
  onPress?: () => void;
  onRemove: () => void;
  removing?: boolean;
  itemRef?: (el: any) => void;
}) {
  const { t } = useTranslation();
  // Si la clave aún no existe en translations.ts, t() devuelve la clave: se usa el respaldo.
  const tr = (key: string, fallback: string): string => {
    const v = (t as any)(key);
    return !v || v === key ? fallback : v;
  };
  const avatarStyle = { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 };
  return (

    <TouchableOpacity
      ref={itemRef as any}
      style={[styles.gridCard, focused && styles.gridCardFocused]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      {user.avatarUrl && /^https?:\/\//i.test(user.avatarUrl) ? (
        <Image source={{ uri: user.avatarUrl }} style={[styles.gridAvatar, avatarStyle]} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.gridAvatar, avatarStyle]}>
          <Text style={[styles.avatarText, { fontSize: avatarSize * 0.4 }]}>
            {(user.displayName || user.username).slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.gridBadge}>
        <Text style={styles.gridBadgeText}>{tr('friends.friendLabel', 'Friend')}</Text>
      </View>
      <Text style={styles.gridName} numberOfLines={1}>{user.displayName}</Text>
      <Text style={styles.gridSub} numberOfLines={1}>
        {lastSeen ? `${tr('friends.lastSeen', 'Last online')} ${lastSeen}` : `@${user.username}`}
      </Text>
      <TouchableOpacity
        style={styles.gridRemove}
        disabled={removing}
        onPress={onRemove}
        hitSlop={8}
      >
        <Ionicons name="trash-outline" size={15} color="#FF8899" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const GRID_GAP = 12;
const GRID_MIN_CARD = 220;

export const OnlineFriendsPanel = forwardRef<OnlineFriendsPanelHandle, OnlineFriendsPanelProps>(
  function OnlineFriendsPanel({
    hideSearch = false,
    onSelectUser,
    refreshSignal = 0,
    focusedIndex = null,
    onFocusItem,
    registerItemRef,
    onGridChange,
  }, ref) {
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
    const [gridWidth, setGridWidth] = useState(0);
    const gridColumns = gridWidth > 0
      ? Math.max(2, Math.floor((gridWidth + GRID_GAP) / (GRID_MIN_CARD + GRID_GAP)))
      : 1;
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

    // Avisa al padre de la forma del grid para que la navegación con mando sepa
    // cuántas columnas hay al subir/bajar.
    useEffect(() => {
      onGridChange?.({
        count: friends.length,
        columns: gridColumns,
        usernames: friends.map((f) => f.user.username),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [friends, gridColumns]);

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
            <View
              style={styles.grid}
              onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
            >
              {gridWidth > 0 &&
                friends.map((f, index) => {
                  const cardW = (gridWidth - GRID_GAP * (gridColumns - 1)) / gridColumns;
                  return (
                    <View key={f.friendshipId} style={{ width: Math.floor(cardW) }}>
                      <FriendCard
                        user={f.user}
                        lastSeen={formatLastSeen(t, f.user.lastSeenAt)}
                        avatarSize={Math.min(130, Math.floor(cardW * 0.45))}
                        focused={focusedIndex === index}
                        itemRef={registerItemRef?.(index)}
                        onPress={() => {
                          onFocusItem?.(index);
                          onSelectUser?.(f.user.username);
                        }}
                        removing={busyId === f.friendshipId}
                        onRemove={() => runAction(f.friendshipId, () => removeOnlineFriend(f.friendshipId))}
                      />
                    </View>
                  );
                })}
            </View>
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
    fontFamily: 'SSTLight',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'SSTLight',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 20,
    paddingHorizontal: 14,
    gap: 6,
  },
  gridCardFocused: {
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  gridAvatar: {
    alignSelf: 'center',
    marginBottom: 14,
  },
  gridBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  gridBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: 'SSTMedium',
  },
  gridName: {
    color: '#FFF',
    fontSize: 17,
    fontFamily: 'SSTLight',
    maxWidth: '100%',
  },
  gridSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    maxWidth: '100%',
  },
  gridRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    padding: 4,
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