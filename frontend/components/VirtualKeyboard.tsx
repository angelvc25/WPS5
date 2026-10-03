/**
 * VirtualKeyboard.tsx
 *
 * Teclado virtual estilo PS5/consola, navegable con mando/flechas.
 * Se muestra superpuesto a cualquier pantalla que tenga un TextInput activo.
 *
 * Uso:
 *   <VirtualKeyboard
 *     visible={showKb}
 *     value={text}
 *     onChange={setText}
 *     onClose={() => setShowKb(false)}
 *   />
 *
 * Props:
 *   visible   – mostrar/ocultar
 *   value     – texto actual del input
 *   onChange  – callback cuando cambia el texto
 *   onClose   – callback al pulsar "Cerrar" o Escape/Circulo
 *   onConfirm – (opcional) callback al confirmar (Enter/Cruz)
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated as RNAnimated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { soundService } from '@/services/soundService';

// --- Layout del teclado ---

type KeyDef = {
  label: string;
  value?: string;
  wide?: boolean;
  action?: 'backspace' | 'space' | 'close' | 'confirm' | 'shift' | 'symbols';
};

const ROWS_ALPHA_LOWER: KeyDef[][] = [
  [
    { label: 'q', value: 'q' }, { label: 'w', value: 'w' }, { label: 'e', value: 'e' },
    { label: 'r', value: 'r' }, { label: 't', value: 't' }, { label: 'y', value: 'y' },
    { label: 'u', value: 'u' }, { label: 'i', value: 'i' }, { label: 'o', value: 'o' },
    { label: 'p', value: 'p' },
  ],
  [
    { label: 'a', value: 'a' }, { label: 's', value: 's' }, { label: 'd', value: 'd' },
    { label: 'f', value: 'f' }, { label: 'g', value: 'g' }, { label: 'h', value: 'h' },
    { label: 'j', value: 'j' }, { label: 'k', value: 'k' }, { label: 'l', value: 'l' },
  ],
  [
    { label: 'Shift', action: 'shift', wide: false },
    { label: 'z', value: 'z' }, { label: 'x', value: 'x' }, { label: 'c', value: 'c' },
    { label: 'v', value: 'v' }, { label: 'b', value: 'b' }, { label: 'n', value: 'n' },
    { label: 'm', value: 'm' },
    { label: '<', action: 'backspace' },
  ],
  [
    { label: '?123', action: 'symbols', wide: true },
    { label: 'ESPACIO', action: 'space', wide: true },
    { label: 'OK', action: 'confirm', wide: false },
    { label: 'X', action: 'close', wide: false },
  ],
];

const ROWS_ALPHA_UPPER: KeyDef[][] = ROWS_ALPHA_LOWER.map(row =>
  row.map(k => (k.value ? { ...k, label: k.label.toUpperCase(), value: k.value.toUpperCase() } : k))
);

const ROWS_SYMBOLS: KeyDef[][] = [
  [
    { label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' },
    { label: '4', value: '4' }, { label: '5', value: '5' }, { label: '6', value: '6' },
    { label: '7', value: '7' }, { label: '8', value: '8' }, { label: '9', value: '9' },
    { label: '0', value: '0' },
  ],
  [
    { label: '@', value: '@' }, { label: '#', value: '#' }, { label: '$', value: '$' },
    { label: '%', value: '%' }, { label: '&', value: '&' }, { label: '*', value: '*' },
    { label: '-', value: '-' }, { label: '+', value: '+' }, { label: '=', value: '=' },
  ],
  [
    { label: '!', value: '!' }, { label: '"', value: '"' }, { label: "'", value: "'" },
    { label: ':', value: ':' }, { label: ';', value: ';' }, { label: '/', value: '/' },
    { label: '?', value: '?' }, { label: '.', value: '.' }, { label: '<', action: 'backspace' },
  ],
  [
    { label: 'ABC', action: 'symbols', wide: true },
    { label: 'ESPACIO', action: 'space', wide: true },
    { label: 'OK', action: 'confirm', wide: false },
    { label: 'X', action: 'close', wide: false },
  ],
];

// --- Props ---

interface VirtualKeyboardProps {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onConfirm?: (v: string) => void;
}

// --- Component ---

const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  visible,
  value,
  onChange,
  onClose,
  onConfirm,
}) => {
  const { width: ww, height: wh } = useWindowDimensions();
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const [focusRow, setFocusRow] = useState(0);
  const [focusCol, setFocusCol] = useState(0);

  const focusRowRef = useRef(focusRow);
  const focusColRef = useRef(focusCol);
  const shiftRef = useRef(shift);
  const symbolsRef = useRef(symbols);
  const valueRef = useRef(value);

  shiftRef.current = shift;
  symbolsRef.current = symbols;
  valueRef.current = value;

  // Animation: slide up from bottom
  const slideAnim = useRef(new RNAnimated.Value(300)).current;
  const opacityAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setFocusRow(0);
      setFocusCol(0);
      RNAnimated.parallel([
        RNAnimated.timing(slideAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        RNAnimated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      RNAnimated.parallel([
        RNAnimated.timing(slideAnim, {
          toValue: 300,
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        RNAnimated.timing(opacityAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const rows: KeyDef[][] = useMemo(() => {
    if (symbols) return ROWS_SYMBOLS;
    return shift ? ROWS_ALPHA_UPPER : ROWS_ALPHA_LOWER;
  }, [shift, symbols]);

  focusRowRef.current = focusRow;
  focusColRef.current = focusCol;

  // -- key action --
  const pressKey = useCallback(
    (key: KeyDef) => {
      soundService.playActivation();
      if (key.value !== undefined) {
        onChange(valueRef.current + key.value);
        if (shiftRef.current && !symbolsRef.current) setShift(false);
        return;
      }
      switch (key.action) {
        case 'backspace':
          onChange(valueRef.current.slice(0, -1));
          break;
        case 'space':
          onChange(valueRef.current + ' ');
          break;
        case 'shift':
          setShift(prev => !prev);
          break;
        case 'symbols':
          setSymbols(prev => !prev);
          setShift(false);
          break;
        case 'confirm':
          if (onConfirm) onConfirm(valueRef.current);
          else onClose();
          break;
        case 'close':
          onClose();
          break;
      }
    },
    [onChange, onClose, onConfirm]
  );

  // -- keyboard / gamepad navigation --
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handle = (e: KeyboardEvent) => {
      const r = focusRowRef.current;
      const c = focusColRef.current;
      const currentRows = symbolsRef.current
        ? ROWS_SYMBOLS
        : shiftRef.current
        ? ROWS_ALPHA_UPPER
        : ROWS_ALPHA_LOWER;
      const rowLen = currentRows[r]?.length ?? 1;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
          soundService.playNavigation();
          setFocusCol(prev => {
            const next = Math.min(prev + 1, rowLen - 1);
            focusColRef.current = next;
            return next;
          });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          soundService.playNavigation();
          setFocusCol(prev => {
            const next = Math.max(prev - 1, 0);
            focusColRef.current = next;
            return next;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          soundService.playNavigation();
          setFocusRow(prevRow => {
            const nextRow = Math.min(prevRow + 1, currentRows.length - 1);
            const nextRowLen = currentRows[nextRow]?.length ?? 1;
            const nextCol = Math.min(focusColRef.current, nextRowLen - 1);
            focusColRef.current = nextCol;
            setFocusCol(nextCol);
            focusRowRef.current = nextRow;
            return nextRow;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          soundService.playNavigation();
          setFocusRow(prevRow => {
            const nextRow = Math.max(prevRow - 1, 0);
            const nextRowLen = currentRows[nextRow]?.length ?? 1;
            const nextCol = Math.min(focusColRef.current, nextRowLen - 1);
            focusColRef.current = nextCol;
            setFocusCol(nextCol);
            focusRowRef.current = nextRow;
            return nextRow;
          });
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          {
            const key = currentRows[r]?.[c];
            if (key) pressKey(key);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        case 'Backspace':
          e.preventDefault();
          onChange(valueRef.current.slice(0, -1));
          break;
        default:
          // Allow direct physical keyboard typing to pass through
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            onChange(valueRef.current + e.key);
          }
          break;
      }
    };

    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [visible, pressKey, onClose, onChange]);

  // -- layout calculations --
  const scale = Math.min(ww / 1920, wh / 1080);
  const s = (v: number) => Math.round(v * scale);

  const KB_WIDTH = Math.min(ww * 0.72, s(1100));
  const KEY_H = s(58);
  const KEY_GAP = s(6);

  if (!visible) return null;

  return (
    <RNAnimated.View
      style={[styles.overlay, { opacity: opacityAnim }]}
      pointerEvents={visible ? 'box-none' : 'none'}
    >
      <RNAnimated.View
        style={[
          styles.container,
          {
            width: KB_WIDTH,
            transform: [{ translateY: slideAnim }],
            paddingVertical: s(18),
            paddingHorizontal: s(20),
            borderRadius: s(14),
            gap: KEY_GAP,
          },
        ]}
      >
        {/* Text preview row */}
        <View style={[styles.previewRow, { marginBottom: s(8) }]}>
          <Text
            style={[styles.previewText, { fontSize: s(20) }]}
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {value}
          </Text>
          <View style={[styles.cursor, { height: s(20) }]} />
        </View>

        {/* Key rows */}
        {rows.map((row, rIdx) => (
          <View key={rIdx} style={[styles.row, { gap: KEY_GAP }]}>
            {row.map((key, cIdx) => {
              const isFocused = focusRow === rIdx && focusCol === cIdx;
              const isWide = key.wide;
              const isAction = !!key.action;
              const isConfirm = key.action === 'confirm';
              const isClose = key.action === 'close';
              const isShiftActive = key.action === 'shift' && shift;
              const isSymbolsActive = key.action === 'symbols' && symbols;

              return (
                <TouchableOpacity
                  key={`${rIdx}-${cIdx}`}
                  onPress={() => pressKey(key)}
                  activeOpacity={0.75}
                  style={[
                    styles.key,
                    {
                      height: KEY_H,
                      minWidth: KEY_H,
                      flex: isWide ? 2 : 1,
                      borderRadius: s(6),
                    },
                    isAction && styles.keyAction,
                    (isShiftActive || isSymbolsActive) && styles.keyShiftActive,
                    isConfirm && styles.keyConfirm,
                    isClose && styles.keyClose,
                    isFocused && styles.keyFocused,
                    isFocused && isConfirm && styles.keyConfirmFocused,
                    isFocused && isClose && styles.keyCloseFocused,
                  ]}
                >
                  <Text
                    style={[
                      styles.keyLabel,
                      { fontSize: key.label.length > 3 ? s(12) : s(17) },
                      isAction && styles.keyLabelAction,
                      isFocused && styles.keyLabelFocused,
                    ]}
                  >
                    {key.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* Nav hint */}
        <View style={[styles.hint, { marginTop: s(4) }]}>
          <Text style={[styles.hintText, { fontSize: s(11) }]}>
            Flechas para navegar · Enter para seleccionar · Esc para cerrar
          </Text>
        </View>
      </RNAnimated.View>
    </RNAnimated.View>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
    zIndex: 9999,
  } as any,
  container: {
    backgroundColor: 'rgba(13, 15, 23, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 -16px 70px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05)',
          backdropFilter: 'blur(28px)',
        } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.65,
          shadowRadius: 28,
        }),
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 38,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  previewText: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: 'SSTLight',
    letterSpacing: 0.5,
  },
  cursor: {
    width: 2,
    backgroundColor: '#0070D1',
    marginLeft: 4,
    borderRadius: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  keyAction: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  keyShiftActive: {
    backgroundColor: 'rgba(0, 112, 209, 0.30)',
    borderColor: 'rgba(0,112,209,0.55)',
  },
  keyConfirm: {
    backgroundColor: 'rgba(0, 112, 209, 0.20)',
    borderColor: 'rgba(0,112,209,0.40)',
  },
  keyClose: {
    backgroundColor: 'rgba(200, 40, 40, 0.15)',
    borderColor: 'rgba(200,40,40,0.30)',
  },
  keyFocused: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderColor: 'rgba(255,255,255,0.50)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 12px rgba(255,255,255,0.22), 0 0 4px rgba(255,255,255,0.14)' } as any)
      : {}),
  },
  keyConfirmFocused: {
    backgroundColor: 'rgba(0, 112, 209, 0.55)',
    borderColor: '#0070D1',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 18px rgba(0,112,209,0.55)' } as any)
      : {}),
  },
  keyCloseFocused: {
    backgroundColor: 'rgba(200, 40, 40, 0.45)',
    borderColor: '#c82828',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 16px rgba(200,40,40,0.40)' } as any)
      : {}),
  },
  keyLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: 'SSTLight',
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  keyLabelAction: {
    color: 'rgba(255,255,255,0.60)',
  },
  keyLabelFocused: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  hint: {
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.22)',
    fontFamily: 'SSTLight',
    letterSpacing: 0.3,
  },
});

export default VirtualKeyboard;
