import React from 'react';
import { useIntroReady, useLauncherSettled, useSplashDone } from '@/hooks/useLauncherSettled';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

function ensureCardCss() {
  if (typeof document === 'undefined' || document.getElementById('wps5-card-css')) return;
  const s = document.createElement('style');
  s.id = 'wps5-card-css';
  s.textContent = `@keyframes wps5CardIn {
    from { opacity: 0; transform: translateX(150px) scale(0.7); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }`;
  document.head.appendChild(s);
}
ensureCardCss();

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

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
    marginLeft: marginH.value,
    marginRight: marginH.value,
    overflow: isActive ? 'visible' : 'hidden',
    borderRadius: 20,
  }));

  const delay = (wasWaitingForSplashRef.current ? 250 : 80) + Math.min(entryIndex, 10) * 60;
  const entryStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    opacity: introReady ? undefined : 0,
    animation: introReady ? `wps5CardIn 700ms cubic-bezier(0.16,1,0.3,1) ${delay}ms both` : undefined,
  };

  return (
    <Animated.View style={style}>
      <div style={entryStyle}>
        <Animated.View style={animStyle}>{children}</Animated.View>
      </div>
    </Animated.View>
  );
});

AnimatedCardWrapper.displayName = 'AnimatedCardWrapper';

export default AnimatedCardWrapper;
