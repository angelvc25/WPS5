import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Linking, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS
} from 'react-native-reanimated';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import UserSelectScreen, { UserProfile } from '@/components/UserSelectScreen';
import { UserContext } from '@/contexts/UserContext';
import { LanguageProvider, useTranslation } from '@/contexts/LanguageContext';
import { isLanguage } from '@/i18n/translations';
import { openWebLink } from '@/services/linkService';
import ToastHost from '@/components/ToastHost';
import BackgroundVideo from '@/components/BackgroundVideo';
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
  const [fontsLoaded] = useFonts({
    PSIcons: require('../assets/fonts/PSIcons.ttf'),
    SSTBold: require('../assets/fonts/sst/SSTBold.ttf'),
    SSTBoldCn: require('../assets/fonts/sst/SSTBoldCn.ttf'),
    SSTBoldIt: require('../assets/fonts/sst/SSTBoldIt.ttf'),
    SSTHeavy: require('../assets/fonts/sst/SSTHeavy.ttf'),
    SSTHeavyIt: require('../assets/fonts/sst/SSTHeavyIt.ttf'),
    SSTLight: require('../assets/fonts/sst/SSTLight.ttf'),
    SSTLightIt: require('../assets/fonts/sst/SSTLightIt.ttf'),
    SSTMedium: require('../assets/fonts/sst/SSTMedium.ttf'),
    SSTMediumCn: require('../assets/fonts/sst/SSTMediumCn.ttf'),
    SSTMediumIt: require('../assets/fonts/sst/SSTMediumIt.ttf'),
    SSTRg: require('../assets/fonts/sst/SSTRg.ttf'),
    SSTRgCn: require('../assets/fonts/sst/SSTRgCn.ttf'),
    SSTRgIt: require('../assets/fonts/sst/SSTRgIt.ttf'),
    SSTBadge: require('../assets/fonts/sst/SSTBadge.ttf'),
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
  const { setLanguage } = useTranslation();
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [bootVideoUri, setBootVideoUri] = useState<string | null>(null);
  const [bootVideoFailed, setBootVideoFailed] = useState(false);
  const pathname = usePathname();
  const isOverlayMode = checkIsOverlay() || pathname === '/overlay' || pathname?.includes('overlay');

  // Resuelve, una sola vez, el splash de arranque del último usuario activo.
  useEffect(() => {
    if (isOverlayMode) return;
    setBootVideoUri(getLastBootVideoUri());
  }, [isOverlayMode]);

  // Valores compartidos de Reanimated
  const splashOpacity = useSharedValue(1);
  const splashFinishedRef = useRef(false);

  const finishSplash = () => {
    if (splashFinishedRef.current) return;
    splashFinishedRef.current = true;
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

    if (!bootVideoUri || bootVideoFailed) {
      const timer = setTimeout(finishSplash, 1800);
      return () => clearTimeout(timer);
    }

    const safetyTimer = setTimeout(finishSplash, 20000);
    return () => clearTimeout(safetyTimer);
  }, [isOverlayMode, bootVideoUri, bootVideoFailed]);

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

  if (!activeUser) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <style dangerouslySetInnerHTML={{
          __html: GLOBAL_CSS_FONTS
        }} />

        <UserSelectScreen onUserSelected={(user) => {
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
        }} />

        {showSplash && (
          <Animated.View style={[
            StyleSheet.absoluteFillObject,
            styles.splashContainer,
            animatedSplashStyle
          ]}>
            {bootVideoUri && !bootVideoFailed ? (
              <BackgroundVideo
                source={{ uri: bootVideoUri }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
                muted={false}
                shouldPlay
                isLooping={false}
                onEnd={finishSplash}
                onError={() => setBootVideoFailed(true)}
              />
            ) : (
              <MaterialCommunityIcons name="sony-playstation" size={110} color="#FFFFFF" />
            )}
          </Animated.View>
        )}
        <StatusBar style="light" />
      </View>
    );
  }

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

  return (
    <UserContext.Provider value={{ activeUser, changeUser: () => setActiveUser(null), updateUser }}>
      <style dangerouslySetInnerHTML={{
        __html: GLOBAL_CSS_FONTS
      }} />
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