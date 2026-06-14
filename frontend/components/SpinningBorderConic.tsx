import React from 'react';
import { View, Platform } from 'react-native';

interface SpinningBorderConicProps {
  size: number;
}

export const SpinningBorderConic = ({ size }: SpinningBorderConicProps) => {
  if (Platform.OS !== 'web') return null;

  return (
    <>
      <style>{`
        /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
        @keyframes wc-spin-border {
          0%   { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .wc-spinning-inner {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 300%;
          height: 300%;
          animation: wc-spin-border 9.8s linear infinite;
          
          /* Cambiado 'transparent' por un color base semi-translucido elegante (rgba 255, 255, 255, 0.15) */
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

        /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE (CICLO 5s) --- */
        @keyframes wc-content-shimmer {
          0% { 
            transform: translate(-160%, -50%) rotate(48deg); 
            opacity: 0; 
          }
          15% { 
            opacity: 1; 
          }
          50% { 
            opacity: 1; 
          }
          70% { 
            transform: translate(130%, -50%) rotate(48deg); 
            opacity: 0; 
          }
          100% { 
            transform: translate(130%, -50%) rotate(48deg); 
            opacity: 0; 
          }
        }
        .wc-shimmer-line {
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
          animation: wc-content-shimmer 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
        }
      `}</style>

      {/* CAPA ATRÁS: Borde Giratorio */}
      <View
        style={{
          position: 'absolute',
          top: 1,
          left: 11,
          right: 11,
          bottom: 1,
          borderRadius: 20,
          zIndex: -1,
          overflow: 'hidden',
        } as any}
        pointerEvents="none"
      >
        {/* @ts-ignore */}
        <div className="wc-spinning-inner" />
      </View>

      {/* CAPA ADELANTE: Brillo Adaptado Amplio */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 10,
          right: 10,
          bottom: 0,
          borderRadius: 22,
          zIndex: 5,
          overflow: 'hidden',
        } as any}
        pointerEvents="none"
      >
        {/* @ts-ignore */}
        <div className="wc-shimmer-line" />
      </View>
    </>
  );
};

export default SpinningBorderConic;
