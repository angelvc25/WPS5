import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from '@/contexts/LanguageContext';

// ─── Shimmer (mismo efecto que GameContextMenu) ──────────────────────────────
function ShimmerOverlay() {
  if (Platform.OS !== 'web') return null;

  return (
    <>
      <style>{`
        @keyframes wc-content-shimmer {
          0%   { transform: translate3d(-160%, -50%, 0) rotate(-48deg); opacity: 0; }
          15%  { opacity: 1; }
          50%  { opacity: 1; }
          70%  { transform: translate3d(130%, -50%, 0) rotate(-48deg); opacity: 0; }
          100% { transform: translate3d(130%, -50%, 0) rotate(-48deg); opacity: 0; }
        }
        .wc-shimmer-line {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 140%;
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
          pointer-events: none;
          z-index: 20;
        }
      `}</style>
      <div className="wc-shimmer-line" />
    </>
  );
}

export type ProfileMenuMode = 'menu' | 'confirm';

interface ProfileContextMenuProps {
  /** 'menu' = lista de acciones · 'confirm' = confirmación de borrado */
  mode: ProfileMenuMode;
  focusedIndex: number;
  userName: string;
  onPressItem: (index: number) => void;
}

const BASE_MENU_WIDTH = 320;
const BASE_ITEM_HEIGHT = 50;
const GLOW_DURATION = 180;
const MAX_OPTIONS = 2;

export default function ProfileContextMenu({
  mode,
  focusedIndex,
  userName,
  onPressItem,
}: ProfileContextMenuProps) {
  const { t } = useTranslation();

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scale = useMemo(
    () => Math.min(windowWidth / 1920, windowHeight / 1080),
    [windowWidth, windowHeight]
  );
  const s = (v: number) => Math.max(1, Math.round(v * scale));

  const MENU_WIDTH = s(BASE_MENU_WIDTH);
  const ITEM_HEIGHT = s(BASE_ITEM_HEIGHT);

  const options =
    mode === 'menu'
      ? [{ label: t('userSelect.deleteProfile'), danger: true }]
      : [
          { label: t('userSelect.deleteConfirmAction'), danger: true },
          { label: t('common.cancel'), danger: false },
        ];

  // Glow animado por fila: se desvanece al mover el foco.
  const glowAnims = useRef(
    Array.from({ length: MAX_OPTIONS }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    glowAnims.forEach((value, i) => {
      Animated.timing(value, {
        toValue: i === focusedIndex ? 1 : 0,
        duration: GLOW_DURATION,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    });
  }, [focusedIndex, mode]);

  return (
    <View style={[styles.container, { width: MENU_WIDTH, padding: s(6), borderRadius: s(3) }]}>
      {Platform.OS === 'web' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              linear-gradient(
                45deg,
                rgba(232, 249, 255, 0.17) 0%,
                rgba(120,220,255,0.03) 40%,
                rgba(255,255,255,0.01) 60%,
                rgba(0,0,0,0.00) 100%
              )
            `,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {mode === 'confirm' && (
        <Text
          style={[
            styles.confirmTitle,
            { fontSize: s(13), paddingHorizontal: s(12), paddingTop: s(8), paddingBottom: s(6) },
          ]}
          numberOfLines={2}
        >
          {t('userSelect.deleteConfirmTitle', { name: userName })}
        </Text>
      )}

      {options.map((opt, idx) => {
        const isFocused = idx === focusedIndex;
        return (
          <TouchableOpacity
            key={`${mode}-${idx}`}
            activeOpacity={0.8}
            onPress={() => onPressItem(idx)}
            style={[
              styles.item,
              {
                height: ITEM_HEIGHT,
                paddingVertical: s(10),
                paddingHorizontal: s(12),
                borderRadius: s(3),
                marginVertical: s(2),
              },
              isFocused && styles.itemFocused,
            ]}
          >
            <Animated.View
              style={[styles.focusGlow, { opacity: glowAnims[idx], borderRadius: s(3) }]}
              pointerEvents="none"
            />
            {isFocused && <ShimmerOverlay />}

            <Text
              style={[
                styles.label,
                { fontSize: s(13) },
                opt.danger && styles.labelDanger,
                isFocused && (opt.danger ? styles.labelDangerFocused : styles.labelFocused),
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(23, 23, 30, 1)',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  confirmTitle: {
    color: '#e8ffff',
    fontFamily: 'SSTLight',
    letterSpacing: 0.5,
    zIndex: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
  },
  itemFocused: {
    borderWidth: 1,
    borderColor: 'rgba(120,255,255,0.35)',
    shadowColor: '#7cffff',
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  focusGlow: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(180,255,255,0.55)',
    backgroundColor: 'rgba(180,255,255,0.03)',
  },
  label: {
    color: '#cacacaff',
    fontFamily: 'SSTLight',
    letterSpacing: 0.5,
    zIndex: 1,
  },
  labelFocused: {
    color: '#e8ffff',
  },
  labelDanger: {
    color: '#ff9a94',
  },
  labelDangerFocused: {
    color: '#ffd1ce',
  },
});
