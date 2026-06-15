import { createContext, useContext } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

export interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type: ToastType, duration?: number) => string;
  hideToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(
  undefined
);

export const useToastContext = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  return context;
};

// Utility functions for direct usage (outside of a component / hook).
export const showToast = {
  success: (message: string, duration?: number): string => {
    return window.showToast?.(message, 'success', duration) || '';
  },
  error: (message: string, duration?: number): string => {
    return window.showToast?.(message, 'error', duration) || '';
  },
  info: (message: string, duration?: number): string => {
    return window.showToast?.(message, 'info', duration) || '';
  },
  warning: (message: string, duration?: number): string => {
    return window.showToast?.(message, 'warning', duration) || '';
  },
};

// Declare global window interface extension
declare global {
  interface Window {
    showToast?: (message: string, type: ToastType, duration?: number) => string;
  }
}
