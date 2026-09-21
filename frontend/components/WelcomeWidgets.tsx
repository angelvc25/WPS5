import { DEFAULT_WIDGET_IDS, getWidgetMaxSize, computeWidgetColumns } from './WidgetEditPanel';
import React, { useMemo, useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchSteamNewsByName, formatSteamDate, SteamNewsItem } from '../services/steamNewsService';
import { fetchStoreOffers, StoreOffer } from '../services/storeService';
import { fetchSteamFriends, SteamFriend } from '../services/steamFriendsService';
import { openWebLink } from '../services/linkService';
import { buildSteamRunUrl } from '../services/steamLaunchService';
import { toastService } from '../services/toastService';
import { useTranslation } from '@/contexts/LanguageContext';
import { formatPlaytime } from '../services/playtimeService';

export interface WelcomeWidgetsHandle {
  /** Ejecuta sobre el amigo actualmente mostrado la misma acciÃ³n que el clic del widget
   * (lanzar el mismo juego que estÃ¡ jugando, o abrir su perfil de Steam). Pensado para
   * ser invocado desde el manejador de teclado/mando de index.tsx. */
  triggerFriendAction: () => void;
}

interface WelcomeWidgetsProps {
  focusArea: string;
  focusIndex: number;
  setFocusArea: (area: any) => void;
  setFocusIndex: (index: number) => void;
  setHomeBgModalVisible: (visible: boolean) => void;
  setAddModalVisible: (visible: boolean) => void;
  setRandomSelectorVisible: (visible: boolean) => void;
  gamepadInfo: { connected: boolean; name: string; battery: number };
  storageInfo: {
    percent: number;
    freeGB: number;
    /** Lista de discos locales detectados (máx. 3). Si está vacía, se usa percent/freeGB como fallback. */
    disks?: { name: string; percent: number; freeGB: number; totalGB: number }[];
    /** Opcionales: si los tienes, el widget ampliado los usa en vez de estimarlos. */
    totalGB?: number;
    gamesGB?: number;
    mediaGB?: number;
    savesGB?: number;
    otherGB?: number;
  };
  lastPlayedGame: any;
  activeUser: any;
  handleLaunchApp: (item: any) => void;
  windowWidth: number;
  windowHeight: number;
  // Styles passed from index
  widgetContainerStyle: any;
  widgetContainerStyle2: any;
  wviewStyle: any;
  /** Map of widget id -> visible (true = show). Missing keys = show. */
  widgetVisibility?: Record<string, boolean>;
  widgetOrder?: string[];
  /** Map of widget id -> size (0 normal, 1 ampliado, 2 ampliado al máximo). */
  widgetSizes?: Record<string, number>;
  isMoveMode?: boolean;
  movingWidgetId?: string | null;
  /** Id del widget que se está editando en WidgetEditPanel (con foco). Si viene definido y está
   *  visible en el grid, el resto de widgets se atenúan para resaltarlo. null = sin atenuar. */
  editingWidgetId?: string | null;
}

/** Si es true, los widgets ampliados crecen HACIA ARRIBA (la base del grid no se mueve, como en PS5).
 *  Si es false, el grid crece hacia abajo empujando el contenido. */
const GROW_UPWARD = false;

/** Opacidad de los widgets NO enfocados mientras el panel de edición está abierto. */
const EDIT_DIM_OPACITY = 0.25;
/** Duración (ms) y curva de las transiciones: atenuado y cambio de tamaño (alto de la tarjeta). */
const EDIT_FADE_MS = 280;
const RESIZE_MS = 380;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Margen (px) que se deja alrededor de los widgets para que el ScrollView no recorte bordes/brillos/flechas. */
const SCROLL_BLEED = 24;

/** "Hace 1 día", "Hace 3 horas"... a partir de un timestamp (segundos o ms). Usa el idioma del navegador. */
const formatTimeAgo = (ts?: number): string => {
  if (!ts || !isFinite(ts)) return '';
  try {
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const diffSec = Math.round((ms - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'always' });
    const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [unit, secs] of units) {
      if (Math.abs(diffSec) >= secs) return rtf.format(Math.round(diffSec / secs), unit);
    }
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(0, 'second');
  } catch { return ''; }
};

/** Datos de ejemplo del widget de trofeos ampliado (conéctalos a tus datos reales). */
const TROPHY_DATA = { total: 457, platinum: 1, gold: 3, silver: 16, bronze: 17, level: 150, progress: 16 };


// ─── PS5 Move Mode Arrows ────────────────────────────────────────────────────
const MoveModeArrows: React.FC = () => (
  <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
    <View style={moveArrowStyles.topWrap}>
      <Text style={moveArrowStyles.arrowText}>▲</Text>
    </View>
    <View style={moveArrowStyles.bottomWrap}>
      <Text style={moveArrowStyles.arrowText}>▼</Text>
    </View>
    <View style={moveArrowStyles.leftWrap}>
      <Text style={moveArrowStyles.arrowText}>◀</Text>
    </View>
    <View style={moveArrowStyles.rightWrap}>
      <Text style={moveArrowStyles.arrowText}>▶</Text>
    </View>
  </View>
);

const moveArrowStyles = StyleSheet.create({
  topWrap: {
    position: 'absolute',
    top: -19,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
  bottomWrap: {
    position: 'absolute',
    bottom: -19,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
  leftWrap: {
    position: 'absolute',
    left: -19,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 99999,
  },
  rightWrap: {
    position: 'absolute',
    right: -19,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 99999,
  },
  arrowText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

export const WelcomeWidgets = forwardRef<WelcomeWidgetsHandle, WelcomeWidgetsProps>(({
  focusArea,
  focusIndex,
  setFocusArea,
  setFocusIndex,
  setHomeBgModalVisible,
  setAddModalVisible,
  setRandomSelectorVisible,
  gamepadInfo,
  storageInfo,
  lastPlayedGame,
  activeUser,
  handleLaunchApp,
  windowWidth,
  windowHeight,
  widgetContainerStyle,
  widgetContainerStyle2,
  wviewStyle,
  widgetVisibility,
  widgetOrder,
  widgetSizes,
  isMoveMode = false,
  movingWidgetId = null,
  editingWidgetId = null,
}: WelcomeWidgetsProps, ref) => {
  const isWidgetVisible = (id: string) => widgetVisibility?.[id] !== false;
  const activeOrder = widgetOrder && widgetOrder.length === 10 ? widgetOrder : DEFAULT_WIDGET_IDS;

  /** 0 | 1 | 2, respetando el máximo permitido para ese widget. */
  const getSize = (id: string): 0 | 1 | 2 => {
    const v = Math.round(widgetSizes?.[id] ?? 0);
    return Math.max(0, Math.min(getWidgetMaxSize(id), v)) as 0 | 1 | 2;
  };
  // Columnas de capacidad 3: si un widget ampliado no cabe, los demás ruedan a la derecha
  const columns = computeWidgetColumns(activeOrder, isWidgetVisible, getSize);
  const focusedColumn = columns.findIndex((col) => col.some((c) => c.slot === focusIndex));
  const { t, language } = useTranslation();
  const horizontalScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (focusArea === 'welcome_widgets') {
      const col = Math.max(0, focusedColumn);

      const cardWidth = Math.max(1, Math.round(420 * (windowWidth / 1920)));
      const gap = Math.max(1, Math.round(10 * Math.min(windowWidth / 1920, windowHeight / 1080)));

      let xOffset = 0;
      if (col > 1) {
        xOffset = (col - 1) * (cardWidth + gap);
      }

      if (horizontalScrollRef.current) {
        horizontalScrollRef.current.scrollTo({
          x: xOffset,
          animated: true,
        });
      }
    }
  }, [focusIndex, focusedColumn, focusArea, windowWidth, windowHeight]);

  const batteryPct = gamepadInfo.connected ? Math.round(gamepadInfo.battery * 100) : 0;
  let batteryColor = '#4CD964';
  if (batteryPct <= 20) batteryColor = '#FF3B30';
  else if (batteryPct <= 50) batteryColor = '#FF9500';

  const batteryIcon = gamepadInfo.connected
    ? (batteryPct > 50 ? "battery-full" : (batteryPct > 20 ? "battery-half" : "battery-dead"))
    : "battery-dead";

  const [realNews, setRealNews] = useState<SteamNewsItem[]>([]);
  const [storeOffers, setStoreOffers] = useState<StoreOffer[]>([]);
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);


  useEffect(() => {
    fetchSteamNewsByName('Helldivers 2', language).then(data => {
      if (data && data.length > 0) {
        setRealNews(data.slice(0, 3));
      }
    });
  }, [language]);

  useEffect(() => {
    fetchStoreOffers().then(data => {
      if (data && data.length > 0) {
        setStoreOffers(data);
      }
    });
  }, []);

  // --- Amigos de Steam ---
  const [friends, setFriends] = useState<SteamFriend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const steamId = activeUser?.settings?.steamId;

  const FRIENDS_REFRESH_MS = 10000; // refresca cada 10s para reflejar cambios de estado/juego
  const prevFriendsRef = useRef<Map<string, SteamFriend>>(new Map()); // Nuevo ref para recordar el estado anterior de cada amigo

  useEffect(() => {
    if (!steamId) { setFriends([]); return; }
    const GLOBAL_STEAM_API_KEY = process.env.EXPO_PUBLIC_STEAM_API_KEY || 'B1F361EA3C07B455DC8B0D06ED179B00';

    let cancelled = false;
    const load = (showLoading: boolean) => {
      if (showLoading) setLoadingFriends(true);
      fetchSteamFriends(GLOBAL_STEAM_API_KEY, steamId)
        .then((data) => {
          if (cancelled) return;

          const prevMap = prevFriendsRef.current;
          data.forEach((friend) => {
            const prev = prevMap.get(friend.steamid);
            const wasPlaying = prev?.gameextrainfo;
            const nowPlaying = friend.gameextrainfo;
            // Solo notifica si antes NO jugaba (o jugaba otra cosa) y ahora sÃ­
            if (nowPlaying && nowPlaying !== wasPlaying) {
              toastService.show(t('notifiactions.friendPlaying', { friendName: friend.personaname, gameName: nowPlaying }), {
                icon: require('@/assets/images/amigos.png'),
                source: 'steam',
              });
            }
          });
          prevMap.clear();
          data.forEach((f) => prevMap.set(f.steamid, f));

          setFriends(data);
        })
        .finally(() => { if (!cancelled && showLoading) setLoadingFriends(false); });
    };

    load(true);
    const interval = setInterval(() => load(false), FRIENDS_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [steamId]);

  const topFriend = friends[0] || null;
  const onlineFriendsCount = friends.filter(f => f.personastate > 0 || f.gameextrainfo).length;

  // FunciÃ³n extra: Steam no expone pÃºblicamente el lobbyid de la partida de un
  // amigo, asÃ­ que "unirse" directo a su sesiÃ³n no es posible vÃ­a URL (por eso
  // "steam://friends/joingame/..." nunca hacÃ­a nada). En su lugar, si el amigo
  // estÃ¡ jugando algo, lanzamos TU copia de ese mismo juego (steam://rungameid,
  // el mismo mecanismo que ya usa el resto de la app para lanzar juegos). Si no
  // estÃ¡ jugando, abrimos su perfil de amigo dentro del cliente de Steam.
  const handleFriendAction = async (friend: SteamFriend | null) => {
    if (!friend) {
      // Sin amigo especÃ­fico (o sin cuenta conectada): abre el panel general de amigos de Steam.
      const ok = await openWebLink('steam://friends/status');
      if (!ok) toastService.show(t('notifications.noFriendSteam'), { source: 'steam' });
      return;
    }

    if (friend.gameextrainfo && friend.gameid) {
      const url = buildSteamRunUrl(friend.gameid);
      console.log('[Friends widget] Lanzando el mismo juego que', friend.personaname, 'â†’', url);
      const ok = await openWebLink(url);
      if (!ok) toastService.show(t('notifications.noLaunchFriendGame', { friendGame: friend.gameextrainfo }), { source: 'steam' });
    } else {
      const url = `steam://url/SteamIDFriendsPage/${friend.steamid}`;
      console.log('[Friends widget] Abriendo perfil de', friend.personaname, 'â†’', url);
      const ok = await openWebLink(url);
      if (!ok) toastService.show(t('notifications.friendProfile'), { source: 'steam' });
    }
  };

  // Permite que index.tsx dispare esta misma acciÃ³n desde el manejador de
  // teclado/mando (Enter / botÃ³n X), igual que ya se hace con LibraryGridHandle.
  useImperativeHandle(ref, () => ({
    triggerFriendAction: () => {
      handleFriendAction(topFriend);
    },
  }));

  useEffect(() => {
    if (storeOffers.length <= 1) return;
    const timer = setInterval(() => {
      setActiveOfferIndex(prev => (prev + 1) % storeOffers.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [storeOffers]);

  const activeOffer = storeOffers[activeOfferIndex] || null;

  const styles = useMemo(() => {
    const scaleW = windowWidth / 1920;
    const scaleH = windowHeight / 1080;

    // Escala uniforme (para fuentes, Ã­conos, radios, etc.):
    // usa el eje MÃS grande en vez del mÃ¡s chico, para no encoger todo
    // en ventanas ultra-wide donde el alto queda corto respecto al ancho.
    const scale = Math.min(Math.max(Math.max(scaleW, scaleH), 0.6), 1.25);

    const s = (px: number) => Math.max(1, Math.round(px * scale));
    const sH = (px: number) => Math.max(1, Math.round(px * Math.min(Math.max(scaleH, 0.6), 1.25)));
    const sW = (px: number) => Math.max(1, Math.round(px * Math.min(Math.max(scaleW, 0.6), 1.25)));


    /// ANCHO WIDGETS

    return StyleSheet.create({
      widgetGrid: {
        paddingHorizontal: 0,
        paddingTop: s(10),
        gap: s(10),
        width: 'auto',
      },
      widgetTouchable: {
        width: sW(370),
      },
      widgetRow: {
        flexDirection: 'row',
        gap: s(15),
        marginBottom: s(10),
      },
      welcomeWidgetCard: {
        // Alto fijo e idéntico para TODOS los widgets (evita que el contenido lo cambie).
        // Nota: en react-native-web `flex: 1` pone flex-basis 0 y anula `height`.
        width: '100%',
        height: sH(100),
        minHeight: sH(100),
        maxHeight: sH(100),
        flexGrow: 0,
        flexShrink: 0,
        borderRadius: s(12),
        padding: s(13),
        overflow: 'visible',
        position: 'relative',
        justifyContent: 'center',
        backgroundColor: '#0d1015',
        // Animación suave al ampliar / reducir (los 3 tamaños). El alto real llega inline desde cardSizeStyle.
        ...(Platform.OS === 'web'
          ? {
            transitionProperty: 'height, min-height, max-height',
            transitionDuration: `${RESIZE_MS}ms`,
            transitionTimingFunction: EASING,
          }
          : null),
      } as any,
      welcomeWidgetCard2: {
        flex: 1,
        height: sH(88),
        borderRadius: s(20),
        padding: s(13),
        borderWidth: 0,
        overflow: 'hidden',
        position: 'relative',
        justifyContent: 'center',
        backgroundColor: '#0d1015',
        marginBottom: s(50),
        maxWidth: sW(370),
      } as any,
      welcomeWidgetCardFocused: {
        //borderColor: '#FFFFFF',
        //borderWidth: 1.5,
      } as any,
      welcomeWidgetCardBeingMoved: {
        borderColor: '#FFFFFF',
        borderWidth: 2,
        borderRadius: s(12),
        backgroundColor: '#121622',
      } as any,
      widgetTitle: {
        color: '#FFFFFF',
        fontSize: s(17),
        fontFamily: 'SSTMedium',
        fontWeight: '500',
        letterSpacing: 0.1,
      },
      widgetTitle2: {
        color: '#fffc5dff',
        fontSize: s(17),
        fontFamily: 'SSTLight',
        fontWeight: '300',
        letterSpacing: 0.1,
      },
      widgetSubtitle: {
        color: 'rgba(224, 224, 224, 1)',
        fontFamily: 'SSTRg',
        fontSize: s(14),
        marginTop: 1,
      },
      textStack: {
        flex: 1,
        justifyContent: 'center',
      },
      widgetBadge: {
        color: 'rgba(224, 224, 224, 1)',
        fontFamily: 'SSTMedium',
        fontSize: s(15),
        fontWeight: '500',
      },
      widgetIconWrap: {
        width: s(37),
        height: s(37),
        borderRadius: s(18),
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
      },
      avatarMensajes: {
        width: '100%',
        height: '100%',
        borderRadius: 100,
      },
      quickOptionsContainer: {
        width: sW(200),
        position: 'absolute',
        right: sW(50),
        bottom: 0,
        gap: s(25),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
      },
    });
  }, [windowWidth, windowHeight]);

  // ─── Tamaños (L1/R1) ───────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const scaleW = windowWidth / 1920;
    const scaleH = windowHeight / 1080;
    const scale = Math.min(Math.max(Math.max(scaleW, scaleH), 0.6), 1.25);
    const s = (px: number) => Math.max(1, Math.round(px * scale));
    const sH = (px: number) => Math.max(1, Math.round(px * Math.min(Math.max(scaleH, 0.6), 1.25)));
    return {
      s,
      cardH: sH(100),          // alto de 1 fila (igual que welcomeWidgetCard)
      vGap: s(20) + 12,        // separación vertical entre widgets de una misma columna
      colGap: s(15),           // separación horizontal entre columnas
    };
  }, [windowWidth, windowHeight]);

  /** Tamaño 0 = 1 fila, 1 = 2 filas, 2 = 3 filas de alto. */
  const rowsFor = (id: string) => getSize(id) + 1;
  const heightForRows = (rows: number) => rows * metrics.cardH + (rows - 1) * metrics.vGap;
  const cardSizeStyle = (id: string) => {
    const h = heightForRows(rowsFor(id));
    return { height: h, minHeight: h, maxHeight: h } as any;
  };

  // ─── Atenuado al editar desde WidgetEditPanel ──────────────────────────────
  // Solo se atenúa si el widget enfocado del panel está visible en el grid
  // (si está oculto no hay nada que resaltar y no se toca la opacidad).
  const isEditingActive =
    editingWidgetId != null && columns.some((col) => col.some((c) => c.id === editingWidgetId));
  const editDimStyle = (dimmed: boolean): any => ({
    opacity: dimmed ? EDIT_DIM_OPACITY : 1,
    ...(Platform.OS === 'web'
      ? {
        transitionProperty: 'opacity',
        transitionDuration: `${EDIT_FADE_MS}ms`,
        transitionTimingFunction: EASING,
      }
      : null),
  });

  // Fade-in del contenido ampliado. Cada raíz lleva key={id-tamaño}, así que al cambiar de nivel
  // se remonta y reproduce la animación mientras la tarjeta crece / se encoge.
  const expandedIn: any =
    Platform.OS === 'web'
      ? {
        animationName: 'wc-expand-in',
        animationDuration: `${RESIZE_MS}ms`,
        animationDelay: '70ms',
        animationTimingFunction: EASING,
        animationFillMode: 'backwards',
      }
      : null;

  // Trofeos ampliado (tamaños 1 y 2): trofeos grandes + nivel con barra de progreso
  const renderTrophiesExpanded = () => {
    const { s } = metrics;
    const items = [
      { img: require('@/assets/images/platino.png'), n: TROPHY_DATA.platinum },
      { img: require('@/assets/images/oro.png'), n: TROPHY_DATA.gold },
      { img: require('@/assets/images/plata.png'), n: TROPHY_DATA.silver },
      { img: require('@/assets/images/bronce.png'), n: TROPHY_DATA.bronze },
    ];
    return (
      <View key={`trophies-${getSize('trophies')}`} style={[{ flex: 1, zIndex: 10, position: 'relative' }, expandedIn]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Image source={require('@/assets/images/logo-trophy.png')} style={{ width: 20, height: 20, resizeMode: 'contain' }} />
            <Text style={styles.widgetTitle}>{t('widgets.trophies')}</Text>
          </View>
          <Text style={styles.widgetBadge}>Total: {TROPHY_DATA.total}</Text>
        </View>

        {/* Cuerpo: ocupa el espacio sobrante y centra los trofeos verticalmente */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
          {items.map((it, i) => (
            <View key={i} style={{ alignItems: 'center', gap: 6 }}>
              <Image source={it.img} style={{ width: s(46), height: s(46), resizeMode: 'contain' }} />
              <Text style={{ color: '#FFF', fontSize: s(17), fontFamily: 'SSTBold' }}>{it.n}</Text>
            </View>
          ))}
        </View>

        {/* Pie: nivel + % + barra de progreso */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: s(24), height: s(24), borderRadius: s(12), backgroundColor: '#a9483f', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="trophy" size={s(14)} color="#FFF" />
              </View>
              <Text style={styles.widgetSubtitle}>{t('widgetEdit.trophyLevel')} {TROPHY_DATA.level}</Text>
            </View>
            <Text style={styles.widgetSubtitle}>{TROPHY_DATA.progress} %</Text>
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${TROPHY_DATA.progress}%`, backgroundColor: '#FFFFFF' }} />
          </View>
        </View>
      </View>
    );
  };

  // Tienda ampliada (tamaños 1 y 2): la imagen ocupa la tarjeta; título arriba, oferta abajo
  const renderStoreExpanded = () => {
    const { s } = metrics;
    return (
      <View key={`store-${getSize('store')}`} style={[{ flex: 1, justifyContent: 'space-between', zIndex: 10, position: 'relative' }, expandedIn]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Image source={require('@/assets/images/PlaystationStore_copi.png')} style={{ width: 18, height: 18, resizeMode: 'cover' }} />
          <Text style={styles.widgetTitle}>{t('widgets.store')}</Text>
        </View>
        <View>
          <Text style={{ color: '#FFF', fontSize: s(15), fontFamily: 'SSTLight' }} numberOfLines={1}>
            {activeOffer ? activeOffer.title : t('widgets.latestOffers')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
            {activeOffer?.discountPercent && (
              <View style={{ backgroundColor: '#0070D1', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'SSTBold' }}>-{activeOffer.discountPercent}%</Text>
              </View>
            )}
            <Text style={{ fontSize: 13, fontFamily: 'SSTBold', color: '#fff' }} numberOfLines={1}>
              {activeOffer ? activeOffer.price : 'US$69.99'}
            </Text>
            {activeOffer?.originalPrice && (
              <Text style={{ fontSize: 11, fontFamily: 'SSTLight', color: 'rgba(255,255,255,0.5)', textDecorationLine: 'line-through' }} numberOfLines={1}>
                {activeOffer.originalPrice}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  // Batería ampliada (tamaño 1 = 6 anillos, tamaño 2 = 9 anillos; 3 por fila)
  const renderControllersExpanded = () => {
    const { s } = metrics;
    const size = getSize('controller');
    const nRows = size + 1;
    const perRow = 3;
    const pad = s(13);
    const gapV = s(10);
    const innerW = Math.max(1, Math.round(370 * Math.min(Math.max(windowWidth / 1920, 0.6), 1.25))) - pad * 2;
    const availH = heightForRows(nRows) - pad * 2;
    const diam = Math.max(
      20,
      Math.min(s(84), Math.floor((availH - (nRows - 1) * gapV) / nRows), Math.floor(innerW / perRow) - 6)
    );
    const k = diam / 80;

    const renderRing = (idx: number) => {
      const isFirst = idx === 0;
      return (
        <View key={idx} style={{ width: diam, height: diam, justifyContent: 'center', alignItems: 'center' }}>
          {Platform.OS === 'web' ? (
            <>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: isFirst
                    ? `conic-gradient(${batteryColor} ${batteryPct}%, rgba(255,255,255,0.1) 0)`
                    : 'rgba(255,255,255,0.1)',
                  zIndex: 0,
                }}
              />
              <div style={{ position: 'absolute', inset: Math.max(3, Math.round(4 * k)), borderRadius: '50%', background: '#0d1015', zIndex: 1 }} />
            </>
          ) : (
            <View
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: diam / 2,
                borderWidth: 3,
                borderColor: 'rgba(255,255,255,0.12)',
                backgroundColor: '#0d1015',
              }}
            />
          )}
          {isFirst && (
            <View style={{ zIndex: 2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#FFF', fontSize: Math.round(14 * k), fontFamily: 'SSTMedium', marginBottom: 2 }}>
                {gamepadInfo.connected ? '1' : '-'}
              </Text>
              <Image
                source={require('@/assets/images/controller2.png')}
                style={{ width: Math.round(35 * k), height: Math.round(35 * k), tintColor: '#FFF' }}
                contentFit="contain"
              />
              <Ionicons name={batteryIcon as any} size={Math.round(16 * k)} color={gamepadInfo.connected ? batteryColor : '#fff'} />
            </View>
          )}
        </View>
      );
    };

    return (
      <View key={`controller-${getSize('controller')}`} style={[{ flex: 1, zIndex: 10, position: 'relative', justifyContent: 'center', gap: gapV }, expandedIn]}>
        {Array.from({ length: nRows }).map((_, r) => (
          <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
            {Array.from({ length: perRow }).map((__, c) => renderRing(r * perRow + c))}
          </View>
        ))}
      </View>
    );
  };

  // Almacenamiento ampliado
  // · Size 1 → layout original PS5: 1 disco, barra multicolor + categorías
  // · Size 2/3 → multi-disco (hasta 3), elementos pegados arriba + consejo en size 2
  const renderStorageExpanded = () => {
    const { s } = metrics;
    const size = getSize('storage');
    const fmt = (gb: number) => `${gb >= 100 ? gb.toFixed(1) : gb.toFixed(2)} GB`;

    // ── SIZE 1: layout original (un solo disco, estilo PS5) ──────────────────
    if (size === 1) {
      const free = storageInfo.freeGB > 0 ? storageInfo.freeGB : 36.47;
      const usedPct = storageInfo.percent > 0 && storageInfo.percent < 100 ? storageInfo.percent : 65;
      const total = storageInfo.totalGB && storageInfo.totalGB > 0
        ? storageInfo.totalGB
        : free / (1 - usedPct / 100);
      const used = Math.max(0, total - free);
      const games = storageInfo.gamesGB ?? used * 0.78;
      const media = storageInfo.mediaGB ?? used * 0.04;
      const saves = storageInfo.savesGB ?? used * 0.03;
      const other = storageInfo.otherGB ?? used * 0.15;
      const parts = [
        { key: 'games', label: t('widgetEdit.storageGames'), gb: games, color: '#3aa0ff' },
        { key: 'media', label: t('widgetEdit.storageMedia'), gb: media, color: '#5b1fd1' },
        { key: 'saves', label: t('widgetEdit.storageSaves'), gb: saves, color: '#e8720c' },
        { key: 'other', label: t('widgetEdit.storageOthers'), gb: other, color: '#d9d9d9' },
      ];
      return (
        <View key={`storage-${getSize('storage')}`} style={[{ flex: 1, zIndex: 10, position: 'relative' }, expandedIn]}>
          {/* Cabecera */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: s(12) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="harddisk" size={s(16)} color="#FFF" />
              <Text style={styles.widgetTitle}>{t('widgets.storage')}</Text>
            </View>
            <Ionicons name="information-circle" size={s(20)} color="#FFF" />
          </View>
          {/* Espacio libre + barra */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.35)' }} />
              <Text style={{ color: '#FFF', fontSize: s(15), fontFamily: 'SSTLight' }}>{t('widgets.freeSpace')}</Text>
            </View>
            <Text style={{ color: '#FFF', fontSize: s(15), fontFamily: 'SSTBold' }}>{fmt(free)}</Text>
          </View>
          <View style={{ height: s(10), borderRadius: s(5), backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', flexDirection: 'row', marginBottom: s(10) }}>
            {parts.map((p) => (
              <View key={p.key} style={{ height: '100%', width: `${Math.max(0, Math.min(100, (p.gb / total) * 100))}%`, backgroundColor: p.color }} />
            ))}
          </View>
          {/* Categorías */}
          <View style={{ gap: s(6) }}>
            {parts.map((p) => (
              <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color }} />
                  <Text style={{ color: '#FFF', fontSize: s(14), fontFamily: 'SSTLight' }}>{p.label}</Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: s(14), fontFamily: 'SSTLight' }}>{fmt(p.gb)}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    // ── SIZE 2 / 3: multi-disco, pegado arriba ───────────────────────────────
    const DISK_COLORS = ['#3aa0ff', '#5b1fd1', '#e8720c'];
    const disks = storageInfo.disks && storageInfo.disks.length > 0
      ? storageInfo.disks
      : [{
        name: 'C:',
        percent: storageInfo.percent > 0 ? storageInfo.percent : 65,
        freeGB: storageInfo.freeGB > 0 ? storageInfo.freeGB : 36.47,
        totalGB: storageInfo.totalGB ?? (storageInfo.freeGB > 0
          ? storageInfo.freeGB / (1 - (storageInfo.percent > 0 ? storageInfo.percent : 65) / 100)
          : 100),
      }];

    return (
      <View key={`storage-${getSize('storage')}`} style={[{ flex: 1, zIndex: 10, position: 'relative' }, expandedIn]}>
        {/* Cabecera */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: s(12) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="harddisk" size={s(16)} color="#FFF" />
            <Text style={styles.widgetTitle}>{t('widgets.storage')}</Text>
          </View>
          <Ionicons name="information-circle" size={s(20)} color="#FFF" />
        </View>

        {/* Bloques de discos — pegados arriba, sin flex:1/center */}
        <View style={{ gap: s(14) }}>
          {disks.map((disk, idx) => {
            const diskColor = DISK_COLORS[idx % DISK_COLORS.length];
            return (
              <View key={disk.name}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: diskColor }} />
                    <Text style={{ color: '#FFF', fontSize: s(14), fontFamily: 'SSTBold' }}>{disk.name}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: s(13), fontFamily: 'SSTLight' }}>— {t('widgets.freeSpace')}</Text>
                  </View>
                  <Text style={{ color: '#FFF', fontSize: s(14), fontFamily: 'SSTBold' }}>{fmt(disk.freeGB)}</Text>
                </View>
                <View style={{ height: s(10), borderRadius: s(5), backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: (Math.min(100, disk.percent) + '%') as any, backgroundColor: diskColor, borderRadius: s(5) }} />
                </View>
              </View>
            );
          })}
        </View>

        {/* Solo size 2: separador + consejo */}
        {size === 2 && (
          <View style={{ marginTop: 'auto' as any }}>
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: s(10) }} />
            <Text style={{ color: '#FFF', fontSize: s(13), fontFamily: 'SSTLight', lineHeight: s(20) }} numberOfLines={3}>
              {t('widgetEdit.storageHint')}
            </Text>
          </View>
        )}
      </View>
    );
  };


  // Amigos ampliado. Tamaño 1: fila de avatares + nombres (estilo PS5). Tamaño 2: lista con lo que juega cada uno.
  // Orden: jugando > en línea > desconectado.
  const renderFriendsExpanded = () => {
    const { s } = metrics;
    const size = getSize('friends');
    const rank = (f: SteamFriend) => (f.gameextrainfo ? 0 : f.personastate > 0 ? 1 : 2);
    const sorted = [...friends].sort((a, b) => rank(a) - rank(b));
    const pad = s(13);
    const innerW = Math.max(1, Math.round(370 * Math.min(Math.max(windowWidth / 1920, 0.6), 1.25))) - pad * 2;
    const availH = heightForRows(size + 1) - pad * 2;
    const isActive = (f: SteamFriend) => Boolean(f.gameextrainfo || f.personastate > 0);
    const avatarSrc = (f: SteamFriend) => (f.avatar ? { uri: f.avatar } : require('@/assets/images/amigos.png'));

    const header = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Image source={require('@/assets/images/amigos.png')} style={{ width: 30, height: 30, borderRadius: 5, resizeMode: 'contain' }} />
        <Text style={styles.widgetTitle}>{t('widgets.friends')}</Text>
        {onlineFriendsCount > 0 && (
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CD964' }} />
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'SSTBold' }}>{onlineFriendsCount}</Text>
          </View>
        )}
      </View>
    );

    if (sorted.length === 0) {
      return (
        <View key={`friends-${getSize('friends')}`} style={[{ flex: 1, zIndex: 10, position: 'relative' }, expandedIn]}>
          {header}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'SSTMediumIt' }} numberOfLines={2}>
              {!steamId ? t('widgets.connectSteamFriends') : (loadingFriends ? t('widgets.loadingFriends') : t('widgets.noFriends'))}
            </Text>
          </View>
        </View>
      );
    }

    if (size === 1) {
      const list = sorted.slice(0, 5);
      const gap = s(10);
      const diam = Math.max(24, Math.min(s(52), Math.floor((innerW - (list.length - 1) * gap) / list.length)));
      return (
        <View key={`friends-${getSize('friends')}`} style={[{ flex: 1, zIndex: 10, position: 'relative' }, expandedIn]}>
          {header}
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap }}>
            {list.map((f) => (
              <View
                key={f.steamid}
                style={{
                  width: diam, height: diam, borderRadius: diam / 2, overflow: 'hidden',
                  borderWidth: 2, borderColor: isActive(f) ? '#4CD964' : 'rgba(255,255,255,0.15)',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Image source={avatarSrc(f)} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              </View>
            ))}
          </View>
          <Text style={styles.widgetSubtitle} numberOfLines={2}>
            {list.map((f) => f.personaname).join(', ')}
          </Text>
        </View>
      );
    }

    // Tamaño 2: tantas filas como quepan
    const avatarD = s(34);
    const rowH = avatarD + s(8);
    const headerH = s(34);
    const maxRows = Math.max(1, Math.floor((availH - headerH) / rowH));
    const list = sorted.slice(0, maxRows);
    return (
      <View key={`friends-${getSize('friends')}`} style={[{ flex: 1, zIndex: 10, position: 'relative' }, expandedIn]}>
        {header}
        <View style={{ flex: 1, justifyContent: 'center', gap: s(8) }}>
          {list.map((f) => (
            <View key={f.steamid} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: avatarD, height: avatarD, borderRadius: avatarD / 2, overflow: 'hidden',
                  borderWidth: 1, borderColor: isActive(f) ? '#4CD964' : 'rgba(255,255,255,0.1)',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Image source={avatarSrc(f)} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFF', fontSize: s(13), fontFamily: 'SSTMedium' }} numberOfLines={1}>{f.personaname}</Text>
                <Text style={styles.widgetSubtitle} numberOfLines={1}>
                  {f.gameextrainfo
                    ? t('widgets.playing', { game: f.gameextrainfo })
                    : (f.personastate > 0 ? t('widgets.online') : t('widgets.disconnected'))}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // Degradado inferior para que el texto se lea sobre la imagen (solo web, como el resto de efectos)
  const renderScrim = () =>
    Platform.OS === 'web' ? (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 12,
          background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
    ) : null;

  // Noticias ampliado (tamaños 1 y 2): imagen a tarjeta completa, titular abajo
  const renderNewsExpanded = () => {
    const { s } = metrics;
    const item = realNews[0];
    const imgSrc = item?.image_url ? { uri: item.image_url } : require('@/assets/images/Store.png');
    return (
      <>
        <Image
          source={imgSrc}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, zIndex: 1 }}
          contentFit="cover"
          transition={300}
        />
        {renderScrim()}
        <View key={`news-${getSize('news')}`} style={[{ flex: 1, justifyContent: 'space-between', zIndex: 10, position: 'relative' }, expandedIn]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="megaphone" size={s(17)} color="#FFF" />
            <Text style={styles.widgetTitle}>{t('widgets.news')}</Text>
          </View>
          <View>
            <Text style={{ color: '#FFF', fontSize: s(17), fontFamily: 'SSTBold' }} numberOfLines={2}>
              {item ? item.title : t('widgets.discoverGames')}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: s(14), fontFamily: 'SSTLight', marginTop: 4 }} numberOfLines={1}>
              {item ? `Helldivers 2 | ${formatSteamDate(item.date, language)}` : 'Apex Legends | Ayer'}
            </Text>
          </View>
        </View>
      </>
    );
  };

  // Jugados recientemente ampliado (tamaño 1: datos + trofeos en línea · tamaño 2: anillo de trofeos)
  const renderRecentExpanded = () => {
    const { s } = metrics;
    const g: any = lastPlayedGame;
    const size = getSize('recently_played');
    const minutes = Number(g?.playtimeMinutes ?? g?.playtime_forever ?? 0);
    const ago = formatTimeAgo(g?.lastPlayed);
    const sessions = typeof g?.sessions === 'number' ? g.sessions : (typeof g?.sessionCount === 'number' ? g.sessionCount : null);
    const trophiesEarned = Number(g?.trophiesEarned ?? 0);
    const trophiesTotal = Number(g?.trophiesTotal ?? 0);
    const hasTrophies = trophiesTotal > 0;
    const pct = hasTrophies ? Math.min(100, Math.round((trophiesEarned / trophiesTotal) * 100)) : 0;

    const stat = (icon: React.ReactNode, label: string, value: string) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: s(22), alignItems: 'center' }}>{icon}</View>
        <View>
          <Text style={{ color: '#FFF', fontSize: s(13), fontFamily: 'SSTMedium' }}>{label}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: s(13), fontFamily: 'SSTLight' }}>{value}</Text>
        </View>
      </View>
    );

    return (
      <>
        {g?.image ? (
          <Image
            source={g.image}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, zIndex: 1 }}
            contentFit="cover"
            transition={300}
          />
        ) : null}
        {renderScrim()}
        <View key={`recently_played-${getSize('recently_played')}`} style={[{ flex: 1, justifyContent: 'space-between', zIndex: 10, position: 'relative' }, expandedIn]}>
          {/* Cabecera */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Image source={require('@/assets/images/controller.png')} style={{ width: 16, height: 16, resizeMode: 'contain', tintColor: '#FFF' }} />
              <Text style={styles.widgetTitle}>{t('widgets.recentlyPlayed')}</Text>
            </View>
            {ago ? <Text style={styles.widgetBadge}>{ago}</Text> : null}
          </View>

          {g ? (
            <View>
              <Text style={{ color: '#FFF', fontSize: s(17), fontFamily: 'SSTBold', marginBottom: size === 2 ? 14 : 8 }} numberOfLines={1}>
                {g.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <View style={{ gap: 6 }}>
                  {stat(
                    <MaterialCommunityIcons name="clock" size={s(20)} color="#FFF" />,
                    t('widgetEdit.playtime'),
                    formatPlaytime(minutes, t)
                  )}
                  {sessions !== null && stat(
                    <Image source={require('@/assets/images/controller.png')} style={{ width: s(22), height: s(22), resizeMode: 'contain', tintColor: '#FFF' }} />,
                    t('widgetEdit.sessionsPlayed'),
                    String(sessions)
                  )}
                </View>

                {hasTrophies && size === 1 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <MaterialCommunityIcons name="trophy" size={s(16)} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: s(13), fontFamily: 'SSTMedium' }}>{trophiesEarned}/{trophiesTotal}</Text>
                  </View>
                )}

                {hasTrophies && size === 2 && (
                  <View style={{ width: s(78), height: s(78), alignItems: 'center', justifyContent: 'center' }}>
                    {Platform.OS === 'web' && (
                      <>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(#FFF ${pct}%, rgba(255,255,255,0.2) 0)` }} />
                        <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: 'rgba(8,10,14,0.92)' }} />
                      </>
                    )}
                    <MaterialCommunityIcons name="trophy" size={s(24)} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: s(12), fontFamily: 'SSTMedium' }}>{trophiesEarned}/{trophiesTotal}</Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: s(14), fontFamily: 'SSTMediumIt' }}>{t('widgets.noRecent')}</Text>
          )}
        </View>
      </>
    );
  };

  const renderWidget = (id: string, slotIndex: number, isBeingMoved: boolean) => {
    switch (id) {
      case 'controller':
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.widgetTouchable}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(slotIndex);
            }}
          >
            <View style={[styles.welcomeWidgetCard, cardSizeStyle(id), isBeingMoved && styles.welcomeWidgetCardBeingMoved, (focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && styles.welcomeWidgetCardFocused]}>
              {/* SPINNING BORDER */}
              {Platform.OS === 'web' &&
                focusArea === 'welcome_widgets' &&
                (focusIndex === slotIndex || isBeingMoved) && (
                  <>
                    <style>
                      {`
                          /* --- ANIMACIÃ“N 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

                          /* â”€â”€â”€ AQUÃ OCURRE LA MAGIA DE LA MÃSCARA CUADRADA â”€â”€â”€ */
                          /* 1. Definimos dos capas de gradientes bÃ¡sicos como mÃ¡scaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. Â¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estÃ¡ndar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 200%;
                          height: 400%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÃ“N 2: DESTELLO DIAGONAL MÃS LARGO Y SUAVE --- */
  @keyframes wc-content-shimmer {
    0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
    15% { opacity: 1; }
    50% { opacity: 1; }
    70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
    100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
  }
  .wc-shimmer-line2 {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 160%; 
    height: 420%; 
    background: linear-gradient(
      to right,
      transparent 0%,
      rgba(255, 255, 255, 0.01) 20%,
      rgba(255, 255, 255, 0.18) 50%, 
      rgba(255, 255, 255, 0.01) 80%,
      transparent 100%
    );
    animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
  }
                      `}
                    </style>

                    <div className="wc-spinning-container2">
                      {/* El gradiente cÃ³nico gira aquÃ­ adentro, siendo recortado perfectamente por el padre */}
                      <div className="wc-spinning-inner" />
                    </div>
                  </>
                )}
              {/* DEGRADADO */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        90deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255,255,255,0.02) 50%,
                        rgba(255,255,255,0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    borderRadius: 10,
                    overflow: "hidden",
                    zIndex: 1,
                    opacity: focusArea === 'welcome_widgets' ? 1 : 0,
                    transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}

              {/* SHIMMER */}
              {Platform.OS === 'web' && focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved) && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 1,
                    right: 1,
                    bottom: 0,
                    borderRadius: 10,
                    zIndex: 5,
                    overflow: 'hidden',
                  } as any}
                  pointerEvents="none"
                >
                  {/* @ts-ignore */}
                  <div className="wc-shimmer-line2" />
                </View>
              )}
              {getSize('controller') === 0 ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 80, height: 80, justifyContent: 'center', alignItems: 'center' }}>
                      {Platform.OS === 'web' && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: '50%',
                            background: `conic-gradient(${batteryColor} ${batteryPct}%, rgba(255,255,255,0.1) 0)`,
                            zIndex: 0,
                          }}
                        />
                      )}
                      {Platform.OS === 'web' && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 4,
                            borderRadius: '50%',
                            background: '#0d1015',
                            zIndex: 1,
                          }}
                        />
                      )}
                      <View style={{ zIndex: 2, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: "#FFF", fontSize: 14, fontFamily: 'SSTMedium', marginBottom: 2 }}>{gamepadInfo.connected ? "1" : "-"}</Text>
                        <Image source={require('@/assets/images/controller2.png')} style={{ width: 35, height: 35, tintColor: "#FFF" }} contentFit="contain" />
                        <Ionicons name={batteryIcon as any} size={16} color={gamepadInfo.connected ? batteryColor : "#fff"} />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.textStack}>
                        <Text style={[styles.widgetSubtitle, { color: '#FFF' }]}>
                          {gamepadInfo.connected ? gamepadInfo.name.split('(')[0].trim() : t('widgets.controller')}
                        </Text>
                        <Text style={styles.widgetSubtitle}>{gamepadInfo.connected ? `${batteryPct}%` : t('widgets.disconnected')}</Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : renderControllersExpanded()}
              {isBeingMoved && <MoveModeArrows />}
            </View>
          </TouchableOpacity>
        );
      case 'trophies':
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.widgetTouchable}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(slotIndex);
            }}
          >
            <View style={[styles.welcomeWidgetCard, cardSizeStyle(id), isBeingMoved && styles.welcomeWidgetCardBeingMoved, (focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && styles.welcomeWidgetCardFocused]}>
              {/* SPINNING BORDER */}
              {Platform.OS === 'web' &&
                focusArea === 'welcome_widgets' &&
                (focusIndex === slotIndex || isBeingMoved) && (
                  <>
                    <style>
                      {`
                          /* --- ANIMACIÃ“N 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

                          /* â”€â”€â”€ AQUÃ OCURRE LA MAGIA DE LA MÃSCARA CUADRADA â”€â”€â”€ */
                          /* 1. Definimos dos capas de gradientes bÃ¡sicos como mÃ¡scaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. Â¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estÃ¡ndar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 200%;
                          height: 400%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÃ“N 2: DESTELLO DIAGONAL MÃS LARGO Y SUAVE --- */
                        @keyframes wc-content-shimmer {
                          0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
                          15% { opacity: 1; }
                          50% { opacity: 1; }
                          70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                        }
                        .wc-shimmer-line2 {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 160%; 
                          height: 420%; 
                          background: linear-gradient(
                            to right,
                            transparent 0%,
                            rgba(255, 255, 255, 0.01) 20%,
                            rgba(255, 255, 255, 0.18) 50%, 
                            rgba(255, 255, 255, 0.01) 80%,
                            transparent 100%
                          );
                          animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
                        }
                      `}
                    </style>

                    <div className="wc-spinning-container2">
                      {/* El gradiente cÃ³nico gira aquÃ­ adentro, siendo recortado perfectamente por el padre */}
                      <div className="wc-spinning-inner" />
                    </div>
                  </>
                )}
              {/* DEGRADADO */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        90deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255,255,255,0.02) 50%,
                        rgba(255,255,255,0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    borderRadius: 10,
                    overflow: "hidden",
                    zIndex: 1,
                    opacity: focusArea === 'welcome_widgets' ? 1 : 0,
                    transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}

              {/* SHIMMER */}
              {Platform.OS === 'web' && focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved) && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 1,
                    right: 1,
                    bottom: 0,
                    borderRadius: 10,
                    zIndex: 5,
                    overflow: 'hidden',
                  } as any}
                  pointerEvents="none"
                >
                  {/* @ts-ignore */}
                  <div className="wc-shimmer-line2" />
                </View>
              )}
              {getSize('trophies') === 0 ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Image source={require('@/assets/images/logo-trophy.png')} style={{ width: 20, height: 20, resizeMode: 'contain' }} />
                      <Text style={styles.widgetTitle}>{t('widgets.trophies')}</Text>
                    </View>
                    <Text style={styles.widgetBadge}>Total: 457</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {/* PLATINO */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Image source={require('@/assets/images/platino.png')} style={{ width: 25, height: 25, resizeMode: 'contain' }} />
                      <Text style={{ color: '#FFF', fontSize: 14, fontFamily: 'SSTBold', marginTop: 15 }}>1</Text>
                    </View>

                    {/* ORO */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Image source={require('@/assets/images/oro.png')} style={{ width: 25, height: 25, resizeMode: 'contain' }} />
                      <Text style={{ color: '#FFF', fontSize: 14, fontFamily: 'SSTBold', marginTop: 15 }}>3</Text>
                    </View>

                    {/* PLATA */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Image source={require('@/assets/images/plata.png')} style={{ width: 25, height: 25, resizeMode: 'contain' }} />
                      <Text style={{ color: '#FFF', fontSize: 14, fontFamily: 'SSTBold', marginTop: 15 }}>16</Text>
                    </View>

                    {/* BRONCE */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Image source={require('@/assets/images/bronce.png')} style={{ width: 25, height: 25, resizeMode: 'contain' }} />
                      <Text style={{ color: '#FFF', fontSize: 14, fontFamily: 'SSTBold', marginTop: 15 }}>17</Text>
                    </View>
                  </View>
                </>
              ) : renderTrophiesExpanded()}
              {isBeingMoved && <MoveModeArrows />}
            </View>
          </TouchableOpacity>
        );
      case 'store':
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.widgetTouchable}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(slotIndex);
              Linking.openURL(activeOffer?.url || 'https://store.playstation.com');
            }}
          >
            <View style={[styles.welcomeWidgetCard, cardSizeStyle(id), isBeingMoved && styles.welcomeWidgetCardBeingMoved, (focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && styles.welcomeWidgetCardFocused]}>
              {/* SPINNING BORDER */}
              {Platform.OS === 'web' &&
                focusArea === 'welcome_widgets' &&
                (focusIndex === slotIndex || isBeingMoved) && (
                  <>
                    <style>
                      {`
                          /* --- ANIMACIÃ“N 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

                          /* â”€â”€â”€ AQUÃ OCURRE LA MAGIA DE LA MÃSCARA CUADRADA â”€â”€â”€ */
                          /* 1. Definimos dos capas de gradientes bÃ¡sicos como mÃ¡scaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. Â¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estÃ¡ndar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 200%;
                          height: 400%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÃ“N 2: DESTELLO DIAGONAL MÃS LARGO Y SUAVE --- */
                        @keyframes wc-content-shimmer {
                          0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
                          15% { opacity: 1; }
                          50% { opacity: 1; }
                          70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                        }
                        .wc-shimmer-line2 {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 160%; 
                          height: 420%; 
                          background: linear-gradient(
                            to right,
                            transparent 0%,
                            rgba(255, 255, 255, 0.01) 20%,
                            rgba(255, 255, 255, 0.18) 50%, 
                            rgba(255, 255, 255, 0.01) 80%,
                            transparent 100%
                          );
                          animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
                        }
                      `}
                    </style>

                    <div className="wc-spinning-container2">
                      <div className="wc-spinning-inner" />
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        inset: -5,
                        borderRadius: 28,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        zIndex: 0,
                      }}
                    >
                      <Image
                        source={{ uri: activeOffer?.image || 'https://clan.fastly.steamstatic.com/images/34133273/15c8c42be7ab69aa6a47a2dcf73a945383e0a07f.jpg' }}
                        style={{
                          position: 'absolute',
                          top: 7,
                          left: 7,
                          right: 7,
                          bottom: 7,
                          borderRadius: 12,
                          width: 'auto',
                          height: 'auto',
                          overflow: 'hidden',
                          zIndex: 1,
                        }}
                        transition={300}
                      />
                    </div>
                  </>
                )}
              {/* Background Image when NOT focused/hovered */}
              {!(focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && (
                <>
                  <Image
                    source={{ uri: activeOffer?.image || 'https://clan.akamai.steamstatic.com/images/34133273/15c8c42be7ab69aa6a47a2dcf73a945383e0a07f.jpg' }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: 12,
                    }}
                    contentFit="cover"
                    transition={300}
                  />
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: 10,
                      backgroundColor: 'rgba(13, 16, 21, 0.45)',
                    }}
                  />
                </>
              )}
              {getSize('store') > 0 && Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 12,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0) 100%)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                />
              )}
              {getSize('store') === 0 ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <Image source={require('@/assets/images/PlaystationStore_copi.png')} style={{ width: 18, height: 18, resizeMode: 'cover' }} />
                    <View>
                      <Text style={styles.widgetTitle}>{t('widgets.store')}</Text>
                      <Text style={styles.widgetSubtitle} numberOfLines={1}>
                        {activeOffer ? activeOffer.title : t('widgets.latestOffers')}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, zIndex: 10 }}>
                    {activeOffer?.discountPercent && (
                      <View style={{ backgroundColor: '#0070D1', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'SSTBold' }}>-{activeOffer.discountPercent}%</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 12, fontFamily: 'SSTBold', color: "#fff" }} numberOfLines={1}>
                      {activeOffer ? activeOffer.price : 'US$69.99'}
                    </Text>
                    {activeOffer?.originalPrice && (
                      <Text style={{ fontSize: 10, fontFamily: 'SSTLight', color: "rgba(255,255,255,0.5)", textDecorationLine: 'line-through' }} numberOfLines={1}>
                        {activeOffer.originalPrice}
                      </Text>
                    )}
                  </View>
                </>
              ) : renderStoreExpanded()}
              {isBeingMoved && <MoveModeArrows />}
            </View>
          </TouchableOpacity>
        );
      case 'news':
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.widgetTouchable}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(slotIndex);
              if (realNews.length > 0 && realNews[0].url) {
                Linking.openURL(realNews[0].url);
              }
            }}
          >
            <View style={[styles.welcomeWidgetCard, cardSizeStyle(id), isBeingMoved && styles.welcomeWidgetCardBeingMoved, { flexDirection: 'row', justifyContent: 'space-between' }, (focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && styles.welcomeWidgetCardFocused]}>
              {/* SPINNING BORDER */}
              {Platform.OS === 'web' &&
                focusArea === 'welcome_widgets' &&
                (focusIndex === slotIndex || isBeingMoved) && (
                  <>
                    <style>
                      {`
                          /* --- ANIMACIÃ“N 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

                          /* â”€â”€â”€ AQUÃ OCURRE LA MAGIA DE LA MÃSCARA CUADRADA â”€â”€â”€ */
                          /* 1. Definimos dos capas de gradientes bÃ¡sicos como mÃ¡scaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. Â¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estÃ¡ndar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 200%;
                          height: 400%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÃ“N 2: DESTELLO DIAGONAL MÃS LARGO Y SUAVE --- */
                        @keyframes wc-content-shimmer {
                          0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
                          15% { opacity: 1; }
                          50% { opacity: 1; }
                          70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                        }
                        .wc-shimmer-line2 {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 160%; 
                          height: 420%; 
                          background: linear-gradient(
                            to right,
                            transparent 0%,
                            rgba(255, 255, 255, 0.01) 20%,
                            rgba(255, 255, 255, 0.18) 50%, 
                            rgba(255, 255, 255, 0.01) 80%,
                            transparent 100%
                          );
                          animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
                        }
                      `}
                    </style>

                    <div className="wc-spinning-container2">
                      <div className="wc-spinning-inner" />
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        inset: -5,
                        borderRadius: 28,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        zIndex: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 7,
                          borderRadius: 12,
                          background: '#0d1015',
                        }}
                      />
                    </div>
                  </>
                )}
              {/* DEGRADADO */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        90deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255,255,255,0.02) 50%,
                        rgba(255,255,255,0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    borderRadius: 10,
                    zIndex: 1,
                    opacity: focusArea === 'welcome_widgets' ? 1 : 0,
                    transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}

              {/* SHIMMER */}
              {Platform.OS === 'web' && focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved) && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 1,
                    right: 1,
                    bottom: 0,
                    borderRadius: 10,
                    zIndex: 5,
                    overflow: 'hidden',
                  } as any}
                  pointerEvents="none"
                >
                  {/* @ts-ignore */}
                  <div className="wc-shimmer-line2" />
                </View>
              )}
              {getSize('news') === 0 ? (
                <>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.widgetTitle}>{t('widgets.news')}</Text>
                    <Text style={styles.widgetSubtitle} numberOfLines={1}>
                      {realNews.length > 0 ? realNews[0].title : t('widgets.discoverGames')}
                    </Text>
                    <Text style={[styles.widgetSubtitle, { opacity: 0.6 }]} numberOfLines={1}>
                      {realNews.length > 0 ? `Helldivers 2 â€” ${formatSteamDate(realNews[0].date, language)}` : 'Apex Legends | Ayer'}
                    </Text>
                  </View>
                  <Image
                    source={realNews.length > 0 && realNews[0].image_url ? { uri: realNews[0].image_url } : require("@/assets/images/Store.png")}
                    style={{ width: 70, height: 70, borderRadius: 6 }}
                    contentFit="cover"
                  />
                </>
              ) : renderNewsExpanded()}
              {isBeingMoved && <MoveModeArrows />}
            </View>
          </TouchableOpacity>
        );
      case 'add_game':
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.widgetTouchable}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(slotIndex);
              setAddModalVisible(true);
            }}
          >
            <View style={[styles.welcomeWidgetCard, cardSizeStyle(id), isBeingMoved && styles.welcomeWidgetCardBeingMoved, (focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && styles.welcomeWidgetCardFocused]}>
              {/* SPINNING BORDER */}
              {Platform.OS === 'web' &&
                focusArea === 'welcome_widgets' &&
                (focusIndex === slotIndex || isBeingMoved) && (
                  <>
                    <style>
                      {`
                          /* --- ANIMACIÃ“N 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

                          /* â”€â”€â”€ AQUÃ OCURRE LA MAGIA DE LA MÃSCARA CUADRADA â”€â”€â”€ */
                          /* 1. Definimos dos capas de gradientes bÃ¡sicos como mÃ¡scaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. Â¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estÃ¡ndar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 120%;
                          height: 400%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÃ“N 2: DESTELLO DIAGONAL MÃS LARGO Y SUAVE --- */
                        @keyframes wc-content-shimmer {
                          0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
                          15% { opacity: 1; }
                          50% { opacity: 1; }
                          70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                        }
                        .wc-shimmer-line2 {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 160%; 
                          height: 420%; 
                          background: linear-gradient(
                            to right,
                            transparent 0%,
                            rgba(255, 255, 255, 0.01) 20%,
                            rgba(255, 255, 255, 0.18) 50%, 
                            rgba(255, 255, 255, 0.01) 80%,
                            transparent 100%
                          );
                          animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
                        }
                      `}
                    </style>

                    <div className="wc-spinning-container2">
                      <div className="wc-spinning-inner" />
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        inset: -5,
                        borderRadius: 28,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        zIndex: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 7,
                          borderRadius: 12,
                          background: '#0d1015',
                        }}
                      />
                    </div>
                  </>
                )}
              {/* DEGRADADO */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        90deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255,255,255,0.02) 50%,
                        rgba(255,255,255,0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    borderRadius: 10,
                    zIndex: 1,
                    opacity: focusArea === 'welcome_widgets' ? 1 : 0,
                    transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}

              {/* SHIMMER */}
              {Platform.OS === 'web' && focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved) && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 1,
                    right: 1,
                    bottom: 0,
                    borderRadius: 10,
                    zIndex: 5,
                    overflow: 'hidden',
                  } as any}
                  pointerEvents="none"
                >
                  {/* @ts-ignore */}
                  <div className="wc-shimmer-line2" />
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.widgetIconWrap}>
                  <Ionicons name="add" size={20} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.widgetTitle}>{t('widgets.addGame')}</Text>
                  <Text style={styles.widgetSubtitle} numberOfLines={1}>{t('widgets.shortcuts')}</Text>
                </View>
              </View>
              {isBeingMoved && <MoveModeArrows />}
            </View>
          </TouchableOpacity>
        );
      case 'recently_played':
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.widgetTouchable}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(slotIndex);
              if (lastPlayedGame) handleLaunchApp(lastPlayedGame);
            }}
          >
            <View style={[styles.welcomeWidgetCard, cardSizeStyle(id), isBeingMoved && styles.welcomeWidgetCardBeingMoved, { flexDirection: 'row', justifyContent: 'space-between' }, (focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && styles.welcomeWidgetCardFocused]}>
              {/* SPINNING BORDER */}
              {Platform.OS === 'web' &&
                focusArea === 'welcome_widgets' &&
                (focusIndex === slotIndex || isBeingMoved) && (
                  <>
                    <style>
                      {`
                          /* --- ANIMACIÃ“N 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

                          /* â”€â”€â”€ AQUÃ OCURRE LA MAGIA DE LA MÃSCARA CUADRADA â”€â”€â”€ */
                          /* 1. Definimos dos capas de gradientes bÃ¡sicos como mÃ¡scaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. Â¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estÃ¡ndar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 200%;
                          height: 400%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÃ“N 2: DESTELLO DIAGONAL MÃS LARGO Y SUAVE --- */
                        @keyframes wc-content-shimmer {
                          0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
                          15% { opacity: 1; }
                          50% { opacity: 1; }
                          70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                        }
                        .wc-shimmer-line2 {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 160%; 
                          height: 420%; 
                          background: linear-gradient(
                            to right,
                            transparent 0%,
                            rgba(255, 255, 255, 0.01) 20%,
                            rgba(255, 255, 255, 0.18) 50%, 
                            rgba(255, 255, 255, 0.01) 80%,
                            transparent 100%
                          );
                          animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
                        }
                      `}
                    </style>

                    <div className="wc-spinning-container2">
                      <div className="wc-spinning-inner" />
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        inset: -5,
                        borderRadius: 28,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        zIndex: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 7,
                          borderRadius: 12,
                          background: '#0d1015',
                        }}
                      />
                    </div>
                  </>
                )}
              {/* DEGRADADO */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        90deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255,255,255,0.02) 50%,
                        rgba(255,255,255,0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    borderRadius: 10,
                    zIndex: 1,
                    opacity: focusArea === 'welcome_widgets' ? 1 : 0,
                    transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}

              {/* SHIMMER */}
              {Platform.OS === 'web' && focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved) && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 1,
                    right: 1,
                    bottom: 0,
                    borderRadius: 10,
                    zIndex: 5,
                    overflow: 'hidden',
                  } as any}
                  pointerEvents="none"
                >
                  {/* @ts-ignore */}
                  <div className="wc-shimmer-line2" />
                </View>
              )}
              {getSize('recently_played') === 0 ? (
                <>
                  <View style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 5, marginBottom: 6, maxWidth: 180 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Image source={require('@/assets/images/controller.png')} style={{ width: 13, height: 13, resizeMode: 'contain', tintColor: "#FFF" }} />
                      <Text style={styles.widgetTitle}>{t('widgets.recentlyPlayed')}</Text>
                    </View>
                    <Text style={{ color: '#FFF', fontSize: 13, fontFamily: 'SSTMedium', flex: 1 }} numberOfLines={1}>{lastPlayedGame ? lastPlayedGame.title : t('widgets.noRecent')}</Text>
                    <Text style={{ color: '#FFF', fontSize: 12, fontFamily: 'SSTMedium', flex: 1 }}>
                      <MaterialCommunityIcons name="clock" size={13} color="rgba(255,255,255,0.8)" style={{ marginRight: 5 }} />
                      {lastPlayedGame
                        ? formatPlaytime(Number(lastPlayedGame.playtimeMinutes ?? lastPlayedGame.playtime_forever ?? 0), t)
                        : t('lastPlayed.never')}
                    </Text>
                  </View>
                  {lastPlayedGame ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Image source={lastPlayedGame.image} style={{ width: 70, height: 70, borderRadius: 0 }} contentFit="cover" />
                    </View>
                  ) : (
                    <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, fontFamily: 'SSTMediumIt' }}>{t('widgets.noRecent')}</Text>
                  )}
                </>
              ) : renderRecentExpanded()}
              {isBeingMoved && <MoveModeArrows />}
            </View>
          </TouchableOpacity>
        );
      case 'friends':
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.widgetTouchable}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(slotIndex);
              handleFriendAction(topFriend);
            }}
          >
            <View style={[styles.welcomeWidgetCard, cardSizeStyle(id), isBeingMoved && styles.welcomeWidgetCardBeingMoved, (focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && styles.welcomeWidgetCardFocused]}>
              {/* SPINNING BORDER */}
              {Platform.OS === 'web' &&
                focusArea === 'welcome_widgets' &&
                (focusIndex === slotIndex || isBeingMoved) && (
                  <>
                    <style>
                      {`
                          /* --- ANIMACIÃ“N 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

                          /* â”€â”€â”€ AQUÃ OCURRE LA MAGIA DE LA MÃSCARA CUADRADA â”€â”€â”€ */
                          /* 1. Definimos dos capas de gradientes bÃ¡sicos como mÃ¡scaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. Â¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estÃ¡ndar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 200%;
                          height: 400%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÃ“N 2: DESTELLO DIAGONAL MÃS LARGO Y SUAVE --- */
                        @keyframes wc-content-shimmer {
                          0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
                          15% { opacity: 1; }
                          50% { opacity: 1; }
                          70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                        }
                        .wc-shimmer-line2 {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 160%; 
                          height: 420%; 
                          background: linear-gradient(
                            to right,
                            transparent 0%,
                            rgba(255, 255, 255, 0.01) 20%,
                            rgba(255, 255, 255, 0.18) 50%, 
                            rgba(255, 255, 255, 0.01) 80%,
                            transparent 100%
                          );
                          animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
                        }
                      `}
                    </style>
                    <div className="wc-spinning-container2">
                      <div className="wc-spinning-inner" />
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        inset: -5,
                        borderRadius: 28,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        zIndex: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 7,
                          borderRadius: 12,
                          background: '#0d1015',
                        }}
                      />
                    </div>
                  </>
                )}
              {/* DEGRADADO */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        90deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255,255,255,0.02) 50%,
                        rgba(255,255,255,0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    borderRadius: 10,
                    zIndex: 1,
                    opacity: focusArea === 'welcome_widgets' ? 1 : 0,
                    transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}

              {/* SHIMMER */}
              {Platform.OS === 'web' && focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved) && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 1,
                    right: 1,
                    bottom: 0,
                    borderRadius: 10,
                    zIndex: 5,
                    overflow: 'hidden',
                  } as any}
                  pointerEvents="none"
                >
                  {/* @ts-ignore */}
                  <div className="wc-shimmer-line2" />
                </View>
              )}
              {getSize('friends') === 0 ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                    <Image source={require('@/assets/images/amigos.png')} style={{ width: 30, height: 30, borderRadius: 5, resizeMode: 'contain' }} />
                    <Text style={[styles.widgetTitle, { marginBottom: 9 }]}>{t('widgets.friends')}</Text>
                    {onlineFriendsCount > 0 && (
                      <View
                        style={{
                          marginLeft: 'auto',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        {/* Punto verde */}
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: '#4CD964',
                          }}
                        />

                        {/* NÃºmero */}
                        <Text
                          style={{
                            color: '#FFFFFF',
                            fontSize: 12,
                            fontFamily: 'SSTBold',
                          }}
                        >
                          {onlineFriendsCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  {topFriend ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: (topFriend.gameextrainfo || topFriend.personastate > 0) ? '#4CD964' : 'rgba(255,255,255,0.1)' }}>
                        {topFriend.avatar ? (
                          <Image source={{ uri: topFriend.avatar }} style={styles.avatarMensajes} />
                        ) : (
                          <Image source={require('@/assets/images/amigos.png')} style={styles.avatarMensajes} />

                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#FFF', fontSize: 13, fontFamily: 'SSTMedium' }} numberOfLines={1}>{topFriend.personaname}</Text>
                        <Text style={styles.widgetSubtitle} numberOfLines={1}>
                          {topFriend.gameextrainfo
                            ? t('widgets.playing', { game: topFriend.gameextrainfo })
                            : (topFriend.personastate > 0 ? t('widgets.online') : t('widgets.disconnected'))}
                        </Text>
                        <Image
                          source={require('@/assets/images/consola.png')}
                          style={{ width: 40, height: 40, position: 'absolute', bottom: 2, right: 15, tintColor: '#FFFFFF' }}
                          resizeMode="contain"
                        />
                      </View>
                    </View>
                  ) : (
                    <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, fontFamily: 'SSTMediumIt' }} numberOfLines={2}>
                      {!steamId
                        ? t('widgets.connectSteamFriends')
                        : (loadingFriends ? t('widgets.loadingFriends') : t('widgets.noFriends'))}
                    </Text>
                  )}
                </>
              ) : renderFriendsExpanded()}
              {isBeingMoved && <MoveModeArrows />}
            </View>
          </TouchableOpacity>
        );
      case 'storage':
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.widgetTouchable}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(slotIndex);
            }}
          >
            <View style={[styles.welcomeWidgetCard, cardSizeStyle(id), isBeingMoved && styles.welcomeWidgetCardBeingMoved, (focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && styles.welcomeWidgetCardFocused]}>
              {/* SPINNING BORDER */}
              {Platform.OS === 'web' &&
                focusArea === 'welcome_widgets' &&
                (focusIndex === slotIndex || isBeingMoved) && (
                  <>
                    <style>
                      {`
                          /* --- ANIMACIÃ“N 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

                          /* â”€â”€â”€ AQUÃ OCURRE LA MAGIA DE LA MÃSCARA CUADRADA â”€â”€â”€ */
                          /* 1. Definimos dos capas de gradientes bÃ¡sicos como mÃ¡scaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. Â¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estÃ¡ndar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 200%;
                          height: 400%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÃ“N 2: DESTELLO DIAGONAL MÃS LARGO Y SUAVE --- */
                        @keyframes wc-content-shimmer {
                          0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
                          15% { opacity: 1; }
                          50% { opacity: 1; }
                          70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                        }
                        .wc-shimmer-line2 {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 160%; 
                          height: 420%; 
                          background: linear-gradient(
                            to right,
                            transparent 0%,
                            rgba(255, 255, 255, 0.01) 20%,
                            rgba(255, 255, 255, 0.18) 50%, 
                            rgba(255, 255, 255, 0.01) 80%,
                            transparent 100%
                          );
                          animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
                        }
                      `}
                    </style>
                    <div className="wc-spinning-container2">
                      <div className="wc-spinning-inner" />
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        inset: -5,
                        borderRadius: 28,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        zIndex: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 7,
                          borderRadius: 12,
                          background: '#0d1015',
                        }}
                      />
                    </div>
                  </>
                )}
              {/* DEGRADADO */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        90deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255,255,255,0.02) 50%,
                        rgba(255,255,255,0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    borderRadius: 10,
                    zIndex: 1,
                    opacity: focusArea === 'welcome_widgets' ? 1 : 0,
                    transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}

              {/* SHIMMER */}
              {Platform.OS === 'web' && focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved) && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 1,
                    right: 1,
                    bottom: 0,
                    borderRadius: 10,
                    zIndex: 5,
                    overflow: 'hidden',
                  } as any}
                  pointerEvents="none"
                >
                  {/* @ts-ignore */}
                  <div className="wc-shimmer-line2" />
                </View>
              )}
              {getSize('storage') === 0 ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <MaterialCommunityIcons name="harddisk" size={13} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.widgetTitle}>{t('widgets.storage')}</Text>
                    </View>
                  </View>

                  {/* Solo primer disco (C:) con el layout original */}
                  {(() => {
                    const firstDisk = storageInfo.disks && storageInfo.disks.length > 0
                      ? storageInfo.disks[0]
                      : { percent: storageInfo.percent > 0 ? storageInfo.percent : 65, freeGB: storageInfo.freeGB > 0 ? storageInfo.freeGB : 36.47 };
                    const pct = firstDisk.percent;
                    return (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <MaterialCommunityIcons name="circle" size={13} color="rgba(255,255,255,0.4)" />
                            <Text style={styles.widgetSubtitle}>{t('widgets.freeSpace')}</Text>
                          </View>
                          <Text style={{ color: '#FFF', fontSize: 12, fontFamily: 'SSTBold' }}>
                            {firstDisk.freeGB.toFixed(1) + ' GB'}
                          </Text>
                        </View>
                        <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexDirection: 'row' }}>
                          <View style={{ height: '100%', width: (pct * 0.14 + '%') as any, backgroundColor: '#0070D1' }} />
                          <View style={{ height: '100%', width: (pct * 0.03 + '%') as any, backgroundColor: '#9B5DE5' }} />
                          <View style={{ height: '100%', width: (pct * 0.01 + '%') as any, backgroundColor: '#FF8C42' }} />
                          <View style={{ height: '100%', width: (pct * 0.11 + '%') as any, backgroundColor: '#C2C2C2', borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
                        </View>
                      </>
                    );
                  })()}
                </>
              ) : renderStorageExpanded()}
              {isBeingMoved && <MoveModeArrows />}
            </View>
          </TouchableOpacity>
        );
      case 'random_pick':
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.widgetTouchable}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(slotIndex);
              setRandomSelectorVisible(true);
            }}
          >
            <View style={[styles.welcomeWidgetCard, cardSizeStyle(id), isBeingMoved && styles.welcomeWidgetCardBeingMoved, (focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && styles.welcomeWidgetCardFocused]}>
              {/* SPINNING BORDER */}
              {Platform.OS === 'web' &&
                focusArea === 'welcome_widgets' &&
                (focusIndex === slotIndex || isBeingMoved) && (
                  <>
                    <style>
                      {`
                          /* --- ANIMACIÃ“N 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

                          /* â”€â”€â”€ AQUÃ OCURRE LA MAGIA DE LA MÃSCARA CUADRADA â”€â”€â”€ */
                          /* 1. Definimos dos capas de gradientes bÃ¡sicos como mÃ¡scaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. Â¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estÃ¡ndar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 200%;
                          height: 400%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÃ“N 2: DESTELLO DIAGONAL MÃS LARGO Y SUAVE --- */
                        @keyframes wc-content-shimmer {
                          0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
                          15% { opacity: 1; }
                          50% { opacity: 1; }
                          70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                        }
                        .wc-shimmer-line2 {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 160%; 
                          height: 420%; 
                          background: linear-gradient(
                            to right,
                            transparent 0%,
                            rgba(255, 255, 255, 0.01) 20%,
                            rgba(255, 255, 255, 0.18) 50%, 
                            rgba(255, 255, 255, 0.01) 80%,
                            transparent 100%
                          );
                          animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
                        }
                      `}

                    </style>

                    <div className="wc-spinning-container2">
                      <div className="wc-spinning-inner" />
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        inset: -5,
                        borderRadius: 28,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        zIndex: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 7,
                          borderRadius: 12,
                          background: '#0d1015',
                        }}
                      />
                    </div>
                  </>
                )}
              {/* DEGRADADO */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        90deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255,255,255,0.02) 50%,
                        rgba(255,255,255,0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    borderRadius: 10,
                    zIndex: 1,
                    opacity: focusArea === 'welcome_widgets' ? 1 : 0,
                    transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}

              {/* SHIMMER */}
              {Platform.OS === 'web' && focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved) && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 1,
                    right: 1,
                    bottom: 0,
                    borderRadius: 10,
                    zIndex: 5,
                    overflow: 'hidden',
                  } as any}
                  pointerEvents="none"
                >
                  {/* @ts-ignore */}
                  <div className="wc-shimmer-line2" />
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <Ionicons name="shuffle" size={17} color="#ffffff" />
                <Text style={styles.widgetTitle}>{t('widgets.surpriseMe')}</Text>
              </View>
              <Text style={styles.widgetSubtitle}>{t('widgets.surpriseMeDesc')}</Text>
              {isBeingMoved && <MoveModeArrows />}
            </View>
          </TouchableOpacity>
        );
      case 'change_bg':
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.widgetTouchable}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(slotIndex);
              setHomeBgModalVisible(true);
            }}
          >
            <View style={[styles.welcomeWidgetCard, cardSizeStyle(id), isBeingMoved && styles.welcomeWidgetCardBeingMoved, (focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved)) && styles.welcomeWidgetCardFocused]}>
              {/* SPINNING BORDER */}
              {Platform.OS === 'web' &&
                focusArea === 'welcome_widgets' &&
                (focusIndex === slotIndex || isBeingMoved) && (
                  <>
                    <style>
                      {`
                          /* --- ANIMACIÃ“N 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

                          /* â”€â”€â”€ AQUÃ OCURRE LA MAGIA DE LA MÃSCARA CUADRADA â”€â”€â”€ */
                          /* 1. Definimos dos capas de gradientes bÃ¡sicos como mÃ¡scaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. Â¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estÃ¡ndar usa 'exclude' */
                          -webkit-mask-composite: destination-out;
                          mask-composite: exclude;

                          /* 4. El grosor del anillo se define por el "border" del contenedor */
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 120%;
                          height: 400%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
                          background: conic-gradient(
                            from 0deg,
                            rgba(255, 255, 255, 0.15) 0%,
                            rgba(255, 255, 255, 0.79) 28%,
                            rgba(180, 210, 255, 0.86) 33%,
                            rgba(220, 235, 255, 0.95) 48%,
                            rgba(255, 255, 255, 1.0) 50%,
                            rgba(223, 248, 182, 0.95) 52%,
                            rgba(180, 210, 255, 0.88) 57%,
                            rgba(255, 255, 255, 0.75) 62%,
                            rgba(255, 255, 255, 0.15) 100%
                          );
                          border-radius: 50%;
                        }

                          /* --- ANIMACIÃ“N 2: DESTELLO DIAGONAL MÃS LARGO Y SUAVE --- */
                        @keyframes wc-content-shimmer {
                          0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
                          15% { opacity: 1; }
                          50% { opacity: 1; }
                          70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
                        }
                        .wc-shimmer-line2 {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 160%; 
                          height: 420%; 
                          background: linear-gradient(
                            to right,
                            transparent 0%,
                            rgba(255, 255, 255, 0.01) 20%,
                            rgba(255, 255, 255, 0.18) 50%, 
                            rgba(255, 255, 255, 0.01) 80%,
                            transparent 100%
                          );
                          animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
                        }
                      `}
                    </style>

                    <div className="wc-spinning-container2">
                      <div className="wc-spinning-inner" />
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        inset: -5,
                        borderRadius: 28,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        zIndex: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 7,
                          borderRadius: 12,
                          background: '#0d1015',
                        }}
                      />
                    </div>
                  </>
                )}
              {/* DEGRADADO */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(
                        90deg,
                        rgba(207, 241, 253, 0.14) 0%,
                        rgba(207, 240, 255, 0.06) 35%,
                        rgba(255,255,255,0.02) 50%,
                        rgba(255,255,255,0.00) 65%,
                        rgba(0, 0, 0, 0) 100%
                      )
                    `,
                    pointerEvents: 'none',
                    borderRadius: 10,
                    zIndex: 1,
                    opacity: focusArea === 'welcome_widgets' ? 1 : 0,
                    transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}

              {/* SHIMMER */}
              {Platform.OS === 'web' && focusArea === 'welcome_widgets' && (focusIndex === slotIndex || isBeingMoved) && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 1,
                    right: 1,
                    bottom: 0,
                    borderRadius: 10,
                    zIndex: 5,
                    overflow: 'hidden',
                  } as any}
                  pointerEvents="none"
                >
                  {/* @ts-ignore */}
                  <div className="wc-shimmer-line2" />
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.widgetIconWrap}>
                  <Image source={require('@/assets/images/cambioFondo.png')} style={{ width: 30, height: 30, resizeMode: 'contain' }} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.widgetTitle}>{t('widgets.changeBg')}</Text>
                  <Text style={styles.widgetSubtitle} numberOfLines={1}>{t('widgets.customize')}</Text>
                </View>
              </View>
              {isBeingMoved && <MoveModeArrows />}
            </View>
          </TouchableOpacity>
        );
      default:
        return null;
    }
  };



  // Filas máximas ocupadas por una columna (2 = comportamiento por defecto)
  const maxColumnRows = columns.reduce(
    (m, col) => Math.max(m, col.reduce((sum, c) => sum + c.rows, 0)),
    2
  );
  const growUpOffset = GROW_UPWARD ? -(maxColumnRows - 2) * (metrics.cardH + metrics.vGap) : 0;

  return (
    <ScrollView
      ref={horizontalScrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      // El ScrollView horizontal recorta todo lo que sobresale de su caja (borde giratorio, brillo,
      // flechas del modo mover). Se reserva un margen interno (SCROLL_BLEED) y se compensa con margen
      // negativo para que los widgets no cambien de posición.
      style={{
        width: '100%',
        marginTop: -SCROLL_BLEED,
        marginBottom: -SCROLL_BLEED,
        marginLeft: -(SCROLL_BLEED - 3),
      }}
      contentContainerStyle={{
        flexDirection: 'column',
        paddingTop: SCROLL_BLEED,
        paddingBottom: SCROLL_BLEED,
        paddingLeft: SCROLL_BLEED,
        paddingRight: SCROLL_BLEED,
      }}
      scrollEnabled={true}
    >
      <View style={{ width: 'auto' }}>
        <style>{`
        @keyframes wc-expand-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes widget-shimmer {
          0% {
            transform: translate(-160%, 120%) rotate(-45deg);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          70% {
            transform: translate(130%, -120%) rotate(-45deg);
            opacity: 0;
          }
          100% {
            transform: translate(130%, -120%) rotate(-45deg);
            opacity: 0;
          }
        }

        .widget-shimmer-line {
          position: absolute;
          top: 50%;
          left: -60%;
          width: 140%;
          height: 420%;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(255,255,255,0.01) 20%,
            rgba(255,255,255,0.18) 50%,
            rgba(255,255,255,0.01) 80%,
            transparent 100%
          );
          animation: widget-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
          pointer-events: none;
          z-index: 2;
        }
      `}</style>

        {/* === EA SPORTS WIDGET (BANNER) === */}
        <View style={[{ width: '100%' }, editDimStyle(isEditingActive)]}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={{ width: '100%' }}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setFocusIndex(10);
            }}
          >
            <View style={[styles.welcomeWidgetCard2, (focusArea === 'welcome_widgets' && focusIndex === 10) && styles.welcomeWidgetCardFocused]}>
              {/* DEGRADADO */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                    linear-gradient(
                      90deg,
                      rgba(207, 241, 253, 0.14) 0%,
                      rgba(207, 240, 255, 0.06) 35%,
                      rgba(255,255,255,0.02) 50%,
                      rgba(255,255,255,0.00) 65%,
                      rgba(0, 0, 0, 0) 100%
                    )
                  `,
                    pointerEvents: 'none',
                    zIndex: 1,
                    opacity: focusArea === 'welcome_widgets' ? 1 : 0,
                    transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}

              {/* SHIMMER */}
              {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 10 && (
                <div
                  className="widget-shimmer-line"
                  style={{
                    animationDuration: '7s',
                    opacity: 0.8,
                  }}
                />
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Image source={require('@/assets/images/psplus.png')} style={{ width: 13, height: 13, resizeMode: 'contain' }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.widgetTitle2} numberOfLines={1}>
                    {t('widgets.discoverPsPlus')}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {/* Change background / Add App quick options
        <View style={styles.quickOptionsContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setHomeBgModalVisible(true);
            }}
          >
            <Image source={require('@/assets/images/cambioFondo.png')} style={{ width: 37, height: 37, resizeMode: 'contain' }} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setFocusArea('welcome_widgets');
              setAddModalVisible(true);
            }}
          >
            <Ionicons name="add" size={35} color="#FFF" />
          </TouchableOpacity>
        </View> */}
        </View>

        {/* === WELCOME WIDGETS GRID (columnas apiladas, alineadas abajo) === */}
        <View
          style={[
            styles.widgetGrid,
            {
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: metrics.colGap,
              marginTop: growUpOffset,
            },
          ]}
        >
          {columns.map((col, k) => (
            <View key={`col-${k}`} style={{ flexDirection: 'column', gap: metrics.vGap }}>
              {col.map(({ id, slot }) => (
                <View
                  key={id}
                  style={[
                    { position: 'relative', overflow: 'visible' },
                    editDimStyle(isEditingActive && id !== editingWidgetId),
                  ]}
                >
                  {renderWidget(id, slot, Boolean(isMoveMode && movingWidgetId === id))}
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
});

WelcomeWidgets.displayName = 'WelcomeWidgets';

export default WelcomeWidgets;