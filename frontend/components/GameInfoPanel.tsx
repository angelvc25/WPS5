import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import MusicPlayerCard from './MusicPlayerCard';
import { ConsoleItem } from '../app/(tabs)/index';
import { getGameActionLabel } from '../services/steamLaunchService';

interface GameInfoPanelProps {
  activeItem: ConsoleItem;
  activeIndex: number;
  lastPlayedGame: ConsoleItem | null;
  focusArea: string;
  gamePanelFocusIndex: number;
  setGamePanelFocusIndex: (index: number) => void;
  setFocusArea: (area: any) => void;
  handleLaunchApp: (item: ConsoleItem) => void;
  setSelectedItem: (item: ConsoleItem) => void;
  setDetailVisible: (visible: boolean) => void;
  steamMedia: any[];
  mediaLoading: boolean;
  setSelectedMediaIndex: (index: number | null) => void;
  steamNews: any[];
  newsLoading: boolean;
  activeUser: any;
  windowWidth: number;
  windowHeight: number;

  // Animated Styles passed from parent
  gameInfoPanelStyle: any;
  spacerStyle: any;
  infoCardsStyle: any;
  topPanelStyle: any;
  installedSteamAppIds?: Set<string> | null;
}

export const GameInfoPanel = ({
  activeItem,
  activeIndex,
  lastPlayedGame,
  focusArea,
  gamePanelFocusIndex,
  setGamePanelFocusIndex,
  setFocusArea,
  handleLaunchApp,
  setSelectedItem,
  setDetailVisible,
  steamMedia,
  mediaLoading,
  setSelectedMediaIndex,
  steamNews,
  newsLoading,
  activeUser,
  windowWidth,
  windowHeight,
  gameInfoPanelStyle,
  spacerStyle,
  infoCardsStyle,
  topPanelStyle,
  installedSteamAppIds = null,
}: GameInfoPanelProps) => {
  const displayTitle = activeItem?.isLastPlayed ? (lastPlayedGame ? lastPlayedGame.title : 'Último Jugado') : activeItem?.title;
  const displayLogo = activeItem?.isLastPlayed ? lastPlayedGame?.logo : activeItem?.logo;
  const canPlay = activeItem && !activeItem.isFolder && !activeItem.isGrid && activeItem.id !== '1' && activeItem.id !== 'more_library';
  const isSpotify = activeItem?.title?.toLowerCase()?.includes('spotify');

  const mediaScrollRef = React.useRef<ScrollView>(null);
  const newsScrollRef = React.useRef<ScrollView>(null);
  const scrollDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (focusArea !== 'game_panel') return;

    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current);
    }

    scrollDebounceRef.current = setTimeout(() => {
      if (gamePanelFocusIndex >= 100) {
        const idx = gamePanelFocusIndex - 100;
        mediaScrollRef.current?.scrollTo({ x: idx * 516, animated: true });
      } else if (gamePanelFocusIndex >= 4) {
        const idx = gamePanelFocusIndex - 4;
        newsScrollRef.current?.scrollTo({ x: idx * 336, animated: true });
      }
    }, 80);

    return () => {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
      }
    };
  }, [gamePanelFocusIndex, focusArea]);

  const buttonLabel = getGameActionLabel(activeItem, installedSteamAppIds);

  return (
    <Animated.View style={[styles.gameInfoPanel, gameInfoPanelStyle]}>
      <Animated.View style={spacerStyle}>
        <Animated.View style={topPanelStyle}>
          {/* Logo or title */}
          {displayLogo ? (
            <Animated.View key={`logo-${activeIndex}`} entering={FadeInDown.duration(400)}>
              <Image source={displayLogo} style={styles.gameLogo} contentFit="contain" />
            </Animated.View>
          ) : (
            <Animated.View key={`title-${activeIndex}`} entering={FadeInDown.duration(400)}>
              {activeItem?.id !== '1' && (
                <Text style={styles.gameTitle} numberOfLines={2}>{displayTitle}</Text>
              )}
            </Animated.View>
          )}

          {/* Action Buttons */}
          {canPlay && (
            <Animated.View key={`buttons-${activeIndex}`} entering={FadeInDown.duration(400).delay(60)} style={styles.actionButtons}>
              <TouchableOpacity
                id="play-btn"
                style={[
                  styles.playBtn,
                  focusArea === 'game_panel' && gamePanelFocusIndex === 0 && styles.playBtnFocused
                ]}
                activeOpacity={0.85}
                onPress={() => {
                  if (activeItem) { handleLaunchApp(activeItem); }
                }}
              >
                <Text style={[
                  styles.playBtnText,
                  focusArea === 'game_panel' && gamePanelFocusIndex === 0 && styles.playBtnTextFocused
                ]}>
                  {buttonLabel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="more-btn"
                style={[
                  styles.moreBtn,
                  focusArea === 'game_panel' && gamePanelFocusIndex === 1 && styles.moreBtnFocused
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  if (activeItem) {
                    const target = activeItem.isLastPlayed ? lastPlayedGame : activeItem;
                    if (target) {
                      setSelectedItem(target);
                      setDetailVisible(true);
                    } else {
                      alert('Aún no has jugado a ningún juego.');
                    }
                  }
                }}
              >
                <Text style={[
                  styles.moreBtnText,
                  focusArea === 'game_panel' && gamePanelFocusIndex === 1 && styles.moreBtnTextFocused
                ]}>···</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>

      {/* Info Cards (Trophies & Friends) */}
      {canPlay && (
        <Animated.View
          key={`cards-${activeIndex}`}
          entering={FadeInDown.duration(400).delay(120)}
          style={[styles.infoCardsRow, infoCardsStyle]}
        >
          {/* Trophies Card */}
          <View
            style={[
              styles.infoCard,
              focusArea === 'game_panel' &&
              gamePanelFocusIndex === 2 &&
              styles.infoCardFocused,
            ]}
          >
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
                  opacity: (focusArea === 'game_panel' && gamePanelFocusIndex === 2) ? 1 : 0,
                  transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            )}

            {/* SHIMMER */}
            {Platform.OS === 'web' &&
              focusArea === 'game_panel' &&
              gamePanelFocusIndex === 2 && (
                <div
                  className="widget-shimmer-line"
                  style={{
                    animationDuration: '7s',
                    opacity: 0.8,
                  }}
                />
              )}

            {/* CONTENIDO */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 12,
                gap: 25,
                zIndex: 2,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Image
                  source={require('@/assets/images/platino.png')}
                  style={{
                    width: 28,
                    height: 28,
                    resizeMode: 'contain',
                  }}
                />
                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 15 }}>
                  1
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Image
                  source={require('@/assets/images/oro.png')}
                  style={{
                    width: 28,
                    height: 28,
                    resizeMode: 'contain',
                  }}
                />
                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 15 }}>
                  3
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Image
                  source={require('@/assets/images/plata.png')}
                  style={{
                    width: 28,
                    height: 28,
                    resizeMode: 'contain',
                  }}
                />
                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 15 }}>
                  16
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Image
                  source={require('@/assets/images/bronce.png')}
                  style={{
                    width: 28,
                    height: 28,
                    resizeMode: 'contain',
                  }}
                />
                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 15 }}>
                  17
                </Text>
              </View>
            </View>

            <View style={{ zIndex: 2 }}>
              <Text
                style={{
                  color: '#FFF',
                  fontSize: 16,
                  fontWeight: 'bold',
                  marginBottom: 4,
                }}
              >
                Trofeos
              </Text>

              <Text style={{ color: '#ddddddff', fontSize: 17 }}>
                37 conseguidos
              </Text>
            </View>
          </View>

          {/* Friends Playing Card */}
          <View
            style={[
              styles.infoCard,
              focusArea === 'game_panel' &&
              gamePanelFocusIndex === 3 &&
              styles.infoCardFocused,
            ]}
          >
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
                  opacity: (focusArea === 'game_panel' && gamePanelFocusIndex === 3) ? 1 : 0,
                  transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                  backdropFilter: 'blur(2px)',
                }}
              />
            )}

            {/* SHIMMER */}
            {Platform.OS === 'web' &&
              focusArea === 'game_panel' &&
              gamePanelFocusIndex === 3 && (
                <div
                  className="widget-shimmer-line"
                  style={{
                    animationDuration: '7s',
                    opacity: 0.8,
                  }}
                />
              )}

            {/* CONTENIDO */}
            <View style={{ flexDirection: 'row', marginBottom: 12, zIndex: 2 }}>
              <Image
                source={require('@/assets/images/amigos.png')}
                style={{
                  width: 35,
                  height: 35,
                  resizeMode: 'contain',
                }}
              />
            </View>

            <View style={{ zIndex: 2 }}>
              <Text
                style={{
                  color: '#FFF',
                  fontSize: 16,
                  fontWeight: 'bold',
                  marginBottom: 4,
                }}
              >
                Amigos que juegan
              </Text>

              <Text style={{ color: '#ddddddff', fontSize: 17 }}>
                5 amigos tienen este juego
              </Text>
            </View>
          </View>

          {/* Music Player Card (only visible on media/spotify) */}
          {(activeItem?.type === 'media' || isSpotify) && (
            <MusicPlayerCard
              isFocused={focusArea === 'game_panel' && gamePanelFocusIndex === 4}
            />
          )}
        </Animated.View>
      )}

      {/* Phrase for media/spotify items */}
      {canPlay && (activeItem?.type === 'media' || isSpotify) && (
        <Animated.View
          key={`phrase-${activeIndex}`}
          entering={FadeInDown.duration(400).delay(120)}
          style={{ marginTop: 20, paddingHorizontal: 50, alignItems: 'flex-start' }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, fontStyle: 'italic' }}>
            La música es el fondo perfecto para cada aventura.
          </Text>
        </Animated.View>
      )}

      {/* Screenshots and Trailers row */}
      {canPlay && !(activeItem?.type === 'media' || isSpotify) && (
        <View style={[styles.newsSectionWrapper, { width: windowWidth }]}>
          <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '500', marginBottom: 16, paddingLeft: 50 }}>Capturas y trailers</Text>

          {mediaLoading ? (
            <View style={[styles.newsLoadingRow, { paddingLeft: 50 }]}>
              <MaterialCommunityIcons name="loading" size={16} color="rgba(255,255,255,0.3)" />
              <Text style={styles.newsEmptyText}>Cargando capturas...</Text>
            </View>
          ) : steamMedia.length === 0 ? (
            <View style={[styles.newsLoadingRow, { paddingLeft: 50 }]}>
              <Ionicons name="images-outline" size={14} color="rgba(255,255,255,0.25)" />
              <Text style={styles.newsEmptyText}>No hay capturas disponibles en Steam</Text>
            </View>
          ) : (
            <ScrollView
              ref={mediaScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.newsScrollContent, { paddingLeft: 50, paddingRight: 50 }]}
            >
              {steamMedia.map((item, idx) => {
                const isMediaFocused = focusArea === 'game_panel' && gamePanelFocusIndex === 100 + idx;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.newsCard, isMediaFocused && styles.newsCardFocused]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setGamePanelFocusIndex(100 + idx);
                      setSelectedMediaIndex(idx);
                    }}
                  >
                    {/* DEGRADADO NEGRO (al estar enfocadas) */}
                    {Platform.OS === 'web' && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.85) 100%)',
                          pointerEvents: 'none',
                          zIndex: 1,
                          opacity: isMediaFocused ? 1 : 0,
                          transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                      />
                    )}

                    {/* SHIMMER (al estar enfocadas) */}
                    {Platform.OS === 'web' && isMediaFocused && (
                      <div
                        className="widget-shimmer-line"
                        style={{
                          animationDuration: '7s',
                          opacity: 0.8,
                        }}
                      />
                    )}
                    {/* Thumbnail */}
                    <View style={styles.newsCardThumbnail}>
                      <Image
                        source={{ uri: item.thumbnail }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                      {/* Play badge para trailers */}
                      {item.type === 'movie' && (
                        <View style={styles.mediaPlayBadge}>
                          <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.92)" />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* Steam News row */}
      {canPlay && !(activeItem?.type === 'media' || isSpotify) && (
        <View style={[styles.newsSectionWrapper, { width: windowWidth }]}>
          <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '500', marginBottom: 16, paddingLeft: 50 }}>Últimas noticias</Text>

          {newsLoading ? (
            <View style={[styles.newsLoadingRow, { paddingLeft: 50 }]}>
              <MaterialCommunityIcons name="loading" size={16} color="rgba(255,255,255,0.3)" />
              <Text style={styles.newsEmptyText}>Buscando contenido...</Text>
            </View>
          ) : steamNews.length === 0 ? (
            <View style={[styles.newsLoadingRow, { paddingLeft: 50 }]}>
              <Ionicons name="newspaper-outline" size={14} color="rgba(255,255,255,0.25)" />
              <Text style={styles.newsEmptyText}>No hay noticias disponibles</Text>
            </View>
          ) : (
            <ScrollView
              ref={newsScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.newsScrollContent, { paddingLeft: 50, paddingRight: 50 }]}
            >
              {steamNews.slice(0, 8).map((news, idx) => {
                const isNewsFocused = focusArea === 'game_panel' && gamePanelFocusIndex === 4 + idx;
                const fallbackItem = activeItem?.isLastPlayed ? lastPlayedGame : activeItem;
                return (
                  <TouchableOpacity
                    key={news.gid}
                    style={[styles.newsCard2, isNewsFocused && styles.newsCardFocused]}
                    activeOpacity={0.8}
                    onPress={() => { if (news.url) Linking.openURL(news.url); }}
                  >
                    {/* DEGRADADO NEGRO (al estar enfocadas) */}
                    {Platform.OS === 'web' && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.85) 100%)',
                          pointerEvents: 'none',
                          zIndex: 1,
                          opacity: isNewsFocused ? 1 : 0,
                          transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                      />
                    )}

                    {/* SHIMMER (al estar enfocadas) */}
                    {Platform.OS === 'web' && isNewsFocused && (
                      <div
                        className="widget-shimmer-line"
                        style={{
                          animationDuration: '7s',
                          opacity: 0.8,
                        }}
                      />
                    )}
                    <View style={styles.newsCardThumbnail}>
                      <Image
                        source={
                          news.image_url
                            ? { uri: news.image_url }
                            : (fallbackItem?.backgroundImage ?? fallbackItem?.image ?? require('@/assets/images/FondoDefault2.jpg'))
                        }
                        style={{ width: '100%', height: '100%', opacity: news.image_url ? 1 : 0.4 }}
                        contentFit="cover"
                      />
                    </View>
                    <View style={styles.newsCardContent}>
                      <Text style={styles.newsCardTitle} numberOfLines={1}>{news.title}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  gameInfoPanel: {
    paddingLeft: 150,
    paddingTop: 1,
    maxWidth: '100%' as any,
  },
  gameLogo: {
    width: 460,
    height: 220,
    marginBottom: 15,
  },
  gameTitle: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '300',
    letterSpacing: -0.5,
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  playBtn: {
    backgroundColor: '#9999991c',
    paddingHorizontal: 52,
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    width: 280,
  },
  playBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  moreBtn: {
    backgroundColor: '#9999991c',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  moreBtnText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: -4,
  },
  playBtnFocused: {
    backgroundColor: '#FFFFFF',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: '#FFFFFF',
    outlineOffset: 1,
  } as any,
  playBtnTextFocused: {
    color: '#111111',
  },
  moreBtnFocused: {
    backgroundColor: '#FFFFFF',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: '#FFFFFF',
    outlineOffset: 1,
  } as any,
  moreBtnTextFocused: {
    color: '#111111',
  },
  infoCardsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
    width: '90%',
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgb(38 41 47)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    minWidth: 350,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  } as any,
  infoCardFocused: {
    borderColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1.5,
  } as any,
  newsSectionWrapper: {
    marginTop: 30,
    marginLeft: -50,
  },
  newsScrollContent: {
    gap: 16,
  },
  newsCard: {
    width: 500,
    height: 250,
    borderRadius: 8,
    backgroundColor: 'rgba(20, 20, 30, 0.04)',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  } as any,
  newsCard2: {
    width: 320,
    borderRadius: 8,
    backgroundColor: 'rgba(20,20,30,0.4)',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  } as any,
  newsCardFocused: {
    borderColor: 'rgba(255, 255, 255, 0.49)',
    borderWidth: 2,
    backgroundColor: 'rgba(35,35,45,0.6)',
  } as any,
  newsCardThumbnail: {
    width: '100%',
    height: 281,
    backgroundColor: '#333',
    position: 'relative',
  },
  newsCardContent: {
    padding: 12,
    zIndex: 2,
  },
  newsCardTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 6,
  },
  newsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  newsEmptyText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontStyle: 'italic',
  },
  mediaPlayBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 2,
  },
});

export default GameInfoPanel;