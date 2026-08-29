import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { toastService } from '@/services/toastService';
import { soundService } from '@/services/soundService';

const TOAST_DURATION_MS = 5000;

export default function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(24);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    opacity.value = withTiming(0, { duration: 280 });
    translateX.value = withTiming(24, { duration: 280 }, (finished) => {
      if (finished) runOnJS(setMessage)(null);
    });
  }, [opacity, translateX]);

  const show = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    soundService.playNotification();
    opacity.value = withTiming(1, { duration: 280 });
    translateX.value = withTiming(0, { duration: 280 });
    timerRef.current = setTimeout(hide, TOAST_DURATION_MS);
  }, [hide, opacity, translateX]);

  useEffect(() => {
    return toastService.subscribe(show);
  }, [show]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  if (!message) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents="none">
      <View style={styles.toast}>
        <Text style={styles.label}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 35,
    right: 40,
    zIndex: 99999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25, 25, 25, 0.95)',
    borderRadius: 8,
    paddingVertical: 18,
    paddingHorizontal: 24,
    minWidth: 320,
    //shadowColor: '#000',
    //shadowOffset: { width: 0, height: 10 },
    //shadowOpacity: 0.6,
    //shadowRadius: 20,
  },
  label: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'SSTLight',
    fontWeight: '300',
    letterSpacing: 0.2,
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
    fontFamily: 'SSTBold',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  plus: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
});
