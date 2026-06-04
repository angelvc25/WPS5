import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
} from 'react-native';

// ─── Shimmer que barre todo el menú ──────────────────────────────────────────
function ShimmerOverlay() {
  if (Platform.OS !== 'web') return null;

  return (
    <>
      <style>{`
        @keyframes wc-content-shimmer {
          0% {
            transform: translate(-160%, -50%) rotate(-48deg);
            opacity: 0;
          }

          15% {
            opacity: 1;
          }

          50% {
            opacity: 1;
          }

          70% {
            transform: translate(130%, -50%) rotate(48deg);
            opacity: 0;
          }

          100% {
            transform: translate(130%, -50%) rotate(48deg);
            opacity: 0;
          }
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

// ─── Componente principal ─────────────────────────────────────────────────────
interface GameContextMenuProps {
  focusedIndex: number;
  onPressItem: (index: number) => void;
}

const MENU_WIDTH = 250;
const ITEM_HEIGHT = 50;
const GLOW_DURATION = 180;

export default function GameContextMenu({
  focusedIndex,
  onPressItem,
}: GameContextMenuProps) {
  const options = [
    { label: 'Administrar contenido del juego' },
    { label: 'Ubicación del juego' },
    { label: 'Eliminar' },
  ];

  // ─── Animated opacity per item for smooth focus glow transition ───────────
  const glowAnims = useRef(
    [0, 1, 2].map(i => new Animated.Value(i === focusedIndex ? 1 : 0))
  ).current;
  const prevFocusRef = useRef(focusedIndex);

  useEffect(() => {
    const prev = prevFocusRef.current;
    if (prev === focusedIndex) return;
    prevFocusRef.current = focusedIndex;

    // Fade out old item
    Animated.timing(glowAnims[prev], {
      toValue: 0,
      duration: GLOW_DURATION,
      useNativeDriver: true,
    }).start();

    // Fade in new item
    Animated.timing(glowAnims[focusedIndex], {
      toValue: 1,
      duration: GLOW_DURATION,
      useNativeDriver: true,
    }).start();
  }, [focusedIndex]);

  return (
    <View style={styles.absoluteWrapper}>
      <View style={styles.container}>

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

        {/* SHIMMER DEL CONTENEDOR */}
        {/* <ShimmerOverlay /> */}

        {options.map((opt, idx) => {
          const isFocused = idx === focusedIndex;

          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.8}
              onPress={() => onPressItem(idx)}
              style={[
                styles.item,
                isFocused && styles.itemFocused,
              ]}
            >
              {/* Animated glow focus — fades between items */}
              <Animated.View
                style={[styles.focusGlow, { opacity: glowAnims[idx] }]}
                pointerEvents="none"
              />
              {isFocused && <ShimmerOverlay />}


              <Text
                style={[
                  styles.label,
                  isFocused && styles.labelFocused,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  absoluteWrapper: {
    position: 'absolute',
    left: 185,
    top: 0,
    zIndex: 9999,
    width: MENU_WIDTH,
  },

  container: {
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(26,26,26,1)',
    padding: 6,

    shadowColor: '#000',
    shadowOffset: {
      width: 4,
      height: 8,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,

    width: MENU_WIDTH,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',

    paddingVertical: 10,
    paddingHorizontal: 12,

    borderRadius: 3,
    marginVertical: 2,

    backgroundColor: 'transparent',

    overflow: 'hidden',
    position: 'relative',

    height: ITEM_HEIGHT,
  },

  itemFocused: {
    //backgroundColor: 'rgba(120,255,255,0.05)',

    borderWidth: 1,
    borderColor: 'rgba(120,255,255,0.35)',

    shadowColor: '#7cffff',
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },

  focusGlow: {
    ...StyleSheet.absoluteFillObject,

    borderRadius: 3,

    borderWidth: 1,
    borderColor: 'rgba(180,255,255,0.55)',

    backgroundColor: 'rgba(180,255,255,0.03)',
  },

  label: {
    fontSize: 12,
    color: '#cacacaff',

    fontWeight: '400',
    letterSpacing: 0.5,

    zIndex: 1,
  },

  labelFocused: {
    color: '#e8ffff',
  },
});