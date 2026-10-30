import React from 'react';
import { Platform } from 'react-native';

export default function GpuWarmup() {
  if (Platform.OS !== 'web') return null;
  const base: React.CSSProperties = { position: 'absolute', inset: 0 };
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 96,
        height: 96,
        opacity: 0.02,
        pointerEvents: 'none',
        zIndex: 99999,
        overflow: 'hidden',
      }}
    >
      <style>{`@keyframes wps5WarmSpin { to { transform: rotate(360deg); } }`}</style>
      {/* conic + mask-composite (bordes giratorios) */}
      <div
        style={{
          ...base,
          border: '3px solid transparent',
          WebkitMaskImage: 'linear-gradient(#fff,#fff),linear-gradient(#fff,#fff)',
          WebkitMaskClip: 'border-box, padding-box',
          WebkitMaskComposite: 'destination-out',
          maskComposite: 'exclude',
        } as React.CSSProperties}
      >
        <div
          style={{
            ...base,
            animation: 'wps5WarmSpin 2s linear infinite',
            background: 'conic-gradient(from 0deg, #fff, #9bf, #fff)',
          }}
        />
      </div>
      {/* máscara radial (wipe del fondo) */}
      <div
        style={{
          ...base,
          background: '#888',
          WebkitMaskImage: 'radial-gradient(circle at 80% 50%, #000 20px, transparent 60px)',
        } as React.CSSProperties}
      />
      {/* backdrop blur (BlurView / menús) */}
      <div
        style={{
          ...base,
          backdropFilter: 'blur(20px)',
          background: 'rgba(255,255,255,0.05)',
        }}
      />
    </div>
  );
}
