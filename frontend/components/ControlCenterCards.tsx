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
  isFocusedLayer,
  onPress,
  enterDelay,
}: {
  card: CardData;
  index: number;
  isActive: boolean;
  isFocusedLayer: boolean;
  onPress: () => void;
  enterDelay: number;
}) {
  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(isActive ? 1.03 : 1);

  // Entrance animation (staggered)
  useEffect(() => {
    if (isFocusedLayer) {
      translateY.value = withDelay(
        enterDelay,
        withSpring(0, { damping: 18, stiffness: 200 })
      );
      opacity.value = withDelay(
        enterDelay,
        withTiming(1, { duration: 200 })
      );
    } else {
      translateY.value = withTiming(20, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [isFocusedLayer]);

  // Scale on focus
  useEffect(() => {
    scale.value = withSpring(isActive ? 1.03 : 1, { damping: 20, stiffness: 300 });
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={styles.card}
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
        </View>

        {/* SpinningBorder — outside clip, draws over card border */}
        {isActive && (
          <SpinningBorder
            width={260}
            height={230}
            borderRadius={16}
            id={`ctrl-card-${card.id}`}
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Expanded Modal ────────────────────────────────────────────────────────────
function ExpandedModal({
  card,
  isExpanded,
  onClose,
}: {
  card: CardData;
  isExpanded: boolean;
  onClose: () => void;
}) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.94);
  const translateY = useSharedValue(30);

  useEffect(() => {
    if (isExpanded) {
      opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.ease) });
      scale.value = withSpring(1, { damping: 22, stiffness: 260 });
      translateY.value = withSpring(0, { damping: 22, stiffness: 260 });
    } else {
      opacity.value = withTiming(0, { duration: 160 });
      scale.value = withTiming(0.94, { duration: 160 });
      translateY.value = withTiming(20, { duration: 160 });
    }
  }, [isExpanded]);

  const bgStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  return (
    <Modal transparent visible={isExpanded} animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOuter}>
        {/* Dark background — no blur, just a solid dark with slight transparency */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.modalBg, bgStyle]} />

        {/* Dismiss on background tap */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* Dialog panel */}
        <Animated.View style={[styles.expandedContainer, containerStyle]}>
          {/* Header */}
          <View style={styles.expandedHeader}>
            <View style={styles.iconCircle}>
              <Ionicons name={card.icon} size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.expandedTitle}>{card.title}</Text>
              <Text style={styles.expandedSubtitle}>{card.subtitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {card.type === 'news' && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {NEWS_ITEMS.map((news, i) => (
                <NewsRow key={i} news={news} enterDelay={i * 50} />
              ))}
            </ScrollView>
          )}

          {card.type !== 'news' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <Ionicons name="construct-outline" size={48} color="rgba(255,255,255,0.15)" />
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 15 }}>Próximamente</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Animated News Row ────────────────────────────────────────────────────────
function NewsRow({ news, enterDelay }: { news: typeof NEWS_ITEMS[0]; enterDelay: number }) {
  const translateX = useSharedValue(-20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateX.value = withDelay(enterDelay, withSpring(0, { damping: 20, stiffness: 200 }));
    opacity.value = withDelay(enterDelay, withTiming(1, { duration: 200 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[styles.newsItem, style]}>
      <View style={[styles.newsThumb, { backgroundColor: news.color }]}>
        <Ionicons name={news.icon} size={26} color="rgba(255,255,255,0.55)" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.newsTagRow}>
          <View style={[styles.newsTag, { backgroundColor: news.tagColor }]}>
            <Text style={styles.newsTagText}>{news.tag}</Text>
          </View>
          <Text style={styles.newsDate}>{news.date}</Text>
        </View>
        <Text style={styles.newsTitle}>{news.title}</Text>
        <Text style={styles.newsDesc} numberOfLines={2}>{news.desc}</Text>
      </View>
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
  const expandedCard = MOCK_CARDS[Math.min(focusedIndex, MOCK_CARDS.length - 1)];

  return (
    <>
      <View style={styles.cardsRow}>
        {MOCK_CARDS.map((card, index) => (
          <AnimatedCard
            key={card.id}
            card={card}
            index={index}
            isActive={isFocusedLayer && focusedIndex === index}
            isFocusedLayer={isFocusedLayer}
            onPress={() => onPressCard(index)}
            enterDelay={index * 60}
          />
        ))}
      </View>

      <ExpandedModal
        card={expandedCard}
        isExpanded={isExpanded}
        onClose={onCloseExpanded}
      />
    </>
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
    justifyContent: 'center',
    marginBottom: 16,
    gap: 14,
  },
  card: {
    width: 260,
    height: 230,
    borderRadius: 16,
    overflow: 'visible',
    backgroundColor: '#1c1c1e',
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
    background: undefined,
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
