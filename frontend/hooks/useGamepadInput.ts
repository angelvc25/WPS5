import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

interface GamepadInfo {
  connected: boolean;
  name: string;
  battery: number;
}

interface UseGamepadInputOptions {
  onInputModeChange: (mode: 'gamepad') => void;
  onGamepadChange: (info: GamepadInfo) => void;
  onConnected: () => void;
  onStaleGamepad?: () => void;
}

// Estado de lectura independiente por mando (clave = gamepad.index).
// IMPORTANTE: no se puede identificar un mando por `gamepad.id`: dos mandos
// del mismo modelo comparten el mismo id, y antes eso hacía que siempre se
// leyera solo el primero.
interface PadState {
  buttons: boolean[];
  axes: number[];
  first: boolean; // primer poll tras conectar/recuperar foco: solo toma línea base
  repeat: Record<string, { pressedAt: number; lastFireAt: number }>;
}

/**
 * Reads the Gamepad API once per animation frame and translates button edges
 * into the same keyboard events consumed by the launcher navigation handler.
 * Todos los mandos conectados pueden controlar el launcher a la vez.
 */
export function useGamepadInput({
  onInputModeChange,
  onGamepadChange,
  onConnected,
  onStaleGamepad,
}: UseGamepadInputOptions) {
  const callbacksRef = useRef({ onInputModeChange, onGamepadChange, onConnected, onStaleGamepad });
  callbacksRef.current = { onInputModeChange, onGamepadChange, onConnected, onStaleGamepad };
  const padStatesRef = useRef<Map<number, PadState>>(new Map());
  // id del mando "activo" (el último que mandó una pulsación): solo se usa para
  // informar nombre/estado al resto de la UI (widget de batería, etc.).
  const lastGamepadIdRef = useRef<string | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const hadGamepadRef = useRef(false);
  const focusRecoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleNotifiedRef = useRef(false);
  const lastStaleNotifyAtRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;

    const hasFocus = () => {
      if (typeof document === 'undefined') return false;
      if (document.hidden) return false;
      return typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    };

    const cancelLoop = () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };

    const schedulePoll = () => {
      if (!hasFocus()) {
        cancelLoop();
        return;
      }
      if (animationFrameIdRef.current === null) {
        animationFrameIdRef.current = requestAnimationFrame(() => {
          animationFrameIdRef.current = null;
          poll();
        });
      }
    };

    const isPadAlive = (p: Gamepad | null): p is Gamepad =>
      !!p && (p as any).connected !== false;
    const getAlivePads = (): Gamepad[] =>
      Array.from(navigator.getGamepads?.() ?? []).filter(isPadAlive);

    const resetAllPadStates = () => {
      padStatesRef.current.clear();
    };

    const notifyStaleGamepad = () => {
      if (staleNotifiedRef.current) return; // ya avisamos para este episodio, no repetir
      const now = performance.now();
      if (now - lastStaleNotifyAtRef.current < 10000) return; // cooldown extra de seguridad
      staleNotifiedRef.current = true;
      lastStaleNotifyAtRef.current = now;
      callbacksRef.current.onStaleGamepad?.();
    };

    // ── Auto-repeat de direcciones ──────────────────────────────────────────
    // REPEAT_INITIAL_DELAY: cuánto hay que mantener presionado antes de que
    // empiece a repetir (evita que un solo toque dispare dos veces por error).
    // REPEAT_INTERVAL: cada cuánto repite mientras se mantiene presionado.
    // Bájalo para que el carrusel se desplace más rápido; súbelo para que
    // vaya más lento/controlado.
    const REPEAT_INITIAL_DELAY = 350;
    const REPEAT_INTERVAL = 110;

    const dispatchKey = (key: string, gamepad: Gamepad) => {
      // Este mando acaba de dar una orden: pasa a ser el "activo" para la UI.
      if (lastGamepadIdRef.current !== gamepad.id) {
        lastGamepadIdRef.current = gamepad.id;
        callbacksRef.current.onGamepadChange({ connected: true, name: gamepad.id, battery: 0.99 });
      }
      callbacksRef.current.onInputModeChange('gamepad');
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      (event as KeyboardEvent & { fromGamepad?: boolean }).fromGamepad = true;
      window.dispatchEvent(event);
    };

    const getState = (gamepad: Gamepad): PadState => {
      let st = padStatesRef.current.get(gamepad.index);
      if (!st) {
        st = { buttons: new Array(16).fill(false), axes: [0, 0, 0, 0], first: true, repeat: {} };
        padStatesRef.current.set(gamepad.index, st);
      }
      return st;
    };

    // Procesa un mando: detecta flancos y dispara las teclas equivalentes.
    const processPad = (gamepad: Gamepad) => {
      const st = getState(gamepad);

      if (st.first) {
        st.first = false;
        st.repeat = {};
        gamepad.buttons.forEach((button, index) => {
          st.buttons[index] = Boolean(button?.pressed);
        });
        st.axes = [
          gamepad.axes[0] || 0,
          gamepad.axes[1] || 0,
          gamepad.axes[2] || 0,
          gamepad.axes[3] || 0,
        ];
        return;
      }

      const startRepeat = (key: string) => {
        st.repeat[key] = { pressedAt: performance.now(), lastFireAt: performance.now() };
      };
      const stopRepeat = (key: string) => {
        delete st.repeat[key];
      };
      const maybeRepeat = (key: string) => {
        const state = st.repeat[key];
        if (!state) return;
        const now = performance.now();
        if (now - state.pressedAt >= REPEAT_INITIAL_DELAY && now - state.lastFireAt >= REPEAT_INTERVAL) {
          dispatchKey(key, gamepad);
          state.lastFireAt = now;
        }
      };

      const checkButton = (index: number, key: string, repeatable = false) => {
        const pressed = Boolean(gamepad.buttons[index]?.pressed);
        const wasPressed = st.buttons[index];
        if (pressed && !wasPressed) {
          dispatchKey(key, gamepad);
          if (repeatable) startRepeat(key);
        } else if (!pressed && wasPressed) {
          if (repeatable) stopRepeat(key);
        } else if (pressed && repeatable) {
          maybeRepeat(key);
        }
        st.buttons[index] = pressed;
      };
      const checkAxis = (axisIndex: number, positiveKey: string, negativeKey: string) => {
        const value = gamepad.axes[axisIndex] || 0;
        const previousValue = st.axes[axisIndex] || 0;
        const threshold = 0.5;
        const wasPositive = previousValue > threshold;
        const wasNegative = previousValue < -threshold;
        const isPositive = value > threshold;
        const isNegative = value < -threshold;

        if (isPositive && !wasPositive) {
          dispatchKey(positiveKey, gamepad);
          startRepeat(positiveKey);
        } else if (!isPositive && wasPositive) {
          stopRepeat(positiveKey);
        } else if (isPositive) {
          maybeRepeat(positiveKey);
        }

        if (isNegative && !wasNegative) {
          dispatchKey(negativeKey, gamepad);
          startRepeat(negativeKey);
        } else if (!isNegative && wasNegative) {
          stopRepeat(negativeKey);
        } else if (isNegative) {
          maybeRepeat(negativeKey);
        }

        st.axes[axisIndex] = value;
      };

      // D-pad y stick izquierdo: repetibles, para desplazamiento rápido del carrusel.
      checkButton(12, 'ArrowUp', true); checkButton(13, 'ArrowDown', true);
      checkButton(14, 'ArrowLeft', true); checkButton(15, 'ArrowRight', true);
      checkAxis(1, 'ArrowDown', 'ArrowUp');
      checkAxis(0, 'ArrowRight', 'ArrowLeft');
      // Resto de botones: un solo disparo por pulsación, sin repeat.
      checkButton(0, 'Enter'); checkButton(1, 'Escape');
      checkButton(2, 'x'); checkButton(3, 't');
      checkButton(4, 'q'); checkButton(5, 'e');
      checkButton(6, 'z'); checkButton(7, 'c');
      checkButton(9, 's'); checkButton(8, 'Home');

      // ── Combo Select + Start (Share + Options / Back + Start) ──
      const isSelect = Boolean(gamepad.buttons[8]?.pressed);
      const isStart = Boolean(gamepad.buttons[9]?.pressed);
      const wasSelect = st.buttons[8];
      const wasStart = st.buttons[9];

      // Solo dispara el evento Escape en el primer instante donde AMBOS estén presionados a la vez
      if (isSelect && isStart && (!wasSelect || !wasStart)) {
        dispatchKey('Escape', gamepad);
      }
    };

    const poll = () => {
      if (!hasFocus()) {
        cancelLoop();
        return;
      }
      const pads = getAlivePads();

      if (pads.length === 0) {
        if (lastGamepadIdRef.current !== null) {
          lastGamepadIdRef.current = null;
          resetAllPadStates();
          callbacksRef.current.onGamepadChange({ connected: false, name: '', battery: 0 });
        }
        schedulePoll();
        return;
      }

      // Descarta el estado de mandos que ya no están listados.
      const aliveIdx = new Set(pads.map((p) => p.index));
      padStatesRef.current.forEach((_v, idx) => {
        if (!aliveIdx.has(idx)) padStatesRef.current.delete(idx);
      });

      // Aparece el primer mando (o vuelve tras no haber ninguno): anunciarlo.
      if (lastGamepadIdRef.current === null) {
        const first = pads[0];
        lastGamepadIdRef.current = first.id;
        hadGamepadRef.current = true;
        staleNotifiedRef.current = false; // mando funcionando de nuevo: habilita futuros avisos
        callbacksRef.current.onGamepadChange({ connected: true, name: first.id, battery: 0.99 });
        callbacksRef.current.onConnected();
      }

      // Todos los mandos controlan el launcher. Un mando "congelado" (p. ej.
      // el físico cuando Steam Input lo toma y entrega datos por un pad
      // virtual) simplemente no genera pulsaciones, así que no hace falta
      // detectarlo ni migrar: el pad virtual funciona por su cuenta.
      for (const gp of pads) processPad(gp);

      schedulePoll();
    };

    const clearFocusRecoveryCheck = () => {
      if (focusRecoveryTimeoutRef.current !== null) {
        clearTimeout(focusRecoveryTimeoutRef.current);
        focusRecoveryTimeoutRef.current = null;
      }
    };

    const scheduleFocusRecoveryCheck = () => {
      clearFocusRecoveryCheck();
      // Damos ~1.5s tras recuperar el foco para que, si el mando sigue vivo,
      // el poll normal ya lo haya vuelto a detectar. Si en ese momento seguimos
      // sin verlo pero SÍ lo teníamos antes (típico tras cerrar Steam con Steam
      // Input activo, o un emulador como RPCS3 que tomó el mando por HID
      // crudo), avisamos al usuario: apagar/encender el mando es lo único
      // que confiablemente arregla este estado (no es algo que podamos
      // resolver por software desde el renderer).
      focusRecoveryTimeoutRef.current = setTimeout(() => {
        focusRecoveryTimeoutRef.current = null;
        if (!hasFocus()) return;
        const stillMissing = getAlivePads().length === 0;
        if (hadGamepadRef.current && stillMissing) {
          hadGamepadRef.current = false; // evita disparar en bucle
          notifyStaleGamepad();
        }
      }, 1500);
    };

    const handleFocusStateChange = () => {
      if (!hasFocus()) {
        cancelLoop();
        clearFocusRecoveryCheck();
      } else {
        resetAllPadStates(); // re-baseline de todos los mandos al volver el foco
        schedulePoll();
        scheduleFocusRecoveryCheck();
      }
    };

    const handleGamepadConnected = (e: Event) => {
      // Solo re-baseline del mando nuevo; los demás siguen sin interrupción.
      const idx = (e as GamepadEvent)?.gamepad?.index;
      if (typeof idx === 'number') padStatesRef.current.delete(idx);
      schedulePoll();
    };
    const handleGamepadDisconnected = (e: Event) => {
      const gp = (e as GamepadEvent)?.gamepad;
      if (gp) padStatesRef.current.delete(gp.index);
      // Si se fue justo el mando "activo" pero quedan otros, el siguiente
      // pulso de cualquiera lo reasigna; si no queda ninguno, poll() avisa.
      if (gp && gp.id === lastGamepadIdRef.current) {
        const remaining = getAlivePads().filter((p) => p.index !== gp.index);
        if (remaining.length > 0) {
          lastGamepadIdRef.current = remaining[0].id;
          callbacksRef.current.onGamepadChange({ connected: true, name: remaining[0].id, battery: 0.99 });
        }
      }
      schedulePoll();
    };

    document.addEventListener('visibilitychange', handleFocusStateChange);
    window.addEventListener('focus', handleFocusStateChange);
    window.addEventListener('blur', handleFocusStateChange);
    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
    schedulePoll();
    return () => {
      cancelLoop();
      clearFocusRecoveryCheck();
      document.removeEventListener('visibilitychange', handleFocusStateChange);
      window.removeEventListener('focus', handleFocusStateChange);
      window.removeEventListener('blur', handleFocusStateChange);
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
    };
  }, []);
}