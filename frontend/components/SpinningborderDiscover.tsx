import React from 'react';
import { View, Platform } from 'react-native';

interface SpinningBorderProps {
  borderRadius?: number;
}

export const SpinningborderDiscover = ({ borderRadius = 4 }: SpinningBorderProps) => {
  if (Platform.OS !== 'web') return null;

  return (
    <>
      <style>{`
  /* --- ANIMACIÓN 1: BORDE GIRATORIO PARA SUGERENCIAS --- */
  @keyframes wc-spin-border-disc {
    0%   { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(360deg); }
  }
  
  .wc-spinning-container-disc {
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border-radius: ${borderRadius + 2}px;
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

  .wc-spinning-inner-disc {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 300%;
    height: 500%;
    animation: wc-spin-border-disc 7.5s linear infinite;
    background: conic-gradient(
      from 0deg,
      rgba(255, 255, 255, 0.4) 0%,
      rgba(255, 255, 255, 0.85) 28%,
      rgba(180, 210, 255, 0.95) 33%,
      rgba(220, 235, 255, 1.0) 48%,
      rgba(255, 255, 255, 1.0) 50%,
      rgba(223, 248, 182, 1.0) 52%,
      rgba(180, 210, 255, 0.95) 57%,
      rgba(255, 255, 255, 0.8) 62%,
      rgba(255, 255, 255, 0.4) 100%
    );
    border-radius: 50%;
  }

  /* --- ANIMACIÓN 2: DESTELLO DIAGONAL SUAVE --- */
  @keyframes wc-content-shimmer-disc {
    0% { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
    15% { opacity: 1; }
    50% { opacity: 1; }
    70% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
    100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
  }
  .wc-shimmer-line-disc {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 160%; 
    height: 420%; 
    background: linear-gradient(
      to right,
      transparent 0%,
      rgba(255, 255, 255, 0.01) 20%,
      rgba(255, 255, 255, 0.22) 50%, 
      rgba(255, 255, 255, 0.01) 80%,
      transparent 100%
    );
    animation: wc-content-shimmer-disc 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
  }
`}</style>

      {/* @ts-ignore */}
      <div className="wc-spinning-container-disc">
        {/* @ts-ignore */}
        <div className="wc-spinning-inner-disc" />
      </div>

      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 1,
          right: 1,
          bottom: 0,
          borderRadius: borderRadius,
          zIndex: 5,
          overflow: 'hidden',
        } as any}
        pointerEvents="none"
      >
        {/* @ts-ignore */}
        <div className="wc-shimmer-line-disc" />
      </View>
    </>
  );
};

export default SpinningborderDiscover;
