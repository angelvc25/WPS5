import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import UserSelectScreen, { UserProfile } from '@/components/UserSelectScreen';
import { UserContext } from '@/contexts/UserContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);

  if (!activeUser) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: `
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
        <StatusBar style="light" />
      </>
    );
  }

  const updateUser = async (updates: Partial<UserProfile>) => {
    if (activeUser) {
      const newUser = { ...activeUser, ...updates };
      setActiveUser(newUser);

      // Persistir en el listado global de usuarios (Electron DB y LocalStorage fallback)
      const savedUsers = localStorage.getItem('console_users');
      if (savedUsers) {
        const usersList: UserProfile[] = JSON.parse(savedUsers);
        const updatedList = usersList.map(u => u.id === newUser.id ? newUser : u);
        
        // Guardar en LocalStorage
        localStorage.setItem('console_users', JSON.stringify(updatedList));
        
        // Guardar en Electron DB
        if ((window as any).electronAPI) {
          await (window as any).electronAPI.saveUsers(updatedList);
        }
      }
    }
  };

  return (
    <UserContext.Provider value={{ activeUser, changeUser: () => setActiveUser(null), updateUser }}>
      <style dangerouslySetInnerHTML={{ __html: `
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
