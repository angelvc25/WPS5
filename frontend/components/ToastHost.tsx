import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { toastService, ToastOptions } from '@/services/toastService';
import { soundService } from '@/services/soundService';

const DEFAULT_TOAST_DURATION_MS = 5000;

export default function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const [icon, setIcon] = useState<any>(null);
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(24);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    opacity.value = withTiming(0, { duration: 280 });
    translateX.value = withTiming(24, { duration: 280 }, (finished) => {
      if (finished) runOnJS(setMessage)(null);
    });
  }, [opacity, translateX]);

  const show = useCallback((payload: { message: string; options?: ToastOptions }) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(payload.message);
    setIcon(payload.options?.icon ?? null);
    soundService.playNotification();
    opacity.value = withTiming(1, { duration: 280 });
    translateX.value = withTiming(0, { duration: 280 });
    const duration = payload.options?.duration ?? DEFAULT_TOAST_DURATION_MS;
    timerRef.current = setTimeout(hide, duration);
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
            opacity: 1,
            borderRadius: 8,
            transition: 'opacity 450ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
        {icon && (
          <Image source={icon} style={styles.icon} contentFit="contain" />
        )}
        <Text style={styles.label}>{message}</Text>
      </View>
    </Animated.View>
  );
}


const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 24,
    right: 20,
    zIndex: 99999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 23, 31, 1)',
    borderRadius: 8,
    paddingVertical: 17,
    paddingHorizontal: 24,
    minWidth: 370,
    minHeight: 70,
  },
  icon: {
    width: 26,
    height: 26,
    marginRight: 14,
    tintColor: '#FFF',
    zIndex: 2,
  },
  label: {
    color: '#FFF',
    fontSize: 18,
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
