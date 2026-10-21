import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { FpsReading } from '@/hooks/useFpsMeter';

interface FpsOverlayProps {
  reading: FpsReading | null;
  /** Frecuencia nativa del monitor, si se ha podido detectar. */
  displayRefreshRate?: number;
}

// Contador de fps superpuesto en la esquina. Se activa desde
// Ajustes -> GPU & Performance -> "Show FPS Counter".
const FpsOverlay = ({ reading, displayRefreshRate }: FpsOverlayProps) => {
  if (Platform.OS !== 'web') return null;
  if (!reading) return null;

  const capped = displayRefreshRate && reading.fps >= displayRefreshRate - 2;
  const color = !displayRefreshRate
    ? '#FFFFFF'
    : capped
      ? '#00D478'
      : reading.fps >= 100
        ? '#FFD166'
        : '#FF9F43';

  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={[styles.fps, { color }]}>{reading.fps} FPS</Text>
      <Text style={styles.detail}>
        {reading.frameMs.toFixed(1)} ms/frame
        {reading.longFrames > 0 ? `  ·  ${reading.longFrames} tirones` : ''}
      </Text>
      {displayRefreshRate ? (
        <Text style={styles.detail}>Monitor: {displayRefreshRate} Hz</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 9999,
  },
  fps: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  detail: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: 'monospace',
  },
});

export default FpsOverlay;
