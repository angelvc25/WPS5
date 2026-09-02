export interface ToastOptions {
  duration?: number;
  icon?: any; // resultado de require('...'), ej: require('@/assets/images/controller.png')
}

interface ToastPayload {
  message: string;
  options?: ToastOptions;
}

type ToastListener = (payload: ToastPayload) => void;

const listeners = new Set<ToastListener>();

export const toastService = {
  show(message: string, options?: ToastOptions) {
    listeners.forEach((fn) => fn({ message, options }));
  },
  subscribe(fn: ToastListener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};