type Listener = (connected: boolean) => void;

/**
 * Estado global de conexión de mandos.
 *
 * Antes cada vista mantenía su propio estado de "hay mando conectado", así
 * que los avisos de controles (los iconos de PlayStation) no sabían si
 * debía mostrar el botón del mando o su tecla equivalente en el teclado.
 * Este servicio centraliza el estado: cualquier componente puede suscribirse
 * y reaccionar al cambio.
 *
 * La detección se hace con `navigator.getGamepads()`, que es una lectura
 * barata (devuelve un array de 4 slots), así que se sondea de forma muy
 * ligera. Además, `useGamepadInput` notifica el cambio en el momento
 * exacto en que lo detecta, para que la respuesta sea inmediata.
 */
class GamepadService {
  private listeners = new Set<Listener>();
  private connected = false;
  private lastDetectAt = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Detecta si hay algún mando conectado ahora mismo. */
  private detectNow(): boolean {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return false;
    try {
      const pads = navigator.getGamepads() as (Gamepad | null)[];
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad && (pad as any).connected !== false) return true;
      }
    } catch {
      // Algunos navegadores lanzan si la API no está disponible.
    }
    return false;
  }

  /**
   * Estado actual. Se cachea durante 250 ms para que varios iconos que se
   * montan a la vez no multipliquen las llamadas a la API.
   */
  isConnected(): boolean {
    const now = Date.now();
    if (now - this.lastDetectAt < 250) return this.connected;
    this.lastDetectAt = now;
    this.connected = this.detectNow();
    return this.connected;
  }

  /** Notifica un cambio de estado (lo usa useGamepadInput). */
  report(connected: boolean) {
    this.lastDetectAt = Date.now();
    if (this.connected === connected) return;
    this.connected = connected;
    this.notify(connected);
  }

  private notify(connected: boolean) {
    this.listeners.forEach((listener) => {
      try {
        listener(connected);
      } catch (err) {
        console.warn('[GamepadService] Error notificando el cambio de estado:', err);
      }
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.startPolling();
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Sondeo de respaldo: `useGamepadInput` solo está montado en Home, así
   * que este poll mantiene el estado al día en el resto de vistas.
   */
  private startPolling() {
    if (this.pollTimer) return;
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

    this.connected = this.detectNow();
    this.lastDetectAt = Date.now();

    this.pollTimer = setInterval(() => {
      const next = this.detectNow();
      this.lastDetectAt = Date.now();
      if (next === this.connected) return;
      this.connected = next;
      this.notify(next);
    }, 1000);
  }
}

export const gamepadService = new GamepadService();
