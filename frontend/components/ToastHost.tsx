import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  LinearTransition,
} from 'react-native-reanimated';
import { toastService, ToastOptions } from '@/services/toastService';
import { soundService } from '@/services/soundService';

const DEFAULT_TOAST_DURATION_MS = 5000;

interface ToastData {
  id: string;
  message: string;
  icon?: any;
  coverImage?: any;
  duration?: number;
}

function ToastItem({ toast, onRemove }: { toast: ToastData; onRemove: (id: string) => void }) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(24);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    opacity.value = withTiming(0, { duration: 280 });
    translateX.value = withTiming(24, { duration: 280 }, (finished) => {
      if (finished) runOnJS(onRemove)(toast.id);
    });
  }, [toast.id, opacity, translateX, onRemove]);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 280 });
    translateX.value = withTiming(0, { duration: 280 });

    const duration = toast.duration ?? DEFAULT_TOAST_DURATION_MS;
    timerRef.current = setTimeout(hide, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hide, opacity, translateX, toast.duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      style={[styles.toastItemContainer, animatedStyle]}
      pointerEvents="none"
    >
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
        {toast.coverImage ? (
          <Image source={toast.coverImage} style={styles.coverImage} contentFit="cover" />
        ) : toast.icon ? (
          <Image source={toast.icon} style={styles.icon} contentFit="contain" />
        ) : null}
        <Text style={styles.label}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((payload: { message: string; options?: ToastOptions }) => {
    soundService.playNotification();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [
      ...prev,
      {
        id,
        message: payload.message,
        icon: payload.options?.icon ?? null,
        coverImage: payload.options?.coverImage ?? null,
        duration: payload.options?.duration ?? DEFAULT_TOAST_DURATION_MS,
      },
    ]);
  }, []);

  useEffect(() => {
    return toastService.subscribe(show);
  }, [show]);

  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 24,
    right: 20,
    zIndex: 99999,
    flexDirection: 'column',
    gap: 10,
    alignItems: 'flex-end',
  },
  toastItemContainer: {},
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
  coverImage: {
    width: 36,
    height: 36,
    borderRadius: 6,
    marginRight: 14,
    zIndex: 2,
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
    flexShrink: 1,
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
