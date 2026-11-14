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
  // Inicializamos directo al valor final: evita que withTiming corra en el arranque
  // mientras el JS thread está ocupado (lo que provoca ver solo el último tramo).
  const scale = useSharedValue(isActive ? 1.5 : 1);
  const translateY = useSharedValue(isActive ? 17 : 0);
  const marginH = useSharedValue(isActive ? 20 : 6);

  const introReady = useIntroReady();
  // Ref para distinguir el primer mount de los cambios posteriores.
  const isFirstRender = React.useRef(true);

  React.useEffect(() => {
    if (isFirstRender.current) {
      // Primer mount: los valores ya son correctos, no animar.
      isFirstRender.current = false;
      return;
    }
    if (!introReady) return;
    // Cambios posteriores (navegación por el carrusel): animar normalmente.
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

  // CSS entry animation: controlada con estado local para garantizar que el
  // browser la ejecuta desde el principio cuando introReady se activa.
  // El <div> cambia de key para forzar un remount (cambiar solo el style no reinicia CSS anims).
  const entryKey = introReady ? `ready-${entryIndex}` : `pre-${entryIndex}`;

  const entryStyle: React.CSSProperties = introReady ? {
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
