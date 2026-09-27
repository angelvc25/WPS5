import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/contexts/LanguageContext';
import { soundService } from '../services/soundService';
import { toastService } from '../services/toastService';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';
import {
  fetchOnlineMe,
  getOnlineSession,
  loginOnlineAccount,
  logoutOnlineAccount,
  registerOnlineAccount,
  restoreOnlineSession,
  subscribeOnlineSession,
  updateOnlineProfile,
  type OnlineSession,
} from '../services/onlineAccountService';
import { syncLocalLibraryToOnline } from '../services/onlineLibraryService';
import type { UserProfile } from './UserSelectScreen';

export interface OnlineAuthViewProps {
  activeUser: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  libraryGames?: any[];
  onBack: () => void;
  onSuccess?: () => void;
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

/**
 * Logotipo oficial vectorial de PlayStation
 */
function PlayStationVectorLogo({ size = 32 }: { size?: number }) {
  if (Platform.OS === 'web') {
    return (
      <svg
        viewBox="0 0 100 80"
        width={size * 1.25}
        height={size}
        fill="#FFFFFF"
        style={{ flexShrink: 0 }}
      >
        <path d="M54.7 1.2c-1.5-.5-3.3-.4-4.8.2-12.2 4.9-19.1 16.9-20.2 29.8v27.2l12.7 4.1.1-23.7c.3-7.8 4-13.6 11.8-15.4 6.7-1.5 12.3.9 14.1 7.2 1.6 5.8-1.5 12.4-7.4 14.6l-5.6 1.8 12.7 4.1 6.5-2.1c8.9-3.2 14.4-11.8 12.6-21.2-1.7-9.3-9.5-16.1-19.5-17.5-3.7-.5-7.3-.2-10.7 1V1.2zM21.2 56.4L1.4 62.8c7.4 2.4 15.3 3.6 23.3 3.6 14.9 0 27.7-4.1 36.9-11.7l-9.8-3.2c-7.3 5.4-17 7.7-27.4 5.9-1.5-.3-2.9-.6-4.4-1zM98.6 62.8l-19.8-6.4c-1.5.4-2.9.7-4.4 1-10.4 1.8-20.1-.5-27.4-5.9l-9.8 3.2c9.2 7.6 22 11.7 36.9 11.7 8 0 15.9-1.2 23.3-3.6z" />
      </svg>
    );
  }
  return <Ionicons name="logo-playstation" size={size} color="#FFFFFF" />;
}

export default function OnlineAuthView({
  activeUser,
  updateUser,
  libraryGames = [],
  onBack,
  onSuccess,
}: OnlineAuthViewProps) {
  const { t } = useTranslation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scale = useMemo(
    () => Math.min(Math.max(Math.min(windowWidth / 1920, windowHeight / 1080), 0.6), 1.25),
    [windowWidth, windowHeight]
  );
  const s = (v: number) => Math.round(v * scale);

  const [session, setSession] = useState<OnlineSession | null>(() => getOnlineSession());
  const [validating, setValidating] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus navigation state
  // 0: username input, 1: password input, 2: displayName (register only), 3: submit button,
  // 4: code button, 5: create/toggle button, 6: play offline button
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Modals
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);

  // Connected state actions
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [savingVisibility, setSavingVisibility] = useState(false);

  // Input refs
  const usernameInputRef = useRef<TextInput | null>(null);
  const passwordInputRef = useRef<TextInput | null>(null);
  const displayNameInputRef = useRef<TextInput | null>(null);

  // Listen to session changes
  useEffect(() => subscribeOnlineSession(setSession), []);

  // Validate saved session
  useEffect(() => {
    let cancelled = false;
    setValidating(true);
    restoreOnlineSession()
      .then((restored) => {
        if (cancelled) return;
        setSession(restored);
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
  }, []);

  const linkedUserId = (activeUser?.settings as any)?.onlineUserId || '';
  const isLinked = !!linkedUserId && !!session && session.user.id === linkedUserId;

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as any).isContentEditable);

      // Escape / B to go back
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        if (showHelpModal) {
          setShowHelpModal(false);
          soundService.playBack?.();
          return;
        }
        if (showCodeModal) {
          setShowCodeModal(false);
          soundService.playBack?.();
          return;
        }
        if (!isInput) {
          e.preventDefault();
          soundService.playBack?.();
          onBack();
          return;
        }
      }

      // Triangle for help
      if ((e.key === 't' || e.key === 'T') && !isInput) {
        e.preventDefault();
        setShowHelpModal((prev) => !prev);
        soundService.playActivation?.();
        return;
      }

      if (isInput) {
        if (e.key === 'Enter') {
          // If in username, jump to password
          if (target === (usernameInputRef.current as any)) {
            passwordInputRef.current?.focus();
            setFocusedIndex(1);
          } else if (target === (passwordInputRef.current as any)) {
            if (mode === 'register') {
              displayNameInputRef.current?.focus();
              setFocusedIndex(2);
            } else {
              handleSubmit();
            }
          } else if (target === (displayNameInputRef.current as any)) {
            handleSubmit();
          }
        }
        return;
      }

      if (showHelpModal || showCodeModal) {
        if (e.key === 'Enter') {
          setShowHelpModal(false);
          setShowCodeModal(false);
          soundService.playActivation?.();
        }
        return;
      }

      if (isLinked) return;

      const maxFocus = mode === 'register' ? 6 : 5;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = Math.min(prev + 1, maxFocus);
          soundService.playNavigation?.();
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          soundService.playNavigation?.();
          return next;
        });
      } else if (e.key === 'ArrowRight') {
        if (focusedIndex >= (mode === 'register' ? 4 : 3)) {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, maxFocus));
          soundService.playNavigation?.();
        }
      } else if (e.key === 'ArrowLeft') {
        if (focusedIndex >= (mode === 'register' ? 4 : 3)) {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, mode === 'register' ? 4 : 3));
          soundService.playNavigation?.();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        soundService.playActivation?.();
        const submitIdx = mode === 'register' ? 3 : 2;
        const codeIdx = mode === 'register' ? 4 : 3;
        const toggleIdx = mode === 'register' ? 5 : 4;
        const offlineIdx = mode === 'register' ? 6 : 5;

        if (focusedIndex === 0) {
          usernameInputRef.current?.focus();
        } else if (focusedIndex === 1) {
          passwordInputRef.current?.focus();
        } else if (mode === 'register' && focusedIndex === 2) {
          displayNameInputRef.current?.focus();
        } else if (focusedIndex === submitIdx) {
          handleSubmit();
        } else if (focusedIndex === codeIdx) {
          setShowCodeModal(true);
        } else if (focusedIndex === toggleIdx) {
          setMode((m) => (m === 'login' ? 'register' : 'login'));
          setError(null);
        } else if (focusedIndex === offlineIdx) {
          onBack();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, focusedIndex, isLinked, showHelpModal, showCodeModal, username, password, displayName, busy]);

  const handleSubmit = async () => {
    if (busy) return;
    if (!username.trim() || !password) {
      setError(t('account.errorMissing'));
      soundService.playBack?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'login'
          ? await loginOnlineAccount(username, password)
          : await registerOnlineAccount(username, password, displayName);

      if (!result.ok || !result.session) {
        setError(mapAuthError(t, result.error));
        soundService.playBack?.();
        return;
      }

      setSession(result.session);
      updateUser({
        settings: {
          ...activeUser?.settings,
          onlineUserId: result.session.user.id,
          onlineUsername: result.session.user.username,
        } as any,
      });
      setPassword('');
      soundService.playActivation?.();
      toastService.show(t('account.online'));
      if (onSuccess) onSuccess();
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
      soundService.playBack?.();
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
      soundService.playActivation?.();
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
        setSyncProgress({ done, total })
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

  const submitButtonIndex = mode === 'register' ? 3 : 2;
  const codeButtonIndex = mode === 'register' ? 4 : 3;
  const toggleButtonIndex = mode === 'register' ? 5 : 4;
  const offlineButtonIndex = mode === 'register' ? 6 : 5;

  // Estilos web-only para TextInput (outlineStyle y transition no son válidos en StyleSheet.create)
  const webInputStyle: any = Platform.OS === 'web'
    ? { outlineStyle: 'none', transition: 'border-color 0.2s ease, box-shadow 0.2s ease' }
    : {};
  const webInputFocusedStyle: any = Platform.OS === 'web'
    ? { boxShadow: '0 0 16px rgba(255, 255, 255, 0.35)' }
    : {};

  return (
    <View style={styles.container}>
      {/* Atmósfera PS5: rayo de luz suave desde la esquina superior izquierda */}
      {Platform.OS === 'web' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: `
              radial-gradient(ellipse 65% 55% at 18% 0%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 40%, transparent 70%),
              linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.01) 30%, transparent 60%)
            `,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {/* HEADER SUPERIOR */}
      <View style={[styles.header, { height: s(72), paddingHorizontal: s(48) }]}>
        <TouchableOpacity
          style={[styles.backButton, { width: s(40), height: s(40), borderRadius: s(20) }]}
          onPress={() => {
            soundService.playBack?.();
            onBack();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={s(22)} color="#FFF" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: s(26) }]}>
          {isLinked
            ? t('settings.onlineAccount')
            : mode === 'login'
            ? t('account.manualLoginTitle')
            : t('account.createAccount')}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: s(48), paddingBottom: s(50) }]}
      >
        {/* VALIDANDO SESION INICIAL */}
        {validating && !session && (
          <View style={[styles.validatingBox, { padding: s(40) }]}>
            <ActivityIndicator size="large" color="#FFF" />
            <Text style={[styles.validatingText, { fontSize: s(15), marginTop: s(16) }]}>
              {t('account.validating')}
            </Text>
          </View>
        )}

        {/* CASO: USUARIO YA CONECTADO ONLINE */}
        {isLinked && session && !validating && (
          <View style={[styles.linkedWrapper, { maxWidth: s(900), marginTop: s(20) }]}>
            <View style={[styles.linkedCard, { padding: s(28), borderRadius: s(14) }]}>
              <View style={[styles.linkedRow, { gap: s(18) }]}>
                <View style={[styles.avatar, { width: s(64), height: s(64), borderRadius: s(32) }]}>
                  <Text style={[styles.avatarText, { fontSize: s(26) }]}>
                    {(session.user.displayName || session.user.username).slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.displayName, { fontSize: s(22) }]}>{session.user.displayName}</Text>
                  <Text style={[styles.username, { fontSize: s(15) }]}>@{session.user.username}</Text>
                </View>
                <View style={[styles.onlinePill, { paddingHorizontal: s(12), paddingVertical: s(6), borderRadius: s(12) }]}>
                  <View style={[styles.onlineDot, { width: s(8), height: s(8), borderRadius: s(4) }]} />
                  <Text style={[styles.onlineText, { fontSize: s(13) }]}>{t('account.online')}</Text>
                </View>
              </View>

              <View style={[styles.btnRow, { gap: s(14), marginTop: s(24) }]}>
                <TouchableOpacity
                  style={[styles.btnSecondary, { paddingHorizontal: s(20), paddingVertical: s(10), borderRadius: s(20) }]}
                  onPress={handleRefresh}
                  disabled={busy}
                >
                  <Ionicons name="refresh" size={s(16)} color="#FFF" style={{ marginRight: s(8) }} />
                  <Text style={[styles.btnSecondaryText, { fontSize: s(14) }]}>{t('account.refresh')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnDanger, { paddingHorizontal: s(20), paddingVertical: s(10), borderRadius: s(20) }]}
                  onPress={handleLogout}
                  disabled={busy}
                >
                  <Ionicons name="log-out-outline" size={s(16)} color="#FF5252" style={{ marginRight: s(8) }} />
                  <Text style={[styles.btnDangerText, { fontSize: s(14) }]}>{t('account.logout')}</Text>
                </TouchableOpacity>
              </View>

              {/* SINCRONIZACION DE BIBLIOTECA */}
              <View style={[styles.libraryBox, { marginTop: s(24), padding: s(20), borderRadius: s(10) }]}>
                <View style={[styles.libraryHead, { gap: s(8), marginBottom: s(8) }]}>
                  <Ionicons name="cloud-upload-outline" size={s(18)} color="rgba(255,255,255,0.8)" />
                  <Text style={[styles.libraryTitle, { fontSize: s(16) }]}>{t('onlineLibrary.title')}</Text>
                </View>
                <Text style={[styles.libraryDesc, { fontSize: s(13), marginBottom: s(12) }]}>
                  {t('onlineLibrary.visibilityLabel')}
                </Text>
                <View style={[styles.visibilityRow, { gap: s(10), marginBottom: s(16) }]}>
                  {(['public', 'friends', 'private'] as const).map((value) => {
                    const active = (session.user.libraryVisibility || 'friends') === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.visibilityBtn,
                          { paddingHorizontal: s(16), paddingVertical: s(8), borderRadius: s(16) },
                          active && styles.visibilityBtnActive,
                        ]}
                        onPress={() => handleVisibility(value)}
                        disabled={savingVisibility}
                      >
                        <Text style={[styles.visibilityText, { fontSize: s(13) }, active && styles.visibilityTextActive]}>
                          {t(`onlineProfile.visibility_${value}` as any)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[
                    styles.btnSecondary,
                    { paddingHorizontal: s(20), paddingVertical: s(10), borderRadius: s(20) },
                    syncing && styles.btnDisabled,
                  ]}
                  onPress={handleSyncLibrary}
                  disabled={syncing}
                >
                  {syncing && syncProgress ? (
                    <Text style={[styles.btnSecondaryText, { fontSize: s(14) }]}>
                      {t('onlineLibrary.syncing', { done: syncProgress.done, total: syncProgress.total })}
                    </Text>
                  ) : (
                    <>
                      <Ionicons name="sync" size={s(16)} color="#FFF" style={{ marginRight: s(8) }} />
                      <Text style={[styles.btnSecondaryText, { fontSize: s(14) }]}>{t('onlineLibrary.syncNow')}</Text>
                    </>
                  )}
                </TouchableOpacity>
                {syncResult && <Text style={[styles.syncResult, { fontSize: s(13), marginTop: s(10) }]}>{syncResult}</Text>}
              </View>
            </View>
          </View>
        )}

        {/* CASO: LOGIN / REGISTRO MANUAL CON EL DISENO PS5 EXACTO */}
        {!isLinked && !validating && (
          <View style={[styles.authMainContainer, { marginTop: s(28) }]}>
            {/* DOS COLUMNAS */}
            <View style={[styles.twoColumns, { gap: s(64) }]}>
              {/* COLUMNA IZQUIERDA: LOGO PLAYSTATION Y DESCRIPCION */}
              <View style={[styles.leftColumn, { flex: 1 }]}>
                <View style={[styles.brandRow, { gap: s(14), marginBottom: s(20) }]}>
                  <PlayStationVectorLogo size={s(38)} />
                  <Text style={[styles.brandText, { fontSize: s(32) }]}>PlayStation</Text>
                </View>
                <Text style={[styles.brandDescription, { fontSize: s(16), lineHeight: s(26) }]}>
                  {mode === 'login' ? t('account.manualLoginDesc') : t('account.authBrandDesc')}
                </Text>
              </View>

              {/* COLUMNA DERECHA: CAMPOS DE INICIO DE SESIÓN */}
              <View style={[styles.rightColumn, { flex: 1.15, maxWidth: s(540) }]}>
                {/* CAMPO: ID DE INICIO DE SESIÓN (EMAIL / USUARIO) */}
                <Text style={[styles.fieldLabel, { fontSize: s(14), marginBottom: s(8) }]}>
                  {t('account.signInIdLabel')}
                </Text>
                <TextInput
                  ref={usernameInputRef}
                  style={[
                    styles.inputField,
                    webInputStyle,
                    {
                      height: s(52),
                      borderRadius: s(6),
                      paddingHorizontal: s(16),
                      fontSize: s(15),
                      marginBottom: s(18),
                    },
                    focusedIndex === 0 && styles.inputFieldFocused,
                    focusedIndex === 0 && webInputFocusedStyle,
                  ]}
                  value={username}
                  onChangeText={(v) => setUsername(v.toLowerCase().replace(/\s+/g, ''))}
                  placeholder=""
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedIndex(0)}
                />

                {/* CAMPO: CONTRASEÑA */}
                <Text style={[styles.fieldLabel, { fontSize: s(14), marginBottom: s(8) }]}>
                  {t('account.password')}
                </Text>
                <TextInput
                  ref={passwordInputRef}
                  style={[
                    styles.inputField,
                    webInputStyle,
                    {
                      height: s(52),
                      borderRadius: s(6),
                      paddingHorizontal: s(16),
                      fontSize: s(15),
                      marginBottom: s(18),
                    },
                    focusedIndex === 1 && styles.inputFieldFocused,
                    focusedIndex === 1 && webInputFocusedStyle,
                  ]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder=""
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedIndex(1)}
                />

                {/* CAMPO ADICIONAL: NOMBRE VISIBLE SI ES REGISTRO */}
                {mode === 'register' && (
                  <>
                    <Text style={[styles.fieldLabel, { fontSize: s(14), marginBottom: s(8) }]}>
                      {t('account.displayName')}
                    </Text>
                    <TextInput
                      ref={displayNameInputRef}
                      style={[
                        styles.inputField,
                        webInputStyle,
                        {
                          height: s(52),
                          borderRadius: s(6),
                          paddingHorizontal: s(16),
                          fontSize: s(15),
                          marginBottom: s(18),
                        },
                        focusedIndex === 2 && styles.inputFieldFocused,
                        focusedIndex === 2 && webInputFocusedStyle,
                      ]}
                      value={displayName}
                      onChangeText={(v) => setDisplayName(v.slice(0, 50))}
                      placeholder={t('account.displayNamePlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      onFocus={() => setFocusedIndex(2)}
                    />
                  </>
                )}

                {/* MENSAJE DE ERROR */}
                {error && (
                  <View style={[styles.errorContainer, { padding: s(12), borderRadius: s(8), marginBottom: s(18), gap: s(8) }]}>
                    <Ionicons name="alert-circle" size={s(18)} color="#FF5252" />
                    <Text style={[styles.errorText, { fontSize: s(13) }]}>{error}</Text>
                  </View>
                )}

                {/* BOTON PRINCIPAL: INICIAR SESION / CREAR CUENTA */}
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    {
                      height: s(48),
                      borderRadius: s(24),
                      marginTop: s(16),
                    },
                    focusedIndex === submitButtonIndex && styles.submitButtonFocused,
                    busy && styles.btnDisabled,
                  ]}
                  onPress={handleSubmit}
                  activeOpacity={0.8}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color={focusedIndex === submitButtonIndex ? '#000' : '#FFF'} />
                  ) : (
                    <Text
                      style={[
                        styles.submitButtonText,
                        { fontSize: s(15) },
                        focusedIndex === submitButtonIndex && styles.submitButtonTextFocused,
                      ]}
                    >
                      {mode === 'login' ? t('account.login') : t('account.registerButton')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* SECCIÓN INFERIOR: "¿NO TIENES UNA CUENTA?" Y BOTONES PILL */}
            <View style={[styles.bottomSection, { marginTop: s(80) }]}>
              <Text style={[styles.noAccountQuestion, { fontSize: s(14), marginBottom: s(16) }]}>
                {t('account.noAccountYet')}
              </Text>

              <View style={[styles.bottomButtonsRow, { gap: s(16) }]}>
                {/* BOTON 1: INICIAR SESION CON CODIGO */}
                <TouchableOpacity
                  style={[
                    styles.pillButton,
                    {
                      height: s(42),
                      paddingHorizontal: s(24),
                      borderRadius: s(21),
                    },
                    focusedIndex === codeButtonIndex && styles.pillButtonFocused,
                  ]}
                  onPress={() => {
                    soundService.playActivation?.();
                    setShowCodeModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillButtonText, { fontSize: s(14) }]}>
                    {t('account.loginWithCode')}
                  </Text>
                </TouchableOpacity>

                {/* BOTON 2: CREAR UNA CUENTA / YA TENGO CUENTA */}
                <TouchableOpacity
                  style={[
                    styles.pillButton,
                    {
                      height: s(42),
                      paddingHorizontal: s(24),
                      borderRadius: s(21),
                    },
                    focusedIndex === toggleButtonIndex && styles.pillButtonFocused,
                  ]}
                  onPress={() => {
                    soundService.playActivation?.();
                    setMode((m) => (m === 'login' ? 'register' : 'login'));
                    setError(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillButtonText, { fontSize: s(14) }]}>
                    {mode === 'login' ? t('account.createAccount') : t('account.alreadyHaveAccount')}
                  </Text>
                </TouchableOpacity>

                {/* BOTON 3: OMITIR Y JUGAR OFFLINE */}
                <TouchableOpacity
                  style={[
                    styles.pillButton,
                    {
                      height: s(42),
                      paddingHorizontal: s(24),
                      borderRadius: s(21),
                    },
                    focusedIndex === offlineButtonIndex && styles.pillButtonFocused,
                  ]}
                  onPress={() => {
                    soundService.playBack?.();
                    onBack();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillButtonText, { fontSize: s(14) }]}>
                    {t('account.playOffline')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ESQUINA INFERIOR DERECHA: PROMPT DE AYUDA (TRIANGULO) */}
            <View style={[styles.bottomHelpPrompt, { bottom: s(16), right: s(48) }]}>
              <TouchableOpacity
                style={[styles.helpTrigger, { gap: s(8) }]}
                onPress={() => {
                  soundService.playActivation?.();
                  setShowHelpModal(true);
                }}
                activeOpacity={0.8}
              >
                <PSIcon char={PSIcons.triangle} size={s(18)} color="#FFFFFF" />
                <Text style={[styles.helpPromptText, { fontSize: s(14) }]}>
                  {t('account.cantSignIn')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* MODAL: CODIGO O VINCULACION CON APP */}
      <Modal visible={showCodeModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { width: s(520), padding: s(32), borderRadius: s(16) }]}>
            <Text style={[styles.modalTitle, { fontSize: s(22), marginBottom: s(14) }]}>
              {t('account.codeModalTitle')}
            </Text>
            <Text style={[styles.modalDesc, { fontSize: s(15), lineHeight: s(24), marginBottom: s(24) }]}>
              {t('account.codeModalDesc')}
            </Text>

            {/* Código generado en caja destacada */}
            <View style={[styles.codeDisplayBox, { paddingVertical: s(18), borderRadius: s(10), marginBottom: s(28) }]}>
              <Text style={[styles.codeDisplayText, { fontSize: s(34) }]}>WPS5-8942</Text>
            </View>

            <TouchableOpacity
              style={[styles.modalActionButton, { height: s(46), borderRadius: s(23) }]}
              onPress={() => setShowCodeModal(false)}
            >
              <Text style={[styles.modalActionButtonText, { fontSize: s(15) }]}>
                {t('account.understood')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: ASISTENCIA Y AYUDA "¿NO PUEDES INICIAR SESIÓN?" */}
      <Modal visible={showHelpModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { width: s(520), padding: s(32), borderRadius: s(16) }]}>
            <View style={[styles.helpIconCircle, { width: s(54), height: s(54), borderRadius: s(27), marginBottom: s(18) }]}>
              <PSIcon char={PSIcons.triangle} size={s(26)} color="#FFFFFF" />
            </View>
            <Text style={[styles.modalTitle, { fontSize: s(22), marginBottom: s(14) }]}>
              {t('account.helpModalTitle')}
            </Text>
            <Text style={[styles.modalDesc, { fontSize: s(15), lineHeight: s(24), marginBottom: s(28) }]}>
              {t('account.helpModalDesc')}
            </Text>

            <TouchableOpacity
              style={[styles.modalActionButton, { height: s(46), borderRadius: s(23) }]}
              onPress={() => setShowHelpModal(false)}
            >
              <Text style={[styles.modalActionButtonText, { fontSize: s(15) }]}>
                {t('account.understood')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0d12',
    position: 'relative',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  headerTitle: {
    color: '#FFF',
    fontFamily: 'SSTLight',
    letterSpacing: 0.3,
  },
  scrollContent: {
    flexGrow: 1,
    zIndex: 5,
  },
  authMainContainer: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 1280,
  },
  twoColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  leftColumn: {
    paddingTop: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    color: '#FFF',
    fontFamily: 'SSTBold',
    letterSpacing: 0.5,
  },
  brandDescription: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: 'SSTLight',
    maxWidth: 420,
  },
  rightColumn: {
    backgroundColor: 'transparent',
  },
  fieldLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: 'SSTMedium',
    letterSpacing: 0.2,
  },
  inputField: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    color: '#FFFFFF',
    fontFamily: 'SSTRegular',
  },
  inputFieldFocused: {
    borderColor: 'rgba(255, 255, 255, 0.95)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  errorText: {
    color: '#FF5252',
    fontFamily: 'SSTMedium',
    flex: 1,
  },
  submitButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...(Platform.OS === 'web'
      ? {
          transition: 'all 0.2s ease',
        }
      : {}),
  },
  submitButtonFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 0 20px rgba(255, 255, 255, 0.5)',
        }
      : {}),
  },
  submitButtonText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: 'SSTBold',
    letterSpacing: 0.5,
  },
  submitButtonTextFocused: {
    color: '#000000',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  bottomSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  noAccountQuestion: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: 'SSTLight',
    letterSpacing: 0.3,
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? {
          transition: 'all 0.2s ease',
        }
      : {}),
  },
  pillButtonFocused: {
    borderColor: 'rgba(255, 255, 255, 0.95)',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 0 14px rgba(255, 255, 255, 0.3)',
        }
      : {}),
  },
  pillButtonText: {
    color: '#FFFFFF',
    fontFamily: 'SSTMedium',
    letterSpacing: 0.3,
  },
  bottomHelpPrompt: {
    position: 'absolute',
    zIndex: 20,
  },
  helpTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  helpPromptText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: 'SSTLight',
    letterSpacing: 0.2,
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFF',
    fontFamily: 'SSTBold',
    textAlign: 'center',
  },
  modalDesc: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: 'SSTLight',
    textAlign: 'center',
  },
  codeDisplayBox: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDisplayText: {
    color: '#FFF',
    fontFamily: 'SSTBold',
    letterSpacing: 4,
  },
  modalActionButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionButtonText: {
    color: '#000000',
    fontFamily: 'SSTBold',
  },
  helpIconCircle: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Connected card styles
  linkedWrapper: {
    width: '100%',
    alignSelf: 'center',
  },
  linkedCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    backgroundColor: '#00439C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontFamily: 'SSTBold',
  },
  displayName: {
    color: '#FFF',
    fontFamily: 'SSTBold',
  },
  username: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'SSTLight',
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(76, 217, 100, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(76, 217, 100, 0.35)',
  },
  onlineDot: {
    backgroundColor: '#4CD964',
  },
  onlineText: {
    color: '#4CD964',
    fontFamily: 'SSTMedium',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  btnSecondaryText: {
    color: '#FFF',
    fontFamily: 'SSTMedium',
  },
  btnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  btnDangerText: {
    color: '#FF5252',
    fontFamily: 'SSTMedium',
  },
  libraryBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  libraryHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  libraryTitle: {
    color: '#FFF',
    fontFamily: 'SSTBold',
  },
  libraryDesc: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: 'SSTLight',
  },
  visibilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  visibilityBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  visibilityBtnActive: {
    backgroundColor: '#FFF',
  },
  visibilityText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: 'SSTMedium',
  },
  visibilityTextActive: {
    color: '#000',
    fontFamily: 'SSTBold',
  },
  syncResult: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: 'SSTLight',
  },
  validatingBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  validatingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'SSTLight',
  },
});
