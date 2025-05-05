import { useCallback } from 'react';
import { useFormContext } from './useFormContext';

export function useField(path: (string | number)[]) {
  const form = useFormContext();
  const value = form.getValue(path);
  const pathKey = path.join('.');
  const isTouched = form.touched[pathKey];
  const errors = form.getError(path);

  // Get all applicable errors - show server errors regardless of touched state
  const fieldErrors = errors
    .filter((err) => {
      // Always show server errors, show validation errors only when touched
      return err.source === 'server' || isTouched;
    })
    .map((err) => err.message);

  // Use array of messages if multiple, single string if one, null if none
  const error = fieldErrors.length > 1 ? fieldErrors : fieldErrors[0] || null;

  const setTouched = useCallback(() => {
    if (!isTouched) {
      form.setTouched((prev) => {
        const newTouched = { ...prev };
        // Mark the field itself
        newTouched[pathKey] = true;

        // Mark all parent paths
        for (let i = 1; i <= path.length; i++) {
          const parentPath = path.slice(0, i);
          newTouched[parentPath.join('.')] = true;
        }
        return newTouched;
      });
    }
  }, [form, isTouched, path, pathKey]);

  return {
    value,
    setValue: (newValue: unknown) => {
      form.setValue(path, newValue);
      setTouched();
    },
    error,
    props: {
      value,
      onChange: (newValue: unknown) => form.setValue(path, newValue),
      errorText: error,
      onBlur: setTouched,
    },
  };
}
