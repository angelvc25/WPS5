import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { ConsoleItem } from '../app/(tabs)/index';

interface LibraryGridProps {
  games: ConsoleItem[];
  isFocused?: boolean;
  focusedIndex?: number;
  onItemPress?: (index: number, game: ConsoleItem) => void;
}

const COLUMNS = 5;

export default function LibraryGrid({ games, isFocused = false, focusedIndex = 0, onItemPress }: LibraryGridProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (isFocused && scrollRef.current) {
      const row = Math.floor(focusedIndex / COLUMNS);
      // Estimate row height (approx 350px) to scroll into view
      scrollRef.current.scrollTo({ y: row * 350, animated: true });
    }
  }, [focusedIndex, isFocused]);

  if (!games || games.length === 0) {
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyContainer}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <MaterialCommunityIcons name="folder-outline" size={48} color="rgba(255,255,255,0.4)" />
        <Text style={styles.emptyText}>La biblioteca está vacía.</Text>
      </Animated.View>
    );
  }

  const getPlatformIcon = (platform?: string): string => {
    if (!platform) return 'controller-classic';
    const mapping: Record<string, string> = {
      'PC': 'microsoft-windows',
      'PS5': 'sony-playstation',
      'Xbox': 'microsoft-xbox',
      'Switch': 'nintendo-switch',
      'Steam': 'steam',
      'EA': 'alpha-e-box',
      'Epic': 'alpha-e-circle',
    };
    return mapping[platform] || 'controller-classic';
  };

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.container}>
      <View style={styles.header}>
        {/* <MaterialCommunityIcons name="bookshelf" size={28} color="#FFF" style={{ marginRight: 12 }} /> */}
        <Text style={styles.headerTitle}>Almacenamiento de la consola: {games.length}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <View style={styles.grid}>
          {games.map((game, index) => {
            const platformIcon = getPlatformIcon(game.platform);
            const isItemFocused = isFocused && focusedIndex === index;

            return (
              <TouchableOpacity
                key={game.id}
                activeOpacity={0.8}
                onPress={() => onItemPress?.(index, game)}
                style={[
                  styles.gameCardWrapper,
                  isItemFocused && styles.gameCardWrapperFocused
                ]}
              >
                <BlurView
                  intensity={isItemFocused ? 40 : 25}
                  tint="dark"
                  style={[
                    styles.gameCard,
                    isItemFocused && styles.gameCardFocused
                  ]}
                >
                  <View style={styles.imageContainer}>
                    {game.image ? (
                      <Image source={game.image} style={styles.gameImage} contentFit="cover" />
                    ) : (
                      <View style={styles.placeholderImage}>
                        <MaterialCommunityIcons name="controller-classic" size={64} color="rgba(255,255,255,0.2)" />
                      </View>
                    )}
                    {/* Dark overlay for unfocused items when grid is focused */}
                    {isFocused && !isItemFocused && (
                      <View style={styles.unfocusedOverlay} />
                    )}
                  </View>
                </BlurView>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
    paddingHorizontal: 100,
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
    //marginBottom: 24,
    //borderBottomWidth: 1,
    //borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 15,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 100,
    letterSpacing: 1.2,
  },
  grid: {
    ...Platform.select({
      web: {
        display: 'ruby',
        //gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
        gap: '24px',
      } as any,
      default: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
      },
    }),
  },
  gameCardWrapper: {
    borderRadius: 1,
    ...Platform.select({
      default: {
        width: '18%',
        marginRight: '2%',
        marginBottom: 24,
      },
    }),
    transform: [{ scale: 1 }],
    transition: 'transform 0.2s',
  } as any,
  gameCardWrapperFocused: {
    transform: [{ scale: 1 }],
    zIndex: 10,
  } as any,
  gameCard: {
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(20, 20, 30, 0.6)',
    height: '100%',
  },
  gameCardFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(40, 50, 70, 0.8)',
    shadowColor: '#00FFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1 / 1, // Taller covers instead of square
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
  unfocusedOverlay: {
    ...StyleSheet.absoluteFillObject,
    //backgroundColor: 'rgba(0,0,0,0.4)',
  },
  infoContainer: {
    padding: 16,
    flex: 1,
    justifyContent: 'space-between',
  },
  gameTitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    lineHeight: 22,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  platformText: {
    color: '#00FFFF',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
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
