import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchStoreOffers, StoreOffer, LOCAL_FALLBACK_OFFERS } from '../services/storeService';

interface StoreFrontPanelProps {
  windowWidth: number;
  windowHeight: number;
  gameInfoPanelStyle: any;
}

export const StoreFrontPanel = ({
  windowWidth,
  windowHeight,
  gameInfoPanelStyle,
}: StoreFrontPanelProps) => {
  const [offers, setOffers] = useState<StoreOffer[]>(LOCAL_FALLBACK_OFFERS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStoreOffers()
      .then((data) => setOffers(data))
      .finally(() => setLoading(false));
  }, []);

  // Scale factor: 1.0 at 1080p
  const scale = Math.min(Math.max(windowHeight / 1080, 0.6), 1);
  const s = (v: number) => Math.round(v * scale);

  const deals = offers.filter((o) => o.type === 'offer');
  const upcoming = offers.filter((o) => o.type === 'release');

  const CARD_W = s(410);
  const CARD_H = s(130);
  const CARD_RADIUS = s(0);

  return (
    <Animated.View
      style={[styles.container, gameInfoPanelStyle, { paddingLeft: s(150) }]}
      entering={FadeInDown.duration(400)}
    >
      {/* Spacer calibrado para StoreFront: posiciona las cards en el tercio inferior visible */}
      <View style={{ height: Math.max(windowHeight * 0.40, 200) }} />


      {/* Must see / Ofertas */}
      <Animated.View entering={FadeInDown.duration(400).delay(60)}>
        <Text style={[styles.sectionTitle, { fontSize: s(18), marginBottom: s(14) }]}>
          Ofertas destacadas
        </Text>

        {loading ? (
          <View style={styles.loadingRow}>
            <MaterialCommunityIcons name="loading" size={16} color="rgba(255,255,255,0.4)" />
            <Text style={styles.loadingText}>Cargando ofertas...</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: s(12), paddingRight: s(40) }}
          >
            {deals.map((offer) => (
              <TouchableOpacity
                key={offer.id}
                activeOpacity={0.85}
                onPress={() => { if (offer.url) Linking.openURL(offer.url); }}
                style={[styles.card, { width: CARD_W, borderRadius: CARD_RADIUS }]}
              >
                {/* Thumbnail */}
                <Image
                  source={{ uri: offer.image }}
                  style={[styles.cardImage, { height: CARD_H, borderRadius: CARD_RADIUS }]}
                  contentFit="cover"
                />

                {/* Discount badge */}
                {offer.discountPercent != null && (
                  <View style={[styles.discountBadge, { borderRadius: s(5), padding: s(4) }]}>
                    <Text style={[styles.discountText, { fontSize: s(12) }]}>
                      -{offer.discountPercent}%
                    </Text>
                  </View>
                )}

                {/* Info */}
                <View style={[styles.cardInfo, { paddingHorizontal: s(8), paddingVertical: s(6), gap: s(2) }]}>
                  <Text style={[styles.cardTitle, { fontSize: s(12) }]} numberOfLines={1}>
                    {offer.title}
                  </Text>
                  <View style={styles.priceRow}>
                    {offer.originalPrice && (
                      <Text style={[styles.originalPrice, { fontSize: s(11) }]}>
                        {offer.originalPrice}
                      </Text>
                    )}
                    <Text style={[styles.finalPrice, { fontSize: s(13) }]}>
                      {offer.price}
                    </Text>
                  </View>
                </View>

                {/* Subtle glow overlay on hover (web) */}
                {Platform.OS === 'web' && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: CARD_RADIUS,
                      background:
                        'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </Animated.View>

      {/* Próximos lanzamientos */}
      {upcoming.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(400).delay(120)}
          style={{ marginTop: s(24) }}
        >
          <Text style={[styles.sectionTitle, { fontSize: s(18), marginBottom: s(14) }]}>
            Próximos lanzamientos
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: s(12), paddingRight: s(40) }}
          >
            {upcoming.map((offer) => (
              <TouchableOpacity
                key={offer.id}
                activeOpacity={0.85}
                onPress={() => { if (offer.url) Linking.openURL(offer.url); }}
                style={[styles.card, { width: CARD_W, borderRadius: CARD_RADIUS }]}
              >
                <Image
                  source={{ uri: offer.image }}
                  style={[styles.cardImage, { height: CARD_H, borderRadius: CARD_RADIUS }]}
                  contentFit="cover"
                />

                {/* "Próximamente" badge */}
                <View style={[styles.soonBadge, { borderRadius: s(5), padding: s(4) }]}>
                  <Text style={[styles.soonText, { fontSize: s(11) }]}>Próximamente</Text>
                </View>

                <View style={[styles.cardInfo, { paddingHorizontal: s(8), paddingVertical: s(6), gap: s(2) }]}>
                  <Text style={[styles.cardTitle, { fontSize: s(12) }]} numberOfLines={1}>
                    {offer.title}
                  </Text>
                  <Text style={[styles.finalPrice, { fontSize: s(13) }]}>
                    {offer.price}
                  </Text>
                </View>

                {Platform.OS === 'web' && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: CARD_RADIUS,
                      background:
                        'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* Footer link */}
      <Animated.View entering={FadeInDown.duration(400).delay(180)} style={{ marginTop: s(20) }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => Linking.openURL('https://store.playstation.com')}
          style={styles.storeLink}
        >
          <Ionicons name="storefront-outline" size={s(14)} color="rgba(255,255,255,0.5)" />
          <Text style={[styles.storeLinkText, { fontSize: s(13) }]}>
            Ver PlayStation Store completo
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 2,
    maxWidth: '100%' as any,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
    position: 'relative',
  } as any,
  cardImage: {
    width: '100%',
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#1a9c3e',
    zIndex: 10,
  },
  discountText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  soonBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(60,100,200,0.85)',
    zIndex: 10,
  },
  soonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cardInfo: {
    backgroundColor: 'rgba(15,20,35,0.95)',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  originalPrice: {
    color: 'rgba(255,255,255,0.4)',
    textDecorationLine: 'line-through',
  },
  finalPrice: {
    color: '#4fc3f7',
    fontWeight: '700',
  },
  storeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storeLinkText: {
    color: 'rgba(255,255,255,0.45)',
    textDecorationLine: 'underline',
  },
});

export default StoreFrontPanel;
