import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';


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
// Ahora el radar es CSS puro: un aro (border + máscara) con un gradiente
// cónico que gira. Solo anima `transform`, así que la mueve el compositor
// en la GPU sin ningún JS por frame.
const RADAR_GLOBAL_STYLE_ID = 'wps5-radar-global-styles';

const RADAR_GLOBAL_CSS = `
  /* ── ARO BASE ──────────────────────────────────────────────────────────────
     El aro se dibuja con un border real + border-radius 50%. El navegador
     antialiasa el borde de una circunferencia, así que el contorno queda
     limpio a cualquier resolución.

     Antes se recortaba con un radial-gradient enmascarado con parada en seco
     (transparent 0 calc(100% - 2.5px)): ese salto brusco NO lo antialiasa el
     rasterizador, por lo que el borde interior del aro salía escalonado
     ("pixelado"). Medido: el perfil de luminancia pasaba de 0 a 254 de un
     píxel al siguiente. */
  .wps5-radar-base {
    position: absolute;
    border-radius: 50%;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 0;
    border: var(--wps5-radar-t, 3px) solid rgba(255, 255, 255, 0.42);
  }

  /* ── BARRIDO ───────────────────────────────────────────────────────────────
     Gradiente cónico con los MISMOS colores que los SpinningBorder (respeta
     --wps-accent / --wps-accent-glow del tema), recortado al aro con una
     máscara radial de bordes SUAVES: en vez de paradas en seco hay tramos
     intermedios, de modo que el aro se difumina en los dos lados y no
     aparece el contorno escalonado. */
  .wps5-radar-sweep {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    will-change: transform;
    animation: wps5-radar-spin 9.8s linear infinite;
    -webkit-mask-image: radial-gradient(closest-side, transparent 0 calc(100% - var(--wps5-radar-t, 3px) - 1px), rgba(0, 0, 0, 0.55) calc(100% - var(--wps5-radar-t, 3px)), #000 calc(100% - var(--wps5-radar-t, 3px) + 0.6px), #000 calc(100% - 1px), rgba(0, 0, 0, 0) 100%);
    mask-image: radial-gradient(closest-side, transparent 0 calc(100% - var(--wps5-radar-t, 3px) - 1px), rgba(0, 0, 0, 0.55) calc(100% - var(--wps5-radar-t, 3px)), #000 calc(100% - var(--wps5-radar-t, 3px) + 0.6px), #000 calc(100% - 1px), rgba(0, 0, 0, 0) 100%);
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
  }

  @keyframes wps5-radar-spin {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* El destello glint animaba left/top (propiedades de layout): obligaba a
     recalcular el layout en cada frame. Ahora se desplaza con translate3d,
     que lo resuelve el compositor sin tocar el layout. Mismo recorrido que el
     shimmer de los SpinningBorder (48deg, entrada y salida suaves). */
  @keyframes shimmerMove {
    0%   { transform: translate3d(-160%, -50%, 0) rotate(48deg); opacity: 0; }
    15%  { opacity: 1; }
    50%  { opacity: 1; }
    70%  { transform: translate3d(130%, -50%, 0) rotate(48deg); opacity: 0; }
    100% { transform: translate3d(130%, -50%, 0) rotate(48deg); opacity: 0; }
  }
`;

export default function RadarFocusWrapper({
    isFocused,
    children,
    size = 164,
    innerSize = 150,
    borderRadius = '50%',
}: RadarFocusWrapperProps) {

    const radarEntering = useMemo(
        () =>
            new Keyframe({
                0: {
                    opacity: 0,
                    transform: [
                        { scaleX: 1.03 },
                        { scaleY: 1.08 },
                    ],
                },
                100: {
                    opacity: 1,
                    transform: [
                        { scaleX: 1 },
                        { scaleY: 1 },
                    ],
                    easing: Easing.out(Easing.cubic),
                },
            })
                .delay(90)
                .duration(320),
        [],
    );

    const radarExiting = useMemo(
        () =>
            new Keyframe({
                0: {
                    opacity: 1,
                    transform: [
                        { scaleX: 1 },
                        { scaleY: 1 },
                    ],
                },
                100: {
                    opacity: 0,
                    transform: [
                        { scaleX: 1.03 },
                        { scaleY: 1.08 },
                    ],
                    easing: Easing.out(Easing.cubic),
                },
            }).duration(200),
        [],
    );

    // Inyectar los estilos globales de CSS una sola vez
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        if (document.getElementById(RADAR_GLOBAL_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = RADAR_GLOBAL_STYLE_ID;
        style.textContent = RADAR_GLOBAL_CSS;
        document.head.appendChild(style);
    }, []);

    // El anillo original se pintaba a radio (size / 2 - 5) con 2.5px de
    // grosor. Se mantiene esa geometría (el aro queda a 5px del borde del
    // wrapper) y el grosor se ajusta al tamaño para que no se vea ni muy
    // fino en los avatares ni muy gordo en los iconos.
    const ringSize = Math.max(4, size - 10);
    const ringThickness = size >= 150 ? 3 : 2;
    const ringOffset = (size - ringSize) / 2;

    // El shimmer va por encima del elemento interno y centrado dentro del
    // wrapper (offset explícito: no depende del static position de flex).
    const shimmerOffset = Math.max(0, (size - innerSize) / 2);

    return (
        <View style={[styles.wrapper, { width: size, height: size }]}>
            {/* 1. RADAR (Capas CSS animadas por el compositor) */}
            {isFocused && Platform.OS === 'web' && (
                <Animated.View
                    entering={radarEntering}
                    exiting={radarExiting}
                    pointerEvents="none"
                    style={styles.radarAnimation}
                >
                    {/* Aro base: contorno siempre visible */}
                    {/* @ts-ignore */}
                    <div
                        className="wps5-radar-base"
                        style={{
                            width: ringSize,
                            height: ringSize,
                            left: ringOffset,
                            top: ringOffset,
                            ['--wps5-radar-t' as any]: `${ringThickness}px`,
                        } as any}
                    />

                    {/* Barrido: gradiente cónico del tema girando */}
                    {/* @ts-ignore */}
                    <div
                        className="wps5-radar-sweep"
                        style={{
                            width: ringSize,
                            height: ringSize,
                            left: ringOffset,
                            top: ringOffset,
                            ['--wps5-radar-t' as any]: `${ringThickness}px`,
                        } as any}
                    />
                </Animated.View>
            )}

            {/* 2. TU ELEMENTO (En el centro) */}
            <View style={{ zIndex: 1 }}>
                {children}
            </View>

            {/* 3. SHIMMER GLINT (Encima del elemento) */}
            {isFocused && innerSize > 0 && Platform.OS === 'web' && (
                <div style={{
                    position: 'absolute',
                    width: innerSize,
                    height: innerSize,
                    top: shimmerOffset,
                    left: shimmerOffset,
                    borderRadius: borderRadius,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                    zIndex: 2,
                }}>
                    <div style={{
                        position: 'absolute',
                        width: '140%',
                        height: '420%',
                        top: '50%',
                        left: '50%',
                        willChange: 'transform',
                        background: 'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.01) 20%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.01) 80%, transparent 100%)',
                        animation: 'shimmerMove 5s cubic-bezier(0.42, 0, 0.58, 1) infinite',
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

    radarAnimation: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
    },
});
