import React from 'react';
import { afterPaint, useIntroReady, useLauncherSettled, useSplashDone } from '@/hooks/useLauncherSettled';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

interface AnimatedCardWrapperProps {
  isActive: boolean;
  children: React.ReactNode;
  style?: any;
  entryIndex?: number;
}

export const AnimatedCardWrapper = React.memo(({
  isActive,
  children,
  style,
  entryIndex = 0,
}: AnimatedCardWrapperProps) => {
  const scale = useSharedValue(isActive ? 1.5 : 1);
  const translateY = useSharedValue(isActive ? 17 : 0);
  const marginH = useSharedValue(isActive ? 20 : 6);

  // Entry animation shared values (carousel entrance on mount/tab change)
  const entryOpacity = useSharedValue(0);
  const entryScale = useSharedValue(0.7);
  const entryTranslateX = useSharedValue(150);

  // Arranque: mientras el launcher no se asienta (splash + margen) el hilo JS
  // está saturado y las animaciones saltan frames. Los cambios de estado se
  // aplican directo, sin animar; la entrada escalonada espera al reloj estable.
  const splashDone = useSplashDone();
  const settled = useLauncherSettled();
  const introReady = useIntroReady();
  const settledRef = React.useRef(settled);
  settledRef.current = settled;
  const wasWaitingForSplashRef = React.useRef(!splashDone);

  React.useEffect(() => {
    const cfg = { duration: 280, easing: Easing.out(Easing.quad) };
    const to = (v: number) => (settledRef.current ? withTiming(v, cfg) : v);
    scale.value = to(isActive ? 1.5 : 1);
    translateY.value = to(isActive ? 17 : 0);
    marginH.value = to(isActive ? 20 : 6);
  }, [isActive]);

  // Trigger staggered entry animation (tras el reloj de intro, o al montar si ya terminó)
  React.useEffect(() => {
    if (!introReady) return;
    // Clamp delay: first 10 cards stagger nicely, rest enter together at the end
    const clampedIndex = Math.min(entryIndex, 10);
    // Primer arranque: pequeño margen extra para que el hilo respire tras el splash.
    const baseDelay = wasWaitingForSplashRef.current ? 250 : 80;
    const delay = baseDelay + clampedIndex * 60;
    const easing = Easing.out(Easing.exp);
    return afterPaint(() => {
      entryOpacity.value = withDelay(delay, withTiming(1, { duration: 700, easing }));
      entryScale.value = withDelay(delay, withTiming(1, { duration: 700, easing }));
      entryTranslateX.value = withDelay(delay, withTiming(0, { duration: 700, easing }));
    });
  }, [introReady]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value * entryScale.value },
      { translateY: translateY.value },
      { translateX: entryTranslateX.value },
    ],
    marginLeft: marginH.value,
    marginRight: marginH.value,
    opacity: entryOpacity.value,
    overflow: isActive ? 'visible' : 'hidden',
    borderRadius: 20,
  }));

  return (
    <Animated.View style={style}>
      <Animated.View style={animStyle}>
        {children}
      </Animated.View>
    </Animated.View>
  );
});

AnimatedCardWrapper.displayName = 'AnimatedCardWrapper';

export default AnimatedCardWrapper;