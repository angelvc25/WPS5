import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as RNImage, Platform, StyleSheet } from 'react-native';
import { Video, ResizeMode } from './AppVideo';

// Cada cuánto revisamos si el <video> sigue avanzando (ms).
const HEALTH_CHECK_INTERVAL_MS = 4000;
// Si en este tiempo no avanzó currentTime (y debería estar reproduciendo),
// asumimos que Chromium perdió el contexto de decodificación en silencio
// (no dispara 'error', solo se queda congelado) y forzamos un remount.
const STALL_THRESHOLD_MS = 6000;

interface BackgroundVideoProps {
  source: any;
  style?: any;
  resizeMode?: 'cover' | 'contain';
  muted?: boolean;
  shouldPlay?: boolean;
  isLooping?: boolean;
  /**
   * Se llama cuando el video falla al cargar/reproducir, además del
   * reintento interno (que cambia `reloadKey`). Útil para que quien use
   * el componente pueda mostrar un fallback en vez de reintentar para
   * siempre con una fuente rota (por ejemplo, un archivo local borrado).
   */
  onError?: () => void;
  /**
   * Se llama una sola vez cuando el video termina de reproducirse
   * naturalmente (no aplica si isLooping es true, porque nunca termina).
   */
  onEnd?: () => void;
}

function resolveVideoSource(source: any) {
  if (!source) return undefined;
  if (typeof source === 'number') {
    return RNImage.resolveAssetSource(source)?.uri;
  }
  if (typeof source === 'string') return source;
  if (typeof source === 'object' && 'uri' in source && typeof source.uri === 'string') {
    return source.uri;
  }
  return undefined;
}

export default function BackgroundVideo({
  source,
  style,
  resizeMode = 'cover',
  muted = true,
  shouldPlay = true,
  isLooping = true,
  onError,
  onEnd,
}: BackgroundVideoProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const uri = useMemo(() => resolveVideoSource(source), [source]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastTimeRef = useRef(0);
  const lastAdvanceAtRef = useRef(0);

  // Watchdog: si el <video> deja de avanzar sin que llegue nunca un evento
  // 'error' (caso típico de pérdida silenciosa del decodificador en
  // Chromium/Electron tras reproducir un rato o por contención de GPU con
  // otro <video> montado al mismo tiempo), forzamos el remount igual que
  // haría onError. Esto es justo lo que le pasa a Settings/GameDetail y no
  // a Search: sus videos de fondo quedan montados mucho más tiempo (y a
  // veces hay dos reproduciendo el mismo archivo a la vez).
  useEffect(() => {
    if (Platform.OS !== 'web' || !shouldPlay) return undefined;

    lastAdvanceAtRef.current = Date.now();
    lastTimeRef.current = 0;

    const interval = setInterval(() => {
      const el = videoRef.current;
      if (!el || el.paused || el.ended) return;

      if (el.currentTime !== lastTimeRef.current) {
        lastTimeRef.current = el.currentTime;
        lastAdvanceAtRef.current = Date.now();
        return;
      }

      const stalledFor = Date.now() - lastAdvanceAtRef.current;
      if (stalledFor >= STALL_THRESHOLD_MS) {
        console.warn('Background video stalled without an error event, reloading it.');
        setReloadKey((current) => current + 1);
        onError?.();
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
    // Se reinicia cada vez que remontamos el <video> (reloadKey/uri cambian).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, uri, shouldPlay]);

  if (Platform.OS === 'web') {
    if (!uri) return null;

    const recover = () => {
      setReloadKey((current) => current + 1);
      onError?.();
    };

    return (
      <video
        key={`${reloadKey}-${uri}`}
        ref={videoRef}
        src={uri}
        autoPlay={shouldPlay}
        loop={isLooping}
        muted={muted}
        playsInline
        preload="auto"
        controls={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: resizeMode,
          pointerEvents: 'none',
        }}
        onError={recover}
        // 'stalled'/'emptied' son la forma en que Chromium reporta, sin
        // pasar por 'error', que perdió el recurso de decodificación
        // (típico cuando hay varios <video> con el mismo source a la vez).
        onStalled={recover}
        onEmptied={recover}
        onLoadedData={(e) => {
          // Si el autoplay quedó bloqueado (p. ej. tras recuperar foco en
          // Electron) intentamos reproducir manualmente en vez de dejarlo
          // congelado en gris sin que salte ningún evento de error.
          if (shouldPlay) {
            e.currentTarget.play().catch(() => {
              /* se reintentará vía el watchdog si sigue sin avanzar */
            });
          }
        }}
        onEnded={() => onEnd?.()}
      />
    );
  }

  return (
    <Video
      key={`native-${reloadKey}-${uri ?? 'asset'}`}
      source={source}
      style={style ?? StyleSheet.absoluteFillObject}
      resizeMode={resizeMode === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER}
      shouldPlay={shouldPlay}
      isLooping={isLooping}
      isMuted={muted}
      onError={(error: any) => {
        console.warn('Background video failed to load, reloading it.', error);
        setReloadKey((current) => current + 1);
        onError?.();
      }}
      onEnd={() => onEnd?.()}
    />
  );
}