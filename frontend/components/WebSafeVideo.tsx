import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';

type Resize = 'cover' | 'contain' | 'stretch';

function resolveUri(source: any): string {
  if (!source) return '';
  if (typeof source === 'string') return source;
  return source.uri || source.default || '';
}

function toObjectFit(resizeMode: Resize): 'cover' | 'contain' | 'fill' {
  if (resizeMode === 'contain') return 'contain';
  if (resizeMode === 'stretch') return 'fill';
  return 'cover';
}

function toExpoResize(resizeMode: Resize) {
  if (resizeMode === 'contain') return ResizeMode.CONTAIN;
  if (resizeMode === 'stretch') return ResizeMode.STRETCH;
  return ResizeMode.COVER;
}

interface WebSafeVideoProps {
  source: any;
  style?: any;
  resizeMode?: Resize;
  shouldPlay?: boolean;
  isLooping?: boolean;
  isMuted?: boolean;
  onEnded?: () => void;
  onError?: () => void;
  // Se dispara la primera vez que el video empieza a reproducir frames reales
  // (no solo "solicitado a reproducir"). Útil para saber cuándo es seguro
  // mostrar la ventana de Electron sin que el usuario vea un frame trabado.
  onPlaying?: () => void;
}

export default function WebSafeVideo({
  source,
  style,
  resizeMode = 'cover',
  shouldPlay = true,
  isLooping = false,
  isMuted = false,
  onEnded,
  onError,
  onPlaying,
}: WebSafeVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const notifiedPlayingRef = useRef(false);
  const uri = resolveUri(source);

  useEffect(() => {
    notifiedPlayingRef.current = false;
  }, [uri]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !shouldPlay) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = isMuted;
    const play = el.play();
    if (play && typeof play.catch === 'function') {
      play.catch(() => {
        // Si el autoplay con audio falla, reintenta muteado para no dejar el frame trabado.
        if (!el.muted) {
          el.muted = true;
          el.play().catch(() => onError?.());
        } else {
          onError?.();
        }
      });
    }
  }, [uri, shouldPlay, isMuted, onError]);

  if (Platform.OS === 'web') {
    const flat = StyleSheet.flatten(style) as Record<string, unknown> | undefined;
    return (
      // @ts-expect-error native HTML video on react-native-web
      <video
        key={uri}
        ref={videoRef}
        src={uri}
        autoPlay={shouldPlay}
        loop={isLooping}
        muted={isMuted}
        playsInline
        preload="auto"
        onEnded={() => {
          if (!isLooping) onEnded?.();
        }}
        onError={() => onError?.()}
        onPlaying={() => {
          if (!notifiedPlayingRef.current) {
            notifiedPlayingRef.current = true;
            onPlaying?.();
          }
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: toObjectFit(resizeMode),
          backgroundColor: '#000',
          ...flat,
        }}
      />
    );
  }

  const handleStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.isPlaying && !notifiedPlayingRef.current) {
      notifiedPlayingRef.current = true;
      onPlaying?.();
    }
    if (status.didJustFinish && !isLooping) {
      onEnded?.();
    }
  };

  return (
    <Video
      source={source}
      style={style}
      resizeMode={toExpoResize(resizeMode)}
      shouldPlay={shouldPlay}
      isLooping={isLooping}
      isMuted={isMuted}
      onPlaybackStatusUpdate={handleStatus}
      onError={onError}
    />
  );
}