/**
 * useAchievementWatcher.ts
 *
 * Detecta si el canal de logros externos está disponible en el entorno actual.
 *
 * Antes dependía de hacer ping a un servidor HTTP externo (AchievementWatcher).
 * Ahora simplemente comprueba si `electronAPI.getExternalAchievements` está
 * expuesto en el contextBridge — lo que significa que estamos en Electron y
 * el proceso principal tiene el lector de logros cargado.
 *
 * La comprobación es síncrona e instantánea: no hace ninguna petición de red.
 */

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { isExternalAchievementsAvailable } from '../services/achievementWatcherService';

interface UseAchievementWatcherOptions {
  /** Si es false, el hook siempre devuelve isAvailable=false (útil en tests). */
  enabled?: boolean;
}

interface UseAchievementWatcherResult {
  /** true si el lector de logros externos está disponible en este entorno. */
  isAvailable: boolean;
  /** Siempre false — mantenido por compatibilidad con la versión anterior. */
  isChecking: boolean;
  /** No-op — mantenido por compatibilidad con la versión anterior. */
  recheck: () => void;
}

export function useAchievementWatcher({
  enabled = true,
}: UseAchievementWatcherOptions = {}): UseAchievementWatcherResult {
  // Solo tiene sentido en entornos de escritorio (Electron expuesto como web).
  const shouldCheck = enabled && Platform.OS === 'web';

  const [isAvailable, setIsAvailable] = useState(() => {
    if (!shouldCheck) return false;
    return isExternalAchievementsAvailable();
  });

  useEffect(() => {
    if (!shouldCheck) {
      setIsAvailable(false);
      return;
    }
    // La disponibilidad puede cambiar si Electron inyecta el contextBridge
    // después del primer render (raro, pero posible en cold-start lentos).
    setIsAvailable(isExternalAchievementsAvailable());
  }, [shouldCheck]);

  return {
    isAvailable,
    isChecking: false,
    recheck: () => setIsAvailable(isExternalAchievementsAvailable()),
  };
}
