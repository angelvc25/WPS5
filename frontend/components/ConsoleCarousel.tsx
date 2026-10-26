import { isRetroPlatform } from '@/constants/platforms';
import { useTranslation } from '@/contexts/LanguageContext';
import type { SteamDownloadItem } from '@/hooks/useSteamDownloads';
import { getSteamAppId, isSteamGame } from '@/services/steamLaunchService';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { ConsoleItem } from '../app/(tabs)/index';
import AnimatedCardWrapper from './AnimatedCardWrapper';
import SpinningBorder, { SpinningBorderStyles } from './SpinningBorderConic';


interface ConsoleCarouselProps {
  currentData: ConsoleItem[];
  activeIndex: number;
  prevActiveIndex?: number;
  carouselKey: number;
  lastPlayedGame: ConsoleItem | null;
  focusArea: string;
  isContextMenuOpen: boolean;
  activeCardRef: React.RefObject<View | null>;
  activeCardReady: SharedValue<boolean>;
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
  collapseAnim: SharedValue<number>;
  downloadsByAppId?: Map<string, SteamDownloadItem>;
  isLaunching?: boolean;
}

// Las portadas de Steam son URLs remotas (steamcdn / steamgriddb) mientras que
// el resto de tarjetas usan require() locales. Sin cachePolicy ni recyclingKey,
// expo-image re-resuelve la imagen remota en cada render y aplica su fundido
// por defecto, lo que se percibe como un tirón justo durante la animación de
// scale. Con caché en memoria/disco + recycling por id + sin transición, la
// textura ya está lista cuando arranca el scale. Se memoiza para que los
// re-renders del padre (p. ej. polls de descarga) no toquen la imagen si su
// source no cambió: todas las props son primitivas para que React.memo sea
// efectivo.
const CarouselCardImage = React.memo(function CarouselCardImage({
  source,
  itemId,
  size,
  isActive,
}: {
  source: any;
  itemId: string;
  size: number;
  isActive: boolean;
}) {
  const normalizedSource = React.useMemo(
    () => (typeof source === 'string' ? { uri: source } : source),
    [source]
  );
  const style = React.useMemo(
    () => [styles.card, isActive && styles.cardActive, { width: size, height: size }],
    [isActive, size]
  );
  return (
    <Image
      source={normalizedSource}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={itemId}
      transition={0}
      priority={isActive ? 'high' : 'low'}
    />
  );
});

const renderPlatformBadge = (item: ConsoleItem, lastPlayedGame: ConsoleItem | null) => {
  const platformSource = item.isLastPlayed ? (lastPlayedGame ?? item) : item;
  const steamGame = isSteamGame(platformSource as any);
  const platformId = platformSource.platform || (steamGame ? 'Steam' : 'PC');
  const isRetro =
    platformId === 'Retro' ||
    Boolean((platformSource as any).retroSystem) ||
    isRetroPlatform(platformId);
  const isPS3 = platformId === 'PS3';
  const isPS5 = !isRetro && (platformId === 'PS5' || platformId === 'PS1' || platformId === 'PS2' || platformId === 'PS4' || platformId === 'PC');
  const isXbox = platformId === 'Xbox';
  const isSwitch = platformId === 'Switch';
  const badgeLabel = isRetro
    ? ((platformSource as any).retroSystem?.trim() || platformId)
    : platformId;

  const isEpicGame = platformId === 'Epic';
  const platformBgColor = isEpicGame
    ? '#000000'
    : steamGame
      ? 'rgba(2, 15, 36, 1)'
      : isPS3
        ? 'rgba(0, 0, 0, 1)'
        : isXbox
          ? 'rgba(88, 151, 69, 1)'
          : isSwitch
            ? 'rgba(255, 40, 40, 1)'
            : isRetro
              ? 'rgba(175, 202, 21, 1)'
              : 'white';

  return (
    <View style={[styles.platformBadge, { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 }]}>
      {steamGame ? (
        <Image
          source={require('@/assets/images/SteamBadge.png')}
          style={styles.platformBadgeImage}
          contentFit="contain"
        />
      ) : isEpicGame ? (
        <Image
          source={require('@/assets/images/EpicBadge.png')}
          style={styles.platformBadgeImage}
          contentFit="contain"
        />
      ) : isPS3 ? (
        <View style={[styles.platformBadge, { backgroundColor: platformBgColor }]}>
          <Text style={{
            color: '#ffffffff',
            fontFamily: 'SSTBadge',
            fontSize: 13,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {badgeLabel}
          </Text>
        </View>
      ) : isXbox ? (
        <View style={[styles.platformBadge, { backgroundColor: platformBgColor }]}>
          <Image
            source={require('@/assets/images/XboxBadgeWhite.png')}
            style={styles.platformBadgeImage2}
            contentFit="contain"
          />
        </View>
      ) : isSwitch ? (
        <View style={[styles.platformBadge, { backgroundColor: platformBgColor }]}>
          <Image
            source={require('@/assets/images/SwitchBadge.png')}
            style={styles.platformBadgeImage2}
            contentFit="contain"
          />
        </View>
      ) : isRetro ? (
        <View style={[styles.platformRow, { backgroundColor: platformBgColor }]}>
          <Image
            source={require('@/assets/images/retroBadge.png')}
            style={styles.platformBadgeImage3}
            contentFit="contain"
          />
          <Text style={[styles.platformBadgeText, { fontFamily: 'SSTMediumIt', fontSize: 14, color: 'white' }]}>
            {badgeLabel}
          </Text>
        </View>
      ) : (
        <View style={styles.platformBadge}>
          <Text style={styles.platformBadgeText}>
            {badgeLabel}
          </Text>
        </View>
      )}
    </View>
  );
};

interface CarouselCardItemProps {
  item: ConsoleItem;
  index: number;
  isActive: boolean;
  carouselKey: number;
  CARD_SIZE: number;
  focusArea: string;
  isContextMenuOpen: boolean;
  setIsContextMenuOpen: (open: boolean) => void;
  openContextMenu: () => void;
  handleAppPress: (index: number, item: ConsoleItem) => void;
  activeCardRef: React.RefObject<View | null>;
  activeCardReady: SharedValue<boolean>;
  lastPlayedGame: ConsoleItem | null;
  downloadsByAppId?: Map<string, SteamDownloadItem>;
  favoriteMedia: ConsoleItem[];
  favoriteGames: ConsoleItem[];
  spinningBorderContainerStyle: any;
  spinningBorderStyle: any;
  activeImageStyle: any;
  inactiveImageStyle: any;
  titleText: string;
}

const CarouselCardItem = React.memo(function CarouselCardItem({
  item,
  index,
  isActive,
  carouselKey,
  CARD_SIZE,
  focusArea,
  isContextMenuOpen,
  setIsContextMenuOpen,
  openContextMenu,
  handleAppPress,
  activeCardRef,
  activeCardReady,
  lastPlayedGame,
  downloadsByAppId,
  favoriteMedia,
  favoriteGames,
  spinningBorderContainerStyle,
  spinningBorderStyle,
  activeImageStyle,
  inactiveImageStyle,
  titleText,
}: CarouselCardItemProps) {
  const isHomeCard = item.id === '1';
  const isStoreCard = item.id === '5';

  const customOpacity = isHomeCard
    ? (isActive ? 0.9 : 0.9)
    : isStoreCard
      ? (isActive ? 0.9 : 0.9)
      : 1;

  let cardContent: React.ReactNode;

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
          <Animated.View style={isActive ? activeImageStyle : inactiveImageStyle}>
            {libraryContent}
          </Animated.View>
          {isActive && focusArea === 'main_carousel' && (
            <Animated.View style={[spinningBorderContainerStyle, spinningBorderStyle]}>
              <SpinningBorder size={CARD_SIZE} />
            </Animated.View>
          )}
        </TouchableOpacity>
      </AnimatedCardWrapper>
    );
  } else if (item.isGrid) {
    cardContent = (
      <AnimatedCardWrapper key={`grid-${carouselKey}`} isActive={isActive} style={{ opacity: customOpacity }} entryIndex={index}>
        <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
          <View style={[styles.card, styles.folderCard, isActive && styles.cardActive, { width: CARD_SIZE, height: CARD_SIZE }]}>
            <View style={styles.folderCardHeader}>
              <MaterialCommunityIcons name="view-grid" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.folderCardTitle}> Media</Text>
            </View>
            <View style={styles.folderCardContent}>
              {favoriteMedia.length === 0 ? (
                <Ionicons name="apps-outline" size={28} color="rgba(255,255,255,0.2)" />
              ) : favoriteMedia.length === 1 ? (
                <Image source={favoriteMedia[0].image} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={0} />
              ) : (
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                  {favoriteMedia.slice(0, 4).map((f, fi) => (
                    <Image key={fi} source={f.image} style={{ width: '50%', height: '50%' }} contentFit="cover" />
                  ))}
                </View>
              )}
            </View>
          </View>
          {isActive && focusArea === 'main_carousel' && (
            <Animated.View style={[spinningBorderContainerStyle, spinningBorderStyle]}>
              <SpinningBorder size={CARD_SIZE} />
            </Animated.View>
          )}
        </TouchableOpacity>
      </AnimatedCardWrapper>
    );
  } else if (item.isFolder) {
    cardContent = (
      <AnimatedCardWrapper key={`folder-${carouselKey}`} isActive={isActive} entryIndex={index}>
        <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
          <View style={[styles.card, styles.folderCard, isActive && styles.cardActive, { width: CARD_SIZE, height: CARD_SIZE }]}>
            <View style={styles.folderCardHeader}>
              <Ionicons name="heart" size={14} color="rgba(255,100,100,0.9)" />
              <Text style={styles.folderCardTitle}> Favs</Text>
            </View>
            <View style={styles.folderCardContent}>
              {favoriteGames.length === 0 ? (
                <Ionicons name="star-outline" size={28} color="rgba(255,255,255,0.2)" />
              ) : favoriteGames.length === 1 ? (
                <Image source={favoriteGames[0].image} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={0} />
              ) : (
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                  {favoriteGames.slice(0, 4).map((f, fi) => (
                    <Image key={fi} source={f.image} style={{ width: '50%', height: '50%' }} contentFit="cover" />
                  ))}
                </View>
              )}
            </View>
          </View>
          {isActive && focusArea === 'main_carousel' && (
            <Animated.View style={[spinningBorderContainerStyle, spinningBorderStyle]}>
              <SpinningBorder size={CARD_SIZE} />
            </Animated.View>
          )}
        </TouchableOpacity>
      </AnimatedCardWrapper>
    );
  } else if (item.isLastPlayed && !lastPlayedGame) {
    cardContent = (
      <AnimatedCardWrapper key={`lp-${carouselKey}`} isActive={isActive} style={{ opacity: customOpacity }} entryIndex={index}>
        <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
          <BlurView intensity={30} tint="dark" style={[styles.card, styles.emptyCard, isActive && styles.cardActive, { width: CARD_SIZE, height: CARD_SIZE }]}>
            <MaterialCommunityIcons name="history" size={32} color={isActive ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)"} />
          </BlurView>
          {isActive && focusArea === 'main_carousel' && (
            <Animated.View style={[spinningBorderContainerStyle, spinningBorderStyle]}>
              <SpinningBorder size={CARD_SIZE} />
            </Animated.View>
          )}
        </TouchableOpacity>
      </AnimatedCardWrapper>
    );
  } else {
    const imgSource = item.isLastPlayed ? (lastPlayedGame?.image ?? item.image) : item.image;
    const itemAppId = getSteamAppId(item as any);
    const download = itemAppId ? downloadsByAppId?.get(itemAppId) : undefined;
    const showMiniProgress = !!download && !isActive;

    const cardImage = (
      <View>
        <CarouselCardImage
          source={imgSource}
          itemId={String(item.id)}
          size={CARD_SIZE}
          isActive={isActive}
        />
        {showMiniProgress && (
          <View style={styles.miniProgressTrack} pointerEvents="none">
            <View style={[styles.miniProgressFill, { width: `${Math.max(2, Math.round(download!.percent))}%` }]} />
          </View>
        )}
      </View>
    );

    cardContent = (
      <AnimatedCardWrapper key={`${item.id}-${carouselKey}`} isActive={isActive} style={{ opacity: customOpacity }} entryIndex={index}>
        <TouchableOpacity onPress={() => handleAppPress(index, item)} activeOpacity={0.9}>
          <Animated.View style={isActive ? activeImageStyle : inactiveImageStyle}>
            {cardImage}
          </Animated.View>
          {isActive && focusArea === 'main_carousel' && (
            <Animated.View style={[spinningBorderContainerStyle, spinningBorderStyle]}>
              <SpinningBorder size={CARD_SIZE} />
            </Animated.View>
          )}
        </TouchableOpacity>
      </AnimatedCardWrapper>
    );
  }

  return (
    <View
      ref={isActive ? (activeCardRef as any) : null}
      key={item.id}
      onLayout={() => {
        if (isActive) {
          activeCardReady.value = true;
        }
      }}
      style={{
        position: 'relative',
        overflow: 'visible',
        zIndex: isActive ? 10 : 1,
        opacity: customOpacity,
      }}
    >
      {cardContent}
      {isActive && (
        <Animated.View
          style={[
            styles.activeLabelContainer,
            {
              top: CARD_SIZE,
              left: Math.round(CARD_SIZE * 1.46) + 20,
            },
          ]}
          entering={FadeIn.delay(350).duration(450)}
        >
          {item.id !== '1' &&
            item.id !== '5' &&
            item.id !== 'more_library' &&
            renderPlatformBadge(item, lastPlayedGame)}

          <Text
            style={[
              styles.activeGameTitle,
              { fontSize: Math.round(CARD_SIZE * 0.23) },
            ]}
            numberOfLines={1}
          >
            {titleText}
          </Text>

          {/* Options button to open context menu via mouse/click */}
          <TouchableOpacity
            activeOpacity={0.7}
            style={{
              marginLeft: 6,
              paddingHorizontal: 4,
              display: 'none',
            }}
            onPress={() => {
              if (isContextMenuOpen) {
                setIsContextMenuOpen(false);
              } else {
                openContextMenu();
              }
            }}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={14}
              color="#FFF"
            />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}, (prev, next) => {
  if (prev.isActive !== next.isActive) return false;
  if (next.isActive) {
    if (prev.focusArea !== next.focusArea) return false;
    if (prev.isContextMenuOpen !== next.isContextMenuOpen) return false;
    if (prev.titleText !== next.titleText) return false;
  }
  if (prev.item !== next.item) return false;
  if (prev.CARD_SIZE !== next.CARD_SIZE) return false;
  if (prev.carouselKey !== next.carouselKey) return false;
  if (prev.item.isLastPlayed && prev.lastPlayedGame !== next.lastPlayedGame) return false;
  if (prev.item.isGrid && prev.favoriteMedia !== next.favoriteMedia) return false;
  if (prev.item.isFolder && prev.favoriteGames !== next.favoriteGames) return false;

  const prevAppId = getSteamAppId(prev.item as any);
  const nextAppId = getSteamAppId(next.item as any);
  if (prevAppId || nextAppId) {
    const prevDl = prevAppId ? prev.downloadsByAppId?.get(prevAppId) : undefined;
    const nextDl = nextAppId ? next.downloadsByAppId?.get(nextAppId) : undefined;
    if (prevDl !== nextDl) return false;
  }
  return true;
});

const ConsoleCarouselComponent = ({
  currentData,
  activeIndex,
  prevActiveIndex = -1,
  carouselKey,
  lastPlayedGame,
  focusArea,
  isContextMenuOpen,
  activeCardRef,
  activeCardReady,
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
  downloadsByAppId,
  isLaunching = false,
}: ConsoleCarouselProps) => {
  const { t } = useTranslation();

  const favoriteMedia = React.useMemo(() => media.filter(m => m.isFavorite), [media]);
  const favoriteGames = React.useMemo(() => games.filter(g => g.isFavorite), [games]);

  const activeImageStyle = useAnimatedStyle(() => ({
    opacity: 1 - collapseAnim.value,
  }));

  const inactiveImageStyle = useAnimatedStyle(() => ({
    opacity: 1,
  }));

  // Spinning border transition:
  // - Fades out when leaving, fades in when entering.
  // - Al seleccionar/lanzar el juego: se expande hacia afuera (scale 1 -> 1.35) y desaparece (opacity 1 -> 0).
  const spinningBorderOpacity = useSharedValue(1);
  const spinningBorderScale = useSharedValue(1);
  const prevActiveIndexRef = React.useRef(prevActiveIndex);
  const spinTimeoutRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (isLaunching || isContextMenuOpen) {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
      spinningBorderScale.value = withTiming(1.15, { duration: 320, easing: Easing.out(Easing.cubic) });
      spinningBorderOpacity.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) });
    } else {
      spinningBorderScale.value = withTiming(1, { duration: 250 });
      spinningBorderOpacity.value = withTiming(1, { duration: 250 });
    }
  }, [isLaunching, isContextMenuOpen]);

  React.useEffect(() => {
    if (isLaunching || isContextMenuOpen) return;
    if (prevActiveIndexRef.current !== activeIndex && prevActiveIndexRef.current !== -1) {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
      spinningBorderScale.value = 1;
      spinningBorderOpacity.value = withTiming(0, { duration: 150 });
      spinTimeoutRef.current = setTimeout(() => {
        spinningBorderOpacity.value = withTiming(1, { duration: 250 });
      }, 90);
    }
    prevActiveIndexRef.current = activeIndex;
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, [activeIndex, isLaunching, isContextMenuOpen]);

  const spinningBorderStyle = useAnimatedStyle(() => ({
    opacity: spinningBorderOpacity.value,
    transform: [{ scale: spinningBorderScale.value }],
  }));

  // Container style for the spinning border wrapper - ensures proper positioning context
  const spinningBorderContainerStyle = React.useMemo(() => ({
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    pointerEvents: 'none' as const,
  }), []);

  // Precalienta el arte y el fondo de las tarjetas vecinas (±2) cada vez que
  // se mueve el foco: cuando el usuario llega a un juego Steam, su portada y
  // su héroe ya están en caché y ni el scale ni el crossfade sufren tirones.
  // Fire-and-forget con Set deduplicado: no re-descarga lo ya pedido.
  const prefetchedUrisRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const warm: string[] = [];
    const pushSource = (src: any) => {
      const uri = typeof src === 'string' ? src : (src?.uri ? String(src.uri) : null);
      if (uri && /^https?:\/\//.test(uri)) warm.push(uri);
    };
    for (let i = Math.max(0, activeIndex - 2); i <= Math.min(currentData.length - 1, activeIndex + 2); i++) {
      if (i === activeIndex) continue;
      const item = currentData[i];
      if (!item) continue;
      pushSource(item.isLastPlayed ? (lastPlayedGame?.image ?? item.image) : item.image);
      pushSource(item.isLastPlayed ? lastPlayedGame?.backgroundImage : (item as any).backgroundImage);
    }
    const toPrefetch = [...new Set(warm)].filter(uri => !prefetchedUrisRef.current.has(uri)).slice(0, 8);
    toPrefetch.forEach((uri) => {
      prefetchedUrisRef.current.add(uri);
      Image.prefetch(uri).catch(() => { });
    });
  }, [activeIndex, currentData, lastPlayedGame]);

  if (currentData.length === 0) {
    return (
      <View style={styles.mediaEmptyContainer}>
        <Ionicons name="film-outline" size={80} color="rgba(255,255,255,0.15)" />
        <Text style={styles.mediaEmptyText}>No hay aplicaciones de multimedia</Text>
      </View>
    );
  }

  return (
    <>
      <SpinningBorderStyles />
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
          const titleText = item.id === 'more_library'
            ? t('library.title')
            : item.isLastPlayed
              ? (lastPlayedGame?.title || t('lastPlayed.title'))
              : item.title;

          return (
            <CarouselCardItem
              key={item.id}
              item={item}
              index={index}
              isActive={isActive}
              carouselKey={carouselKey}
              CARD_SIZE={CARD_SIZE}
              focusArea={focusArea}
              isContextMenuOpen={isContextMenuOpen}
              setIsContextMenuOpen={setIsContextMenuOpen}
              openContextMenu={openContextMenu}
              handleAppPress={handleAppPress}
              activeCardRef={activeCardRef}
              activeCardReady={activeCardReady}
              lastPlayedGame={lastPlayedGame}
              downloadsByAppId={downloadsByAppId}
              favoriteMedia={favoriteMedia}
              favoriteGames={favoriteGames}
              spinningBorderContainerStyle={spinningBorderContainerStyle}
              spinningBorderStyle={spinningBorderStyle}
              activeImageStyle={activeImageStyle}
              inactiveImageStyle={inactiveImageStyle}
              titleText={titleText}
            />
          );
        })}
      </ScrollView>
    </>
  );
};

export const ConsoleCarousel = React.memo(ConsoleCarouselComponent);

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
    backgroundColor: 'white',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 5,
    marginLeft: 2,
    marginTop: 8,
    marginBottom: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformBadgeText: {
    color: '#000000ff',
    fontFamily: 'SSTBadge',
    fontSize: 13,
  },
  steamPlatformContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  steamPlatformIcon: {
    marginRight: 6,
  },

  steamPlatformBadgeText: {
    color: '#000000',
    // Cambia esta fuente por la que quieras utilizar para Steam
    fontFamily: 'SSTBoldIt',
    fontSize: 13,
  },
  platformBadgeImage: {
    width: 55,
    height: 30,
    marginTop: 6,
    marginBottom: 2,
    backgroundColor: 'black',
    borderRadius: 4,
  },
  platformBadgeImage2: {
    width: 60,
    height: 24,
    marginTop: 4,
  },
  platformBadgeImage3: {
    width: 30,
    height: 24,
    marginBottom: 6,
  },
  platformRow: {
    backgroundColor: 'white',
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    height: 30,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 5,
    marginLeft: 2,
    marginBottom: 5,
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
  miniProgressTrack: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});

export default ConsoleCarousel;
