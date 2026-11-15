import { useTranslation } from '@/contexts/LanguageContext';
import { TranslationKey } from '@/i18n/translations';
import React, { useEffect, useMemo, useRef } from 'react';
import {
    Animated,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';

// ─── Shimmer que barre todo el menú ──────────────────────────────────────────
function ShimmerOverlay() {
  if (Platform.OS !== 'web') return null;

  return (
    <>
      <style>{`
        @keyframes wc-content-shimmer {
          0% {
            transform: translate3d(-160%, -50%, 0) rotate(-48deg);
            opacity: 0;
          }

          15% {
            opacity: 1;
          }

          50% {
            opacity: 1;
          }

          70% {
            transform: translate3d(130%, -50%, 0) rotate(-48deg);
            opacity: 0;
          }

          100% {
            transform: translate3d(130%, -50%, 0) rotate(-48deg);
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
  onPressItem: (action: number | string) => void;
  /** Estado actual de "fijado" del juego seleccionado */
  isPinned?: boolean;
  /** Se llama al activar/desactivar el switch de fijar */
  onTogglePin?: () => void;
  /** Estado actual de "favorito" del juego seleccionado */
  isFavorite?: boolean;
  /** Se llama al activar/desactivar el favorito */
  onToggleFavorite?: () => void;
  /** Modo de visualización: 'carousel' (por defecto) o 'library' */
  mode?: 'carousel' | 'library';
  /** Offset horizontal de anclaje (en carrusel es BASE_LEFT_OFFSET) */
  leftOffset?: number;
  // ─── Submenu props ────────────────────────────────────────────────────────
  submenuMode?: 'collections' | 'create' | null;
  collections?: Array<{ id: string; name: string }>;
  onAddToCollection?: (collectionId: string) => void;
  onCreateCollection?: (name: string) => void;
  onBackFromSubmenu?: () => void;
  submenuFocusIndex?: number;
  newCollectionName?: string;
}

const BASE_MENU_WIDTH = 320;
const BASE_ITEM_HEIGHT = 50;
const BASE_LEFT_OFFSET = 185; // offset de anclaje respecto a la tarjeta/ícono que abre el menú
const GLOW_DURATION = 180;
// Índice de foco que corresponde a la fila del switch "Favorito"
const FAVORITE_INDEX = 3;
// Índice de foco que corresponde a la fila del switch "Fijar"
const PIN_INDEX = 4;

export default function GameContextMenu({
  focusedIndex,
  onPressItem,
  isPinned = false,
  onTogglePin,
  isFavorite = false,
  onToggleFavorite,
  mode = 'carousel',
  leftOffset,
  submenuMode = null,
  collections = [],
  onAddToCollection,
  onCreateCollection,
  onBackFromSubmenu,
  submenuFocusIndex = 0,
  newCollectionName = '',
}: GameContextMenuProps) {
  const { t } = useTranslation();

  const isLibraryMode = mode === 'library';

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scale = useMemo(
    () => Math.min(windowWidth / 1920, windowHeight / 1080),
    [windowWidth, windowHeight]
  );
  const s = (v: number) => Math.max(1, Math.round(v * scale));

  const MENU_WIDTH = s(BASE_MENU_WIDTH);
  const ITEM_HEIGHT = s(BASE_ITEM_HEIGHT);
  const LEFT_OFFSET = leftOffset !== undefined ? s(leftOffset) : s(BASE_LEFT_OFFSET);

  const favoriteIndex = isLibraryMode ? 3 : FAVORITE_INDEX;
  const pinIndex = isLibraryMode ? 4 : PIN_INDEX;

  const options = isLibraryMode
    ? [
        { id: 'delete', labelKey: 'context.delete' as TranslationKey },
        { id: 'location', labelKey: 'context.location' as TranslationKey },
        { id: 'addToCollection', labelKey: 'context.addToCollection' as TranslationKey },
      ]
    : [
        { id: 'manage', labelKey: 'context.manage' as TranslationKey },
        { id: 'location', labelKey: 'context.location' as TranslationKey },
        { id: 'delete', labelKey: 'context.delete' as TranslationKey },
      ];

  // ─── Animated opacity per item for smooth focus glow transition ───────────
  // 10 entries to safely cover main menu items + submenu rows
  const glowAnims = useRef(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => new Animated.Value(i === focusedIndex ? 1 : 0))
  ).current;

  // Submenu glow anims (separate set to handle submenu focus)
  const submenuGlowAnims = useRef(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => new Animated.Value(i === submenuFocusIndex ? 1 : 0))
  ).current;

  const prevFocusRef = useRef(focusedIndex);
  const prevSubmenuFocusRef = useRef(submenuFocusIndex);

  useEffect(() => {
    const prev = prevFocusRef.current;
    if (prev === focusedIndex) return;
    prevFocusRef.current = focusedIndex;

    if (glowAnims[prev]) {
      Animated.timing(glowAnims[prev], {
        toValue: 0,
        duration: GLOW_DURATION,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
    if (glowAnims[focusedIndex]) {
      Animated.timing(glowAnims[focusedIndex], {
        toValue: 1,
        duration: GLOW_DURATION,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [focusedIndex]);

  useEffect(() => {
    const prev = prevSubmenuFocusRef.current;
    if (prev === submenuFocusIndex) return;
    prevSubmenuFocusRef.current = submenuFocusIndex;

    if (submenuGlowAnims[prev]) {
      Animated.timing(submenuGlowAnims[prev], {
        toValue: 0,
        duration: GLOW_DURATION,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
    if (submenuGlowAnims[submenuFocusIndex]) {
      Animated.timing(submenuGlowAnims[submenuFocusIndex], {
        toValue: 1,
        duration: GLOW_DURATION,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [submenuFocusIndex]);

  // ─── Submenu: collections list ────────────────────────────────────────────
  const renderCollectionsSubmenu = () => {
    // Row 0: back
    // Rows 1..N: collections
    // Row N+1: create collection
    const rows: Array<{ key: string; label: string; onPress: () => void }> = [
      {
        key: 'back',
        label: t('context.backToMenu'),
        onPress: () => onBackFromSubmenu?.(),
      },
      ...collections.map((col) => ({
        key: col.id,
        label: col.name,
        onPress: () => onAddToCollection?.(col.id),
      })),
      {
        key: 'create',
        label: t('context.createCollection'),
        onPress: () => onCreateCollection?.(''),
      },
    ];

    return rows.map((row, idx) => {
      const isFocused = idx === submenuFocusIndex;
      return (
        <TouchableOpacity
          key={row.key}
          activeOpacity={0.8}
          onPress={row.onPress}
          style={[
            styles.item,
            { height: ITEM_HEIGHT, paddingVertical: s(10), paddingHorizontal: s(12), borderRadius: s(3), marginVertical: s(2) },
            isFocused && styles.itemFocused,
          ]}
        >
          <Animated.View
            style={[styles.focusGlow, { opacity: submenuGlowAnims[idx], borderRadius: s(3) }]}
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
            {row.label}
          </Text>
        </TouchableOpacity>
      );
    });
  };

  // ─── Submenu: create mode ──────────────────────────────────────────────────
  const renderCreateSubmenu = () => {
    return (
      <>
        {/* Back row */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onBackFromSubmenu?.()}
          style={[
            styles.item,
            { height: ITEM_HEIGHT, paddingVertical: s(10), paddingHorizontal: s(12), borderRadius: s(3), marginVertical: s(2) },
            submenuFocusIndex === 0 && styles.itemFocused,
          ]}
        >
          <Animated.View
            style={[styles.focusGlow, { opacity: submenuGlowAnims[0], borderRadius: s(3) }]}
            pointerEvents="none"
          />
          {submenuFocusIndex === 0 && <ShimmerOverlay />}
          <Text style={[styles.label, { fontSize: s(13) }, submenuFocusIndex === 0 && styles.labelFocused]}>
            {t('context.backToMenu')}
          </Text>
        </TouchableOpacity>

        {/* Name input display */}
        <View
          style={[
            styles.item,
            { height: ITEM_HEIGHT, paddingVertical: s(10), paddingHorizontal: s(12), borderRadius: s(3), marginVertical: s(2) },
            styles.itemFocused,
          ]}
        >
          <Text
            style={[styles.label, { fontSize: s(13), color: '#e8ffff' }]}
            numberOfLines={1}
          >
            {newCollectionName || t('context.collectionNamePlaceholder')}
          </Text>
        </View>
      </>
    );
  };

  return (
    <View style={[styles.absoluteWrapper, { left: LEFT_OFFSET, width: MENU_WIDTH }]}>
      <View
        style={[
          styles.container,
          {
            width: MENU_WIDTH,
            padding: s(6),
            marginLeft: leftOffset === 0 ? 0 : s(15),
            borderRadius: s(3),
          },
        ]}
      >

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

        {/* ─── Submenu: collections ──────────────────────────────────────── */}
        {submenuMode === 'collections' && renderCollectionsSubmenu()}

        {/* ─── Submenu: create ──────────────────────────────────────────── */}
        {submenuMode === 'create' && renderCreateSubmenu()}

        {/* ─── Main menu ───────────────────────────────────────────────── */}
        {!submenuMode && (
          <>
            {options.map((opt, idx) => {
              const isFocused = idx === focusedIndex;

              return (
                <TouchableOpacity
                  key={opt.id ?? idx}
                  activeOpacity={0.8}
                  onPress={() => onPressItem(opt.id ?? idx)}
                  style={[
                    styles.item,
                    { height: ITEM_HEIGHT, paddingVertical: s(10), paddingHorizontal: s(12), borderRadius: s(3), marginVertical: s(2) },
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
                      isFocused && styles.labelFocused,
                    ]}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Separador antes de los toggles */}
            <View style={[styles.divider, { marginVertical: s(4), marginHorizontal: s(4) }]} />

            {/* ─── FAVORITO (switch) ───────────────────────────────────── */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onToggleFavorite}
              style={[
                styles.item,
                styles.pinItem,
                { height: ITEM_HEIGHT, paddingVertical: s(10), paddingHorizontal: s(12), borderRadius: s(3), marginVertical: s(2) },
                focusedIndex === favoriteIndex && styles.itemFocused,
              ]}
            >
              <Animated.View
                style={[styles.focusGlow, { opacity: glowAnims[favoriteIndex], borderRadius: s(3) }]}
                pointerEvents="none"
              />
              {focusedIndex === favoriteIndex && <ShimmerOverlay />}

              <Text
                style={[
                  styles.label,
                  { fontSize: s(13) },
                  focusedIndex === favoriteIndex && styles.labelFocused,
                ]}
              >
                {isFavorite ? t('context.unfavorite') : t('context.favorite')}
              </Text>

              <View style={[styles.toggleTrack, { width: s(40), height: s(22), borderRadius: s(11), padding: s(2) }, isFavorite && styles.toggleTrackActive]}>
                <View style={[styles.toggleThumb, { width: s(18), height: s(18), borderRadius: s(9) }, isFavorite && [styles.toggleThumbActive, { transform: [{ translateX: s(18) }] }]]} />
              </View>
            </TouchableOpacity>

            {/* ─── FIJAR JUEGO (switch) ────────────────────────────────── */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onTogglePin}
              style={[
                styles.item,
                styles.pinItem,
                { height: ITEM_HEIGHT, paddingVertical: s(10), paddingHorizontal: s(12), borderRadius: s(3), marginVertical: s(2) },
                focusedIndex === pinIndex && styles.itemFocused,
              ]}
            >
              <Animated.View
                style={[styles.focusGlow, { opacity: glowAnims[pinIndex], borderRadius: s(3) }]}
                pointerEvents="none"
              />
              {focusedIndex === pinIndex && <ShimmerOverlay />}

              <Text
                style={[
                  styles.label,
                  { fontSize: s(13) },
                  focusedIndex === pinIndex && styles.labelFocused,
                ]}
              >
                {t('context.pinToHome')}
              </Text>

              <View style={[styles.toggleTrack, { width: s(40), height: s(22), borderRadius: s(11), padding: s(2) }, isPinned && styles.toggleTrackActive]}>
                <View style={[styles.toggleThumb, { width: s(18), height: s(18), borderRadius: s(9) }, isPinned && [styles.toggleThumbActive, { transform: [{ translateX: s(18) }] }]]} />
              </View>
            </TouchableOpacity>
          </>
        )}
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
