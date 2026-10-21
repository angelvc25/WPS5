import { useEffect, useState } from 'react';
import { gamepadService } from '@/services/gamepadService';

/**
 * Indica si hay algún mando conectado.
 *
 * Se usa para decidir si los avisos de controles muestran el botón de
 * PlayStation o su tecla equivalente en el teclado.
 */
export function useGamepadConnected(): boolean {
  const [connected, setConnected] = useState(() => gamepadService.isConnected());

  useEffect(() => {
    setConnected(gamepadService.isConnected());
    return gamepadService.subscribe(setConnected);
  }, []);

  return connected;
}
