import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Gestión del ciclo de vida y animación del arranque del Launcher.
 *
 * - revealed: Home ya es visible (la capa de selección de usuario se retiró).
 * - settled: El layout base está listo y la UI debe renderizarse.
 * - animReady: Los paneles están listos para animar su entrada.
 * - introReady: Las animaciones de entrada del carrusel y paneles arrancan de inmediato.
 * - introDone: Se activa tras completarse las animaciones de entrada (~1200 ms).
 *   En este punto arranca el trabajo pesado de red/sync (Steam, noticias, sync online, updates)
 *   sin competir por CPU/GPU con las animaciones iniciales.
 */

let revealed = false;
let settled = false;
let animReady = false;
let introReady = false;
let introDone = false;
let generation = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Llamar cuando se vuelve a la pantalla de selección de usuario. */
export function resetLauncherSettled() {
  generation++;
  revealed = false;
  settled = false;
  animReady = false;
  introReady = false;
  introDone = false;
  notify();
}

/** Llamar cuando la capa de selección de usuario terminó de desaparecer o Home es visible. */
export function markLauncherRevealed() {
  if (revealed) return;
  revealed = true;
  generation++;
  const gen = generation;

  if (Platform.OS !== 'web' || typeof requestAnimationFrame === 'undefined') {
    settled = true;
    animReady = true;
    introReady = true;
    introDone = true;
    notify();
    return;
  }

  // Dejar 1 frame para asegurar que el DOM está pintado, y luego activar
  // de inmediato settled, animReady e introReady para que el carrusel,
  // GameInfoPanel y los fondos arranquen sus animaciones sin demoras ni bloqueos.
  requestAnimationFrame(() => {
    if (gen !== generation) return;
    settled = true;
    animReady = true;
    introReady = true;
    notify();

    // introDone se activa tras el margen de entrada (~1200ms) para que el trabajo
    // pesado (Steam sync, noticias, checking updates) arranque cuando la UI ya se presentó.
    setTimeout(() => {
      if (gen !== generation) return;
      introDone = true;
      notify();
    }, 1200);
  });
}

/**
 * Ejecuta `fn` tras 2 frames de pintura (doble rAF). Evita que withTiming tome
 * como t0 el momento previo al commit de React sin demoras arbitrarias.
 */
export function afterPaint(fn: () => void): () => void {
  if (typeof requestAnimationFrame === 'undefined') {
    fn();
    return () => {};
  }
  let cancelled = false;
  requestAnimationFrame(() => {
    if (cancelled) return;
    requestAnimationFrame(() => {
      if (cancelled) return;
      fn();
    });
  });
  return () => {
    cancelled = true;
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
export const useIntroDone = () => useFlag(() => introDone);
