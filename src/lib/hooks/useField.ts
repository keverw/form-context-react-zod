import { useContext, useCallback, useSyncExternalStore } from 'react';
import { FormFieldContext } from '../context';
import { type Focusable } from '../form-context';
import { serializePath } from '../utils';

export function useField(path: (string | number)[]) {
  const fieldCtx = useContext(FormFieldContext);
  if (!fieldCtx) {
    throw new Error('useField must be used within a FormProvider');
  }

  // A stable ref callback that registers this field's node for setFocus/
  // focusFirstError. Memoized on the serialized path so the same callback identity
  // persists across renders (a fresh callback each render would churn the registry).
  // Spread/attach to your input: <input ref={field.ref} /> (or RN <TextInput>).
  const serializedPath = serializePath(path);
  const inputRef = useCallback(
    (node: Focusable | null) => {
      fieldCtx.registerFieldRef(JSON.parse(serializedPath), node);
    },
    // fieldCtx is stable; serializedPath identifies the field.
    [fieldCtx, serializedPath]
  );

  // Subscribe to just this field's slice. Because FormFieldContext is stable and we
  // read the field via useSyncExternalStore, the field re-renders only when its own
  // value/touched/errors change — not on every unrelated keystroke elsewhere.
  // The same reader is passed as getServerSnapshot (3rd arg): on the server the slice
  // comes from refs seeded with initialValues, so SSR output matches client hydration.
  const getSnapshot = () => fieldCtx.getFieldSnapshot(path);
  const snapshot = useSyncExternalStore(
    fieldCtx.subscribeField,
    getSnapshot,
    getSnapshot
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
    // Attach to the input so setFocus/focusFirstError can reach this field:
    // <input ref={field.inputRef} /> (or RN <TextInput ref={field.inputRef} />).
    // Named inputRef (not `ref`) so consumers' react-hooks lint doesn't misread a
    // `.ref` member access during render as a ref-value read.
    inputRef,
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
