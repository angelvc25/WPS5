import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { toastService } from '@/services/toastService';

const TOAST_DURATION_MS = 5000;

export default function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    opacity.value = withTiming(0, { duration: 280 });
    translateY.value = withTiming(24, { duration: 280 }, (finished) => {
      if (finished) runOnJS(setMessage)(null);
    });
  }, [opacity, translateY]);

  const show = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    opacity.value = withTiming(1, { duration: 280 });
    translateY.value = withTiming(0, { duration: 280 });
    timerRef.current = setTimeout(hide, TOAST_DURATION_MS);
  }, [hide, opacity, translateY]);

  useEffect(() => {
    return toastService.subscribe(show);
  }, [show]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!message) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents="none">
      <View style={styles.toast}>
        <Ionicons name="information-circle-outline" size={20} color="#60A5FA" style={styles.icon} />
        <View style={styles.keysRow}>
          <View style={styles.key}><Text style={styles.keyText}>ALT</Text></View>
          <Text style={styles.plus}>+</Text>
          <View style={styles.key}><Text style={styles.keyText}>F4</Text></View>
        </View>
        <Text style={styles.label}>para cerrar</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 20, 0.92)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    gap: 10,
  },
  icon: {
    marginRight: 2,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  keysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  key: {
    backgroundColor: '#2A2A2E',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    minWidth: 36,
    alignItems: 'center',
  },
  keyText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  plus: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
});
