import { useEffect, useState } from 'react';

export interface FpsReading {
  /** Fotogramas por segundo medidos en la última ventana de muestreo. */
  fps: number;
  /** Duración media de un fotograma, en milisegundos. */
  frameMs: number;
  /** Fotogramas que superaron los 20 ms (los que se ven como tirones). */
  longFrames: number;
}

/**
 * Mide el frame rate real del renderer con requestAnimationFrame.
 *
 * Con el launcher no hay forma de saber a cuántos fps corre solo con mirar:
 * la UI es smoothly animated, así que 60 fps y 165 fps se ven parecido. Este
 * medidor da el dato real para comprobar que el monitor de alta frecuencia
 * se está aprovechando.
 *
 * Cuando está desactivado no instala ningún listener: el coste es cero.
 */
export function useFpsMeter(enabled: boolean, sampleMs = 500): FpsReading | null {
  const [reading, setReading] = useState<FpsReading | null>(null);

  useEffect(() => {
    if (!enabled) {
      setReading(null);
      return;
    }

    let rafId = 0;
    let frames = 0;
    let longFrames = 0;
    let windowStart = performance.now();
    let lastFrame = windowStart;

    const tick = (ts: number) => {
      frames++;

      const delta = ts - lastFrame;
      lastFrame = ts;
      if (delta > 20) longFrames++;

      if (ts - windowStart >= sampleMs) {
        const elapsed = ts - windowStart;
        setReading({
          fps: Math.round((frames * 1000) / elapsed),
          frameMs: Math.round((elapsed / frames) * 100) / 100,
          longFrames,
        });
        frames = 0;
        longFrames = 0;
        windowStart = ts;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, sampleMs]);

  return reading;
}
