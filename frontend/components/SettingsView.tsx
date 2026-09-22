import { PSIcons } from '@/constants/psIcons';
import { useTranslation } from '@/contexts/LanguageContext';
import { LANGUAGE_OPTIONS, Language } from '@/i18n/translations';
import { soundService } from '@/services/soundService';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { toastService } from '../services/toastService';
import { formatPlaytime } from '../services/playtimeService';
import {
  searchSteamDeckRepo,
  SteamDeckRepoPost,
  SteamDeckRepoSort,
  SteamDeckRepoVideoType,
} from '../services/steamDeckRepoService';
import BackgroundVideo from './BackgroundVideo';
import PSIcon from './PSIcon';
import { UserProfile } from './UserSelectScreen';
import SpinningBorderSearch from './SpinningBorderSearch';

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i++) {
    const aNum = aParts[i] || 0;
    const bNum = bParts[i] || 0;
    if (aNum > bNum) return 1;
    if (aNum < bNum) return -1;
  }
  return 0;
}

export type SettingsScreenType =
  | 'main'
  | 'guide'
  | 'accessibility'
  | 'users_and_accounts'
  | 'profile_edit'
  | 'profile_edit_detail'
  | 'system';

type ProfileEditSection =
  | 'name'
  | 'onlineId'
  | 'picture'
  | 'avatar'
  | 'cover'
  | 'about'
  | 'languages';

const PROFILE_EDIT_SECTIONS: ProfileEditSection[] = [
  'name',
  'onlineId',
  'picture',
  'avatar',
  'cover',
  'about',
  'languages',
];

const OVERLAY_COMBO_OPTIONS = [
  { id: 'SELECT_START', labelKey: 'settings.comboSelectStart' },
  { id: 'L3_R3', labelKey: 'settings.comboL3R3' },
  { id: 'L1_R1', labelKey: 'settings.comboL1R1' },
  { id: 'L2_R2_START', labelKey: 'settings.comboL2R2Start' },
] as const;

// Tipo de filtro de la sección Splash Videos: los tipos que soporta la API de
// SteamDeckRepo, más un pseudo-tipo local 'downloaded' que no viaja a la API
// y en su lugar muestra los videos que el usuario ya descargó anteriormente.
type SplashFilterType = SteamDeckRepoVideoType | 'downloaded';

// Post de SteamDeckRepo con metadata extra que agregamos al guardarlo en el
// historial local de descargas (fecha y a qué target se aplicó por última vez).
type DownloadedSplashPost = SteamDeckRepoPost & {
  downloadedAt: number;
  lastTarget: 'boot' | 'suspend';
};

// Acciones disponibles en el modal de preview de un Splash Video.
type SplashModalAction = { id: 'boot' | 'suspend' | 'remove'; label: string };

const SPLASH_DOWNLOADED_STORAGE_KEY = 'wps5_splash_downloaded_v1';



function applyOverlaySettingsToElectron(enabled: boolean, combo: string) {
  if (Platform.OS === 'web' && (window as any).electronAPI?.setOverlaySettings) {
    (window as any).electronAPI.setOverlaySettings({ enabled, combo });
  }
}

type LauncherPlayBehavior = 'hide' | 'minimize' | 'background';

const LAUNCHER_BEHAVIOR_OPTIONS: {
  id: LauncherPlayBehavior;
  labelKey: string;
  descKey: string;
}[] = [
    { id: 'hide', labelKey: 'settings.launcherBehaviorHide', descKey: 'settings.launcherBehaviorHideDesc' },
    { id: 'minimize', labelKey: 'settings.launcherBehaviorMinimize', descKey: 'settings.launcherBehaviorMinimizeDesc' },
    { id: 'background', labelKey: 'settings.launcherBehaviorBackground', descKey: 'settings.launcherBehaviorBackgroundDesc' },
  ];

function applyLauncherBehaviorToElectron(behavior: LauncherPlayBehavior) {
  if (Platform.OS === 'web' && (window as any).electronAPI?.setLauncherPlayBehavior) {
    (window as any).electronAPI.setLauncherPlayBehavior(behavior);
  }
}

export function resolveImageSource(img: any) {
  if (!img) return undefined;
  if (typeof img === 'string') return { uri: img };
  if (typeof img === 'object' && img.uri) return img;
  return img;
}

// ── Perfil: pestañas, secciones navegables y helpers ─────────────────────
const PROFILE_TABS = ['overview', 'friends'] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

// Cada pestaña se compone de "secciones" navegables con el mando/teclado.
// Las secciones verticales (recent, friends, about) se recorren con ↑/↓ item
// por item; las horizontales (library) se recorren con ←/→ y ↑/↓ cambia de
// sección.
type ProfileSectionId = 'recent' | 'library' | 'about' | 'friends';
type ProfileSection = { id: ProfileSectionId; count: number; horizontal?: boolean };

const PROFILE_RECENT_LIMIT = 3;

// Valores por defecto estables: un `[]` nuevo en cada render invalidaría los
// useMemo del perfil.
const NO_GAMES: any[] = [];
const NO_USERS: UserProfile[] = [];

const gameMinutes = (g: any): number =>
  Number(g?.playtimeMinutes) || Number(g?.playtime_forever) || 0;

// "17h" / "22m": formato compacto para los números grandes de las estadísticas.
const formatCompactMinutes = (minutes: number): string =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h` : `${Math.max(0, Math.round(minutes))}m`;

type WindowRect = { x: number; y: number; w: number; h: number };

// Mide un nodo en coordenadas de ventana. Usa measureInWindow (API de React
// Native, también disponible en RN Web) y cae a getBoundingClientRect.
const measureNode = (node: any): Promise<WindowRect | null> =>
  new Promise((resolve) => {
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x: number, y: number, w: number, h: number) => resolve({ x, y, w, h }));
    } else if (node && typeof node.getBoundingClientRect === 'function') {
      const r = node.getBoundingClientRect();
      resolve({ x: r.left, y: r.top, w: r.width, h: r.height });
    } else {
      resolve(null);
    }
  });

// Portada con fondo difuminado de la misma imagen: se ve bien sin importar la
// proporción del arte original (cuadrado, vertical o apaisado).
function BlurredArt({
  source,
  style,
  radius = 8,
  placeholderSize = 28,
}: {
  source: any;
  style?: any;
  radius?: number;
  placeholderSize?: number;
}) {
  const resolved = resolveImageSource(source);
  return (
    <View
      style={[
        { overflow: 'hidden', borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.06)' },
        style,
      ]}
    >
      {resolved ? (
        <>
          <Image
            source={resolved}
            blurRadius={24}
            contentFit="cover"
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
          <Image
            source={resolved}
            contentFit="contain"
            style={StyleSheet.absoluteFillObject}
          />
        </>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="game-controller-outline" size={placeholderSize} color="rgba(255,255,255,0.3)" />
        </View>
      )}
    </View>
  );
}

interface SettingsViewProps {
  visible: boolean;
  onClose: () => void;
  activeUser: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  allUsers?: UserProfile[];
  onSwitchUser?: (user: UserProfile) => void;
  libraryGames?: any[];
  media?: any[];
  language: Language;
  changeLanguage: (lang: Language) => void;
  onOpenBgModal: () => void;
  onSelectWallpaperFolder: () => void;
  onSelectCaptureFolder: () => void;
  onSelectRpcs3Folder: () => void;
  onOpenAvatarModal?: () => void;
  onSelectAvatarFolder?: () => void;
  initialScreen?: SettingsScreenType;
  // Se dispara al presionar Enter / tocar un juego en el perfil (Actividad
  // reciente o Biblioteca). Opcional: si no se pasa, esos items solo se enfocan.
  onGamePress?: (game: any) => void;
}

export default function SettingsView({
  visible,
  onClose,
  activeUser,
  updateUser,
  allUsers = NO_USERS,
  onSwitchUser,
  libraryGames = NO_GAMES,
  media = [],
  language,
  changeLanguage,
  onOpenBgModal,
  onSelectWallpaperFolder,
  onSelectCaptureFolder,
  onSelectRpcs3Folder,
  onOpenAvatarModal,
  onSelectAvatarFolder,
  initialScreen = 'main',
  onGamePress,
}: SettingsViewProps) {
  const { t } = useTranslation();

  // Traduce con respaldo: si la clave aún no existe en translations.ts, t()
  // devuelve la clave tal cual y se muestra el texto de respaldo en su lugar.
  const tr = (key: string, fallback: string): string => {
    const value = (t as any)(key);
    return !value || value === key ? fallback : value;
  };

  // Escala de UI en función de la resolución real de la ventana.
  // Usa el eje MAS grande (no el mas chico) respecto a 1920x1080, para que
  // ventanas ultra-wide (mucho ancho, alto normal) no encojan todo el panel.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const s = useMemo<ScaleFn>(() => {
    const scaleW = windowWidth / 1920;
    const scaleH = windowHeight / 1080;
    const scale = Math.min(Math.max(Math.max(scaleW, scaleH), 0.6), 1.25);
    return (px: number) => {
      if (px === 0) return 0;
      const scaled = Math.round(px * scale);
      return scaled === 0 ? Math.sign(px) : scaled;
    };
  }, [windowWidth, windowHeight]);
  const styles = useMemo(() => createStyles(s), [s]);

  const [currentScreen, setCurrentScreen] = useState<SettingsScreenType>(initialScreen);
  const [screenHistory, setScreenHistory] = useState<SettingsScreenType[]>([]);

  // Focus navigation state
  const [mainFocusIndex, setMainFocusIndex] = useState(0);
  const [subFocusIndex, setSubFocusIndex] = useState(0);
  const [accessibilityLeftIndex, setAccessibilityLeftIndex] = useState(0);
  const [accessibilityFocusArea, setAccessibilityFocusArea] = useState<'left' | 'right'>('left');
  const [systemLeftIndex, setSystemLeftIndex] = useState(0);
  const [systemFocusArea, setSystemFocusArea] = useState<'left' | 'right'>('left');
  const [profileActiveTab, setProfileActiveTab] = useState<ProfileTab>('overview');
  const [profileFocusArea, setProfileFocusArea] = useState<'header_actions' | 'tabs' | 'content'>('header_actions');
  const [profileActionIndex, setProfileActionIndex] = useState(0);
  const [profileEditSection, setProfileEditSection] = useState<ProfileEditSection>('name');
  // Foco dentro del contenido del perfil: sección (índice en profileSections)
  // e item dentro de esa sección (fila en listas verticales, columna en la
  // biblioteca horizontal).
  const [profileSectionIndex, setProfileSectionIndex] = useState(0);
  const [profileItemIndex, setProfileItemIndex] = useState(0);
  // true cuando la página del perfil ya se desplazó lo suficiente como para
  // mostrar la barra superior fija ("← Perfil").
  const [profileScrolled, setProfileScrolled] = useState(false);

  // Profile edit fields
  const [editName, setEditName] = useState(activeUser?.name || '');
  const [editOnlineId, setEditOnlineId] = useState(activeUser?.onlineId || '');
  const [editAbout, setEditAbout] = useState(activeUser?.about || '');
  const [editCoverImage, setEditCoverImage] = useState(activeUser?.coverImage || '');

  // HDMI toggles state for System sub-screen
  const [hdmiDeviceLink, setHdmiDeviceLink] = useState(true);
  const [hdmiHdcp, setHdmiHdcp] = useState(false);

  // Splash Videos (SteamDeckRepo) state
  const [splashQuery, setSplashQuery] = useState('');
  const [splashType, setSplashType] = useState<SplashFilterType>('all');
  const [splashSort, setSplashSort] = useState<SteamDeckRepoSort>('newest');
  const [splashPage, setSplashPage] = useState(1);
  const [splashItems, setSplashItems] = useState<SteamDeckRepoPost[]>([]);
  const [splashTotalPages, setSplashTotalPages] = useState(1);
  const [splashLoading, setSplashLoading] = useState(false);
  const [splashError, setSplashError] = useState<string | null>(null);
  const [splashDownloadingId, setSplashDownloadingId] = useState<string | null>(null);
  // Historial local de videos ya descargados ("Descargados" / "Propios").
  // Se persiste en localStorage porque el archivo final en disco
  // (userData/WConsole/splash/{boot|suspend}.webm) se sobreescribe en cada
  // descarga y no guarda de qué post de SteamDeckRepo vino.
  const [splashDownloadedItems, setSplashDownloadedItems] = useState<DownloadedSplashPost[]>(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(SPLASH_DOWNLOADED_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        // Ignora datos corruptos/inaccesibles y arranca con lista vacía.
      }
    }
    return [];
  });
  // Navegación con mando/teclado dentro de la sección Splash Videos
  const [splashFocusZone, setSplashFocusZone] = useState<'filters' | 'grid' | 'pager'>('filters');
  const [splashFilterIndex, setSplashFilterIndex] = useState(0);
  const [splashGridFlatIndex, setSplashGridFlatIndex] = useState(0); // índice de tarjeta enfocada
  const [splashPagerIndex, setSplashPagerIndex] = useState(0); // 0=anterior, 1=siguiente
  const [splashGridCols, setSplashGridCols] = useState(3);
  // Modal de preview: tarjeta seleccionada (reproduce su video) e índice del
  // botón enfocado dentro del modal (Usar en Boot / Usar en Suspend / Quitar).
  const [splashPreviewPost, setSplashPreviewPost] = useState<SteamDeckRepoPost | null>(null);
  const [splashModalFocusIndex, setSplashModalFocusIndex] = useState(0);

  // Guarda (o actualiza) un post en el historial local de descargas y lo
  // persiste en localStorage.
  const registerDownloadedSplash = (post: SteamDeckRepoPost, target: 'boot' | 'suspend') => {
    setSplashDownloadedItems((prev) => {
      const next: DownloadedSplashPost[] = [
        { ...post, downloadedAt: Date.now(), lastTarget: target },
        ...prev.filter((p) => p.id !== post.id),
      ];
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(SPLASH_DOWNLOADED_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Si localStorage falla (cuota, modo privado, etc.) seguimos igual
          // con el estado en memoria de esta sesión.
        }
      }
      return next;
    });
  };

  // Quita un post del historial local de descargas (no borra el archivo
  // .webm ya usado, solo deja de listarlo en el filtro "Descargados").
  const removeDownloadedSplash = (postId: string) => {
    setSplashDownloadedItems((prev) => {
      const next = prev.filter((p) => p.id !== postId);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(SPLASH_DOWNLOADED_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ver comentario en registerDownloadedSplash.
        }
      }
      return next;
    });
  };

  // Lista de "Descargados" filtrada por el buscador y ordenada según el
  // mismo selector de orden que se usa para los resultados de la API.
  const filteredDownloadedSplashItems = useMemo(() => {
    const q = splashQuery.trim().toLowerCase();
    const filtered = q
      ? splashDownloadedItems.filter(
        (p) => p.title?.toLowerCase().includes(q) || p.author?.toLowerCase().includes(q)
      )
      : splashDownloadedItems;

    return [...filtered].sort((a, b) => {
      switch (splashSort) {
        case 'oldest':
          return a.downloadedAt - b.downloadedAt;
        case 'likes':
          return (b.likes || 0) - (a.likes || 0);
        case 'downloads':
          return (b.downloads || 0) - (a.downloads || 0);
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'newest':
        default:
          return b.downloadedAt - a.downloadedAt;
      }
    });
  }, [splashDownloadedItems, splashQuery, splashSort]);

  const isShowingDownloadedSplash = splashType === 'downloaded';
  // Items que efectivamente se muestran en la grilla: los resultados de la
  // API de SteamDeckRepo, o el historial local cuando el filtro activo es
  // "Descargados".
  const displayedSplashItems: SteamDeckRepoPost[] = isShowingDownloadedSplash
    ? filteredDownloadedSplashItems
    : splashItems;

  // ── Perfil: datos derivados ──────────────────────────────────────────────
  // Excluye Welcome (id='1'), PlayStation Store (id='5') y el tile Last Played
  // (isLastPlayed): son entradas del menú, no juegos reales.
  const profileLibraryGames = useMemo(
    () => libraryGames.filter((g: any) => g.id !== '1' && g.id !== '5' && !g.isLastPlayed),
    [libraryGames],
  );

  // Últimos juegos jugados (más reciente primero), según su timestamp lastPlayed.
  const profileRecentGames = useMemo(
    () =>
      profileLibraryGames
        .filter((g: any) => Number(g.lastPlayed) > 0)
        .sort((a: any, b: any) => Number(b.lastPlayed) - Number(a.lastPlayed))
        .slice(0, PROFILE_RECENT_LIMIT),
    [profileLibraryGames],
  );

  const profileStats = useMemo(() => {
    const totalMinutes = profileLibraryGames.reduce((acc: number, g: any) => acc + gameMinutes(g), 0);
    const played = profileLibraryGames.filter((g: any) => gameMinutes(g) > 0);
    const topGame = played.reduce(
      (best: any, g: any) => (!best || gameMinutes(g) > gameMinutes(best) ? g : best),
      null as any,
    );
    return {
      gamesCount: profileLibraryGames.length,
      totalMinutes,
      averageMinutes: played.length ? Math.round(totalMinutes / played.length) : 0,
      topGame,
      topGameMinutes: topGame ? gameMinutes(topGame) : 0,
      favoritesCount: profileLibraryGames.filter((g: any) => g.isFavorite).length,
    };
  }, [profileLibraryGames]);

  const profileFriends = useMemo(
    () => (allUsers.length > 0 ? allUsers : activeUser ? [activeUser] : []),
    [allUsers, activeUser],
  );

  // Secciones navegables de la pestaña activa. Solo entran las que tienen
  // contenido, así el foco nunca cae en una sección vacía o inexistente.
  const profileSections = useMemo<ProfileSection[]>(() => {
    if (profileActiveTab === 'friends') {
      return profileFriends.length > 0 ? [{ id: 'friends', count: profileFriends.length }] : [];
    }
    const list: ProfileSection[] = [];
    if (profileRecentGames.length > 0) list.push({ id: 'recent', count: profileRecentGames.length });
    if (profileLibraryGames.length > 0) {
      list.push({ id: 'library', count: profileLibraryGames.length, horizontal: true });
    }
    if (activeUser?.about) list.push({ id: 'about', count: 1 });
    return list;
  }, [profileActiveTab, profileFriends, profileRecentGames, profileLibraryGames, activeUser?.about]);

  // Refs de cada item enfocable ("seccion:indice") y del ScrollView de la
  // página, para seguir el foco lógico con scroll automático.
  const profileItemRefs = useRef<Record<string, any>>({});
  const profileScrollRef = useRef<ScrollView>(null);
  const profileWrapperRef = useRef<View>(null); // visor de la página (para medir)
  const profileScrollY = useRef(0);
  const profileLibraryRef = useRef<ScrollView>(null);
  const profileLibraryViewportRef = useRef<View>(null);
  const profileLibraryScrollX = useRef(0);

  const nameInputRef = useRef<TextInput>(null);
  const onlineIdInputRef = useRef<TextInput>(null);
  const aboutInputRef = useRef<TextInput>(null);
  // Refs a los nodos de cada tarjeta de Splash Videos (indexados por su
  // posición en la grilla) para poder hacer scroll automático hacia la
  // tarjeta enfocada por mando/teclado.
  const splashCardRefs = useRef<Record<number, any>>({});

  useEffect(() => {
    if (visible) {
      setCurrentScreen(initialScreen);
      setScreenHistory([]);
      setMainFocusIndex(0);
      setSubFocusIndex(0);
      setAccessibilityLeftIndex(0);
      setAccessibilityFocusArea('left');
      setSystemLeftIndex(0);
      setSystemFocusArea('left');
      setProfileActiveTab('overview');
      setProfileEditSection('name');
      setProfileFocusArea('header_actions');
      setProfileSectionIndex(0);
      setProfileItemIndex(0);
      setProfileScrolled(false);
    }
  }, [visible, initialScreen]);

  useEffect(() => {
    if (activeUser) {
      setEditName(activeUser.name || '');
      setEditOnlineId(activeUser.onlineId || '');
      setEditAbout(activeUser.about || '');
      setEditCoverImage(activeUser.coverImage || '');
      // Sincroniza con el proceso principal de Electron el comportamiento de
      // suspensión guardado, para que aplique aunque el usuario no entre a
      // Ajustes en esta sesión (p.ej. al reabrir la app tras reiniciarla).
      applyLauncherBehaviorToElectron(
        ((activeUser.settings as any)?.launcherPlayBehavior || 'hide') as LauncherPlayBehavior
      );
    }
  }, [activeUser]);



  // Busca en SteamDeckRepo cuando la sección "Splash Videos" está activa
  // y cambian los filtros. Se debounce el texto de búsqueda para no
  // disparar una petición por cada tecla.
  useEffect(() => {
    if (currentScreen !== 'accessibility' || accessibilityLeftIndex !== 7) return;
    // "Descargados" es un filtro 100% local (historial en localStorage),
    // no dispara ninguna búsqueda contra SteamDeckRepo.
    if (splashType === 'downloaded') {
      setSplashLoading(false);
      setSplashError(null);
      return;
    }

    let cancelled = false;
    setSplashLoading(true);
    setSplashError(null);

    const timeout = setTimeout(async () => {
      try {
        const result = await searchSteamDeckRepo({
          query: splashQuery,
          type: splashType as SteamDeckRepoVideoType,
          sort: splashSort,
          page: splashPage,
          limit: 24,
        });
        if (!cancelled) {
          setSplashItems(result.items);
          setSplashTotalPages(result.totalPages || 1);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSplashItems([]);
          setSplashError(err?.message || 'No se pudo cargar SteamDeckRepo.');
        }
      } finally {
        if (!cancelled) setSplashLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [currentScreen, accessibilityLeftIndex, splashQuery, splashType, splashSort, splashPage]);

  // Vuelve a la página 1 cada vez que cambian los filtros (no en cada cambio de página).
  useEffect(() => {
    setSplashPage(1);
  }, [splashQuery, splashType, splashSort]);

  // Reinicia el foco de mando al entrar a la sección Splash Videos.
  useEffect(() => {
    if (accessibilityLeftIndex === 7) {
      setSplashFocusZone('filters');
      setSplashFilterIndex(0);
      setSplashGridFlatIndex(0);
      setSplashPagerIndex(0);
      setSplashPreviewPost(null);
    }
  }, [accessibilityLeftIndex]);

  // Mantiene el foco del perfil dentro de rango cuando cambian los datos, y si
  // no queda nada enfocable en el contenido devuelve el foco a las pestañas.
  useEffect(() => {
    if (profileSections.length === 0) {
      setProfileSectionIndex(0);
      setProfileItemIndex(0);
      setProfileFocusArea((prev) => (prev === 'content' ? 'tabs' : prev));
      return;
    }
    const sectionIdx = Math.min(profileSectionIndex, profileSections.length - 1);
    if (sectionIdx !== profileSectionIndex) setProfileSectionIndex(sectionIdx);
    const maxItem = profileSections[sectionIdx].count - 1;
    if (profileItemIndex > maxItem) setProfileItemIndex(maxItem);
  }, [profileSections, profileSectionIndex, profileItemIndex]);

  // El ScrollView no sigue solo al foco lógico: al mover el foco por el
  // contenido centramos el item enfocado; al volver a header/pestañas
  // regresamos arriba del todo.
  const focusedProfileSectionId = profileSections[profileSectionIndex]?.id;
  useEffect(() => {
    if (currentScreen !== 'users_and_accounts') return;
    if (profileFocusArea !== 'content') {
      profileScrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!focusedProfileSectionId) return;

    let cancelled = false;
    (async () => {
      const item = await measureNode(profileItemRefs.current[`${focusedProfileSectionId}:${profileItemIndex}`]);
      const viewport = await measureNode(profileWrapperRef.current);
      if (cancelled || !item || !viewport) return;

      // Vertical: centra el item en el visor de la página.
      const y = profileScrollY.current + (item.y - viewport.y) - (viewport.h - item.h) / 2;
      profileScrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });

      // Horizontal: la biblioteca tiene su propio ScrollView.
      if (focusedProfileSectionId === 'library') {
        const lib = await measureNode(profileLibraryViewportRef.current);
        if (cancelled || !lib) return;
        const x = profileLibraryScrollX.current + (item.x - lib.x) - (lib.w - item.w) / 2;
        profileLibraryRef.current?.scrollTo({ x: Math.max(0, x), animated: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentScreen, profileActiveTab, profileFocusArea, focusedProfileSectionId, profileItemIndex]);

  // Mantiene el índice de la grilla dentro de rango cuando cambian los resultados
  // (ya sean de la API o del historial local de "Descargados"). Un índice por
  // tarjeta, ya que ahora se enfoca la tarjeta completa (no un botón por lado).
  useEffect(() => {
    const maxFlat = Math.max(0, displayedSplashItems.length - 1);
    setSplashGridFlatIndex((prev) => Math.min(prev, maxFlat));
  }, [displayedSplashItems.length]);

  // Hace scroll automático hacia la tarjeta enfocada por mando/teclado, ya
  // que el ScrollView no la sigue solo (el foco es lógico, no de teclado
  // real del navegador).
  useEffect(() => {
    if (accessibilityLeftIndex !== 7 || splashFocusZone !== 'grid') return;
    const node = splashCardRefs.current[splashGridFlatIndex];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [accessibilityLeftIndex, splashFocusZone, splashGridFlatIndex, displayedSplashItems]);

  /**
   * Descarga un video de SteamDeckRepo vía Electron IPC y lo asigna
   * como splash de boot o de suspend para el usuario activo.
   *
   * Requiere que electron/main.js exponga un handler
   * `downloadSplashVideo(url, target)` que descargue el .webm a
   * userData/WConsole/splash/{boot|suspend}.webm y devuelva la ruta final.
   */
  const handleSetSplashVideo = async (post: SteamDeckRepoPost, target: 'boot' | 'suspend') => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI?.downloadSplashVideo) {
      toastService.show('La descarga de splash requiere la app de escritorio.');
      return;
    }
    setSplashDownloadingId(`${post.id}:${target}`);
    try {
      const res = await (window as any).electronAPI.downloadSplashVideo(post.downloadUrl, target);
      if (res?.success && res.path) {
        updateUser({
          settings: {
            ...activeUser?.settings,
            [target === 'boot' ? 'bootVideoPath' : 'suspendVideoPath']: res.path,
          } as any,
        });
        registerDownloadedSplash(post, target);
        toastService.show(
          target === 'boot' ? t('settings.bootVideoUpdated') : t('settings.suspendVideoUpdated')
        );
      } else {
        toastService.show(res?.error || t('settings.videoUpdateError'));
      }
    } catch (err: any) {
      toastService.show(err?.message || t('settings.videoUpdateError'));
    } finally {
      setSplashDownloadingId(null);
    }
  };

  // Acciones disponibles en el modal de preview, según si el post viene de
  // la búsqueda o del historial local de "Descargados".
  const splashModalActions: SplashModalAction[] = useMemo(() => {
    if (!splashPreviewPost) return [];
    const actions: SplashModalAction[] = [
      { id: 'boot', label: t('settings.chooseBootVideo') },
      { id: 'suspend', label: t('settings.chooseSuspendVideo') },
    ];
    if (isShowingDownloadedSplash) {
      actions.push({ id: 'remove', label: t('settings.removeDownloaded') });
    }
    return actions;
  }, [splashPreviewPost, isShowingDownloadedSplash]);

  // Ejecuta una acción del modal de preview. Si se pasa explícitamente
  // (click/touch), se usa esa; si no, se usa la que está enfocada por
  // teclado/mando (evita depender del estado recién actualizado).
  const runSplashModalAction = async (action?: SplashModalAction) => {
    const post = splashPreviewPost;
    const targetAction = action || splashModalActions[splashModalFocusIndex];
    if (!post || !targetAction || splashDownloadingId) return;
    if (targetAction.id === 'remove') {
      removeDownloadedSplash(post.id);
      setSplashPreviewPost(null);
      return;
    }
    await handleSetSplashVideo(post, targetAction.id);
    setSplashPreviewPost(null);
  };

  const openSplashPreview = (post: SteamDeckRepoPost) => {
    setSplashPreviewPost(post);
    setSplashModalFocusIndex(0);
  };

  const navigateToScreen = (screen: SettingsScreenType) => {
    soundService.playActivation?.();
    setScreenHistory((prev) => [...prev, currentScreen]);
    setCurrentScreen(screen);
    setSubFocusIndex(0);
    if (screen === 'system') {
      setSystemFocusArea('left');
      setSystemLeftIndex(0);
    } else if (screen === 'accessibility') {
      setAccessibilityFocusArea('left');
      setAccessibilityLeftIndex(0);
    } else if (screen === 'users_and_accounts') {
      setProfileFocusArea('header_actions');
      setProfileActionIndex(0);
      setProfileActiveTab('overview');
      setProfileSectionIndex(0);
      setProfileItemIndex(0);
      setProfileScrolled(false);
    }
  };

  const handleBack = () => {
    soundService.playBack?.();
    if (screenHistory.length > 0) {
      const prevScreen = screenHistory[screenHistory.length - 1];
      setScreenHistory((prev) => prev.slice(0, -1));
      setCurrentScreen(prevScreen);
    } else {
      onClose();
    }
  };

  // Avatar selection handler
  const handleSelectAvatar = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            updateUser({
              avatar: base64,
              avatarBase64: base64,
              settings: { ...activeUser?.settings, useSteamAvatar: false } as any,
            });
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }
  };

  const handleSteamLogin = async () => {
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      const res = await (window as any).electronAPI.steamLogin();
      if (res.success && res.steamId) {
        updateUser({ settings: { ...activeUser?.settings, steamId: res.steamId } as any });
      } else if (res.error && res.error !== 'Ventana de inicio de sesión cerrada') {
        toastService.show(t('settings.steamLoginError', { error: res.error }));
      }
    } else {
      toastService.show(t('settings.desktopOnly'));
    }
  };

  // Cover image selection handler
  const handleSelectCover = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setEditCoverImage(base64);
            updateUser({ coverImage: base64 });
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }
  };

  // ── Accessibility screen: right-column focus helpers ─────────────────────
  const getAccessibilityRightMaxIndex = () => {
    if (accessibilityLeftIndex === 0) return 2;
    if (accessibilityLeftIndex === 1) {
      const hasWallpaperPath = !!activeUser?.settings?.wallpaperPath;
      const hasCapturePath = !!activeUser?.settings?.capturePath;
      const hasRpcs3Path = !!(activeUser?.settings as any)?.rpcs3Path;
      const count = 2 + (hasWallpaperPath ? 1 : 0) + 1 + (hasCapturePath ? 1 : 0) + 1 + (hasRpcs3Path ? 1 : 0);
      return Math.max(0, count - 1);
    }
    if (accessibilityLeftIndex === 2) {
      const hasAvatarPath = !!activeUser?.settings?.avatarPath;
      const count = 2 + (hasAvatarPath ? 1 : 0);
      return Math.max(0, count - 1);
    }
    if (accessibilityLeftIndex === 3) return 0; // Steam: conectar/desvincular
    if (accessibilityLeftIndex === 4) return 1; // RetroAchievements: 2 inputs
    if (accessibilityLeftIndex === 5) return 3; // Smart Sync
    if (accessibilityLeftIndex === 6) return 1; // Overlay: toggle + combo
    if (accessibilityLeftIndex === 7) return 0; // Splash Videos: navegación por mouse/touch en la grilla
    return 0;
  };

  const persistOverlaySettings = (partial: { overlayEnabled?: boolean; overlayCombo?: string }) => {
    const nextEnabled = partial.overlayEnabled ?? (activeUser?.settings?.overlayEnabled !== false);
    const nextCombo = partial.overlayCombo ?? activeUser?.settings?.overlayCombo ?? 'SELECT_START';
    updateUser({
      settings: {
        ...activeUser?.settings,
        overlayEnabled: nextEnabled,
        overlayCombo: nextCombo,
      } as any,
    });
    applyOverlaySettingsToElectron(nextEnabled, nextCombo);
  };

  const persistLauncherBehavior = (behavior: LauncherPlayBehavior) => {
    updateUser({
      settings: {
        ...activeUser?.settings,
        launcherPlayBehavior: behavior,
      } as any,
    });
    applyLauncherBehaviorToElectron(behavior);
  };

  const activateAccessibilityRightItem = () => {
    if (accessibilityLeftIndex === 0) {
      if (subFocusIndex === 0) {
        updateUser({
          settings: {
            ...activeUser?.settings,
            autoPlayVideo: !(activeUser?.settings?.autoPlayVideo !== false),
          },
        });
      } else if (subFocusIndex === 1) {
        updateUser({
          settings: {
            ...activeUser?.settings,
            invertTransitionDirection: !activeUser?.settings?.invertTransitionDirection,
          },
        });
      } else if (subFocusIndex === 2) {
        const current = activeUser?.settings?.storeSource || 'ps5';
        updateUser({
          settings: { ...activeUser?.settings, storeSource: current === 'ps5' ? 'steam' : 'ps5' } as any,
        });
      }
      return;
    }

    if (accessibilityLeftIndex === 1) {
      const hasWallpaperPath = !!activeUser?.settings?.wallpaperPath;
      const hasCapturePath = !!activeUser?.settings?.capturePath;
      const hasRpcs3Path = !!(activeUser?.settings as any)?.rpcs3Path;
      let idx = 0;

      if (subFocusIndex === idx) {
        onClose();
        onOpenBgModal();
        return;
      }
      idx++;

      if (subFocusIndex === idx) {
        onSelectWallpaperFolder();
        return;
      }
      idx++;

      if (hasWallpaperPath) {
        if (subFocusIndex === idx) {
          updateUser({ settings: { ...activeUser?.settings, wallpaperPath: '' } as any });
          return;
        }
        idx++;
      }

      if (subFocusIndex === idx) {
        onSelectCaptureFolder();
        return;
      }
      idx++;

      if (hasCapturePath) {
        if (subFocusIndex === idx) {
          updateUser({ settings: { ...activeUser?.settings, capturePath: '' } as any });
          return;
        }
        idx++;
      }

      if (subFocusIndex === idx) {
        onSelectRpcs3Folder();
        return;
      }
      idx++;

      if (hasRpcs3Path) {
        if (subFocusIndex === idx) {
          updateUser({ settings: { ...activeUser?.settings, rpcs3Path: '' } as any });
          return;
        }
        idx++;
      }
      return;
    }

    if (accessibilityLeftIndex === 4) {
      // RetroAchievements — text inputs handled inline; Enter here is a no-op
      return;
    }

    if (accessibilityLeftIndex === 2) {
      const hasAvatarPath = !!activeUser?.settings?.avatarPath;
      let idx = 0;

      if (subFocusIndex === idx) {
        onClose();
        onOpenAvatarModal?.();
        return;
      }
      idx++;

      if (subFocusIndex === idx) {
        onSelectAvatarFolder?.();
        return;
      }
      idx++;

      if (hasAvatarPath) {
        if (subFocusIndex === idx) {
          updateUser({ settings: { ...activeUser?.settings, avatarPath: '' } as any });
          return;
        }
        idx++;
      }
      return;
    }

    if (accessibilityLeftIndex === 3) {
      // Steam
      if (activeUser?.settings?.steamId) {
        updateUser({ settings: { ...activeUser?.settings, steamId: '' } as any });
      } else {
        handleSteamLogin();
      }
      return;
    }

    if (accessibilityLeftIndex === 5) {
      const prefs: { key: 'ratingAndSummary' | 'cover' | 'background' | 'logo'; options: string[] }[] = [
        { key: 'ratingAndSummary', options: ['steam', 'igdb', 'rawg', 'none'] },
        { key: 'cover', options: ['steamgrid', 'igdb', 'rawg', 'none'] },
        { key: 'background', options: ['steamgrid', 'igdb', 'rawg', 'none'] },
        { key: 'logo', options: ['steamgrid', 'none'] },
      ];
      const pref = prefs[subFocusIndex];
      if (pref) {
        const currentSync = activeUser?.settings?.syncPreferences || {
          ratingAndSummary: 'steam',
          cover: 'steamgrid',
          background: 'steamgrid',
          logo: 'steamgrid',
        };
        const currentValue = (currentSync as any)[pref.key];
        const curIdx = pref.options.indexOf(currentValue);
        const nextValue = pref.options[(curIdx + 1) % pref.options.length];
        updateUser({
          settings: {
            ...activeUser?.settings,
            syncPreferences: { ...currentSync, [pref.key]: nextValue } as any,
          },
        });
      }
      return;
    }

    if (accessibilityLeftIndex === 6) {
      const overlayEnabled = activeUser?.settings?.overlayEnabled !== false;
      const overlayCombo = activeUser?.settings?.overlayCombo || 'SELECT_START';
      if (subFocusIndex === 0) {
        persistOverlaySettings({ overlayEnabled: !overlayEnabled });
      } else if (subFocusIndex === 1) {
        const curIdx = OVERLAY_COMBO_OPTIONS.findIndex((opt) => opt.id === overlayCombo);
        const next = OVERLAY_COMBO_OPTIONS[(curIdx + 1) % OVERLAY_COMBO_OPTIONS.length];
        persistOverlaySettings({ overlayCombo: next.id });
      }
      return;
    }

    if (accessibilityLeftIndex === 7) {
      // Splash Videos — la búsqueda, filtros y tarjetas se manejan con
      // mouse/touch directamente (onPress de cada control).
      return;
    }
  };

  // ── System screen: right-column focus helpers ────────────────────────────
  const getSystemRightMaxIndex = () => {
    if (systemLeftIndex === 1) return 1; // HDMI toggles
    if (systemLeftIndex === 2) return Math.max(0, LANGUAGE_OPTIONS.length - 1);
    if (systemLeftIndex === 4) return LAUNCHER_BEHAVIOR_OPTIONS.length - 1; // Comportamiento del launcher
    return 0;
  };

  const activateSystemRightItem = () => {
    if (systemLeftIndex === 1) {
      if (subFocusIndex === 0) setHdmiDeviceLink((prev) => !prev);
      else if (subFocusIndex === 1) setHdmiHdcp((prev) => !prev);
    } else if (systemLeftIndex === 2) {
      const opt = LANGUAGE_OPTIONS[subFocusIndex];
      if (opt) changeLanguage(opt.id);
    } else if (systemLeftIndex === 4) {
      const opt = LAUNCHER_BEHAVIOR_OPTIONS[subFocusIndex];
      if (opt) persistLauncherBehavior(opt.id);
    }
  };

  // Keyboard navigation handler
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      // Modal de preview de Splash Video: mientras está abierto, captura el
      // teclado por completo (no se mezcla con la navegación de la grilla).
      if (splashPreviewPost) {
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          if (!isInput) {
            e.preventDefault();
            setSplashPreviewPost(null);
          }
          return;
        }
        if (isInput) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          setSplashModalFocusIndex((prev) => Math.max(0, prev - 1));
          soundService.playNavigation();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          setSplashModalFocusIndex((prev) => Math.min(splashModalActions.length - 1, prev + 1));
          soundService.playNavigation();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          runSplashModalAction();
          soundService.playActivation?.();
        }
        return;
      }

      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        if (!isInput) {
          e.preventDefault();
          handleBack();
        }
        return;
      }

      if (isInput) return;

      if (currentScreen === 'main') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMainFocusIndex((prev) => Math.min(prev + 1, 3));
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMainFocusIndex((prev) => Math.max(prev - 1, 0));
          soundService.playNavigation();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (mainFocusIndex === 0) navigateToScreen('guide');
          else if (mainFocusIndex === 1) navigateToScreen('accessibility');
          else if (mainFocusIndex === 2) navigateToScreen('users_and_accounts');
          else if (mainFocusIndex === 3) navigateToScreen('system');
        }
      } else if (currentScreen === 'accessibility') {
        if (accessibilityFocusArea === 'left') {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAccessibilityLeftIndex((prev) => Math.min(prev + 1, 7));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAccessibilityLeftIndex((prev) => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
            e.preventDefault();
            setAccessibilityFocusArea('right');
            setSubFocusIndex(0);
            soundService.playNavigation();
          }
        } else if (accessibilityLeftIndex === 7) {
          // Splash Videos: navegación en zonas (filtros -> grilla -> paginación)
          const cols = Math.max(1, splashGridCols);
          const maxFlat = Math.max(0, displayedSplashItems.length - 1);

          // L1/R1 (mapeados a Q/E) pasan de página en los resultados,
          // igual que los botones "Anterior"/"Siguiente" de la paginación,
          // sin importar en qué zona esté el foco (filtros, grilla o
          // paginación). No aplica al filtro "Descargados" (no pagina).
          if (e.key === 'q' || e.key === 'e') {
            e.preventDefault();
            if (isShowingDownloadedSplash) return;
            if (e.key === 'q') {
              if (splashPage > 1) {
                setSplashFocusZone('pager');
                setSplashPagerIndex(0);
                setSplashPage((p) => Math.max(1, p - 1));
                soundService.playNavigation();
              }
            } else {
              if (splashPage < splashTotalPages) {
                setSplashFocusZone('pager');
                setSplashPagerIndex(1);
                setSplashPage((p) => Math.min(splashTotalPages, p + 1));
                soundService.playNavigation();
              }
            }
            return;
          }

          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (splashFocusZone === 'filters') {
              if (splashFilterIndex === 0) {
                setAccessibilityFocusArea('left');
              } else {
                setSplashFilterIndex((prev) => Math.max(0, prev - 1));
              }
              soundService.playNavigation();
            } else if (splashFocusZone === 'grid') {
              setSplashGridFlatIndex((prev) => Math.max(0, prev - 1));
              soundService.playNavigation();
            } else if (splashFocusZone === 'pager') {
              setSplashPagerIndex(0);
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (splashFocusZone === 'filters') {
              setSplashFilterIndex((prev) => Math.min(SPLASH_FILTER_ITEMS.length - 1, prev + 1));
              soundService.playNavigation();
            } else if (splashFocusZone === 'grid') {
              setSplashGridFlatIndex((prev) => Math.min(maxFlat, prev + 1));
              soundService.playNavigation();
            } else if (splashFocusZone === 'pager') {
              setSplashPagerIndex(1);
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (splashFocusZone === 'filters') {
              if (displayedSplashItems.length > 0) {
                setSplashFocusZone('grid');
                setSplashGridFlatIndex(0);
              }
              soundService.playNavigation();
            } else if (splashFocusZone === 'grid') {
              const next = splashGridFlatIndex + cols;
              if (next > maxFlat) {
                if (!isShowingDownloadedSplash && splashTotalPages > 1) {
                  setSplashFocusZone('pager');
                }
              } else {
                setSplashGridFlatIndex(next);
              }
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (splashFocusZone === 'grid') {
              const prev = splashGridFlatIndex - cols;
              if (prev < 0) {
                setSplashFocusZone('filters');
              } else {
                setSplashGridFlatIndex(prev);
              }
              soundService.playNavigation();
            } else if (splashFocusZone === 'pager') {
              setSplashFocusZone('grid');
              setSplashGridFlatIndex(maxFlat);
              soundService.playNavigation();
            }
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (splashFocusZone === 'filters') {
              const item = SPLASH_FILTER_ITEMS[splashFilterIndex];
              if (item?.kind === 'type') setSplashType(item.id as SplashFilterType);
              else if (item?.kind === 'sort') setSplashSort(item.id as SteamDeckRepoSort);
            } else if (splashFocusZone === 'grid') {
              const post = displayedSplashItems[splashGridFlatIndex];
              if (post) openSplashPreview(post);
            } else if (splashFocusZone === 'pager') {
              if (splashPagerIndex === 0) setSplashPage((p) => Math.max(1, p - 1));
              else setSplashPage((p) => Math.min(splashTotalPages, p + 1));
            }
            soundService.playActivation?.();
          }
        } else {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setAccessibilityFocusArea('left');
            soundService.playNavigation();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const maxIdx = getAccessibilityRightMaxIndex();
            setSubFocusIndex((prev) => Math.min(prev + 1, maxIdx));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSubFocusIndex((prev) => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            activateAccessibilityRightItem();
            soundService.playActivation?.();
          }
        }
      } else if (currentScreen === 'system') {
        if (systemFocusArea === 'left') {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSystemLeftIndex((prev) => Math.min(prev + 1, 4));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSystemLeftIndex((prev) => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
            e.preventDefault();
            setSystemFocusArea('right');
            setSubFocusIndex(0);
            soundService.playNavigation();
          }
        } else {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setSystemFocusArea('left');
            soundService.playNavigation();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const maxIdx = getSystemRightMaxIndex();
            setSubFocusIndex((prev) => Math.min(prev + 1, maxIdx));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSubFocusIndex((prev) => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            activateSystemRightItem();
            soundService.playActivation?.();
          }
        }
      } else if (currentScreen === 'profile_edit') {
        const lastIndex = PROFILE_EDIT_SECTIONS.length - 1;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSubFocusIndex((prev) => Math.min(prev + 1, lastIndex));
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSubFocusIndex((prev) => Math.max(prev - 1, 0));
          soundService.playNavigation();
        } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
          e.preventDefault();
          const section = PROFILE_EDIT_SECTIONS[subFocusIndex];
          if (section) {
            setProfileEditSection(section);
            navigateToScreen('profile_edit_detail');
          }
        }
      } else if (currentScreen === 'users_and_accounts') {
        // Cambia de pestaña (Overview / Friends) y reinicia el foco del contenido.
        const switchProfileTab = (dir: 1 | -1) => {
          const idx = PROFILE_TABS.indexOf(profileActiveTab);
          const next = PROFILE_TABS[(idx + dir + PROFILE_TABS.length) % PROFILE_TABS.length];
          setProfileActiveTab(next);
          setProfileSectionIndex(0);
          setProfileItemIndex(0);
          soundService.playTab();
        };

        // L1/R1 (mapeados a Q/E) cambian de pestaña estés donde estés.
        if (e.key === 'q' || e.key === 'e') {
          e.preventDefault();
          switchProfileTab(e.key === 'e' ? 1 : -1);
          return;
        }

        if (profileFocusArea === 'content') {
          const section = profileSections[profileSectionIndex];
          if (!section) {
            // Nada enfocable en esta pestaña: solo se puede volver arriba.
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setProfileFocusArea('tabs');
              soundService.playNavigation();
            }
            return;
          }

          // Al entrar a una sección desde arriba se empieza por su primer item;
          // desde abajo, por el último (el más cercano a donde veníamos) salvo
          // que sea horizontal, que siempre arranca en el primero.
          const itemOnEnter = (target: ProfileSection, from: 'above' | 'below') =>
            target.horizontal || from === 'above' ? 0 : target.count - 1;

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!section.horizontal && profileItemIndex < section.count - 1) {
              setProfileItemIndex(profileItemIndex + 1);
              soundService.playNavigation();
            } else if (profileSectionIndex < profileSections.length - 1) {
              setProfileSectionIndex(profileSectionIndex + 1);
              setProfileItemIndex(itemOnEnter(profileSections[profileSectionIndex + 1], 'above'));
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!section.horizontal && profileItemIndex > 0) {
              setProfileItemIndex(profileItemIndex - 1);
              soundService.playNavigation();
            } else if (profileSectionIndex > 0) {
              setProfileSectionIndex(profileSectionIndex - 1);
              setProfileItemIndex(itemOnEnter(profileSections[profileSectionIndex - 1], 'below'));
              soundService.playNavigation();
            } else {
              setProfileFocusArea('tabs');
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (section.horizontal && profileItemIndex < section.count - 1) {
              setProfileItemIndex(profileItemIndex + 1);
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (section.horizontal && profileItemIndex > 0) {
              setProfileItemIndex(profileItemIndex - 1);
              soundService.playNavigation();
            }
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const game =
              section.id === 'recent'
                ? profileRecentGames[profileItemIndex]
                : section.id === 'library'
                  ? profileLibraryGames[profileItemIndex]
                  : null;
            if (game && onGamePress) {
              soundService.playActivation?.();
              onGamePress(game);
            }
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (profileFocusArea === 'header_actions') {
            setProfileFocusArea('tabs');
            soundService.playNavigation();
          } else if (profileFocusArea === 'tabs' && profileSections.length > 0) {
            setProfileFocusArea('content');
            setProfileSectionIndex(0);
            setProfileItemIndex(0);
            soundService.playNavigation();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (profileFocusArea === 'tabs') setProfileFocusArea('header_actions');
          soundService.playNavigation();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (profileFocusArea === 'tabs') {
            switchProfileTab(1);
          } else if (profileFocusArea === 'header_actions') {
            const maxAction = allUsers.length > 1 ? 1 : 0;
            setProfileActionIndex((prev) => Math.min(prev + 1, maxAction));
            soundService.playNavigation();
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (profileFocusArea === 'tabs') {
            switchProfileTab(-1);
          } else if (profileFocusArea === 'header_actions') {
            setProfileActionIndex((prev) => Math.max(prev - 1, 0));
            soundService.playNavigation();
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (profileFocusArea === 'header_actions') {
            if (profileActionIndex === 0) {
              navigateToScreen('profile_edit');
            } else if (profileActionIndex === 1) {
              const nextUser = allUsers.find((u) => u.id !== activeUser?.id);
              if (nextUser && onSwitchUser) onSwitchUser(nextUser);
            }
          }
        }
      } else {
        // Other sub-screens
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSubFocusIndex((prev) => prev + 1);
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSubFocusIndex((prev) => Math.max(prev - 1, 0));
          soundService.playNavigation();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    visible,
    currentScreen,
    mainFocusIndex,
    subFocusIndex,
    accessibilityLeftIndex,
    accessibilityFocusArea,
    splashFocusZone,
    splashFilterIndex,
    splashGridFlatIndex,
    splashGridCols,
    splashPagerIndex,
    splashPage,
    splashType,
    displayedSplashItems,
    isShowingDownloadedSplash,
    splashTotalPages,
    splashDownloadingId,
    splashPreviewPost,
    splashModalFocusIndex,
    splashModalActions,
    systemLeftIndex,
    systemFocusArea,
    profileActiveTab,
    profileFocusArea,
    profileActionIndex,
    profileSections,
    profileSectionIndex,
    profileItemIndex,
    profileRecentGames,
    profileLibraryGames,
    allUsers,
    onSwitchUser,
    onGamePress,
    profileEditSection,
    screenHistory,
    activeUser,
    hdmiDeviceLink,
    hdmiHdcp,
    updateUser,
    changeLanguage,
    onOpenBgModal,
    onSelectWallpaperFolder,
    onSelectCaptureFolder,
    onOpenAvatarModal,
    onSelectAvatarFolder,
    onClose,
  ]);

  if (!visible) return null;

  // Active user avatar URL
  const userAvatarUri =
    activeUser?.settings?.useSteamAvatar && activeUser?.steamAvatarUrl
      ? activeUser.steamAvatarUrl
      : (activeUser as any)?.avatarBase64 || activeUser?.avatar || null;

  // ==========================================
  // SCREEN: MAIN (Vertical PS5 Settings List)
  // ==========================================
  const renderMainScreen = () => {
    const mainMenuItems = [
      {
        id: 'guide',
        title: t('settings.userGuideShort'),
        icon: 'information-circle-outline' as const,
        onPress: () => navigateToScreen('guide'),
      },
      {
        id: 'accessibility',
        title: t('settings.accessibility'),
        icon: 'accessibility' as const,
        onPress: () => navigateToScreen('accessibility'),
      },
      {
        id: 'users_and_accounts',
        title: t('settings.usersAndAccounts'),
        icon: 'person-circle-outline' as const,
        onPress: () => navigateToScreen('users_and_accounts'),
      },
      {
        id: 'system',
        title: t('settings.system'),
        icon: 'cube-outline' as const,
        onPress: () => navigateToScreen('system'),
      },
    ];

    return (
      <View style={styles.contentWrapper}>
        <Text style={styles.mainHeaderTitle}>{t('settings.title')}</Text>

        <View style={styles.elongatedListWrap}>
          <View style={styles.psMenuList}>
            {mainMenuItems.map((item, index) => {
              const isFocused = mainFocusIndex === index;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.psMenuRow, isFocused && styles.psMenuRowFocused]}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' ? { onMouseEnter: () => setMainFocusIndex(index) } : {}) as any}
                  onPress={item.onPress}
                >
                  {isFocused && <SpinningBorderSearch size={s(180)} spread={1} borderRadius={0} />}
                  <View style={styles.psMenuRowLeft}>
                    {item.id === 'users_and_accounts' && userAvatarUri ? (
                      <Image
                        source={resolveImageSource(userAvatarUri)}
                        style={styles.mainMenuUserAvatar}
                      />
                    ) : (
                      <Ionicons
                        name={item.icon}
                        size={s(26)}
                        color="#FFFFFF"
                        style={styles.mainMenuItemIcon}
                      />
                    )}
                    <Text style={[styles.psMenuRowText, isFocused && styles.psMenuRowTextFocused]}>
                      {item.title}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  // ==========================================
  // SCREEN: GUIDE (User's guide & Other info)
  // ==========================================
  const renderGuideScreen = () => {
    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{t('settings.userGuide')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          {/* Apoyo al Proyecto */}
          <View style={styles.supportMessageContainer}>
            <Ionicons
              name="heart-circle-sharp"
              size={s(64)}
              color="#FF3B30"
              style={{ marginBottom: 16, alignSelf: 'center' }}
            />
            <Text style={styles.supportTextMain}>{t('settings.thanks')}</Text>
            <Text style={styles.supportTextSub}>{t('settings.supportBody')}</Text>
          </View>

          {/* Social Links */}
          <View style={styles.supportLinksRow}>
            <TouchableOpacity
              style={styles.supportLinkBtn}
              onPress={() => Linking.openURL('https://patreon.com/WPS5')}
            >
              <Ionicons name="logo-octocat" size={s(22)} color="#FF4500" />
              <Text style={styles.supportLinkBtnText}>Patreon</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.supportLinkBtn}
              onPress={() => Linking.openURL('https://github.com/angelvc25/WPS5')}
            >
              <Ionicons name="logo-github" size={s(22)} color="#FFF" />
              <Text style={styles.supportLinkBtnText}>GitHub</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.supportLinkBtn}
              onPress={() => Linking.openURL('https://www.youtube.com/@Re-Devs')}
            >
              <Ionicons name="logo-youtube" size={s(22)} color="#FF0000" />
              <Text style={styles.supportLinkBtnText}>YouTube</Text>
            </TouchableOpacity>
          </View>

          {/* Patrons list */}
          <View style={styles.patronsSection}>
            <Text style={styles.sectionLabel}>{t('settings.patrons')}</Text>
            <View style={styles.patronsListGrid}>
              {['angelvc25', 'Crizz_Vc', 'WPS5 Community'].map((name, idx) => (
                <View key={idx} style={styles.patronCard}>
                  <Ionicons name="star" size={s(14)} color="#FFCC00" />
                  <Text style={styles.patronName}>{name}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  // Filtros de la sección Splash Videos, aplanados en una sola lista para que
  // el mando pueda recorrerlos con Izquierda/Derecha en una sola fila lógica.
  const SPLASH_TYPE_FILTERS: { kind: 'type'; id: SplashFilterType; label: string }[] = [
    { kind: 'type', id: 'all', label: t('settings.filterAll') },
    { kind: 'type', id: 'boot', label: t('settings.filterBootVideos') },
    { kind: 'type', id: 'suspend', label: t('settings.filterSuspendVideos') },
    { kind: 'type', id: 'downloaded', label: t('settings.filterDownloaded') },
  ];
  const SPLASH_SORT_FILTERS: { kind: 'sort'; id: SteamDeckRepoSort; label: string }[] = [
    { kind: 'sort', id: 'newest', label: t('settings.filterNewest') },
    { kind: 'sort', id: 'oldest', label: t('settings.filterOldest') },
    { kind: 'sort', id: 'likes', label: t('settings.filterLikes') },
    { kind: 'sort', id: 'downloads', label: t('settings.filterDownloads') },
    { kind: 'sort', id: 'title', label: t('settings.filterTitle') },
  ];
  const SPLASH_FILTER_ITEMS = [...SPLASH_TYPE_FILTERS, ...SPLASH_SORT_FILTERS];

  // ==========================================
  // SCREEN: ACCESSIBILITY (Two Columns: Visual & Animations, Wallpapers & Captures, Smart Sync)
  // ==========================================
  const renderAccessibilityScreen = () => {
    const accessibilitySections = [
      { id: 'visual', title: t('settings.accVisual') },
      { id: 'wallpapers', title: t('settings.accWallpapers') },
      { id: 'avatars', title: t('settings.avatars') },
      { id: 'steam', title: 'Steam' },
      { id: 'retroachievements', title: 'RetroAchievements' },
      { id: 'sync', title: t('settings.smartSync') },
      { id: 'overlay', title: t('settings.overlay') },
      { id: 'splash', title: t('settings.steamDeckRepo') },
    ];

    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{t('settings.accessibility')}</Text>
        </View>

        <View style={styles.twoColumnContainer}>
          {/* Left Column (Submenu items) */}
          <View style={styles.systemLeftColumn}>
            {accessibilitySections.map((sec, idx) => {
              const isSelected = accessibilityLeftIndex === idx;
              const isFocused = accessibilityFocusArea === 'left' && accessibilityLeftIndex === idx;
              return (
                <TouchableOpacity
                  key={sec.id}
                  style={[
                    styles.systemLeftItem,
                    isSelected && styles.systemLeftItemActive,
                    isFocused && styles.systemLeftItemFocused,
                  ]}
                  onPress={() => {
                    setAccessibilityLeftIndex(idx);
                    soundService.playNavigation();
                  }}
                >
                  {isFocused && <SpinningBorderSearch size={s(200)} spread={1} borderRadius={0} />}
                  <Text
                    style={[
                      styles.systemLeftItemText,
                      isSelected && styles.systemLeftItemTextActive,
                    ]}
                  >
                    {sec.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Right Column (Submenu Content) */}
          <View style={styles.systemRightColumn}>
            {accessibilityLeftIndex === 0 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.accVisual')}</Text>

                {/* Auto Play Video Toggle */}
                <View
                  style={[
                    styles.toggleRowSection,
                    accessibilityFocusArea === 'right' && subFocusIndex === 0 && styles.rightItemFocused,
                  ]}
                >
                  {accessibilityFocusArea === 'right' && subFocusIndex === 0 && <SpinningBorderSearch size={s(200)} spread={0.5} borderRadius={0} />}
                  <View style={{ flex: 1, paddingRight: 20 }}>
                    <Text style={styles.toggleRowTitle}>{t('settings.autoPlayVideo')}</Text>
                    <Text style={styles.toggleRowDesc}>{t('settings.autoPlayVideoDesc')}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.psSwitch,
                      activeUser?.settings?.autoPlayVideo !== false && styles.psSwitchActive,
                    ]}
                    onPress={() =>
                      updateUser({
                        settings: {
                          ...activeUser?.settings,
                          autoPlayVideo: !(activeUser?.settings?.autoPlayVideo !== false),
                        },
                      })
                    }
                  >
                    <View
                      style={[
                        styles.psSwitchThumb,
                        activeUser?.settings?.autoPlayVideo !== false && styles.psSwitchThumbActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>

                {/* Invert Transition Toggle */}
                <View
                  style={[
                    styles.toggleRowSection,
                    accessibilityFocusArea === 'right' && subFocusIndex === 1 && styles.rightItemFocused,
                  ]}
                >
                  {accessibilityFocusArea === 'right' && subFocusIndex === 1 && <SpinningBorderSearch size={s(180)} spread={0.5} borderRadius={0} />}
                  <View style={{ flex: 1, paddingRight: 20 }}>
                    <Text style={styles.toggleRowTitle}>{t('settings.invertTransition')}</Text>
                    <Text style={styles.toggleRowDesc}>{t('settings.invertTransitionDesc')}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.psSwitch,
                      activeUser?.settings?.invertTransitionDirection === true && styles.psSwitchActive,
                    ]}
                    onPress={() =>
                      updateUser({
                        settings: {
                          ...activeUser?.settings,
                          invertTransitionDirection: !activeUser?.settings?.invertTransitionDirection,
                        },
                      })
                    }
                  >
                    <View
                      style={[
                        styles.psSwitchThumb,
                        activeUser?.settings?.invertTransitionDirection === true && styles.psSwitchThumbActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>

                {/* Fuente de la tienda: PS5 Store o Steam */}
                <View
                  style={[
                    styles.toggleRowSection,
                    accessibilityFocusArea === 'right' && subFocusIndex === 2 && styles.rightItemFocused,
                  ]}
                >
                  {accessibilityFocusArea === 'right' && subFocusIndex === 2 && <SpinningBorderSearch size={s(180)} spread={0.5} borderRadius={0} />}
                  <View style={{ flex: 1, paddingRight: 20 }}>
                    <Text style={styles.toggleRowTitle}>{t('settings.storeSource')}</Text>
                    <Text style={styles.toggleRowDesc}>{t('settings.storeSourceDesc')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {(['ps5', 'steam'] as const).map((opt) => {
                      const isActive = (activeUser?.settings?.storeSource || 'ps5') === opt;
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.platformBtn, isActive && styles.platformBtnActive]}
                          onPress={() => updateUser({ settings: { ...activeUser?.settings, storeSource: opt } as any })}
                        >
                          <Text style={[styles.platformBtnText, isActive && styles.platformBtnTextActive]}>
                            {opt === 'ps5' ? 'PS5 Store' : 'Steam'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
            )}

            {accessibilityLeftIndex === 1 && (() => {
              const hasWallpaperPath = !!activeUser?.settings?.wallpaperPath;
              const hasCapturePath = !!activeUser?.settings?.capturePath;
              const hasRpcs3Path = !!(activeUser?.settings as any)?.rpcs3Path;
              let wpIdx = 0;
              const chooseWallpaperIdx = wpIdx++;
              const selectWallpaperFolderIdx = wpIdx++;
              const restoreWallpaperIdx = hasWallpaperPath ? wpIdx++ : -1;
              const selectCaptureFolderIdx = wpIdx++;
              const restoreCaptureIdx = hasCapturePath ? wpIdx++ : -1;
              const selectRpcs3FolderIdx = wpIdx++;
              const restoreRpcs3Idx = hasRpcs3Path ? wpIdx++ : -1;
              const isRightFocused = accessibilityFocusArea === 'right';

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.rightSectionTitle}>{t('settings.accWallpapers')}</Text>

                  {/* Wallpaper Selection */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.wallpaper')}</Text>
                    <TouchableOpacity
                      style={[
                        styles.actionBtnSecondary,
                        isRightFocused && subFocusIndex === chooseWallpaperIdx && styles.rightItemFocused,
                      ]}
                      onPress={() => {
                        onClose();
                        onOpenBgModal();
                      }}
                    >
                      {isRightFocused && subFocusIndex === chooseWallpaperIdx && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                      <Ionicons name="image-outline" size={s(20)} color="#FFF" />
                      <Text style={styles.actionBtnSecondaryText}>{t('settings.chooseWallpaper')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Wallpaper Folder */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.wallpaperFolder')}</Text>
                    <Text style={styles.pathDesc}>
                      {t('settings.currentPath', {
                        path: activeUser?.settings?.wallpaperPath || t('settings.defaultWallpapers'),
                      })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.actionBtnSecondary,
                          isRightFocused && subFocusIndex === selectWallpaperFolderIdx && styles.rightItemFocused,
                        ]}
                        onPress={onSelectWallpaperFolder}
                      >
                        {isRightFocused && subFocusIndex === selectWallpaperFolderIdx && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                        <Ionicons name="folder-open-outline" size={s(20)} color="#FFF" />
                        <Text style={styles.actionBtnSecondaryText}>{t('settings.selectFolder')}</Text>
                      </TouchableOpacity>
                      {hasWallpaperPath ? (
                        <TouchableOpacity
                          style={[
                            styles.actionBtnSecondary,
                            { backgroundColor: '#3D1E24', borderColor: '#772233' },
                            isRightFocused && subFocusIndex === restoreWallpaperIdx && styles.rightItemFocused,
                          ]}
                          onPress={() =>
                            updateUser({
                              settings: { ...activeUser?.settings, wallpaperPath: '' } as any,
                            })
                          }
                        >
                          {isRightFocused && subFocusIndex === restoreWallpaperIdx && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                          <Ionicons name="trash-outline" size={s(18)} color="#FF5566" />
                          <Text style={[styles.actionBtnSecondaryText, { color: '#FF5566' }]}>
                            {t('settings.restoreDefault')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* Captures Folder */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.capturesFolder')}</Text>
                    <Text style={styles.pathDesc}>
                      {t('settings.currentPath', {
                        path: activeUser?.settings?.capturePath || t('settings.defaultCaptures'),
                      })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.actionBtnSecondary,
                          isRightFocused && subFocusIndex === selectCaptureFolderIdx && styles.rightItemFocused,
                        ]}
                        onPress={onSelectCaptureFolder}
                      >
                        {isRightFocused && subFocusIndex === selectCaptureFolderIdx && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                        <Ionicons name="folder-open-outline" size={s(20)} color="#FFF" />
                        <Text style={styles.actionBtnSecondaryText}>{t('settings.selectFolder')}</Text>
                      </TouchableOpacity>
                      {hasCapturePath ? (
                        <TouchableOpacity
                          style={[
                            styles.actionBtnSecondary,
                            { backgroundColor: '#3D1E24', borderColor: '#772233' },
                            isRightFocused && subFocusIndex === restoreCaptureIdx && styles.rightItemFocused,
                          ]}
                          onPress={() =>
                            updateUser({
                              settings: { ...activeUser?.settings, capturePath: '' } as any,
                            })
                          }
                        >
                          {isRightFocused && subFocusIndex === restoreCaptureIdx && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                          <Ionicons name="trash-outline" size={s(18)} color="#FF5566" />
                          <Text style={[styles.actionBtnSecondaryText, { color: '#FF5566' }]}>
                            {t('settings.restoreDefault')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* RPCS3 Folder */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.rpcs3Folder')}</Text>
                    <Text style={styles.pathDesc}>
                      {t('settings.rpcs3FolderDesc')}
                    </Text>
                    <Text style={[styles.pathDesc, { marginTop: 4, opacity: 0.6 }]}>
                      {t('settings.rpcs3Path', {
                        path: (activeUser?.settings as any)?.rpcs3Path || t('settings.rpcs3NotConfigured'),
                      })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.actionBtnSecondary,
                          isRightFocused && subFocusIndex === selectRpcs3FolderIdx && styles.rightItemFocused,
                        ]}
                        onPress={onSelectRpcs3Folder}
                      >
                        {isRightFocused && subFocusIndex === selectRpcs3FolderIdx && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                        <Ionicons name="folder-open-outline" size={s(20)} color="#FFF" />
                        <Text style={styles.actionBtnSecondaryText}>{t('settings.selectFolder')}</Text>
                      </TouchableOpacity>
                      {hasRpcs3Path ? (
                        <TouchableOpacity
                          style={[
                            styles.actionBtnSecondary,
                            { backgroundColor: '#3D1E24', borderColor: '#772233' },
                            isRightFocused && subFocusIndex === restoreRpcs3Idx && styles.rightItemFocused,
                          ]}
                          onPress={() =>
                            updateUser({
                              settings: { ...activeUser?.settings, rpcs3Path: '' } as any,
                            })
                          }
                        >
                          {isRightFocused && subFocusIndex === restoreRpcs3Idx && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                          <Ionicons name="trash-outline" size={s(18)} color="#FF5566" />
                          <Text style={[styles.actionBtnSecondaryText, { color: '#FF5566' }]}>
                            {t('settings.restoreDefault')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </ScrollView>
              );
            })()}

            {accessibilityLeftIndex === 2 && (() => {
              const hasAvatarPath = !!activeUser?.settings?.avatarPath;
              let idx = 0;
              const chooseAvatarIdx = idx++;
              const selectAvatarFolderIdx = idx++;
              const restoreAvatarIdx = hasAvatarPath ? idx++ : -1;
              const isRightFocused = accessibilityFocusArea === 'right';

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.rightSectionTitle}>{t('settings.avatars')}</Text>

                  <Text style={styles.pathDesc}>
                    {t('settings.pickAvatarDesc')}
                  </Text>

                  {/* Avatar Selection */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.pickAvatar')}</Text>
                    <TouchableOpacity
                      style={[
                        styles.actionBtnSecondary,
                        isRightFocused && subFocusIndex === chooseAvatarIdx && styles.rightItemFocused,
                      ]}
                      onPress={() => {
                        onClose();
                        onOpenAvatarModal?.();
                      }}
                    >
                      {isRightFocused && subFocusIndex === chooseAvatarIdx && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                      <Ionicons name="person-circle-outline" size={s(20)} color="#FFF" />
                      <Text style={styles.actionBtnSecondaryText}>{t('settings.chooseAvatar')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Avatar Folder */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.avatarFolder')}</Text>
                    <Text style={styles.pathDesc}>
                      {t('settings.currentPath', {
                        path: activeUser?.settings?.avatarPath || t('settings.defaultAvatars'),
                      })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.actionBtnSecondary,
                          isRightFocused && subFocusIndex === selectAvatarFolderIdx && styles.rightItemFocused,
                        ]}
                        onPress={onSelectAvatarFolder}
                      >
                        {isRightFocused && subFocusIndex === selectAvatarFolderIdx && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                        <Ionicons name="folder-open-outline" size={s(20)} color="#FFF" />
                        <Text style={styles.actionBtnSecondaryText}>{t('settings.selectFolder')}</Text>
                      </TouchableOpacity>
                      {hasAvatarPath ? (
                        <TouchableOpacity
                          style={[
                            styles.actionBtnSecondary,
                            { backgroundColor: '#3D1E24', borderColor: '#772233' },
                            isRightFocused && subFocusIndex === restoreAvatarIdx && styles.rightItemFocused,
                          ]}
                          onPress={() =>
                            updateUser({
                              settings: { ...activeUser?.settings, avatarPath: '' } as any,
                            })
                          }
                        >
                          {isRightFocused && subFocusIndex === restoreAvatarIdx && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                          <Ionicons name="trash-outline" size={s(18)} color="#FF5566" />
                          <Text style={[styles.actionBtnSecondaryText, { color: '#FF5566' }]}>
                            {t('settings.restoreDefault')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </ScrollView>
              );
            })()}

            {accessibilityLeftIndex === 3 && (() => {
              const isRightFocused = accessibilityFocusArea === 'right';
              const isConnected = !!activeUser?.settings?.steamId;

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.rightSectionTitle}>Steam</Text>
                  <Text style={[styles.pathDesc, { marginBottom: 16 }]}>
                    Vincula tu cuenta de Steam para sincronizar tu biblioteca de juegos.
                  </Text>

                  <View style={styles.cardSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="logo-steam" size={s(26)} color="#FFF" />
                        <View>
                          <Text style={styles.toggleRowTitle}>Steam</Text>
                          {isConnected && (
                            <Text style={styles.toggleRowDesc}>
                              Conectado (ID: {activeUser?.settings?.steamId})
                            </Text>
                          )}
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[
                          isConnected
                            ? [styles.actionBtnSecondary, { backgroundColor: '#3D1E24', borderColor: '#772233' }]
                            : styles.actionBtnSecondary,
                          isRightFocused && subFocusIndex === 0 && styles.rightItemFocused,
                        ]}
                        onPress={() => {
                          if (isConnected) {
                            updateUser({ settings: { ...activeUser?.settings, steamId: '' } as any });
                          } else {
                            handleSteamLogin();
                          }
                        }}
                      >
                        {isConnected ? (
                          <>
                            {isRightFocused && subFocusIndex === 0 && <SpinningBorderSearch size={s(180)} spread={1.5} borderRadius={8} />}
                            <Ionicons name="unlink-outline" size={s(18)} color="#ffffffff" />
                            <Text style={[styles.actionBtnSecondaryText, { color: '#ffffffff' }]}>{t('settings.unlink')}</Text>
                          </>
                        ) : (
                          <>
                            <Ionicons name="log-in-outline" size={s(18)} color="#FFF" />
                            <Text style={styles.actionBtnSecondaryText}>{t('settings.steamLink')}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScrollView>
              );
            })()}

            {accessibilityLeftIndex === 4 && (() => {
              const isRightFocused = accessibilityFocusArea === 'right';
              const raUsername = activeUser?.settings?.raUsername || '';
              const raApiKey = activeUser?.settings?.raApiKey || '';
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.rightSectionTitle}>RetroAchievements</Text>
                  <Text style={[styles.pathDesc, { marginBottom: 16 }]}>
                    {t('settings.achievementDesc')}
                  </Text>

                  {/* RA Username */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.achievementUsername')}</Text>
                    <TextInput
                      style={[styles.raInput, isRightFocused && subFocusIndex === 0 && styles.rightItemFocused]}
                      placeholder={t('settings.achievementUsernamePlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={raUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(val) =>
                        updateUser({ settings: { ...activeUser?.settings, raUsername: val } as any })
                      }
                    />
                  </View>

                  {/* RA API Key */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.achievementApiKey')}</Text>
                    <Text style={[styles.pathDesc, { marginBottom: 6 }]}>
                      {t('settings.achievementGetApiKey')}
                    </Text>
                    <TextInput
                      style={[styles.raInput, isRightFocused && subFocusIndex === 1 && styles.rightItemFocused]}
                      placeholder={t('settings.achievementApiKeyPlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={raApiKey}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={false}
                      onChangeText={(val) =>
                        updateUser({ settings: { ...activeUser?.settings, raApiKey: val } as any })
                      }
                    />
                  </View>

                  {/* Connection status */}
                  <View style={[styles.cardSection, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                    <Ionicons
                      name={raUsername && raApiKey ? 'checkmark-circle' : 'alert-circle-outline'}
                      size={s(22)}
                      color={raUsername && raApiKey ? '#1DB954' : '#FF5566'}
                    />
                    <Text style={[styles.pathDesc, { flex: 1 }]}>
                      {raUsername && raApiKey
                        ? `${t('settings.achievementLoginSuccess', { raUsername })}`
                        : t('settings.achievementNotConfigured')}
                    </Text>
                  </View>
                </ScrollView>
              );
            })()}

            {accessibilityLeftIndex === 6 && (() => {
              const overlayEnabled = activeUser?.settings?.overlayEnabled !== false;
              const overlayCombo = activeUser?.settings?.overlayCombo || 'SELECT_START';
              const isRightFocused = accessibilityFocusArea === 'right';

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.rightSectionTitle}>{t('settings.overlay')}</Text>

                  <View
                    style={[
                      styles.toggleRowSection,
                      isRightFocused && subFocusIndex === 0 && styles.rightItemFocused,
                    ]}
                  >
                    {isRightFocused && subFocusIndex === 0 && <SpinningBorderSearch size={s(180)} spread={0.5} borderRadius={0} />}
                    <View style={{ flex: 1, paddingRight: 20 }}>
                      <Text style={styles.toggleRowTitle}>{t('settings.enableOverlay')}</Text>
                      <Text style={styles.toggleRowDesc}>{t('settings.enableOverlayDesc')}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.psSwitch, overlayEnabled && styles.psSwitchActive]}
                      onPress={() => persistOverlaySettings({ overlayEnabled: !overlayEnabled })}
                    >
                      <View
                        style={[
                          styles.psSwitchThumb,
                          overlayEnabled && styles.psSwitchThumbActive,
                        ]}
                      />
                    </TouchableOpacity>
                  </View>

                  <View
                    style={[
                      styles.toggleRowSection,
                      { alignItems: 'flex-start' },
                      isRightFocused && subFocusIndex === 1 && styles.rightItemFocused,
                    ]}
                  >
                    {isRightFocused && subFocusIndex === 1 && <SpinningBorderSearch size={s(180)} spread={0.5} borderRadius={0} />}
                    <View style={{ flex: 1, paddingRight: 20 }}>
                      <Text style={styles.toggleRowTitle}>{t('settings.overlayCombo')}</Text>
                      <Text style={styles.toggleRowDesc}>{t('settings.overlayComboDesc')}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, maxWidth: 420, justifyContent: 'flex-end' }}>
                      {OVERLAY_COMBO_OPTIONS.map((opt) => {
                        const isActive = overlayCombo === opt.id;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[styles.platformBtn, isActive && styles.platformBtnActive]}
                            onPress={() => persistOverlaySettings({ overlayCombo: opt.id })}
                          >
                            <Text style={[styles.platformBtnText, isActive && styles.platformBtnTextActive]}>
                              {t(opt.labelKey)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
              );
            })()}

            {accessibilityLeftIndex === 7 && (() => {
              const currentBoot = (activeUser?.settings as any)?.bootVideoPath;
              const currentSuspend = (activeUser?.settings as any)?.suspendVideoPath;
              const isRightFocused = accessibilityFocusArea === 'right';
              const isFiltersFocused = isRightFocused && splashFocusZone === 'filters';
              const isGridFocused = isRightFocused && splashFocusZone === 'grid';
              const isPagerFocused = isRightFocused && splashFocusZone === 'pager';

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.rightSectionTitle}>{t('settings.steamDeckRepo')}</Text>
                  <Text style={[styles.pathDesc, { marginBottom: 16 }]}>
                    {t('settings.steamDeckRepoDesc')}
                  </Text>

                  {/* Estado actual */}
                  <View style={[styles.cardSection, { flexDirection: 'row', gap: 24 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionLabel}>{t('settings.bootCurrent')}</Text>
                      <Text style={[styles.pathDesc, { opacity: 0.7 }]} numberOfLines={1}>
                        {currentBoot || t('settings.default')}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionLabel}>{t('settings.suspendCurrent')}</Text>
                      <Text style={[styles.pathDesc, { opacity: 0.7 }]} numberOfLines={1}>
                        {currentSuspend || t('settings.default')}
                      </Text>
                    </View>
                  </View>

                  {/* Buscador (solo mouse/teclado físico; el mando no lo enfoca) */}
                  <View style={styles.cardSection}>
                    <TextInput
                      style={styles.raInput}
                      placeholder={t('settings.bootPlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={splashQuery}
                      onChangeText={setSplashQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />

                    {/* Filtro por tipo + orden, aplanados para navegación con mando */}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                      {SPLASH_TYPE_FILTERS.map((opt, i) => {
                        const isActive = splashType === opt.id;
                        const isFocused = isFiltersFocused && splashFilterIndex === i;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[styles.platformBtn, isActive && styles.platformBtnActive, isFocused && styles.rightItemFocused]}
                            onPress={() => {
                              setSplashType(opt.id);
                              setSplashFocusZone('filters');
                              setSplashFilterIndex(i);
                            }}
                          >
                            {isFocused && <SpinningBorderSearch size={s(140)} spread={0.5} borderRadius={8} />}
                            <Text style={[styles.platformBtnText, isActive && styles.platformBtnTextActive]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                      {SPLASH_SORT_FILTERS.map((opt, i) => {
                        const flatIdx = SPLASH_TYPE_FILTERS.length + i;
                        const isActive = splashSort === opt.id;
                        const isFocused = isFiltersFocused && splashFilterIndex === flatIdx;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[styles.platformBtn, isActive && styles.platformBtnActive, isFocused && styles.rightItemFocused]}
                            onPress={() => {
                              setSplashSort(opt.id);
                              setSplashFocusZone('filters');
                              setSplashFilterIndex(flatIdx);
                            }}
                          >
                            {isFocused && <SpinningBorderSearch size={s(140)} spread={0.5} borderRadius={8} />}
                            <Text style={[styles.platformBtnText, isActive && styles.platformBtnTextActive]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Estado de carga / error */}
                  {splashLoading && (
                    <Text style={[styles.pathDesc, { marginBottom: 12 }]}>{t('settings.loading')}</Text>
                  )}
                  {!splashLoading && splashError && (
                    <Text style={[styles.pathDesc, { color: '#FF5566', marginBottom: 12 }]}>
                      {splashError}
                    </Text>
                  )}
                  {!splashLoading && !splashError && displayedSplashItems.length === 0 && (
                    <Text style={[styles.pathDesc, { marginBottom: 12 }]}>
                      {isShowingDownloadedSplash
                        ? t('settings.notDownloadedYet')
                        : t('search.noResults')}
                    </Text>
                  )}

                  {/* Resultados */}
                  <View
                    style={styles.mediaGrid}
                    onLayout={(e) => {
                      const cardW = s(320);
                      const gap = s(14);
                      const width = e.nativeEvent.layout.width;
                      const cols = Math.max(1, Math.floor((width + gap) / (cardW + gap)));
                      setSplashGridCols(cols);
                    }}
                  >
                    {displayedSplashItems.map((post, cardIdx) => {
                      const isCardFocused = isGridFocused && splashGridFlatIndex === cardIdx;
                      const isDownloadingThis =
                        splashDownloadingId === `${post.id}:boot` || splashDownloadingId === `${post.id}:suspend`;
                      return (
                        <TouchableOpacity
                          key={post.id}
                          ref={(el: any) => {
                            if (el) splashCardRefs.current[cardIdx] = el;
                          }}
                          activeOpacity={0.85}
                          style={[
                            styles.mediaCard,
                            styles.mediaCardLarge,
                            { width: s(320) },
                            isCardFocused && styles.mediaCardFocused,
                          ]}
                          onPress={() => {
                            setSplashFocusZone('grid');
                            setSplashGridFlatIndex(cardIdx);
                            openSplashPreview(post);
                          }}
                        >
                          {isCardFocused && <SpinningBorderSearch size={s(220)} spread={0.6} borderRadius={12} />}
                          <Image
                            source={resolveImageSource(post.previewImage)}
                            style={styles.mediaThumbLarge}
                            contentFit="cover"
                          />
                          {isDownloadingThis && (
                            <View style={styles.mediaCardBusyOverlay}>
                              <Text style={styles.platformBtnText}>{t('settings.downloading')}</Text>
                            </View>
                          )}
                          <Text style={styles.mediaTitle} numberOfLines={1}>
                            {post.title}
                          </Text>
                          <Text style={[styles.pathDesc, { paddingHorizontal: s(10), marginTop: -6, marginBottom: 10 }]}>
                            {isShowingDownloadedSplash
                              ? `${t('settings.videoUpdate')}${(post as DownloadedSplashPost).lastTarget === 'boot' ? t('settings.videoUpdateBoot') : t('settings.videoUpdateSuspend')}`
                              : `${post.author} · ❤ ${post.likes} · ⬇ ${post.downloads}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Paginación (solo aplica a resultados de la API; el
                      historial local de "Descargados" no pagina). */}
                  {!isShowingDownloadedSplash && splashTotalPages > 1 && (
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'center' }}>
                      <TouchableOpacity
                        style={[
                          styles.actionBtnSecondary,
                          splashPage <= 1 && { opacity: 0.4 },
                          isPagerFocused && splashPagerIndex === 0 && styles.rightItemFocused,
                        ]}
                        disabled={splashPage <= 1}
                        onPress={() => {
                          setSplashFocusZone('pager');
                          setSplashPagerIndex(0);
                          setSplashPage((p) => Math.max(1, p - 1));
                        }}
                      >
                        {isPagerFocused && splashPagerIndex === 0 && <SpinningBorderSearch size={s(140)} spread={0.5} borderRadius={0} />}
                        <Ionicons name="chevron-back" size={s(18)} color="#FFF" />
                        <Text style={styles.actionBtnSecondaryText}>{t('musicExpanded.previous')}</Text>
                      </TouchableOpacity>
                      <Text style={styles.pathDesc}>
                        Página {splashPage} de {splashTotalPages}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.actionBtnSecondary,
                          splashPage >= splashTotalPages && { opacity: 0.4 },
                          isPagerFocused && splashPagerIndex === 1 && styles.rightItemFocused,
                        ]}
                        disabled={splashPage >= splashTotalPages}
                        onPress={() => {
                          setSplashFocusZone('pager');
                          setSplashPagerIndex(1);
                          setSplashPage((p) => Math.min(splashTotalPages, p + 1));
                        }}
                      >
                        {isPagerFocused && splashPagerIndex === 1 && <SpinningBorderSearch size={s(140)} spread={0.5} borderRadius={0} />}
                        <Text style={styles.actionBtnSecondaryText}>{t('musicExpanded.next')}</Text>
                        <Ionicons name="chevron-forward" size={s(18)} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              );
            })()}

            {/* Modal de preview de Splash Video: reproduce el video de la
                tarjeta seleccionada y muestra ahí las acciones (Usar en
                Boot / Usar en Suspend / Quitar de Descargados). */}
            {splashPreviewPost && (() => {
              const post = splashPreviewPost;
              const isDownloadingBoot = splashDownloadingId === `${post.id}:boot`;
              const isDownloadingSuspend = splashDownloadingId === `${post.id}:suspend`;
              return (
                <Modal
                  visible
                  transparent
                  animationType="fade"
                  onRequestClose={() => setSplashPreviewPost(null)}
                >
                  <TouchableOpacity
                    style={styles.splashModalOverlay}
                    activeOpacity={1}
                    onPress={() => setSplashPreviewPost(null)}
                  >
                    <TouchableOpacity activeOpacity={1} style={styles.splashModalCard} onPress={() => { }}>
                      <View style={styles.splashModalVideoWrap}>
                        <BackgroundVideo
                          source={{ uri: post.downloadUrl }}
                          style={StyleSheet.absoluteFillObject}
                          resizeMode="contain"
                          shouldPlay
                          isLooping
                          muted={false}
                        />
                      </View>

                      <TouchableOpacity
                        style={styles.splashModalCloseBtn}
                        onPress={() => setSplashPreviewPost(null)}
                      >
                        <Ionicons name="close" size={s(20)} color="#FFF" />
                      </TouchableOpacity>

                      <View style={styles.splashModalInfo}>
                        <Text style={styles.mediaTitle} numberOfLines={1}>
                          {post.title}
                        </Text>
                        <Text style={[styles.pathDesc, { marginBottom: 4 }]}>
                          {isShowingDownloadedSplash
                            ? `Usado en ${(post as DownloadedSplashPost).lastTarget === 'boot' ? 'Boot' : 'Suspend'}`
                            : `${post.author} · ❤ ${post.likes} · ⬇ ${post.downloads}`}
                        </Text>

                        <View style={styles.splashModalActions}>
                          {splashModalActions.map((action, i) => {
                            const isFocused = splashModalFocusIndex === i;
                            const isBusy =
                              (action.id === 'boot' && isDownloadingBoot) ||
                              (action.id === 'suspend' && isDownloadingSuspend);
                            const label =
                              action.id === 'boot'
                                ? (isDownloadingBoot ? t('settings.downloading') : action.label)
                                : action.id === 'suspend'
                                  ? (isDownloadingSuspend ? t('settings.downloading') : action.label)
                                  : action.label;
                            return (
                              <TouchableOpacity
                                key={action.id}
                                style={[
                                  action.id === 'remove' ? styles.actionBtnSecondary : styles.platformBtn,
                                  { opacity: isBusy ? 0.6 : 1 },
                                  isFocused && styles.rightItemFocused,
                                ]}
                                disabled={!!splashDownloadingId}
                                onPress={() => {
                                  setSplashModalFocusIndex(i);
                                  runSplashModalAction(action);
                                }}
                              >
                                {isFocused && <SpinningBorderSearch size={s(140)} spread={0.5} borderRadius={8} />}
                                <Text
                                  style={
                                    action.id === 'remove'
                                      ? [styles.actionBtnSecondaryText, { color: '#FF8899' }]
                                      : styles.platformBtnText
                                  }
                                >
                                  {label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </TouchableOpacity>
                </Modal>
              );
            })()}

            {accessibilityLeftIndex === 5 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.smartSync')}</Text>
                <Text style={[styles.pathDesc, { marginBottom: 16 }]}>{t('settings.smartSyncDesc')}</Text>

                {[
                  {
                    key: 'ratingAndSummary',
                    label: t('settings.ratingAndSummary'),
                    options: [
                      { id: 'steam', label: 'Steam' },
                      { id: 'igdb', label: 'IGDB' },
                      { id: 'rawg', label: 'RAWG' },
                      { id: 'none', label: t('settings.none') },
                    ],
                  },
                  {
                    key: 'cover',
                    label: t('settings.cover'),
                    options: [
                      { id: 'steamgrid', label: 'SteamGrid' },
                      { id: 'igdb', label: 'IGDB' },
                      { id: 'rawg', label: 'RAWG' },
                      { id: 'none', label: t('settings.none') },
                    ],
                  },
                  {
                    key: 'background',
                    label: t('settings.background'),
                    options: [
                      { id: 'steamgrid', label: 'SteamGrid' },
                      { id: 'igdb', label: 'IGDB' },
                      { id: 'rawg', label: 'RAWG' },
                      { id: 'none', label: t('settings.none') },
                    ],
                  },
                  {
                    key: 'logo',
                    label: t('settings.logo'),
                    options: [
                      { id: 'steamgrid', label: 'SteamGrid' },
                      { id: 'none', label: t('settings.none') },
                    ],
                  },
                ].map((pref, prefIdx) => {
                  const currentSync = activeUser?.settings?.syncPreferences || {
                    ratingAndSummary: 'igdb',
                    cover: 'steamgrid',
                    background: 'steamgrid',
                    logo: 'steamgrid',
                  };
                  const currentValue = (currentSync as any)[pref.key];
                  const isRowFocused = accessibilityFocusArea === 'right' && subFocusIndex === prefIdx;
                  return (
                    <View
                      key={pref.key}
                      style={[styles.syncItemRow, isRowFocused && styles.rightItemFocused]}
                    >
                      {isRowFocused && subFocusIndex === prefIdx && <SpinningBorderSearch size={s(180)} spread={0.5} borderRadius={0} />}
                      <Text style={styles.syncItemLabel}>{pref.label}</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        {pref.options.map((opt) => (
                          <TouchableOpacity
                            key={opt.id}
                            style={[
                              styles.platformBtn,
                              currentValue === opt.id && styles.platformBtnActive,
                            ]}
                            onPress={() =>
                              updateUser({
                                settings: {
                                  ...activeUser?.settings,
                                  syncPreferences: {
                                    ...currentSync,
                                    [pref.key]: opt.id,
                                  } as any,
                                },
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.platformBtnText,
                                currentValue === opt.id && styles.platformBtnTextActive,
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ── Helper: formatear tiempo relativo ("hace X min/horas") ──
  const formatTimeAgo = (timestamp: number): string => {
    if (!timestamp || !isFinite(timestamp)) return '';
    try {
      const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
      const diffSec = Math.round((ms - Date.now()) / 1000);
      const absSec = Math.abs(diffSec);
      if (absSec < 60) return t('common.justNow');
      if (absSec < 3600) return `${Math.floor(absSec / 60)} ${t('common.minutesAgo')}`;
      if (absSec < 86400) return `${Math.floor(absSec / 3600)} ${t('common.hoursAgo')}`;
      return `${Math.floor(absSec / 86400)} ${t('common.daysAgo')}`;
    } catch { return ''; }
  };

  // =========================================================================
  // SCREEN: USERS AND ACCOUNTS -> PROFILE SCREEN (Image 2 + Foto Portada)
  // =========================================================================
  const renderProfileViewScreen = () => {
    const coverUri = activeUser?.coverImage || null;
    const userColor = activeUser?.color || '#00D4FF';
    const { gamesCount, totalMinutes, averageMinutes, topGame, topGameMinutes, favoritesCount } = profileStats;

    // ¿Este item tiene el foco de mando/teclado?
    const isFocused = (id: ProfileSectionId, index: number) => {
      if (profileFocusArea !== 'content') return false;
      const section = profileSections[profileSectionIndex];
      return !!section && section.id === id && profileItemIndex === index;
    };
    const setItemRef = (id: ProfileSectionId, index: number) => (el: any) => {
      profileItemRefs.current[`${id}:${index}`] = el;
    };
    // Con mouse/touch: tocar un item lo enfoca para que teclado y puntero
    // compartan el mismo estado.
    const focusItem = (id: ProfileSectionId, index: number) => {
      const sectionIdx = profileSections.findIndex((sec) => sec.id === id);
      if (sectionIdx < 0) return;
      setProfileFocusArea('content');
      setProfileSectionIndex(sectionIdx);
      setProfileItemIndex(index);
    };
    const pressGame = (id: ProfileSectionId, index: number, game: any) => {
      focusItem(id, index);
      onGamePress?.(game);
    };

    return (
      <View ref={profileWrapperRef} style={styles.contentWrapper}>
        {/* Toda la página (banner + cabecera + pestañas + contenido) hace
            scroll junta, como en el perfil de referencia. */}
        <ScrollView
          ref={profileScrollRef}
          contentContainerStyle={styles.profilePageContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            profileScrollY.current = y;
            setProfileScrolled(y > s(380));
          }}
        >
          {/* Cover Photo Banner (Foto Portada) */}
          <View style={styles.profileBannerContainer}>
            {coverUri ? (
              <Image source={resolveImageSource(coverUri)} style={styles.profileBannerImage} contentFit="cover" />
            ) : (
              <View
                style={[
                  styles.profileBannerGradient,
                  {
                    background: `linear-gradient(135deg, ${userColor}33 0%, rgba(20, 20, 30, 0.8) 100%)`,
                  } as any,
                ]}
              >
                <View style={styles.profileBannerOverlay} />
              </View>
            )}

            {/* Back button in top-left */}
            <TouchableOpacity style={styles.profileBackButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={s(22)} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Profile Header Info */}
          <View style={styles.profileHeaderContent}>
            <View style={styles.profileAvatarWrapper}>
              <View style={[styles.profileAvatarCircle, { borderColor: userColor }]}>
                {userAvatarUri ? (
                  <Image source={resolveImageSource(userAvatarUri)} style={styles.profileAvatarImg} />
                ) : (
                  <Ionicons name="person" size={s(54)} color="rgba(255,255,255,0.6)" />
                )}
                {/* Online indicator dot */}
                <View style={styles.profileOnlineDot} />
              </View>

              <View style={styles.profileInfoDetails}>
                <View style={styles.profileNameRow}>
                  <Text style={styles.profileDisplayName}>{activeUser?.name || 'Player'}</Text>
                  <View style={styles.profilePlusBadge}>
                    <Ionicons name="add" size={s(14)} color="#000" />
                  </View>
                </View>
                <View style={styles.profileHandleRow}>
                  <Text style={styles.profileHandleText}>
                    {activeUser?.onlineId || activeUser?.name?.toLowerCase().replace(/\s+/g, '_') || 'player_1'}
                  </Text>
                  <Text style={styles.profileHandleSep}>|</Text>
                  <Ionicons name="game-controller" size={s(14)} color="rgba(255,255,255,0.6)" />
                </View>
              </View>
            </View>

            {/* Header Action Buttons on Right (Edit Profile, etc.) */}
            <View style={styles.profileHeaderActions}>
              <TouchableOpacity
                style={[
                  styles.profileActionButtonRound,
                  profileFocusArea === 'header_actions' && profileActionIndex === 0 && styles.profileActionButtonFocused,
                ]}
                onPress={() => navigateToScreen('profile_edit')}
              >
                {profileFocusArea === 'header_actions' && profileActionIndex === 0 && <SpinningBorderSearch size={s(180)} spread={4} borderRadius={18} />}
                <Ionicons name="pencil" size={s(20)} color="#FFF" />
                <Text style={styles.profileActionButtonLabel}>{t('profile.editProfile')}</Text>
              </TouchableOpacity>

              {allUsers.length > 1 && (
                <TouchableOpacity
                  style={[
                    styles.profileActionButtonRoundSmall,
                    profileFocusArea === 'header_actions' && profileActionIndex === 1 && styles.profileActionButtonFocused,
                  ]}
                  onPress={() => {
                    const nextUser = allUsers.find((u) => u.id !== activeUser?.id);
                    if (nextUser && onSwitchUser) onSwitchUser(nextUser);
                  }}
                >
                  {profileFocusArea === 'header_actions' && profileActionIndex === 1 && <SpinningBorderSearch size={s(180)} spread={4} borderRadius={18} />}
                  <Ionicons name="people-outline" size={s(20)} color="#FFF" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Profile Tabs (Overview, Friends) */}
          <View style={styles.profileTabsBar}>
            {PROFILE_TABS.map((tabKey) => {
              const isActive = profileActiveTab === tabKey;
              return (
                <TouchableOpacity
                  key={tabKey}
                  style={[styles.profileTabItem, isActive && styles.profileTabItemActive]}
                  onPress={() => {
                    setProfileActiveTab(tabKey);
                    setProfileSectionIndex(0);
                    setProfileItemIndex(0);
                    soundService.playTab();
                  }}
                >
                  {profileFocusArea === 'tabs' && isActive && <SpinningBorderSearch size={s(180)} spread={0} borderRadius={1} />}
                  <Text style={[styles.profileTabText, isActive && styles.profileTabTextActive]}>
                    {t(`profile.${tabKey}` as any)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Overview ── */}
          {profileActiveTab === 'overview' && (
            <View style={styles.overviewContainer}>
              {/* Barra de estadísticas: valor arriba, etiqueta abajo */}
              <View style={styles.statsBar}>
                <View style={[styles.statCell, { flex: 1 }]}>
                  <View style={styles.statCellBody}>
                    <Ionicons name="time-outline" size={s(28)} color="#FFCC00" />
                    <Text style={styles.statNumber}>{formatCompactMinutes(totalMinutes)}</Text>
                  </View>
                  <View style={styles.statCellFooter}>
                    <Text style={styles.statLabel}>{t('profile.totalPlaytime')}</Text>
                  </View>
                </View>

                <View style={[styles.statCell, { flex: 1 }]}>
                  <View style={styles.statCellBody}>
                    <Ionicons name="game-controller-outline" size={s(28)} color="#00D4FF" />
                    <Text style={styles.statNumber}>{gamesCount}</Text>
                  </View>
                  <View style={styles.statCellFooter}>
                    <Text style={styles.statLabel}>{t('profile.gamesCount')}</Text>
                  </View>
                </View>

                <View style={[styles.statCell, { flex: 1 }]}>
                  <View style={styles.statCellBody}>
                    <Ionicons name="hourglass-outline" size={s(28)} color="#B388FF" />
                    <Text style={styles.statNumber}>{formatCompactMinutes(averageMinutes)}</Text>
                  </View>
                  <View style={styles.statCellFooter}>
                    <Text style={styles.statLabel}>{tr('profile.averagePlaytime', 'Average playtime')}</Text>
                  </View>
                </View>

                <View style={[styles.statCell, { flex: 2 }]}>
                  <View style={[styles.statCellBody, styles.statCellBodyTopGame]}>
                    {topGame ? (
                      <>
                        <BlurredArt source={topGame.image} style={styles.topGameThumb} radius={s(8)} placeholderSize={s(22)} />
                        <View style={styles.topGameInfo}>
                          <Text style={styles.topGameTitle} numberOfLines={2}>{topGame.title}</Text>
                          <Text style={styles.topGamePlaytime}>{formatPlaytime(topGameMinutes, t)}</Text>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.statNumber}>--</Text>
                    )}
                  </View>
                  <View style={styles.statCellFooter}>
                    <Text style={styles.statLabel}>{tr('profile.topGame', 'Most played')}</Text>
                  </View>
                </View>

                <View style={[styles.statCell, { flex: 1 }]}>
                  <View style={styles.statCellBody}>
                    <Ionicons name="heart-outline" size={s(28)} color="#FF3B30" />
                    <Text style={styles.statNumber}>{favoritesCount}</Text>
                  </View>
                  <View style={styles.statCellFooter}>
                    <Text style={styles.statLabel}>{t('profile.favoriteGames')}</Text>
                  </View>
                </View>
              </View>

              {/* Actividad reciente: últimos juegos jugados */}
              <View style={styles.profileSection}>
                <View style={styles.profileSectionHeader}>
                  <Text style={styles.profileSectionTitle}>{t('lastPlayed.title')}</Text>
                </View>
                {profileRecentGames.length > 0 ? (
                  <View style={styles.recentList}>
                    {profileRecentGames.map((game: any, idx: number) => {
                      const minutes = gameMinutes(game);
                      return (
                        <TouchableOpacity
                          key={game.id || idx}
                          ref={setItemRef('recent', idx)}
                          activeOpacity={0.85}
                          style={[styles.recentRow, isFocused('recent', idx) && styles.profileItemFocused]}
                          onPress={() => pressGame('recent', idx, game)}
                        >
                          <BlurredArt source={game.image} style={styles.recentThumb} radius={0} placeholderSize={s(30)} />
                          <View style={styles.recentInfo}>
                            <Text style={styles.recentTitle} numberOfLines={1}>{game.title}</Text>
                            <Text style={styles.recentSub}>{formatTimeAgo(game.lastPlayed)}</Text>
                          </View>
                          <Text style={styles.recentPlaytime}>
                            {minutes > 0 ? formatPlaytime(minutes, t) : t('lastPlayed.never')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.libraryEmpty}>
                    <Text style={styles.libraryEmptyText}>{t('lastPlayed.noGamesYet')}</Text>
                  </View>
                )}
              </View>

              {/* Biblioteca (sin Welcome, PlayStation Store ni Last Played) */}
              <View style={styles.profileSection}>
                <View style={styles.profileSectionHeader}>
                  <Text style={styles.profileSectionTitle}>{t('library.title')}</Text>
                  {gamesCount > 0 && <Text style={styles.profileSectionCount}>{gamesCount}</Text>}
                </View>
                {profileLibraryGames.length > 0 ? (
                  <View ref={profileLibraryViewportRef}>
                    <ScrollView
                      ref={profileLibraryRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      scrollEventThrottle={16}
                      onScroll={(e) => {
                        profileLibraryScrollX.current = e.nativeEvent.contentOffset.x;
                      }}
                      contentContainerStyle={styles.libraryScrollContent}
                    >
                      {profileLibraryGames.map((game: any, idx: number) => {
                        const focused = isFocused('library', idx);
                        const minutes = gameMinutes(game);
                        return (
                          <TouchableOpacity
                            key={game.id || idx}
                            ref={setItemRef('library', idx)}
                            activeOpacity={0.85}
                            style={[styles.libraryCard, focused && styles.libraryCardFocused]}
                            onPress={() => pressGame('library', idx, game)}
                          >
                            <BlurredArt
                              source={game.image}
                              style={[styles.libraryCardArt, focused && styles.libraryCardArtFocused]}
                              radius={s(12)}
                              placeholderSize={s(30)}
                            />
                            <View style={styles.libraryCardText}>
                              <Text style={styles.libraryCardTitle} numberOfLines={1}>{game.title}</Text>
                              <Text style={styles.libraryCardSub} numberOfLines={1}>
                                {minutes > 0 ? formatPlaytime(minutes, t) : t('lastPlayed.never')}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : (
                  <View style={styles.libraryEmpty}>
                    <Text style={styles.libraryEmptyText}>{t('library.empty')}</Text>
                  </View>
                )}
              </View>

              {/* Acerca de */}
              {activeUser?.about ? (
                <View
                  ref={setItemRef('about', 0) as any}
                  style={[styles.aboutCard, isFocused('about', 0) && styles.profileItemFocused]}
                >
                  <Text style={styles.aboutCardTitle}>{t('profile.about')}</Text>
                  <Text style={styles.aboutCardText}>{activeUser.about}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* ── Friends ── */}
          {profileActiveTab === 'friends' && (
            <View style={styles.friendsListContainer}>
              {profileFriends.map((u: any, idx: number) => (
                <View
                  key={u?.id || idx}
                  ref={setItemRef('friends', idx) as any}
                  style={[styles.friendCard, isFocused('friends', idx) && styles.profileItemFocused]}
                >
                  <Image
                    source={resolveImageSource(u?.avatar || require('@/assets/images/userDefault.jpeg'))}
                    style={styles.friendAvatar}
                  />
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.friendName}>{u?.name || 'Player'}</Text>
                    <Text style={styles.friendStatus}>{t('common.online')}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Barra fija que aparece al bajar, para poder volver sin subir */}
        {profileScrolled && (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(150)}
            style={styles.profileStickyBar}
          >
            <TouchableOpacity style={styles.profileStickyBack} onPress={handleBack}>
              <Ionicons name="arrow-back" size={s(20)} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.profileStickyTitle}>{t('settings.profile')}</Text>
          </Animated.View>
        )}
      </View>
    );
  };

  const profileEditLabels: Record<ProfileEditSection, string> = {
    name: t('profile.name'),
    onlineId: t('profile.onlineId'),
    picture: t('profile.profilePicture'),
    avatar: t('profile.avatar'),
    cover: t('profile.coverImage'),
    about: t('profile.about'),
    languages: t('profile.languages'),
  };

  const openProfileEditSection = (section: ProfileEditSection, index: number) => {
    setSubFocusIndex(index);
    setProfileEditSection(section);
    navigateToScreen('profile_edit_detail');
  };

  // =========================================================================
  // SCREEN: PROFILE EDIT (centered list of fields)
  // =========================================================================
  const renderProfileEditScreen = () => {
    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{t('settings.profile')}</Text>
        </View>

        <View style={styles.elongatedListWrap}>
          <View style={styles.psMenuList}>
            {PROFILE_EDIT_SECTIONS.map((section, index) => {
              const isFocused = subFocusIndex === index;
              return (
                <TouchableOpacity
                  key={section}
                  style={[styles.psMenuRow, isFocused && styles.psMenuRowFocused]}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' ? { onMouseEnter: () => setSubFocusIndex(index) } : {}) as any}
                  onPress={() => openProfileEditSection(section, index)}
                >
                  {isFocused && <SpinningBorderSearch size={s(180)} spread={2} borderRadius={1} />}
                  <Text style={[styles.psMenuRowText, isFocused && styles.psMenuRowTextFocused]}>
                    {profileEditLabels[section]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const renderProfileEditDetailScreen = () => {
    const title = profileEditLabels[profileEditSection];

    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{title}</Text>
        </View>

        <View style={styles.elongatedListWrap}>
          <View style={styles.profileDetailBody}>
            {profileEditSection === 'name' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.name')}</Text>
                <TextInput
                  ref={nameInputRef}
                  style={styles.editInputWide}
                  value={editName}
                  onChangeText={(text) => {
                    setEditName(text);
                    updateUser({ name: text });
                  }}
                  placeholder={t('settings.usernamePlaceholder')}
                  placeholderTextColor="#666"
                />
              </View>
            )}

            {profileEditSection === 'onlineId' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.onlineId')}</Text>
                <TextInput
                  ref={onlineIdInputRef}
                  style={styles.editInputWide}
                  value={editOnlineId}
                  onChangeText={(text) => {
                    setEditOnlineId(text);
                    updateUser({ onlineId: text });
                  }}
                  placeholder="e.g. splitz"
                  placeholderTextColor="#666"
                />
              </View>
            )}

            {profileEditSection === 'picture' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.profilePicture')}</Text>
                <View style={styles.profilePictureRow}>
                  <TouchableOpacity style={styles.avatarPickerThumb} onPress={handleSelectAvatar}>
                    {userAvatarUri ? (
                      <Image source={resolveImageSource(userAvatarUri)} style={styles.avatarPickerImg} />
                    ) : (
                      <Ionicons name="person" size={s(32)} color="#FFF" />
                    )}
                    <View style={styles.avatarEditOverlay}>
                      <Ionicons name="camera" size={s(16)} color="#FFF" />
                    </View>
                  </TouchableOpacity>
                  <View style={{ gap: 10, flex: 1 }}>
                    <TouchableOpacity
                      style={[styles.actionBtnSecondary, styles.actionBtnStretch]}
                      onPress={() => {
                        onClose();
                        onOpenAvatarModal?.();
                      }}
                    >
                      <Ionicons name="person-circle-outline" size={s(18)} color="#FFF" />
                      <Text style={styles.actionBtnSecondaryText}>{t('settings.chooseAvatar')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtnSecondary, styles.actionBtnStretch]} onPress={handleSelectAvatar}>
                      <Ionicons name="image-outline" size={s(18)} color="#FFF" />
                      <Text style={styles.actionBtnSecondaryText}>{t('settings.profilePhoto')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {profileEditSection === 'avatar' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>
                  {t('profile.avatar')} & {t('settings.profileColor')}
                </Text>
                <View style={styles.colorPickerRow}>
                  {['#FF3B30', '#00D4FF', '#FFCC00', '#4CD964', '#AF52DE', '#FF9500'].map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: color },
                        activeUser?.color === color && styles.colorCircleActive,
                      ]}
                      onPress={() => updateUser({ color })}
                    />
                  ))}
                </View>
              </View>
            )}

            {profileEditSection === 'cover' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.coverImage')}</Text>
                <View style={styles.coverActionsRow}>
                  <TouchableOpacity style={[styles.actionBtnSecondary, styles.actionBtnStretch]} onPress={handleSelectCover}>
                    <Ionicons name="image-outline" size={s(18)} color="#FFF" />
                    <Text style={styles.actionBtnSecondaryText}>{t('profile.coverImage')}</Text>
                  </TouchableOpacity>
                  {activeUser?.coverImage ? (
                    <TouchableOpacity
                      style={[
                        styles.actionBtnSecondary,
                        styles.actionBtnStretch,
                        { backgroundColor: '#3D1E24', borderColor: '#772233' },
                      ]}
                      onPress={() => {
                        setEditCoverImage('');
                        updateUser({ coverImage: '' });
                      }}
                    >
                      <Ionicons name="trash-outline" size={s(18)} color="#FF5566" />
                      <Text style={[styles.actionBtnSecondaryText, { color: '#FF5566' }]}>
                        {t('settings.restoreDefault')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}

            {profileEditSection === 'about' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.about')}</Text>
                <TextInput
                  ref={aboutInputRef}
                  style={[styles.editInputWide, styles.editInputMultiline]}
                  value={editAbout}
                  multiline
                  onChangeText={(text) => {
                    setEditAbout(text);
                    updateUser({ about: text });
                  }}
                  placeholder={t('profile.aboutPlaceholder')}
                  placeholderTextColor="#666"
                />
              </View>
            )}

            {profileEditSection === 'languages' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.languages')}</Text>
                <View style={styles.languagePillsRow}>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.platformBtn, language === option.id && styles.platformBtnActive]}
                      onPress={() => changeLanguage(option.id)}
                    >
                      <Text
                        style={[
                          styles.platformBtnText,
                          language === option.id && styles.platformBtnTextActive,
                        ]}
                      >
                        {option.nativeName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  // =========================================================================
  // SCREEN: SYSTEM (Image 3 - Two Columns: Software, HDMI, Language, Date)
  // =========================================================================
  const renderSystemScreen = () => {
    const systemSections = [
      { id: 'software', title: t('settings.systemSoftware') },
      { id: 'hdmi', title: t('settings.hdmi') },
      { id: 'language', title: t('settings.language') },
      { id: 'date_time', title: t('settings.dateAndTime') },
      { id: 'launcher_behavior', title: t('settings.launcherBehavior') },
    ];

    const currentLauncherBehavior: LauncherPlayBehavior =
      (activeUser?.settings as any)?.launcherPlayBehavior || 'hide';

    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{t('settings.system')}</Text>
        </View>

        <View style={styles.twoColumnContainer}>
          {/* Left Column (Menu items) */}
          <View style={styles.systemLeftColumn}>
            {systemSections.map((sec, idx) => {
              const isSelected = systemLeftIndex === idx;
              const isFocused = systemFocusArea === 'left' && systemLeftIndex === idx;
              return (
                <TouchableOpacity
                  key={sec.id}
                  style={[
                    styles.systemLeftItem,
                    isSelected && styles.systemLeftItemActive,
                    isFocused && styles.systemLeftItemFocused,
                  ]}
                  onPress={() => {
                    setSystemLeftIndex(idx);
                    soundService.playNavigation();
                  }}
                >
                  {isFocused && <SpinningBorderSearch size={s(180)} spread={2} borderRadius={1} />}
                  <Text
                    style={[
                      styles.systemLeftItemText,
                      isSelected && styles.systemLeftItemTextActive,
                    ]}
                  >
                    {sec.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Right Column (Sub-options for selected item) */}
          <View style={styles.systemRightColumn}>
            {systemLeftIndex === 0 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* ── Banner WPS5 ── */}
                <View style={styles.systemBannerContainer}>
                  <Image
                    source={require('@/assets/banner/BannerWps5.png')}
                    style={styles.systemBannerImage}
                    contentFit="cover"
                  />
                  <Text style={styles.systemBannerTitle}>WPS5</Text>
                </View>

                <Text style={styles.rightSectionTitle}>{t('settings.systemSoftware')}</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>WPS5 Console OS</Text>
                  <Text style={styles.infoRowValue}>Version 1.1.4 (Build 2026.9)</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Environment</Text>
                  <Text style={styles.infoRowValue}>{Platform.OS === 'web' ? 'Electron / Web' : Platform.OS}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Screen Resolution</Text>
                  <Text style={styles.infoRowValue}>
                    {Math.round(Dimensions.get('window').width)} x {Math.round(Dimensions.get('window').height)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Check for updates</Text>
                  <TouchableOpacity
                    style={styles.psButtonLarge}
                    onPress={async () => {
                      try {
                        const res = await fetch(
                          'https://angelvc25.github.io/WPS5-API/WPS5-API-V.json'
                        );
                        if (!res.ok) throw new Error('Network response was not ok');
                        const data = await res.json() as {
                          name: string;
                          tipe: string;
                          version: string;
                          link: string;
                        }[];
                        const latest = data[0];
                        console.log(latest.version, latest.tipe, latest.link);
                        console.log(data);
                        const currentVersion = '1.1.4';
                        const comparison = compareVersions(latest.version, currentVersion);
                        if (comparison > 0) {
                          toastService.show(`${t('settings.updateAvailable')}\n${latest.version}`, {
                            icon: require('@/assets/images/applogo_clean.png'),
                            source: 'steam',
                          });
                          setTimeout(() => {
                            Linking.openURL(latest.link);
                          }, 1500);
                        } else {
                          toastService.show(t('settings.youHaveTheLatestVersion'), {
                            icon: require('@/assets/images/applogo_clean.png'),
                            source: 'steam',
                          });
                        }
                      } catch (error) {
                        console.error('Error checking for updates:', error);
                        toastService.show(t('settings.updateCheckFailed'), {
                          icon: require('@/assets/images/applogo_clean.png'),
                          source: 'steam',
                        });
                      }
                    }}
                  >
                    <Text style={styles.psButtonLargeText}>Check</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {systemLeftIndex === 1 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.hdmi')}</Text>

                <View
                  style={[
                    styles.toggleRowSection,
                    systemFocusArea === 'right' && subFocusIndex === 0 && styles.rightItemFocused,
                  ]}
                >
                  {systemFocusArea === 'right' && subFocusIndex === 0 && <SpinningBorderSearch size={s(160)} spread={0} borderRadius={1} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleRowTitle}>Enable HDMI Device Link</Text>
                    <Text style={styles.toggleRowDesc}>Control power state via connected HDMI displays.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.psSwitch, hdmiDeviceLink && styles.psSwitchActive]}
                    onPress={() => setHdmiDeviceLink(!hdmiDeviceLink)}
                  >
                    <View style={[styles.psSwitchThumb, hdmiDeviceLink && styles.psSwitchThumbActive]} />
                  </TouchableOpacity>
                </View>

                <View
                  style={[
                    styles.toggleRowSection,
                    systemFocusArea === 'right' && subFocusIndex === 1 && styles.rightItemFocused,
                  ]}
                >
                  {systemFocusArea === 'right' && subFocusIndex === 1 && <SpinningBorderSearch size={s(160)} spread={0} borderRadius={1} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleRowTitle}>Enable HDCP</Text>
                    <Text style={styles.toggleRowDesc}>High-bandwidth Digital Content Protection.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.psSwitch, hdmiHdcp && styles.psSwitchActive]}
                    onPress={() => setHdmiHdcp(!hdmiHdcp)}
                  >
                    <View style={[styles.psSwitchThumb, hdmiHdcp && styles.psSwitchThumbActive]} />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {systemLeftIndex === 2 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.language')}</Text>
                <Text style={[styles.pathDesc, { marginBottom: 20 }]}>{t('settings.languageDesc')}</Text>

                <View style={{ gap: 12 }}>
                  {LANGUAGE_OPTIONS.map((opt, optIdx) => {
                    const isSelected = language === opt.id;
                    const isRowFocused = systemFocusArea === 'right' && subFocusIndex === optIdx;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.languageSelectRow,
                          isSelected && styles.languageSelectRowActive,
                          isRowFocused && styles.rightItemFocused,
                        ]}
                        onPress={() => changeLanguage(opt.id)}
                      >
                        {isRowFocused && <SpinningBorderSearch size={s(160)} spread={1} borderRadius={8} />}
                        <Text
                          style={[
                            styles.languageSelectText,
                            isSelected && styles.languageSelectTextActive,
                          ]}
                        >
                          {opt.nativeName}
                        </Text>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={s(22)} color="#00D4FF" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {systemLeftIndex === 4 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.launcherBehavior')}</Text>
                <Text style={[styles.pathDesc, { marginBottom: 20 }]}>
                  {t('settings.launcherBehaviorDesc')}
                </Text>

                <View style={{ gap: 12 }}>
                  {LAUNCHER_BEHAVIOR_OPTIONS.map((opt, optIdx) => {
                    const isSelected = currentLauncherBehavior === opt.id;
                    const isRowFocused = systemFocusArea === 'right' && subFocusIndex === optIdx;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.toggleRowSection,
                          isSelected && styles.languageSelectRowActive,
                          isRowFocused && styles.rightItemFocused,
                        ]}
                        onPress={() => persistLauncherBehavior(opt.id)}
                      >
                        {isRowFocused && <SpinningBorderSearch size={s(160)} spread={0} borderRadius={1} />}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.toggleRowTitle}>
                            {t(opt.labelKey as Parameters<typeof t>[0])}
                          </Text>
                          <Text style={styles.toggleRowDesc}>
                            {t(opt.descKey as Parameters<typeof t>[0])}
                          </Text>
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={s(22)} color="#00D4FF" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {systemLeftIndex === 3 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.dateAndTime')}</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Current Time</Text>
                  <Text style={styles.infoRowValue}>{new Date().toLocaleTimeString()}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Timezone</Text>
                  <Text style={styles.infoRowValue}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <Animated.View
      style={styles.fullScreenContainer}
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
    >
      {/* Background Video */}
      <BackgroundVideo
        source={require('@/assets/video/waves_ajustes.mp4')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        shouldPlay
        isLooping
        muted
      />

      {/* Dark Ambient Overlay */}
      <View style={styles.darkOverlay} />

      {/* Main Container */}
      <View style={styles.settingsBody}>
        {currentScreen === 'main' && renderMainScreen()}
        {currentScreen === 'guide' && renderGuideScreen()}
        {currentScreen === 'accessibility' && renderAccessibilityScreen()}
        {currentScreen === 'users_and_accounts' && renderProfileViewScreen()}
        {currentScreen === 'profile_edit' && renderProfileEditScreen()}
        {currentScreen === 'profile_edit_detail' && renderProfileEditDetailScreen()}
        {currentScreen === 'system' && renderSystemScreen()}
      </View>
      {/* Control Prompt Bar at Bottom */}
      {currentScreen === 'accessibility' && accessibilityLeftIndex === 7 && (
        <View style={styles.bottomControlBarContainer2}>
          <View style={[styles.bottomControlBar, {}]}>
            <PSIcon
              char={PSIcons.r1}
              size={s(26)}
              color={'#fff'}
            />
            <Text style={styles.bottomBarText}>/</Text>
            <PSIcon
              char={PSIcons.l1}
              size={s(26)}
              color={'#fff'}
            />
            <Text style={styles.bottomBarText}>{t('search.changeTabs')}</Text>
          </View>
        </View>
      )
      }



      {/* Control Prompt Bar at Bottom */}
      <View style={styles.bottomControlBarContainer}>
        <View style={[styles.bottomControlBar, {}]}>
          <PSIcon
            char={PSIcons.cross}
            size={s(26)}
            color={'#fff'}
          />
          <Text style={styles.bottomBarText}>{t('common.select')}</Text>
          <PSIcon
            char={PSIcons.circle}
            size={s(26)}
            color={'#fff'}
          />
          <Text style={styles.bottomBarText}>{t('common.back')}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

type ScaleFn = (px: number) => number;

const createStyles = (s: ScaleFn) => StyleSheet.create({
  fullScreenContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: '#0D0D12',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 16, 0.34)',
  },
  bottomControlBar: {
    position: 'absolute',
    padding: s(2),
    //bottom: 60,
    left: s(15),
    //right: 72,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

  },
  bottomBarText: {
    color: '#FFF',
    fontSize: s(20),
    paddingHorizontal: s(10),
    fontFamily: 'SSTMedium'
  },
  bottomControlBarContainer: {
    //width: 340,
    minWidth: s(270),

    height: s(37),
    //maxWidth: 340,
    position: 'fixed',
    right: s(20),
    bottom: s(20),
    paddingHorizontal: s(22),
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    gap: s(20),
    display: 'flex',
    justifyContent: 'center',
  },
  bottomControlBarContainer2: {
    //width: 340,
    minWidth: s(270),

    height: s(37),
    //maxWidth: 340,
    position: 'fixed',
    left: s(20),
    bottom: s(20),
    paddingHorizontal: s(22),
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    gap: s(20),
    display: 'flex',
    justifyContent: 'center',
  },
  settingsBody: {
    flex: 1,
    paddingTop: s(56),
    paddingHorizontal: s(72),
    paddingBottom: s(60),
  },
  contentWrapper: {
    flex: 1,
  },
  mainHeaderTitle: {
    color: '#FFF',
    fontSize: s(32),
    fontFamily: 'SSTLight',
    marginBottom: s(28),
    letterSpacing: 0.4,
  },
  subScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: s(30),
    gap: s(16),
  },
  backButtonInline: {
    padding: s(8),
    borderRadius: s(20),
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  subScreenHeaderTitle: {
    color: '#FFF',
    fontSize: s(26),
    fontFamily: 'SSTLight',
  },

  // Main Vertical List (PS5 style: centered, elongated)
  elongatedListWrap: {
    flex: 1,
    alignItems: 'center',
  },
  psMenuList: {
    width: '88%',
    maxWidth: s(1100),
    borderRightColor: 'rgba(255, 255, 255, 0.16)',
  },
  psMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: s(26),
    paddingHorizontal: s(16),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: s(0),
  },
  psMenuRowFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    //borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  psMenuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(18),
  },
  mainMenuItemIcon: {
    width: s(32),
    textAlign: 'center',
  },
  mainMenuUserAvatar: {
    width: s(32),
    height: s(32),
    borderRadius: s(16),
  },
  psMenuRowText: {
    color: '#FFFFFF',
    fontSize: s(20),
    fontFamily: 'SSTLight',
    letterSpacing: 0.25,
  },
  psMenuRowTextFocused: {
    color: '#FFF',
    fontFamily: 'SSTLight',
  },

  // Scroll body for sub screens
  scrollBody: {
    paddingBottom: s(60),
  },

  // Section Cards & Controls
  cardSection: {
    marginBottom: s(30),
    paddingBottom: s(20),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionLabel: {
    color: '#9c9b96ff',
    fontSize: s(15),
    fontWeight: '700',
    fontFamily: 'SSTMedium',
    letterSpacing: 1.2,
    marginBottom: s(10),
  },
  pathDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
    lineHeight: s(20),
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: s(12),
    paddingHorizontal: s(20),
    borderRadius: 0,
    gap: s(10),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignSelf: 'flex-start',
  },
  actionBtnSecondaryText: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTLight',
    //fontWeight: '600',
  },

  // Toggle rows
  toggleRowSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: s(18),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  toggleRowTitle: {
    color: '#FFF',
    fontSize: s(17),
    fontFamily: 'SSTLight',
    marginBottom: s(4),
  },
  toggleRowDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
    lineHeight: s(18),
  },
  psSwitch: {
    width: s(52),
    height: s(30),
    borderRadius: s(15),
    backgroundColor: 'rgba(48, 49, 54, 1)',
    padding: s(3),
    justifyContent: 'center',
  },
  psSwitchActive: {
    backgroundColor: 'rgba(71, 73, 80, 1)',
  },
  psSwitchThumb: {
    width: s(24),
    height: s(24),
    borderRadius: s(12),
    borderWidth: 2,
    borderColor: 'rgba(94, 100, 105, 1)',
    backgroundColor: 'rgba(48, 49, 54, 1)',
  },
  psSwitchThumbActive: {
    transform: [{ translateX: 22 }],
    backgroundColor: '#ffffffff',
    borderColor: 'rgba(255, 255, 255, 1)',
  },

  // Platform/Sync buttons
  syncItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: s(12),
  },
  syncItemLabel: {
    color: '#E0E0FF',
    fontSize: s(15),
    fontFamily: 'SSTLight',
  },
  platformBtn: {
    paddingVertical: s(8),
    paddingHorizontal: s(16),
    borderRadius: s(8),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  platformBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  platformBtnText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: s(15),
    fontFamily: 'SSTMedium',
    //fontWeight: '600',
  },
  platformBtnTextActive: {
    color: '#000',
    fontWeight: 'bold',
  },

  // Support / Guide
  supportMessageContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: s(16),
    padding: s(28),
    marginBottom: s(30),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  supportTextMain: {
    color: '#FFF',
    fontSize: s(22),
    fontFamily: 'SSTLight',
    //fontWeight: '300',
    textAlign: 'center',
    marginBottom: s(10),
  },
  supportTextSub: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
    textAlign: 'center',
    lineHeight: s(22),
    maxWidth: s(600),
  },
  supportLinksRow: {
    flexDirection: 'row',
    gap: s(16),
    marginBottom: s(35),
  },
  supportLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: s(12),
    paddingHorizontal: s(20),
    borderRadius: s(12),
    gap: s(10),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  supportLinkBtnText: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTMedium',
    //fontWeight: '600',
  },
  patronsSection: {
    marginTop: s(10),
  },
  patronsListGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: s(12),
    marginTop: s(12),
  },
  patronCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: s(8),
    paddingHorizontal: s(14),
    borderRadius: s(10),
    gap: s(8),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  patronName: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: s(14),
    fontFamily: 'SSTMedium',
    //fontWeight: '500',
  },

  // Profile View (Image 2)
  profileBannerContainer: {
    width: '100%',
    height: s(380),
    borderRadius: s(16),
    overflow: 'hidden',
    position: 'relative',
    marginBottom: s(-45),
  },
  profileBannerImage: {
    width: '100%',
    height: '100%',
  },
  profileBannerGradient: {
    width: '100%',
    height: '100%',
  },
  profileBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  profileBackButton: {
    position: 'absolute',
    top: s(16),
    left: s(16),
    width: s(38),
    height: s(38),
    borderRadius: s(19),
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: s(24),
    marginBottom: s(25),
  },
  profileAvatarWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: s(18),
  },
  profileAvatarCircle: {
    width: s(90),
    height: s(90),
    borderRadius: s(45),
    borderWidth: 3.5,
    backgroundColor: '#1E1E24',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  profileAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: s(45),
  },
  profileOnlineDot: {
    position: 'absolute',
    bottom: s(2),
    right: s(2),
    width: s(18),
    height: s(18),
    borderRadius: s(9),
    backgroundColor: '#4CD964',
    borderWidth: 3,
    borderColor: '#0D0D12',
  },
  profileInfoDetails: {
    marginBottom: s(6),
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
  },
  profileDisplayName: {
    color: '#FFF',
    fontSize: s(24),
    fontFamily: 'SSTBold',
  },
  profilePlusBadge: {
    width: s(20),
    height: s(20),
    borderRadius: s(10),
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    marginTop: s(2),
  },
  profileHandleText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: s(14),
    fontFamily: 'SSTLight',
  },
  profileHandleSep: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: s(14),
    fontFamily: 'SSTLight',
  },
  profileHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    marginBottom: s(8),
  },
  profileActionButtonRound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    //backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: s(10),
    paddingHorizontal: s(18),
    //borderRadius: s(24),
    //borderWidth: 1,
    //borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  profileActionButtonRoundSmall: {
    width: s(44),
    height: s(44),
    borderRadius: s(22),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  profileActionButtonFocused: {
    //borderColor: '#FFFFFF',
    //backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  profileActionButtonLabel: {
    color: '#FFF',
    fontSize: s(14),
    fontFamily: 'SSTMedium',
  },
  profileTabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: s(20),
    paddingHorizontal: s(8),
  },
  profileTabItem: {
    paddingVertical: s(12),
    paddingHorizontal: s(22),
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  profileTabItemActive: {
    borderBottomColor: '#FFFFFF',
  },
  profileTabText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
  },
  profileTabTextActive: {
    color: '#FFF',
    fontFamily: 'SSTMedium',
  },
  profilePageContent: {
    paddingBottom: s(48),
  },
  overviewContainer: {
    gap: s(32),
  },

  // ── Barra de estadísticas ──
  statsBar: {
    flexDirection: 'row',
    gap: s(12),
  },
  statCell: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  statCellBody: {
    minHeight: s(96),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(12),
    paddingHorizontal: s(16),
    paddingVertical: s(14),
  },
  statCellBodyTopGame: {
    justifyContent: 'flex-start',
  },
  statCellFooter: {
    paddingVertical: s(10),
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  statNumber: {
    color: '#FFF',
    fontSize: s(30),
    fontFamily: 'SSTBold',
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: s(14),
    fontFamily: 'SSTLight',
  },
  topGameThumb: {
    width: s(64),
    height: s(64),
  },
  topGameInfo: {
    flex: 1,
  },
  topGameTitle: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTMedium',
  },
  topGamePlaytime: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: s(13),
    fontFamily: 'SSTLight',
    marginTop: s(2),
  },

  // ── Secciones (título + contenido) ──
  profileSection: {
    gap: s(14),
  },
  profileSectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  profileSectionTitle: {
    color: '#FFF',
    fontSize: s(22),
    fontFamily: 'SSTBold',
  },
  profileSectionCount: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
  },
  // Foco compartido por filas, tarjeta "Acerca de" y amigos.
  profileItemFocused: {
    borderColor: '#00D4FF',
    backgroundColor: 'rgba(0, 212, 255, 0.08)',
  },

  // ── Actividad reciente ──
  recentList: {
    gap: s(12),
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(20),
    paddingRight: s(24),
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  recentThumb: {
    width: s(220),
    height: s(112),
  },
  recentInfo: {
    flex: 1,
  },
  recentTitle: {
    color: '#FFF',
    fontSize: s(17),
    fontFamily: 'SSTMedium',
  },
  recentSub: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: s(14),
    fontFamily: 'SSTLight',
    marginTop: s(4),
  },
  recentPlaytime: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: s(14),
    fontFamily: 'SSTLight',
  },

  // ── Biblioteca ──
  libraryScrollContent: {
    gap: s(16),
    paddingVertical: s(10),
    paddingHorizontal: s(6),
  },
  libraryCard: {
    width: s(210),
    gap: s(10),
  },
  libraryCardFocused: {
    transform: [{ scale: 1.03 }],
  },
  libraryCardArt: {
    width: '100%',
    height: s(280),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  libraryCardArtFocused: {
    borderColor: '#00D4FF',
  },
  libraryCardText: {
    paddingHorizontal: s(2),
  },
  libraryCardTitle: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTMedium',
  },
  libraryCardSub: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: s(13),
    fontFamily: 'SSTLight',
    marginTop: s(2),
  },
  libraryEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: s(14),
    padding: s(20),
    alignItems: 'center',
  },
  libraryEmptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: s(14),
    fontFamily: 'SSTLight',
  },

  // ── Acerca de ──
  aboutCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: s(14),
    padding: s(20),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  aboutCardTitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: s(15),
    fontFamily: 'SSTBold',
    marginBottom: s(8),
  },
  aboutCardText: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTLight',
  },

  // ── Barra fija superior del perfil ──
  profileStickyBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: s(52),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    paddingHorizontal: s(14),
    backgroundColor: '#0D0D12',
    borderBottomLeftRadius: s(14),
    borderBottomRightRadius: s(14),
    zIndex: 10,
  },
  profileStickyBack: {
    width: s(34),
    height: s(34),
    borderRadius: s(17),
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileStickyTitle: {
    color: '#FFF',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
  },

  gamesGridList: {
    gap: s(12),
  },
  gameListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: s(12),
    padding: s(12),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  gameListThumb: {
    width: s(60),
    height: s(60),
    borderRadius: s(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameListInfo: {
    flex: 1,
    marginLeft: s(16),
  },
  gameListTitle: {
    color: '#FFF',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
    marginBottom: s(4),
  },
  gameListSub: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
  },
  friendsListContainer: {
    gap: s(12),
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: s(12),
    padding: s(14),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  friendAvatar: {
    width: s(44),
    height: s(44),
    borderRadius: s(22),
  },
  friendName: {
    color: '#FFF',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
  },
  friendStatus: {
    color: '#4CD964',
    fontSize: s(12),
    fontFamily: 'SSTLight',
    marginTop: s(2),
  },
  sharedContainer: {
    minHeight: s(180),
  },
  emptyShared: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: s(50),
  },
  emptySharedText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
    marginTop: s(12),
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: s(14),
  },
  mediaCard: {
    width: s(180),
    borderRadius: s(10),
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  // Tarjetas grandes de Splash Videos: toda la tarjeta es el elemento
  // enfocable/pulsable (abre el modal de preview), sin botones debajo.
  mediaCardLarge: {
    borderRadius: s(14),
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  mediaCardFocused: {
    borderColor: '#00d5ff98',
    backgroundColor: 'rgba(0, 212, 255, 0.08)',
    transform: [{ scale: 1.02 }],
  },
  mediaCardBusyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: s(180),
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaThumb: {
    width: '100%',
    height: s(100),
  },
  mediaThumbLarge: {
    width: '100%',
    height: s(180),
  },
  mediaTitle: {
    color: '#FFF',
    fontSize: s(15),
    padding: s(8),
    fontFamily: 'SSTLight',
  },

  // Modal de preview de Splash Video
  splashModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: s(24),
  },
  splashModalCard: {
    width: '100%',
    maxWidth: s(760),
    borderRadius: s(16),
    overflow: 'hidden',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  splashModalVideoWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
  },
  splashModalCloseBtn: {
    position: 'absolute',
    top: s(12),
    right: s(12),
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashModalInfo: {
    padding: s(18),
  },
  splashModalActions: {
    flexDirection: 'row',
    gap: s(10),
    marginTop: s(12),
    flexWrap: 'wrap',
  },

  // Edit Profile Screen
  editListItem: {
    marginBottom: s(24),
    paddingBottom: s(18),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  editListLabel: {
    color: '#FFF',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
    //fontWeight: '500',
    marginBottom: s(12),
  },
  editInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    color: '#FFF',
    padding: s(14),
    borderRadius: s(10),
    fontSize: s(15),
    fontFamily: 'SSTLight',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  editInputWide: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    color: '#FFF',
    paddingVertical: s(16),
    paddingHorizontal: s(18),
    borderRadius: s(10),
    fontSize: s(16),
    fontFamily: 'SSTLight',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    width: '100%',
  },
  editInputMultiline: {
    height: s(140),
    textAlignVertical: 'top',
  },
  profileDetailBody: {
    width: '88%',
    maxWidth: s(1100),
  },
  profileDetailBlock: {
    width: '100%',
  },
  profilePictureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(16),
  },
  coverActionsRow: {
    flexDirection: 'row',
    gap: s(12),
  },
  languagePillsRow: {
    flexDirection: 'row',
    gap: s(10),
    flexWrap: 'wrap',
  },
  actionBtnStretch: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  avatarPickerThumb: {
    width: s(64),
    height: s(64),
    borderRadius: s(32),
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  avatarPickerImg: {
    width: '100%',
    height: '100%',
  },
  avatarEditOverlay: {
    position: 'absolute',
    bottom: s(0),
    left: s(0),
    right: s(0),
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingVertical: s(2),
  },
  colorPickerRow: {
    flexDirection: 'row',
    gap: s(14),
  },
  colorCircle: {
    width: s(38),
    height: s(38),
    borderRadius: s(19),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorCircleActive: {
    borderColor: '#FFF',
    transform: [{ scale: 1.15 }],
  },

  // System Screen (Image 3)
  twoColumnContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: s(50),
  },
  systemLeftColumn: {
    width: s(240),
  },
  systemLeftItem: {
    paddingVertical: s(14),
    paddingHorizontal: s(16),
    borderRadius: s(8),
    marginBottom: s(6),
    borderWidth: 1,
    borderColor: 'transparent',
  },
  systemLeftItemActive: {
    //backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  systemLeftItemFocused: {
    //borderColor: '#ffffff44',
  },
  rightItemFocused: {
    //borderColor: '#FFFFFF',
    //backgroundColor: 'rgba(255, 255, 255, 0)',
    //borderWidth: 2,
    //borderRadius: 8,
  },
  systemLeftItemText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: s(16),
    fontFamily: 'SSTLight',
  },
  systemLeftItemTextActive: {
    color: '#FFF',
    //fontWeight: '600',
    fontFamily: 'SSTMedium',
  },
  systemRightColumn: {
    flex: 1,
    paddingLeft: s(20),
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.06)',
  },
  systemBannerContainer: {
    width: '100%',
    height: s(160),
    borderRadius: s(12),
    overflow: 'hidden',
    marginBottom: s(24),
    position: 'relative',
  },
  systemBannerImage: {
    width: '100%',
    height: '100%',
  },
  systemBannerTitle: {
    position: 'absolute',
    left: s(20),
    bottom: s(16),
    color: '#FFFFFF',
    fontFamily: 'SSTBadge',
    fontSize: s(22),
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  rightSectionTitle: {
    color: '#FFF',
    fontSize: s(20),
    fontFamily: 'SSTBold',
    fontWeight: 'bold',
    marginBottom: s(20),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: s(14),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoRowLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
  },
  infoRowValue: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTMedium',
  },
  languageSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: s(16),
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0)',
  },
  languageSelectRowActive: {
    borderColor: '#00d5ff98',
    backgroundColor: 'rgba(0, 212, 255, 0.08)',
  },
  languageSelectText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
  },
  languageSelectTextActive: {
    color: '#FFF',
    fontFamily: 'SSTBold',
  },

  // PS Button Styles
  psButtonLarge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: s(5),
    paddingHorizontal: s(24),
    borderRadius: s(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  psButtonLargeFocused: {
    backgroundColor: 'rgba(255, 255, 255, 1)',
  },
  psButtonLargeText: {
    color: '#ffffffff',
    fontSize: s(16),
    fontFamily: 'SSTBold',
  },
  psButtonLargeTextFocused: {
    color: '#000000',
    fontFamily: 'SSTBold',
  },
  raInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTLight',
    marginTop: 6,
  },
});