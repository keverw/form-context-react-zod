import { useContext, useSyncExternalStore } from 'react';
import { FormFieldContext } from '../form-context';

export function useField(path: (string | number)[]) {
  const fieldCtx = useContext(FormFieldContext);
  if (!fieldCtx) {
    throw new Error('useField must be used within a FormProvider');
  }

  // Subscribe to just this field's slice. Because FormFieldContext is stable and we
  // read the field via useSyncExternalStore, the field re-renders only when its own
  // value/touched/errors change — not on every unrelated keystroke elsewhere.
  const snapshot = useSyncExternalStore(fieldCtx.subscribeField, () =>
    fieldCtx.getFieldSnapshot(path)
  );

  const { value, isTouched, errors } = snapshot;

  // Get all applicable errors - show server/manual errors regardless of touched state
  const fieldErrors = errors
    .filter((err) => {
      // Always show server- and manual-set errors; show Zod validation errors
      // only once the field is touched.
      return err.source === 'server' || err.source === 'manual' || isTouched;
    })
    .map((err) => err.message);

  // Use array of messages if multiple, single string if one, null if none
  const error = fieldErrors.length > 1 ? fieldErrors : fieldErrors[0] || null;

  return {
    value,
    setValue: (newValue: unknown) => {
      // setValue marks the field touched itself, so no separate touch call is needed.
      fieldCtx.setValue(path, newValue);
    },
    error,
    props: {
      value,
      onChange: (newValue: unknown) => fieldCtx.setValue(path, newValue),
      errorText: error,
      // Delegate to the context's blur handler: marks touched and validates when
      // validateOnBlur is enabled. Centralized so raw-context fields behave the same.
      onBlur: () => fieldCtx.handleBlur(path),
    },
  };
}
