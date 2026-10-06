import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useFonts } from 'expo-font';
import { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Linking, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  FadeOut
} from 'react-native-reanimated';

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import UserSelectScreen, { UserProfile } from '@/components/UserSelectScreen';
import { UserContext } from '@/contexts/UserContext';
import { ThemeProvider as WPSThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider, useTranslation } from '@/contexts/LanguageContext';
import { isLanguage } from '@/i18n/translations';
import { openWebLink } from '@/services/linkService';
import { setCurrentOnlineProfileId } from '@/services/onlineAccountService';
import ToastHost from '@/components/ToastHost';
import { toastService } from '@/services/toastService';
import BackgroundVideo from '@/components/BackgroundVideo';
import { soundService } from '@/services/soundService';
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
      <RootLayoutInner />
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

  useEffect(() => {
    if (!activeUser) { setHomeReady(false); return; }
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      setHomeReady(true);
      // El aviso de bienvenida sale cuando la capa de carga ya se está retirando.
      setTimeout(() => {
        toastService.show(tRef.current('toast.loggedPS5'), {
          source: 'system',
          icon: require('@/assets/icons/Logonegro.png'),
        });
      }, 500);
    };
    window.addEventListener('wps5-home-ready', done, { once: true });
    const safety = setTimeout(done, 8000); // red de seguridad
    return () => {
      window.removeEventListener('wps5-home-ready', done);
      clearTimeout(safety);
    };
  }, [activeUser?.id]);

  // Valores compartidos de Reanimated
  const splashOpacity = useSharedValue(1);
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

  const transparentTheme = {
    ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(colorScheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: 'transparent',
    },
  };

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

  const updateUser = async (updates: Partial<UserProfile>) => {
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
  };

  // UserSelectScreen vive en la misma posición del árbol antes y después de
  // elegir perfil, así que NO se remonta: sigue mostrando al usuario elegido
  // con el radar pulsando mientras Home se monta detrás, y se retira con un
  // fade cuando Home avisa que está listo.
  const showSelectLayer = !activeUser || !homeReady;

  return (
    <UserContext.Provider value={{ activeUser, changeUser: () => setActiveUser(null), updateUser }}>
      <WPSThemeProvider>
        <style dangerouslySetInnerHTML={{
          __html: GLOBAL_CSS_FONTS
        }} />
        <View style={{ flex: 1, backgroundColor: activeUser ? 'transparent' : '#000' }}>
          {activeUser && (
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
            </Animated.View>
          )}
          {!activeUser && <StatusBar style="light" />}
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
});