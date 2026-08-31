import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';

interface BackgroundVideoProps {
  source: any;
  style?: any;
  resizeMode?: 'cover' | 'contain';
  muted?: boolean;
  shouldPlay?: boolean;
  isLooping?: boolean;
}

function resolveVideoSource(source: any) {
  if (!source) return undefined;
  if (typeof source === 'number') {
    return Image.resolveAssetSource(source)?.uri;
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
}: BackgroundVideoProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const uri = useMemo(() => resolveVideoSource(source), [source]);

  if (Platform.OS === 'web') {
    if (!uri) return null;

    return (
      <video
        key={`${reloadKey}-${uri}`}
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
        onError={() => setReloadKey((current) => current + 1)}
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
      onError={(error) => {
        console.warn('Background video failed to load, reloading it.', error);
        setReloadKey((current) => current + 1);
      }}
    />
  );
}
