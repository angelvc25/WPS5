import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';
import { useTranslation } from '@/contexts/LanguageContext';
import { soundService } from '@/services/soundService';

interface SoundExpandedCardProps {
  isOpen: boolean;
  onClose: () => void;
  anchorLeft?: number;
  anchorTop?: number;
}

interface SliderRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value: number; // 0.0 to 1.0
  isFocused: boolean;
  onSelect: () => void;
  onChange: (val: number) => void;
}

function SoundSliderRow({
  icon,
  title,
  subtitle,
  value,
  isFocused,
  onSelect,
  onChange,
}: SliderRowProps) {
  const containerRef = useRef<any>(null);
  const isDraggingRef = useRef(false);

  const calculateValueFromClientX = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect?.();
      if (!rect || rect.width <= 0) return;
      const rawPct = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, rawPct));
      // Redondear a múltiplos de 0.01
      const rounded = Math.round(clamped * 100) / 100;
      onChange(rounded);
    },
    [onChange]
  );

  const handlePointerDown = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    isDraggingRef.current = true;
    calculateValueFromClientX(e.clientX ?? e.nativeEvent?.clientX);

    const onPointerMove = (moveEvt: MouseEvent) => {
      if (!isDraggingRef.current) return;
      calculateValueFromClientX(moveEvt.clientX);
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const percentage = Math.round(value * 100);

  return (
    <View
      style={[styles.sliderRowCard, isFocused && styles.sliderRowCardFocused]}
      // @ts-ignore
      onClick={onSelect}
    >
      <View style={styles.sliderRowTop}>
        <View style={styles.sliderRowHeaderLeft}>
          <View style={styles.rowIconWrap}>
            <Ionicons name={icon} size={20} color="#FFFFFF" />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>{title}</Text>
            {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        <Text style={[styles.percentageText, isFocused && styles.percentageTextFocused]}>
          {percentage}%
        </Text>
      </View>

      <View
        ref={containerRef}
        style={styles.sliderTrackContainer}
        // @ts-ignore
        onPointerDown={handlePointerDown}
      >
        <View style={styles.sliderTrackBg} pointerEvents="none">
          <View style={[styles.sliderTrackFill, { width: `${percentage}%` }]} />
          <View style={[styles.sliderThumb, { left: `${percentage}%` }]} />
        </View>
      </View>
    </View>
  );
}

export default function SoundExpandedCard({
  isOpen,
  onClose,
  anchorLeft = 0,
  anchorTop = 0,
}: SoundExpandedCardProps) {
  const { width: winW, height: winH } = useWindowDimensions();
  const { t } = useTranslation();

  const [launcherVol, setLauncherVol] = useState(() => soundService.getLauncherVolume());
  const [gameVol, setGameVol] = useState(() => soundService.getGameVolume());
  const [focusedRow, setFocusedRow] = useState(0); // 0 = Launcher, 1 = Game
  const [shouldRender, setShouldRender] = useState(isOpen);

  const CARD_W = Math.round(Math.min(Math.max(winW * 0.25, 380), 440));

  const backdropOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(16);
  const cardScale = useSharedValue(0.96);

  // Sincronizar volúmenes en tiempo real con soundService
  useEffect(() => {
    return soundService.subscribeVolumes(({ launcherVolume, gameVolume }) => {
      setLauncherVol(launcherVolume);
      setGameVol(gameVolume);
    });
  }, []);

  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      backdropOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
      cardOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
      cardTranslateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      cardScale.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
      setFocusedRow(0);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) });
      cardOpacity.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) });
      cardTranslateY.value = withTiming(16, { duration: 180, easing: Easing.in(Easing.cubic) });
      cardScale.value = withTiming(0.97, { duration: 180, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setShouldRender)(false);
      });
    }
  }, [isOpen]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }, { scale: cardScale.value }],
  }));

  const handleUpdateLauncherVolume = useCallback((val: number) => {
    soundService.setLauncherVolume(val);
  }, []);

  const handleUpdateGameVolume = useCallback((val: number) => {
    soundService.setGameVolume(val);
  }, []);

  // Navegación con teclado y mando (Up/Down, Left/Right, Escape, X/Enter)
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        e.stopPropagation();
        soundService.playBack?.();
        onClose();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setFocusedRow((prev) => Math.max(0, prev - 1));
        soundService.playNavigation();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setFocusedRow((prev) => Math.min(1, prev + 1));
        soundService.playNavigation();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        if (focusedRow === 0) {
          const next = Math.max(0, Math.round((launcherVol - 0.05) * 100) / 100);
          soundService.setLauncherVolume(next);
        } else {
          const next = Math.max(0, Math.round((gameVol - 0.05) * 100) / 100);
          soundService.setGameVolume(next);
        }
        soundService.playNavigation();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        if (focusedRow === 0) {
          const next = Math.min(1, Math.round((launcherVol + 0.05) * 100) / 100);
          soundService.setLauncherVolume(next);
        } else {
          const next = Math.min(1, Math.round((gameVol + 0.05) * 100) / 100);
          soundService.setGameVolume(next);
        }
        soundService.playNavigation();
      } else if (e.key === 'Enter' || e.key === 'x' || e.key === 'X') {
        // Toggle mute para la fila con foco
        e.preventDefault();
        e.stopPropagation();
        if (focusedRow === 0) {
          soundService.setLauncherVolume(launcherVol > 0 ? 0 : 0.8);
        } else {
          soundService.setGameVolume(gameVol > 0 ? 0 : 0.8);
        }
        soundService.playActivation?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, focusedRow, launcherVol, gameVol, onClose]);

  if (!shouldRender) return null;

  const clampedLeft =
    anchorLeft > 0
      ? Math.min(Math.max(anchorLeft - CARD_W / 2, 20), winW - CARD_W - 20)
      : (winW - CARD_W) / 2;
  const bottomOffset = anchorTop > 0 ? Math.max(20, winH - anchorTop + 16) : 90;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }, backdropStyle]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <View style={[styles.anchorWrap, { left: clampedLeft, bottom: bottomOffset }]} pointerEvents="box-none">
        <Animated.View style={[styles.card, { width: CARD_W }, cardAnimStyle]}>
          {/* Header Superior con título idéntico a PS5 */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('soundExpanded.title')}</Text>
            <TouchableOpacity
              style={styles.headerCloseBtn}
              onPress={() => {
                soundService.playBack?.();
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          {/* Fila Dispositivo de Salida (Estilo de la captura PS5) */}
          <View style={styles.outputDeviceRow}>
            <View style={styles.outputDeviceLeft}>
              <Ionicons name="tv-outline" size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
              <Text style={styles.outputDeviceTitle}>{t('soundExpanded.outputDevice')}</Text>
            </View>
            <Text style={styles.outputDeviceValue}>{t('soundExpanded.defaultOutput')}</Text>
          </View>

          {/* Subtítulo de sección */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('soundExpanded.volumeSection')}</Text>
          </View>

          {/* Control 1: Volumen del launcher (ambiente e interfaz) */}
          <SoundSliderRow
            icon="volume-high"
            title={t('soundExpanded.launcherVolume')}
            subtitle={t('soundExpanded.launcherDesc')}
            value={launcherVol}
            isFocused={focusedRow === 0}
            onSelect={() => setFocusedRow(0)}
            onChange={handleUpdateLauncherVolume}
          />

          {/* Control 2: Volumen de juego (música al enfocar juegos) */}
          <SoundSliderRow
            icon="musical-notes"
            title={t('soundExpanded.gameVolume')}
            subtitle={t('soundExpanded.gameDesc')}
            value={gameVol}
            isFocused={focusedRow === 1}
            onSelect={() => setFocusedRow(1)}
            onChange={handleUpdateGameVolume}
          />

          {/* Footer con pistas de control PlayStation */}
          <View style={styles.footerHints}>
            <View style={styles.hintItem}>
              <PSIcon char={PSIcons.dpadLeft} size={13} color="rgba(255,255,255,0.7)" />
              <PSIcon char={PSIcons.dpadRight} size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.hintText}>{t('soundExpanded.hintAdjust')}</Text>
            </View>
            <View style={styles.hintItem}>
              <PSIcon char={PSIcons.circle} size={15} color="rgba(255,255,255,0.7)" />
              <Text style={styles.hintText}>{t('soundExpanded.hintClose')}</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchorWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: 'rgba(18, 21, 26, 0.97)',
    borderRadius: 12,
    //borderWidth: 1,
    //borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 12,
    // @ts-ignore web shadow
    boxShadow: '0 24px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
  } as any,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SSTRg',
    letterSpacing: 0.3,
  },
  headerCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outputDeviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    //borderWidth: 1,
    //borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginBottom: 16,
  },
  outputDeviceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  outputDeviceTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SSTLight',
    letterSpacing: 0.2,
  },
  outputDeviceValue: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
    fontFamily: 'SSTLight',
  },
  sectionHeader: {
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    fontFamily: 'SSTLight',
    letterSpacing: 0.5,
  },
  sliderRowCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 10,
  },
  sliderRowCardFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  sliderRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sliderRowHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  rowIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SSTLight',
    letterSpacing: 0.2,
  },
  rowSubtitle: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    fontFamily: 'SSTLight',
    marginTop: 1,
  },
  percentageText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    fontFamily: 'SSTMedium',
    minWidth: 38,
    textAlign: 'right',
  },
  percentageTextFocused: {
    color: '#FFFFFF',
  },
  sliderTrackContainer: {
    height: 22,
    justifyContent: 'center',
    // @ts-ignore
    cursor: 'pointer',
    touchAction: 'none',
  },
  sliderTrackBg: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    position: 'relative',
    justifyContent: 'center',
  },
  sliderTrackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    left: 0,
  } as any,
  sliderThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    top: -5,
    marginLeft: -7,
    // @ts-ignore
    boxShadow: '0 0 8px rgba(255, 255, 255, 0.5)',
  } as any,
  footerHints: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontFamily: 'SSTLight',
  },
});
