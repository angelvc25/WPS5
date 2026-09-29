import { useTranslation } from '@/contexts/LanguageContext';
import { LANGUAGE_OPTIONS, Language } from '@/i18n/translations';
import { soundService } from '@/services/soundService';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { getOnlineSession, updateOnlineProfile } from '../services/onlineAccountService';
import type { OnlineUser } from '../services/onlineAccountService';
import {
  computeLocalTrophySummaries,
  fetchUserTrophies,
  type TrophyGameSummary,
} from '../services/onlineTrophiesService';
import { fetchOnlineFriends } from '../services/onlineFriendsService';
import { formatPlaytime } from '../services/playtimeService';
import { fetchSteamGridAssets } from '../services/steamGridService';
import type { SteamGridAsset } from '../services/steamGridService';
import { toastService } from '../services/toastService';
import { OnlineFriendsPanel, type FriendsGridInfo } from './OnlineFriendsPanel';
import { OnlineUserFullProfile } from './OnlineUserFullProfile';
import SpinningBorderSearch from './SpinningBorderSearch';
import type { UserProfile } from './UserSelectScreen';

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

// ── Perfil: pestañas, secciones navegables y helpers ─────────────────────
const PROFILE_TABS = ['overview', 'games', 'friends'] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

// Cada pestaña se compone de "secciones" navegables con el mando/teclado.
// Las verticales (gamesList, about) se recorren con ↑/↓ item por item; la
// horizontal ('cards': las 4 tarjetas del Overview) se recorre con ←/→ y ↑/↓
// cambia de sección. Dentro de la tarjeta de "recientes" ↑/↓ recorre sus juegos.
type ProfileSectionId = 'cards' | 'gamesList' | 'about' | 'friends';
type ProfileSection = { id: ProfileSectionId; count: number; horizontal?: boolean };

// Gris base del perfil: el banner se funde hacia este color.
const PROFILE_BG = '#141414';

// Tarjetas del Overview (columna dentro de la sección 'cards').
const PROFILE_CARD_TROPHIES = 0;
const PROFILE_CARD_RECENT = 1;
const PROFILE_CARD_LIBRARY = 2;
const PROFILE_CARD_FRIENDS = 3;
const PROFILE_CARD_COUNT = 4;
const PROFILE_LIBRARY_PREVIEW = 3; // juegos visibles en la tarjeta de biblioteca
const COVER_PAGE_SIZE = 6; // portadas por página en el buscador online (2 columnas × 3 filas)
const PROFILE_FRIENDS_PREVIEW = 4; // avatares visibles en la tarjeta de amigos

// Agregado de trofeos reales (online sincronizados o Steam local).
// El "nivel" de la cabecera es el nº de trofeos conseguidos, igual que en la
// tarjeta de trofeos del perfil online (OnlineUserFullProfile).
const EMPTY_TROPHY_TOTALS = {
  total: 0,
  unlocked: 0,
  platinum: 0,
  gold: 0,
  silver: 0,
  bronze: 0,
};
const PROFILE_TIER_ICONS = {
  platinum: require('@/assets/images/platino.png'),
  gold: require('@/assets/images/oro.png'),
  silver: require('@/assets/images/plata.png'),
  bronze: require('@/assets/images/bronce.png'),
} as const;

// Estilos propios del rediseño. Se mezclan por encima de los `styles` que llegan
// por props, así el componente no depende de que el padre los defina.
const createProfileStyles = (s: (px: number) => number) =>
  StyleSheet.create({
    // El perfil sale del padding del contenedor (settingsBody: 56 / 72 / 60)
    // con márgenes negativos: banner a sangre y gris base en toda la pantalla.
    // Si cambias ese padding en el padre, ajusta estos tres valores.
    profilePageWrap: {
      flex: 1,
      marginTop: -s(56),
      marginHorizontal: -s(72),
      marginBottom: -s(60),
      backgroundColor: PROFILE_BG,
    },
    profileBannerContainer: {
      width: '100%',
      height: s(340),
      overflow: 'hidden',
      position: 'relative',
    },
    // Degradado que funde el banner con el gris base.
    profileBannerFade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: s(230),
    },
    profileBackButton: {
      position: 'absolute',
      top: s(28),
      left: s(40),
      width: s(38),
      height: s(38),
      borderRadius: s(19),
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Avatar + nombre superpuestos sobre el banner (abajo a la izquierda).
    profileHeaderContent: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: s(14),
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: s(72),
    },
    // Pestañas a la izquierda y botones de acción a la derecha, en una fila.
    profileTabsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: s(72),
      marginBottom: s(24),
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    },
    profileTabsBar: {
      flexDirection: 'row',
    },
    profilePageBody: {
      paddingHorizontal: s(72),
    },
    profileTextShadow: {
      textShadowColor: 'rgba(0, 0, 0, 0.7)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 5,
    },

    // ── Tarjetas del Overview (estilo PS5) ──
    profileCardsRow: {
      flexDirection: 'row',
      gap: s(12),
    },
    profileCard: {
      flex: 1,
      minHeight: s(300),
      padding: s(18),
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      justifyContent: 'space-between',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    profileCardFocused: {
      borderColor: 'rgba(255, 255, 255, 0.92)',
    },
    profileCardBody: {
      flex: 1,
      justifyContent: 'center',
      gap: s(14),
    },
    profileCardLabel: {
      color: 'rgba(255, 255, 255, 0.6)',
      fontSize: s(16),
      fontFamily: 'SSTLight',
    },
    profileCardValue: {
      color: '#FFF',
      fontSize: s(24),
      fontFamily: 'SSTMedium',
      marginTop: s(2),
    },
    profileCardHint: {
      color: 'rgba(255, 255, 255, 0.4)',
      fontSize: s(14),
      fontFamily: 'SSTLight',
      textAlign: 'center',
    },
    // Trofeos (mockup)
    trophyHeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(12),
    },
    trophyHeadIcon: {
      width: s(34),
      height: s(34),
    },
    trophyLevel: {
      color: '#FFF',
      fontSize: s(26),
      fontFamily: 'SSTLight',
    },
    trophyProgressCol: {
      width: s(90),
      gap: s(4),
    },
    trophyProgressPct: {
      color: 'rgba(255, 255, 255, 0.75)',
      fontSize: s(13),
      fontFamily: 'SSTLight',
    },
    trophyProgressTrack: {
      height: s(3),
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      overflow: 'hidden',
    },
    trophyProgressFill: {
      height: s(3),
      backgroundColor: '#FFF',
    },
    trophyTiersRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    trophyTier: {
      alignItems: 'center',
      gap: s(4),
    },
    trophyTierIcon: {
      width: s(24),
      height: s(24),
    },
    trophyTierCount: {
      color: '#FFF',
      fontSize: s(14),
      fontFamily: 'SSTLight',
    },
    // Recientes
    cardRecentList: {
      flex: 1,
      gap: s(8),
    },
    cardRecentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(12),
      padding: s(4),
      borderRadius: s(6),
    },
    cardRecentRowFocused: {
      backgroundColor: 'rgba(255, 255, 255, 0.14)',
    },
    cardRecentThumb: {
      width: s(60),
      height: s(60),
    },
    cardRecentTitle: {
      color: '#FFF',
      fontSize: s(15),
      fontFamily: 'SSTMedium',
    },
    cardRecentSub: {
      color: 'rgba(255, 255, 255, 0.55)',
      fontSize: s(13),
      fontFamily: 'SSTLight',
      marginTop: s(2),
    },
    // Biblioteca (3 juegos)
    cardCoverRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(10),
    },
    cardCover: {
      width: s(96),
      height: s(96),
    },
    // Amigos
    cardAvatarRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardAvatar: {
      width: s(64),
      height: s(64),
      borderRadius: s(32),
      backgroundColor: '#2a2a2e',
      borderWidth: 2,
      borderColor: '#1a1a1a',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    cardAvatarImg: {
      width: '100%',
      height: '100%',
    },
    cardAvatarInitial: {
      color: '#FFF',
      fontSize: s(24),
      fontFamily: 'SSTBold',
    },
  });

const PROFILE_RECENT_LIMIT = 3;

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

export function resolveImageSource(img: any) {
  if (!img) return undefined;
  if (typeof img === 'string') return { uri: img };
  if (typeof img === 'object' && img.uri) return img;
  return img;
}

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

export interface UserProfileViewProps {
  visible: boolean;
  activeUser: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  allUsers?: UserProfile[];
  onSwitchUser?: (user: UserProfile) => void;
  libraryGames?: any[];
  language: Language;
  changeLanguage: (lang: Language) => void;
  onClose: () => void;
  onOpenAvatarModal?: () => void;
  onToggleSteamAvatar?: () => void;
  onGamePress?: (game: any) => void;
  onRequestBack: () => void;
  onOpenOnlineAuth: () => void;
  s: (px: number) => number;
  styles: any;
}

export default function UserProfileView({
  visible,
  activeUser,
  updateUser,
  allUsers = [],
  onSwitchUser,
  libraryGames = [],
  language,
  changeLanguage,
  onClose,
  onOpenAvatarModal,
  onToggleSteamAvatar,
  onGamePress,
  onRequestBack,
  onOpenOnlineAuth,
  s,
  styles: parentStyles,
}: UserProfileViewProps) {
  const { t } = useTranslation();
  // Estilos del padre + los del rediseño (los locales pisan a los del padre).
  const styles = useMemo<any>(
    () => ({ ...parentStyles, ...createProfileStyles(s) }),
    [parentStyles, s],
  );

  // Traduce con respaldo: si la clave aún no existe en translations.ts, t()
  // devuelve la clave tal cual y se muestra el texto de respaldo en su lugar.
  const tr = (key: string, fallback: string): string => {
    const value = (t as any)(key);
    return !value || value === key ? fallback : value;
  };

  // Pantalla interna del perfil: vista, lista de campos o detalle de campo.
  const [profileScreen, setProfileScreen] = useState<'view' | 'edit' | 'detail'>('view');
  const [editListIndex, setEditListIndex] = useState(0);

  const [profileActiveTab, setProfileActiveTab] = useState<ProfileTab>('overview');
  const [profileFocusArea, setProfileFocusArea] = useState<'header_actions' | 'tabs' | 'content'>('header_actions');
  const [profileActionIndex, setProfileActionIndex] = useState(0);
  const [onlineProfileUsername, setOnlineProfileUsername] = useState<string | null>(null);
  const [friendsVersion, setFriendsVersion] = useState(0);
  // Forma del grid de amigos (la reporta el panel) para navegarlo con mando.
  const [friendsGrid, setFriendsGrid] = useState<FriendsGridInfo>({ count: 0, columns: 1, usernames: [] });

  const [profileEditSection, setProfileEditSection] = useState<ProfileEditSection>('name');
  // Foco dentro del contenido del perfil: sección (índice en profileSections)
  // e item dentro de esa sección (fila en listas verticales, columna en la
  // biblioteca horizontal).
  const [profileSectionIndex, setProfileSectionIndex] = useState(0);
  const [profileItemIndex, setProfileItemIndex] = useState(0);
  // Juego enfocado dentro de la tarjeta "recientes" (lista vertical de 3).
  const [profileRecentIndex, setProfileRecentIndex] = useState(0);
  // Amigos online para la tarjeta 4 del Overview.
  const [profileFriends, setProfileFriends] = useState<OnlineUser[]>([]);
  // Trofeos reales para la tarjeta 1 del Overview (agregado por tiers).
  const [trophyTotals, setTrophyTotals] = useState({ ...EMPTY_TROPHY_TOTALS });
  const [trophiesLoading, setTrophiesLoading] = useState(false);
  // true cuando la página del perfil ya se desplazó lo suficiente como para
  // mostrar la barra superior fija ("← Perfil").
  const [profileScrolled, setProfileScrolled] = useState(false);

  // Profile edit fields
  const [editName, setEditName] = useState(activeUser?.name || '');
  const [namePushBusy, setNamePushBusy] = useState(false);
  const [namePushError, setNamePushError] = useState<string | null>(null);
  const [editOnlineId, setEditOnlineId] = useState(activeUser?.onlineId || '');
  const [editAbout, setEditAbout] = useState(activeUser?.about || '');
  const [bioPushBusy, setBioPushBusy] = useState(false);
  const [bioPushError, setBioPushError] = useState<string | null>(null);
  const [editCoverImage, setEditCoverImage] = useState(activeUser?.coverImage || '');

  // Buscador de portada online (SteamGridDB, solo heroes panorámicos).
  const [coverSearchVisible, setCoverSearchVisible] = useState(false);
  const [coverSearchQuery, setCoverSearchQuery] = useState('');
  const [coverSearchBusy, setCoverSearchBusy] = useState(false);
  const [coverSearchDone, setCoverSearchDone] = useState(false);
  const [coverHeroes, setCoverHeroes] = useState<SteamGridAsset[]>([]);
  const [coverSavingUrl, setCoverSavingUrl] = useState<string | null>(null);
  const [coverSelIndex, setCoverSelIndex] = useState(0);
  const [coverPage, setCoverPage] = useState(0);
  const coverSearchInputRef = useRef<TextInput>(null);
  const coverResultsScrollRef = useRef<ScrollView>(null);

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

  // Secciones navegables de la pestaña activa. Solo entran las que tienen
  // contenido, así el foco nunca cae en una sección vacía o inexistente.
  // La pestaña de amigos es un grid: ←/→ recorre, ↑/↓ salta de fila (ver handler de teclas).
  const profileSections = useMemo<ProfileSection[]>(() => {
    if (profileActiveTab === 'friends') {
      return friendsGrid.count > 0 ? [{ id: 'friends', count: friendsGrid.count }] : [];
    }
    if (profileActiveTab === 'games') {
      return profileLibraryGames.length > 0 ? [{ id: 'gamesList', count: profileLibraryGames.length }] : [];
    }
    // Las 4 tarjetas siempre existen (aunque estén vacías), así el foco
    // nunca se queda sin destino en el Overview.
    // "Acerca de" va arriba de las tarjetas, así que es la primera sección.
    const list: ProfileSection[] = [];
    if (activeUser?.about) list.push({ id: 'about', count: 1 });
    list.push({ id: 'cards', count: PROFILE_CARD_COUNT, horizontal: true });
    return list;
  }, [profileActiveTab, profileLibraryGames, activeUser?.about, friendsGrid.count]);

  // Refs de cada item enfocable ("seccion:indice") y del ScrollView de la
  // página, para seguir el foco lógico con scroll automático.
  const profileItemRefs = useRef<Record<string, any>>({});
  const profileScrollRef = useRef<ScrollView>(null);
  const profileWrapperRef = useRef<View>(null); // visor de la página (para medir)
  const profileScrollY = useRef(0);

  // Abre una pestaña del perfil dejando el foco en la barra de pestañas
  // (lo usan las tarjetas 3 y 4 del Overview, con teclado/mando y con click).
  const openProfileTab = (tab: ProfileTab) => {
    setProfileActiveTab(tab);
    setProfileSectionIndex(0);
    setProfileItemIndex(0);
    setProfileRecentIndex(0);
    setProfileFocusArea('tabs');
    soundService.playActivation?.();
  };

  // Amigos online (vista previa de la tarjeta 4). Se recarga cuando cambia la
  // lista de amigos.
  useEffect(() => {
    if (!visible || !getOnlineSession()) {
      setProfileFriends([]);
      return;
    }
    let cancelled = false;
    fetchOnlineFriends()
      .then((list) => {
        if (!cancelled) setProfileFriends(list.map((f) => f.user));
      })
      .catch(() => {
        if (!cancelled) setProfileFriends([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, friendsVersion]);

  // Trofeos reales (tarjeta 1): primero los sincronizados en la cuenta online
  // vinculada; si no hay vínculo, se calculan de los juegos Steam locales.
  // Sin fuente disponible se muestran ceros reales (nunca datos fijos).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setTrophiesLoading(true);
    (async () => {
      try {
        const onlineUserId = (activeUser?.settings as any)?.onlineUserId as string | undefined;
        let summaries: TrophyGameSummary[] = [];
        if (onlineUserId && getOnlineSession()) {
          const res = await fetchUserTrophies(onlineUserId).catch(() => null);
          if (res?.visible) summaries = res.trophies;
        } else {
          const steamId = activeUser?.settings?.steamId;
          if (steamId) {
            const apiKey =
              activeUser?.settings?.steamApiKey ||
              process.env.EXPO_PUBLIC_STEAM_API_KEY ||
              'B1F361EA3C07B455DC8B0D06ED179B00';
            summaries = await computeLocalTrophySummaries(profileLibraryGames, {
              apiKey,
              steamId,
            }).catch(() => []);
          }
        }
        if (cancelled) return;
        const acc = { ...EMPTY_TROPHY_TOTALS };
        for (const g of summaries) {
          acc.total += g.total;
          acc.unlocked += g.unlocked;
          acc.platinum += g.platinum;
          acc.gold += g.gold;
          acc.silver += g.silver;
          acc.bronze += g.bronze;
        }
        setTrophyTotals(acc);
      } finally {
        if (!cancelled) setTrophiesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, activeUser?.id]);

  const nameInputRef = useRef<TextInput>(null);
  const onlineIdInputRef = useRef<TextInput>(null);
  const aboutInputRef = useRef<TextInput>(null);

  // Avatar del usuario activo (Steam si está activado, si no el local).
  const userAvatarUri =
    activeUser?.settings?.useSteamAvatar && activeUser?.steamAvatarUrl
      ? activeUser.steamAvatarUrl
      : (activeUser as any)?.avatarBase64 || activeUser?.avatar || null;

  useEffect(() => {
    if (activeUser) {
      setEditName(activeUser.name || '');
      setEditOnlineId(activeUser.onlineId || '');
      setEditAbout(activeUser.about || '');
      setEditCoverImage(activeUser.coverImage || '');
    }
  }, [activeUser]);

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
    if (profileFocusArea !== 'content') {
      profileScrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!focusedProfileSectionId) return;
    if (focusedProfileSectionId === 'cards' && !activeUser?.about) {
      // Sin "Acerca de" la fila de tarjetas cabe en pantalla: se queda mostrando el banner.
      // Con "Acerca de" arriba las tarjetas bajan, así que se centra la tarjeta enfocada.
      profileScrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    let cancelled = false;
    (async () => {
      const item = await measureNode(profileItemRefs.current[`${focusedProfileSectionId}:${profileItemIndex}`]);
      const viewport = await measureNode(profileWrapperRef.current);
      if (cancelled || !item || !viewport) return;

      // Vertical: centra el item en el visor de la página.
      const y = profileScrollY.current + (item.y - viewport.y) - (viewport.h - item.h) / 2;
      profileScrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [profileActiveTab, profileFocusArea, focusedProfileSectionId, profileItemIndex, activeUser?.about]);

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

  // ¿Perfil vinculado a la cuenta online? (el nombre se guarda en el servidor)
  const isProfileOnlineLinked = (() => {
    const sess = getOnlineSession();
    return !!sess && (activeUser?.settings as any)?.onlineUserId === sess.user.id;
  })();

  // ── Nombre online: subir displayName al servidor ──────────────────────
  const handlePushDisplayName = async () => {
    if (namePushBusy || !isProfileOnlineLinked) return;
    const v = editName.trim();
    if (!v) {
      setNamePushError(t('account.errorMissing'));
      soundService.playBack?.();
      return;
    }
    setNamePushBusy(true);
    setNamePushError(null);
    try {
      const user = await updateOnlineProfile({ displayName: v });
      setEditName(user.displayName);
      updateUser({ name: user.displayName });
      soundService.playActivation?.();
      toastService.show(t('profile.onlineNameUpdated'));
    } catch (e: any) {
      const msg = e?.message || 'network';
      setNamePushError(
        msg === 'displayName must contain between 1 and 50 characters'
          ? t('profile.onlineNameLength')
          : msg === 'network'
            ? t('account.errorNetwork')
            : (msg || t('account.errorGeneric'))
      );
      soundService.playBack?.();
    } finally {
      setNamePushBusy(false);
    }
  };

  // ── Bio online: subir bio al servidor ─────────────────────────────────
  const handlePushBio = async () => {
    if (bioPushBusy || !isProfileOnlineLinked) return;
    const v = editAbout.trim();
    if (v.length > 500) {
      setBioPushError(t('profile.onlineBioLength'));
      soundService.playBack?.();
      return;
    }
    setBioPushBusy(true);
    setBioPushError(null);
    try {
      const user = await updateOnlineProfile({ bio: v });
      setEditAbout(user.bio || '');
      updateUser({ about: user.bio || '' });
      soundService.playActivation?.();
      toastService.show(t('profile.onlineBioUpdated'));
    } catch (e: any) {
      const msg = e?.message || 'network';
      setBioPushError(
        msg === 'bio must contain up to 500 characters'
          ? t('profile.onlineBioLength')
          : msg === 'network'
            ? t('account.errorNetwork')
            : (msg || t('account.errorGeneric'))
      );
      soundService.playBack?.();
    } finally {
      setBioPushBusy(false);
    }
  };

  // ── Portada online: buscar heroes en SteamGridDB ──────────────────────
  // Paginado en cliente: la búsqueda trae todos los resultados y aquí se
  // muestran de COVER_PAGE_SIZE en COVER_PAGE_SIZE.
  const coverTotalPages = Math.max(1, Math.ceil(coverHeroes.length / COVER_PAGE_SIZE));
  const coverPageSafe = Math.min(coverPage, coverTotalPages - 1);
  const coverPageHeroes = coverHeroes.slice(
    coverPageSafe * COVER_PAGE_SIZE,
    coverPageSafe * COVER_PAGE_SIZE + COVER_PAGE_SIZE,
  );
  const coverHasPager = coverTotalPages > 1;
  // Índices de foco: 0=input, 1=buscar, 2..n+1=portadas, [anterior, siguiente], cerrar.
  const coverPrevIdx = 2 + coverPageHeroes.length;
  const coverNextIdx = coverPrevIdx + 1;
  const coverCloseIdx = coverHasPager ? coverNextIdx + 1 : coverPrevIdx;

  // Cambia de página; 'first' deja el foco en la primera portada y
  // 'prev'/'next' lo mantienen en el botón (su índice depende del nº de
  // portadas de la página nueva).
  const goToCoverPage = (page: number, focus: 'first' | 'prev' | 'next') => {
    if (page < 0 || page > coverTotalPages - 1 || page === coverPageSafe) return;
    const count = Math.min(COVER_PAGE_SIZE, coverHeroes.length - page * COVER_PAGE_SIZE);
    setCoverPage(page);
    setCoverSelIndex(focus === 'first' ? 2 : focus === 'prev' ? 2 + count : 3 + count);
    coverResultsScrollRef.current?.scrollTo({ y: 0, animated: false });
    soundService.playNavigation?.();
  };

  const openCoverSearch = () => {
    soundService.playActivation?.();
    setCoverSearchQuery('');
    setCoverHeroes([]);
    setCoverPage(0);
    setCoverSearchDone(false);
    setCoverSelIndex(0);
    setCoverSearchVisible(true);
  };

  const runCoverSearch = async () => {
    const q = coverSearchQuery.trim();
    if (!q || coverSearchBusy) return;
    soundService.playActivation?.();
    setCoverSearchBusy(true);
    setCoverSearchDone(false);
    try {
      const res = await fetchSteamGridAssets(q);
      const heroes = (res.heroes || []).filter(
        (h) => h.url && /^https?:\/\//i.test(h.url)
      );
      setCoverHeroes(heroes);
      setCoverPage(0);
      setCoverSelIndex(heroes.length > 0 ? 2 : 1);
    } catch {
      setCoverHeroes([]);
      setCoverPage(0);
    } finally {
      setCoverSearchBusy(false);
      setCoverSearchDone(true);
    }
  };

  const handlePickCoverHero = async (url: string) => {
    if (!url || coverSavingUrl) return;
    setCoverSavingUrl(url);
    try {
      setEditCoverImage(url);
      updateUser({ coverImage: url });
      if (getOnlineSession()) {
        try {
          await updateOnlineProfile({ coverUrl: url });
          toastService.show(t('profile.coverSynced'));
        } catch {
          toastService.show(t('profile.coverSyncFailed'));
        }
      } else {
        toastService.show(t('profile.coverSavedLocal'));
      }
      soundService.playActivation?.();
      setCoverSearchVisible(false);
    } finally {
      setCoverSavingUrl(null);
    }
  };

  // Navegación por teclado/mando dentro del modal de portada (fase de
  // captura para no mover el foco de la pantalla de detrás).
  useEffect(() => {
    if (!coverSearchVisible || Platform.OS !== 'web') return;
    const timer = setTimeout(() => coverSearchInputRef.current?.focus(), 80);
    const onKey = (e: any) => {
      const target = e.target as any;
      const inInput = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setCoverSearchVisible(false);
        return;
      }
      if (inInput) {
        if (e.key === 'Enter') {
          e.stopPropagation();
          e.preventDefault();
          runCoverSearch();
        } else if (e.key === 'ArrowDown') {
          e.stopPropagation();
          e.preventDefault();
          setCoverSelIndex(1);
        } else if (e.key === 'b' || e.key === 'B') {
          e.stopPropagation();
          e.preventDefault();
          setCoverSearchVisible(false);
        }
        return;
      }
      // Q/E (L1/R1) y RePág/AvPág cambian de página estés donde estés.
      const pageDir =
        e.key === 'e' || e.key === 'E' || e.key === 'PageDown' ? 1
          : e.key === 'q' || e.key === 'Q' || e.key === 'PageUp' ? -1
            : 0;
      if (pageDir !== 0) {
        e.stopPropagation();
        e.preventDefault();
        goToCoverPage(coverPageSafe + pageDir, 'first');
        return;
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', ' '].includes(e.key)) return;
      e.stopPropagation();
      e.preventDefault();
      // 0=input, 1=buscar, 2..n+1=portadas de la página, [anterior, siguiente], cerrar.
      const total = coverCloseIdx + 1;
      const last = total - 1;
      const cols = 2;
      let i = coverSelIndex;
      if (e.key === 'ArrowRight') i = Math.min(last, i + 1);
      else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (e.key === 'ArrowDown') i = Math.min(last, i + (i === 0 ? 1 : cols));
      else if (e.key === 'ArrowUp') i = Math.max(0, i - (i <= 1 ? 1 : cols));
      else if (e.key === 'Tab') i = (i + (e.shiftKey ? last : 1)) % total;
      else if (e.key === 'Enter' || e.key === ' ') {
        if (i === 0) coverSearchInputRef.current?.focus();
        else if (i === 1) runCoverSearch();
        else if (i === last) setCoverSearchVisible(false);
        else if (coverHasPager && i === coverPrevIdx) goToCoverPage(coverPageSafe - 1, 'prev');
        else if (coverHasPager && i === coverNextIdx) goToCoverPage(coverPageSafe + 1, 'next');
        else {
          const hero = coverPageHeroes[i - 2];
          if (hero) handlePickCoverHero(hero.url);
        }
        return;
      }
      setCoverSelIndex(i);
      if (i === 0) coverSearchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      clearTimeout(timer);
    };
  }, [coverSearchVisible, coverHeroes, coverPage, coverSelIndex, coverSearchQuery, coverSearchBusy]);

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

  const profileEditLabels: Record<ProfileEditSection, string> = {
    name: t('profile.name'),
    onlineId: t('profile.onlineId'),
    picture: t('profile.profilePicture'),
    avatar: t('profile.avatar'),
    cover: t('profile.coverImage'),
    about: t('profile.about'),
    languages: t('profile.languages'),
  };

  const openProfileEditSection = (section: ProfileEditSection) => {
    setProfileEditSection(section);
    setProfileScreen('detail');
  };

  // Navegación por teclado/mando del perfil (fase de captura: SettingsView no
  // ve estas teclas y la pantalla de detrás no se mueve).
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // El modal de portada tiene su propio handler (registrado antes).
      if (coverSearchVisible) return;
      // El perfil online de un amigo se muestra encima: que el mando no mueva lo de atrás.
      if (onlineProfileUsername) return;
      // Don't intercept if user is typing in an input
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        if (isInput) return;
        e.preventDefault();
        e.stopPropagation();
        soundService.playBack?.();
        if (profileScreen === 'detail') setProfileScreen('edit');
        else if (profileScreen === 'edit') setProfileScreen('view');
        else onRequestBack();
        return;
      }

      if (isInput) return;

      if (profileScreen === 'edit') {
        const lastIndex = PROFILE_EDIT_SECTIONS.length - 1;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setEditListIndex((prev) => Math.min(prev + 1, lastIndex));
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setEditListIndex((prev) => Math.max(prev - 1, 0));
          soundService.playNavigation();
        } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          const section = PROFILE_EDIT_SECTIONS[editListIndex];
          if (section) {
            soundService.playActivation?.();
            openProfileEditSection(section);
          }
        }
        return;
      }

      if (profileScreen === 'detail') {
        // Los inputs se manejan solos; no hay navegación por teclado aquí.
        return;
      }

      // Vista del perfil (overview / games / friends).
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      // Cambia de pestaña y reinicia el foco del contenido.
      const switchProfileTab = (dir: 1 | -1) => {
        const idx = PROFILE_TABS.indexOf(profileActiveTab);
        const next = PROFILE_TABS[(idx + dir + PROFILE_TABS.length) % PROFILE_TABS.length];
        setProfileActiveTab(next);
        setProfileSectionIndex(0);
        setProfileItemIndex(0);
        setProfileRecentIndex(0);
        soundService.playTab();
      };

      // L1/R1 (mapeados a Q/E) cambian de pestaña estés donde estés.
      if (e.key === 'q' || e.key === 'e') {
        stop();
        switchProfileTab(e.key === 'e' ? 1 : -1);
        return;
      }

      if (profileFocusArea === 'content') {
        const section = profileSections[profileSectionIndex];
        if (!section) {
          // Nada enfocable en esta pestaña: solo se puede volver arriba.
          if (e.key === 'ArrowUp') {
            stop();
            setProfileFocusArea('tabs');
            soundService.playNavigation();
          }
          return;
        }

        // Grid de amigos: ←/→ de tarjeta en tarjeta, ↑/↓ saltan una fila.
        if (section.id === 'friends') {
          const cols = Math.max(1, friendsGrid.columns);
          const last = section.count - 1;
          if (e.key === 'ArrowRight') {
            stop();
            if (profileItemIndex < last) {
              setProfileItemIndex(profileItemIndex + 1);
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowLeft') {
            stop();
            if (profileItemIndex > 0) {
              setProfileItemIndex(profileItemIndex - 1);
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowDown') {
            stop();
            const lastRow = Math.floor(last / cols);
            const row = Math.floor(profileItemIndex / cols);
            if (row < lastRow) {
              // Si la última fila es más corta, cae en su última tarjeta.
              setProfileItemIndex(Math.min(profileItemIndex + cols, last));
              soundService.playNavigation();
            }
          } else if (e.key === 'ArrowUp') {
            stop();
            if (profileItemIndex - cols >= 0) {
              setProfileItemIndex(profileItemIndex - cols);
            } else {
              setProfileFocusArea('tabs');
            }
            soundService.playNavigation();
          } else if (e.key === 'Enter') {
            stop();
            const username = friendsGrid.usernames[profileItemIndex];
            if (username) {
              soundService.playActivation?.();
              setOnlineProfileUsername(username);
            }
          }
          return;
        }

        // Al entrar a una sección desde arriba se empieza por su primer item;
        // desde abajo, por el último (el más cercano a donde veníamos) salvo
        // que sea horizontal, que siempre arranca en el primero.
        const itemOnEnter = (target: ProfileSection, from: 'above' | 'below') =>
          target.horizontal || from === 'above' ? 0 : target.count - 1;

        if (e.key === 'ArrowDown') {
          stop();
          if (
            section.id === 'cards' &&
            profileItemIndex === PROFILE_CARD_RECENT &&
            profileRecentIndex < profileRecentGames.length - 1
          ) {
            setProfileRecentIndex(profileRecentIndex + 1);
            soundService.playNavigation();
          } else if (!section.horizontal && profileItemIndex < section.count - 1) {
            setProfileItemIndex(profileItemIndex + 1);
            soundService.playNavigation();
          } else if (profileSectionIndex < profileSections.length - 1) {
            setProfileSectionIndex(profileSectionIndex + 1);
            setProfileItemIndex(itemOnEnter(profileSections[profileSectionIndex + 1], 'above'));
            soundService.playNavigation();
          }
        } else if (e.key === 'ArrowUp') {
          stop();
          if (
            section.id === 'cards' &&
            profileItemIndex === PROFILE_CARD_RECENT &&
            profileRecentIndex > 0
          ) {
            setProfileRecentIndex(profileRecentIndex - 1);
            soundService.playNavigation();
          } else if (!section.horizontal && profileItemIndex > 0) {
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
          stop();
          if (section.horizontal && profileItemIndex < section.count - 1) {
            setProfileItemIndex(profileItemIndex + 1);
            setProfileRecentIndex(0);
            soundService.playNavigation();
          }
        } else if (e.key === 'ArrowLeft') {
          stop();
          if (section.horizontal && profileItemIndex > 0) {
            setProfileItemIndex(profileItemIndex - 1);
            setProfileRecentIndex(0);
            soundService.playNavigation();
          }
        } else if (e.key === 'Enter') {
          stop();
          if (section.id === 'cards') {
            if (profileItemIndex === PROFILE_CARD_RECENT) {
              // Lanza el juego enfocado dentro de la tarjeta de recientes.
              const recent =
                profileRecentGames[Math.min(profileRecentIndex, profileRecentGames.length - 1)];
              if (recent && onGamePress) {
                soundService.playActivation?.();
                onGamePress(recent);
              }
            } else if (profileItemIndex === PROFILE_CARD_LIBRARY) {
              openProfileTab('games'); // biblioteca completa como lista vertical
            } else if (profileItemIndex === PROFILE_CARD_FRIENDS) {
              openProfileTab('friends');
            }
            // Trofeos: solo enfocable (tarjeta informativa).
          } else {
            const game = section.id === 'gamesList' ? profileLibraryGames[profileItemIndex] : null;
            if (game && onGamePress) {
              soundService.playActivation?.();
              onGamePress(game);
            }
          }
        }
      } else if (e.key === 'ArrowDown') {
        stop();
        // Pestañas y botones de acción comparten fila: ↓ baja al contenido.
        if (
          (profileFocusArea === 'header_actions' || profileFocusArea === 'tabs') &&
          profileSections.length > 0
        ) {
          setProfileFocusArea('content');
          setProfileSectionIndex(0);
          setProfileItemIndex(0);
          soundService.playNavigation();
        }
      } else if (e.key === 'ArrowUp') {
        stop();
        // Nada por encima de la fila de pestañas/acciones.
      } else if (e.key === 'ArrowRight') {
        stop();
        if (profileFocusArea === 'tabs') {
          if (PROFILE_TABS.indexOf(profileActiveTab) < PROFILE_TABS.length - 1) {
            switchProfileTab(1);
          } else {
            // Desde la última pestaña se pasa a los botones de la derecha.
            setProfileFocusArea('header_actions');
            setProfileActionIndex(0);
            soundService.playNavigation();
          }
        } else if (profileFocusArea === 'header_actions') {
          const maxAction = allUsers.length > 1 ? 2 : 1;
          setProfileActionIndex((prev) => Math.min(prev + 1, maxAction));
          soundService.playNavigation();
        }
      } else if (e.key === 'ArrowLeft') {
        stop();
        if (profileFocusArea === 'tabs') {
          if (PROFILE_TABS.indexOf(profileActiveTab) > 0) switchProfileTab(-1);
        } else if (profileFocusArea === 'header_actions') {
          if (profileActionIndex === 0) {
            setProfileFocusArea('tabs');
          } else {
            setProfileActionIndex((prev) => Math.max(prev - 1, 0));
          }
          soundService.playNavigation();
        }
      } else if (e.key === 'Enter') {
        stop();
        if (profileFocusArea === 'header_actions') {
          const actions: ('edit' | 'switch' | 'account')[] = [
            'edit',
            ...(allUsers.length > 1 ? ['switch' as const] : []),
            'account',
          ];
          const action = actions[profileActionIndex];
          if (action === 'edit') {
            soundService.playActivation?.();
            setProfileScreen('edit');
          } else if (action === 'switch') {
            const nextUser = allUsers.find((u) => u.id !== activeUser?.id);
            if (nextUser && onSwitchUser) onSwitchUser(nextUser);
          } else if (action === 'account') {
            onOpenOnlineAuth();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    visible,
    profileScreen,
    profileActiveTab,
    profileFocusArea,
    profileActionIndex,
    profileSections,
    profileSectionIndex,
    profileItemIndex,
    profileRecentIndex,
    profileRecentGames,
    profileLibraryGames,
    friendsGrid,
    onlineProfileUsername,
    profileEditSection,
    editListIndex,
    coverSearchVisible,
    allUsers,
    activeUser,
    onSwitchUser,
    onGamePress,
    onRequestBack,
    onOpenOnlineAuth,
  ]);

  // ── Vista del perfil ───────────────────────────────────────────────────
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

  const cardFocused = (col: number) => isFocused('cards', col);
  const cardStyle = (col: number) => [styles.profileCard, cardFocused(col) && styles.profileCardFocused];
  const recentFocusIdx = Math.min(profileRecentIndex, Math.max(0, profileRecentGames.length - 1));
  const trophyPct = trophyTotals.total > 0
    ? Math.round((trophyTotals.unlocked * 100) / trophyTotals.total)
    : 0;

  return (
    <>
      {profileScreen === 'view' && (
        <View ref={profileWrapperRef} style={styles.profilePageWrap}>
          {/* Toda la página (banner + pestañas + contenido) hace scroll junta. */}
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
            {/* Banner a sangre que se funde con el gris base */}
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
                />
              )}
              <View style={styles.profileBannerOverlay} pointerEvents="none" />
              <LinearGradient
                colors={['rgba(20, 20, 20, 0)', PROFILE_BG]}
                style={styles.profileBannerFade}
                pointerEvents="none"
              />

              {/* Back button in top-left */}
              <TouchableOpacity style={styles.profileBackButton} onPress={onRequestBack}>
                <Ionicons name="arrow-back" size={s(22)} color="#FFF" />
              </TouchableOpacity>

              {/* Avatar + nombre sobre el banner */}
              <View style={styles.profileHeaderContent} pointerEvents="none">
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
                      <Text style={[styles.profileDisplayName, styles.profileTextShadow]}>
                        {activeUser?.name || 'Player'}
                      </Text>
                      <View style={styles.profilePlusBadge}>
                        <Ionicons name="add" size={s(14)} color="#000" />
                      </View>
                    </View>
                    <View style={styles.profileHandleRow}>
                      <Text style={[styles.profileHandleText, styles.profileTextShadow]}>
                        {(activeUser?.settings as any)?.onlineUsername
                          ? `@${(activeUser?.settings as any).onlineUsername}`
                          : (activeUser?.onlineId || activeUser?.name?.toLowerCase().replace(/\s+/g, '_') || 'player_1')}
                      </Text>
                      <Text style={styles.profileHandleSep}>|</Text>
                      <Ionicons name="game-controller" size={s(14)} color="rgba(255,255,255,0.6)" />
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Pestañas (izquierda) + botones de acción (derecha) en una fila */}
            <View style={styles.profileTabsRow}>
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
                        setProfileRecentIndex(0);
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

              <View style={[styles.profileHeaderActions, { marginBottom: 0 }]}>
                {(() => {
                  const linkedOnline = !!(activeUser?.settings as any)?.onlineUserId;
                  const actions: ('edit' | 'switch' | 'account')[] = [
                    'edit',
                    ...(allUsers.length > 1 ? ['switch' as const] : []),
                    'account',
                  ];
                  return actions.map((actionId, actionIdx) => {
                    const isActionFocused = profileFocusArea === 'header_actions' && profileActionIndex === actionIdx;
                    if (actionId === 'edit') {
                      return (
                        <TouchableOpacity
                          key="edit"
                          style={[styles.profileActionButtonRound, isActionFocused && styles.profileActionButtonFocused]}
                          onPress={() => setProfileScreen('edit')}
                        >
                          {isActionFocused && <SpinningBorderSearch size={s(180)} spread={4} borderRadius={18} />}
                          <Ionicons name="pencil" size={s(20)} color="#FFF" />
                          <Text style={styles.profileActionButtonLabel}>{t('profile.editProfile')}</Text>
                        </TouchableOpacity>
                      );
                    }
                    if (actionId === 'switch') {
                      return (
                        <TouchableOpacity
                          key="switch"
                          style={[styles.profileActionButtonRoundSmall, isActionFocused && styles.profileActionButtonFocused]}
                          onPress={() => {
                            const nextUser = allUsers.find((u) => u.id !== activeUser?.id);
                            if (nextUser && onSwitchUser) onSwitchUser(nextUser);
                          }}
                        >
                          {isActionFocused && <SpinningBorderSearch size={s(180)} spread={4} borderRadius={18} />}
                          <Ionicons name="people-outline" size={s(20)} color="#FFF" />
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        key="account"
                        style={[styles.profileActionButtonRoundSmall, isActionFocused && styles.profileActionButtonFocused]}
                        onPress={() => onOpenOnlineAuth()}
                      >
                        {isActionFocused && <SpinningBorderSearch size={s(180)} spread={4} borderRadius={18} />}
                        <Ionicons
                          name={linkedOnline ? 'cloud-done-outline' : 'log-in-outline'}
                          size={s(20)}
                          color="#FFF"
                        />
                      </TouchableOpacity>
                    );
                  });
                })()}
              </View>
            </View>

            <View style={styles.profilePageBody}>
              {/* ── Overview ── */}
              {profileActiveTab === 'overview' && (
                <View style={styles.overviewContainer}>
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

                  {/* 4 tarjetas: trofeos · recientes · biblioteca · amigos */}
                  <View style={styles.profileCardsRow}>
                    {/* 1) Trofeos (recuento real) */}
                    <View ref={setItemRef('cards', PROFILE_CARD_TROPHIES) as any} style={cardStyle(PROFILE_CARD_TROPHIES)}>
                      <View style={styles.profileCardBody}>
                        <View style={styles.trophyHeadRow}>
                          <Image source={PROFILE_TIER_ICONS.bronze} style={styles.trophyHeadIcon} contentFit="contain" />
                          <Text style={styles.trophyLevel}>{trophiesLoading ? '…' : trophyTotals.unlocked}</Text>
                          <View style={styles.trophyProgressCol}>
                            <Text style={styles.trophyProgressPct}>{trophiesLoading ? '…' : `${trophyPct} %`}</Text>
                            <View style={styles.trophyProgressTrack}>
                              <View style={[styles.trophyProgressFill, { width: `${trophiesLoading ? 0 : trophyPct}%` }]} />
                            </View>
                          </View>
                        </View>
                        <View style={styles.trophyTiersRow}>
                          {(['platinum', 'gold', 'silver', 'bronze'] as const).map((tier) => (
                            <View key={tier} style={styles.trophyTier}>
                              <Image source={PROFILE_TIER_ICONS[tier]} style={styles.trophyTierIcon} contentFit="contain" />
                              <Text style={styles.trophyTierCount}>{trophiesLoading ? '…' : trophyTotals[tier]}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                      <View>
                        <Text style={styles.profileCardLabel}>{tr('onlineProfile.trophiesWon', 'Trophies won')}:</Text>
                        <Text style={styles.profileCardValue}>{trophiesLoading ? '…' : trophyTotals.unlocked}</Text>
                      </View>
                    </View>

                    {/* 2) Jugados recientemente (antes "Last Played") */}
                    <View ref={setItemRef('cards', PROFILE_CARD_RECENT) as any} style={cardStyle(PROFILE_CARD_RECENT)}>
                      <View style={styles.cardRecentList}>
                        {profileRecentGames.length > 0 ? (
                          profileRecentGames.map((game: any, idx: number) => {
                            const minutes = gameMinutes(game);
                            const rowFocused = cardFocused(PROFILE_CARD_RECENT) && idx === recentFocusIdx;
                            return (
                              <TouchableOpacity
                                key={game.id || idx}
                                activeOpacity={0.85}
                                style={[styles.cardRecentRow, rowFocused && styles.cardRecentRowFocused]}
                                onPress={() => {
                                  focusItem('cards', PROFILE_CARD_RECENT);
                                  setProfileRecentIndex(idx);
                                  onGamePress?.(game);
                                }}
                              >
                                <BlurredArt source={game.image} style={styles.cardRecentThumb} radius={s(4)} placeholderSize={s(18)} />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.cardRecentTitle} numberOfLines={2}>{game.title}</Text>
                                  <Text style={styles.cardRecentSub} numberOfLines={1}>
                                    {[
                                      formatTimeAgo(game.lastPlayed),
                                      minutes > 0 ? formatPlaytime(minutes, t) : null,
                                    ].filter(Boolean).join(' · ')}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })
                        ) : (
                          <View style={styles.profileCardBody}>
                            <Text style={styles.profileCardHint}>{t('lastPlayed.noGamesYet')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.profileCardLabel}>{t('lastPlayed.title')}</Text>
                    </View>

                    {/* 3) Biblioteca: solo 3 juegos; al abrirla va a la pestaña Games */}
                    <TouchableOpacity
                      ref={setItemRef('cards', PROFILE_CARD_LIBRARY) as any}
                      activeOpacity={0.85}
                      style={cardStyle(PROFILE_CARD_LIBRARY)}
                      onPress={() => {
                        focusItem('cards', PROFILE_CARD_LIBRARY);
                        openProfileTab('games');
                      }}
                    >
                      <View style={styles.cardCoverRow}>
                        {profileLibraryGames.length > 0 ? (
                          profileLibraryGames.slice(0, PROFILE_LIBRARY_PREVIEW).map((game: any, idx: number) => (
                            <BlurredArt
                              key={game.id || idx}
                              source={game.image}
                              style={styles.cardCover}
                              radius={s(6)}
                              placeholderSize={s(22)}
                            />
                          ))
                        ) : (
                          <Text style={styles.profileCardHint}>{t('library.empty')}</Text>
                        )}
                      </View>
                      <View>
                        <Text style={styles.profileCardLabel}>{t('library.title')}:</Text>
                        <Text style={styles.profileCardValue}>{gamesCount}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* 4) Amigos online; al abrirla va a la pestaña Friends */}
                    <TouchableOpacity
                      ref={setItemRef('cards', PROFILE_CARD_FRIENDS) as any}
                      activeOpacity={0.85}
                      style={cardStyle(PROFILE_CARD_FRIENDS)}
                      onPress={() => {
                        focusItem('cards', PROFILE_CARD_FRIENDS);
                        openProfileTab('friends');
                      }}
                    >
                      <View style={styles.cardAvatarRow}>
                        {profileFriends.length > 0 ? (
                          profileFriends.slice(0, PROFILE_FRIENDS_PREVIEW).map((u, idx) => (
                            <View
                              key={u.id}
                              style={[styles.cardAvatar, idx > 0 && { marginLeft: s(-10) }]}
                            >
                              {u.avatarUrl && /^https?:\/\//i.test(u.avatarUrl) ? (
                                <Image source={{ uri: u.avatarUrl }} style={styles.cardAvatarImg} contentFit="cover" />
                              ) : (
                                <Text style={styles.cardAvatarInitial}>
                                  {(u.displayName || u.username).slice(0, 1).toUpperCase()}
                                </Text>
                              )}
                            </View>
                          ))
                        ) : (
                          <Text style={styles.profileCardHint}>{tr('profile.noFriendsYet', 'No friends yet')}</Text>
                        )}
                      </View>
                      <View>
                        <Text style={styles.profileCardLabel}>{t('profile.friends')}:</Text>
                        <Text style={styles.profileCardValue}>{profileFriends.length}</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ── Games (biblioteca completa, lista vertical) ── */}
              {profileActiveTab === 'games' && (
                <View style={styles.profileSection}>
                  <View style={styles.profileSectionHeader}>
                    <Text style={styles.profileSectionTitle}>{t('profile.games')}</Text>
                    {gamesCount > 0 && <Text style={styles.profileSectionCount}>{gamesCount}</Text>}
                  </View>
                  {profileLibraryGames.length > 0 ? (
                    <View style={styles.recentList}>
                      {profileLibraryGames.map((game: any, idx: number) => {
                        const minutes = gameMinutes(game);
                        return (
                          <TouchableOpacity
                            key={game.id || idx}
                            ref={setItemRef('gamesList', idx)}
                            activeOpacity={0.85}
                            style={[styles.recentRow, isFocused('gamesList', idx) && styles.profileItemFocused]}
                            onPress={() => pressGame('gamesList', idx, game)}
                          >
                            <BlurredArt source={game.image} style={styles.recentThumb} radius={0} placeholderSize={s(30)} />
                            <View style={styles.recentInfo}>
                              <Text style={styles.recentTitle} numberOfLines={1}>{game.title}</Text>
                              <Text style={styles.recentSub}>
                                {minutes > 0 ? formatPlaytime(minutes, t) : t('lastPlayed.never')}
                              </Text>
                            </View>
                            <Text style={styles.recentPlaytime}>
                              {game.platform || ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.libraryEmpty}>
                      <Text style={styles.libraryEmptyText}>{t('library.empty')}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* ── Friends (online) ── */}
              {profileActiveTab === 'friends' && (
                <View style={styles.friendsListContainer}>
                  <OnlineFriendsPanel
                    hideSearch
                    refreshSignal={friendsVersion}
                    focusedIndex={isFocused('friends', profileItemIndex) ? profileItemIndex : null}
                    onFocusItem={(i) => focusItem('friends', i)}
                    registerItemRef={(i) => setItemRef('friends', i)}
                    onGridChange={setFriendsGrid}
                    onSelectUser={(username) => setOnlineProfileUsername(username)}
                  />
                </View>
              )}
            </View>
          </ScrollView>

          {/* Barra fija que aparece al bajar, para poder volver sin subir */}
          {profileScrolled && (
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(150)}
              style={styles.profileStickyBar}
            >
              <TouchableOpacity style={styles.profileStickyBack} onPress={onRequestBack}>
                <Ionicons name="arrow-back" size={s(20)} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.profileStickyTitle}>{t('settings.profile')}</Text>
            </Animated.View>
          )}
        </View>
      )}

      {profileScreen === 'edit' && (
        <View style={styles.contentWrapper}>
          <View style={styles.subScreenHeader}>
            <TouchableOpacity style={styles.backButtonInline} onPress={() => setProfileScreen('view')}>
              <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.subScreenHeaderTitle}>{t('settings.profile')}</Text>
          </View>

          <View style={styles.elongatedListWrap}>
            <View style={styles.psMenuList}>
              {PROFILE_EDIT_SECTIONS.map((section, index) => {
                const isRowFocused = editListIndex === index;
                return (
                  <TouchableOpacity
                    key={section}
                    style={[styles.psMenuRow, isRowFocused && styles.psMenuRowFocused]}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' ? { onMouseEnter: () => setEditListIndex(index) } : {}) as any}
                    onPress={() => openProfileEditSection(section)}
                  >
                    {isRowFocused && <SpinningBorderSearch size={s(180)} spread={2} borderRadius={1} />}
                    <Text style={[styles.psMenuRowText, isRowFocused && styles.psMenuRowTextFocused]}>
                      {profileEditLabels[section]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {profileScreen === 'detail' && (
        <View style={styles.contentWrapper}>
          <View style={styles.subScreenHeader}>
            <TouchableOpacity style={styles.backButtonInline} onPress={() => setProfileScreen('edit')}>
              <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.subScreenHeaderTitle}>{profileEditLabels[profileEditSection]}</Text>
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
                      setNamePushError(null);
                      updateUser({ name: text });
                    }}
                    placeholder={t('settings.usernamePlaceholder')}
                    placeholderTextColor="#666"
                  />
                  {isProfileOnlineLinked && (
                    <View style={{ marginTop: s(12) }}>
                      <TouchableOpacity
                        style={[styles.actionBtnSecondary, styles.actionBtnStretch]}
                        onPress={handlePushDisplayName}
                        disabled={namePushBusy}
                      >
                        <Ionicons name="cloud-upload-outline" size={s(18)} color="#FFF" />
                        <Text style={styles.actionBtnSecondaryText}>
                          {namePushBusy ? t('profile.updatingOnline') : t('profile.updateOnlineName')}
                        </Text>
                      </TouchableOpacity>
                      {!!namePushError && (
                        <Text style={{ color: '#FF5252', fontSize: s(13), marginTop: s(8) }}>
                          {namePushError}
                        </Text>
                      )}
                    </View>
                  )}
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
                      {!!activeUser?.settings?.steamId && (
                        <TouchableOpacity
                          style={[
                            styles.actionBtnSecondary,
                            styles.actionBtnStretch,
                            activeUser?.settings?.useSteamAvatar && { borderColor: '#1DB954' },
                          ]}
                          onPress={() => onToggleSteamAvatar?.()}
                        >
                          <Ionicons name="logo-steam" size={s(18)} color="#FFF" />
                          <Text style={styles.actionBtnSecondaryText}>
                            {t('settings.useSteamAvatar')}
                            {activeUser?.settings?.useSteamAvatar ? ' ✓' : ''}
                          </Text>
                        </TouchableOpacity>
                      )}
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
                    <TouchableOpacity style={[styles.actionBtnSecondary, styles.actionBtnStretch]} onPress={openCoverSearch}>
                      <Ionicons name="cloud-download-outline" size={s(18)} color="#FFF" />
                      <Text style={styles.actionBtnSecondaryText}>{t('profile.coverSearchOnline')}</Text>
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
                  {coverSearchVisible && (
                    <Modal
                      visible
                      transparent
                      animationType="fade"
                      onRequestClose={() => setCoverSearchVisible(false)}
                    >
                      <View style={styles.splashModalOverlay}>
                        <View style={[styles.splashModalCard, { padding: s(24), maxWidth: s(860) }]}>
                          <Text style={styles.editListLabel}>{t('profile.coverSearchTitle')}</Text>
                          <Text style={[styles.pathDesc, { marginBottom: s(14) }]}>
                            {t('profile.coverSearchHint')}
                          </Text>
                          <View style={styles.coverSearchRow}>
                            <TextInput
                              ref={coverSearchInputRef}
                              style={[styles.editInputWide, { flex: 1, width: undefined }]}
                              value={coverSearchQuery}
                              onChangeText={setCoverSearchQuery}
                              placeholder={t('profile.coverSearchPlaceholder')}
                              placeholderTextColor="#666"
                              returnKeyType="search"
                              onSubmitEditing={runCoverSearch}
                              editable={!coverSearchBusy}
                            />
                            <TouchableOpacity
                              style={[
                                styles.actionBtnSecondary,
                                coverSelIndex === 1 && styles.rightItemFocused,
                                (!coverSearchQuery.trim() || coverSearchBusy) && { opacity: 0.5 },
                              ]}
                              onPress={runCoverSearch}
                              disabled={!coverSearchQuery.trim() || coverSearchBusy}
                            >
                              <Ionicons name="search" size={s(18)} color="#FFF" />
                              <Text style={styles.actionBtnSecondaryText}>
                                {coverSearchBusy ? t('profile.coverSearchBusy') : t('profile.coverSearchButton')}
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <ScrollView ref={coverResultsScrollRef} style={styles.coverSearchResults}>
                            <View style={styles.coverSearchGrid}>
                              {coverPageHeroes.map((hero, idx) => {
                                const selIdx = idx + 2;
                                const focused = coverSelIndex === selIdx;
                                const saving = coverSavingUrl === hero.url;
                                return (
                                  <TouchableOpacity
                                    key={hero.id || hero.url}
                                    style={[
                                      styles.coverSearchItem,
                                      focused && styles.rightItemFocused,
                                      { opacity: coverSavingUrl && !saving ? 0.5 : 1 },
                                    ]}
                                    onPress={() => handlePickCoverHero(hero.url)}
                                    disabled={!!coverSavingUrl}
                                  >
                                    <Image
                                      source={{ uri: hero.thumb || hero.url }}
                                      style={styles.coverSearchThumb}
                                      contentFit="cover"
                                    />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            {coverSearchDone && !coverSearchBusy && coverHeroes.length === 0 && (
                              <Text style={[styles.pathDesc, { marginTop: s(8) }]}>
                                {t('profile.coverSearchEmpty')}
                              </Text>
                            )}
                          </ScrollView>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: coverHasPager ? 'space-between' : 'flex-end',
                              marginTop: s(12),
                            }}
                          >
                            {coverHasPager && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
                                <TouchableOpacity
                                  style={[
                                    styles.actionBtnSecondary,
                                    coverSelIndex === coverPrevIdx && styles.rightItemFocused,
                                    coverPageSafe === 0 && { opacity: 0.4 },
                                  ]}
                                  disabled={coverPageSafe === 0}
                                  onPress={() => goToCoverPage(coverPageSafe - 1, 'prev')}
                                >
                                  <Ionicons name="chevron-back" size={s(18)} color="#FFF" />
                                </TouchableOpacity>
                                <Text style={styles.actionBtnSecondaryText}>
                                  {coverPageSafe + 1} / {coverTotalPages}
                                </Text>
                                <TouchableOpacity
                                  style={[
                                    styles.actionBtnSecondary,
                                    coverSelIndex === coverNextIdx && styles.rightItemFocused,
                                    coverPageSafe >= coverTotalPages - 1 && { opacity: 0.4 },
                                  ]}
                                  disabled={coverPageSafe >= coverTotalPages - 1}
                                  onPress={() => goToCoverPage(coverPageSafe + 1, 'next')}
                                >
                                  <Ionicons name="chevron-forward" size={s(18)} color="#FFF" />
                                </TouchableOpacity>
                              </View>
                            )}
                            <TouchableOpacity
                              style={[
                                styles.actionBtnSecondary,
                                coverSelIndex === coverCloseIdx && styles.rightItemFocused,
                              ]}
                              onPress={() => setCoverSearchVisible(false)}
                            >
                              <Text style={styles.actionBtnSecondaryText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </Modal>
                  )}
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
                      setBioPushError(null);
                      updateUser({ about: text });
                    }}
                    placeholder={t('profile.aboutPlaceholder')}
                    placeholderTextColor="#666"
                  />
                  {isProfileOnlineLinked && (
                    <View style={{ marginTop: s(12) }}>
                      <TouchableOpacity
                        style={[styles.actionBtnSecondary, styles.actionBtnStretch]}
                        onPress={handlePushBio}
                        disabled={bioPushBusy}
                      >
                        <Ionicons name="cloud-upload-outline" size={s(18)} color="#FFF" />
                        <Text style={styles.actionBtnSecondaryText}>
                          {bioPushBusy ? t('profile.updatingOnline') : t('profile.updateOnlineBio')}
                        </Text>
                      </TouchableOpacity>
                      {!!bioPushError && (
                        <Text style={{ color: '#FF5252', fontSize: s(13), marginTop: s(8) }}>
                          {bioPushError}
                        </Text>
                      )}
                    </View>
                  )}
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
      )}

      <OnlineUserFullProfile
        username={onlineProfileUsername}
        onClose={() => setOnlineProfileUsername(null)}
        onChanged={() => setFriendsVersion((v) => v + 1)}
      />
    </>
  );
}