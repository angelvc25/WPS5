import React from 'react';
import { View, Platform } from 'react-native';

interface SpinningBorderCircleProps {
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

export const SpinningBorderCirle = ({ size, spread, borderRadius }: SpinningBorderCircleProps) => {
    if (Platform.OS !== 'web') return null;
    return (
        <>
            <style>
                {`
                          /* --- ANIMACIÓN 1: BORDE GIRATORIO CON BASE VISIBLE --- */
                        @keyframes wc-spin-border {
                          0%   { transform: translate3d(-50%, -50%, 0) rotate(0deg); }
                          100% { transform: translate3d(-50%, -50%, 0) rotate(360deg); }
                        }
                        
                        .wc-spinning-container2 {
                          position: absolute;
                          top: -5px;
                          left: -6px;
                          right: -6px;
                          bottom: -5px;
                          border-radius: 32px;
                          z-index: 9999;
                          overflow: visible !important;

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
                          border: 3px solid transparent; 
                        }

                        .wc-spinning-inner {
                          position: absolute;
                          top: 50%;
                          left: 50%;
                          width: 300%;
                          height: 600%;
                          animation: wc-spin-border 9.8s linear infinite;
                          
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

                          /* --- ANIMACIÓN 2: DESTELLO DIAGONAL MÁS LARGO Y SUAVE --- */
                          @keyframes wc-content-shimmer {
                            0% { transform: translate3d(-160%, -50%, 0) rotate(48deg); opacity: 0; }
                            15% { opacity: 1; }
                            50% { opacity: 1; }
                            70% { transform: translate3d(130%, -50%, 0) rotate(48deg); opacity: 0; }
                            100% { transform: translate3d(130%, -50%, 0) rotate(48deg); opacity: 0; }
                          }
                          .wc-shimmer-line2 {
                            position: absolute;
                            top: 50%;
                            left: 50%;
                            width: 160%; 
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
                      `}
            </style>

            <div className="wc-spinning-container2" style={{ borderRadius: 999 }}>
                {/* El gradiente cónico gira aquí adentro, siendo recortado perfectamente por el padre */}
                <div className="wc-spinning-inner" />
            </div>
        </>
    );
};

export default SpinningBorderCirle;