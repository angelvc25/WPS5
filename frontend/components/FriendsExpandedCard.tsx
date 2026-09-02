import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';
import SpinningBorderNoticias from './SpinningborderNoticias';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useUser } from '@/contexts/UserContext';
import { useTranslation } from '@/contexts/LanguageContext';
import { fetchSteamFriends, SteamFriend } from '@/services/steamFriendsService';
import { openWebLink } from '@/services/linkService';
import { toastService } from '@/services/toastService';
import { buildSteamRunUrl } from '@/services/steamLaunchService';
import { soundService } from '@/services/soundService';
import SpinningborderDiscover from './SpinningborderDiscover';

interface FriendsExpandedCardProps {
  isOpen: boolean;
  onClose: () => void;
}

// estado legible igual que en WelcomeWidgets
function getFriendStatusText(friend: SteamFriend, t: (k: any, p?: any) => string) {
  if (friend.gameextrainfo) return t('widgets.playing', { game: friend.gameextrainfo } as any);
  if (friend.personastate > 0) return t('widgets.online');
  return t('widgets.disconnected');
}

function getStatusColor(friend: SteamFriend) {
  if (friend.gameextrainfo) return '#4CD964'; // jugando = verde
  if (friend.personastate > 0) return '#007AFF'; // online = azul
  return 'rgba(255,255,255,0.22)'; // offline = gris
}

function isOnline(friend: SteamFriend) {
  return !!friend.gameextrainfo || friend.personastate > 0;
}

export default function FriendsExpandedCard({ isOpen, onClose }: FriendsExpandedCardProps) {
  const { t } = useTranslation();
  const { activeUser } = useUser();
  const { width: winW, height: winH } = useWindowDimensions();
  const steamId = activeUser?.settings?.steamId;

  // responsive sizing – coherente con ControlCenterCards.tsx:209-210
  const EXPANDED_W = Math.round(Math.min(Math.max(winW * 0.32, 340), 560));
  const EXPANDED_H = Math.round(Math.min(Math.max(winH * 0.6, 420), 640));
  // sidebar idéntico al diseño: ~68px
  const SIDEBAR_W = 64;

  const [friends, setFriends] = useState<SteamFriend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'friends' | 'messages'>('friends');
  const [focusedIndex, setFocusedIndex] = useState(0);

  const scrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);

  // animation values
  const backdropOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(24);
  const cardScale = useSharedValue(0.96);

  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      backdropOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      cardOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      cardTranslateY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
      cardScale.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
      setFocusedIndex(0);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) });
      cardOpacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) });
      cardTranslateY.value = withTiming(16, { duration: 200, easing: Easing.in(Easing.cubic) });
      cardScale.value = withTiming(0.97, { duration: 200, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setShouldRender)(false);
      });
    }
  }, [isOpen]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }, { scale: cardScale.value }],
  }));

  // fetch friends – misma lógica que WelcomeWidgets.tsx:122-147
  useEffect(() => {
    if (!isOpen) return;
    if (!steamId) { setFriends([]); return; }
    const GLOBAL_STEAM_API_KEY = (process.env as any).EXPO_PUBLIC_STEAM_API_KEY || 'B1F361EA3C07B455DC8B0D06ED179B00';
    let cancelled = false;
    const FRIENDS_REFRESH_MS = 30000;
    const load = (showLoading: boolean) => {
      if (showLoading) setLoadingFriends(true);
      fetchSteamFriends(GLOBAL_STEAM_API_KEY, steamId)
        .then((data) => { if (!cancelled) setFriends(data); })
        .finally(() => { if (!cancelled && showLoading) setLoadingFriends(false); });
    };
    load(true);
    const interval = setInterval(() => load(false), FRIENDS_REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [steamId, isOpen]);

  // filtro búsqueda
  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const q = searchQuery.toLowerCase();
    return friends.filter((f) => f.personaname.toLowerCase().includes(q) || (f.gameextrainfo || '').toLowerCase().includes(q));
  }, [friends, searchQuery]);

  const onlineCount = useMemo(() => friends.filter(isOnline).length, [friends]);

  useEffect(() => {
    // clamp foco cuando cambia filtro
    if (focusedIndex > Math.max(0, filteredFriends.length - 1)) setFocusedIndex(0);
  }, [filteredFriends.length, focusedIndex]);

  // auto-scroll al amigo enfocado
  useEffect(() => {
    if (!isOpen) return;
    const rowH = 64; // altura aprox fila + separador
    scrollRef.current?.scrollTo({ y: focusedIndex * rowH, animated: true });
  }, [focusedIndex, isOpen]);

  // teclado / mando cuando está abierto
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        e.preventDefault(); e.stopPropagation();
        soundService.playBack?.();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation();
        setFocusedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredFriends.length - 1)));
        soundService.playNavigation();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        soundService.playNavigation();
      } else if (e.key === 'Enter' || e.key === 'x' || e.key === 'X') {
        e.preventDefault(); e.stopPropagation();
        const friend = filteredFriends[focusedIndex];
        if (friend) {
          soundService.playActivation?.();
          handleFriendAction(friend);
        } else if (filteredFriends.length === 0 && searchQuery) {
          // sin resultados – nada
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, filteredFriends, focusedIndex, searchQuery, onClose]);

  const handleFriendAction = async (friend: SteamFriend | null) => {
    if (!friend) {
      const ok = await openWebLink('steam://friends/status');
      if (!ok) toastService.show('No se pudo abrir Steam. ¿Está instalado y con sesión iniciada?');
      return;
    }
    if (friend.gameextrainfo && friend.gameid) {
      const url = buildSteamRunUrl(friend.gameid);
      const ok = await openWebLink(url);
      if (!ok) toastService.show(`No se pudo lanzar "${friend.gameextrainfo}". Verifica que Steam esté abierto.`);
    } else {
      const url = `steam://url/SteamIDPage/${friend.steamid}`;
      const ok = await openWebLink(url);
      if (!ok) toastService.show('No se pudo abrir el perfil de Steam de tu amigo.');
    }
  };

  const handleSearchAction = async () => {
    // buscar jugadores: abre búsqueda global o Steam
    if (searchQuery.trim()) {
      // si hay texto, ya filtra localmente; Enter sobre lista ya maneja
      return;
    }
    const ok = await openWebLink('steam://friends/status');
    if (!ok) toastService.show('No se pudo abrir Steam.');
  };

  if (!shouldRender) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents={isOpen ? 'auto' : 'none'}>
      {/* Backdrop oscurecido tal cual diseño – cubre todo */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.78)' }, backdropStyle]} />
      {/* Click en backdrop para cerrar */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      {/* Card centrada */}
      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              width: EXPANDED_W,
              height: EXPANDED_H,
              // sombra
              // @ts-ignore web shadow
              boxShadow: '0 24px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
            },
            cardAnimStyle,
          ]}
        >
          {/* Sidebar izquierda – diseño: 64px oscuro con 2 iconos */}
          <View style={[styles.sidebar, { width: SIDEBAR_W }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { setActiveTab('friends'); soundService.playNavigation(); }}
              style={[styles.sideIconBtn, activeTab === 'friends' && styles.sideIconBtnActive]}
            >
              {/* icono amigos – doble silueta como en screenshot */}
              <View style={[styles.sideIconCircle, activeTab === 'friends' && styles.sideIconCircleActive]}>
                <Image
                  source={require('@/assets/images/amigos.png')}
                  style={styles.sideIcon}
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { setActiveTab('messages'); soundService.playNavigation(); }}
              style={[styles.sideIconBtn, activeTab === 'messages' && styles.sideIconBtnActive]}
            >
              <View style={[styles.sideIconCircle, activeTab === 'messages' && styles.sideIconCircleActive]}>
                <Image
                  source={require('@/assets/images/mensajes.png')}
                  style={styles.sideIcon}
                />
              </View>
            </TouchableOpacity>
          </View>

          {/* Contenido derecho */}
          <View style={styles.main}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{activeTab === 'friends' ? t('friends.title') : t('friends.messages')}</Text>
              {/* cerrar x arriba derecha */}
              <TouchableOpacity style={styles.headerClose} onPress={onClose} activeOpacity={0.7}>
                <Ionicons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Barra Buscar jugadores */}
            {activeTab === 'friends' && (
              <View style={styles.searchRow}>
                <Pressable
                  style={styles.searchPill}
                  onPress={() => searchInputRef.current?.focus()}
                >
                  <TextInput
                    ref={searchInputRef}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={t('friends.searchPlayers') as string}
                    placeholderTextColor="rgba(255,255,255,0.65)"
                    style={styles.searchInput}
                    returnKeyType="search"
                    onSubmitEditing={handleSearchAction}
                  />
                </Pressable>
                <TouchableOpacity style={styles.searchAddBtn} activeOpacity={0.8} onPress={handleSearchAction}>
                  <Ionicons name="person-add" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* Si está cargando / sin steam */}
            <View style={styles.listContainer}>
              {activeTab === 'messages' ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="chatbubbles-outline" size={36} color="rgba(255,255,255,0.18)" />
                  <Text style={styles.emptyText}>Menssages soon</Text>
                </View>
              ) : !steamId ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="people-outline" size={36} color="rgba(255,255,255,0.18)" />
                  <Text style={styles.emptyText}>{t('widgets.connectSteamFriends')}</Text>
                </View>
              ) : loadingFriends && friends.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>{t('widgets.loadingFriends')}</Text>
                </View>
              ) : filteredFriends.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>
                    {searchQuery ? 'No results found for "' + searchQuery + '"' : t('widgets.noFriends')}
                  </Text>
                  {onlineCount > 0 && !searchQuery && (
                    <Text style={styles.emptySub}>{onlineCount} Online</Text>
                  )}
                </View>
              ) : (
                <ScrollView
                  ref={scrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {filteredFriends.map((friend, idx) => {
                    const isFocused = idx === focusedIndex;
                    const statusText = getFriendStatusText(friend, t as any);
                    const statusColor = getStatusColor(friend);
                    const online = isOnline(friend);
                    return (
                      <TouchableOpacity
                        key={friend.steamid}
                        activeOpacity={0.85}
                        onPress={() => {
                          setFocusedIndex(idx);
                          soundService.playActivation?.();
                          handleFriendAction(friend);
                        }}
                        style={[styles.friendRow, isFocused && styles.friendRowFocused]}
                      >
                        <View style={styles.avatarWrap}>
                          <Image
                            source={friend.avatar ? { uri: friend.avatar } : require('@/assets/images/ProfilePicture.png')}
                            style={styles.avatar}
                            contentFit="cover"
                            transition={200}
                          />
                          {/* dot de estado */}
                          <View style={[styles.statusDot, { backgroundColor: statusColor, borderColor: isFocused ? 'rgba(255,255,255,0.9)' : '#2a2a2e' }]} />
                        </View>
                        <View style={styles.friendMeta}>
                          <Text style={[styles.friendName, !online && styles.friendNameOffline]} numberOfLines={1}>
                            {friend.personaname}
                          </Text>
                          <Text style={[styles.friendStatus, online ? styles.friendStatusOnline : styles.friendStatusOffline]} numberOfLines={1}>
                            {statusText}
                          </Text>
                        </View>
                        {/* chevron / acción */}
                        <Ionicons name="chevron-forward" size={14} color={isFocused ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.22)'} />
                        {isFocused && (
                          <SpinningborderDiscover
                            {...({
                              width: '100%',
                              height: '100%',
                              borderRadius: 12,
                              id: `friends-${idx}`,
                            } as any)}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* footer ayuda navegación */}
            <View style={styles.footerHints}>
              <View style={styles.hintItem}>
                <PSIcon
                  char={PSIcons.cross}
                  size={15}
                  color="rgba(255, 255, 255, 0.9)"
                  style={{ verticalAlign: 'middle' }}
                />
                <Text style={styles.hintText}>{t('common.select')}</Text>
              </View>
              <View style={styles.hintItem}>
                <PSIcon
                  char={PSIcons.circle}
                  size={15}
                  color="rgba(255, 255, 255, 0.9)"
                  style={{ verticalAlign: 'middle' }}
                />
                <Text style={styles.hintText}>{t('common.back')}</Text>
              </View>
              {filteredFriends.length > 1 && (
                <View style={styles.hintItem}>
                  <PSIcon
                    char={PSIcons.dpadUp}
                    size={13}
                    color="rgba(255, 255, 255, 0.9)"
                    style={{ verticalAlign: 'middle' }}
                  />
                  <PSIcon
                    char={PSIcons.dpadDown}
                    size={13}
                    color="rgba(255, 255, 255, 0.9)"
                    style={{ verticalAlign: 'middle' }}
                  />
                  <Text style={styles.hintText}>{t('common.navigate')}</Text>
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      </View>

      {/* overlay gradient sutil dentro de card como otras cards (opcional) */}
      {Platform.OS === 'web' && (
        // @ts-ignore div web
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'radial-gradient(600px 400px at 70% 20%, rgba(255,255,255,0.04), transparent 60%)',
            zIndex: 1,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 72, // deja espacio para FloatingSystemNav pill abajo
    paddingHorizontal: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#222227',
    borderRadius: 14,
    overflow: 'hidden',
    //borderWidth: 1,
    //borderColor: 'rgba(255,255,255,0.06)',
    // @ts-ignore
    elevation: 20,
  },
  sidebar: {
    backgroundColor: '#0f0f1296',
    alignItems: 'center',
    paddingTop: 14,
    gap: 10,
    //borderRightWidth: 1,
    //borderRightColor: 'rgba(255,255,255,0.06)',
  },
  sideIconBtn: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sideIconBtnActive: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  sideIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideIconCircleActive: {
    //backgroundColor: '#fff',
  },
  main: {
    flex: 1,
    backgroundColor: '#252529',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'SSTLight',
    //fontWeight: '600',
    letterSpacing: 0.2,
  },
  headerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  searchPill: {
    flex: 1,
    height: 48,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    fontFamily: 'SSTMedium',
    textAlign: 'center',
    paddingVertical: 8,
  } as any,
  searchAddBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    flex: 1,
    minHeight: 200,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontFamily: 'SSTRg',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  emptySub: {
    color: 'rgba(76,217,100,0.9)',
    fontSize: 11,
    fontFamily: 'SSTBold',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
    borderRadius: 0,
    marginBottom: 2,
  },
  friendRowFocused: {
    //backgroundColor: 'rgba(255,255,255,0.08)',
    //borderBottomColor: 'transparent',
    // @ts-ignore web
    //boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1e',
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2e',
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    //borderWidth: 2,
  },
  friendMeta: {
    flex: 1,
    gap: 2,
  },
  friendName: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'SSTLight',
    lineHeight: 16,
  },
  friendNameOffline: {
    color: 'rgba(255, 255, 255, 0.91)',
  },
  friendStatus: {
    fontSize: 13,
    fontFamily: 'SSTRg',
    lineHeight: 16,
  },
  friendStatusOnline: {
    color: '#8ef0a0',
  },
  friendStatusOffline: {
    color: 'rgba(255, 255, 255, 0.62)',
  },
  footerHints: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    paddingTop: 10,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hintKey: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintKeyText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  hintText: {
    color: 'rgba(255, 255, 255, 1)',
    fontSize: 13,
    fontFamily: 'SSTMedium',
  },
  sideIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    //backgroundColor: '#2a2a2e',
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
    resizeMode: 'contain',
  }
});
