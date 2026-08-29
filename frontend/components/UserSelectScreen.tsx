import React, { useState, useEffect, useRef } from 'react';
import RadarFocusWrapper from './RadarFocusWrapper';
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
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import ControlPrompt from './ControlPrompt';
import { soundService } from '../services/soundService';
import { toastService } from '@/services/toastService';
import { useTranslation } from '@/contexts/LanguageContext';

export interface SyncPreferences {
  ratingAndSummary: 'igdb' | 'none';
  cover: 'igdb' | 'steamgrid' | 'none';
  background: 'igdb' | 'steamgrid' | 'none';
  logo: 'steamgrid' | 'none';
}

export interface UserSettings {
  autoPlayVideo?: boolean;
  syncPreferences?: SyncPreferences;
  steamApiKey?: string;
  steamId?: string;
  useSteamAvatar?: boolean;
  capturePath?: string;
  wallpaperPath?: string;
  invertTransitionDirection?: boolean;
  language?: 'es' | 'en' | 'pt';
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  avatarBase64?: string;
  steamAvatarUrl?: string;
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
  logo: 'steamgrid',
};

const DEFAULT_USERS: UserProfile[] = [
  {
    id: '1',
    name: 'Player 1',
    avatar: 'assets/images/userDefault.jpeg',
    color: '#FF3B30',
    settings: { autoPlayVideo: true, syncPreferences: DEFAULT_SYNC_PREFERENCES },
  },
  {
    id: '2',
    name: 'Player 2',
    avatar: 'assets/images/userDefault.jpeg',
    color: '#00D4FF',
    settings: { autoPlayVideo: true, syncPreferences: DEFAULT_SYNC_PREFERENCES },
  },
];

// ─── Radar canvas drawing ────────────────────────────────────────────────────
function startRadarAnimation(canvasId: string): () => void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return () => { };
  const ctx = canvas.getContext('2d')!;
  const SIZE = 164, cx = 82, cy = 82, R = 77, LINE = 2.5;
  const CYCLE = 12; // seconds
  let start: number | null = null;
  let rafId: number;

  const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

  const draw = (ts: number) => {
    if (!start) start = ts;
    const elapsed = ((ts - start) / 1000) % CYCLE;
    ctx.clearRect(0, 0, SIZE, SIZE);

    let blend = 0, rotation = 0;
    if (elapsed < 2) { blend = 0; rotation = 0; }
    else if (elapsed < 4) { blend = easeInOut((elapsed - 2) / 2); rotation = 0; }
    else if (elapsed < 8) { blend = 1; rotation = easeInOut((elapsed - 4) / 4) * Math.PI * 2; }
    else if (elapsed < 10) { blend = easeInOut(1 - (elapsed - 8) / 2); rotation = Math.PI * 2; }
    else { blend = 0; rotation = 0; }

    for (let i = 0; i < 360; i++) {
      const angleRot = (i / 360) * Math.PI * 2 + rotation;
      const cosVal = Math.cos(angleRot);
      const sweepA = (cosVal + 1) / 2; // 0..1

      const solidAlpha = 0.55;
      const brightAlpha = 0.65;
      const fadeAlpha = 0.02;

      let alpha: number;
      if (blend === 0) {
        alpha = solidAlpha;
      } else {
        const target = fadeAlpha + sweepA * (brightAlpha - fadeAlpha);
        alpha = solidAlpha + blend * (target - solidAlpha);
      }

      const a0 = (i / 360) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1.8) / 360) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, alpha).toFixed(3)})`;
      ctx.lineWidth = LINE;
      ctx.stroke();
    }

    rafId = requestAnimationFrame(draw);
  };

  rafId = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(rafId);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function UserSelectScreen({ onUserSelected }: UserSelectScreenProps) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [homeBg, setHomeBg] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [inputMode, setInputMode] = useState<'keyboard' | 'gamepad'>('keyboard');

  const animatedIndex = useRef(new Animated.Value(0)).current;

  // Store cleanup functions for radar animations
  const radarCleanups = useRef<Record<string, () => void>>({});

  // ── Inject CSS animations once ──────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes shimmerMove {
        0%   { left: -100%; top: -100%; }
        100% { left: 200%;  top: 200%;  }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // ── Start/stop radar per focused user ───────────────────────────────────
  useEffect(() => {
    // Clean up previous
    Object.values(radarCleanups.current).forEach(fn => fn());
    radarCleanups.current = {};

    if (hoveredId && hoveredId !== 'add' && hoveredId !== 'power') {
      // Small delay so the canvas is in the DOM
      const t = setTimeout(() => {
        const cleanup = startRadarAnimation(`radar-${hoveredId}`);
        radarCleanups.current[hoveredId] = cleanup;
      }, 30);
      return () => clearTimeout(t);
    }
  }, [hoveredId]);

  // ── Load users ──────────────────────────────────────────────────────────
  useEffect(() => {
    const loadUsers = async () => {
      if (Platform.OS === 'web' && (window as any).electronAPI) {
        try {
          const dbUsers = await (window as any).electronAPI.getUsers();
          if (dbUsers && dbUsers.length > 0) {
            setUsers(dbUsers);
            localStorage.setItem('console_users', JSON.stringify(dbUsers));
            setHoveredId(dbUsers[0].id);
            return;
          }
        } catch (err) {
          console.error('Error loading users from DB:', err);
        }
      }

      const saved = localStorage.getItem('console_users');
      if (saved) {
        const parsed = JSON.parse(saved);
        setUsers(parsed);
        if (parsed.length > 0) setHoveredId(parsed[0].id);
      } else {
        localStorage.setItem('console_users', JSON.stringify(DEFAULT_USERS));
        setUsers(DEFAULT_USERS);
        setHoveredId(DEFAULT_USERS[0].id);
        if (Platform.OS === 'web' && (window as any).electronAPI) {
          (window as any).electronAPI.saveUsers(DEFAULT_USERS);
        }
      }
    };

    loadUsers();
    soundService.init();
  }, []);

  // ── Background pulse (fallback) ─────────────────────────────────────────
  const bgPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgPulse, { toValue: 1, duration: 4000, useNativeDriver: false }),
        Animated.timing(bgPulse, { toValue: 0, duration: 4000, useNativeDriver: false }),
      ])
    ).start();

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
      hours = hours % 12 || 12;
      setTime(`${hours}:${minutes} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);

    // ── Keyboard navigation ──────────────────────────────────────────────
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e as any).fromGamepad) setInputMode('keyboard');
      const totalItems = users.length + 1;
      const allIds = ['add', ...users.map(u => u.id)];
      const currentIndex = allIds.indexOf(hoveredId || 'add');

      if (e.key === 'ArrowRight') {
        if (hoveredId === 'power' || currentIndex >= totalItems - 1) return;
        soundService.playNavigation();
        setHoveredId(allIds[currentIndex + 1]);
      } else if (e.key === 'ArrowLeft') {
        if (hoveredId === 'power' || currentIndex <= 0) return;
        soundService.playNavigation();
        setHoveredId(allIds[currentIndex - 1]);
      } else if (e.key === 'ArrowDown') {
        if (hoveredId !== 'power') { soundService.playNavigation(); setHoveredId('power'); }
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
            color: '#FFCC00',
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

    let wheelTimeout: NodeJS.Timeout | null = null;
    const handleWheel = (e: WheelEvent) => {
      if (wheelTimeout) return;

      const totalItems = users.length + 1;
      const allIds = ['add', ...users.map(u => u.id)];
      const currentIndex = allIds.indexOf(hoveredId || 'add');

      if (e.deltaY > 5 || e.deltaX > 5) {
        if (hoveredId === 'power' || currentIndex >= totalItems - 1) return;
        soundService.playNavigation();
        setHoveredId(allIds[currentIndex + 1]);
        wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 300);
      } else if (e.deltaY < -5 || e.deltaX < -5) {
        if (hoveredId === 'power' || currentIndex <= 0) return;
        soundService.playNavigation();
        setHoveredId(allIds[currentIndex - 1]);
        wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 300);
      }
    };

    if (Platform.OS === 'web') {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('wheel', handleWheel, { passive: false });
    }

    // ── Gamepad polling ──────────────────────────────────────────────────
    let rafId: number;
    const prevButtons = new Array(16).fill(false);
    let lastMoveTime = 0;
    const THROTTLE = 300;

    const poll = () => {
      const gp = navigator.getGamepads()[0];
      if (gp) {
        const now = Date.now();
        const dispatch = (key: string) => {
          setInputMode('gamepad');
          const ev = new KeyboardEvent('keydown', { key } as any);
          (ev as any).fromGamepad = true;
          window.dispatchEvent(ev);
          lastMoveTime = now;
        };
        if (now - lastMoveTime > THROTTLE) {
          if (gp.buttons[14]?.pressed || gp.axes[0] < -0.5) dispatch('ArrowLeft');
          else if (gp.buttons[15]?.pressed || gp.axes[0] > 0.5) dispatch('ArrowRight');
          else if (gp.buttons[12]?.pressed || gp.axes[1] < -0.5) dispatch('ArrowUp');
          else if (gp.buttons[13]?.pressed || gp.axes[1] > 0.5) dispatch('ArrowDown');
        }
        const check = (idx: number, key: string) => {
          if (gp.buttons[idx]?.pressed && !prevButtons[idx]) dispatch(key);
          prevButtons[idx] = gp.buttons[idx]?.pressed;
        };
        check(0, 'Enter');
      }
      rafId = requestAnimationFrame(poll);
    };

    if (Platform.OS === 'web') rafId = requestAnimationFrame(poll);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(rafId);
      if (Platform.OS === 'web') {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('wheel', handleWheel);
      }
    };
  }, [hoveredId, users]);

  const handleSelect = (user: UserProfile) => {
    soundService.playActivation?.();
    setTimeout(() => {
      toastService.show('Logged in to your PS5.');
    }, 700);
    onUserSelected(user);
  };

  const bgInterpolate = bgPulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,212,255,0.03)', 'rgba(0,212,255,0.08)'],
  });

  const totalItems = users.length + 1;
  const allIds = ['add', ...users.map(u => u.id)];
  const currentIndex = allIds.indexOf(hoveredId || 'add');
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const middleIndex = (totalItems - 1) / 2;

  useEffect(() => {
    Animated.spring(animatedIndex, {
      toValue: safeIndex,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, [safeIndex]);

  const translateX = animatedIndex.interpolate({
    inputRange: [-10, 100],
    outputRange: [(middleIndex - -10) * 204, (middleIndex - 100) * 204]
  });

  return (
    <View style={styles.container}>
      {/* BACKGROUND */}
      <Video
        source={require('@/assets/video/particles.mp4')}
        style={StyleSheet.absoluteFillObject}
        resizeMode={ResizeMode.STRETCH}
        shouldPlay
        isLooping
        isMuted
      />
      <View style={styles.overlay} />

      {/* CLOCK */}
      <View style={styles.topRight}>
        <Text style={styles.timeText}>{time}</Text>
      </View>

      {/* TITLE */}
      <View style={styles.titleArea}>
        <Text style={styles.title}>{t('userSelect.title')}</Text>
        <Text style={styles.subtitle}>{t('userSelect.subtitle')}</Text>
      </View>

      {/* USER CARDS */}
      <Animated.View style={[styles.cardsRow, { transform: [{ translateX }] }]}>

        {/* ADD USER */}
        <Animated.View style={{
          opacity: animatedIndex.interpolate({
            inputRange: [-2, -1, 0, 1, 2],
            outputRange: [0.1, 0.4, 1, 0.4, 0.1],
            extrapolate: 'clamp'
          })
        }}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.cardWrapper}
            onPress={() => { }}
          >
            <View style={[styles.card, hoveredId === 'add' && styles.cardFocused]}>
              <View style={styles.addIconCircle}>
                <Ionicons name="add" size={40} color="#FFF" />
              </View>
            </View>
            <Text style={styles.userName}>{t('userSelect.addUser')}</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* USERS */}
        {users.map((user, idx) => {
          const isFocused = hoveredId === user.id;
          const itemIndex = idx + 1;
          return (
            <Animated.View key={user.id} style={{
              opacity: animatedIndex.interpolate({
                inputRange: [itemIndex - 2, itemIndex - 1, itemIndex, itemIndex + 1, itemIndex + 2],
                outputRange: [0.1, 0.4, 1, 0.4, 0.1],
                extrapolate: 'clamp'
              })
            }}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.cardWrapper}
                onPress={() => handleSelect(user)}
              >
                {/* ¡Toda la magia ocurre aquí dentro de manera limpia! */}
                <RadarFocusWrapper id={user.id} isFocused={isFocused} size={194} innerSize={isFocused ? 180 : 160}>
                  <View style={[styles.card, isFocused && styles.cardFocused]}>
                    <Image
                      source={{ uri: (user.settings?.useSteamAvatar && user.steamAvatarUrl) ? user.steamAvatarUrl : ((user as any).avatarBase64 || user.avatar) }}
                      style={styles.avatarImg}
                    />
                  </View>
                </RadarFocusWrapper>
                <Text style={[styles.userName, isFocused && styles.userNameFocused]}>
                  {user.name}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </Animated.View>

      {/* POWER BUTTON */}
      <TouchableOpacity
        style={[styles.powerButton, hoveredId === 'power' && styles.powerButtonFocused]}
        activeOpacity={0.7}
        onPress={() => {
          if (Platform.OS === 'web' && (window as any).electronAPI) {
            (window as any).electronAPI.closeApp();
          }
        }}
      >
        <Ionicons name="power" size={35} color="#FFF" />
      </TouchableOpacity>
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
  customBg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
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
    fontFamily: 'SSTLight',
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
    fontFamily: 'SSTLight',
    fontWeight: '300',
    letterSpacing: 2,
    marginBottom: 10,
  },
  subtitle: {
    color: '#c0c0c0ff',
    fontSize: 23,
    fontFamily: 'SSTLight',
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 50,
  },
  cardWrapper: {
    alignItems: 'center',
    width: 194,
    height: 280,
    justifyContent: 'center',
  },
  // Outer container that holds the canvas + circle (no overflow clip here)
  avatarStack: {
    width: 164,
    height: 164,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  card: {
    width: 160,
    height: 160,
    borderRadius: 80,        // 50% via number
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 0,          // border removed — radar canvas handles it
    zIndex: 1,
  },
  cardFocused: {
    width: 180,
    height: 180,
    borderRadius: 90,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    color: '#AAA',
    fontSize: 18,
    fontFamily: 'SSTRg',
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 15,
  },
  userNameFocused: {
    color: '#FFF',
    fontWeight: '400',
    //fontStyle: 'italic',
  },
  optionsHint: {
    position: 'absolute',
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
});