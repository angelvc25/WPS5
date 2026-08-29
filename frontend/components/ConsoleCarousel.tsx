import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, { FadeIn, useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AnimatedCardWrapper from './AnimatedCardWrapper';
import SpinningBorder from './SpinningBorderConic';
import { ConsoleItem } from '../app/(tabs)/index';

interface ConsoleCarouselProps {
  currentData: ConsoleItem[];
  activeIndex: number;
  carouselKey: number;
  lastPlayedGame: ConsoleItem | null;
  focusArea: string;
  isContextMenuOpen: boolean;
  activeCardRef: React.RefObject<View | null>;
  scrollRef: React.RefObject<ScrollView | null>;
  handleAppPress: (index: number, item: ConsoleItem) => void;
  openContextMenu: () => void;
  setIsContextMenuOpen: (open: boolean) => void;
  CARD_SIZE: number;
  ITEM_WIDTH: number;
  LEFT_PADDING: number;
  RIGHT_PADDING: number;
  media: ConsoleItem[];
  games: ConsoleItem[];
  collapseAnim: Animated.SharedValue<number>;
}

export const ConsoleCarousel = ({
  currentData,
  activeIndex,
  carouselKey,
  lastPlayedGame,
  focusArea,
  isContextMenuOpen,
  activeCardRef,
  scrollRef,
  handleAppPress,
  openContextMenu,
  setIsContextMenuOpen,
  CARD_SIZE,
  ITEM_WIDTH,
  LEFT_PADDING,
  RIGHT_PADDING,
  media,
  games,
  collapseAnim,
}: ConsoleCarouselProps) => {
  if (currentData.length === 0) {
    return (
      <View style={styles.mediaEmptyContainer}>
        <Ionicons name="film-outline" size={80} color="rgba(255,255,255,0.15)" />
        <Text style={styles.mediaEmptyText}>No hay aplicaciones de multimedia</Text>
      </View>
    );
  }

  const activeImageStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - collapseAnim.value,
    };
  });

  const inactiveImageStyle = useAnimatedStyle(() => {
    return {
      opacity: 1,
    };
  });

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingLeft: LEFT_PADDING, paddingRight: RIGHT_PADDING, marginTop: 20 }}
      snapToInterval={ITEM_WIDTH}
      snapToAlignment="start"
      decelerationRate="fast"
      scrollEventThrottle={16}
      onLayout={() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({ x: activeIndex * ITEM_WIDTH, animated: false });
        }
      }}
    >
      {currentData.map((item, index) => {
        const isActive = index === activeIndex;
        const isHomeCard = item.id === '1';
        const isStoreCard = item.id === '5';

        const customOpacity =
          isHomeCard
            ? (isActive ? 0.9 : 0.9)
            : isStoreCard
              ? (isActive ? 0.9 : 0.9)
              : 1;

        let cardContent;

        if (item.id === 'more_library') {
          const libraryContent = (
            <BlurView intensity={40} tint="dark" style={[styles.card, styles.moreCard, isActive && styles.cardActive, { overflow: 'hidden', padding: 0, opacity: 0.8, width: CARD_SIZE, height: CARD_SIZE }]}>
              <Image
                source={require('@/assets/images/Libreria.jpeg')}
                style={{
                  width: '100%',
                  height: '100%',
                }}
                resizeMode="cover"
              />
            </BlurView>
          );

          cardContent = (
            <AnimatedCardWrapper key={`more-${carouselKey}`} isActive={isActive} style={{ opacity: 0.75 }} entryIndex={index}>
              <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                {isActive && <SpinningBorder size={CARD_SIZE} />}
                <Animated.View style={isActive ? activeImageStyle : inactiveImageStyle}>
                  {libraryContent}
                </Animated.View>
              </TouchableOpacity>
            </AnimatedCardWrapper>
          );
        } else if (item.isGrid) {
          cardContent = (
            <AnimatedCardWrapper key={`grid-${carouselKey}`} isActive={isActive} style={{ opacity: customOpacity }} entryIndex={index}>
              <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                {isActive && <SpinningBorder size={CARD_SIZE} />}
                <View style={[styles.card, styles.folderCard, isActive && styles.cardActive, { width: CARD_SIZE, height: CARD_SIZE }]}>
                  <View style={styles.folderCardHeader}>
                    <MaterialCommunityIcons name="view-grid" size={14} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.folderCardTitle}> Media</Text>
                  </View>
                  <View style={styles.folderCardContent}>
                    {(() => {
                      const favs = media.filter(m => m.isFavorite);
                      if (favs.length === 0) return <Ionicons name="apps-outline" size={28} color="rgba(255,255,255,0.2)" />;
                      if (favs.length === 1) return <Image source={favs[0].image} style={{ width: '100%', height: '100%' }} contentFit="cover" />;
                      return (
                        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                          {favs.slice(0, 4).map((f, fi) => (
                            <Image key={fi} source={f.image} style={{ width: '50%', height: '50%' }} contentFit="cover" />
                          ))}
                        </View>
                      );
                    })()}
                  </View>
                </View>
              </TouchableOpacity>
            </AnimatedCardWrapper>
          );
        } else if (item.isFolder) {
          cardContent = (
            <AnimatedCardWrapper key={`folder-${carouselKey}`} isActive={isActive} entryIndex={index}>
              <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                {isActive && <SpinningBorder size={CARD_SIZE} />}
                <View style={[styles.card, styles.folderCard, isActive && styles.cardActive, { width: CARD_SIZE, height: CARD_SIZE }]}>
                  <View style={styles.folderCardHeader}>
                    <Ionicons name="heart" size={14} color="rgba(255,100,100,0.9)" />
                    <Text style={styles.folderCardTitle}> Favs</Text>
                  </View>
                  <View style={styles.folderCardContent}>
                    {(() => {
                      const favs = games.filter(g => g.isFavorite);
                      if (favs.length === 0) return <Ionicons name="star-outline" size={28} color="rgba(255,255,255,0.2)" />;
                      if (favs.length === 1) return <Image source={favs[0].image} style={{ width: '100%', height: '100%' }} contentFit="cover" />;
                      return (
                        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                          {favs.slice(0, 4).map((f, fi) => (
                            <Image key={fi} source={f.image} style={{ width: '50%', height: '50%' }} contentFit="cover" />
                          ))}
                        </View>
                      );
                    })()}
                  </View>
                </View>
              </TouchableOpacity>
            </AnimatedCardWrapper>
          );
        } else if (item.isLastPlayed && !lastPlayedGame) {
          cardContent = (
            <AnimatedCardWrapper key={`lp-${carouselKey}`} isActive={isActive} style={{ opacity: customOpacity }} entryIndex={index}>
              <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                {isActive && <SpinningBorder size={CARD_SIZE} />}
                <BlurView intensity={30} tint="dark" style={[styles.card, styles.emptyCard, isActive && styles.cardActive, { width: CARD_SIZE, height: CARD_SIZE }]}>
                  <MaterialCommunityIcons name="history" size={32} color={isActive ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)"} />
                </BlurView>
              </TouchableOpacity>
            </AnimatedCardWrapper>
          );
        } else {
          const imgSource = item.isLastPlayed ? (lastPlayedGame?.image ?? item.image) : item.image;
          const cardImage = (
            <Image source={imgSource} style={[styles.card, isActive && styles.cardActive, { width: CARD_SIZE, height: CARD_SIZE }]} contentFit="cover" />
          );
          cardContent = (
            <AnimatedCardWrapper key={`${item.id}-${carouselKey}`} isActive={isActive} style={{ opacity: customOpacity }} entryIndex={index}>
              <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
                {isActive && <SpinningBorder size={CARD_SIZE} />}
                <Animated.View style={isActive ? activeImageStyle : inactiveImageStyle}>
                  {cardImage}
                </Animated.View>
              </TouchableOpacity>
            </AnimatedCardWrapper>
          );
        }

        return (
          <View
            ref={isActive ? (activeCardRef as any) : null}
            key={item.id}
            style={{ position: 'relative', overflow: 'visible', zIndex: isActive ? 10 : 1, opacity: customOpacity }}
          >
            {cardContent}
            {isActive && (
              <Animated.View style={[styles.activeLabelContainer, { top: CARD_SIZE, left: Math.round(CARD_SIZE * 1.46) + 20 }]} entering={FadeIn.delay(350).duration(450)}>
                {item.id !== '1' && item.id !== '5' && item.id !== 'more_library' && (
                  <View style={styles.platformBadge}>
                    <Image source={require('@/assets/images/PS5.png')}
                      style={{ width: 60, height: 60 }}
                      resizeMode="contain"
                    />
                  </View>
                )}
                <Text style={[styles.activeGameTitle, { fontSize: Math.round(CARD_SIZE * 0.23) }]} numberOfLines={1}>
                  {item.id === 'more_library'
                    ? 'Biblioteca de juegos'
                    : (item.isLastPlayed ? (lastPlayedGame?.title || 'Último Jugado') : item.title)}
                </Text>

                {/* Options button to open context menu via mouse/click */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={{ marginLeft: 6, paddingHorizontal: 4, display: 'none' }}
                  onPress={() => {
                    if (isContextMenuOpen) {
                      setIsContextMenuOpen(false);
                    } else {
                      openContextMenu();
                    }
                  }}
                >
                  <Ionicons name="ellipsis-vertical" size={14} color="#FFF" />
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 120,
    height: 120,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0)',
  },
  cardActive: {
    borderWidth: 3.5,
    borderColor: 'rgba(255, 255, 255, 0)',
    shadowColor: 'rgba(255, 255, 255, 0)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    marginLeft: 12,
    marginRight: 12,
  } as any,
  moreCard: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCard: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderCard: {
    padding: 10,
    overflow: 'hidden',
    width: 120,
    height: 120,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  folderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  folderCardTitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  folderCardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 6,
  },
  activeLabelContainer: {
    position: 'absolute',
    top: 120,
    left: 190,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    minWidth: 500,
  },
  platformBadge: {
    paddingHorizontal: 9,
    paddingVertical: 2,
    marginRight: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeGameTitle: {
    color: '#FFFFFF',
    fontFamily: 'SSTLight',
    fontSize: 30,
    fontWeight: '300',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
    whiteSpace: 'nowrap',
  } as any,
  mediaEmptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 60,
  },
  mediaEmptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
    marginTop: 15,
    fontWeight: '600',
  },
});

export default ConsoleCarousel;
