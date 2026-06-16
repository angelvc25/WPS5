import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Image } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import UserSelectScreen, { UserProfile } from '@/components/UserSelectScreen';
import { UserContext } from '@/contexts/UserContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Mantener el logo 2.5 segundos y luego desvanecerlo por 0.5 segundos
    const timer = setTimeout(() => {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setShowSplash(false);
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [splashOpacity]);

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
          <Animated.View style={{ 
            ...StyleSheet.absoluteFillObject, 
            backgroundColor: '#000', 
            justifyContent: 'center', 
            alignItems: 'center', 
            opacity: splashOpacity,
            zIndex: 9999
          }}>
            <Image 
              source={require('../assets/images/applogo.png')} 
              style={{ width: 150, height: 150 }} 
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

      // Persistir en el listado global de usuarios (Electron DB y LocalStorage fallback)
      const savedUsers = localStorage.getItem('console_users');
      if (savedUsers) {
        const usersList: UserProfile[] = JSON.parse(savedUsers);
        const updatedList = usersList.map(u => u.id === newUser.id ? newUser : u);

        // Guardar en LocalStorage
        localStorage.setItem('console_users', JSON.stringify(updatedList));

        // Guardar en Electron DB
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
        <StatusBar style="auto" />
      </ThemeProvider>
    </UserContext.Provider>
  );
}
