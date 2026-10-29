import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import SpinningBorderSearch from './SpinningBorderSearch';
import SpinningBorderSettings from './spinninBorderSettings';
import SpinningBorderLogros from './SpinningBorderLogros';
import SpinningBorderWidgets from './SpinningBorderWidgets';

// Mismo comportamiento que el borde del ConsoleCarousel:
//  - al enfocar: arranca expandido (scale 1.15, opacidad 0) y se comprime a 1 apareciendo
//  - al desenfocar: se expande a 1.15 mientras desaparece
type BorderProps = {
  size: number;
  spread?: number;
  borderRadius?: number;
  /** Escala uniforme (si se pasa, reemplaza a X/Y). */
  fromScale?: number;
  /** Escala horizontal inicial: pequeña por defecto para que filas anchas no se corten. */
  fromScaleX?: number;
  /** Escala vertical inicial. */
  fromScaleY?: number;
};

/** Envoltorio genérico: anima entrada/salida (escala + fundido) de cualquier borde hijo. */
export function ScaleFadeBorder({
  children,
  fromScale,
  fromScaleX = 1.03,
  fromScaleY = 1.15,
}: { children?: React.ReactNode } & Omit<BorderProps, 'size' | 'spread' | 'borderRadius'>) {
  const sx = fromScale ?? fromScaleX;
  const sy = fromScale ?? fromScaleY;
  const entering = useMemo(
    () =>
      new Keyframe({
        0: { opacity: 0, transform: [{ scaleX: sx }, { scaleY: sy }] },
        100: { opacity: 1, transform: [{ scaleX: 1 }, { scaleY: 1 }], easing: Easing.out(Easing.cubic) },
      })
        .delay(90)
        .duration(320),
    [sx, sy],
  );
  const exiting = useMemo(
    () =>
      new Keyframe({
        0: { opacity: 1, transform: [{ scaleX: 1 }, { scaleY: 1 }] },
        100: { opacity: 0, transform: [{ scaleX: sx }, { scaleY: sy }], easing: Easing.out(Easing.cubic) },
      }).duration(200),
    [sx, sy],
  );
  return (
    <Animated.View entering={entering} exiting={exiting} pointerEvents="none" style={styles.fill}>
      {children}
    </Animated.View>
  );
}

function withScaleFade<P extends { size: number; spread?: number; borderRadius?: number }>(
  Inner: React.ComponentType<P>,
) {
  return function AnimatedBorder({ fromScale, fromScaleX, fromScaleY, ...rest }: BorderProps) {
    return (
      <ScaleFadeBorder fromScale={fromScale} fromScaleX={fromScaleX} fromScaleY={fromScaleY}>
        <Inner {...(rest as unknown as P)} />
      </ScaleFadeBorder>
    );
  };
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 },
});

export const AnimatedSpinningBorderSearch = withScaleFade(SpinningBorderSearch as any);
export const AnimatedSpinningBorderSettings = withScaleFade(SpinningBorderSettings as any);
export const AnimatedSpinningBorderLogros = withScaleFade(SpinningBorderLogros as any);
export const AnimatedSpinningBorderWidgets = withScaleFade(SpinningBorderWidgets as any);