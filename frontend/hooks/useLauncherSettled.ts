import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * - splashDone (= "revealed"): Home ya es visible (la capa de selección de usuario se retiró).
 * - settled: tras revelar, el hilo JS lleva ~20 frames seguidos estables
 *   (o pasó el tope de seguridad). Hasta entonces no se anima ni se dispara
 *   trabajo pesado (Steam, etc.).
 * - animReady: segunda espera, DESPUÉS de settled. El notify de settled
 *   dispara fetches y el pre-montaje de paneles; si las entering arrancan
 *   en ese mismo tick, Reanimated (web) usa timestamps y las da por
 *   terminadas. animReady espera a que el reloj vuelva a estar estable.
 * - introReady: tercera espera, DESPUÉS de animReady. El remount de
 *   GameInfoPanel / widgets dispara otro hitch; las intros del carrusel
 *   (withTiming) esperan a que ese commit ya se haya pintado.
 */
const MIN_SETTLE_MS = 600;
const SETTLE_MAX_MS = 4000;
const STABLE_FRAMES = 20;
const FRAME_BUDGET_MS = 20;

const ANIM_MIN_MS = 280;
const ANIM_MAX_MS = 2500;
const ANIM_STABLE_FRAMES = 16;

const INTRO_MIN_MS = 80;
const INTRO_MAX_MS = 1500;
const INTRO_STABLE_FRAMES = 8;

const AFTER_PAINT_STABLE = 2;
const AFTER_PAINT_MAX_MS = 1200;

let revealed = false;
let settled = false;
let animReady = false;
let introReady = false;
let generation = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function waitForStableFrames(
  gen: number,
  minMs: number,
  maxMs: number,
  stableNeeded: number,
  onDone: () => void,
) {
  const start = performance.now();
  let last = 0;
  let stable = 0;

  const tick = (ts: number) => {
    if (gen !== generation) return;
    if (last === 0) {
      last = ts;
      requestAnimationFrame(tick);
      return;
    }
    const delta = ts - last;
    last = ts;
    stable = delta <= FRAME_BUDGET_MS ? stable + 1 : 0;
    const elapsed = ts - start;
    if ((stable >= stableNeeded && elapsed >= minMs) || elapsed > maxMs) {
      onDone();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function markIntroReady(gen: number) {
  if (gen !== generation || introReady) return;
  introReady = true;
  notify();
}

function beginIntroClock(gen: number) {
  if (Platform.OS !== 'web' || typeof requestAnimationFrame === 'undefined') {
    markIntroReady(gen);
    return;
  }
  waitForStableFrames(gen, INTRO_MIN_MS, INTRO_MAX_MS, INTRO_STABLE_FRAMES, () => {
    markIntroReady(gen);
  });
}

function markAnimReady(gen: number) {
  if (gen !== generation || animReady) return;
  animReady = true;
  notify();
  // El remount con entering de paneles/widgets corre en este commit.
  beginIntroClock(gen);
}

function beginAnimClock(gen: number) {
  if (Platform.OS !== 'web' || typeof requestAnimationFrame === 'undefined') {
    markAnimReady(gen);
    return;
  }
  waitForStableFrames(gen, ANIM_MIN_MS, ANIM_MAX_MS, ANIM_STABLE_FRAMES, () => {
    markAnimReady(gen);
  });
}

/** Llamar cuando se vuelve a la pantalla de selección de usuario. */
export function resetLauncherSettled() {
  generation++;
  revealed = false;
  settled = false;
  animReady = false;
  introReady = false;
  notify();
}

/** Llamar cuando la capa de selección de usuario terminó de desaparecer. */
export function markLauncherRevealed() {
  if (revealed) return;
  revealed = true;
  notify();

  if (Platform.OS !== 'web' || typeof requestAnimationFrame === 'undefined') {
    settled = true;
    animReady = true;
    introReady = true;
    notify();
    return;
  }

  const gen = generation;
  waitForStableFrames(gen, MIN_SETTLE_MS, SETTLE_MAX_MS, STABLE_FRAMES, () => {
    if (gen !== generation || settled) return;
    settled = true;
    notify();
    // El trabajo que escucha `settled` (caché de Steam, pre-montaje) corre
    // en este commit. Esperamos a que el hilo se recupere antes de entering.
    beginAnimClock(gen);
  });
}

/**
 * Ejecuta `fn` tras 2 frames de pintura estables. Evita que withTiming tome
 * como t0 el momento del commit de React (si el siguiente RAF llega tarde,
 * Reanimated en web salta al final de la animación).
 */
export function afterPaint(fn: () => void): () => void {
  if (typeof requestAnimationFrame === 'undefined') {
    fn();
    return () => {};
  }
  let cancelled = false;
  let id = 0;
  let last = 0;
  let stable = 0;
  const start = performance.now();

  const tick = (ts: number) => {
    if (cancelled) return;
    if (last === 0) {
      last = ts;
      id = requestAnimationFrame(tick);
      return;
    }
    const delta = ts - last;
    last = ts;
    stable = delta <= FRAME_BUDGET_MS ? stable + 1 : 0;
    if (stable >= AFTER_PAINT_STABLE || ts - start > AFTER_PAINT_MAX_MS) {
      fn();
      return;
    }
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(id);
  };
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
export const useAnimClockReady = () => useFlag(() => animReady);
export const useIntroReady = () => useFlag(() => introReady);
