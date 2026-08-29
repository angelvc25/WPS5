import React, { useEffect, useState, useRef } from 'react';
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
import { useTranslation } from '@/contexts/LanguageContext';

interface StoreFrontPanelProps {
  windowWidth: number;
  windowHeight: number;
  gameInfoPanelStyle: any;
  focusArea: string;
  gamePanelFocusIndex: number;
  offers: StoreOffer[];
  loading: boolean;
}

export const StoreFrontPanel = ({
  windowWidth,
  windowHeight,
  gameInfoPanelStyle,
  focusArea,
  gamePanelFocusIndex,
  offers,
  loading,
}: StoreFrontPanelProps) => {
  const dealsScrollRef = useRef<ScrollView>(null);
  const upcomingScrollRef = useRef<ScrollView>(null);
  const { t } = useTranslation();

  // Scale factor: 1.0 at 1080p
  const scale = Math.min(Math.max(windowHeight / 1080, 0.6), 1);
  const s = (v: number) => Math.round(v * scale);

  const CARD_W = s(294);
  const CARD_H = s(160);
  const CARD_RADIUS = s(0);

  const deals = offers.filter((o) => o.type === 'offer');
  const upcoming = offers.filter((o) => o.type === 'release');

  // Focus check helpers
  const isDealFocused = (index: number) => focusArea === 'game_panel' && gamePanelFocusIndex === index;
  const isUpcomingFocused = (index: number) => focusArea === 'game_panel' && gamePanelFocusIndex === 10 + index;
  const isFooterFocused = () => focusArea === 'game_panel' && gamePanelFocusIndex === 20;

  // Horizontal scroll adjustment on focus change
  useEffect(() => {
    if (focusArea === 'game_panel') {
      const cardStep = CARD_W + s(35); // CARD_W + gap
      if (gamePanelFocusIndex < 10) {
        const idx = gamePanelFocusIndex;
        let xOffset = 0;
        if (idx > 1) {
          xOffset = (idx - 1) * cardStep;
        }
        dealsScrollRef.current?.scrollTo({ x: xOffset, animated: true });
      } else if (gamePanelFocusIndex >= 10 && gamePanelFocusIndex < 20) {
        const idx = gamePanelFocusIndex - 10;
        let xOffset = 0;
        if (idx > 1) {
          xOffset = (idx - 1) * cardStep;
        }
        upcomingScrollRef.current?.scrollTo({ x: xOffset, animated: true });
      }
    }
  }, [gamePanelFocusIndex, focusArea, CARD_W, scale]);

  return (
    <Animated.View
      style={[styles.container, gameInfoPanelStyle, { paddingLeft: s(150) }]}
      entering={FadeInDown.duration(400)}
    >
      {/* Spacer calibrado para StoreFront: posiciona las cards en el tercio inferior visible */}
      <View style={{ height: Math.max(windowHeight * 0.43, 200) }} />


      {/* Must see / Ofertas */}
      <Animated.View entering={FadeInDown.duration(400).delay(60)}>
        <Text style={[styles.sectionTitle, { fontSize: s(25), marginBottom: s(14) }]}>
          {t('store.mustSee')}
        </Text>

        {loading ? (
          <View style={styles.loadingRow}>
            <MaterialCommunityIcons name="loading" size={16} color="rgba(255,255,255,0.4)" />
            <Text style={styles.loadingText}>{t('store.loadingOffers')}</Text>
          </View>
        ) : (
          <ScrollView
            ref={dealsScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: s(35), paddingRight: s(40) }}
          >
            {deals.map((offer, index) => (
              <TouchableOpacity
                key={offer.id}
                activeOpacity={0.85}
                onPress={() => { if (offer.url) Linking.openURL(offer.url); }}
                style={[
                  styles.card,
                  { width: CARD_W, borderRadius: CARD_RADIUS },
                  isDealFocused(index) && styles.cardFocused
                ]}
              >

                {Platform.OS === 'web' &&
                  focusArea === 'game_panel' &&
                  isDealFocused(index) && (
                    <>
                      <style>
                        {`
                          /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -2px;
                          left: -2px;
                          right: -2px;
                          bottom: -2px;
                          border-radius: 2px;
                          z-index: 9999;
                          overflow: visible !important;

                          /* ─── AQUÍ OCURRE LA MAGIA DE LA MÁSCARA CUADRADA ─── */
                          /* 1. Definimos dos capas de gradientes básicos como máscaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. ¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estándar usa 'exclude' */
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
                          height: 200%;
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

                          /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE --- */
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
                        {/* El gradiente cónico gira aquí adentro, siendo recortado perfectamente por el padre */}
                        <div className="wc-spinning-inner" />
                      </div>
                    </>
                  )}

                {/* SHIMMER */}
                {Platform.OS === 'web' && focusArea === 'game_panel' && isDealFocused(index) && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 1,
                      right: 1,
                      bottom: 0,
                      borderRadius: 0,
                      zIndex: 5,
                      overflow: 'hidden',
                    } as any}
                    pointerEvents="none"
                  >
                    {/* @ts-ignore */}
                    <div className="wc-shimmer-line2" />
                  </View>
                )}
                {/* Thumbnail */}
                <Image
                  source={{ uri: offer.image }}
                  style={[styles.cardImage, { height: CARD_H, borderRadius: CARD_RADIUS }]}
                  contentFit="contain"
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
          <Text style={[styles.sectionTitle, { fontSize: s(25), marginBottom: s(14) }]}>
            {t('store.nextLaunch')}
          </Text>

          <ScrollView
            ref={upcomingScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: s(35), paddingRight: s(40) }}
          >
            {upcoming.map((offer, index) => (
              <TouchableOpacity
                key={offer.id}
                activeOpacity={0.85}
                onPress={() => { if (offer.url) Linking.openURL(offer.url); }}
                style={[
                  styles.card,
                  { width: CARD_W, borderRadius: CARD_RADIUS },
                  isUpcomingFocused(index) && styles.cardFocused
                ]}
              >


                {Platform.OS === 'web' &&
                  focusArea === 'game_panel' &&
                  isUpcomingFocused(index) && (
                    <>
                      <style>
                        {`
                          /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate(-50%, -50%) rotate(0deg); }
                          100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -2px;
                          left: -2px;
                          right: -2px;
                          bottom: -2px;
                          border-radius: 2px;
                          z-index: 9999;
                          overflow: visible !important;

                          /* ─── AQUÍ OCURRE LA MAGIA DE LA MÁSCARA CUADRADA ─── */
                          /* 1. Definimos dos capas de gradientes básicos como máscaras */
                          -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
                          mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

                          /* 2. El primer gradiente se expande hasta el borde (border-box). 
                                El segundo gradiente se queda solo en el contenido (padding-box) */
                          -webkit-mask-clip: border-box, padding-box;
                          mask-clip: border-box, padding-box;

                          /* 3. ¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
                                Nota: Webkit usa 'destination-out' y la propiedad estándar usa 'exclude' */
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
                          height: 200%;
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

                          /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE --- */
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
                        {/* El gradiente cónico gira aquí adentro, siendo recortado perfectamente por el padre */}
                        <div className="wc-spinning-inner" />
                      </div>
                    </>
                  )}

                {/* SHIMMER */}
                {Platform.OS === 'web' && focusArea === 'game_panel' && isUpcomingFocused(index) && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 1,
                      right: 1,
                      bottom: 0,
                      borderRadius: 0,
                      zIndex: 5,
                      overflow: 'hidden',
                    } as any}
                    pointerEvents="none"
                  >
                    {/* @ts-ignore */}
                    <div className="wc-shimmer-line2" />
                  </View>
                )}

                <Image
                  source={{ uri: offer.image }}
                  style={[styles.cardImage, { height: CARD_H, borderRadius: CARD_RADIUS }]}
                  contentFit="contain"
                />

                {/* "Próximamente" badge */}
                <View style={[styles.soonBadge, { borderRadius: s(5), padding: s(4) }]}>
                  <Text style={[styles.soonText, { fontSize: s(11) }]}>{t('store.comingSoon')}</Text>
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
          style={[styles.storeLink, isFooterFocused() && styles.storeLinkFocused]}
        >
          <Ionicons name="storefront-outline" size={s(14)} color={isFooterFocused() ? "#FFFFFF" : "rgba(255,255,255,0.5)"} />
          <Text style={[styles.storeLinkText, { fontSize: s(13) }, isFooterFocused() && styles.storeLinkTextFocused]}>
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
    fontFamily: 'SSTLight',
    fontWeight: '200',
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
    overflow: 'visible',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  } as any,
  cardFocused: {
    //borderColor: '#cececeff',
    //transform: [{ scale: 1.02 }],
    //shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    //elevation: 5,
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
    fontFamily: 'SSTMedium',
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
    fontFamily: 'SSTBold',
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
  storeLinkFocused: {
    opacity: 1,
    transform: [{ scale: 1.02 }],
  } as any,
  storeLinkTextFocused: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
});

export default StoreFrontPanel;
