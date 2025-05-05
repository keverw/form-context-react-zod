import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
} from 'react';
import { X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type: ToastType, duration?: number) => string;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType, duration = 3000) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type, duration }]);
      return id;
    },
    []
  );

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, hideToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

const ToastContainer: React.FC = () => {
  const { toasts, hideToast } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onClose={() => hideToast(toast.id)}
        />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; onClose: () => void }> = ({
  toast,
  onClose,
}) => {
  useEffect(() => {
    if (toast.duration) {
      const timer = setTimeout(() => {
        onClose();
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, onClose]);

  const bgColor = {
    success: 'bg-green-100 border-green-500 text-green-800',
    error: 'bg-red-100 border-red-500 text-red-800',
    info: 'bg-blue-100 border-blue-500 text-blue-800',
    warning: 'bg-yellow-100 border-yellow-500 text-yellow-800',
  }[toast.type];

  return (
    <div
      className={`rounded-md p-4 shadow-md border-l-4 min-w-[300px] max-w-md flex items-start ${bgColor}`}
      role="alert"
    >
      <div className="flex-1">{toast.message}</div>
      <button
        onClick={onClose}
        className="ml-3 text-gray-500 hover:text-gray-700 focus:outline-none"
        aria-label="Close"
      >
        <X size={18} />
      </button>
    </div>
  );
};

// Utility functions for direct usage
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
