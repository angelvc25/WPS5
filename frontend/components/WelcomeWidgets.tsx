import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchSteamNewsByName, formatSteamDate, SteamNewsItem } from '../services/steamNewsService';
import { fetchStoreOffers, StoreOffer } from '../services/storeService';

interface WelcomeWidgetsProps {
  focusArea: string;
  focusIndex: number;
  setFocusArea: (area: any) => void;
  setFocusIndex: (index: number) => void;
  setHomeBgModalVisible: (visible: boolean) => void;
  setAddModalVisible: (visible: boolean) => void;
  gamepadInfo: { connected: boolean; name: string; battery: number };
  storageInfo: { percent: number; freeGB: number };
  lastPlayedGame: any;
  activeUser: any;
  handleLaunchApp: (item: any) => void;
  windowWidth: number;
  windowHeight: number;
  // Styles passed from index
  widgetContainerStyle: any;
  widgetContainerStyle2: any;
  wviewStyle: any;
}

export const WelcomeWidgets = ({
  focusArea,
  focusIndex,
  setFocusArea,
  setFocusIndex,
  setHomeBgModalVisible,
  setAddModalVisible,
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
}: WelcomeWidgetsProps) => {
  const horizontalScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (focusArea === 'welcome_widgets') {
      let col = 0;
      if (focusIndex >= 0 && focusIndex <= 4) col = focusIndex;
      else if (focusIndex >= 5 && focusIndex <= 9) col = focusIndex - 5;

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
  }, [focusIndex, focusArea, windowWidth, windowHeight]);

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
  const total = storageInfo.percent > 0 ? storageInfo.percent : 65;
  const seg1 = total * 0.14;   // 40% del uso = juegos
  const seg2 = total * 0.03;  // apps
  const seg3 = total * 0.01;  // multimedia
  const seg4 = total * 0.11;  // sistema

  useEffect(() => {
    fetchSteamNewsByName('Helldivers 2').then(data => {
      if (data && data.length > 0) {
        setRealNews(data.slice(0, 3));
      }
    });
  }, []);

  useEffect(() => {
    fetchStoreOffers().then(data => {
      if (data && data.length > 0) {
        setStoreOffers(data);
      }
    });
  }, []);

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
    const scale = Math.min(scaleW, scaleH);
    const s = (px: number) => Math.max(1, Math.round(px * scale));
    const sH = (px: number) => Math.max(1, Math.round(px * scaleH));
    const sW = (px: number) => Math.max(1, Math.round(px * scaleW));


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
        flex: 1,
        height: sH(88),
        borderRadius: s(12),
        padding: s(13),
        overflow: 'visible',
        position: 'relative',
        justifyContent: 'center',
        backgroundColor: '#0d1015',
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
      widgetTitle: {
        color: '#FFFFFF',
        fontSize: s(15),
        fontWeight: '500',
        letterSpacing: 0.1,
      },
      widgetTitle2: {
        color: '#fffc5dff',
        fontSize: s(13),
        fontWeight: '300',
        letterSpacing: 0.1,
      },
      widgetSubtitle: {
        color: 'rgba(224, 224, 224, 1)',
        fontSize: s(12),
        marginTop: 1,
      },
      widgetBadge: {
        color: 'rgba(224, 224, 224, 1)',
        fontSize: s(13),
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

  return (
    <ScrollView
      ref={horizontalScrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ paddingLeft: 3, width: '100%' }}
      contentContainerStyle={{ flexDirection: 'column' }}
      scrollEnabled={true}
    >
      <View style={{ width: 'auto' }}>
        <style>{`
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
        <View style={{ width: '100%' }}>
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
                    Descubre lo nuevo de PlayStation Plus
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

        {/* === WELCOME WIDGETS GRID === */}
        <View style={styles.widgetGrid}>
          {/* Row 1 */}
          <View style={styles.widgetRow}>
            {/* Controller Widget */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.widgetTouchable}
              onPress={() => {
                setFocusArea('welcome_widgets');
                setFocusIndex(0);
              }}
            >
              <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 0) && styles.welcomeWidgetCardFocused]}>
                {/* SPINNING BORDER */}
                {Platform.OS === 'web' &&
                  focusArea === 'welcome_widgets' &&
                  focusIndex === 0 && (
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
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

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
                          width: 300%;
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
                {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 0 && (
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
                      <Text style={{ color: "#FFF", fontSize: 12, marginBottom: 2 }}>{gamepadInfo.connected ? "1" : "-"}</Text>
                      <Image source={require('@/assets/images/controller.png')} style={{ width: 25, height: 25, resizeMode: 'contain', tintColor: "#FFF", marginBottom: 2 }} />
                      <Ionicons name={batteryIcon as any} size={11} color={gamepadInfo.connected ? batteryColor : "#fff"} />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.widgetTitle} numberOfLines={1}>
                      {gamepadInfo.connected ? gamepadInfo.name.split('(')[0].trim() : 'Control inalambrico DualSense'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Text style={styles.widgetSubtitle}>{gamepadInfo.connected ? `${batteryPct}%` : 'Desconectado'}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            {/* Trophies Widget */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.widgetTouchable}
              onPress={() => {
                setFocusArea('welcome_widgets');
                setFocusIndex(1);
              }}
            >
              <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 1) && styles.welcomeWidgetCardFocused]}>
                {/* SPINNING BORDER */}
                {Platform.OS === 'web' &&
                  focusArea === 'welcome_widgets' &&
                  focusIndex === 1 && (
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
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

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
                          width: 300%;
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
                {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 1 && (
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
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Image source={require('@/assets/images/logo-trophy.png')} style={{ width: 20, height: 20, resizeMode: 'contain' }} />
                    <Text style={styles.widgetTitle}>Trofeos</Text>
                  </View>
                  <Text style={styles.widgetBadge}>Total: 457</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {/* PLATINO */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Image source={require('@/assets/images/platino.png')} style={{ width: 25, height: 25, resizeMode: 'contain' }} />
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 15 }}>1</Text>
                  </View>

                  {/* ORO */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Image source={require('@/assets/images/oro.png')} style={{ width: 25, height: 25, resizeMode: 'contain' }} />
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 15 }}>3</Text>
                  </View>

                  {/* PLATA */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Image source={require('@/assets/images/plata.png')} style={{ width: 25, height: 25, resizeMode: 'contain' }} />
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 15 }}>16</Text>
                  </View>

                  {/* BRONCE */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Image source={require('@/assets/images/bronce.png')} style={{ width: 25, height: 25, resizeMode: 'contain' }} />
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 15 }}>17</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            {/* Store Widget */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.widgetTouchable}
              onPress={() => {
                setFocusArea('welcome_widgets');
                setFocusIndex(2);
                Linking.openURL(activeOffer?.url || 'https://store.playstation.com');
              }}
            >
              <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 2) && styles.welcomeWidgetCardFocused]}>
                {/* SPINNING BORDER */}
                {Platform.OS === 'web' &&
                  focusArea === 'welcome_widgets' &&
                  focusIndex === 2 && (
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
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

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
                          width: 300%;
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
                        {/* <div
                          style={{
                            position: 'absolute',
                            width: '500%',
                            height: '500%',
                            left: '50%',
                            top: '50%',
                            background: `
                            conic-gradient(
                              from 0deg,
                              rgba(255, 255, 255, 0.15) 0%,
                              rgba(255, 255, 255, 0.79) 30%,
                              rgba(180, 210, 255, 0.86) 33%,
                              rgba(220, 235, 255, 0.95) 48%,
                              rgba(255, 255, 255, 1.0) 50%,
                              rgba(223, 248, 182, 0.95) 52%,
                              rgba(180, 210, 255, 0.88) 57%,
                              rgba(255, 255, 255, 0.75) 62%,
                              rgba(255, 255, 255, 0.84) 100%
                            )
                          `,
                            animation: 'spinBorder 6.8s linear infinite',
                          }}
                        /> */}
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
                {!(focusArea === 'welcome_widgets' && focusIndex === 2) && (
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <Image source={require('@/assets/images/PlaystationStore_copi.png')} style={{ width: 18, height: 18, resizeMode: 'cover' }} />
                  <Text style={styles.widgetTitle}>PlayStation Store</Text>
                </View>
                <Text style={styles.widgetSubtitle} numberOfLines={1}>
                  {activeOffer ? activeOffer.title : 'Últimas ofertas disponibles'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, zIndex: 10 }}>
                  {activeOffer?.discountPercent && (
                    <View style={{ backgroundColor: '#0070D1', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3 }}>
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>-{activeOffer.discountPercent}%</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 10, fontWeight: "bold", color: "#fff" }} numberOfLines={1}>
                    {activeOffer ? activeOffer.price : 'US$69.99'}
                  </Text>
                  {activeOffer?.originalPrice && (
                    <Text style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", textDecorationLine: 'line-through' }} numberOfLines={1}>
                      {activeOffer.originalPrice}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>

            {/* News Widget */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.widgetTouchable}
              onPress={() => {
                setFocusArea('welcome_widgets');
                setFocusIndex(3);
                if (realNews.length > 0 && realNews[0].url) {
                  Linking.openURL(realNews[0].url);
                }
              }}
            >
              <View style={[styles.welcomeWidgetCard, { flexDirection: 'row', justifyContent: 'space-between' }, (focusArea === 'welcome_widgets' && focusIndex === 3) && styles.welcomeWidgetCardFocused]}>
                {/* SPINNING BORDER */}
                {Platform.OS === 'web' &&
                  focusArea === 'welcome_widgets' &&
                  focusIndex === 3 && (
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
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

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
                          width: 300%;
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
                {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 3 && (
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
                <View style={{ flexDirection: 'column', alignItems: 'flex-start', flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 15 }}>
                    <Ionicons name="newspaper" size={13} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.widgetTitle}>Noticias</Text>
                  </View>
                  <Text style={[styles.widgetSubtitle, { fontWeight: 'bold', width: '100%' }]} numberOfLines={2}>
                    {realNews.length > 0 ? realNews[0].title : 'Descubre juegos nuevos'}
                  </Text>
                  <Text style={[styles.widgetSubtitle, { opacity: 0.7, width: '100%', fontSize: 9 }]} numberOfLines={1}>
                    {realNews.length > 0 ? `Helldivers 2 · ${formatSteamDate(realNews[0].date)}` : 'Apex Legends | Ayer'}
                  </Text>
                </View>
                <Image
                  source={realNews.length > 0 && realNews[0].image_url ? { uri: realNews[0].image_url } : require("@/assets/images/Store.png")}
                  style={{ width: 70, height: 70, borderRadius: 6 }}
                  contentFit="cover"
                />
              </View>
            </TouchableOpacity>

            {/* Agregar Juego Widget */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.widgetTouchable}
              onPress={() => {
                setFocusArea('welcome_widgets');
                setFocusIndex(4);
                setAddModalVisible(true);
              }}
            >
              <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 4) && styles.welcomeWidgetCardFocused]}>
                {/* SPINNING BORDER */}
                {Platform.OS === 'web' &&
                  focusArea === 'welcome_widgets' &&
                  focusIndex === 4 && (
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
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

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
                {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 4 && (
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
                  <View style={{ flex: 1 }}>
                    <Text style={styles.widgetTitle}>Agregar Juego</Text>
                    <Text style={styles.widgetSubtitle} numberOfLines={1}>Accesos directos</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Row 2 */}
          <View style={styles.widgetRow}>
            {/* Recently Played Widget */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.widgetTouchable}
              onPress={() => {
                setFocusArea('welcome_widgets');
                setFocusIndex(5);
                if (lastPlayedGame) handleLaunchApp(lastPlayedGame);
              }}
            >
              <View style={[styles.welcomeWidgetCard, { flexDirection: 'row', justifyContent: 'space-between' }, (focusArea === 'welcome_widgets' && focusIndex === 5) && styles.welcomeWidgetCardFocused]}>
                {/* SPINNING BORDER */}
                {Platform.OS === 'web' &&
                  focusArea === 'welcome_widgets' &&
                  focusIndex === 5 && (
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
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

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
                          width: 300%;
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
                {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 5 && (
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
                <View style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 5, marginBottom: 6, maxWidth: 180 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Image source={require('@/assets/images/controller.png')} style={{ width: 13, height: 13, resizeMode: 'contain', tintColor: "#FFF" }} />
                    <Text style={styles.widgetTitle}>Jugados recientemente</Text>
                  </View>
                  <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '400', flex: 1 }} numberOfLines={1}>{lastPlayedGame ? lastPlayedGame.title : 'Sin juegos recientes'}</Text>
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600', flex: 1 }}><MaterialCommunityIcons name="clock" size={13} color="rgba(255,255,255,0.8)" style={{ marginRight: 5 }} />2 horas</Text>
                </View>
                {lastPlayedGame ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Image source={lastPlayedGame.image} style={{ width: 70, height: 70, borderRadius: 0 }} contentFit="cover" />
                  </View>
                ) : (
                  <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, fontStyle: 'italic' }}>Sin juegos recientes</Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Messages Widget */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.widgetTouchable}
              onPress={() => {
                setFocusArea('welcome_widgets');
                setFocusIndex(6);
              }}
            >
              <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 6) && styles.welcomeWidgetCardFocused]}>
                {/* SPINNING BORDER */}
                {Platform.OS === 'web' &&
                  focusArea === 'welcome_widgets' &&
                  focusIndex === 6 && (
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
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

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
                          width: 300%;
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
                {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 6 && (
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <Image source={require('@/assets/images/mensajess.png')} style={{ width: 30, height: 30, resizeMode: 'contain' }} />
                  <Text style={[styles.widgetTitle, { marginBottom: 9 }]}>Mensajes</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                    {activeUser?.avatar ? (
                      <Image source={{ uri: activeUser.avatarBase64 || activeUser.avatar }} style={styles.avatarMensajes} />
                    ) : (
                      <Image source={require('@/assets/images/ProfilePicture.png')} style={styles.avatarMensajes} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }} numberOfLines={1}>{activeUser?.name || 'Usuario'}</Text>
                    <Text style={styles.widgetSubtitle}>Ayer</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            {/* Storage Widget */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.widgetTouchable}
              onPress={() => {
                setFocusArea('welcome_widgets');
                setFocusIndex(7);
              }}
            >
              <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 7) && styles.welcomeWidgetCardFocused]}>
                {/* SPINNING BORDER */}
                {Platform.OS === 'web' &&
                  focusArea === 'welcome_widgets' &&
                  focusIndex === 7 && (
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
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

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
                          width: 300%;
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
                {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 7 && (
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
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <MaterialCommunityIcons name="harddisk" size={13} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.widgetTitle}>Almacenamiento</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <Text style={styles.widgetSubtitle}>
                    <MaterialCommunityIcons name="circle" size={13} color="rgba(255,255,255,0.4)" style={{ marginRight: 5 }} /> Espacio libre
                  </Text>
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>
                    {storageInfo.freeGB > 0 ? `${storageInfo.freeGB.toFixed(1)} GB` : '36.47 GB'}
                  </Text>
                </View>

                <View style={{
                  height: 8,                 // más fina que tu 10 actual
                  borderRadius: 4,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',        // esto redondea automáticamente el segmento izquierdo
                  flexDirection: 'row',
                }}>
                  <View style={{
                    height: '100%',
                    width: `${storageInfo.percent > 0 ? storageInfo.percent : 65}%`,
                    backgroundColor: '#0070D1', // azul - ej: juegos
                  }} />
                  <View style={{
                    height: '100%',
                    width: `${seg2}%`,
                    backgroundColor: '#9B5DE5', // morado - ej: apps
                  }} />
                  <View style={{
                    height: '100%',
                    width: `${seg3}%`,
                    backgroundColor: '#FF8C42', // naranja - ej: multimedia
                  }} />
                  <View style={{
                    height: '100%',
                    width: `${seg4}%`,
                    backgroundColor: '#C2C2C2', // gris - ej: sistema/otros
                    borderTopRightRadius: 4,
                    borderBottomRightRadius: 4, // SOLO el último segmento lleva el redondeo derecho
                  }} />
                </View>
              </View>
            </TouchableOpacity>

            {/* Wishlist Widget */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.widgetTouchable}
              onPress={() => {
                setFocusArea('welcome_widgets');
                setFocusIndex(8);
              }}
            >
              <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 8) && styles.welcomeWidgetCardFocused]}>
                {/* SPINNING BORDER */}
                {Platform.OS === 'web' &&
                  focusArea === 'welcome_widgets' &&
                  focusIndex === 8 && (
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
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

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
                          width: 300%;
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
                {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 8 && (
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
                  <Ionicons name="heart" size={17} color="#ffffff" />
                  <Text style={styles.widgetTitle}>Lista de deseos</Text>
                </View>
                <Text style={styles.widgetSubtitle}>Ver tu lista de deseos</Text>
              </View>
            </TouchableOpacity>

            {/* Background Widget */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.widgetTouchable}
              onPress={() => {
                setFocusArea('welcome_widgets');
                setFocusIndex(9);
                setHomeBgModalVisible(true);
              }}
            >
              <View style={[styles.welcomeWidgetCard, (focusArea === 'welcome_widgets' && focusIndex === 9) && styles.welcomeWidgetCardFocused]}>
                {/* SPINNING BORDER */}
                {Platform.OS === 'web' &&
                  focusArea === 'welcome_widgets' &&
                  focusIndex === 9 && (
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
                          top: -4px;
                          left: -4px;
                          right: -4px;
                          bottom: -5px;
                          border-radius: 15px;
                          z-index: 9999;
                          overflow: visible;

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
                {Platform.OS === 'web' && focusArea === 'welcome_widgets' && focusIndex === 9 && (
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
                  <View style={{ flex: 1 }}>
                    <Text style={styles.widgetTitle}>Cambiar Fondo</Text>
                    <Text style={styles.widgetSubtitle} numberOfLines={1}>Personaliza tu consola</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

export default WelcomeWidgets;
