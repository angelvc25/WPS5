import { useTranslation } from '@/contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  fetchOnlineMe,
  getOnlineSession,
  loginOnlineAccount,
  logoutOnlineAccount,
  registerOnlineAccount,
  restoreOnlineSession,
  subscribeOnlineSession,
  syncProfileMediaToOnline,
  updateOnlineProfile,
  type OnlineSession,
} from '../services/onlineAccountService';
import { syncLocalLibraryToOnline } from '../services/onlineLibraryService';
import { toastService } from '../services/toastService';
import type { UserProfile } from './UserSelectScreen';

interface OnlineAccountCardProps {
  activeUser: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  /** Juegos locales para sincronizar la biblioteca online. */
  libraryGames?: any[];
  /** Foco de mando/teclado desde el padre (fila 0 = pestañas, 1 = acción). */
  isRightFocused?: boolean;
  subFocusIndex?: number;
}

export interface OnlineAccountCardHandle {
  /** Activa la fila enfocada por mando/teclado (0 = pestañas, 1 = acción). */
  activateRow: (index: number) => void;
  /** Cambia a la pestaña de login o registro. */
  setMode: (mode: 'login' | 'register') => void;
}

function mapAuthError(t: (key: any, params?: any) => string, error?: string): string {
  switch (error) {
    case 'Username already exists':
      return t('account.errorTaken');
    case 'Invalid username or password':
      return t('account.errorInvalid');
    case 'Password must contain between 8 and 128 characters':
    case 'Password length':
      return t('account.errorPassword');
    case 'Username must contain between 3 and 24 characters':
    case 'Username length':
      return t('account.errorUsernameLength');
    case 'Username can contain only letters, numbers and underscores':
    case 'Username charset':
      return t('account.errorUsernameChars');
    case 'Missing credentials':
      return t('account.errorMissing');
    case 'network':
      return t('account.errorNetwork');
    default:
      return error || t('account.errorGeneric');
  }
}

export const OnlineAccountCard = forwardRef<OnlineAccountCardHandle, OnlineAccountCardProps>(function OnlineAccountCard(
  { activeUser, updateUser, libraryGames = [], isRightFocused = false, subFocusIndex = -1 }: OnlineAccountCardProps,
  ref,
) {
  const { t } = useTranslation();
  const [session, setSession] = useState<OnlineSession | null>(() => getOnlineSession());
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [savingVisibility, setSavingVisibility] = useState(false);

  useEffect(() => subscribeOnlineSession(setSession), []);

  // Valida el token guardado al abrir la sección.
  useEffect(() => {
    let cancelled = false;
    setValidating(true);
    restoreOnlineSession()
      .then((restored) => {
        if (cancelled) return;
        setSession(restored);
        if (restored) syncProfileMediaToOnline(activeUser || {}).catch(() => {});
        // Sincroniza el vínculo con el perfil local.
        const linkedId = (activeUser?.settings as any)?.onlineUserId;
        if (restored && restored.user.id !== linkedId) {
          updateUser({
            settings: {
              ...activeUser?.settings,
              onlineUserId: restored.user.id,
              onlineUsername: restored.user.username,
            } as any,
          });
        } else if (!restored && linkedId) {
          updateUser({
            settings: { ...activeUser?.settings, onlineUserId: '', onlineUsername: '' } as any,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setValidating(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkedUserId = (activeUser?.settings as any)?.onlineUserId || '';
  const isLinked = !!linkedUserId && !!session && session.user.id === linkedUserId;

  useImperativeHandle(ref, () => ({
    activateRow: (index: number) => {
      if (index === 0) {
        if (isLinked) {
          handleRefresh();
        } else {
          setMode((prev) => (prev === 'login' ? 'register' : 'login'));
          setError(null);
        }
      } else if (index === 1) {
        if (isLinked) handleLogout();
        else handleSubmit();
      }
    },
    setMode: (next: 'login' | 'register') => {
      setMode(next);
      setError(null);
    },
  }));

  const handleSubmit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'login'
          ? await loginOnlineAccount(username, password)
          : await registerOnlineAccount(username, password, displayName);
      if (!result.ok || !result.session) {
        setError(mapAuthError(t, result.error));
        return;
      }
      setSession(result.session);
      syncProfileMediaToOnline(activeUser || {}).catch(() => {});
      updateUser({
        settings: {
          ...activeUser?.settings,
          onlineUserId: result.session.user.id,
          onlineUsername: result.session.user.username,
        } as any,
      });
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logoutOnlineAccount();
      setSession(null);
      updateUser({
        settings: { ...activeUser?.settings, onlineUserId: '', onlineUsername: '' } as any,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const user = await fetchOnlineMe();
      if (user) {
        const current = getOnlineSession();
        if (current) setSession({ ...current, user });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSyncLibrary = async () => {
    if (busy || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncProgress({ done: 0, total: 1 });
    try {
      const result = await syncLocalLibraryToOnline(libraryGames, (done, total) =>
        setSyncProgress({ done, total }),
      );
      setSyncResult(t('onlineLibrary.syncDone', { uploaded: result.uploaded, total: result.total }));
    } catch {
      setSyncResult(t('onlineLibrary.syncError'));
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleVisibility = async (value: 'public' | 'friends' | 'private') => {
    if (busy || syncing || savingVisibility) return;
    if (session?.user.libraryVisibility === value) return;
    setSavingVisibility(true);
    try {
      const user = await updateOnlineProfile({ libraryVisibility: value });
      setSession((prev) => (prev ? { ...prev, user } : prev));
      toastService.show(t('onlineLibrary.visibilitySaved'));
    } catch {
      toastService.show(t('onlineLibrary.visibilityError'));
    } finally {
      setSavingVisibility(false);
    }
  };

  if (validating && !session) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#FFF" />
        <Text style={styles.hint}>{t('account.validating')}</Text>
      </View>
    );
  }

  if (isLinked && session) {
    return (
      <View style={styles.card}>
        <View style={styles.linkedRow}>
          {session.user.avatarUrl && /^https?:\/\//i.test(session.user.avatarUrl) ? (
            <Image source={{ uri: session.user.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(session.user.displayName || session.user.username).slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.displayName}>{session.user.displayName}</Text>
            <Text style={styles.username}>@{session.user.username}</Text>
          </View>
          <View style={styles.onlinePill}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{t('account.online')}</Text>
          </View>
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btnSecondary, isRightFocused && subFocusIndex === 0 && styles.btnFocused]}
            onPress={handleRefresh}
            disabled={busy}
          >
            <Ionicons name="refresh" size={16} color="#FFF" />
            <Text style={styles.btnSecondaryText}>{t('account.refresh')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnDanger, isRightFocused && subFocusIndex === 1 && styles.btnFocused]}
            onPress={handleLogout}
            disabled={busy}
          >
            <Ionicons name="log-out-outline" size={16} color="#FFF" />
            <Text style={styles.btnSecondaryText}>{t('account.logout')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.libraryBox}>
          <View style={styles.libraryHead}>
            <Ionicons name="cloud-upload-outline" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={styles.libraryTitle}>{t('onlineLibrary.title')}</Text>
          </View>
          <Text style={styles.libraryDesc}>{t('onlineLibrary.visibilityLabel')}</Text>
          <View style={styles.visibilityRow}>
            {(['public', 'friends', 'private'] as const).map((value) => {
              const active = (session.user.libraryVisibility || 'friends') === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.visibilityBtn, active && styles.visibilityBtnActive]}
                  onPress={() => handleVisibility(value)}
                  disabled={savingVisibility}
                >
                  <Text style={[styles.visibilityText, active && styles.visibilityTextActive]}>
                    {t(`onlineProfile.visibility_${value}` as any)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.libraryDesc}>{t('onlineLibrary.desc')}</Text>
          <TouchableOpacity
            style={[styles.btnSecondary, styles.syncBtn, syncing && styles.btnDisabled]}
            onPress={handleSyncLibrary}
            disabled={syncing}
          >
            {syncing && syncProgress ? (
              <Text style={styles.btnSecondaryText}>
                {t('onlineLibrary.syncing', { done: syncProgress.done, total: syncProgress.total })}
              </Text>
            ) : (
              <>
                <Ionicons name="sync" size={16} color="#FFF" />
                <Text style={styles.btnSecondaryText}>{t('onlineLibrary.syncNow')}</Text>
              </>
            )}
          </TouchableOpacity>
          {syncResult ? <Text style={styles.syncResult}>{syncResult}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={[styles.tabs, isRightFocused && subFocusIndex === 0 && styles.tabsFocused]}>
        {(['login', 'register'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, mode === tab && styles.tabActive]}
            onPress={() => {
              setMode(tab);
              setError(null);
            }}
          >
            <Text style={[styles.tabText, mode === tab && styles.tabTextActive]}>
              {tab === 'login' ? t('account.login') : t('account.register')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('account.username')}</Text>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={(v) => setUsername(v.toLowerCase().replace(/\s+/g, ''))}
        placeholder="player_1"
        placeholderTextColor="rgba(255,255,255,0.3)"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={24}
      />

      <Text style={styles.label}>{t('account.password')}</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        placeholderTextColor="rgba(255,255,255,0.3)"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={128}
      />

      {mode === 'register' && (
        <>
          <Text style={styles.label}>{t('account.displayName')}</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={(v) => setDisplayName(v.slice(0, 50))}
            placeholder={t('account.displayNamePlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.3)"
            maxLength={50}
          />
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.btnPrimary, isRightFocused && subFocusIndex === 1 && styles.btnFocused, busy && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text style={styles.btnPrimaryText}>
            {mode === 'login' ? t('account.loginButton') : t('account.registerButton')}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>{t('account.hint')}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 18,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    padding: 4,
    marginBottom: 16,
  },
  tabsFocused: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  tab: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontFamily: 'SSTMedium',
  },
  tabTextActive: {
    color: '#FFF',
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'SSTMedium',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#FFF',
    fontSize: 15,
  },
  error: {
    color: '#FF8899',
    fontSize: 13,
    marginTop: 12,
  },
  btnPrimary: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 16,
  },
  btnPrimaryText: {
    color: '#111',
    fontSize: 15,
    fontFamily: 'SSTBold',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnFocused: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 20,
    fontFamily: 'SSTBold',
  },
  displayName: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'SSTMedium',
  },
  username: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  onlineText: {
    color: '#7BDD7B',
    fontSize: 12,
    fontFamily: 'SSTMedium',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingVertical: 10,
  },
  btnSecondaryText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'SSTMedium',
  },
  btnDanger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3D1E24',
    borderRadius: 20,
    paddingVertical: 10,
  },
  libraryBox: {
    marginTop: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  libraryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  libraryTitle: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'SSTMedium',
    flex: 1,
  },
  libraryVisibility: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  visibilityBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  visibilityBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  visibilityText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontFamily: 'SSTMedium',
  },
  visibilityTextActive: {
    color: '#FFF',
  },
  libraryDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  syncBtn: {
    justifyContent: 'center',
  },
  syncResult: {
    color: '#7BDD7B',
    fontSize: 12,
    textAlign: 'center',
  },
});
