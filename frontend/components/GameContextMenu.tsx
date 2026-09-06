import React, { useEffect, useMemo, useRef } from 'react';
import { BlurView } from 'expo-blur';
import { useTranslation } from '@/contexts/LanguageContext';
import { TranslationKey } from '@/i18n/translations';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  useWindowDimensions,
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
            transform: translate(130%, -50%) rotate(-48deg);
            opacity: 0;
          }

          100% {
            transform: translate(130%, -50%) rotate(-48deg);
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
  /** Estado actual de "fijado" del juego seleccionado */
  isPinned?: boolean;
  /** Se llama al activar/desactivar el switch de fijar */
  onTogglePin?: () => void;
}

const BASE_MENU_WIDTH = 320;
const BASE_ITEM_HEIGHT = 50;
const BASE_LEFT_OFFSET = 185; // offset de anclaje respecto a la tarjeta/ícono que abre el menú
const GLOW_DURATION = 180;
// Índice de foco que corresponde a la fila del switch "Fijar"
const PIN_INDEX = 3;

export default function GameContextMenu({
  focusedIndex,
  onPressItem,
  isPinned = false,
  onTogglePin,
}: GameContextMenuProps) {
  const { t } = useTranslation();

  // Mismo patrón de escalado que UserSelectScreen.tsx: 1920x1080 como panel
  // de referencia, min(anchoRatio, altoRatio) para no estirar en ultrawide.
  //
  // IMPORTANTE: este menú se ancla con `left: BASE_LEFT_OFFSET` respecto a
  // la tarjeta/ícono que lo abre (ver dónde se invoca <GameContextMenu />).
  // Si el elemento que lo posiciona (p.ej. la tarjeta activa del carrusel)
  // usa este mismo factor de escala para su propio tamaño/posición, el
  // anclaje seguirá alineado en cualquier resolución. Si el padre posiciona
  // ese ancla con otra lógica, ajusta `left` en el punto de uso en vez de
  // aquí, para no desincronizar los dos cálculos.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scale = useMemo(
    () => Math.min(windowWidth / 1920, windowHeight / 1080),
    [windowWidth, windowHeight]
  );
  const s = (v: number) => Math.max(1, Math.round(v * scale));

  const MENU_WIDTH = s(BASE_MENU_WIDTH);
  const ITEM_HEIGHT = s(BASE_ITEM_HEIGHT);
  const LEFT_OFFSET = s(BASE_LEFT_OFFSET);

  const options = [
    { labelKey: 'context.manage' as TranslationKey },
    { labelKey: 'context.location' as TranslationKey },
    { labelKey: 'context.delete' as TranslationKey },
  ];

  // ─── Animated opacity per item for smooth focus glow transition ───────────
  // Ahora incluye el índice extra del switch de fijar (PIN_INDEX)
  const glowAnims = useRef(
    [0, 1, 2, PIN_INDEX].map(i => new Animated.Value(i === focusedIndex ? 1 : 0))
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
    <View style={[styles.absoluteWrapper, { left: LEFT_OFFSET, width: MENU_WIDTH }]}>
      <View style={[styles.container, { width: MENU_WIDTH, padding: s(6), marginLeft: s(15), borderRadius: s(3) }]}>

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

        {options.map((opt, idx) => {
          const isFocused = idx === focusedIndex;

          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.8}
              onPress={() => onPressItem(idx)}
              style={[
                styles.item,
                { height: ITEM_HEIGHT, paddingVertical: s(10), paddingHorizontal: s(12), borderRadius: s(3), marginVertical: s(2) },
                isFocused && styles.itemFocused,
              ]}
            >
              {/* Animated glow focus — fades between items */}
              <Animated.View
                style={[styles.focusGlow, { opacity: glowAnims[idx], borderRadius: s(3) }]}
                pointerEvents="none"
              />
              {isFocused && <ShimmerOverlay />}


              <Text
                style={[
                  styles.label,
                  { fontSize: s(13) },
                  isFocused && styles.labelFocused,
                ]}
              >
                {t(opt.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Separador antes del switch de fijar */}
        <View style={[styles.divider, { marginVertical: s(4), marginHorizontal: s(4) }]} />

        {/* ─── FIJAR JUEGO (switch) ─────────────────────────────────────── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onTogglePin}
          style={[
            styles.item,
            styles.pinItem,
            { height: ITEM_HEIGHT, paddingVertical: s(10), paddingHorizontal: s(12), borderRadius: s(3), marginVertical: s(2) },
            focusedIndex === PIN_INDEX && styles.itemFocused,
          ]}
        >
          <Animated.View
            style={[styles.focusGlow, { opacity: glowAnims[3], borderRadius: s(3) }]}
            pointerEvents="none"
          />
          {focusedIndex === PIN_INDEX && <ShimmerOverlay />}

          <Text
            style={[
              styles.label,
              { fontSize: s(13) },
              focusedIndex === PIN_INDEX && styles.labelFocused,
            ]}
          >
            {t('context.pinToHome')}
          </Text>

          <View style={[styles.toggleTrack, { width: s(40), height: s(22), borderRadius: s(11), padding: s(2) }, isPinned && styles.toggleTrackActive]}>
            <View style={[styles.toggleThumb, { width: s(18), height: s(18), borderRadius: s(9) }, isPinned && [styles.toggleThumbActive, { transform: [{ translateX: s(18) }] }]]} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  absoluteWrapper: {
    position: 'absolute',
    left: BASE_LEFT_OFFSET,
    top: 0,
    zIndex: 9999,
    width: BASE_MENU_WIDTH,
  },

  container: {
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
    //borderWidth: 1,
    //borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(23, 23, 30, 1)',
    padding: 6,
    marginLeft: 15,

    shadowColor: '#000',
    shadowOffset: {
      width: 4,
      height: 8,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,

    width: BASE_MENU_WIDTH,
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

    height: BASE_ITEM_HEIGHT,
  },

  pinItem: {
    justifyContent: 'space-between',
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

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 4,
    marginHorizontal: 4,
  },

  label: {
    fontSize: 13,
    color: '#cacacaff',
    fontFamily: 'SSTLight',
    letterSpacing: 0.5,
    zIndex: 1,
  },

  labelFocused: {
    color: '#e8ffff',
  },

  // ─── Toggle switch ──────────────────────────────────────────────────────
  toggleTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 2,
    justifyContent: 'center',
    zIndex: 1,
  },
  toggleTrackActive: {
    backgroundColor: '#8d8d8dff',
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#969696ff',
  },
  toggleThumbActive: {
    transform: [{ translateX: 18 }],
    backgroundColor: '#ffffffff',
  },
});