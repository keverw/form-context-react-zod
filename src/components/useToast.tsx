import { useToast as useToastContext } from './Toast';

export function useToast() {
  const { showToast } = useToastContext();

  return {
    success: (message: string, duration?: number) => {
      return showToast(message, 'success', duration);
    },
    error: (message: string, duration?: number) => {
      return showToast(message, 'error', duration);
    },
    info: (message: string, duration?: number) => {
      return showToast(message, 'info', duration);
    },
    warning: (message: string, duration?: number) => {
      return showToast(message, 'warning', duration);
    },
  };
}
