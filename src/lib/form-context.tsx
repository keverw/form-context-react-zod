import React, { createContext, useCallback, useMemo, useReducer } from 'react';
import { z } from 'zod';
import { validate, ValidationError, FieldState } from './zod-helpers';
import {
  getValueAtPath,
  setValueAtPath,
  getEmptyValue,
  serializePath,
  deserializePath,
  cloneAlongPath,
  generateID,
  isEmptyValue,
} from './utils';

export interface FormHelpers<T> {
  setErrors: (errors: ValidationError[]) => void;
  setServerErrors: (errors: ValidationError[]) => void;
  setServerError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  /**
   * Sets client submission errors (network failures, auth issues, etc.) at the form root level.
   * These are separate from field validation errors and server errors, and represent
   * issues preventing the entire form submission from completing.
   * @param message A string, array of strings, or null to clear all client submission errors
   */
  setClientSubmissionError: (message: string | string[] | null) => void;
  /**
   * Clears all client submission errors while preserving validation and server errors.
   */
  clearClientSubmissionError: () => void;
  /**
   * Returns the current client submission errors.
   * @returns An array of error message strings
   */
  getClientSubmissionError: () => string[];
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  clearValue: (path: (string | number)[]) => void;
  deleteField: (path: (string | number)[]) => void;
  validate: (force?: boolean) => boolean;
  hasField: (path: (string | number)[]) => boolean;
  touched: Record<string, boolean>;
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  reset: (force?: boolean) => boolean;
  resetWithValues: (newValues: T, force?: boolean) => boolean;
  currentSubmissionID: string | null;
  isCurrentSubmission: (submissionId: string) => boolean;
}

export interface FormContextValue<T> {
  values: T;
  touched: Record<string, boolean>;
  errors: ValidationError[];
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  /** Mark a field touched and run validation when validateOnBlur is enabled.
   *  useField wires this to onBlur; raw-context fields should call it too. */
  handleBlur: (path: (string | number)[]) => void;
  setErrors: (errors: ValidationError[]) => void;
  isSubmitting: boolean;
  isValid: boolean;
  canSubmit: boolean;
  lastValidated: number | null;
  /** Whether leaving a field (blur) runs validation. Mirrors the FormProvider prop. */
  validateOnBlur: boolean;
  currentSubmissionID: string | null;
  submit: () => Promise<void>;
  reset: (force?: boolean) => boolean;
  resetWithValues: (newValues: T, force?: boolean) => boolean;
  validate: (force?: boolean) => boolean;
  getValue: <V = unknown>(path: (string | number)[]) => V;
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  clearValue: (path: (string | number)[]) => void;
  deleteField: (path: (string | number)[]) => void;
  /**
   * Low-level primitive used by `useArrayField`'s reorder ops. Replaces the array
   * at `arrayPath` with `newItems` and re-indexes the item metadata (touched,
   * validation + server errors) via `indexMap` (old index -> new index, or null
   * to drop) in a single atomic update. Prefer the `useArrayField` helpers.
   */
  reindexArray: (
    arrayPath: (string | number)[],
    newItems: unknown[],
    indexMap: (oldIndex: number) => number | null
  ) => void;
  /**
   * Subscribe to structural array changes (used by `useArrayField` to keep its
   * stable ids aligned no matter which mutation path changed the array). Returns
   * an unsubscribe function.
   */
  subscribeArrayStructure: (listener: ArrayStructureListener) => () => void;
  getValuePaths: (path?: (string | number)[]) => (string | number)[][];
  getError: (path: (string | number)[]) => ValidationError[];
  getErrorPaths: (path?: (string | number)[]) => (string | number)[][];
  /**
   * Convenience snapshot of one field's state in a single call:
   * `{ errors, error, isTouched, invalid }`. A pure read over the existing
   * `getError(path)` + `touched` lookup — handy for raw-context fields that want
   * a field's error/touched/validity without wiring up `useField`.
   */
  getFieldState: (path: (string | number)[]) => FieldState;
  hasField: (path: (string | number)[]) => boolean;
  setServerErrors: (errors: ValidationError[]) => void;
  setServerError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  /**
   * Sets client submission errors (network failures, auth issues, etc.) at the form root level.
   * These are separate from field validation errors and server errors, and represent
   * issues preventing the entire form submission from completing.
   * @param message A string, array of strings, or null to clear all client submission errors
   */
  setClientSubmissionError: (message: string | string[] | null) => void;
  /**
   * Clears all client submission errors while preserving validation and server errors.
   */
  clearClientSubmissionError: () => void;
  /**
   * Returns the current client submission errors.
   * @returns An array of error message strings
   */
  getClientSubmissionError: () => string[];
  isCurrentSubmission: (submissionId: string) => boolean;
}

/**
 * Broadcast describing a STRUCTURAL change to an array field, so subscribers
 * (useArrayField's stable-id tracking) can follow items to their new positions.
 * - `reindex`: items moved/inserted/removed under `path`; `indexMap` maps each old
 *   item index to its new one (or null to drop), and `newLength` is the new count.
 * - `reset-subtree`: a value was assigned at `path` with no old->new item mapping
 *   (a wholesale `setValue`). Any tracked array AT or UNDER `path` must re-mint —
 *   this covers both replacing the array itself and replacing a parent object that
 *   contains it.
 * - `reset-all`: a form-wide values reset; subscribers should re-derive from scratch.
 */
export type ArrayStructureChange =
  | {
      kind: 'reindex';
      path: (string | number)[];
      indexMap: (oldIndex: number) => number | null;
      newLength: number;
    }
  | { kind: 'reset-subtree'; path: (string | number)[] }
  | { kind: 'reset-all' };

export type ArrayStructureListener = (change: ArrayStructureChange) => void;

// Create a context with a more specific type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FormContext = createContext<FormContextValue<any> | null>(null);

/**
 * Handler for FormProvider's `onSubmit`. Declare the value type once and both
 * `values` and `helpers` are inferred from it, e.g.
 * `const onSubmit: FormSubmitHandler<z.infer<typeof schema>> = (values, helpers) => {...}`.
 */
export type FormSubmitHandler<T> = (
  values: T,
  helpers: FormHelpers<T>
) => Promise<void> | void;

interface FormProviderProps<T> {
  initialValues: T;
  /**
   * Server errors to seed at mount, before any submission. Each entry is
   * normalized to `source: 'server'`, so you can omit `source`. Use a path of
   * `[]` for a form-level (root) error. Unlike Zod validation errors, server
   * errors render regardless of whether the field is touched. Note that
   * `reset()`/`resetWithValues()` clear server errors (a clean slate) and do
   * not restore these.
   */
  initialServerErrors?: ValidationError[];
  onSubmit?: FormSubmitHandler<T>;
  schema?: z.ZodType<T>;
  validateOnMount?: boolean;
  /**
   * When `validateOnMount` runs, whether to mark ALL fields touched (revealing
   * every error on load) instead of only the populated ones. Defaults to false:
   * a prefilled form shows errors for the data it loaded, while empty fields the
   * user hasn't reached stay quiet.
   */
  touchAllOnMount?: boolean;
  validateOnChange?: boolean;
  /**
   * Whether leaving a field (blur) runs validation, surfacing errors for a field
   * the user interacted with but left invalid (e.g. a required field left empty).
   * Defaults to true.
   */
  validateOnBlur?: boolean;
  /**
   * Whether to wrap the form in a <form> HTML tag
   */
  useFormTag?: boolean;
  /**
   * HTML form attributes to pass to the form element when useFormTag is true
   */
  formProps?: React.FormHTMLAttributes<HTMLFormElement>;
  children: React.ReactNode | React.ReactNode[];
}

// Define the form state interface
interface FormState<T> {
  values: T;
  touched: Record<string, boolean>;
  errors: ValidationError[];
  isSubmitting: boolean;
  lastValidated: number | null;
  canSubmit: boolean;
  currentSubmissionID: string | null;
}

// Define action types
type FormAction<T> =
  | {
      type: 'UPDATE_STATE';
      updates: Partial<FormState<T>>;
    }
  | {
      type: 'UPDATE_STATE_FUNC';
      updater: (prevState: FormState<T>) => Partial<FormState<T>>;
    };

// Implement the reducer function
function formReducer<T extends Record<string | number, unknown>>(
  state: FormState<T>,
  action: FormAction<T>
): FormState<T> {
  switch (action.type) {
    case 'UPDATE_STATE': {
      return {
        ...state,
        ...action.updates,
      };
    }
    case 'UPDATE_STATE_FUNC': {
      const updates = action.updater(state);
      return {
        ...state,
        ...updates,
      };
    }
    default:
      return state;
  }
}

export function FormProvider<T extends Record<string | number, unknown>>({
  initialValues,
  initialServerErrors = [],
  onSubmit,
  schema,
  validateOnMount = false,
  touchAllOnMount = false,
  validateOnChange = true,
  validateOnBlur = true,
  useFormTag = false,
  formProps = {},
  children,
}: FormProviderProps<T>) {
  // Normalize seeded server errors. We tag them `source: 'server'` so callers
  // can omit it, mirroring setServerErrors. Only the first render's value is
  // ever used (reducer + ref initializers below), so an unstable prop identity
  // on later renders is harmless — seeding is a mount-only concern (use the
  // setServerError(s) API to change them after).
  const normalizedInitialServerErrors = useMemo<ValidationError[]>(
    () =>
      initialServerErrors.map((error) => ({
        ...error,
        source: 'server' as const,
      })),
    [initialServerErrors]
  );

  // Use useReducer instead of multiple useState calls
  const [state, dispatch] = useReducer(formReducer<T>, {
    values: initialValues,
    touched: {},
    errors: normalizedInitialServerErrors,
    isSubmitting: false,
    lastValidated: null,
    canSubmit: false,
    currentSubmissionID: null,
  });

  // Destructure state for easier access
  const {
    values,
    touched,
    errors,
    isSubmitting,
    lastValidated,
    canSubmit,
    // currentSubmissionID is accessed via state.currentSubmissionID in contextValue
  } = state;

  /**
   * IMPLEMENTATION PATTERN:
   * This form context uses a hybrid approach combining refs and reducer state:
   *
   * 1. Refs (valuesRef, errorsRef, touchedRef, canSubmitRef, isSubmittingRef) provide immediate,
   *    synchronous access to the latest form data without waiting for React render cycles.
   *
   * 2. Reducer state triggers UI updates when values change.
   *
   * The core pattern used throughout this codebase is:
   *   - Update refs first for immediate access
   *   - Then dispatch state updates to trigger UI re-renders
   *
   * This approach prevents race conditions and ensures both immediate data access
   * and proper UI updates, eliminating the need for a complex operation queue.
   */

  // Using useRef instead of useState to avoid race conditions
  const mountedRef = React.useRef(false);
  const currentSubmissionIDRef = React.useRef<string | null>(null);

  // Remove queue refs and replace with direct value/touched refs
  const valuesRef = React.useRef<T>(initialValues);
  const touchedRef = React.useRef<Record<string, boolean>>({});
  const canSubmitRef = React.useRef<boolean>(false);
  const isSubmittingRef = React.useRef<boolean>(false);

  // Error handling refs
  // Keep track of client submission error messages for real-time access
  const clientSubmissionErrorRef = React.useRef<string[]>([]);

  // Keep all errors in a ref for immediate access/updates, syncing with state for UI.
  // Seeded with any initialServerErrors so they're available before first render's effects.
  const errorsRef = React.useRef<ValidationError[]>(
    normalizedInitialServerErrors
  );

  // Keep track of server errors separately to prevent race conditions.
  // Seeded so the first setServerError(s) call merges from the right baseline.
  const serverErrorsRef = React.useRef<ValidationError[]>(
    normalizedInitialServerErrors
  );

  // Subscribers (useArrayField instances) that track stable item ids and need to
  // be told when an array changes shape — so ids follow items no matter which
  // mutation path (reindexArray, deleteField, setValue, reset) caused the change.
  const arrayStructureListenersRef = React.useRef<Set<ArrayStructureListener>>(
    new Set()
  );
  const subscribeArrayStructure = useCallback(
    (listener: ArrayStructureListener) => {
      arrayStructureListenersRef.current.add(listener);
      return () => {
        arrayStructureListenersRef.current.delete(listener);
      };
    },
    []
  );
  const notifyArrayStructure = useCallback((change: ArrayStructureChange) => {
    for (const listener of arrayStructureListenersRef.current) listener(change);
  }, []);

  // Initialize refs with current state values
  React.useEffect(() => {
    errorsRef.current = errors;
    valuesRef.current = values;
    touchedRef.current = touched;
    canSubmitRef.current = canSubmit;
    isSubmittingRef.current = isSubmitting;
  }, [errors, values, touched, canSubmit, isSubmitting]);

  // Walks the values tree under `basePath` and returns a flat list of paths to
  // every node (every field, including nested objects/arrays). e.g. for
  // { a: { b: 1 }, list: [{ x: 2 }] } it returns:
  //   ['a'], ['a','b'], ['list'], ['list', 0], ['list', 0, 'x']
  // Used by validate(true) (to touch every field) and reset/clear traversals.
  const getValuePaths = useCallback(
    (basePath: (string | number)[] = []) => {
      const paths: (string | number)[][] = [];

      const traverse = (obj: unknown, currentPath: (string | number)[]) => {
        // Only objects/arrays have children to descend into; primitives are leaves.
        if (obj && typeof obj === 'object') {
          const isArray = Array.isArray(obj);

          // Object.entries gives us BOTH halves we need at each node:
          //   key   -> the next path segment (the breadcrumb at this level)
          //   value -> the subtree to recurse into to find deeper paths
          for (const [key, value] of Object.entries(obj)) {
            // Object.entries always returns string keys, including array indices
            // ('0', '1', ...). Restore numeric indices for arrays so these paths
            // match the number-indexed paths used everywhere else (touched keys,
            // Zod error paths, getValue). Object keys stay strings — even
            // numeric-looking ones like { '5': ... } are real string keys.
            // Without this, e.g. validate(true)'s force-touch builds ['list','0']
            // while the field looks up ['list', 0] — different serializePath keys,
            // so the touch silently misses nested array fields.
            const segment = isArray ? Number(key) : key;
            const newPath = [...currentPath, segment];

            paths.push(newPath); // record this node's path
            traverse(value, newPath); // then descend for any deeper paths
          }
        }
      };

      // Start from the subtree at basePath (default: the whole values object).
      traverse(getValueAtPath(values, basePath), basePath);
      return paths;
    },
    [values]
  );

  const validateForm = useCallback(() => {
    if (!schema) {
      return { valid: true, errors: [] };
    }

    // Set lastValidated timestamp
    const now = Date.now();

    // Validate the entire form
    const result = validate(schema, values);

    // Update canSubmitRef first
    canSubmitRef.current = result.valid;

    // Then update state using functional update pattern
    dispatch({
      type: 'UPDATE_STATE_FUNC',
      updater: () => ({
        lastValidated: now,
        canSubmit: result.valid,
      }),
    });

    return result;
  }, [schema, values, dispatch]);

  // Helper function to create a new touched state with a path marked as touched
  const markPathAsTouched = useCallback(
    (touched: Record<string, boolean>, path: (string | number)[]) => {
      const newTouched = { ...touched };
      // Mark the field itself
      newTouched[serializePath(path)] = true;

      // Mark all parent paths
      for (let i = 1; i <= path.length; i++) {
        const parentPath = path.slice(0, i);
        newTouched[serializePath(parentPath)] = true;
      }
      return newTouched;
    },
    []
  );

  // Simplified setValue function that uses refs
  const setValue = useCallback(
    <V = unknown,>(path: (string | number)[], value: V) => {
      // Update the values ref immediately
      const newValues = cloneAlongPath(valuesRef.current, path);
      setValueAtPath(
        newValues as Record<string | number, unknown>,
        path,
        value
      );
      valuesRef.current = newValues;

      // Update touched state to mark this path
      touchedRef.current = markPathAsTouched(touchedRef.current, path);

      // Filter out errors for this path immediately in the ref
      errorsRef.current = errorsRef.current.filter(
        (error) =>
          error.path.length !== path.length ||
          !error.path.every((val, idx) => path[idx] === val)
      );

      // Create a validation result if needed
      let newCanSubmit = canSubmitRef.current;
      let newErrors = [...errorsRef.current];

      if (validateOnChange && schema) {
        const result = validate(schema, newValues);
        // Update canSubmit based on validation result
        newCanSubmit = result.valid;
        // Update canSubmitRef immediately
        canSubmitRef.current = newCanSubmit;

        if (!result.valid && result.errors) {
          // Only add new validation errors for the updated path
          const pathErrors = result.errors.filter(
            (error) =>
              error.path.length === path.length &&
              error.path.every((val, idx) => path[idx] === val)
          );
          newErrors = [...newErrors, ...pathErrors];
          errorsRef.current = newErrors; // Update the ref
        }
      }

      // Dispatch a single update with all changes using functional update
      dispatch({
        type: 'UPDATE_STATE_FUNC',
        updater: () => ({
          values: newValues,
          touched: touchedRef.current,
          errors: newErrors,
          lastValidated: Date.now(),
          canSubmit: newCanSubmit,
        }),
      });

      // A wholesale assignment carries no old->new item mapping, so any stable ids
      // tracked for an array AT or UNDER this path can't be preserved — signal a
      // re-mint for the subtree. This covers replacing the array itself AND
      // replacing a parent object that contains it. (A leaf value edit has no
      // tracked array under it, so subscribers leave their ids untouched.)
      notifyArrayStructure({ kind: 'reset-subtree', path });
    },
    [
      validateOnChange,
      schema,
      markPathAsTouched,
      dispatch,
      notifyArrayStructure,
    ]
  );

  // Function to set isSubmitting status - explicitly defined
  const getValue = useCallback(<V = unknown,>(path: (string | number)[]): V => {
    // Use the ref for immediate value access
    return getValueAtPath(valuesRef.current, path) as V;
  }, []);

  // Set errors with proper ref sync
  const setErrors = useCallback(
    (
      errorsOrUpdater:
        | ValidationError[]
        | ((prev: ValidationError[]) => ValidationError[])
    ) => {
      if (typeof errorsOrUpdater === 'function') {
        const updater = errorsOrUpdater;
        const newErrors = updater(errorsRef.current);
        // Update ref first
        errorsRef.current = newErrors;
        // Then update state
        dispatch({
          type: 'UPDATE_STATE',
          updates: { errors: newErrors },
        });
      } else {
        // Update ref first
        errorsRef.current = errorsOrUpdater;
        // Then update state
        dispatch({
          type: 'UPDATE_STATE',
          updates: { errors: errorsOrUpdater },
        });
      }
    },
    [dispatch]
  );

  // Simplified setFieldTouched function that uses refs
  const setFieldTouched = useCallback(
    (path: (string | number)[], value: boolean = true) => {
      // Update the ref immediately
      if (value) {
        touchedRef.current = markPathAsTouched(touchedRef.current, path);
      } else {
        // If not touching, just set the specific path
        touchedRef.current = {
          ...touchedRef.current,
          [serializePath(path)]: value,
        };
      }

      // Directly dispatch the state update
      dispatch({
        type: 'UPDATE_STATE',
        updates: { touched: touchedRef.current },
      });
    },
    [markPathAsTouched, dispatch]
  );

  // Create a validate function that can be used by components
  const validateFunction = useCallback(
    (force?: boolean) => {
      if (force) {
        // Mark all fields as touched first
        const allPaths = getValuePaths();
        for (const path of allPaths) {
          setFieldTouched(path, true);
        }
      }
      const result = validateForm();
      if (!result.valid && result.errors) {
        // Update errors ref first
        const serverErrors = errorsRef.current.filter(
          (e) => e.source === 'server'
        );
        const newErrors = [...serverErrors, ...(result.errors || [])];
        errorsRef.current = newErrors;

        // Then update state
        dispatch({
          type: 'UPDATE_STATE',
          updates: { errors: errorsRef.current },
        });
      }
      return result.valid;
    },
    [getValuePaths, setFieldTouched, validateForm, dispatch]
  );

  // Field blur handler shared by useField and any raw-context consumer. Marks the
  // field touched and, when validateOnBlur is enabled, runs validation so leaving
  // a field invalid surfaces its error. Centralizing it here means validateOnBlur
  // works no matter how a field wires its onBlur (useField or raw context).
  const handleBlur = useCallback(
    (path: (string | number)[]) => {
      setFieldTouched(path, true);
      if (validateOnBlur) {
        validateFunction();
      }
    },
    [setFieldTouched, validateOnBlur, validateFunction]
  );

  // Function used for mount validation
  const performInitialValidation = useCallback(() => {
    const allPaths = getValuePaths();

    // By default only mark *populated* fields touched: a prefilled form surfaces
    // errors for the data it loaded, while empty fields the user hasn't reached
    // stay quiet (errors are gated on touched). touchAllOnMount touches everything.
    const newTouched: Record<string, boolean> = {};
    for (const path of allPaths) {
      if (touchAllOnMount || !isEmptyValue(getValueAtPath(values, path))) {
        newTouched[serializePath(path)] = true;
      }
    }

    // Update the touched ref
    touchedRef.current = newTouched;

    // Validate form directly
    const result = validateForm();
    const validationErrors = result.valid ? [] : result.errors || [];

    // Preserve any server errors (e.g. seeded via initialServerErrors) — mount
    // validation only owns the client/validation errors, not server ones.
    const serverErrors = errorsRef.current.filter((e) => e.source === 'server');
    const newErrors = [...serverErrors, ...validationErrors];

    // Update errors ref
    errorsRef.current = newErrors;

    // Combine everything into a single batch update
    dispatch({
      type: 'UPDATE_STATE',
      updates: {
        touched: newTouched,
        errors: newErrors,
        lastValidated: Date.now(),
        canSubmit: result.valid,
      },
    });
  }, [getValuePaths, validateForm, values, touchAllOnMount]);

  // Combined effect for mount tracking and validation
  React.useEffect(() => {
    mountedRef.current = true;

    if (validateOnMount && schema) {
      // For testing purposes, we'll execute synchronously to avoid test timeouts
      if (process.env.NODE_ENV === 'test') {
        // In tests, execute synchronously
        performInitialValidation();
      } else {
        // In production, defer validation to next tick to ensure component mount cycle completes
        // This helps prevent potential React state update warnings during commit phase
        setTimeout(performInitialValidation, 0);
      }
    }

    return () => {
      mountedRef.current = false;
      // No need to clear timeouts since we're not using them anymore
    };
  }, [validateOnMount, schema, performInitialValidation]);

  // Helper function removed since we now filter errors directly

  // Check if a field exists at the given path
  const hasField = useCallback(
    (path: (string | number)[]) => {
      let current: Record<string | number, unknown> | unknown = values;

      for (let i = 0; i < path.length; i++) {
        const segment = path[i];

        // If current becomes non-object/array prematurely, path is invalid
        if (typeof current !== 'object' || current === null) {
          return false;
        }

        // Check if the property/index exists before trying to access it
        if (!Object.prototype.hasOwnProperty.call(current, segment)) {
          // Special case for arrays: check if index is within bounds numerically
          // hasOwnProperty doesn't work reliably for array indices > length or sparse arrays
          if (Array.isArray(current) && typeof segment === 'number') {
            if (segment < 0 || segment >= current.length) {
              return false; // Index out of bounds
            }
            // If index is within bounds but potentially sparse (undefined),
            // we still consider the path "existing" up to this point. Let access proceed.
          } else {
            return false; // Property doesn't exist on object
          }
        }

        // Move to the next part of the path
        current = (current as Record<string | number, unknown>)[segment];
      }

      // If the loop completes, it means every segment existed and was traversable.
      return true;
    },
    [values]
  );

  // Implement the clearValue function to set a field to an empty value
  const clearValue = useCallback(
    (path: (string | number)[]) => {
      if (!hasField(path)) return;

      // Determine the appropriate empty value based on the current value type
      const currentValue = getValue(path);
      const emptyValue = getEmptyValue(currentValue);

      // Update the ref first for immediate access
      const newValues = cloneAlongPath(valuesRef.current, path);
      setValueAtPath(
        newValues as Record<string | number, unknown>,
        path,
        emptyValue
      );
      valuesRef.current = newValues;

      // Then update state
      dispatch({
        type: 'UPDATE_STATE',
        updates: { values: valuesRef.current },
      });
    },
    [dispatch, getValue, hasField]
  );

  // Helper function to handle array item deletion
  const deleteField = useCallback(
    (path: (string | number)[]) => {
      // Get parent path and last key
      const lastKey = path[path.length - 1];
      const parentPath = path.slice(0, -1);

      // Check if we're deleting from an array
      let isArrayItem = false;
      let arrayIndex = -1;

      // First, determine if this is an array item
      const parent = getValueAtPath(valuesRef.current, parentPath);

      if (parent && typeof parent === 'object' && Array.isArray(parent)) {
        isArrayItem = true;
        arrayIndex = Number(lastKey);
      }

      // If it's an array item, handle it directly here instead of using deleteArrayItem
      if (isArrayItem && arrayIndex >= 0) {
        // Get the current array
        const array = parent as unknown[];

        // Create a new array without the deleted item
        const newItems = array.filter((_, i) => i !== arrayIndex);

        // Create a new values object with the updated array - first update valuesRef
        const newValues = { ...valuesRef.current };
        setValueAtPath(newValues, parentPath, newItems);
        valuesRef.current = newValues;

        // Create a new touched state with the deleted item removed
        const newTouched = { ...touchedRef.current };

        // Remove touched states for the deleted item and its children
        // and adjust indices for items after the deleted one
        for (const key of Object.keys(newTouched)) {
          try {
            // Try to parse the key as a JSON path
            const keyPath = JSON.parse(key);

            // Check if this key is related to the array we're modifying
            if (
              keyPath.length > parentPath.length &&
              parentPath.every((val, idx) => val === keyPath[idx])
            ) {
              const itemIndex = Number(keyPath[parentPath.length]);

              // If this is for the deleted item or its children, remove it
              if (!isNaN(itemIndex) && itemIndex === arrayIndex) {
                delete newTouched[key];
              }
              // If this is for an item after the deleted one, adjust its index
              else if (!isNaN(itemIndex) && itemIndex > arrayIndex) {
                const newPathArray = [
                  ...keyPath.slice(0, parentPath.length),
                  itemIndex - 1,
                  ...keyPath.slice(parentPath.length + 1),
                ];
                const newKey = serializePath(newPathArray);
                newTouched[newKey] = newTouched[key];
                delete newTouched[key];
              }
            }
          } catch {
            // If key isn't valid JSON, it's not a path we created with serializePath
            // so we can safely ignore it
          }
        }

        // Update touchedRef immediately
        touchedRef.current = newTouched;

        // Remove every error under the deleted array. When a schema is present,
        // the re-validation below regenerates them at the correct indices.
        // (A per-item reindex map used to live here but was dead code — this
        // filter already strips everything it would have operated on.)
        const newErrors = errorsRef.current.filter(
          (error) =>
            error.path.length < parentPath.length ||
            !error.path
              .slice(0, parentPath.length)
              .every((val, idx) => parentPath[idx] === val)
        );

        // Update errorsRef immediately
        errorsRef.current = newErrors;

        // Keep serverErrorsRef in sync — drop server errors under the deleted array
        // too. Otherwise a later setServerError()/setServerErrors() rebuilds combined
        // errors from this stale baseline and resurrects errors for the removed item
        // (or now-shifted indices).
        serverErrorsRef.current = serverErrorsRef.current.filter(
          (error) =>
            error.path.length < parentPath.length ||
            !error.path
              .slice(0, parentPath.length)
              .every((val, idx) => parentPath[idx] === val)
        );

        // Validate the new array after deletion
        let finalErrors = newErrors;
        let newCanSubmit = canSubmit;

        if (validateOnChange && schema) {
          const result = validate(schema, newValues);

          // Update canSubmit based on validation result
          newCanSubmit = result.valid;

          if (!result.valid && result.errors) {
            // Only add new validation errors for the array path
            const arrayErrors = result.errors.filter(
              (error) =>
                error.path.length >= parentPath.length &&
                error.path
                  .slice(0, parentPath.length)
                  .every((val, idx) => parentPath[idx] === val)
            );

            // Merge with existing errors, avoiding duplicates
            const existingPaths = newErrors.map((e) => serializePath(e.path));
            const newArrayErrors = arrayErrors.filter(
              (e) => !existingPaths.includes(serializePath(e.path))
            );

            finalErrors = [...newErrors, ...newArrayErrors];

            // Update errorsRef again if we have new validation errors
            errorsRef.current = finalErrors;
          }
        }

        // Dispatch a single update with all changes
        dispatch({
          type: 'UPDATE_STATE',
          updates: {
            values: newValues,
            touched: newTouched,
            errors: finalErrors,
            lastValidated: Date.now(),
            canSubmit: newCanSubmit,
          },
        });

        // Tell id-tracking subscribers an item was removed so their stable ids
        // follow (the deleted index drops; everything after it shifts down).
        notifyArrayStructure({
          kind: 'reindex',
          path: parentPath,
          indexMap: (j) =>
            j === arrayIndex ? null : j > arrayIndex ? j - 1 : j,
          newLength: newItems.length,
        });
      } else {
        // For non-array items, implement a comprehensive approach
        // Create a new values object with the item removed - update valuesRef first
        const newValues = { ...valuesRef.current };

        // Handle the case where we're deleting a top-level field
        if (parentPath.length === 0) {
          if (Object.prototype.hasOwnProperty.call(newValues, lastKey)) {
            delete newValues[lastKey as keyof typeof newValues];
          }
        } else {
          // For nested fields, navigate to the parent object
          const parentObj = parentPath.reduce<Record<string | number, unknown>>(
            (acc, key) => {
              if (acc && typeof acc === 'object') {
                return (acc[key] as Record<string | number, unknown>) || {};
              }
              return {} as Record<string | number, unknown>;
            },
            newValues as Record<string | number, unknown>
          );

          if (parentObj && typeof parentObj === 'object') {
            delete parentObj[lastKey];
          }
        }

        // Update valuesRef immediately
        valuesRef.current = newValues;

        // Create a new touched state with all related touched states removed
        const newTouched = { ...touchedRef.current };
        const serializedPath = serializePath(path);

        // Remove touched state for the deleted field and all its children
        for (const key of Object.keys(newTouched)) {
          // Remove exact match
          if (key === serializedPath) {
            delete newTouched[key];
          }
          // For nested fields, we need to check if they're children of the deleted path
          // This is more complex with JSON serialization, so we'll deserialize and check
          else {
            try {
              const keyPath = JSON.parse(key);
              if (
                keyPath.length > path.length &&
                path.every((val, idx) => keyPath[idx] === val)
              ) {
                delete newTouched[key];
              }
            } catch {
              // If key isn't valid JSON, it's not a path we created with serializePath
              // so we can safely ignore it
            }
          }
        }

        // Update touchedRef immediately
        touchedRef.current = newTouched;

        // Create a new errors array with all related errors removed
        const newErrors = errorsRef.current.filter((error) => {
          // Keep errors not related to this path
          if (error.path.length < path.length) {
            return true;
          }

          // Remove errors for the deleted field and its children
          return !error.path
            .slice(0, path.length)
            .every((val, idx) => path[idx] === val);
        });

        // Update errorsRef immediately
        errorsRef.current = newErrors;

        // Keep serverErrorsRef in sync (see the array branch above): drop server
        // errors under the deleted path so a later setServerError() can't rebuild
        // them from a stale baseline.
        serverErrorsRef.current = serverErrorsRef.current.filter((error) => {
          if (error.path.length < path.length) {
            return true;
          }
          return !error.path
            .slice(0, path.length)
            .every((val, idx) => path[idx] === val);
        });

        // Validate the form after deletion
        let finalErrors = newErrors;
        let newCanSubmit = canSubmit;

        if (validateOnChange && schema) {
          const result = validate(schema, newValues);

          // Update canSubmit based on validation result
          newCanSubmit = result.valid;

          if (!result.valid && result.errors) {
            // Only add new validation errors for the parent path
            const parentErrors = result.errors.filter(
              (error) =>
                error.path.length >= parentPath.length &&
                error.path
                  .slice(0, parentPath.length)
                  .every((val, idx) => parentPath[idx] === val)
            );

            // Merge with existing errors, avoiding duplicates
            const existingPaths = newErrors.map((e) => serializePath(e.path));
            const newParentErrors = parentErrors.filter(
              (e) => !existingPaths.includes(serializePath(e.path))
            );

            finalErrors = [...newErrors, ...newParentErrors];

            // Update errorsRef again if we have new validation errors
            errorsRef.current = finalErrors;
          }
        }

        // Dispatch a single update with all changes
        dispatch({
          type: 'UPDATE_STATE',
          updates: {
            values: newValues,
            touched: newTouched,
            errors: finalErrors,
            lastValidated: Date.now(),
            canSubmit: newCanSubmit,
          },
        });
      }
    },
    [canSubmit, validateOnChange, schema, notifyArrayStructure]
  );

  // Atomically reshape an array field and re-index the metadata attached to its
  // items. `newItems` is the replacement array; `indexMap` maps each OLD item
  // index to its new index (or null to drop). Used by useArrayField's reorder
  // ops (move/swap/insert/replace) so that values, touched, validation errors AND
  // the server-error baseline all stay in sync in a single dispatch — unlike
  // doing it from the hook via the public API, which can't reach serverErrorsRef.
  const reindexArray = useCallback(
    (
      arrayPath: (string | number)[],
      newItems: unknown[],
      indexMap: (oldIndex: number) => number | null
    ) => {
      // 1. Values — set the new array at arrayPath.
      const newValues = cloneAlongPath(valuesRef.current, arrayPath);
      setValueAtPath(
        newValues as Record<string | number, unknown>,
        arrayPath,
        newItems
      );
      valuesRef.current = newValues;

      // Remap a single path under arrayPath: returns the rewritten path, null to
      // drop, or the same reference when it's unaffected (outside the array, a
      // non-numeric index, or an unchanged index).
      const remapPath = (
        p: (string | number)[]
      ): (string | number)[] | null => {
        const underArray =
          p.length > arrayPath.length &&
          arrayPath.every((val, idx) => p[idx] === val);
        if (!underArray) return p;
        const oldIndex = Number(p[arrayPath.length]);
        if (Number.isNaN(oldIndex)) return p;
        const newIndex = indexMap(oldIndex);
        if (newIndex === null) return null;
        return newIndex === oldIndex
          ? p
          : [...arrayPath, newIndex, ...p.slice(arrayPath.length + 1)];
      };

      // 2. Touched — rebuild the map with re-indexed keys (drop the dropped).
      const remappedTouched: Record<string, boolean> = {};
      for (const [key, val] of Object.entries(touchedRef.current)) {
        if (!val) continue;
        let keyPath: (string | number)[];
        try {
          keyPath = deserializePath(key);
        } catch {
          remappedTouched[key] = val; // not a path we created; leave it
          continue;
        }
        const np = remapPath(keyPath);
        if (np === null) continue;
        remappedTouched[serializePath(np)] = true;
      }
      // Mark the array path (and its parents) touched, matching setValue — which
      // is what add() and the other value mutations do. Changing the array is a
      // user interaction, so touched-gated array-level validation/UI (e.g. a
      // z.array().min error) stays consistent across add/insert/move/swap/replace.
      const newTouched = markPathAsTouched(remappedTouched, arrayPath);
      touchedRef.current = newTouched;

      // 3. Errors — re-index both the combined list and the server-only baseline
      // so a later setServerError can't rebuild stale (pre-reorder) indices.
      const remapErrorList = (errs: ValidationError[]) => {
        const out: ValidationError[] = [];
        for (const e of errs) {
          const np = remapPath(e.path);
          if (np === null) continue;
          out.push(np === e.path ? e : { ...e, path: np });
        }
        return out;
      };
      errorsRef.current = remapErrorList(errorsRef.current);
      serverErrorsRef.current = remapErrorList(serverErrorsRef.current);

      // 4. Re-validate (when validating on change). Reindexing only moves the
      // item-level metadata; it can't refresh an error attached to the array path
      // ITSELF — e.g. `z.array(...).min(1)` produces an error at `['items']`, and
      // inserting an item should clear it. Mirror setValue(arrayPath, …): drop the
      // stale validation error(s) at exactly arrayPath, then re-add fresh ones (if
      // still invalid) from the new value. Server errors at arrayPath are left as-is.
      let newCanSubmit = canSubmitRef.current;
      if (validateOnChange && schema) {
        const result = validate(schema, newValues);
        newCanSubmit = result.valid;
        canSubmitRef.current = newCanSubmit;

        const atArrayPath = (p: (string | number)[]) =>
          p.length === arrayPath.length &&
          arrayPath.every((val, idx) => p[idx] === val);

        const withoutStaleArrayLevel = errorsRef.current.filter(
          (e) => e.source === 'server' || !atArrayPath(e.path)
        );
        const freshArrayLevel = result.valid
          ? []
          : (result.errors ?? []).filter((e) => atArrayPath(e.path));
        errorsRef.current = [...withoutStaleArrayLevel, ...freshArrayLevel];
      }

      // 5. Single dispatch.
      dispatch({
        type: 'UPDATE_STATE',
        updates: {
          values: newValues,
          touched: newTouched,
          errors: errorsRef.current,
          canSubmit: newCanSubmit,
          ...(validateOnChange && schema ? { lastValidated: Date.now() } : {}),
        },
      });

      // Tell id-tracking subscribers how items moved so their stable ids follow.
      notifyArrayStructure({
        kind: 'reindex',
        path: arrayPath,
        indexMap,
        newLength: newItems.length,
      });
    },
    [
      validateOnChange,
      schema,
      dispatch,
      markPathAsTouched,
      notifyArrayStructure,
    ]
  );

  const getError = useCallback(
    (path: (string | number)[]) => {
      return errors.filter(
        (error) =>
          error.path.length === path.length &&
          error.path.every((val, idx) => path[idx] === val)
      );
    },
    [errors]
  );

  const getErrorPaths = useCallback(
    (basePath: (string | number)[] = []) => {
      return errors
        .filter(
          (error) =>
            error.path.length >= basePath.length &&
            basePath.every((val, idx) => error.path[idx] === val)
        )
        .map((error) => error.path);
    },
    [errors]
  );

  // Convenience snapshot of one field's state. Pure read over getError + touched
  // + hasField; errors are raw (not touched-gated) so callers see the real
  // validation state.
  const getFieldState = useCallback(
    (path: (string | number)[]): FieldState => {
      const fieldErrors = getError(path);
      return {
        errors: fieldErrors,
        error: fieldErrors[0]?.message ?? null,
        isTouched: !!touched[serializePath(path)],
        invalid: fieldErrors.length > 0,
        exists: hasField(path),
      };
    },
    [getError, touched, hasField]
  );

  const reset = useCallback(
    (force?: boolean): boolean => {
      // Prevent resetting while submitting unless forced
      if (isSubmittingRef.current && !force) {
        console.warn(
          'Attempted to reset form while submitting. Use force=true to reset anyway.'
        );
        return false;
      }

      // If we're forcing a reset while submitting, cancel the submission first
      if (isSubmittingRef.current && force) {
        isSubmittingRef.current = false;
        currentSubmissionIDRef.current = null;
        // Dispatch updates for submission state if it was active
        dispatch({
          type: 'UPDATE_STATE',
          updates: { isSubmitting: false, currentSubmissionID: null },
        });
      }

      // Update refs first - this is critical for immediate access
      valuesRef.current = initialValues;
      touchedRef.current = {};
      errorsRef.current = [];
      serverErrorsRef.current = [];
      clientSubmissionErrorRef.current = [];
      canSubmitRef.current = false; // Typically, a reset form isn't immediately submittable until validated

      // Then update the main state to reflect the reset
      dispatch({
        type: 'UPDATE_STATE',
        updates: {
          values: initialValues,
          touched: {},
          errors: [],
          lastValidated: null,
          canSubmit: false, // Reflects canSubmitRef.current
          // isSubmitting and currentSubmissionID are handled above if forced
          // If not forced, they remain as they were, or are already false/null
        },
      });
      // Values were replaced wholesale — id-tracking subscribers re-derive.
      notifyArrayStructure({ kind: 'reset-all' });
      return true;
    },
    [initialValues, dispatch, notifyArrayStructure]
  );

  // Type-safe resetWithValues function
  const resetWithValues = useCallback(
    (newValues: T, force?: boolean): boolean => {
      // Check if we're submitting and not forcing
      if (isSubmittingRef.current && !force) {
        console.warn(
          'Attempted to reset form while submitting. Use force=true to reset anyway.'
        );
        return false;
      }

      // If we're forcing a reset while submitting, invalidate the submission first.
      // Clear the submission ID too (matching reset()) so any stale helpers.* writes
      // from the in-flight onSubmit no-op via isCurrentSubmission.
      if (isSubmittingRef.current && force) {
        isSubmittingRef.current = false;
        currentSubmissionIDRef.current = null;
        dispatch({
          type: 'UPDATE_STATE',
          updates: { isSubmitting: false, currentSubmissionID: null },
        });
      }

      // Update refs first - this is critical for immediate access
      valuesRef.current = newValues;
      touchedRef.current = {};
      errorsRef.current = [];
      serverErrorsRef.current = [];
      clientSubmissionErrorRef.current = [];
      canSubmitRef.current = false; // Reset form isn't immediately submittable

      // Then update the main state to reflect the reset
      dispatch({
        type: 'UPDATE_STATE',
        updates: {
          values: newValues,
          touched: {},
          errors: [],
          lastValidated: null,
          canSubmit: false, // Reflects canSubmitRef.current
        },
      });
      // Values were replaced wholesale — id-tracking subscribers re-derive.
      notifyArrayStructure({ kind: 'reset-all' });
      return true;
    },
    [dispatch, notifyArrayStructure] // initialValues is not needed here as newValues is passed
  );

  // Function to check if a submission ID is the current one
  const isCurrentSubmission = useCallback((submissionId: string) => {
    return currentSubmissionIDRef.current === submissionId;
  }, []);

  // Set the current submission ID
  const setSubmissionId = useCallback(
    (submissionId: string | null) => {
      currentSubmissionIDRef.current = submissionId;
      dispatch({
        type: 'UPDATE_STATE',
        updates: { currentSubmissionID: submissionId },
      });
    },
    [dispatch]
  );

  // Client submission error methods - improved with refs
  const setClientSubmissionError = useCallback(
    (message: string | string[] | null) => {
      // Directly update the client submission error ref
      if (message === null) {
        clientSubmissionErrorRef.current = [];
      } else {
        clientSubmissionErrorRef.current = Array.isArray(message)
          ? [...message]
          : [message];
      }

      // Update errors state to include client error messages while preserving server errors
      const filteredErrors = errorsRef.current.filter(
        (e) => e.source !== 'client-form-handler'
      );

      // Add new client submission error messages if they exist
      let newErrors = [...filteredErrors];
      if (clientSubmissionErrorRef.current.length > 0) {
        const clientErrors = clientSubmissionErrorRef.current.map((msg) => ({
          path: [],
          message: msg,
          source: 'client-form-handler' as const,
        }));
        newErrors = [...filteredErrors, ...clientErrors];
      }

      // Update ref first for immediate access
      errorsRef.current = newErrors;

      // Then update state
      dispatch({
        type: 'UPDATE_STATE',
        updates: { errors: errorsRef.current },
      });
    },
    [dispatch]
  );

  const clearClientSubmissionError = useCallback(() => {
    // Directly clear the ref
    clientSubmissionErrorRef.current = [];

    // Update errors state to remove client error messages while preserving others
    const newErrors = errorsRef.current.filter(
      (e) => e.source !== 'client-form-handler'
    );

    // Update ref first
    errorsRef.current = newErrors;

    // Then update state
    dispatch({
      type: 'UPDATE_STATE',
      updates: { errors: errorsRef.current },
    });
  }, [dispatch]);

  const getClientSubmissionError = useCallback(() => {
    return [...clientSubmissionErrorRef.current]; // Return a copy to prevent mutation
  }, []);

  // Updated server error methods
  const setServerErrors = useCallback(
    (newErrors: ValidationError[]) => {
      // Filter out invalid paths
      const validServerErrors = newErrors
        .filter((error) => error.path.length === 0 || hasField(error.path))
        .map((error) => ({ ...error, source: 'server' as const }));

      // Update server errors ref
      serverErrorsRef.current = validServerErrors;

      // Get current validation and client errors (using refs to avoid race conditions)
      const validationErrors = errorsRef.current.filter(
        (e) => e.source !== 'server'
      );

      // Combine all errors
      const combinedErrors = [...validationErrors, ...validServerErrors];

      // Update errors ref
      errorsRef.current = combinedErrors;

      // Update state
      dispatch({
        type: 'UPDATE_STATE',
        updates: { errors: errorsRef.current },
      });
    },
    [hasField, dispatch]
  );

  const setServerError = useCallback(
    (path: (string | number)[], message: string | string[] | null) => {
      // Get current server errors from ref
      const currentServerErrors = [...serverErrorsRef.current];

      // Filter out errors at this exact path
      const filteredServerErrors = currentServerErrors.filter(
        (e) =>
          e.path.length !== path.length ||
          !e.path.every((val, idx) => path[idx] === val)
      );

      // If message is null, we're just clearing errors for this path
      let newServerErrors = filteredServerErrors;

      // Otherwise add new server errors
      if (message !== null) {
        const messages = Array.isArray(message) ? message : [message];
        const pathErrors = messages.map((msg) => ({
          path,
          message: msg,
          source: 'server' as const,
        }));

        newServerErrors = [...filteredServerErrors, ...pathErrors];
      }

      // Update server errors ref
      serverErrorsRef.current = newServerErrors;

      // Get current non-server errors using ref
      const nonServerErrors = errorsRef.current.filter(
        (e) => e.source !== 'server'
      );

      // Combine all errors
      const combinedErrors = [...nonServerErrors, ...newServerErrors];

      // Update errors ref
      errorsRef.current = combinedErrors;

      // Update state
      dispatch({
        type: 'UPDATE_STATE',
        updates: { errors: errorsRef.current },
      });
    },
    [dispatch]
  );

  const submit = useCallback(async () => {
    if (!onSubmit) return;

    // Prevent multiple simultaneous submissions
    if (isSubmittingRef.current) {
      console.warn('Form submission prevented: already submitting.');
      return;
    }

    // Clear any server errors and client submission errors before starting a new submission
    // Update refs first for immediate access
    errorsRef.current = errorsRef.current.filter(
      (e) => e.source !== 'server' && e.source !== 'client-form-handler'
    );
    serverErrorsRef.current = []; // Clear server errors ref
    clientSubmissionErrorRef.current = []; // Clear client submission error ref

    // Then update state
    dispatch({ type: 'UPDATE_STATE', updates: { errors: errorsRef.current } });

    // Mark all fields as touched on submit
    const allPaths = getValuePaths();
    for (const path of allPaths) {
      setFieldTouched(path, true);
    }

    // Generate a new submission ID to track this submission
    const submissionId = generateID();

    // Update state to indicate we're submitting and store the submission ID
    // Update ref first
    isSubmittingRef.current = true;
    setSubmissionId(submissionId); // This updates both ref and state

    // Then update state
    dispatch({ type: 'UPDATE_STATE', updates: { isSubmitting: true } });

    try {
      const result = validateForm();
      if (!schema || result.valid) {
        // Pass only the values and a subset of helper functions
        // This avoids the circular dependency and ref usage
        const helpers: FormHelpers<T> = {
          setErrors: (newErrors: ValidationError[]) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              // Update ref first
              errorsRef.current = newErrors;
              // Then update state
              setErrors(newErrors);
            }
          },
          setServerErrors: (newErrors: ValidationError[]) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setServerErrors(newErrors);
            }
          },
          setServerError: (
            path: (string | number)[],
            message: string | string[] | null
          ) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setServerError(path, message);
            }
          },
          setValue: <V = unknown,>(path: (string | number)[], value: V) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setValue(path, value);
            }
          },
          clearValue: (path: (string | number)[]) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              clearValue(path);
            }
          },
          deleteField: (path: (string | number)[]) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              deleteField(path);
            }
          },
          validate: validateFunction, // Validate doesn't need the guard itself, it's a query
          hasField, // HasField doesn't need the guard, it's a query
          touched, // Touched is a snapshot, not an action
          setFieldTouched: (
            path: (string | number)[],
            value: boolean = true
          ) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setFieldTouched(path, value);
            }
          },
          reset: (force?: boolean): boolean => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              return reset(force);
            }
            return false;
          },
          resetWithValues: (newValues: T, force?: boolean): boolean => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              return resetWithValues(newValues, force);
            }
            return false; // Or handle as per desired behavior for stale call
          },
          setClientSubmissionError: (message: string | string[] | null) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setClientSubmissionError(message);
            }
          },
          clearClientSubmissionError: () => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              clearClientSubmissionError();
            }
          },
          getClientSubmissionError: () => {
            return isCurrentSubmission(submissionId)
              ? getClientSubmissionError()
              : [];
          },
          currentSubmissionID: submissionId, // Changed to use the submissionId from this closure
          isCurrentSubmission, // This function already uses the ref correctly
        };

        await onSubmit(values, helpers);
      } else if (result.errors) {
        // Only set errors if this is still the current submission
        if (isCurrentSubmission(submissionId) && mountedRef.current) {
          // Use our improved setErrors implementation
          const serverErrors = errorsRef.current.filter(
            (e) => e.source === 'server'
          );
          const newErrors = [...serverErrors, ...(result.errors || [])];

          // Update ref first
          errorsRef.current = newErrors;

          // Then update state
          dispatch({
            type: 'UPDATE_STATE',
            updates: { errors: errorsRef.current },
          });
        }
      }
    } catch (error: unknown) {
      // Only log unexpected errors and set client errors if this is still the current submission
      if (isCurrentSubmission(submissionId) && mountedRef.current) {
        console.error('Unexpected form submission error:', error);
        // Use setClientSubmissionError instead of setting server errors
        // This is more appropriate as these are client-side errors during submission
        setClientSubmissionError(
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred'
        );
      }
    } finally {
      // Only reset submitting state if this is still the current submission and component is mounted
      if (isCurrentSubmission(submissionId) && mountedRef.current) {
        // Update ref first
        isSubmittingRef.current = false;
        // Then update state
        dispatch({
          type: 'UPDATE_STATE',
          updates: { isSubmitting: false },
        });
      }
    }
  }, [
    onSubmit,
    setErrors,
    getValuePaths,
    setSubmissionId,
    setFieldTouched,
    validateForm,
    schema,
    setValue,
    clearValue,
    deleteField,
    validateFunction,
    hasField,
    touched,
    reset,
    resetWithValues,
    isCurrentSubmission,
    values,
    clearClientSubmissionError,
    getClientSubmissionError,
    setClientSubmissionError,
    setServerErrors,
    setServerError,
    dispatch,
  ]);

  const contextValue = React.useMemo<FormContextValue<T>>(
    () => ({
      values,
      touched,
      setFieldTouched,
      handleBlur,
      errors,
      isSubmitting,
      // Valid when there are no errors AND either validation has run (lastValidated
      // is set) or there's no schema to validate against (a schema-less form is
      // vacuously valid). Uses reactive state, not refs, so consumers stay in sync.
      isValid: errors.length === 0 && (lastValidated !== null || !schema),
      canSubmit, // reactive state; the ref stays for the synchronous submit logic
      lastValidated,
      validateOnBlur,
      currentSubmissionID: state.currentSubmissionID, // Use state for reactivity
      submit,
      reset,
      resetWithValues,
      validate: validateFunction,
      getValue,
      setValue,
      clearValue,
      deleteField,
      reindexArray,
      subscribeArrayStructure,
      getValuePaths,
      getError,
      getErrorPaths,
      getFieldState,
      hasField,
      setErrors: (newErrors: ValidationError[]) => {
        // Update ref first
        errorsRef.current = newErrors;
        // Then update state
        setErrors(newErrors);
      },
      setServerErrors,
      setServerError,
      setClientSubmissionError,
      clearClientSubmissionError,
      getClientSubmissionError,
      isCurrentSubmission,
    }),
    [
      values,
      touched,
      setFieldTouched,
      handleBlur,
      errors,
      isSubmitting,
      canSubmit,
      lastValidated,
      validateOnBlur,
      schema,
      state.currentSubmissionID, // Use state for reactivity in dependency array
      submit,
      reset,
      resetWithValues,
      validateFunction,
      getValue,
      setValue,
      clearValue,
      deleteField,
      reindexArray,
      subscribeArrayStructure,
      getValuePaths,
      getError,
      getErrorPaths,
      getFieldState,
      hasField,
      setErrors,
      setServerErrors,
      setServerError,
      setClientSubmissionError,
      clearClientSubmissionError,
      getClientSubmissionError,
      isCurrentSubmission,
    ]
  );

  // Handle form submission with preventDefault
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      submit();
    },
    [submit]
  );

  // Conditionally wrap in form tag based on useFormTag prop
  return (
    // Use type assertion to make TypeScript happy with the context value
    <FormContext.Provider value={contextValue}>
      {useFormTag ? (
        <form onSubmit={handleSubmit} noValidate {...formProps}>
          {children}
        </form>
      ) : (
        children
      )}
    </FormContext.Provider>
  );
}
