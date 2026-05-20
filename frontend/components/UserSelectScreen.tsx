import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import ControlPrompt from './ControlPrompt';
import { soundService } from '../services/soundService';


export interface SyncPreferences {
  ratingAndSummary: 'igdb' | 'none';
  cover: 'igdb' | 'steamgrid' | 'none';
  background: 'igdb' | 'steamgrid' | 'none';
  logo: 'steamgrid' | 'none';
}

export interface UserSettings {
  autoPlayVideo: boolean;
  syncPreferences?: SyncPreferences;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  settings?: UserSettings;
}

interface UserSelectScreenProps {
  onUserSelected: (user: UserProfile) => void;
}

const DEFAULT_SYNC_PREFERENCES: SyncPreferences = {
  ratingAndSummary: 'igdb',
  cover: 'steamgrid',
  background: 'steamgrid',
  logo: 'steamgrid'
};

const DEFAULT_USERS: UserProfile[] = [
  {
    id: '1',
    name: 'Player 1',
    avatar: 'assets/images/userDefault.jpeg',
    color: '#FF3B30',
    settings: { autoPlayVideo: true, syncPreferences: DEFAULT_SYNC_PREFERENCES }
  },
  {
    id: '2',
    name: 'Player 2',
    avatar: 'assets/images/userDefault.jpeg',
    color: '#00D4FF',
    settings: { autoPlayVideo: true, syncPreferences: DEFAULT_SYNC_PREFERENCES }
  },
];

export default function UserSelectScreen({ onUserSelected }: UserSelectScreenProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [homeBg, setHomeBg] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [inputMode, setInputMode] = useState<'keyboard' | 'gamepad'>('keyboard');

  // Cargar usuarios al inicio
  useEffect(() => {
    const loadUsers = async () => {
      // 1. Intentar cargar desde Electron DB
      if (Platform.OS === 'web' && (window as any).electronAPI) {
        try {
          const dbUsers = await (window as any).electronAPI.getUsers();
          if (dbUsers && dbUsers.length > 0) {
            setUsers(dbUsers);
            localStorage.setItem('console_users', JSON.stringify(dbUsers)); // Sync localstorage
            setHoveredId(dbUsers[0].id);
            return;
          }
        } catch (err) {
          console.error('Error loading users from DB:', err);
        }
      }

      // 2. Fallback a LocalStorage
      const saved = localStorage.getItem('console_users');
      if (saved) {
        const parsed = JSON.parse(saved);
        setUsers(parsed);
        if (parsed.length > 0) setHoveredId(parsed[0].id);
      } else {
        // 3. Usuarios por defecto si no hay nada
        localStorage.setItem('console_users', JSON.stringify(DEFAULT_USERS));
        setUsers(DEFAULT_USERS);
        setHoveredId(DEFAULT_USERS[0].id);

        // Guardar por defecto en DB también
        if (Platform.OS === 'web' && (window as any).electronAPI) {
          (window as any).electronAPI.saveUsers(DEFAULT_USERS);
        }
      }
    };

    loadUsers();
    soundService.init();
  }, []);

  // Background pulse animation for fallback
  const bgPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgPulse, { toValue: 1, duration: 4000, useNativeDriver: false }),
        Animated.timing(bgPulse, { toValue: 0, duration: 4000, useNativeDriver: false }),
      ])
    ).start();

    // Fetch background
    if (Platform.OS === 'web') {
      const savedBg = localStorage.getItem('home_background');
      if (savedBg) setHomeBg(savedBg);
    }

    // Clock
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      setTime(`${hours}:${minutes} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    // Keyboard Navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e as any).fromGamepad) setInputMode('keyboard');
      const totalItems = users.length + 1; // +1 for Add User
      const allIds = ['add', ...users.map(u => u.id)];
      const currentIndex = allIds.indexOf(hoveredId || 'add');

      if (e.key === 'ArrowRight') {
        if (hoveredId === 'power') return;
        soundService.playNavigation();
        const nextIndex = (currentIndex + 1) % totalItems;
        setHoveredId(allIds[nextIndex]);
      } else if (e.key === 'ArrowLeft') {
        if (hoveredId === 'power') return;
        soundService.playNavigation();
        const nextIndex = (currentIndex - 1 + totalItems) % totalItems;
        setHoveredId(allIds[nextIndex]);
      } else if (e.key === 'ArrowDown') {
        if (hoveredId !== 'power') {
          soundService.playNavigation();
          setHoveredId('power');
        }
      } else if (e.key === 'ArrowUp') {
        if (hoveredId === 'power') {
          soundService.playNavigation();
          setHoveredId(users.length > 0 ? users[0].id : 'add');
        }
      } else if (e.key === 'Enter') {
        soundService.playActivation();
        if (hoveredId === 'power') {
          if (Platform.OS === 'web' && (window as any).electronAPI) {
            (window as any).electronAPI.closeApp();
          }
        } else if (hoveredId === 'add') {
          const newUser: UserProfile = {
            id: Date.now().toString(),
            name: `Player ${users.length + 1}`,
            avatar: 'assets/images/userDefault.jpeg',
            color: '#FFCC00'
          };
          const newList = [...users, newUser];
          setUsers(newList);
          localStorage.setItem('console_users', JSON.stringify(newList));
          if (Platform.OS === 'web' && (window as any).electronAPI) {
            (window as any).electronAPI.saveUsers(newList);
          }
          setHoveredId(newUser.id);
        } else {
          const user = users.find(u => u.id === hoveredId);
          if (user) handleSelect(user);
        }
      }
    };

    if (Platform.OS === 'web') {
      window.addEventListener('keydown', handleKeyDown);
    }

    // Gamepad Support
    let rafId: number;
    const prevButtons = new Array(16).fill(false);
    let lastMoveTime = 0;
    const THROTTLE = 220;

    const poll = () => {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0];
      if (gp) {
        const now = Date.now();
        const buttons = gp.buttons;

        const dispatch = (key: string) => {
          setInputMode('gamepad');
          const event = new KeyboardEvent('keydown', { key } as any);
          (event as any).fromGamepad = true;
          window.dispatchEvent(event);
          lastMoveTime = now;
        };

        if (now - lastMoveTime > THROTTLE) {
          if (buttons[14]?.pressed || gp.axes[0] < -0.5) dispatch('ArrowLeft');
          else if (buttons[15]?.pressed || gp.axes[0] > 0.5) dispatch('ArrowRight');
          else if (buttons[12]?.pressed || gp.axes[1] < -0.5) dispatch('ArrowUp');
          else if (buttons[13]?.pressed || gp.axes[1] > 0.5) dispatch('ArrowDown');
        }

        const checkButton = (idx: number, key: string) => {
          if (buttons[idx]?.pressed && !prevButtons[idx]) dispatch(key);
          prevButtons[idx] = buttons[idx]?.pressed;
        };

        checkButton(0, 'Enter'); // A
      }
      rafId = requestAnimationFrame(poll);
    };

    if (Platform.OS === 'web') {
      rafId = requestAnimationFrame(poll);
    }

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(rafId);
      if (Platform.OS === 'web') {
        window.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [hoveredId, users]);

  const handleSelect = (user: UserProfile) => {
    onUserSelected(user);
  };

  const bgInterpolate = bgPulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,212,255,0.03)', 'rgba(0,212,255,0.08)'],
  });

  return (
    <View style={styles.container}>
      {/* BACKGROUND LAYER */}
      {homeBg ? (
        <Image
          source={{ uri: homeBg }}
          style={styles.blurredBg}
          blurRadius={40}
        />
      ) : (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bgInterpolate }]} />
      )}

      {/* DARK OVERLAY */}
      <View style={styles.overlay} />

      {/* TOP RIGHT CLOCK */}
      <View style={styles.topRight}>
        <Text style={styles.timeText}>{time}</Text>
      </View>

      {/* CENTERED TITLES */}
      <View style={styles.titleArea}>
        <Text style={styles.title}>Welcome Back to WConsole</Text>
        <Text style={styles.subtitle}>Who's playing today?</Text>
      </View>

      {/* USER LIST */}
      <View style={styles.cardsRow}>
        {/* ADD USER BUTTON */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.cardWrapper}
          onPress={() => { }}
          {...(Platform.OS === 'web' ? {
            onMouseEnter: () => setHoveredId('add'),
            onMouseLeave: () => setHoveredId(null)
          } : {})}
        >
          <View style={[styles.card, hoveredId === 'add' && styles.cardFocused]}>
            <View style={styles.addIconCircle}>
              <Ionicons name="add" size={40} color="#FFF" />
            </View>
          </View>
          <Text style={styles.userName}>Add User</Text>
        </TouchableOpacity>

        {users.map((user, index) => {
          const isFocused = hoveredId === user.id;
          return (
            <TouchableOpacity
              key={user.id}
              activeOpacity={0.8}
              style={styles.cardWrapper}
              onPress={() => handleSelect(user)}
              {...(Platform.OS === 'web' ? {
                onMouseEnter: () => setHoveredId(user.id),
                onMouseLeave: () => setHoveredId(null)
              } : {})}
            >
              {/* Removed focus indicator */}
              <View style={[
                styles.card,
                isFocused && styles.cardFocused,
                isFocused && { borderColor: '#FFF', borderWidth: 3 }
              ]}>
                <Image
                  source={{ uri: (user as any).avatarBase64 || user.avatar }}
                  style={styles.avatarImg}
                />
              </View>
              <Text style={[styles.userName, isFocused && styles.userNameFocused]}>{user.name}</Text>
              {isFocused && (
                <View style={styles.optionsHint}>
                  <ControlPrompt btn="Options" label="Opciones" inputMode={inputMode} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* BOTTOM POWER BUTTON */}
      <TouchableOpacity 
        style={[styles.powerButton, hoveredId === 'power' && styles.powerButtonFocused]} 
        activeOpacity={0.7}
        onPress={() => {
          if (Platform.OS === 'web' && (window as any).electronAPI) {
            (window as any).electronAPI.closeApp();
          }
        }}
      >
        <Ionicons name="power" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* BOTTOM RIGHT HINT */}
      <View style={styles.bottomRightHint}>
        <ControlPrompt btn="A" label="Seleccionar" inputMode={inputMode} />
      </View>
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blurredBg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  topRight: {
    position: 'absolute',
    top: 40,
    right: 60,
  },
  timeText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '300',
    letterSpacing: 1,
  },
  titleArea: {
    alignItems: 'center',
    marginBottom: 80,
    marginTop: -40,
  },
  title: {
    color: '#FFF',
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: 2,
    marginBottom: 10,
  },
  subtitle: {
    color: '#AAA',
    fontSize: 18,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  cardWrapper: {
    alignItems: 'center',
    width: 150,
    height: 250, // Fixed height to prevent layout shifts
    justifyContent: 'center',
  },
  card: {
    width: 130,
    height: 130,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardFocused: {
    width: 150,
    height: 150,
    backgroundColor: '#FFF',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  addIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    color: '#AAA',
    fontSize: 18,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 15,
  },
  userNameFocused: {
    color: '#FFF',
    fontWeight: '600',
    fontStyle: 'italic',
  },
  focusIndicator: {
    position: 'absolute',
    top: 15,
  },
  optionsHint: {
    position: 'absolute',
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  optionsText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  powerButton: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  powerButtonFocused: {
    backgroundColor: '#FF3B30',
    borderColor: '#FFF',
    transform: [{ scale: 1.2 }],
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },
  bottomRightHint: {
    position: 'absolute',
    bottom: 40,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hintIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
  },
});
