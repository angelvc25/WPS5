import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

interface CircularNavButtonProps {
  icon: string;
  label: string;
  isActive: boolean;
  onPress: () => void;
}

export default function CircularNavButton({ icon, label, isActive, onPress }: CircularNavButtonProps) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(isActive ? 1.15 : 1, { duration: 250 });
    glowOpacity.value = withTiming(isActive ? 1 : 0, { duration: 250 });
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: isActive ? '#00FFFF' : 'rgba(255, 255, 255, 0.15)',
    borderWidth: isActive ? 2 : 1,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.glowRing, glowStyle]} />
      <Animated.View style={[styles.buttonWrapper, animatedStyle]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onPress}
          style={styles.touchable}
        >
          <Ionicons
            name={icon as any}
            size={24}
            color={isActive ? '#00FFFF' : 'rgba(255, 255, 255, 0.7)'}
          />
        </TouchableOpacity>
      </Animated.View>
      {isActive && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{label}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
    position: 'relative',
  },
  buttonWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 255, 0.3)',
    backgroundColor: 'rgba(0, 255, 255, 0.05)',
  },
  tooltip: {
    position: 'absolute',
    bottom: -32,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 100,
  },
  tooltipText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
