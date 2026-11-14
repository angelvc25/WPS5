import { useIntroReady } from '@/hooks/useLauncherSettled';
import React from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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

  // paintReady: se activa tras dos frames de pintura desde el mount de este componente.
  // Garantiza que Reanimated ha registrado sus worklets antes de disparar withTiming,
  // independientemente de cuándo introReady se active.
  const [paintReady, setPaintReady] = React.useState(false);
  React.useEffect(() => {
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPaintReady(true));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, []);

  const canAnimate = introReady && paintReady;

  React.useEffect(() => {
    if (!canAnimate) return;
    const cfg = { duration: 280, easing: Easing.out(Easing.quad) };
    scale.value = withTiming(isActive ? 1.5 : 1, cfg);
    translateY.value = withTiming(isActive ? 17 : 0, cfg);
    marginH.value = withTiming(isActive ? 20 : 6, cfg);
  }, [isActive, canAnimate]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
    marginLeft: marginH.value,
    marginRight: marginH.value,
    overflow: isActive ? 'visible' : 'hidden',
    borderRadius: 20,
  }));

  const delay = Math.min(entryIndex, 10) * 50;

  // Cuando canAnimate cambia de false → true necesitamos que el <div> se remonte
  // para que el browser ejecute la animación CSS desde el principio.
  const entryKey = canAnimate ? `ready-${entryIndex}` : `pre-${entryIndex}`;

  const entryStyle: React.CSSProperties = canAnimate ? {
    display: 'flex',
    flexDirection: 'column',
    animation: `wps5CardIn 600ms cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
  } : {
    display: 'flex',
    flexDirection: 'column',
    opacity: 0,
  };

  return (
    <Animated.View style={style}>
      <div key={entryKey} style={entryStyle}>
        <Animated.View style={animStyle}>{children}</Animated.View>
      </div>
    </Animated.View>
  );
});

AnimatedCardWrapper.displayName = 'AnimatedCardWrapper';

export default AnimatedCardWrapper;
