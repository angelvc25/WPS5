import React, { useEffect, useRef } from 'react';
import { View, Platform } from 'react-native';

interface SpinningBorderProps {
  /** Width of the container in px */
  width: number;
  /** Height of the container in px */
  height: number;
  /** Border radius of the container in px */
  borderRadius?: number;
  /** Background color of the card (used to cut out the inner area if needed) */
  id: string; // unique id so multiple instances don't clash
}

// ─── Perimeter point builder ─────────────────────────────────────────────────
function buildPerimeterPoints(
  W: number,
  H: number,
  r: number,
  steps: number
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];

  const arc = (cx: number, cy: number, startAngle: number) => {
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (Math.PI / 2) * (i / steps);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };

  arc(r, r, Math.PI);             // top-left
  for (let i = 1; i <= steps; i++) pts.push({ x: r + (W - 2 * r) * (i / steps), y: 0 });
  arc(W - r, r, -Math.PI / 2);        // top-right
  for (let i = 1; i <= steps; i++) pts.push({ x: W, y: r + (H - 2 * r) * (i / steps) });
  arc(W - r, H - r, 0);                   // bottom-right
  for (let i = 1; i <= steps; i++) pts.push({ x: W - r - (W - 2 * r) * (i / steps), y: H });
  arc(r, H - r, Math.PI / 2);         // bottom-left
  for (let i = 1; i <= steps; i++) pts.push({ x: 0, y: H - r - (H - 2 * r) * (i / steps) });

  return pts;
}

// ─── Canvas radar hook ───────────────────────────────────────────────────────
function useRectRadar(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  W: number,
  H: number,
  borderRadius: number
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pts = buildPerimeterPoints(W, H, borderRadius, 20);
    const N = pts.length;
    const LINE = 4;
    const CYCLE = 12; // seconds

    let startT: number | null = null;
    let raf: number;

    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const draw = (ts: number) => {
      if (!startT) startT = ts;
      const elapsed = ((ts - startT) / 1000) % CYCLE;
      ctx.clearRect(0, 0, W, H);

      let blend = 0, rotOffset = 0;
      if (elapsed < 2) { blend = 0; rotOffset = 0; }
      else if (elapsed < 4) { blend = easeInOut((elapsed - 2) / 2); rotOffset = 0; }
      else if (elapsed < 8) { blend = 1; rotOffset = easeInOut((elapsed - 4) / 4); }
      else if (elapsed < 10) { blend = easeInOut(1 - (elapsed - 8) / 2); rotOffset = 1; }
      else { blend = 0; rotOffset = 0; }

      for (let i = 0; i < N - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        const normPos = i / N;
        const shifted = (normPos + rotOffset) % 1;

        // Half-moon: one half near full opacity, opposite half near 0
        const cosVal = Math.cos(shifted * Math.PI * 2);
        const sweepA = (cosVal + 1) / 2;

        const solidAlpha = 0.55;
        const brightAlpha = 0.70;
        const fadeAlpha = 0.02;

        let alpha: number;
        if (blend === 0) {
          alpha = solidAlpha;
        } else {
          const target = fadeAlpha + sweepA * (brightAlpha - fadeAlpha);
          alpha = solidAlpha + blend * (target - solidAlpha);
        }

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, alpha).toFixed(3)})`;
        ctx.lineWidth = LINE;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [W, H, borderRadius]);
}

// ─── Component ───────────────────────────────────────────────────────────────
export const SpinningBorder = ({
  width,
  height,
  borderRadius = 20,
  id,
}: SpinningBorderProps) => {
  if (Platform.OS !== 'web') return null;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useRectRadar(canvasRef as any, width, height, borderRadius);

  return (
    <>
      <style>{`
        @keyframes wc-content-shimmer-${id} {
          0%   { transform: translate(-160%, -50%) rotate(48deg); opacity: 0; }
          15%  { opacity: 1; }
          50%  { opacity: 1; }
          70%  { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
          100% { transform: translate(130%, -50%) rotate(48deg); opacity: 0; }
        }
        .wc-shimmer-${id} {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 140%;
          height: 420%;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(255,255,255,0.0)  25%,
            rgba(255,255,255,0.09) 50%,
            rgba(255,255,255,0.0)  75%,
            transparent 100%
          );
          animation: wc-content-shimmer-${id} 5s cubic-bezier(0.42, 0, 0.58, 1) infinite;
        }
      `}</style>

      {/* Radar border — canvas sits on top, inside overflow:hidden of the card */}
      {/* @ts-ignore */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />

      {/* Diagonal shimmer — also clipped by parent's overflow:hidden */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius,
          overflow: 'hidden',
          zIndex: 5,
          pointerEvents: 'none',
        } as any}
      >
        {/* @ts-ignore */}
        <div className={`wc-shimmer-${id}`} />
      </View>
    </>
  );
};

export default SpinningBorder;