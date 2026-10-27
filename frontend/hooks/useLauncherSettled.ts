import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * - splashDone (= "revealed"): Home ya es visible (la capa de selección de usuario se retiró).
 * - settled: tras revelar, el hilo JS lleva ~20 frames seguidos estables
 *   (o pasó el tope de seguridad). Hasta entonces nada se anima.
 */
const MIN_SETTLE_MS = 600;
const SETTLE_MAX_MS = 4000;
const STABLE_FRAMES = 20;
const FRAME_BUDGET_MS = 24;

let revealed = false;
let settled = false;
let generation = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Llamar cuando se vuelve a la pantalla de selección de usuario. */
export function resetLauncherSettled() {
  generation++;
  revealed = false;
  settled = false;
  notify();
}

/** Llamar cuando la capa de selección de usuario terminó de desaparecer. */
export function markLauncherRevealed() {
  if (revealed) return;
  revealed = true;
  notify();

  if (Platform.OS !== 'web' || typeof requestAnimationFrame === 'undefined') {
    settled = true;
    notify();
    return;
  }

  const gen = generation;
  const start = performance.now();
  let last = start;
  let stable = 0;

  const tick = (ts: number) => {
    if (gen !== generation) return;
    const delta = ts - last;
    last = ts;
    stable = delta <= FRAME_BUDGET_MS ? stable + 1 : 0;
    const elapsed = ts - start;
    if ((stable >= STABLE_FRAMES && elapsed >= MIN_SETTLE_MS) || elapsed > SETTLE_MAX_MS) {
      settled = true;
      notify();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function useFlag(get: () => boolean): boolean {
  const [value, setValue] = useState(get);
  useEffect(() => {
    const listener = () => setValue(get());
    listeners.add(listener);
    listener();
    return () => { listeners.delete(listener); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export const useSplashDone = () => useFlag(() => revealed);
export const useLauncherSettled = () => useFlag(() => settled);