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

  // Blur handler: mark the field touched and, when validateOnBlur is enabled,
  // run validation so leaving a field invalid (e.g. a required field left empty)
  // surfaces its error immediately — instead of the field silently staying empty
  // while the submit button is disabled. Kept separate from setTouched so typing
  // (which already validates via validateOnChange) doesn't validate twice.
  const handleBlur = useCallback(() => {
    setTouched();
    if (form.validateOnBlur) {
      form.validate();
    }
  }, [form, setTouched]);

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
      onBlur: handleBlur,
    },
  };
}
