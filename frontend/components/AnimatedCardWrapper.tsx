import React from 'react';
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

  React.useEffect(() => {
    scale.value = withTiming(isActive ? 1.5 : 1, { duration: 280, easing: Easing.out(Easing.quad) });
    translateY.value = withTiming(isActive ? 17 : 0, { duration: 280, easing: Easing.out(Easing.quad) });
    marginH.value = withTiming(isActive ? 20 : 6, { duration: 280, easing: Easing.out(Easing.quad) });
  }, [isActive]);

  // Trigger staggered entry animation on mount
  React.useEffect(() => {
    // Clamp delay: first 10 cards stagger nicely, rest enter together at the end
    const clampedIndex = Math.min(entryIndex, 10);
    const delay = 80 + clampedIndex * 60;
    const easing = Easing.out(Easing.exp);
    entryOpacity.value = withDelay(delay, withTiming(1, { duration: 700, easing }));
    entryScale.value = withDelay(delay, withTiming(1, { duration: 700, easing }));
    entryTranslateX.value = withDelay(delay, withTiming(0, { duration: 700, easing }));

    // En producción (Electron) Reanimated a veces no dispara el primer withDelay.
    const fallback = setTimeout(() => {
      entryOpacity.value = 1;
      entryScale.value = 1;
      entryTranslateX.value = 0;
    }, delay + 900);
    return () => clearTimeout(fallback);
  }, []);

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
    <Animated.View style={[animStyle, style]}>
      {children}
    </Animated.View>
  );
});

export default AnimatedCardWrapper;
