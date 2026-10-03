import React from 'react';
import { View, Platform } from 'react-native';

interface SpinningBorderConicProps {
  size: number;
}

// El CSS se inyecta una sola vez por carrusel (ver SpinningBorderStyles):
// antes cada tarjeta activa lo re-montaba al cambiar el foco, con el coste
// de re-parsear keyframes + gradientes justo durante la animación de scale.
const SPIN_CSS = `
  /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
  @keyframes wc-spin-border {
    0%   { transform: translate3d(-50%, -50%, 0) rotate(0deg); }
    100% { transform: translate3d(-50%, -50%, 0) rotate(360deg); }
  }
  
  .wc-spinning-container {
    position: absolute;
    top: -2px;
    left: 10px;
    right: 10px;
    bottom: -2px;
    border-radius: 22px;
    z-index: 20;
    overflow: visible;
    pointer-events: none;
    // contain: strict;

    /* ─── AQUÍ OCURRE LA MAGIA DE LA MÁSCARA CUADRADA ─── */
    /* 1. Definimos dos capas de gradientes básicos como máscaras */
    -webkit-mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);
    mask-image: linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);

    /* 2. El primer gradiente se expande hasta el borde (border-box). 
          El segundo gradiente se queda solo en el contenido (padding-box) */
    -webkit-mask-clip: border-box, padding-box;
    mask-clip: border-box, padding-box;

    /* 3. ¡RESTAR! Le decimos que excluya la capa del padding-box (el centro).
          Nota: Webkit usa 'destination-out' y la propiedad estándar usa 'exclude' */
    -webkit-mask-composite: destination-out;
    mask-composite: exclude;

    /* 4. El grosor del anillo se define por el "border" del contenedor */
    border: 2px solid transparent; 
  }

  .wc-spinning-inner {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 250%;
    height: 250%;
    will-change: transform;
    animation: wc-spin-border 9.8s linear infinite;
    
    background: conic-gradient(
      from 0deg,
      rgba(255, 255, 255, 0.15) 0%,
      var(--wps-accent, rgba(255, 255, 255, 0.79)) 28%,
      var(--wps-accent-glow, rgba(180, 210, 255, 0.86)) 33%,
      rgba(220, 235, 255, 0.95) 48%,
      rgba(255, 255, 255, 1.0) 50%,
      var(--wps-accent, rgba(223, 248, 182, 0.95)) 52%,
      var(--wps-accent-glow, rgba(180, 210, 255, 0.88)) 57%,
      rgba(255, 255, 255, 0.75) 62%,
      rgba(255, 255, 255, 0.15) 100%
    );
    border-radius: 50%;
  }

  /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE --- */
  @keyframes wc-content-shimmer {
    0% { transform: translate3d(-160%, -50%, 0) rotate(48deg); opacity: 0; }
    15% { opacity: 1; }
    50% { opacity: 1; }
    70% { transform: translate3d(130%, -50%, 0) rotate(48deg); opacity: 0; }
    100% { transform: translate3d(130%, -50%, 0) rotate(48deg); opacity: 0; }
  }
  .wc-shimmer-line {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 140%; 
    height: 420%; 
    will-change: transform;
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
`;

export const SpinningBorderStyles = () => {
  if (Platform.OS !== 'web') return null;
  return <style>{SPIN_CSS}</style>;
};

export const SpinningBorderConic = ({ size }: SpinningBorderConicProps) => {
  if (Platform.OS !== 'web') return null;

  return (
    <>
      {/* CAPA ATRÁS: Borde Giratorio con Máscara Rectangular */}
      {/* Eliminamos los estilos inline que puedan chocar con la máscara */}
      {/* @ts-ignore */}
      <div className="wc-spinning-container">
        {/* El gradiente cónico gira aquí adentro, siendo recortado perfectamente por el padre */}
        <div className="wc-spinning-inner" />
      </div>

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
