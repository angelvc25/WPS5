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
  isOnlineProfileScopeReady,
  loginOnlineAccount,
  logoutOnlineAccount,
  recoverOnlineAccount,
  regenerateRecoveryCode,
  registerOnlineAccount,
  restoreOnlineSession,
  subscribeOnlineProfileScope,
  subscribeOnlineSession,
  syncProfileMediaToOnline,
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
    case 'Invalid username or recovery code':
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
 * Logotipo oficial de WPS5 (assets/icons/wps5FullWhite.svg)
 */
function Wps5VectorLogo({ size = 32 }: { size?: number }) {
  if (Platform.OS === 'web') {
    return (
      <svg
        viewBox="0 0 600 600"
        width={size}
        height={size}
        fill="#FFFFFF"
        style={{ flexShrink: 0 }}
      >
        <g transform="translate(0,600) scale(0.1,-0.1)" fill="#ffffff" stroke="none">
          <path d="M2235 5433 c-73 -10 -246 -76 -287 -109 -22 -19 -50 -40 -61 -46 -41 -22 -99 -102 -128 -180 -36 -93 -40 -159 -29 -605 5 -235 14 -655 20 -933 21 -1045 31 -1417 40 -1476 21 -133 83 -275 176 -405 180 -250 474 -399 726 -368 116 14 225 85 288 187 54 89 62 140 61 417 -1 233 -4 419 -31 1640 -5 253 -11 595 -13 760 -2 343 -4 337 83 374 56 24 89 26 143 7 80 -29 116 -64 162 -160 55 -112 82 -226 90 -376 4 -83 34 -1400 35 -1528 0 -17 50 -10 170 25 177 51 304 124 420 242 213 216 303 471 278 791 -15 199 -61 353 -164 549 -93 176 -143 241 -329 427 -68 68 -311 233 -515 349 -386 221 -602 316 -892 394 -108 29 -165 34 -243 24z m173 -3057 c74 -24 138 -48 143 -53 6 -6 9 -50 7 -99 l-3 -89 -63 -47 c-35 -27 -69 -48 -76 -48 -7 0 -46 42 -86 93 l-75 92 -7 80 c-8 86 -4 115 15 115 7 0 72 -20 145 -44z m-295 -137 c40 -12 83 -31 96 -43 40 -36 150 -187 145 -200 -3 -7 -19 -20 -37 -31 -18 -10 -34 -21 -37 -25 -3 -3 -20 -16 -37 -29 l-33 -22 -82 27 c-46 15 -89 34 -95 42 -17 21 -18 302 -2 302 6 0 43 -10 82 -21z m597 -192 c89 -28 87 -22 89 -209 1 -104 -2 -128 -13 -128 -8 0 -47 11 -88 25 -40 14 -74 25 -75 25 -1 0 -34 39 -73 88 -74 92 -92 129 -69 143 8 4 36 24 64 43 27 20 59 36 70 36 11 0 54 -11 95 -23z m-222 -205 c38 -48 74 -96 79 -107 15 -27 14 -175 -1 -181 -6 -2 -76 17 -156 43 l-145 48 -3 92 -3 91 43 34 c57 45 90 67 105 67 6 1 43 -38 81 -87z" />
          <path d="M4402 3297 c-49 -151 -89 -236 -169 -354 -63 -95 -125 -155 -230 -223 -89 -59 -176 -94 -322 -130 -62 -16 -120 -35 -128 -43 -23 -23 2 -53 72 -87 94 -47 198 -64 340 -56 140 7 183 -6 197 -59 19 -71 -16 -174 -68 -199 -45 -21 -50 -21 -169 8 -128 31 -241 75 -338 130 -82 47 -78 47 -92 -1 -6 -20 93 -101 199 -164 119 -70 281 -136 389 -157 71 -14 82 -14 138 2 34 9 76 28 95 42 51 40 101 123 125 210 19 68 21 96 16 219 -6 186 -31 255 -92 255 -11 0 -88 -34 -170 -76 -127 -65 -158 -77 -212 -82 -52 -4 -63 -2 -63 11 0 32 15 49 131 142 175 140 286 293 363 496 21 55 48 250 35 249 -2 -1 -23 -60 -47 -133z" />
          <path d="M3516 2025 c6 -186 6 -185 56 -268 75 -125 259 -274 458 -371 190 -94 236 -139 234 -232 -3 -105 -82 -189 -170 -181 -67 7 -131 46 -235 145 -176 167 -286 330 -330 487 -6 20 -7 11 -3 -30 15 -160 144 -369 343 -557 145 -136 271 -200 392 -200 149 1 256 105 288 278 17 91 14 168 -7 187 -31 28 -163 84 -332 142 -89 30 -205 75 -257 100 -87 41 -95 47 -89 67 4 13 10 63 13 111 l6 89 31 -6 c195 -40 439 -49 570 -21 112 24 147 60 84 86 -17 7 -52 28 -77 47 -24 19 -54 34 -65 34 -12 0 -75 -13 -141 -28 -163 -37 -345 -40 -450 -7 -135 43 -245 128 -301 232 l-24 46 6 -150z" />
        </g>
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

  // Paso post-registro: mostrar el código de respaldo una sola vez.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  // Formulario de recuperación dentro del modal de ayuda.
  const [recUsername, setRecUsername] = useState('');
  const [recCode, setRecCode] = useState('');
  const [recNewPass, setRecNewPass] = useState('');
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recDoneCode, setRecDoneCode] = useState<string | null>(null);
  const [helpMode, setHelpMode] = useState<'help' | 'recover'>('help');

  // Focus navigation state
  // 0: username input, 1: password input, 2: displayName (register only), 3: submit button,
  // 4: create/toggle button, 5: play offline button
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Modals
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Connected state actions
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [shownRecoveryCode, setShownRecoveryCode] = useState<string | null>(null);
  const [loadingRecoveryCode, setLoadingRecoveryCode] = useState(false);

  // Input refs
  const usernameInputRef = useRef<TextInput | null>(null);
  const passwordInputRef = useRef<TextInput | null>(null);
  const displayNameInputRef = useRef<TextInput | null>(null);

  // Listen to session changes (también al conmutar de perfil local)
  const [scopeTick, setScopeTick] = useState(0);
  useEffect(() => subscribeOnlineSession(setSession), []);
  useEffect(() => subscribeOnlineProfileScope(() => setScopeTick((v) => v + 1)), []);

  // Validate saved session (espera al ámbito por perfil para no heredar ni
  // renombrar con la sesión de otro perfil)
  useEffect(() => {
    let cancelled = false;
    if (!isOnlineProfileScopeReady()) {
      setValidating(false);
      return () => { cancelled = true; };
    }
    setValidating(true);
    restoreOnlineSession()
      .then((restored) => {
        if (cancelled) return;
        setSession(restored);
        const linkedId = (activeUser?.settings as any)?.onlineUserId;
        if (restored) {
          const patch: any = {};
          if (restored.user.id !== linkedId) {
            patch.settings = {
              ...activeUser?.settings,
              onlineUserId: restored.user.id,
              onlineUsername: restored.user.username,
            };
          }
          // El nombre y la bio locales siguen a la cuenta online (la bio
          // solo si el servidor trae una, para no borrar texto local).
          if (restored.user.displayName && restored.user.displayName !== activeUser?.name) {
            patch.name = restored.user.displayName;
          }
          if (restored.user.bio && restored.user.bio !== activeUser?.about) {
            patch.about = restored.user.bio;
          }
          if (Object.keys(patch).length > 0) updateUser(patch);
          // Sube avatar/portada/Steam vinculados si cambiaron en local.
          syncProfileMediaToOnline(activeUser || {}).catch(() => {});
        } else if (linkedId) {
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
  }, [scopeTick]);

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

      if (showHelpModal) {
        if (e.key === 'Enter') {
          setShowHelpModal(false);
          soundService.playActivation?.();
        }
        return;
      }

      if (isLinked) return;

      const maxFocus = mode === 'register' ? 5 : 4;

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
        if (focusedIndex >= (mode === 'register' ? 3 : 2)) {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, maxFocus));
          soundService.playNavigation?.();
        }
      } else if (e.key === 'ArrowLeft') {
        if (focusedIndex >= (mode === 'register' ? 3 : 2)) {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, mode === 'register' ? 4 : 3));
          soundService.playNavigation?.();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        soundService.playActivation?.();
        const submitIdx = mode === 'register' ? 3 : 2;
        const toggleIdx = mode === 'register' ? 4 : 3;
        const offlineIdx = mode === 'register' ? 5 : 4;

        if (focusedIndex === 0) {
          usernameInputRef.current?.focus();
        } else if (focusedIndex === 1) {
          passwordInputRef.current?.focus();
        } else if (mode === 'register' && focusedIndex === 2) {
          displayNameInputRef.current?.focus();
        } else if (focusedIndex === submitIdx) {
          handleSubmit();
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
  }, [mode, focusedIndex, isLinked, showHelpModal, username, password, displayName, busy]);

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
      // Sesión nueva: descartar códigos en pantalla (el servidor rota y los viejos ya no valen).
      setShownRecoveryCode(null);
      setRecoveryCode(null);
      syncProfileMediaToOnline(activeUser || {}).catch(() => {});
      updateUser({
        // El nombre y la bio locales siguen a la cuenta online (la bio
        // solo si el servidor trae una, para no borrar texto local).
        name: result.session.user.displayName || username.trim(),
        ...(result.session.user.bio ? { about: result.session.user.bio } : {}),
        settings: {
          ...activeUser?.settings,
          onlineUserId: result.session.user.id,
          onlineUsername: result.session.user.username,
        } as any,
      });
      setPassword('');
      soundService.playActivation?.();
      toastService.show(t('account.online'));
      // Al registrar, mostrar el código de respaldo antes de continuar.
      if (mode === 'register' && result.recoveryCode) {
        setRecoveryCode(result.recoveryCode);
        return;
      }
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
      setShownRecoveryCode(null);
      setRecoveryCode(null);
      updateUser({
        settings: { ...activeUser?.settings, onlineUserId: '', onlineUsername: '' } as any,
      });
      soundService.playBack?.();
    } finally {
      setBusy(false);
    }
  };

  const handleRecover = async () => {
    if (recBusy) return;
    setRecBusy(true);
    setRecError(null);
    try {
      const result = await recoverOnlineAccount(recUsername, recCode, recNewPass);
      if (!result.ok) {
        setRecError(mapAuthError(t, result.error));
        soundService.playBack?.();
        return;
      }
      // El código rota: mostrar el nuevo para guardar y descartar el viejo en pantalla.
      setRecDoneCode(result.recoveryCode || null);
      setShownRecoveryCode(null);
      setRecNewPass('');
      soundService.playActivation?.();
    } finally {
      setRecBusy(false);
    }
  };

  const openHelp = (helpModeValue: 'help' | 'recover') => {
    setHelpMode(helpModeValue);
    setRecError(null);
    setRecDoneCode(null);
    if (helpModeValue === 'recover' && !recUsername) setRecUsername(username);
    setShowHelpModal(true);
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
  const toggleButtonIndex = mode === 'register' ? 4 : 3;
  const offlineButtonIndex = mode === 'register' ? 5 : 4;

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
                <TouchableOpacity
                  style={[styles.btnSecondary, { paddingHorizontal: s(20), paddingVertical: s(10), borderRadius: s(20) }]}
                  onPress={async () => {
                    if (loadingRecoveryCode) return;
                    setLoadingRecoveryCode(true);
                    try {
                      const result = await regenerateRecoveryCode();
                      if (result.ok && result.recoveryCode) {
                        setShownRecoveryCode(result.recoveryCode);
                      } else {
                        toastService.show(t('onlineLibrary.visibilityError'));
                      }
                    } finally {
                      setLoadingRecoveryCode(false);
                    }
                  }}
                  disabled={loadingRecoveryCode}
                >
                  <Ionicons name="key-outline" size={s(16)} color="#FFF" style={{ marginRight: s(8) }} />
                  <Text style={[styles.btnSecondaryText, { fontSize: s(14) }]}>{t('account.showRecoveryCode')}</Text>
                </TouchableOpacity>
              </View>

              {shownRecoveryCode && (
                <View style={[styles.codeDisplayBox, { paddingVertical: s(16), borderRadius: s(10), marginTop: s(20), alignItems: 'center' }]}>
                  <Text style={[styles.codeDisplayText, { fontSize: s(26) }]} selectable>{shownRecoveryCode}</Text>
                  <Text style={[styles.modalDesc, { fontSize: s(12), marginTop: s(8), textAlign: 'center' }]}>
                    {t('account.regenerateWarning')}
                  </Text>
                  <TouchableOpacity
                    style={{ marginTop: s(8) }}
                    onPress={() => setShownRecoveryCode(null)}
                  >
                    <Text style={[styles.modalActionButtonText, { fontSize: s(13) }]}>
                      {t('account.hideCode')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

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
        {!isLinked && !validating && recoveryCode && (
          <View style={[styles.authMainContainer, { marginTop: s(28), alignItems: 'center' }]}>
            <View style={[styles.modalCard, { width: s(560), padding: s(36), borderRadius: s(16), alignItems: 'center' }]}>
              <Ionicons name="shield-checkmark-outline" size={s(48)} color="#4CAF50" style={{ marginBottom: s(16) }} />
              <Text style={[styles.modalTitle, { fontSize: s(24), marginBottom: s(12), textAlign: 'center' }]}>
                {t('account.recoveryTitle')}
              </Text>
              <Text style={[styles.modalDesc, { fontSize: s(15), lineHeight: s(24), marginBottom: s(24), textAlign: 'center' }]}>
                {t('account.recoveryDesc')}
              </Text>
              <View style={[styles.codeDisplayBox, { paddingVertical: s(18), borderRadius: s(10), marginBottom: s(28), alignSelf: 'stretch', alignItems: 'center' }]}>
                <Text style={[styles.codeDisplayText, { fontSize: s(32) }]} selectable>{recoveryCode}</Text>
              </View>
              <TouchableOpacity
                style={[styles.modalActionButton, { height: s(48), borderRadius: s(24), alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }]}
                onPress={() => {
                  soundService.playActivation?.();
                  setRecoveryCode(null);
                  if (onSuccess) onSuccess();
                }}
              >
                <Text style={[styles.modalActionButtonText, { fontSize: s(15) }]}>
                  {t('account.recoverySaved')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* CASO: LOGIN / REGISTRO MANUAL CON EL DISENO PS5 EXACTO */}
        {!isLinked && !validating && !recoveryCode && (
          <View style={[styles.authMainContainer, { marginTop: s(28) }]}>
            {/* DOS COLUMNAS */}
            <View style={[styles.twoColumns, { gap: s(64) }]}>
              {/* COLUMNA IZQUIERDA: LOGO PLAYSTATION Y DESCRIPCION */}
              <View style={[styles.leftColumn, { flex: 1 }]}>
                <View style={[styles.brandRow, { gap: s(14), marginBottom: s(20) }]}>
                  <Wps5VectorLogo size={s(38)} />
                  <Text style={[styles.brandText, { fontSize: s(32) }]}>WPS5</Text>
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
                {/* BOTON 1: CREAR UNA CUENTA / YA TENGO CUENTA */}
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

                {/* BOTON 2: OMITIR Y JUGAR OFFLINE */}
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
                  openHelp('help');
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

      {/* MODAL: ASISTENCIA Y AYUDA "¿NO PUEDES INICIAR SESIÓN?" */}
      <Modal visible={showHelpModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { width: s(520), padding: s(32), borderRadius: s(16) }]}>
            {helpMode === 'recover' ? (
              recDoneCode ? (
              <>
                <View style={{ alignItems: 'center' }}>
                  <Ionicons name="checkmark-circle" size={s(48)} color="#4CAF50" style={{ marginBottom: s(14) }} />
                </View>
                <Text style={[styles.modalTitle, { fontSize: s(22), marginBottom: s(8), textAlign: 'center' }]}>
                  {t('account.recoverSuccessTitle')}
                </Text>
                <Text style={[styles.modalDesc, { fontSize: s(14), lineHeight: s(22), marginBottom: s(18), textAlign: 'center' }]}>
                  {t('account.recoverSuccessDesc')}
                </Text>
                <View style={[styles.codeDisplayBox, { paddingVertical: s(14), borderRadius: s(10), marginBottom: s(20), alignItems: 'center' }]}>
                  <Text style={[styles.codeDisplayText, { fontSize: s(24) }]} selectable>{recDoneCode}</Text>
                  <Text style={[styles.modalDesc, { fontSize: s(12), marginTop: s(8), textAlign: 'center' }]}>
                    {t('account.recoveryRotated')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.modalActionButton, { height: s(46), borderRadius: s(23) }]}
                  onPress={() => {
                    soundService.playActivation?.();
                    setUsername(recUsername);
                    setPassword('');
                    setMode('login');
                    setRecUsername('');
                    setRecCode('');
                    setRecNewPass('');
                    setRecError(null);
                    setRecDoneCode(null);
                    setHelpMode('help');
                    setShowHelpModal(false);
                  }}
                >
                  <Text style={[styles.modalActionButtonText, { fontSize: s(15) }]}>
                    {t('account.recoverDoneButton')}
                  </Text>
                </TouchableOpacity>
              </>
              ) : (
              <>
                <Text style={[styles.modalTitle, { fontSize: s(22), marginBottom: s(8) }]}>
                  {t('account.recoverTitle')}
                </Text>
                <Text style={[styles.modalDesc, { fontSize: s(14), lineHeight: s(22), marginBottom: s(18) }]}>
                  {t('account.recoverDesc')}
                </Text>

                <Text style={[styles.fieldLabel, { fontSize: s(13), marginBottom: s(6) }]}>
                  {t('account.username')}
                </Text>
                <TextInput
                  style={[styles.inputField, webInputStyle, { height: s(46), borderRadius: s(6), paddingHorizontal: s(14), fontSize: s(14), marginBottom: s(12) }]}
                  value={recUsername}
                  onChangeText={(v) => setRecUsername(v.toLowerCase().replace(/\s+/g, ''))}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={[styles.fieldLabel, { fontSize: s(13), marginBottom: s(6) }]}>
                  {t('account.recoveryCodeLabel')}
                </Text>
                <TextInput
                  style={[styles.inputField, webInputStyle, { height: s(46), borderRadius: s(6), paddingHorizontal: s(14), fontSize: s(14), marginBottom: s(12) }]}
                  value={recCode}
                  onChangeText={(v) => setRecCode(v.toUpperCase().replace(/\s+/g, ''))}
                  placeholder="WPS5-XXXX-XXXX"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Text style={[styles.fieldLabel, { fontSize: s(13), marginBottom: s(6) }]}>
                  {t('account.newPassword')}
                </Text>
                <TextInput
                  style={[styles.inputField, webInputStyle, { height: s(46), borderRadius: s(6), paddingHorizontal: s(14), fontSize: s(14), marginBottom: s(12) }]}
                  value={recNewPass}
                  onChangeText={setRecNewPass}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {recError ? (
                  <Text style={{ color: '#FF5252', fontSize: s(13), marginBottom: s(12) }}>{recError}</Text>
                ) : null}

                <TouchableOpacity
                  style={[styles.modalActionButton, { height: s(46), borderRadius: s(23), marginBottom: s(10) }]}
                  onPress={handleRecover}
                  disabled={recBusy}
                >
                  <Text style={[styles.modalActionButtonText, { fontSize: s(15) }]}>
                    {recBusy ? '...' : t('account.recoverButton')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalActionButton, { height: s(46), borderRadius: s(23) }]}
                  onPress={() => {
                    setHelpMode('help');
                    setRecError(null);
                    setRecDoneCode(null);
                  }}
                >
                  <Text style={[styles.modalActionButtonText, { fontSize: s(15) }]}>
                    {t('account.back')}
                  </Text>
                </TouchableOpacity>
              </>
            )) : (
              <>
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
              style={[styles.modalActionButton, { height: s(46), borderRadius: s(23), marginBottom: s(10) }]}
              onPress={() => openHelp('recover')}
            >
              <Text style={[styles.modalActionButtonText, { fontSize: s(15) }]}>
                {t('account.useRecoveryCode')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalActionButton, { height: s(46), borderRadius: s(23) }]}
              onPress={() => setShowHelpModal(false)}
            >
              <Text style={[styles.modalActionButtonText, { fontSize: s(15) }]}>
                {t('account.understood')}
              </Text>
            </TouchableOpacity>
              </>
            )}
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
    fontFamily: 'SSTLight',
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
