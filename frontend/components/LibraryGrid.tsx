import React from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ConsoleItem } from '../app/(tabs)/index';
import { useEffect } from 'react';

interface LibraryGridProps {
  games: ConsoleItem[];
  isFocused?: boolean;
  focusedIndex?: number;
  onItemPress?: (index: number, game: ConsoleItem) => void;
}

const COLUMNS = 5;

// ─── SpinningBorder Component (adapted for square/library cards) ──────────────
// Web-only: conic-gradient spinning halo + diagonal shimmer sweep.
// Placed INSIDE the card's TouchableOpacity so it inherits transforms.
const SpinningBorder = ({ id }: { id: string }) => {
  if (Platform.OS !== 'web') return null;

  return (
    <>
      <style>{`
        /* --- SPINNING HALO ANIMATION --- */
        @keyframes lib-spin-border-${id} {
          0%   { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .lib-spinning-inner-${id} {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 300%;
          height: 300%;
          animation: lib-spin-border-${id} 9.8s linear infinite;
          background: conic-gradient(
            from 0deg,
            rgba(255, 255, 255, 0.10) 0%,
            rgba(255, 255, 255, 0.79) 28%,
            rgba(180, 210, 255, 0.86) 33%,
            rgba(220, 235, 255, 0.95) 48%,
            rgba(255, 255, 255, 1.0)  50%,
            rgba(223, 248, 182, 0.95) 52%,
            rgba(180, 210, 255, 0.88) 57%,
            rgba(255, 255, 255, 0.75) 62%,
            rgba(255, 255, 255, 0.10) 100%
          );
          border-radius: 50%;
        }

        /* --- DIAGONAL SHIMMER SWEEP ANIMATION --- */
        @keyframes lib-shimmer-${id} {
          0%   { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
          15%  { opacity: 1; }
          50%  { opacity: 1; }
          70%  { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
        }
        .lib-shimmer-line-${id} {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 140%;
          height: 420%;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(255, 255, 255, 0.01) 20%,
            rgba(255, 255, 255, 0.15) 50%,
            rgba(255, 255, 255, 0.01) 80%,
            transparent 100%
          );
          animation: lib-shimmer-${id} 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
        }
      `}</style>

      {/* LAYER 1: Spinning halo behind the card */}
      <View
        style={{
          position: 'absolute',
          top: 1,
          left: 1,
          right: 1,
          bottom: 1,
          borderRadius: 16,
          zIndex: -1,
          overflow: 'hidden',
        } as any}
        pointerEvents="none"
      >
        {/* @ts-ignore */}
        <div className={`lib-spinning-inner-${id}`} />
      </View>

      {/* LAYER 2: Diagonal shimmer sweep over the card surface */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 16,
          zIndex: 5,
          overflow: 'hidden',
        } as any}
        pointerEvents="none"
      >
        {/* @ts-ignore */}
        <div className={`lib-shimmer-line-${id}`} />
      </View>
    </>
  );
};

export default function LibraryGrid({ games, isFocused = false, focusedIndex = 0, onItemPress }: LibraryGridProps) {
  const { height: windowHeight } = useWindowDimensions();

  if (!games || games.length === 0) {
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyContainer}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <MaterialCommunityIcons name="folder-outline" size={48} color="rgba(255,255,255,0.4)" />
        <Text style={styles.emptyText}>La biblioteca está vacía.</Text>
      </Animated.View>
    );
  }

  const translateY = useSharedValue(0);

  useEffect(() => {
    if (isFocused) {
      const row = Math.floor(focusedIndex / COLUMNS);
      const rowHeight = Platform.OS === 'web' ? 250 : 180;
      const targetY = row > 1 ? -(row - 1) * rowHeight : 0;
      translateY.value = withTiming(targetY, { duration: 300 });
    } else {
      translateY.value = withTiming(0, { duration: 300 });
    }
  }, [focusedIndex, isFocused]);

  const animatedGridStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }]
  }));

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Almacenamiento de la consola: {games.length}</Text>
      </View>

      {/* Container to clip overflow and restrict scroll area */}
      <View style={{ height: windowHeight - 220, overflow: 'hidden', paddingTop: 20, marginTop: -20, paddingHorizontal: 20, marginHorizontal: -20 }}>
        {/* Grid wrapper that translates up/down depending on focus */}
        <Animated.View style={animatedGridStyle}>
          <View style={styles.grid}>
        {games.map((game, index) => {
          const isItemFocused = isFocused && focusedIndex === index;
          const borderId = `lib-${game.id ?? index}`;

          return (
            <TouchableOpacity
              key={game.id ?? index}
              activeOpacity={0.8}
              onPress={() => onItemPress?.(index, game)}
              style={[
                styles.gameCardWrapper,
                isItemFocused && styles.gameCardWrapperFocused,
              ]}
            >
              {/* SpinningBorder: sits outside the BlurView overflow:hidden clip */}
              {isItemFocused && <SpinningBorder id={borderId} />}

              <BlurView
                intensity={isItemFocused ? 45 : 25}
                tint="dark"
                style={[
                  styles.gameCard,
                  isItemFocused && styles.gameCardFocused,
                ]}
              >
                <View style={styles.imageContainer}>
                  {game.image ? (
                    <Image source={game.image} style={styles.gameImage} contentFit="cover" />
                  ) : (
                    <View style={styles.placeholderImage}>
                      <MaterialCommunityIcons name="controller-classic" size={48} color="rgba(255,255,255,0.2)" />
                    </View>
                  )}

                  {/* Subtle dim overlay for non-focused items when grid has focus */}
                  {isFocused && !isItemFocused && (
                    <View style={styles.unfocusedOverlay} />
                  )}
                </View>
              </BlurView>
            </TouchableOpacity>
          );
        })}
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 100,
    paddingBottom: 80,
    marginTop: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingBottom: 18,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '100',
    letterSpacing: 1.2,
  },
  grid: {
    ...Platform.select({
      web: {
        display: 'grid',
        gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
        gap: '20px',
      } as any,
      default: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
      },
    }),
  },
  gameCardWrapper: {
    borderRadius: 16,
    ...Platform.select({
      web: {
        // sizing is handled by grid
      } as any,
      default: {
        width: '18%',
        marginBottom: 20,
      },
    }),
    transform: [{ scale: 1 }],
    transition: 'transform 0.2s',
    zIndex: 1,
  } as any,
  gameCardWrapperFocused: {
    transform: [{ scale: 1 }],
    zIndex: 10,
    // overflow visible so the spinning halo bleeds outside card bounds
    overflow: 'visible',
  } as any,
  gameCard: {
    borderRadius: 1,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(20, 20, 30, 0.6)',
    height: '100%',
  },
  gameCardFocused: {
    borderColor: 'rgba(255, 255, 255, 0.85)',
    backgroundColor: 'rgba(40, 50, 70, 0.85)',
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1 / 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    position: 'relative',
  },
  gameImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // unfocusedOverlay: {
  //   ...StyleSheet.absoluteFillObject,
  //   backgroundColor: 'rgba(0,0,0,0.38)',
  // },
  emptyContainer: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 40,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    marginTop: 15,
  },
});
