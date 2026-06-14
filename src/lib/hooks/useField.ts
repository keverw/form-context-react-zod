import { useCallback } from 'react';
import { useFormContext } from './useFormContext';
import { serializePath } from '../utils';

export function useField(path: (string | number)[]) {
  const form = useFormContext();
  const value = form.getValue(path);
  const pathKey = serializePath(path);
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
      // Use the new setFieldTouched method directly
      form.setFieldTouched(path, true);
    }
  }, [form, isTouched, path]);

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
      // Delegate to the context's blur handler: marks touched and validates when
      // validateOnBlur is enabled. Centralized so raw-context fields behave the same.
      onBlur: () => form.handleBlur(path),
    },
  };
}
