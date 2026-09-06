import React, { useState, useEffect, useRef, useMemo } from 'react';
import RadarFocusWrapper from './RadarFocusWrapper';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import ControlPrompt from './ControlPrompt';
import { soundService } from '../services/soundService';
import { toastService } from '@/services/toastService';
import { useTranslation } from '@/contexts/LanguageContext';
import BackgroundVideo from './BackgroundVideo';

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
  avatarPath?: string;
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
  onlineId?: string;
  coverImage?: string;
  about?: string;
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
    settings: { autoPlayVideo: true, syncPreferences: DEFAULT_SYNC_PREFERENCES, language: 'en' },
  },
  {
    id: '2',
    name: 'Player 2',
    avatar: 'assets/images/userDefault.jpeg',
    color: '#00D4FF',
    settings: { autoPlayVideo: true, syncPreferences: DEFAULT_SYNC_PREFERENCES, language: 'en' },
  },
];

// NOTA: se eliminó un `startRadarAnimation` local que dibujaba sobre el mismo
// canvas `radar-${user.id}` que ya anima `RadarFocusWrapper` internamente.
// Eran dos loops de requestAnimationFrame redibujando el mismo <canvas> a la
// vez — trabajo duplicado sin efecto visual adicional. RadarFocusWrapper ya
// escala su propio canvas según el prop `size`, así que basta con pasarle
// el tamaño correcto (ver `s(205)` más abajo) para que el radar responda
// igual que el resto de la tarjeta en pantallas anchas.

// ─── Component ───────────────────────────────────────────────────────────────
export default function UserSelectScreen({ onUserSelected }: UserSelectScreenProps) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [homeBg, setHomeBg] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [inputMode, setInputMode] = useState<'keyboard' | 'gamepad'>('keyboard');

  const animatedIndex = useRef(new Animated.Value(0)).current;

  // ── Escalado responsive (mismo patrón que WelcomeWidgets) ────────────────
  // scale = 1 en un panel de referencia 1920x1080. Al tomar el mínimo entre
  // el ratio de ancho y el de alto, en pantallas ultrawide (21:9, 32:9) el
  // contenido crece según el ALTO disponible (que sigue siendo 1080/1440/etc.)
  // sin estirarse de más por el ancho extra — el ancho extra simplemente deja
  // ver más fondo a los lados, igual que en un PS5 real.
  const nativeDimensions = useWindowDimensions();

  const [screenDimensions, setScreenDimensions] = useState({
    width: nativeDimensions.width,
    height: nativeDimensions.height,
  });

  const windowWidth = screenDimensions.width;
  const windowHeight = screenDimensions.height;

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let timers: ReturnType<typeof setTimeout>[] = [];

    const updateDimensions = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      if (width <= 0 || height <= 0) return;

      setScreenDimensions(prev => {
        if (prev.width === width && prev.height === height) {
          return prev;
        }

        return { width, height };
      });
    };

    const refreshAfterFullscreen = () => {
      timers.forEach(clearTimeout);
      timers = [];

      updateDimensions();

      [50, 150, 300, 600, 1000].forEach(delay => {
        timers.push(
          setTimeout(updateDimensions, delay)
        );
      });
    };

    window.addEventListener('resize', refreshAfterFullscreen);
    window.addEventListener('orientationchange', refreshAfterFullscreen);
    document.addEventListener('fullscreenchange', refreshAfterFullscreen);

    // Medición inicial
    refreshAfterFullscreen();

    return () => {
      window.removeEventListener('resize', refreshAfterFullscreen);
      window.removeEventListener('orientationchange', refreshAfterFullscreen);
      document.removeEventListener('fullscreenchange', refreshAfterFullscreen);

      timers.forEach(clearTimeout);
    };
  }, []);

  const scale = useMemo(
    () => Math.min(windowWidth / 1920, windowHeight / 1080),
    [windowWidth, windowHeight]
  );
  const s = (v: number) => Math.max(1, Math.round(v * scale));

  // ── Gamepad polling throttle state ───────────────────────────────────────
  // These MUST be refs (not locals inside the effect below) because that
  // effect depends on [hoveredId, users] and gets re-created on every
  // navigation step. If lastMoveTime/prevButtons lived inside the effect,
  // each re-creation would reset lastMoveTime to 0, bypassing the throttle
  // and causing the stick to fire several moves almost instantly while held.
  const lastGamepadMoveTimeRef = useRef(0);
  const prevGamepadButtonsRef = useRef<boolean[]>(new Array(16).fill(false));
  const isFirstPollRef = useRef(true);
  const selectedRef = useRef(false);

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
            settings: { autoPlayVideo: true, syncPreferences: DEFAULT_SYNC_PREFERENCES, language: 'en' },
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
    const THROTTLE = 300;

    const poll = () => {
      const gp = navigator.getGamepads()[0];
      if (gp) {
        if (isFirstPollRef.current) {
          isFirstPollRef.current = false;
          gp.buttons.forEach((b, idx) => {
            prevGamepadButtonsRef.current[idx] = !!b?.pressed;
          });
          rafId = requestAnimationFrame(poll);
          return;
        }

        const now = Date.now();
        const dispatch = (key: string) => {
          setInputMode('gamepad');
          const ev = new KeyboardEvent('keydown', { key } as any);
          (ev as any).fromGamepad = true;
          window.dispatchEvent(ev);
          lastGamepadMoveTimeRef.current = now;
        };
        if (now - lastGamepadMoveTimeRef.current > THROTTLE) {
          if (gp.buttons[14]?.pressed || gp.axes[0] < -0.5) dispatch('ArrowLeft');
          else if (gp.buttons[15]?.pressed || gp.axes[0] > 0.5) dispatch('ArrowRight');
          else if (gp.buttons[12]?.pressed || gp.axes[1] < -0.5) dispatch('ArrowUp');
          else if (gp.buttons[13]?.pressed || gp.axes[1] > 0.5) dispatch('ArrowDown');
        }
        const check = (idx: number, key: string) => {
          if (gp.buttons[idx]?.pressed && !prevGamepadButtonsRef.current[idx]) dispatch(key);
          prevGamepadButtonsRef.current[idx] = !!gp.buttons[idx]?.pressed;
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
    if (selectedRef.current) return;
    selectedRef.current = true;
    soundService.playActivation?.();
    setTimeout(() => {
      toastService.show(t('toast.loggedPS5'), { source: 'system', icon: require('@/assets/icons/Logonegro.png') });
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

  // Antes este valor estaba fijo en 204px, pero cardWrapper (194) + gap (50)
  // suman 244 — el desfase hacía que el carrusel no quedara perfectamente
  // centrado. Ahora se deriva del mismo tamaño escalado que usan los estilos,
  // así el desplazamiento siempre coincide con el layout real en cualquier
  // resolución/aspect ratio.
  const CARD_WRAPPER_WIDTH = s(194);
  const CARD_GAP = s(50);
  const ITEM_SPACING = CARD_WRAPPER_WIDTH + CARD_GAP;

  const translateX = animatedIndex.interpolate({
    inputRange: [-10, 100],
    outputRange: [(middleIndex - -10) * ITEM_SPACING, (middleIndex - 100) * ITEM_SPACING]
  });

  return (
    <View style={styles.container}>
      {/* BACKGROUND — COVER en vez de STRETCH: STRETCH deforma la imagen al
          rellenar un contenedor 21:9/32:9 que no comparte el aspect ratio
          original del video; COVER recorta manteniendo proporciones, igual
          que BackgroundVideo.tsx hace en el resto de la app. */}
      <BackgroundVideo
        source={require('../assets/video/particles.mp4')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        shouldPlay
        isLooping
        muted
      />
      <View style={styles.overlay} />

      {/* CLOCK */}
      <View style={[styles.topRight, { top: s(40), right: s(60) }]}>
        <Text style={[styles.timeText, { fontSize: s(22) }]}>{time}</Text>
      </View>

      {/* TITLE */}
      <View style={[styles.titleArea, { marginBottom: s(80), marginTop: s(-40) }]}>
        <Text style={[styles.title, { fontSize: s(48), marginBottom: s(10) }]}>{t('userSelect.title')}</Text>
        <Text style={[styles.subtitle, { fontSize: s(23) }]}>{t('userSelect.subtitle')}</Text>
      </View>

      {/* USER CARDS */}
      <Animated.View style={[styles.cardsRow, { gap: CARD_GAP, transform: [{ translateX }] }]}>

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
            style={[styles.cardWrapper, { width: CARD_WRAPPER_WIDTH, height: s(280) }]}
            onPress={() => { }}
          >
            <View style={[
              styles.card,
              { width: s(160), height: s(160), borderRadius: s(80) },
              hoveredId === 'add' && [styles.cardFocused, { width: s(180), height: s(180), borderRadius: s(90) }],
            ]}>
              <View style={[styles.addIconCircle, { width: s(60), height: s(60), borderRadius: s(30) }]}>
                <Ionicons name="add" size={s(40)} color="#FFF" />
              </View>
            </View>
            <Text style={[styles.userName, { fontSize: s(18), marginTop: s(15) }]}>{t('userSelect.addUser')}</Text>
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
                style={[styles.cardWrapper, { width: CARD_WRAPPER_WIDTH, height: s(280) }]}
                onPress={() => handleSelect(user)}
              >
                {/* ¡Toda la magia ocurre aquí dentro de manera limpia! */}
                <RadarFocusWrapper id={user.id} isFocused={isFocused} size={s(205)} innerSize={s(isFocused ? 180 : 160)}>
                  <View style={[
                    styles.card,
                    { width: s(160), height: s(160), borderRadius: s(80) },
                    isFocused && [styles.cardFocused, { width: s(180), height: s(180), borderRadius: s(90) }],
                  ]}>
                    <Image
                      source={{ uri: (user.settings?.useSteamAvatar && user.steamAvatarUrl) ? user.steamAvatarUrl : ((user as any).avatarBase64 || user.avatar) }}
                      style={styles.avatarImg}
                    />
                  </View>
                </RadarFocusWrapper>
                <Text style={[styles.userName, { fontSize: s(18), marginTop: s(15) }, isFocused && styles.userNameFocused]}>
                  {user.name}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </Animated.View>

      {/* POWER BUTTON */}
      <TouchableOpacity
        style={[
          styles.powerButton,
          { bottom: s(50), width: s(60), height: s(60), borderRadius: s(30) },
          hoveredId === 'power' && styles.powerButtonFocused,
        ]}
        activeOpacity={0.7}
        onPress={() => {
          if (Platform.OS === 'web' && (window as any).electronAPI) {
            (window as any).electronAPI.closeApp();
          }
        }}
      >
        <Ionicons name="power" size={s(35)} color={hoveredId === 'power' ? '#000000ff' : '#FFF'} />
      </TouchableOpacity>
    </View>
  );
}

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
    backgroundColor: '#ffffffff',
    borderColor: '#FFF',
    transform: [{ scale: 1.2 }],
    shadowColor: '#ffffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
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