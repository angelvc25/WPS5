import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Modal, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { soundService } from '@/services/soundService';
import BackgroundVideo from './BackgroundVideo';
import SpinningBorderSearch from './SpinningBorderSearch';
import { useTranslation } from '@/contexts/LanguageContext';

export interface DeleteConfirmItem {
  title?: string;
  /** Fuente de imagen ya lista para <Image source={...} /> (uri object o require) */
  image?: any;
}

interface DeleteConfirmViewProps {
  visible: boolean;
  item: DeleteConfirmItem | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Vista de confirmación de eliminación a pantalla completa (no un modal flotante).
 * Se usa tanto desde el GameContextMenu del carrusel como desde el botón
 * "Eliminar" dentro de GameDetailView. Es un componente autocontenido: maneja
 * su propio foco (Cancelar / Aceptar) con teclado y mando.
 */
export default function DeleteConfirmView({ visible, item, onCancel, onConfirm }: DeleteConfirmViewProps) {
  const { t } = useTranslation();
  const [focusIndex, setFocusIndex] = useState(0); // 0 = Cancelar, 1 = Aceptar
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scale = Math.min(windowWidth / 1920, windowHeight / 1080);
  const s = (v: number) => Math.round(v * scale);

  useEffect(() => {
    if (visible) setFocusIndex(0);
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowLeft', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        e.stopPropagation();
        soundService.playBack?.();
        onCancel();
      } else if (e.key === 'ArrowRight') {
        soundService.playNavigation();
        setFocusIndex(1);
      } else if (e.key === 'ArrowLeft') {
        soundService.playNavigation();
        setFocusIndex(0);
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'x' || e.key === 'X') {
        soundService.playActivation?.();
        setFocusIndex((current) => {
          if (current === 0) onCancel();
          else onConfirm();
          return current;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, onCancel, onConfirm]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <Animated.View style={styles.root} entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
        <BackgroundVideo
          source={require('@/assets/video/waves_ajustes.mp4')}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          shouldPlay
          isLooping
          muted
        />
        <View style={styles.dim} />

        <View style={styles.content}>
          <Text style={[styles.message, { fontSize: s(26), maxWidth: s(760) }]}>
            {t('settings.deleteGame')}
          </Text>

          <View style={[styles.itemRow, { marginTop: s(56) }]}>
            <View style={[styles.cover, { width: s(120), height: s(120), borderRadius: s(2) }]}>
              {item?.image ? (
                <Image source={item.image} style={styles.coverImage} contentFit="cover" />
              ) : (
                <View style={styles.coverFallback} />
              )}
            </View>
            <Text style={[styles.title, { fontSize: s(24), marginLeft: s(24), maxWidth: s(420) }]} numberOfLines={3}>
              {item?.title || ''}
            </Text>
          </View>

          <View style={[styles.buttonsRow, { marginTop: s(80), gap: s(24) }]}>
            <TouchableOpacity
              style={[
                styles.btn,
                { paddingVertical: s(15), paddingHorizontal: s(46), borderRadius: s(28) },
                focusIndex === 0 && styles.btnFocused,
              ]}
              activeOpacity={0.85}
              onPress={() => { soundService.playActivation?.(); onCancel(); }}
              {...(Platform.OS === 'web' ? ({ onMouseEnter: () => setFocusIndex(0) } as any) : {})}
            >
              {focusIndex === 0 && <SpinningBorderSearch size={s(112)} spread={7} borderRadius={32} />}
              <Text style={[styles.btnText, { fontSize: s(18) }, focusIndex === 0 && styles.btnTextFocused]}>
                {t('settings.cancel')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnDanger,
                { paddingVertical: s(15), paddingHorizontal: s(46), borderRadius: s(28) },
                focusIndex === 1 && styles.btnDangerFocused,
              ]}
              activeOpacity={0.85}
              onPress={() => { soundService.playActivation?.(); onConfirm(); }}
              {...(Platform.OS === 'web' ? ({ onMouseEnter: () => setFocusIndex(1) } as any) : {})}
            >
              {focusIndex === 1 && <SpinningBorderSearch size={s(112)} spread={7} borderRadius={32} />}
              <Text style={[styles.btnText, { fontSize: s(18) }, focusIndex === 1 && styles.btnDangerTextFocused]}>
                {t('settings.accept')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07080cff',
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 8, 12, 0.6)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  message: {
    color: '#FFFFFF',
    fontFamily: 'SSTLight',
    fontWeight: '300',
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 34,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cover: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'SSTLight',
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 250,
  },
  btnFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  btnDanger: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  btnDangerFocused: {
    backgroundColor: '#ffffffff',
    borderColor: '#ffffffff',
  },
  btnText: {
    color: '#FFFFFF',
    fontFamily: 'SSTMedium',
    fontWeight: '500',
  },
  btnTextFocused: {
    color: '#000000',
  },
  btnDangerTextFocused: {
    color: '#000000ff',
  },
});
