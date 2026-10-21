import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';


interface RadarFocusWrapperProps {
    id: string;
    isFocused: boolean;
    children: React.ReactNode;
    size?: number;       // Tamaño total del Canvas exterior (Radar)
    innerSize?: number;  // Tamaño del elemento interno (para el Shimmer)
    borderRadius?: string | number; // Por si usas tarjetas cuadradas o circulares
}

// ── Estilos globales del radar ───────────────────────────────────────────────
// Antes el radar se dibujaba sobre un <canvas>: 360 arcos (uno por grado)
// con su propio beginPath/stroke en CADA frame. Eso eran ~360 rasterizaciones
// de canvas por frame, que saturaban el hilo principal y dejaban el launcher
// a 60 fps aunque el monitor fuera de 165 Hz.
//
// Ahora el radar es CSS puro: dos capas (anillo base + barrido) con
// conic-gradient y máscara radial. Solo animan `transform` y `opacity`, así
// que las mueve el compositor en la GPU sin ningún JS por frame.
const RADAR_GLOBAL_STYLE_ID = 'wps5-radar-global-styles';

const RADAR_GLOBAL_CSS = `
  .wps5-radar-ring {
    position: absolute;
    top: 0;
    left: 0;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    -webkit-mask-image: radial-gradient(closest-side, transparent 0 calc(100% - 2.5px), #000 calc(100% - 2.5px) 100%);
    mask-image: radial-gradient(closest-side, transparent 0 calc(100% - 2.5px), #000 calc(100% - 2.5px) 100%);
  }

  .wps5-radar-ring-base {
    background: rgba(255, 255, 255, 0.42);
  }

  .wps5-radar-ring-sweep {
    background: conic-gradient(
      from 0deg,
      rgba(255, 255, 255, 0.85) 0deg,
      rgba(255, 255, 255, 0.30) 90deg,
      rgba(255, 255, 255, 0.04) 180deg,
      rgba(255, 255, 255, 0.04) 360deg
    );
    animation:
      wps5-radar-spin 12s linear infinite,
      wps5-radar-fade 12s ease-in-out infinite;
    will-change: transform, opacity;
  }

  @keyframes wps5-radar-spin {
    0%      { transform: rotate(0deg); }
    33.333% { transform: rotate(0deg); }
    66.667% { transform: rotate(360deg); }
    100%    { transform: rotate(360deg); }
  }

  @keyframes wps5-radar-fade {
    0%      { opacity: 0; }
    16.667% { opacity: 0; }
    33.333% { opacity: 1; }
    66.667% { opacity: 1; }
    83.333% { opacity: 0; }
    100%    { opacity: 0; }
  }

  /* El destello glint animaba left/top (propiedades de layout): obligaba a
     recalcular el layout en cada frame. Ahora se desplaza con translate3d,
     que lo resuelve el compositor sin tocar el layout. Los porcentajes van
     referidos al propio elemento (la mitad de ancho y el 400% de alto que
     tenía respecto a su contenedor). */
  @keyframes shimmerMove {
    0%   { transform: translate3d(-200%, -25%, 0) rotate(35deg); }
    100% { transform: translate3d(400%, 50%, 0) rotate(35deg); }
  }
`;

export default function RadarFocusWrapper({
    isFocused,
    children,
    size = 164,
    innerSize = 150,
    borderRadius = '50%',
}: RadarFocusWrapperProps) {

    // Inyectar los estilos globales de CSS una sola vez
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        if (document.getElementById(RADAR_GLOBAL_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = RADAR_GLOBAL_STYLE_ID;
        style.textContent = RADAR_GLOBAL_CSS;
        document.head.appendChild(style);
    }, []);

    // El canvas original pintaba un anillo de 2.5px de grosor a radio
    // (size / 2 - 5). La máscara radial del CSS reproduce ese mismo anillo.
    const ringRadius = Math.max(1, size / 2 - 5);
    const ringSize = ringRadius * 2;
    // El anillo se posiciona con left/top (no con transform) para que la
    // animación de rotación pueda usar `transform` sin pelearse con el
    // centrado.
    const ringOffset = (size - ringSize) / 2;

    return (
        <View style={[styles.wrapper, { width: size, height: size }]}>
            {/* 1. RADAR (Capas CSS animadas por el compositor) */}
            {isFocused && Platform.OS === 'web' && (
                <>
                    {/* @ts-ignore */}
                    <div
                        className="wps5-radar-ring wps5-radar-ring-base"
                        style={{
                            width: ringSize,
                            height: ringSize,
                            left: ringOffset,
                            top: ringOffset,
                        }}
                    />
                    {/* @ts-ignore */}
                    <div
                        className="wps5-radar-ring wps5-radar-ring-sweep"
                        style={{
                            width: ringSize,
                            height: ringSize,
                            left: ringOffset,
                            top: ringOffset,
                        }}
                    />
                </>
            )}

            {/* 2. TU ELEMENTO (En el centro) */}
            <View style={{ zIndex: 1 }}>
                {children}
            </View>

            {/* 3. SHIMMER GLINT (Encima del elemento) */}
            {isFocused && Platform.OS === 'web' && (
                <div style={{
                    position: 'absolute',
                    width: innerSize,
                    height: innerSize,
                    borderRadius: borderRadius,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                    zIndex: 2,
                }}>
                    <div style={{
                        position: 'absolute',
                        width: innerSize * 0.5,
                        height: '400%',
                        top: '-150%',
                        left: '-100%',
                        background: 'linear-gradient(to right, transparent 0%, rgba(255,255,255,0) 25%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0) 75%, transparent 100%)',
                        animation: 'shimmerMove 6s ease-in-out infinite',
                    }} />
                </div>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
});
