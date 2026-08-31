import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, useWindowDimensions, Platform, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Easing,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ConsoleItem } from '@/app/(tabs)/index';
import { soundService } from '@/services/soundService';
import ControlPrompt from '@/components/ControlPrompt';
import { PLATFORM_ICONS } from '@/constants/platforms';



interface Props {
  isVisible: boolean;
  games: ConsoleItem[];
  onClose: () => void;
  onLaunch: (item: ConsoleItem) => void;
  inputMode?: 'keyboard' | 'gamepad';
}

export default function RandomSelectorView({ isVisible, games, onClose, onLaunch, inputMode = 'keyboard' }: Props) {
  const [isRolling, setIsRolling] = useState(false);
  const [displayGames, setDisplayGames] = useState<ConsoleItem[]>([]);
  const [rollCount, setRollCount] = useState(0);

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const rollX = useSharedValue(0);
  const { width: windowWidth } = useWindowDimensions();
  const CARD_WIDTH = 240;
  const GAP = 30;
  const ITEM_SIZE = CARD_WIDTH + GAP;

  useAnimatedReaction(
    () => Math.floor(rollX.value / ITEM_SIZE),
    (next, prev) => {
      if (next !== prev && next !== null && isRolling) {
        runOnJS(() => soundService.playNavigation())();
      }
    }
  );

  useEffect(() => {
    if (isVisible) {
      opacity.value = withTiming(1, { duration: 300 });
      scale.value = withSpring(1);
      startRoll();
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      scale.value = withTiming(0.9, { duration: 200 });
      rollX.value = 0;
    }
  }, [isVisible]);

  const startRoll = useCallback(() => {
    const available = games.filter(g => !g.isFolder && !g.isGrid && g.id !== '1' && g.id !== 'last_played');
    if (available.length === 0 || isRolling) return;

    setIsRolling(true);
    setRollCount(prev => prev + 1);

    // Create a long list for the conveyor belt (avoid consecutive repeats)
    const longList: ConsoleItem[] = [];
    let lastId = '';
    for (let i = 0; i < 45; i++) {
      let pick = available[Math.floor(Math.random() * available.length)];
      if (available.length > 1) {
        while (pick.id === lastId) {
          pick = available[Math.floor(Math.random() * available.length)];
        }
      }
      longList.push(pick);
      lastId = pick.id;
    }
    setDisplayGames(longList);

    rollX.value = 0;

    // Land on the penultimate item
    const targetIndex = longList.length - 2;
    const targetOffset = -targetIndex * ITEM_SIZE;

    rollX.value = withTiming(targetOffset, {
      duration: 3800,
      easing: Easing.bezier(0.15, 0, 0, 1)
    }, (finished) => {
      if (finished) {
        runOnJS(setIsRolling)(false);
        runOnJS(() => soundService.playActivation())();
      }
    });
  }, [games, isRolling, ITEM_SIZE]);

  useEffect(() => {
    const handleKeyDown = (e: any) => {
      if (!isVisible) return;

      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        onClose();
      } else if (e.key === 'Enter' || e.key === 'a' || e.key === 'A') {
        if (!isRolling && displayGames.length > 0) {
          onLaunch(displayGames[displayGames.length - 2]);
        }
      } else if (e.key === 'x' || e.key === 'X' || e.key === 'r' || e.key === 'R') {
        if (!isRolling) startRoll();
      }
    };

    if (Platform.OS === 'web') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isVisible, isRolling, displayGames, startRoll, onClose, onLaunch]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }]
  }));

  const rollWrapperStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rollX.value - (CARD_WIDTH / 2 + 15) }]
  }));

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} transparent animationType="none">
      <View style={styles.container}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

        <Animated.View style={[styles.content, animatedStyle]}>
          <View style={styles.topHeader}>
            <View style={styles.slantedTag}>
              <Text style={styles.tagLabel}>TU JUEGO</Text>
              <Text style={styles.tagSubLabel}>ALEATORIO ES...</Text>
              <MaterialCommunityIcons name="dice-multiple" size={40} color="#000" style={{ marginTop: 2 }} />
            </View>
          </View>

          <View style={styles.cardsViewPort}>
            <Animated.View style={[styles.rollWrapper, rollWrapperStyle]}>
              {displayGames.map((game, index) => (
                <RollCard
                  key={game.id + index}
                  game={game}
                  index={index}
                  rollX={rollX}
                  itemSize={ITEM_SIZE}
                />
              ))}
            </Animated.View>
          </View>

          <View style={styles.bottomLeftControls}>
            <TouchableOpacity style={styles.controlBtn} onPress={onClose}>
              <ControlPrompt btn="B" label="VOLVER" inputMode={inputMode} />
            </TouchableOpacity>
          </View>

          <View style={styles.bottomRightControls}>
            <TouchableOpacity style={[styles.controlBtn, styles.primaryBtn]} onPress={startRoll} disabled={isRolling}>
              <ControlPrompt btn="X" label="REINTENTAR" inputMode={inputMode} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, styles.confirmBtn]}
              onPress={() => displayGames.length > 0 && onLaunch(displayGames[displayGames.length - 2])}
              disabled={isRolling}
            >
              <ControlPrompt btn="A" label="INICIAR" inputMode={inputMode} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function RollCard({ game, index, rollX, itemSize }: { game: ConsoleItem, index: number, rollX: any, itemSize: number }) {
  const animatedStyle = useAnimatedStyle(() => {
    const position = index * itemSize + rollX.value;
    const scale = interpolate(
      position,
      [-itemSize, 0, itemSize],
      [0.85, 1.15, 0.85],
      'clamp'
    );
    const opacity = interpolate(
      position,
      [-itemSize * 2, -itemSize, 0, itemSize, itemSize * 2],
      [0, 0.4, 1, 0.4, 0],
      'clamp'
    );

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const platformIcons: Record<string, string> = PLATFORM_ICONS;
  const platform = game.platform;
  const iconName = (platform && platformIcons[platform]) || 'alpha-z-box';

  return (
    <Animated.View style={[styles.cardWrapper, animatedStyle]}>
      <View style={styles.cardSlant}>
        <Image source={game.image} style={styles.cardImage} contentFit="cover" />
        <View style={styles.cardOverlay}>
          <View style={styles.gameLogoBox}>
            <MaterialCommunityIcons name={iconName as any} size={24} color="#FFF" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>{game.title?.toUpperCase() || 'JUEGO'}</Text>
          </View>
        </View>
        <View style={styles.slantLines}>
          <View style={styles.slantLine} /><View style={styles.slantLine} /><View style={styles.slantLine} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  topHeader: {
    position: 'absolute',
    top: 40,
    left: 40,
    zIndex: 100,
  },
  slantedTag: {
    backgroundColor: '#CCFF00',
    padding: 12,
    transform: [{ skewX: '-15deg' }],
    width: 120,
  },
  tagLabel: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
  },
  tagSubLabel: {
    color: '#000',
    fontSize: 8,
    fontWeight: 'bold',
    marginTop: -3,
  },
  tagNumber: {
    color: '#000',
    fontSize: 40,
    fontWeight: '900',
    marginTop: 2,
  },
  cardsViewPort: {
    width: '100%',
    height: 600,
    overflow: 'hidden',
    position: 'relative',
  },
  rollWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    left: '50%',
    height: '100%',
  },
  cardWrapper: {
    width: 240,
    height: 520,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111',
    marginHorizontal: 15,
  },
  cardSlant: {
    flex: 1,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    opacity: 0.7,
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  gameLogoBox: {
    width: 40,
    height: 40,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  cardInfo: {
    marginTop: 40,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 28,
    marginBottom: 5,
  },
  slantLines: {
    position: 'absolute',
    bottom: 20,
    right: -20,
    transform: [{ rotate: '-45deg' }],
  },
  slantLine: {
    width: 300,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 10,
  },
  bottomLeftControls: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    flexDirection: 'row',
    gap: 20,
  },
  bottomRightControls: {
    position: 'absolute',
    bottom: 40,
    right: 40,
    flexDirection: 'row',
    gap: 20,
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  primaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  confirmBtn: {
    backgroundColor: 'rgba(0,255,255,0.1)',
  },
});
