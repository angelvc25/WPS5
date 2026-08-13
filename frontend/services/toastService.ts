type ToastListener = (message: string) => void;

const listeners = new Set<ToastListener>();

export const toastService = {
  show(message: string) {
    listeners.forEach((fn) => fn(message));
  },
  subscribe(fn: ToastListener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
