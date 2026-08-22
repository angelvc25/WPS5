import React from 'react';
import { View, Platform } from 'react-native';

interface SpinningBorderSearchProps {
  /** Tamaño de la card sobre la que se dibuja el anillo (en px). */
  size: number;
  /**
   * Cuánto sobresale el anillo por fuera de la card, en px, en las 4
   * direcciones. Por defecto se calcula proporcional al tamaño de la card.
   */
  spread?: number;
  /** Radio de las esquinas del anillo. Por defecto proporcional a `size`. */
  borderRadius?: number;
}

export const SpinningBorderSearch = ({ size, spread, borderRadius }: SpinningBorderSearchProps) => {
  if (Platform.OS !== 'web') return null;

  const resolvedSpread = spread ?? Math.max(10, Math.round(size * 0.07));
  const resolvedRadius = borderRadius ?? Math.round(size * 0.04) + 6;

  return (
    <>
      <style>{`
  @keyframes wcs-spin-border {
    0%   { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(360deg); }
  }

  .wcs-spinning-container {
    position: absolute;
    top: 0px;
    left: 0px;
    right: -6px;
    bottom: -7px;
    border-radius: 4px;
    z-index: 20;
    overflow: visible;

    -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
    mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
    -webkit-mask-clip: border-box, padding-box;
    mask-clip: border-box, padding-box;
    -webkit-mask-composite: destination-out;
    mask-composite: exclude;

    border: 2px solid transparent;
  }

  .wcs-spinning-inner {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 300%;
    height: 300%;
    animation: wcs-spin-border 9.8s linear infinite;

    background: conic-gradient(
      from 0deg,
      rgba(255, 255, 255, 0.15) 0%,
      rgba(255, 255, 255, 0.79) 28%,
      rgba(180, 210, 255, 0.86) 33%,
      rgba(220, 235, 255, 0.95) 48%,
      rgba(255, 255, 255, 1.0) 50%,
      rgba(223, 248, 182, 0.95) 52%,
      rgba(180, 210, 255, 0.88) 57%,
      rgba(255, 255, 255, 0.75) 62%,
      rgba(255, 255, 255, 0.15) 100%
    );
    border-radius: 50%;
  }

  @keyframes wcs-content-shimmer {
    0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
    15% { opacity: 1; }
    50% { opacity: 1; }
    70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
    100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
  }
  .wcs-shimmer-line {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 140%;
    height: 420%;
    background: linear-gradient(
      to right,
      transparent 0%,
      rgba(255, 255, 255, 0.01) 20%,
      rgba(255, 255, 255, 0.18) 50%,
      rgba(255, 255, 255, 0.01) 80%,
      transparent 100%
    );
    animation: wcs-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
  }
`}</style>

      {/* CAPA ATRÁS: Borde Giratorio con Máscara Rectangular */}
      {/* @ts-ignore */}
      <div className="wcs-spinning-container">
        <div className="wcs-spinning-inner" />
      </div>

      {/* CAPA ADELANTE: Brillo */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: -6,
          bottom: -7,
          borderRadius: 4,
          zIndex: 5,
          overflow: 'hidden',
        } as any}
        pointerEvents="none"
      >
        {/* @ts-ignore */}
        <div className="wcs-shimmer-line" />
      </View>
    </>
  );
};

export default SpinningBorderSearch;
