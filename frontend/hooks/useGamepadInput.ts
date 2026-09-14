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

/**
 * Reads the Gamepad API once per animation frame and translates button edges
 * into the same keyboard events consumed by the launcher navigation handler.
 */
export function useGamepadInput({
  onInputModeChange,
  onGamepadChange,
  onConnected,
  onStaleGamepad,
}: UseGamepadInputOptions) {
  const callbacksRef = useRef({ onInputModeChange, onGamepadChange, onConnected, onStaleGamepad });
  callbacksRef.current = { onInputModeChange, onGamepadChange, onConnected, onStaleGamepad };
  const previousButtonsRef = useRef<boolean[]>(new Array(16).fill(false));
  const previousAxesRef = useRef([0, 0, 0, 0]);
  const lastGamepadIdRef = useRef<string | null>(null);
  const isFirstPollRef = useRef(true);
  const animationFrameIdRef = useRef<number | null>(null);
  const hadGamepadRef = useRef(false);
  const focusRecoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleNotifiedRef = useRef(false);
  const lastStaleNotifyAtRef = useRef(0);
  // Auto-repeat de direcciones (D-pad y stick) mientras se mantienen presionadas,
  // igual que el repeat de teclado del sistema operativo.
  const repeatStateRef = useRef<Record<string, { pressedAt: number; lastFireAt: number }>>({});

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

    // Reemplaza la lectura de gamepad dentro de poll()
    const getActiveGamepad = (): Gamepad | null => {
      const pads = navigator.getGamepads?.() ?? [];
      // Prioriza mantener el mismo mando si sigue conectado
      if (lastGamepadIdRef.current) {
        const same = Array.from(pads).find(
          (p): p is Gamepad => !!p && p.id === lastGamepadIdRef.current
        );
        if (same) return same;
      }
      // Si no, toma el primer slot con un mando real
      return Array.from(pads).find((p): p is Gamepad => !!p) ?? null;
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

    const startRepeat = (key: string) => {
      repeatStateRef.current[key] = { pressedAt: performance.now(), lastFireAt: performance.now() };
    };
    const stopRepeat = (key: string) => {
      delete repeatStateRef.current[key];
    };
    const maybeRepeat = (key: string) => {
      const state = repeatStateRef.current[key];
      if (!state) return;
      const now = performance.now();
      if (now - state.pressedAt >= REPEAT_INITIAL_DELAY && now - state.lastFireAt >= REPEAT_INTERVAL) {
        dispatchKey(key);
        state.lastFireAt = now;
      }
    };

    const dispatchKey = (key: string) => {
      callbacksRef.current.onInputModeChange('gamepad');
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      (event as KeyboardEvent & { fromGamepad?: boolean }).fromGamepad = true;
      window.dispatchEvent(event);
    };

    const poll = () => {
      if (!hasFocus()) {
        cancelLoop();
        return;
      }
      const gamepad = getActiveGamepad();

      if (!gamepad) {
        if (lastGamepadIdRef.current !== null) {
          lastGamepadIdRef.current = null;
          isFirstPollRef.current = true;
          repeatStateRef.current = {};
          callbacksRef.current.onGamepadChange({ connected: false, name: '', battery: 0 });
        }
        schedulePoll();
        return;
      }

      if (isFirstPollRef.current) {
        isFirstPollRef.current = false;
        repeatStateRef.current = {};
        gamepad.buttons.forEach((button, index) => {
          previousButtonsRef.current[index] = Boolean(button?.pressed);
        });
        previousAxesRef.current = [
          gamepad.axes[0] || 0,
          gamepad.axes[1] || 0,
          gamepad.axes[2] || 0,
          gamepad.axes[3] || 0,
        ];
      } else {
        const checkButton = (index: number, key: string, repeatable = false) => {
          const pressed = Boolean(gamepad.buttons[index]?.pressed);
          const wasPressed = previousButtonsRef.current[index];
          if (pressed && !wasPressed) {
            dispatchKey(key);
            if (repeatable) startRepeat(key);
          } else if (!pressed && wasPressed) {
            if (repeatable) stopRepeat(key);
          } else if (pressed && repeatable) {
            maybeRepeat(key);
          }
          previousButtonsRef.current[index] = pressed;
        };
        const checkAxis = (axisIndex: number, positiveKey: string, negativeKey: string) => {
          const value = gamepad.axes[axisIndex] || 0;
          const previousValue = previousAxesRef.current[axisIndex] || 0;
          const threshold = 0.5;
          const wasPositive = previousValue > threshold;
          const wasNegative = previousValue < -threshold;
          const isPositive = value > threshold;
          const isNegative = value < -threshold;

          if (isPositive && !wasPositive) {
            dispatchKey(positiveKey);
            startRepeat(positiveKey);
          } else if (!isPositive && wasPositive) {
            stopRepeat(positiveKey);
          } else if (isPositive) {
            maybeRepeat(positiveKey);
          }

          if (isNegative && !wasNegative) {
            dispatchKey(negativeKey);
            startRepeat(negativeKey);
          } else if (!isNegative && wasNegative) {
            stopRepeat(negativeKey);
          } else if (isNegative) {
            maybeRepeat(negativeKey);
          }

          previousAxesRef.current[axisIndex] = value;
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

        // Combo Select + Start (Share + Options) -> Escape (cerrar/alternar overlay)
        // const isSelect = Boolean(gamepad.buttons[8]?.pressed);
        // const isStart = Boolean(gamepad.buttons[9]?.pressed);
        // if (isSelect && isStart && (!previousButtonsRef.current[8] || !previousButtonsRef.current[9])) {
        //   dispatchKey('Escape');
        // }

        // ── Combo Select + Start (Share + Options / Back + Start) ──
        const isSelect = Boolean(gamepad.buttons[8]?.pressed);
        const isStart = Boolean(gamepad.buttons[9]?.pressed);
        const wasSelect = previousButtonsRef.current[8];
        const wasStart = previousButtonsRef.current[9];

        // Solo dispara el evento Escape en el primer instante donde AMBOS estén presionados a la vez
        if (isSelect && isStart && (!wasSelect || !wasStart)) {
          dispatchKey('Escape');
        }
      }

      if (lastGamepadIdRef.current !== gamepad.id) {
        lastGamepadIdRef.current = gamepad.id;
        hadGamepadRef.current = true;
        staleNotifiedRef.current = false; // mando funcionando de nuevo: habilita futuros avisos
        callbacksRef.current.onGamepadChange({ connected: true, name: gamepad.id, battery: 0.75 });
        callbacksRef.current.onConnected();
      }

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
        const stillMissing = !getActiveGamepad();
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
        isFirstPollRef.current = true;
        schedulePoll();
        scheduleFocusRecoveryCheck();
      }
    };

    const handleGamepadConnected = () => {
      isFirstPollRef.current = true; // re-baseline con el nuevo mando
      schedulePoll();
    };
    const handleGamepadDisconnected = () => {
      isFirstPollRef.current = true;
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