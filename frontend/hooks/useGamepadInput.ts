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
}

/**
 * Reads the Gamepad API once per animation frame and translates button edges
 * into the same keyboard events consumed by the launcher navigation handler.
 */
export function useGamepadInput({
  onInputModeChange,
  onGamepadChange,
  onConnected,
}: UseGamepadInputOptions) {
  const callbacksRef = useRef({ onInputModeChange, onGamepadChange, onConnected });
  callbacksRef.current = { onInputModeChange, onGamepadChange, onConnected };
  const previousButtonsRef = useRef<boolean[]>(new Array(16).fill(false));
  const previousAxesRef = useRef([0, 0, 0, 0]);
  const lastGamepadIdRef = useRef<string | null>(null);
  const isFirstPollRef = useRef(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;

    let animationFrameId: number | undefined;
    const schedulePoll = () => {
      if (!document.hidden && animationFrameId === undefined) {
        animationFrameId = requestAnimationFrame(() => {
          animationFrameId = undefined;
          poll();
        });
      }
    };
    const poll = () => {
      const gamepad = navigator.getGamepads?.()[0];

      if (!gamepad) {
        if (lastGamepadIdRef.current !== null) {
          lastGamepadIdRef.current = null;
          isFirstPollRef.current = true;
          callbacksRef.current.onGamepadChange({ connected: false, name: '', battery: 0 });
        }
        schedulePoll();
        return;
      }

      if (isFirstPollRef.current) {
        isFirstPollRef.current = false;
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
        const dispatch = (key: string) => {
          callbacksRef.current.onInputModeChange('gamepad');
          const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
          (event as KeyboardEvent & { fromGamepad?: boolean }).fromGamepad = true;
          window.dispatchEvent(event);
        };
        const checkButton = (index: number, key: string) => {
          const pressed = Boolean(gamepad.buttons[index]?.pressed);
          if (pressed && !previousButtonsRef.current[index]) dispatch(key);
          previousButtonsRef.current[index] = pressed;
        };
        const checkAxis = (axisIndex: number, positiveKey: string, negativeKey: string) => {
          const value = gamepad.axes[axisIndex] || 0;
          const previousValue = previousAxesRef.current[axisIndex] || 0;
          const threshold = 0.5;
          if (value > threshold && previousValue <= threshold) dispatch(positiveKey);
          else if (value < -threshold && previousValue >= -threshold) dispatch(negativeKey);
          previousAxesRef.current[axisIndex] = value;
        };

        checkButton(12, 'ArrowUp'); checkButton(13, 'ArrowDown');
        checkButton(14, 'ArrowLeft'); checkButton(15, 'ArrowRight');
        checkAxis(1, 'ArrowDown', 'ArrowUp');
        checkAxis(0, 'ArrowRight', 'ArrowLeft');
        checkButton(0, 'Enter'); checkButton(1, 'Escape');
        checkButton(2, 'x'); checkButton(3, 't');
        checkButton(4, 'q'); checkButton(5, 'e');
        checkButton(6, 'z'); checkButton(7, 'c');
        checkButton(9, 's'); checkButton(8, 'Home');
      }

      if (lastGamepadIdRef.current !== gamepad.id) {
        lastGamepadIdRef.current = gamepad.id;
        callbacksRef.current.onGamepadChange({ connected: true, name: gamepad.id, battery: 0.75 });
        callbacksRef.current.onConnected();
      }

      schedulePoll();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animationFrameId !== undefined) cancelAnimationFrame(animationFrameId);
        animationFrameId = undefined;
      } else {
        // Al volver a la ventana, se toma el estado actual del mando antes
        // de procesar pulsaciones para evitar acciones acumuladas.
        isFirstPollRef.current = true;
        schedulePoll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    schedulePoll();
    return () => {
      if (animationFrameId !== undefined) cancelAnimationFrame(animationFrameId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
