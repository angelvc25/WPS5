import React from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { VisualTheme } from '@/constants/themes';

/** Alto (px) del degradado que suaviza el borde del recorte (solo web). */
const CLIP_FADE_PX = 48;

/**
 * Capa de personaje del tema visual: misma composición que el fondo
 * (cover a pantalla completa) pero por encima del carrusel.
 * pointerEvents none para no bloquear tarjetas ni el header.
 *
 * clipBottom: si se indica, la capa se recorta a los primeros `clipBottom` px de la
 * pantalla (zona del carrusel), de modo que el personaje no cubre los widgets.
 * La composición de la imagen no cambia: sigue siendo la de pantalla completa.
 */
export default function ThemeCharacterOverlay({
  theme,
  visible,
  clipBottom = null,
}: {
  theme: VisualTheme | null;
  visible: boolean;
  clipBottom?: number | null;
}) {
  const { height: windowHeight } = useWindowDimensions();

  if (!theme?.foreground || !visible) return null;

  const clipped = clipBottom != null && clipBottom > 0;

  const clippedWebMask =
    Platform.OS === 'web'
      ? ({
        WebkitMaskImage: `linear-gradient(to bottom, #000 calc(100% - ${CLIP_FADE_PX}px), transparent 100%)`,
        maskImage: `linear-gradient(to bottom, #000 calc(100% - ${CLIP_FADE_PX}px), transparent 100%)`,
      } as any)
      : null;

  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(250)}
      style={clipped ? [styles.layerClipped, { height: clipBottom as number }, clippedWebMask] : styles.layer}
    >
      <Image
        source={theme.foreground}
        style={clipped ? [styles.imageClipped, { height: windowHeight }] : styles.image}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        {...(Platform.OS === 'web' ? { draggable: false } : {})}
      />
      {!clipped && <View pointerEvents="none" style={styles.bottomFade} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    elevation: 3,
  },
  // Recortada a la zona del carrusel: arranca arriba y su alto lo fija `clipBottom`.
  layerClipped: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 3,
    elevation: 3,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  // Imagen a alto de pantalla completa dentro del contenedor recortado.
  imageClipped: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // El footer / prompts quedan más legibles sin recortar al personaje.
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web'
      ? {
        backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 100%)',
      }
      : {}),
  } as any,
});