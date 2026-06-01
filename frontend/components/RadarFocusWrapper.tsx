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

function startRadarAnimation(canvasId: string, size: number): () => void {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return () => { };
    const ctx = canvas.getContext('2d')!;

    // Dimensiones dinámicas basadas en el prop 'size'
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) - 5;
    const LINE = 2.5;
    const CYCLE = 12;
    let start: number | null = null;
    let rafId: number;

    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const draw = (ts: number) => {
        if (!start) start = ts;
        const elapsed = ((ts - start) / 1000) % CYCLE;
        ctx.clearRect(0, 0, size, size);

        let blend = 0, rotation = 0;
        if (elapsed < 2) { blend = 0; rotation = 0; }
        else if (elapsed < 4) { blend = easeInOut((elapsed - 2) / 2); rotation = 0; }
        else if (elapsed < 8) { blend = 1; rotation = easeInOut((elapsed - 4) / 4) * Math.PI * 2; }
        else if (elapsed < 10) { blend = easeInOut(1 - (elapsed - 8) / 2); rotation = Math.PI * 2; }
        else { blend = 0; rotation = 0; }

        for (let i = 0; i < 360; i++) {
            const angleRot = (i / 360) * Math.PI * 2 + rotation;
            const cosVal = Math.cos(angleRot);
            const sweepA = (cosVal + 1) / 2;

            const solidAlpha = 0.55;
            const brightAlpha = 0.65;
            const fadeAlpha = 0.02;

            let alpha: number;
            if (blend === 0) {
                alpha = solidAlpha;
            } else {
                const target = fadeAlpha + sweepA * (brightAlpha - fadeAlpha);
                alpha = solidAlpha + blend * (target - solidAlpha);
            }

            const a0 = (i / 360) * Math.PI * 2 - Math.PI / 2;
            const a1 = ((i + 1.8) / 360) * Math.PI * 2 - Math.PI / 2;
            ctx.beginPath();
            ctx.arc(cx, cy, R, a0, a1);
            ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, alpha).toFixed(3)})`;
            ctx.lineWidth = LINE;
            ctx.stroke();
        }

        rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
}

export default function RadarFocusWrapper({
    id,
    isFocused,
    children,
    size = 164,
    innerSize = 150,
    borderRadius = '50%',
}: RadarFocusWrapperProps) {

    // Inyectar los Keyframes globales de CSS de forma segura una sola vez
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const styleId = 'radar-shimmer-global-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
        @keyframes shimmerMove {
          0%   { left: -100%; top: -100%; }
          100% { left: 200%;  top: 200%;  }
        }
      `;
            document.head.appendChild(style);
        }
    }, []);

    // Controlar la animación del radar por cada elemento de forma aislada
    useEffect(() => {
        if (Platform.OS !== 'web' || !isFocused) return;

        const t = setTimeout(() => {
            const cleanup = startRadarAnimation(`radar-${id}`, size);
            return cleanup;
        }, 35);

        return () => clearTimeout(t);
    }, [isFocused, id, size]);

    return (
        <View style={[styles.wrapper, { width: size, height: size }]}>
            {/* 1. RADAR CANVAS (Detrás) */}
            {isFocused && Platform.OS === 'web' && (
                <canvas
                    id={`radar-${id}`}
                    width={size}
                    height={size}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        pointerEvents: 'none',
                        zIndex: 0,
                    }}
                />
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
                        transform: 'rotate(35deg)',
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