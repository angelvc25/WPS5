import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import SpinningBorder from './Spinningborder';
import { fetchSteamNewsByName, formatSteamDate, SteamNewsItem } from '../services/steamNewsService';

interface CardData {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  imageUri?: string;
  bgColor?: string;
  type: 'news' | 'capture' | 'discover';
}

const MOCK_CARDS: CardData[] = [
  {
    id: 'c1',
    title: 'Noticias oficiales',
    subtitle: '10 historias de tus juegos',
    icon: 'megaphone',
    imageUri: 'https://images.igdb.com/igdb/image/upload/t_original/ar7l1.jpg',
    type: 'news',
  },
  {
    id: 'c2',
    title: 'Nueva captura',
    subtitle: 'Creado recientemente',
    icon: 'camera',
    imageUri: 'https://images.igdb.com/igdb/image/upload/t_original/ar43t.jpg',
    type: 'capture',
  },
  {
    id: 'c3',
    title: 'Sugerencias destacadas',
    subtitle: 'Descubrir',
    icon: 'sparkles',
    bgColor: '#0055A5',
    type: 'discover',
  },
];

interface ControlCenterCardsProps {
  isFocusedLayer: boolean;
  focusedIndex: number;
  onPressCard: (index: number) => void;
  isExpanded: boolean;
  onCloseExpanded: () => void;
}

// ─── Animated Card ────────────────────────────────────────────────────────────
function AnimatedCard({
  card,
  index,
  isActive,
  isExpanded,
  isFocusedLayer,
  onPress,
  enterDelay,
}: {
  card: CardData;
  index: number;
  isActive: boolean;
  isExpanded: boolean;
  isFocusedLayer: boolean;
  onPress: () => void;
  enterDelay: number;
}) {
  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);

  const scale = useSharedValue(1);
  const scaleX = useSharedValue(1);
  const focusLift = useSharedValue(0);
  const animWidth = useSharedValue(260);
  const animHeight = useSharedValue(260);

  const [focusedNewsIndex, setFocusedNewsIndex] = React.useState(0);
  const scrollRef = React.useRef<ScrollView>(null);
  const [realNews, setRealNews] = React.useState<SteamNewsItem[]>([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: focusedNewsIndex * 110, animated: true });
    }
  }, [focusedNewsIndex]);

  useEffect(() => {
    if (card.type === 'news') {
      fetchSteamNewsByName('Helldivers 2').then(data => {
        if (data && data.length > 0) {
          setRealNews(data.slice(0, 6));
        }
      });
    }
  }, [card.type]);

  const maxIndex = realNews.length > 0 ? realNews.length - 1 : NEWS_ITEMS.length - 1;

  useEffect(() => {
    if (isExpanded) {
      setFocusedNewsIndex(0);
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded || Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setFocusedNewsIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setFocusedNewsIndex((prev) => Math.min(maxIndex, prev + 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (realNews.length > 0 && realNews[focusedNewsIndex]?.url) {
          window.open(realNews[focusedNewsIndex].url, '_blank');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isExpanded, maxIndex, realNews, focusedNewsIndex]);

  useEffect(() => {
    if (!isActive || isExpanded || Platform.OS !== 'web') return;
    const handleEnterToExpand = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }
    };
    window.addEventListener('keydown', handleEnterToExpand, true);
    return () => window.removeEventListener('keydown', handleEnterToExpand, true);
  }, [isActive, isExpanded, onPress]);

  // Entrance animation on mount (staggered per card)
  useEffect(() => {
    translateY.value = withDelay(
      enterDelay,
      withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) })
    );
    opacity.value = withDelay(
      enterDelay,
      withTiming(1, { duration: 220 })
    );
  }, []);

  // Size on expand
  useEffect(() => {
    if (isActive && isExpanded) {
      animWidth.value = withTiming(450, { duration: 300, easing: Easing.out(Easing.cubic) });
      animHeight.value = withTiming(650, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else {
      animWidth.value = withTiming(260, { duration: 300, easing: Easing.out(Easing.cubic) });
      animHeight.value = withTiming(260, { duration: 300, easing: Easing.out(Easing.cubic) });
    }
  }, [isActive, isExpanded]);

  // Scale on focus
  useEffect(() => {
    if (isActive && !isExpanded) {
      scale.value = withTiming(1.30, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });

      scaleX.value = withTiming(1.015, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });

      focusLift.value = withTiming(-35, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      scale.value = withTiming(1, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });

      scaleX.value = withTiming(1, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });

      focusLift.value = withTiming(0, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [isActive, isExpanded]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    width: animWidth.value,
    height: animHeight.value,
    transform: [
      {
        translateY: translateY.value + focusLift.value,
      },
      {
        scaleX: scaleX.value,
      },
      {
        scaleY: scale.value,
      },
    ],
  }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={isExpanded ? undefined : onPress}
        style={[styles.card, { width: '100%', height: '100%' }]}
      >
        {/* Inner clip wrapper */}
        <View style={styles.cardClip}>
          {card.bgColor ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: card.bgColor }]} />
          ) : (
            <Image
              source={{ uri: card.imageUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}

          {/* Card content */}
          {isExpanded && card.type === 'news' ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(23, 23, 30, 1)' }]}>
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(45deg, rgba(232, 249, 255, 0.17) 0%, rgba(120,220,255,0.03) 40%, rgba(255,255,255,0.01) 60%, rgba(0,0,0,0.00) 100%)`,
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              )}
              <View style={{ padding: 20, flex: 1, zIndex: 2 }}>
                <Text style={styles.expandedTitle}>{card.title}</Text>
                <Text style={styles.expandedSubtitle}>{card.subtitle}</Text>
                <ScrollView
                  ref={scrollRef}
                  style={{ flex: 1, marginTop: 20 }}
                  showsVerticalScrollIndicator={false}
                >
                  {realNews.length > 0 ? (
                    realNews.map((article, i) => (
                      <NewsRow
                        key={i}
                        title={article.title}
                        desc={(article.contents || '').replace(/<[^>]*>?/gm, '').replace(/\[\/?(b|i|u|url|img|h1|h2|h3)[^\]]*\]/gi, '').slice(0, 120) + '...'}
                        tag={article.feedlabel.toUpperCase()}
                        date={formatSteamDate(article.date)}
                        imageUri={article.image_url}
                        enterDelay={i * 50}
                        isFocused={i === focusedNewsIndex}
                      />
                    ))
                  ) : (
                    NEWS_ITEMS.map((news, i) => (
                      <NewsRow
                        key={i}
                        title={news.title}
                        desc={news.desc}
                        tag={news.tag}
                        date={news.date}
                        icon={news.icon}
                        color={news.color}
                        enterDelay={i * 50}
                        isFocused={i === focusedNewsIndex}
                      />
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          ) : (
            <View style={styles.cardContent} pointerEvents="none">
              <View style={styles.cardTopBar}>
                <View style={styles.smallIcon}>
                  <Ionicons name={card.icon} size={13} color="#000" />
                </View>
              </View>
              <View style={styles.cardBottom}>
                <Text style={styles.cardSubtitle} numberOfLines={1}>{card.subtitle}</Text>
                <Text style={styles.cardTitle} numberOfLines={2}>{card.title}</Text>
              </View>
            </View>
          )}
        </View>

        {/* SpinningBorder — outside clip, draws over card border */}
        {isActive && !isExpanded && (
          <SpinningBorder
            width={260}
            height={260}
            borderRadius={16}
            id={`ctrl-card-${card.id}`}
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}



// ─── Animated News Row ────────────────────────────────────────────────────────
interface NewsRowProps {
  title: string;
  desc: string;
  tag: string;
  date: string;
  imageUri?: string;
  icon?: any;
  color?: string;
  enterDelay: number;
  isFocused: boolean;
}

function NewsRow({ title, desc, tag, date, imageUri, icon, color, enterDelay, isFocused }: NewsRowProps) {
  const translateX = useSharedValue(-20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateX.value = withDelay(enterDelay, withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }));
    opacity.value = withDelay(enterDelay, withTiming(1, { duration: 300 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[styles.newsItem, style, isFocused && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 14 }}>
        <View style={[styles.newsThumb, color ? { backgroundColor: color } : { backgroundColor: '#1a1a1a' }, { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
          ) : (
            <Ionicons name={icon || 'newspaper'} size={26} color="rgba(255,255,255,0.55)" />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.newsTagRow}>
            <View style={[styles.newsTag, { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={[styles.newsTagText, { color: 'rgba(255,255,255,0.6)' }]}>{tag}</Text>
            </View>
            <Text style={styles.newsDate}>{date}</Text>
          </View>
          <Text style={styles.newsTitle}>{title}</Text>
          <Text style={styles.newsDesc} numberOfLines={2}>{desc}</Text>
        </View>
      </View>
      {isFocused && (
        <SpinningBorder
          width={'100%'}
          height={'100%'}
          borderRadius={13}
          id={`news-${enterDelay}`}
        />
      )}
    </Animated.View>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ControlCenterCards({
  isFocusedLayer,
  focusedIndex,
  onPressCard,
  isExpanded,
  onCloseExpanded,
}: ControlCenterCardsProps) {
  const translateX = useSharedValue(0);

  useEffect(() => {
    // 260 (card width) + 14 (gap) = 274
    translateX.value = withTiming(-focusedIndex * 274, {
      duration: 250,
      easing: Easing.out(Easing.ease),
    });
  }, [focusedIndex]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[styles.cardsRow, rowStyle]}>
      {MOCK_CARDS.map((card, index) => (
        <AnimatedCard
          key={card.id}
          card={card}
          index={index}
          isActive={isFocusedLayer && focusedIndex === index}
          isExpanded={isExpanded && focusedIndex === index}
          isFocusedLayer={isFocusedLayer}
          onPress={() => onPressCard(index)}
          enterDelay={index * 60}
        />
      ))}
    </Animated.View>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const NEWS_ITEMS = [
  {
    title: 'Gran actualización de temporada llega esta semana',
    desc: 'El nuevo pase incluye 20 misiones, 3 personajes nuevos y eventos por tiempo limitado.',
    tag: 'ACTUALIZACIÓN', tagColor: '#0070d1', color: '#1a2a4a',
    icon: 'download-outline' as const, date: 'Hace 1 día',
  },
  {
    title: 'Torneo clasificatorio abierto este fin de semana',
    desc: 'Inscríbete antes del viernes para participar con premios exclusivos en el juego.',
    tag: 'EVENTO', tagColor: '#7b2fbe', color: '#2a1a4a',
    icon: 'trophy-outline' as const, date: 'Hace 2 días',
  },
  {
    title: 'Nuevo DLC: La Forja de los Héroes',
    desc: 'Explora el nuevo mapa de 8 horas de contenido, con jefes únicos y equipo épico.',
    tag: 'DLC', tagColor: '#be4f1f', color: '#3a1a1a',
    icon: 'planet-outline' as const, date: 'Hace 3 días',
  },
  {
    title: 'Notas de parche v2.4.1 — Balance de personajes',
    desc: 'Ajustes de daño en 12 personajes, 8 bugs críticos corregidos y mejoras de rendimiento.',
    tag: 'PARCHE', tagColor: '#1e7e34', color: '#1a3a1a',
    icon: 'bug-outline' as const, date: 'Hace 5 días',
  },
  {
    title: 'Colaboración especial con franquicia popular anunciada',
    desc: 'Skins exclusivos, emotes y accesorios del universo cinematográfico llegan pronto.',
    tag: 'COLABORACIÓN', tagColor: '#b8860b', color: '#3a2a1a',
    icon: 'star-outline' as const, date: 'Hace 1 semana',
  },
];

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    marginBottom: 50,
    width: '95%',
    gap: 14,
  },
  card: {
    borderRadius: 16,
    overflow: 'visible',
    backgroundColor: '#1c1c1e',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  cardClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 14,
    // subtle gradient-like dark bottom via backgroundColor at bottom half
    //background: undefined,
  },
  cardTopBar: {
    flexDirection: 'row',
  },
  smallIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBottom: {
    // Bottom of card — sits on top of the image gradient
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },

  // Modal / Expanded
  modalOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBg: {
    backgroundColor: 'rgba(5, 5, 10, 0.88)',
  },
  expandedContainer: {
    width: '58%',
    maxWidth: 700,
    height: '68%',
    backgroundColor: '#0e0f14',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    // @ts-ignore web shadow
    boxShadow: '0 40px 80px rgba(0,0,0,0.9)',
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  expandedTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  expandedSubtitle: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  // News list
  newsItem: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    gap: 14,
  },
  newsThumb: {
    width: 80,
    height: 64,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  newsTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  newsTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newsTagText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  newsDate: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  newsTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 18,
  },
  newsDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    lineHeight: 16,
  },
});
