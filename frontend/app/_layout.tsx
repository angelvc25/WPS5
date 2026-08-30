import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useState, useEffect } from 'react';
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

export const unstable_settings = {
  anchor: '(tabs)',
};

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
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
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

  // Valores compartidos de Reanimated
  const splashOpacity = useSharedValue(1);

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

  // Animación de Entrada: se muestra un splash con fondo negro y el logo de
  // PlayStation centrado durante un tiempo fijo, y luego se desvanece para
  // revelar la pantalla de selección de usuario.
  useEffect(() => {
    const timer = setTimeout(() => {
      splashOpacity.value = withTiming(0, { duration: 600 }, (finished) => {
        if (finished) {
          runOnJS(setShowSplash)(false);
        }
      });
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  // Estilos animados
  const animatedSplashStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
  }));

  if (!activeUser) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <style dangerouslySetInnerHTML={{
          __html: GLOBAL_CSS_FONTS
        }} />

        <UserSelectScreen onUserSelected={(user) => {
          setActiveUser(user);
          if (isLanguage(user.settings?.language)) {
            setLanguage(user.settings.language);
          }
        }} />

        {showSplash && (
          <Animated.View style={[
            StyleSheet.absoluteFillObject,
            styles.splashContainer,
            animatedSplashStyle
          ]}>
            <MaterialCommunityIcons name="sony-playstation" size={110} color="#FFFFFF" />
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
      return newUser;
    });
  };

  return (
    <UserContext.Provider value={{ activeUser, changeUser: () => setActiveUser(null), updateUser }}>
      <style dangerouslySetInnerHTML={{
        __html: GLOBAL_CSS_FONTS
      }} />
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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