import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { View, StyleSheet, Linking, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  runOnJS
} from 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import UserSelectScreen, { UserProfile } from '@/components/UserSelectScreen';
import { UserContext } from '@/contexts/UserContext';
import { openWebLink } from '@/services/linkService';
import ToastHost from '@/components/ToastHost';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [showSplash, setShowSplash] = useState(true);

  // Valores compartidos de Reanimated
  const splashOpacity = useSharedValue(1);
  const logoScale = useSharedValue(0.3); // Inicia pequeño para el efecto de entrada

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

  useEffect(() => {
    // 1. Animación de Entrada: El logo aparece con un rebote premium (efecto consola)
    logoScale.value = withSpring(1, { damping: 0, stiffness: 20 });

    // 2. Temporizador para la secuencia de salida
    const timer = setTimeout(() => {
      // Desvanecer el fondo
      splashOpacity.value = withTiming(0, { duration: 600 });

      // El logo se expande masivamente hacia la pantalla (efecto "entrar al sistema")
      logoScale.value = withTiming(2.5, { duration: 600 }, (finished) => {
        if (finished) {
          runOnJS(setShowSplash)(false);
        }
      });
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Estilos animados
  const animatedSplashStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
  }));

  const animatedLogoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  if (!activeUser) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <style dangerouslySetInnerHTML={{
          __html: `
          * {
            scrollbar-width: none;
            -ms-overflow-style: none;
            outline: none;
          }
          *::-webkit-scrollbar {
            display: none;
          }
        ` }} />

        <UserSelectScreen onUserSelected={(user) => setActiveUser(user)} />

        {showSplash && (
          <Animated.View style={[
            StyleSheet.absoluteFillObject,
            styles.splashContainer,
            animatedSplashStyle
          ]}>
            <Animated.Image
              source={require('../assets/images/applogo.png')}
              style={[styles.logo, animatedLogoStyle]}
              resizeMode="contain"
            />
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
        __html: `
        * {
          scrollbar-width: none;
          -ms-overflow-style: none;
          outline: none;
        }
        *::-webkit-scrollbar {
          display: none;
        }
      ` }} />
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
  logo: {
    width: 150,
    height: 150
  }
});