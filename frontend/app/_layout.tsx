import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, LogBox, Platform, StyleSheet, View } from 'react-native';
import { markLauncherRevealed, resetLauncherSettled } from '@/hooks/useLauncherSettled';

LogBox.ignoreLogs([
  '"shadow*" style props are deprecated. Use "boxShadow".',
  '"textShadow*" style props are deprecated. Use "textShadow".',
  'props.pointerEvents is deprecated. Use style.pointerEvents',
]);

if (Platform.OS === 'web' && typeof console !== 'undefined' && console.warn) {
  const _warn = console.warn;
  console.warn = (...args: any[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (
      first.includes('"shadow*" style props are deprecated') ||
      first.includes('"textShadow*" style props are deprecated') ||
      first.includes('props.pointerEvents is deprecated')
    ) {
      return;
    }
    _warn.apply(console, args);
  };
}
import Animated, {
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';

import BackgroundVideo from '@/components/BackgroundVideo';
import FpsOverlay from '@/components/FpsOverlay';
import ToastHost from '@/components/ToastHost';
import UserSelectScreen, { UserProfile } from '@/components/UserSelectScreen';
import ErrorBoundary from '@/components/ErrorBoundary';
import { LanguageProvider, useTranslation } from '@/contexts/LanguageContext';
import { ThemeProvider as WPSThemeProvider } from '@/contexts/ThemeContext';
import { UserContext } from '@/contexts/UserContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFpsMeter } from '@/hooks/useFpsMeter';
import { isLanguage } from '@/i18n/translations';
import { openWebLink } from '@/services/linkService';
import { setCurrentOnlineProfileId } from '@/services/onlineAccountService';
import { soundService } from '@/services/soundService';
import { toastService } from '@/services/toastService';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import OverlayScreen from './overlay';

export const unstable_settings = {
  anchor: '(tabs)',
};

function checkIsOverlay() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  console.log('[DEBUG overlay]', (window as any).WPS5_OVERLAY, window.location.pathname, window.location.hash);
  if ((window as any).WPS5_OVERLAY === true) return true;
  const path = window.location.pathname || '';
  const hash = window.location.hash || '';
  return path.includes('overlay') || hash.includes('overlay');
}

// Recordamos qué usuario usó el launcher por última vez para poder mostrar
// SU splash de arranque (descargado desde SteamDeckRepo en Settings) antes
// de que se elija un perfil, igual que hace una consola real.
const LAST_USER_STORAGE_KEY = 'console_last_user_id';

// Debe coincidir con `toLocalFileUri` en electron/main.js.
function toLocalFileUri(filePath: string) {
  return `local-file:///${filePath.replace(/\\/g, '/')}`;
}

// Video de arranque por defecto (empaquetado con la app). Se usa cuando el
// último usuario no tiene un video de boot personalizado, o si ese falla.
const DEFAULT_BOOT_VIDEO = require('../assets/splash/boot.webm');

function getLastBootVideoUri(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !(window as any).electronAPI) {
    // Sin Electron no hay video descargado que reproducir (app puramente web/móvil).
    return null;
  }
  try {
    const lastUserId = localStorage.getItem(LAST_USER_STORAGE_KEY);
    const savedUsers = localStorage.getItem('console_users');
    if (!lastUserId || !savedUsers) return null;

    const usersList: UserProfile[] = JSON.parse(savedUsers);
    const lastUser = usersList.find((u) => u.id === lastUserId);
    const bootVideoPath = (lastUser?.settings as any)?.bootVideoPath;

    return typeof bootVideoPath === 'string' && bootVideoPath ? toLocalFileUri(bootVideoPath) : null;
  } catch (err) {
    console.warn('No se pudo leer el video de arranque personalizado:', err);
    return null;
  }
}

// expo-font registers fonts in the browser via the FontFace API using the exact key name.
// After useFonts({ SSTRg: require(...) }), 'SSTRg' is a valid font-family in CSS.
const GLOBAL_CSS_FONTS = `
  html, body, #root, .react-native-root {
    font-family: SSTRg, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }

  * {
    scrollbar-width: none;
    -ms-overflow-style: none;
    outline: none;
  }
  *::-webkit-scrollbar {
    display: none;
  }
`;

const OVERLAY_CSS_TRANSPARENT = `
  html, body, #root, .react-native-root, [data-reactroot] {
    background: transparent !important;
    background-color: transparent !important;
  }
`;

export default function RootLayout() {
  // Fuentes bloqueantes: solo las que se usan siempre (incluye las de iconos,
  // para que no aparezcan vacíos y luego "de golpe").
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    PSIcons: require('../assets/fonts/PSIcons.ttf'),
    SSTBold: require('../assets/fonts/sst/SSTBold.ttf'),
    SSTLight: require('../assets/fonts/sst/SSTLight.ttf'),
    SSTMedium: require('../assets/fonts/sst/SSTMedium.ttf'),
    SSTRg: require('../assets/fonts/sst/SSTRg.ttf'),
    SSTBadge: require('../assets/fonts/sst/SSTBadge.ttf'),
  });

  // Variantes secundarias (Cn, It, Heavy): cargan en segundo plano sin bloquear el render.
  useFonts({
    SSTBoldCn: require('../assets/fonts/sst/SSTBoldCn.ttf'),
    SSTBoldIt: require('../assets/fonts/sst/SSTBoldIt.ttf'),
    SSTHeavy: require('../assets/fonts/sst/SSTHeavy.ttf'),
    SSTHeavyIt: require('../assets/fonts/sst/SSTHeavyIt.ttf'),
    SSTLightIt: require('../assets/fonts/sst/SSTLightIt.ttf'),
    SSTMediumCn: require('../assets/fonts/sst/SSTMediumCn.ttf'),
    SSTMediumIt: require('../assets/fonts/sst/SSTMediumIt.ttf'),
    SSTRgCn: require('../assets/fonts/sst/SSTRgCn.ttf'),
    SSTRgIt: require('../assets/fonts/sst/SSTRgIt.ttf'),
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
  }

  return (
    <LanguageProvider>
      <ErrorBoundary fallbackTitle="Ha ocurrido un error en la interfaz">
        <RootLayoutInner />
      </ErrorBoundary>
    </LanguageProvider>
  );
}

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const { setLanguage, t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  // Se resuelve de forma síncrona en el primer render (una sola vez) para que
  // el splash no arranque con el video por defecto y cambie al personalizado.
  const [bootVideoUri] = useState<string | null>(() => getLastBootVideoUri());
  const [bootVideoFailed, setBootVideoFailed] = useState(false);
  const [defaultBootFailed, setDefaultBootFailed] = useState(false);
  const pathname = usePathname();
  const isOverlayMode = checkIsOverlay() || pathname === '/overlay' || pathname?.includes('overlay');

  // Diagnóstico de errores no controlados y rechazos de promesas en la ventana
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onErr = (e: ErrorEvent) => console.error('[window.error]', e.error || e.message);
      const onRej = (e: PromiseRejectionEvent) => {
        // Ignorar interrupciones benignas de audio/video HTML5 causadas por llamadas a pause()
        if (
          e.reason?.name === 'AbortError' ||
          (typeof e.reason?.message === 'string' && e.reason.message.includes('interrupted by a call to pause'))
        ) {
          return;
        }
        console.error('[unhandledrejection]', e.reason);
      };
      window.addEventListener('error', onErr);
      window.addEventListener('unhandledrejection', onRej);
      return () => {
        window.removeEventListener('error', onErr);
        window.removeEventListener('unhandledrejection', onRej);
      };
    }
  }, []);

  // Splash de arranque: video personalizado del último usuario; si no tiene
  // (o falla), el video por defecto; si este también falla, solo el logo.
  const customBootActive = !!bootVideoUri && !bootVideoFailed;
  const hasBootVideo = customBootActive || !defaultBootFailed;
  const bootVideoSource = useMemo(
    () => (customBootActive ? { uri: bootVideoUri as string } : DEFAULT_BOOT_VIDEO),
    [customBootActive, bootVideoUri]
  );

  // La pantalla de selección de usuario se queda como capa de carga (con el
  // perfil elegido y su radar pulsando) hasta que Home avisa que está listo.
  // Los hooks van antes de cualquier return temprano.
  const [homeReady, setHomeReady] = useState(false);

  // ── Contador de fps (diagnóstico de fluidez) ──────────────────────────────
  // Se activa desde Ajustes -> GPU & Performance -> "Show FPS Counter".
  const showFpsCounter = !!(activeUser?.settings as any)?.showFpsCounter;
  const fpsReading = useFpsMeter(showFpsCounter);
  const [displayRefreshRate, setDisplayRefreshRate] = useState(0);

  useEffect(() => {
    if (!showFpsCounter) return;
    const api = (window as any).electronAPI;
    if (!api?.getDisplayInfo) return;
    let cancelled = false;
    api.getDisplayInfo()
      .then((info: any) => {
        if (cancelled) return;
        setDisplayRefreshRate(info?.primaryRefreshRate || info?.targetRefreshRate || 0);
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [showFpsCounter]);

  useEffect(() => {
    if (!activeUser) { setHomeReady(false); resetLauncherSettled(); return; }
    let finished = false;
    let revealTimer: ReturnType<typeof setTimeout>;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      setTimeout(() => {
        setHomeReady(true);
        // La capa de selección hace FadeOut de 450 ms: revelamos al terminar
        revealTimer = setTimeout(markLauncherRevealed, 480);
        setTimeout(() => { /* toast de bienvenida, igual que antes */ }, 500);
      }, 900);
    };
    window.addEventListener('wps5-home-ready', done, { once: true });
    const safety = setTimeout(done, 8000);
    return () => {
      window.removeEventListener('wps5-home-ready', done);
      clearTimeout(safety);
      clearTimeout(revealTimer);
    };
  }, [activeUser?.id]);

  // Valores compartidos de Reanimated
  const splashOpacity = useSharedValue(1);
  const skipIndicatorOpacity = useSharedValue(0);
  const splashFinishedRef = useRef(false);

  // Marca el fin del splash y avisa a la app: la música de fondo de la
  // interfaz solo arranca aquí, para no sonar durante el video de booteo
  // (el video conserva su propio audio). Si el servicio de sonido aún no
  // está inicializado, playBackground() es un no-op y la pestaña principal
  // arrancará la música al montarse (ya con el splash terminado).
  const finishSplash = () => {
    if (splashFinishedRef.current) return;
    splashFinishedRef.current = true;
    if (typeof window !== 'undefined') {
      (window as any).WPS5_SPLASH_DONE = true;
      window.dispatchEvent(new CustomEvent('wps5-splash-done'));
    }
    soundService.playBackground().catch(() => { });
    splashOpacity.value = withTiming(0, { duration: 600 }, (finished) => {
      if (finished) {
        runOnJS(setShowSplash)(false);
      }
    });
  };

  // Muestra el indicador de skip 1 segundo después de arrancar el splash
  // con un video y lo oculta al terminar.
  useEffect(() => {
    if (isOverlayMode || !showSplash || !hasBootVideo) {
      skipIndicatorOpacity.value = 0;
      return;
    }
    const showTimer = setTimeout(() => {
      skipIndicatorOpacity.value = withTiming(1, { duration: 500 });
    }, 1000);
    return () => {
      clearTimeout(showTimer);
      skipIndicatorOpacity.value = 0;
    };
  }, [isOverlayMode, showSplash, hasBootVideo]);

  // Listener global de skip: cualquier tecla, clic o botón de mando
  // durante el splash llama a finishSplash().
  useEffect(() => {
    if (isOverlayMode || !showSplash || !hasBootVideo) return;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onSkip = () => { finishSplash(); };

    window.addEventListener('keydown', onSkip, { once: true });
    window.addEventListener('mousedown', onSkip, { once: true });

    // Sondeo de mando: detecta cualquier botón presionado
    let rafId: number | null = null;
    let prevButtons: boolean[] = [];
    const pollGamepad = () => {
      if (splashFinishedRef.current) return;
      const pads = navigator.getGamepads?.() ?? [];
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (!pad) continue;
        for (let b = 0; b < pad.buttons.length; b++) {
          const pressed = pad.buttons[b].pressed;
          if (pressed && !prevButtons[b]) {
            window.removeEventListener('keydown', onSkip);
            window.removeEventListener('mousedown', onSkip);
            finishSplash();
            return;
          }
          prevButtons[b] = pressed;
        }
      }
      rafId = requestAnimationFrame(pollGamepad);
    };
    rafId = requestAnimationFrame(pollGamepad);

    return () => {
      window.removeEventListener('keydown', onSkip);
      window.removeEventListener('mousedown', onSkip);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isOverlayMode, showSplash, hasBootVideo]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.openExternalUrl) return;

    const defaultOpen = Linking.openURL.bind(Linking);
    Linking.openURL = async (url: string) => {
      if (/^https?:\/\//i.test(url)) {
        try {
          await openWebLink(url);
          return;
        } catch {
          // fallback below
        }
      }
      return defaultOpen(url);
    };
  }, []);

  // La sesión online es por perfil local: al cambiar de perfil se conmuta
  // a su propia sesión (cada uno puede estar logueado con su cuenta).
  useEffect(() => {
    setCurrentOnlineProfileId(
      activeUser?.id ?? null,
      (activeUser?.settings as any)?.onlineUserId ?? null,
    );
  }, [activeUser?.id, (activeUser?.settings as any)?.onlineUserId]);

  // Animación de Entrada (solo para la app principal, no para el overlay).
  //
  // - Sin video de boot (o si falló): mantenemos el timing fijo de siempre.
  // - Con video de boot: dejamos que se reproduzca ENTERO (con sonido) y
  //   es el propio <video>/`onEnd` de BackgroundVideo quien llama a
  //   finishSplash(). El timer de acá solo actúa como red de seguridad
  //   por si el evento "ended" nunca llega (video corrupto, etc).
  useEffect(() => {
    if (isOverlayMode) {
      setShowSplash(false);
      return;
    }

    splashFinishedRef.current = false;
    splashOpacity.value = 1;
    setShowSplash(true);

    if (!hasBootVideo) {
      const timer = setTimeout(finishSplash, 1800);
      return () => clearTimeout(timer);
    }

    const safetyTimer = setTimeout(finishSplash, 20000);
    return () => clearTimeout(safetyTimer);
  }, [isOverlayMode, hasBootVideo, customBootActive]);

  // Estilos animados
  const animatedSplashStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
  }));

  const animatedSkipStyle = useAnimatedStyle(() => ({
    opacity: skipIndicatorOpacity.value,
  }));

  const transparentTheme = {
    ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(colorScheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: 'transparent',
    },
  };

  // ── UserContext ──────────────────────────────────────────────────────────
  // Estos hooks deben declararse ANTES de cualquier return temprano: si se
  // llamaran después del `if (isOverlayMode)` su orden cambiaría entre
  // renders y React se quejaría.
  const changeUser = useCallback(() => {
    setActiveUser(null);
  }, []);

  const updateUser = useCallback(async (updates: Partial<UserProfile>) => {
    setActiveUser(prevUser => {
      if (!prevUser) return prevUser;
      const newUser = { ...prevUser, ...updates };
      const savedUsers = localStorage.getItem('console_users');
      if (savedUsers) {
        const usersList: UserProfile[] = JSON.parse(savedUsers);
        const updatedList = usersList.map(u => u.id === newUser.id ? newUser : u);
        localStorage.setItem('console_users', JSON.stringify(updatedList));
        if ((window as any).electronAPI) {
          (window as any).electronAPI.saveUsers(updatedList).catch(console.error);
        }
      }
      if (updates.settings && (window as any).electronAPI?.setOverlaySettings) {
        (window as any).electronAPI.setOverlaySettings({
          enabled: newUser.settings?.overlayEnabled !== false,
          combo: newUser.settings?.overlayCombo || 'SELECT_START',
        });
      }
      return newUser;
    });
  }, []);

  // El valor del contexto debe mantener una identidad estable: si se recrea
  // en cada render, todos los consumidores de useUser() (Home, widgets,
  // biblioteca, ajustes...) se re-renderizan en cascada aunque nada haya
  // cambiado, y eso hunde el frame rate.
  const userContextValue = useMemo(
    () => ({ activeUser, changeUser, updateUser }),
    [activeUser, changeUser, updateUser]
  );

  if (isOverlayMode) {
    return (
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
        <style dangerouslySetInnerHTML={{
          __html: GLOBAL_CSS_FONTS + OVERLAY_CSS_TRANSPARENT
        }} />
        <OverlayScreen />
      </View>
    );
  }

  const handleUserSelected = (user: UserProfile) => {
    // Fijar el ámbito online ANTES de montar la app del perfil para que
    // nunca herede la sesión de otro perfil.
    setCurrentOnlineProfileId(user.id, (user.settings as any)?.onlineUserId ?? null);
    setActiveUser(user);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      localStorage.setItem(LAST_USER_STORAGE_KEY, user.id);
    }
    if (isLanguage(user.settings?.language)) {
      setLanguage(user.settings.language);
    }
    if ((window as any).electronAPI?.setOverlaySettings) {
      (window as any).electronAPI.setOverlaySettings({
        enabled: user.settings?.overlayEnabled !== false,
        combo: user.settings?.overlayCombo || 'SELECT_START',
      });
    }
  };

  // UserSelectScreen vive en la misma posición del árbol antes y después de
  // elegir perfil, así que NO se remonta: sigue mostrando al usuario elegido
  // con el radar pulsando mientras Home se monta detrás, y se retira con un
  // fade cuando Home avisa que está listo.
  const showSelectLayer = !activeUser || !homeReady;

  return (
    <UserContext.Provider value={userContextValue}>
      <WPSThemeProvider>
        <style dangerouslySetInnerHTML={{
          __html: GLOBAL_CSS_FONTS
        }} />
        <View style={{ flex: 1, backgroundColor: activeUser ? 'transparent' : '#000' }}>
          {activeUser && (
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <ErrorBoundary fallbackTitle="Ha ocurrido un error en la interfaz">
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                >
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="overlay" options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
                  <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                </Stack>
              </ErrorBoundary>
              <ToastHost />
              <StatusBar style="auto" />
            </ThemeProvider>
          )}

          {showSelectLayer && (
            <Animated.View
              exiting={FadeOut.duration(450)}
              style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', zIndex: 9000 }]}
            >
              <UserSelectScreen onUserSelected={handleUserSelected} />
            </Animated.View>
          )}

          {!activeUser && showSplash && (
            <Animated.View style={[
              StyleSheet.absoluteFillObject,
              styles.splashContainer,
              animatedSplashStyle
            ]}>
              {hasBootVideo ? (
                <BackgroundVideo
                  key={customBootActive ? 'boot-custom' : 'boot-default'}
                  source={bootVideoSource}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                  muted={false}
                  shouldPlay
                  isLooping={false}
                  onEnd={finishSplash}
                  onError={() => (customBootActive ? setBootVideoFailed(true) : setDefaultBootFailed(true))}
                />
              ) : (
                <Image
                  source={require('../assets/images/IntroLogo.png')}
                  style={{ width: 180, height: 180 }}
                  contentFit="contain"
                />
              )}

              {/* Indicador de skip — abajo a la derecha */}
              {hasBootVideo && (
                <Animated.View style={[styles.skipIndicator, animatedSkipStyle]} pointerEvents="none">
                  <View style={styles.skipPill}>
                    <Ionicons name="game-controller-outline" size={14} color="rgba(255,255,255,0.85)" style={{ marginRight: 6 }} />
                    <Animated.Text style={styles.skipText}>
                      {t('splash.skipPrompt')}
                    </Animated.Text>
                  </View>
                </Animated.View>
              )}
            </Animated.View>
          )}
          {!activeUser && <StatusBar style="light" />}

          <FpsOverlay reading={fpsReading} displayRefreshRate={displayRefreshRate} />
        </View>
      </WPSThemeProvider>
    </UserContext.Provider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999
  },
  skipIndicator: {
    position: 'absolute',
    bottom: 32,
    right: 32,
  },
  skipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  skipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});