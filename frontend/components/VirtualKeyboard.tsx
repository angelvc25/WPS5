/**
 * VirtualKeyboard.tsx
 *
 * Teclado virtual estilo PS5 — diseño fiel a la imagen de referencia.
 * Navegable con mando (flechas ↑↓←→ / sticks analógicos mapeados como flechas).
 *
 * Props:
 *   visible   – mostrar / ocultar
 *   value     – texto actual
 *   onChange  – callback al escribir
 *   onClose   – callback al cerrar (L1 / cancelar)
 *   onConfirm – callback al confirmar "Done" (R2)
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
import { Ionicons } from '@expo/vector-icons';
import { soundService } from '@/services/soundService';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type KeyAction =
  | 'char'
  | 'backspace'
  | 'space'
  | 'close'
  | 'confirm'
  | 'shift'
  | 'symbols'
  | 'accents'
  | 'prev'
  | 'next'
  | 'more'
  | 'gamepad'
  | 'triangle'
  | 'square';

type KeyDef = {
  label: string;
  value?: string;
  action: KeyAction;
  flex?: number;
  /** Render custom icon en lugar de label texto */
  icon?: string;
  /** PSIcon char key (de PSIcons.*) en lugar de label texto */
  psIcon?: string;
  sub?: string; // sublabel (p.ej. "L2", "R2" hints)
  /** Icono PS pequeño en la esquina (botón del mando que dispara esta tecla) */
  hintIcon?: string;
};

// ─── Layouts ─────────────────────────────────────────────────────────────────

/** Fila de números+símbolos superiores (siempre visibles en modo alfa) */
const ROW_NUMBERS: KeyDef[] = [
  { label: '1', value: '1', action: 'char' },
  { label: '2', value: '2', action: 'char' },
  { label: '3', value: '3', action: 'char' },
  { label: '4', value: '4', action: 'char' },
  { label: '5', value: '5', action: 'char' },
  { label: '6', value: '6', action: 'char' },
  { label: '7', value: '7', action: 'char' },
  { label: '8', value: '8', action: 'char' },
  { label: '9', value: '9', action: 'char' },
  { label: '0', value: '0', action: 'char' },
  { label: '@', value: '@', action: 'char' },
];

const ROW_QWERTY: KeyDef[] = [
  { label: 'Q', value: 'q', action: 'char' },
  { label: 'W', value: 'w', action: 'char' },
  { label: 'E', value: 'e', action: 'char' },
  { label: 'R', value: 'r', action: 'char' },
  { label: 'T', value: 't', action: 'char' },
  { label: 'Y', value: 'y', action: 'char' },
  { label: 'U', value: 'u', action: 'char' },
  { label: 'I', value: 'i', action: 'char' },
  { label: 'O', value: 'o', action: 'char' },
  { label: 'P', value: 'p', action: 'char' },
  { label: '#', value: '#', action: 'char' },
];

const ROW_ASDF: KeyDef[] = [
  { label: 'A', value: 'a', action: 'char' },
  { label: 'S', value: 's', action: 'char' },
  { label: 'D', value: 'd', action: 'char' },
  { label: 'F', value: 'f', action: 'char' },
  { label: 'G', value: 'g', action: 'char' },
  { label: 'H', value: 'h', action: 'char' },
  { label: 'J', value: 'j', action: 'char' },
  { label: 'K', value: 'k', action: 'char' },
  { label: 'L', value: 'l', action: 'char' },
  { label: '"', value: '"', action: 'char' },
  { label: '/', value: '/', action: 'char' },
];

const ROW_ZXCV: KeyDef[] = [
  { label: 'Z', value: 'z', action: 'char' },
  { label: 'X', value: 'x', action: 'char' },
  { label: 'C', value: 'c', action: 'char' },
  { label: 'V', value: 'v', action: 'char' },
  { label: 'B', value: 'b', action: 'char' },
  { label: 'N', value: 'n', action: 'char' },
  { label: 'M', value: 'm', action: 'char' },
  { label: '-', value: '-', action: 'char' },
  { label: '_', value: '_', action: 'char' },
  { label: '?', value: '?', action: 'char' },
  { label: '!', value: '!', action: 'char' },
];

/**
 * Fila de funciones: shift, ABC, @#:, à, espacio (△), borrar (□).
 * △ = espacio y □ = borrar están integrados en sus teclas (hintIcon),
 * ya no hay teclas sueltas para ellos.
 */
const ROW_FUNC: KeyDef[] = [
  { label: '', psIcon: 'dpadUp', action: 'shift', sub: 'L2', flex: 1 },
  { label: 'ABC', action: 'symbols', flex: 2 },
  { label: '@#:', action: 'symbols', flex: 2 },
  { label: 'à', action: 'accents', flex: 1 },
  { label: 'SPACE', action: 'space', flex: 3, hintIcon: 'triangle' },
  { label: '⌫', action: 'backspace', flex: 2, hintIcon: 'square' },
];

/** Fila inferior: ◄ ► ... 🎮 Done */
const ROW_BOTTOM: KeyDef[] = [
  { label: '', psIcon: 'dpadLeft', action: 'prev', sub: 'L1', flex: 1 },
  { label: '', psIcon: 'dpadRight', action: 'next', sub: 'R1', flex: 1 },
  { label: '', psIcon: 'menuDots', action: 'more', flex: 1 },
  { label: '', psIcon: 'dpadFull', action: 'gamepad', sub: 'L3+R3', flex: 2 },
  { label: 'Done', action: 'confirm', flex: 2, sub: 'R2' },
];

/** Layout en modo símbolo (reemplaza filas 1–4) */
const ROW_SYM1: KeyDef[] = [
  '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '+'
].map(c => ({ label: c, value: c, action: 'char' as KeyAction }));

const ROW_SYM2: KeyDef[] = [
  '~', '`', '|', '\\', '[', ']', '{', '}', '<', '>', '='
].map(c => ({ label: c, value: c, action: 'char' as KeyAction }));

const ROW_SYM3: KeyDef[] = [
  ',', '.', ':', ';', "'", '"', '/', '?', '-', '_', '+'
].map(c => ({ label: c, value: c, action: 'char' as KeyAction }));

const ROW_SYM4: KeyDef[] = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '@'
].map(c => ({ label: c, value: c, action: 'char' as KeyAction }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Cambia la capitalización de las teclas de letra (label y value) */
function withCase(row: KeyDef[], upper: boolean): KeyDef[] {
  return row.map(k => {
    if (!k.value || !/^[a-zA-Z]$/.test(k.value)) return k;
    const f = (t: string) => (upper ? t.toUpperCase() : t.toLowerCase());
    return { ...k, label: f(k.label), value: f(k.value) };
  });
}

/**
 * `shift` = bloqueo de mayúsculas (caps lock): letras en mayúscula y se
 * mantiene hasta volver a presionarlo. Apagado: letras en minúscula.
 */
function getRows(shift: boolean, symbols: boolean): KeyDef[][] {
  if (symbols) {
    return [ROW_SYM4, ROW_SYM1, ROW_SYM2, ROW_SYM3, ROW_FUNC, ROW_BOTTOM];
  }
  return [
    ROW_NUMBERS,
    withCase(ROW_QWERTY, shift),
    withCase(ROW_ASDF, shift),
    withCase(ROW_ZXCV, shift),
    ROW_FUNC,
    ROW_BOTTOM,
  ];
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface VirtualKeyboardProps {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onConfirm?: (v: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

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

  // refs so event handlers can read latest values
  const focusRowRef = useRef(0);
  const focusColRef = useRef(0);
  const shiftRef = useRef(false);
  const symbolsRef = useRef(false);
  const valueRef = useRef(value);
  const [cursor, setCursor] = useState(value.length);
  const cursorRef = useRef(value.length);

  focusRowRef.current = focusRow;
  focusColRef.current = focusCol;
  shiftRef.current = shift;
  symbolsRef.current = symbols;
  valueRef.current = value;

  // Si el texto cambia desde fuera y el cursor queda fuera de rango, lo ajustamos
  if (cursorRef.current > value.length) cursorRef.current = value.length;

  // ── Animation ──────────────────────────────────────────────────────────────
  const slideAnim = useRef(new RNAnimated.Value(400)).current;
  const opacityAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      cursorRef.current = valueRef.current.length;
      setCursor(valueRef.current.length);
      setFocusRow(0);
      setFocusCol(0);
      setShift(false);
      setSymbols(false);
      RNAnimated.parallel([
        RNAnimated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        RNAnimated.timing(opacityAnim, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      RNAnimated.parallel([
        RNAnimated.timing(slideAnim, {
          toValue: 400,
          duration: 220,
          easing: Easing.in(Easing.cubic),
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

  // ── Edición con cursor ─────────────────────────────────────────────────────
  const insertText = useCallback((text: string) => {
    const v = valueRef.current;
    const c = Math.min(cursorRef.current, v.length);
    const newVal = v.slice(0, c) + text + v.slice(c);
    const newCur = c + text.length;
    valueRef.current = newVal;
    cursorRef.current = newCur;
    setCursor(newCur);
    onChange(newVal);
  }, [onChange]);

  const deleteBack = useCallback(() => {
    const v = valueRef.current;
    const c = Math.min(cursorRef.current, v.length);
    if (c <= 0) return;
    const newVal = v.slice(0, c - 1) + v.slice(c);
    valueRef.current = newVal;
    cursorRef.current = c - 1;
    setCursor(c - 1);
    onChange(newVal);
  }, [onChange]);

  const moveCursor = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(valueRef.current.length, cursorRef.current + delta));
    if (next === cursorRef.current) return;
    cursorRef.current = next;
    setCursor(next);
    soundService.playNavigation();
  }, []);

  // ── Key action ─────────────────────────────────────────────────────────────
  const pressKey = useCallback((key: KeyDef) => {
    soundService.playActivation();

    if (key.action === 'char' && key.value !== undefined) {
      insertText(key.value);
      return;
    }

    switch (key.action) {
      case 'backspace':
      case 'square':
        deleteBack();
        break;
      case 'space':
      case 'triangle':
        insertText(' ');
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
      case 'prev':
        moveCursor(-1);
        break;
      case 'next':
        moveCursor(1);
        break;
      default:
        break;
    }
  }, [insertText, deleteBack, moveCursor, onClose, onConfirm]);

  // ── Rows (memoised) ────────────────────────────────────────────────────────
  const rows = useMemo(() => getRows(shift, symbols), [shift, symbols]);

  // ── Botones del mando (Gamepad API) ────────────────────────────────────────
  // □ (2) = borrar · △ (3) = espacio · L1 (4) / R1 (5) = mover cursor ←/→
  // L2 (6) = bloqueo de mayúsculas · R2 (7) = cerrar teclado (Done).
  // Mientras estén presionados se ignoran los eventos de teclado que otros
  // mapeos generen para ellos (ver handler de keydown), para que no escriban
  // letras ni confirmen la tecla enfocada.
  const pressKeyRef = useRef(pressKey);
  pressKeyRef.current = pressKey;
  const moveCursorRef = useRef(moveCursor);
  moveCursorRef.current = moveCursor;

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

    const BTN = { SQUARE: 2, TRIANGLE: 3, L1: 4, R1: 5, L2: 6, R2: 7 };
    const REPEAT_DELAY = 400;
    const REPEAT_RATE = 60;

    const isDown = (btn: number) =>
      Array.from(navigator.getGamepads() || []).some(g => !!g?.buttons[btn]?.pressed);

    type St = { prev: boolean; next: number };
    const st: Record<number, St> = {};
    Object.values(BTN).forEach(b => {
      st[b] = { prev: isDown(b), next: 0 }; // estado inicial: evita disparo al abrir
    });

    // dispara en el flanco de subida y, si repeat, mantiene repetición
    const handleBtn = (btn: number, now: number, down: boolean, fire: () => void, repeat: boolean) => {
      const t = st[btn];
      if (down && !t.prev) {
        fire();
        t.next = now + REPEAT_DELAY;
      } else if (repeat && down && now >= t.next) {
        fire();
        t.next = now + REPEAT_RATE;
      }
      t.prev = down;
    };

    let raf = 0;
    const loop = () => {
      const now = performance.now();
      handleBtn(BTN.SQUARE, now, isDown(BTN.SQUARE),
        () => pressKeyRef.current({ label: '⌫', action: 'backspace' }), true);
      handleBtn(BTN.TRIANGLE, now, isDown(BTN.TRIANGLE),
        () => pressKeyRef.current({ label: 'SPACE', action: 'space' }), false);
      handleBtn(BTN.L1, now, isDown(BTN.L1), () => moveCursorRef.current(-1), true);
      handleBtn(BTN.R1, now, isDown(BTN.R1), () => moveCursorRef.current(1), true);
      handleBtn(BTN.L2, now, isDown(BTN.L2),
        () => pressKeyRef.current({ label: '', action: 'shift' }), false);
      handleBtn(BTN.R2, now, isDown(BTN.R2),
        () => pressKeyRef.current({ label: 'Done', action: 'confirm' }), false);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  // ── Gamepad / keyboard navigation ──────────────────────────────────────────
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handle = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Botones del mando manejados por el loop del Gamepad API (□ △ L1 R1 L2 R2):
      // ignoramos cualquier tecla sintética que el mapeo del mando genere
      // para ellos (Enter, q, e, PageUp…), así no escriben ni confirman la tecla.
      if (
        typeof navigator !== 'undefined' &&
        navigator.getGamepads &&
        Array.from(navigator.getGamepads() || []).some(
          g => g && [2, 3, 4, 5, 6, 7].some(b => g.buttons[b]?.pressed)
        )
      ) {
        return;
      }

      const r = focusRowRef.current;
      const c = focusColRef.current;
      const currentRows = getRows(shiftRef.current, symbolsRef.current);
      const rowLen = currentRows[r]?.length ?? 1;

      switch (e.key) {
        case 'ArrowRight': {
          soundService.playNavigation();
          const next = Math.min(c + 1, rowLen - 1);
          focusColRef.current = next;
          setFocusCol(next);
          break;
        }
        case 'ArrowLeft': {
          soundService.playNavigation();
          const next = Math.max(c - 1, 0);
          focusColRef.current = next;
          setFocusCol(next);
          break;
        }
        case 'ArrowDown': {
          soundService.playNavigation();
          const nextR = Math.min(r + 1, currentRows.length - 1);
          const nextRowLen = currentRows[nextR]?.length ?? 1;
          const nextC = Math.min(c, nextRowLen - 1);
          focusRowRef.current = nextR;
          focusColRef.current = nextC;
          setFocusRow(nextR);
          setFocusCol(nextC);
          break;
        }
        case 'ArrowUp': {
          soundService.playNavigation();
          const nextR = Math.max(r - 1, 0);
          const nextRowLen = currentRows[nextR]?.length ?? 1;
          const nextC = Math.min(c, nextRowLen - 1);
          focusRowRef.current = nextR;
          focusColRef.current = nextC;
          setFocusRow(nextR);
          setFocusCol(nextC);
          break;
        }
        case 'Enter': {
          const key = currentRows[r]?.[c];
          if (key) pressKey(key);
          break;
        }
        case 'Escape':
        case 'b':
        case 'B':
          onClose();
          break;
        case 'Backspace':
          deleteBack();
          break;
        default:
          // Physical keyboard typing passes through
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            insertText(e.key);
          }
          break;
      }
    };

    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [visible, pressKey, onClose, insertText, deleteBack]);

  // ── Layout ─────────────────────────────────────────────────────────────────
  const scale = Math.min(ww / 1920, wh / 1080);
  const s = (v: number) => Math.round(v * scale);

  // Teclado compacto estilo PS5: teclas casi cuadradas, poca separación horizontal
  const KB_WIDTH = Math.min(ww * 0.9, s(780));
  const KEY_H_ALPHA = s(54);   // height of alpha rows
  const KEY_H_FUNC = s(46);    // function row
  const KEY_H_BOTTOM = s(48);  // bottom action row
  const GAP = s(3);            // tight gap between keys

  if (!visible) return null;

  return (
    <RNAnimated.View
      style={[styles.overlay, { opacity: opacityAnim }]}
      // @ts-ignore
      pointerEvents={visible ? 'box-none' : 'none'}
    >
      <RNAnimated.View
        style={[
          styles.container,
          {
            width: KB_WIDTH,
            transform: [{ translateY: slideAnim }],
            paddingHorizontal: s(10),
            paddingVertical: s(10),
            gap: GAP,
            borderRadius: s(8),
          },
        ]}
      >
        {/* Text preview */}
        <View style={[styles.previewRow, { marginBottom: s(6), height: s(38) }]}>
          <Text
            style={[styles.previewText, { fontSize: s(18) }]}
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {value.slice(0, Math.min(cursor, value.length))}
          </Text>
          {/* blinking cursor (en la posición de edición) */}
          <BlinkingCursor height={s(20)} />
          <Text
            style={[styles.previewText, { fontSize: s(18) }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {value.slice(Math.min(cursor, value.length))}
          </Text>
          {/* indicador de mayúsculas activas */}
          {shift && !symbols && (
            <View style={[styles.capsBadge, { marginLeft: 'auto', paddingHorizontal: s(8), paddingVertical: s(2), borderRadius: s(3) }]}>
              <Text style={[styles.capsBadgeText, { fontSize: s(11) }]}>MAYÚS</Text>
            </View>
          )}
        </View>

        {/* Key rows */}
        {rows.map((row, rIdx) => {
          const isFunc = rIdx === rows.length - 2;
          const isBottom = rIdx === rows.length - 1;
          const keyH = isBottom ? KEY_H_BOTTOM : isFunc ? KEY_H_FUNC : KEY_H_ALPHA;

          return (
            <View key={rIdx} style={[styles.row, { gap: GAP }]}>
              {row.map((key, cIdx) => {
                const isFocused = focusRow === rIdx && focusCol === cIdx;
                const isConfirm = key.action === 'confirm';
                const isBack = key.action === 'backspace';
                const isSpace = key.action === 'space';
                const isCapsOn = key.action === 'shift' && shift && !symbols;

                return (
                  <TouchableOpacity
                    key={`${rIdx}-${cIdx}`}
                    onPress={() => pressKey(key)}
                    activeOpacity={0.7}
                    style={[
                      styles.key,
                      {
                        height: keyH,
                        flex: key.flex ?? 1,
                        borderRadius: s(4),
                      },
                      isBottom && styles.keyBottom,
                      isFunc && styles.keyFunc,
                      isConfirm && styles.keyConfirm,
                      isFocused && styles.keyFocused,
                      isFocused && isConfirm && styles.keyConfirmFocused,
                      isCapsOn && styles.keyCapsOn,
                    ]}
                  >
                    {/* sublabel hint (L1, R2 etc.) */}
                    {key.sub && (
                      <Text style={[styles.subLabel, { fontSize: s(9) }, isCapsOn && { color: 'rgba(0,0,0,0.55)' }]}>
                        {key.sub}
                      </Text>
                    )}

                    {/* Icono del botón del mando integrado en la tecla (△ / □) */}
                    {key.hintIcon && (
                      <View style={{ position: 'absolute', top: s(4), left: s(6) }}>
                        <PSIcon
                          char={PSIcons[key.hintIcon as keyof typeof PSIcons]}
                          size={s(13)}
                          color={'rgba(255,255,255,0.55)'}
                        />
                      </View>
                    )}

                    {/* PSIcon (botones PlayStation) */}
                    {key.psIcon ? (
                      <PSIcon
                        char={PSIcons[key.psIcon as keyof typeof PSIcons]}
                        size={isBottom ? s(20) : s(18)}
                        color={
                          isCapsOn
                            ? '#000000'
                            : isFocused
                              ? '#FFFFFF'
                              : 'rgba(255,255,255,0.80)'
                        }
                      />
                    ) : isSpace ? (
                      <View style={styles.spaceBar} />
                    ) : (
                      <Text
                        style={[
                          styles.keyLabel,
                          { fontSize: isBottom ? s(16) : isFunc ? s(13) : s(20) },
                          isConfirm && styles.keyLabelConfirm,
                          isFocused && styles.keyLabelFocused,
                          isBack && { fontSize: s(17) },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {key.label}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </RNAnimated.View>
    </RNAnimated.View>
  );
};

// ── Blinking cursor ───────────────────────────────────────────────────────────

const BlinkingCursor: React.FC<{ height: number }> = ({ height }) => {
  const opacity = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        RNAnimated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <RNAnimated.View
      style={{ width: 2, height, backgroundColor: '#fff', marginLeft: 2, opacity, borderRadius: 1 }}
    />
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 9999,
  } as any,

  container: {
    backgroundColor: 'rgba(18, 18, 22, 0.98)',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...(Platform.OS === 'web'
      ? ({
        backdropFilter: 'blur(32px)',
        boxShadow: '0 -20px 80px rgba(0,0,0,0.85)',
      } as any)
      : {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.8,
        shadowRadius: 32,
      }),
  },

  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 8,
  },
  previewText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontFamily: 'SSTLight',
    letterSpacing: 0.5,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'center',
  },

  /* ── alpha key (default) ── */
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    position: 'relative',
  },

  /* ── func-row key ── */
  keyFunc: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },

  /* ── bottom-row key ── */
  keyBottom: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },

  /* ── confirm "Done" ── */
  keyConfirm: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  /* ── focused key: PS5 white border square ── */
  keyFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.12)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 0 1px rgba(255,255,255,0.55) inset' } as any)
      : {}),
  },

  keyConfirmFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.20)',
  },

  capsBadge: {
    backgroundColor: '#FFFFFF',
  },
  capsBadgeText: {
    color: '#000000',
    fontFamily: 'SSTBold',
    letterSpacing: 0.5,
  },

  /* ── mayúsculas activas: tecla rellena en blanco ── */
  keyCapsOn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },

  subLabel: {
    position: 'absolute',
    top: 3,
    left: 5,
    color: 'rgba(255,255,255,0.35)',
    fontFamily: 'SSTLight',
  },

  keyLabel: {
    color: 'rgba(255,255,255,0.90)',
    fontFamily: 'SSTLight',
    letterSpacing: 0.2,
    textAlign: 'center',
  },

  keyLabelFocused: {
    color: '#FFFFFF',
    fontFamily: 'SSTBold',
  },

  keyLabelConfirm: {
    color: '#FFFFFF',
    fontFamily: 'SSTMedium',
  },

  spaceBar: {
    width: '60%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 1,
  },
});

export default VirtualKeyboard;