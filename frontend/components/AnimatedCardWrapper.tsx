import React from 'react';
import { useIntroReady } from '@/hooks/useLauncherSettled';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

function ensureCardCss() {
  if (typeof document === 'undefined' || document.getElementById('wps5-card-css')) return;
  const s = document.createElement('style');
  s.id = 'wps5-card-css';
  s.textContent = `@keyframes wps5CardIn {
    from { opacity: 0; transform: translateX(120px) scale(0.8); }
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
  // Inicializamos a escala 1 para que al entrar se anime la escala destacada de la tarjeta activa
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const marginH = useSharedValue(6);

  const introReady = useIntroReady();

  React.useEffect(() => {
    if (!introReady) return;
    const cfg = { duration: 280, easing: Easing.out(Easing.quad) };
    scale.value = withTiming(isActive ? 1.5 : 1, cfg);
    translateY.value = withTiming(isActive ? 17 : 0, cfg);
    marginH.value = withTiming(isActive ? 20 : 6, cfg);
  }, [isActive, introReady]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
    marginLeft: marginH.value,
    marginRight: marginH.value,
    overflow: isActive ? 'visible' : 'hidden',
    borderRadius: 20,
  }));

  const delay = Math.min(entryIndex, 10) * 50;
  const entryStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    opacity: introReady ? undefined : 0,
    animation: introReady ? `wps5CardIn 600ms cubic-bezier(0.16,1,0.3,1) ${delay}ms both` : undefined,
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
