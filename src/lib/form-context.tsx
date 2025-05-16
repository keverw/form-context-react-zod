import React, { createContext, useCallback, useReducer } from 'react';
import { z } from 'zod';
import { validate, ValidationError } from './zod-helpers';
import {
  getValueAtPath,
  setValueAtPath,
  getEmptyValue,
  serializePath,
  cloneAlongPath,
  generateID,
} from './utils';

export interface FormHelpers {
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
  resetWithValues: <T = unknown>(newValues: T, force?: boolean) => boolean;
  currentSubmissionID: string | null;
  isCurrentSubmission: (submissionId: string) => boolean;
}

export interface FormContextValue<T> {
  values: T;
  touched: Record<string, boolean>;
  errors: ValidationError[];
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  setErrors: (errors: ValidationError[]) => void;
  isSubmitting: boolean;
  isValid: boolean;
  canSubmit: boolean;
  lastValidated: number | null;
  currentSubmissionID: string | null;
  submit: () => Promise<void>;
  reset: (force?: boolean) => boolean;
  resetWithValues: (newValues: T, force?: boolean) => boolean;
  validate: (force?: boolean) => boolean;
  getValue: <V = unknown>(path: (string | number)[]) => V;
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  clearValue: (path: (string | number)[]) => void;
  deleteField: (path: (string | number)[]) => void;
  getValuePaths: (path?: (string | number)[]) => (string | number)[][];
  getError: (path: (string | number)[]) => ValidationError[];
  getErrorPaths: (path?: (string | number)[]) => (string | number)[][];
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

// Create a context with a more specific type
export const FormContext = createContext<FormContextValue<
  Record<string | number, unknown>
> | null>(null);

interface FormProviderProps<T> {
  initialValues: T;
  onSubmit?: (values: T, helpers: FormHelpers) => Promise<void> | void;
  schema?: z.ZodType<T>;
  validateOnMount?: boolean;
  validateOnChange?: boolean;
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
  | { type: 'SET_VALUE'; path: (string | number)[]; value: unknown }
  | { type: 'SET_TOUCHED'; touched: Record<string, boolean> }
  | { type: 'SET_ERRORS'; errors: ValidationError[] }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_SUBMISSION_ID'; submissionId: string | null }
  | { type: 'RESET'; initialValues: T }
  | {
      type: 'BATCH_UPDATE';
      updates: {
        values?: T;
        touched?: Record<string, boolean>;
        errors?: ValidationError[];
        isSubmitting?: boolean;
        lastValidated?: number | null;
        canSubmit?: boolean;
        currentSubmissionID?: string | null;
      };
    };

// Implement the reducer function
function formReducer<T extends Record<string | number, unknown>>(
  state: FormState<T>,
  action: FormAction<T>
): FormState<T> {
  switch (action.type) {
    case 'SET_VALUE': {
      // Deep clone only along the path being changed
      const newValues = cloneAlongPath(state.values, action.path);

      setValueAtPath(
        newValues as Record<string | number, unknown>,
        action.path,
        action.value
      );
      return {
        ...state,
        values: newValues,
      };
    }
    case 'SET_TOUCHED':
      return {
        ...state,
        touched: action.touched,
      };
    case 'SET_ERRORS':
      return {
        ...state,
        errors: action.errors,
      };
    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };
    case 'SET_SUBMISSION_ID':
      return {
        ...state,
        currentSubmissionID: action.submissionId,
      };
    case 'RESET':
      return {
        values: action.initialValues,
        touched: {},
        errors: [],
        isSubmitting: false,
        lastValidated: null,
        canSubmit: false,
        currentSubmissionID: null,
      };
    case 'BATCH_UPDATE':
      return {
        ...state,
        ...(action.updates.values !== undefined
          ? { values: action.updates.values }
          : {}),
        ...(action.updates.touched !== undefined
          ? { touched: action.updates.touched }
          : {}),
        ...(action.updates.errors !== undefined
          ? { errors: action.updates.errors }
          : {}),
        ...(action.updates.isSubmitting !== undefined
          ? { isSubmitting: action.updates.isSubmitting }
          : {}),
        lastValidated:
          action.updates.lastValidated !== undefined
            ? action.updates.lastValidated
            : state.lastValidated,
        canSubmit:
          action.updates.canSubmit !== undefined
            ? action.updates.canSubmit
            : state.canSubmit,
        currentSubmissionID:
          action.updates.currentSubmissionID !== undefined
            ? action.updates.currentSubmissionID
            : state.currentSubmissionID,
      };
    default:
      return state;
  }
}

export function FormProvider<T extends Record<string | number, unknown>>({
  initialValues,
  onSubmit,
  schema,
  validateOnMount = false,
  validateOnChange = true,
  useFormTag = false,
  formProps = {},
  children,
}: FormProviderProps<T>) {
  // Use useReducer instead of multiple useState calls
  const [state, dispatch] = useReducer(formReducer<T>, {
    values: initialValues,
    touched: {},
    errors: [],
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
   * 1. Refs (valuesRef, errorsRef, touchedRef) provide immediate, synchronous access
   *    to the latest form data without waiting for React render cycles.
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

  // Keep existing timeout refs to handle debounced updates
  const setValueTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const setTouchedTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Error handling refs
  // Keep track of client submission error messages for real-time access
  const clientSubmissionErrorRef = React.useRef<string[]>([]);

  // Keep all errors in a ref for immediate access/updates, syncing with state for UI
  const errorsRef = React.useRef<ValidationError[]>([]);

  // Keep track of server errors separately to prevent race conditions
  const serverErrorsRef = React.useRef<ValidationError[]>([]);

  // Initialize refs with current state values
  React.useEffect(() => {
    errorsRef.current = errors;
    valuesRef.current = values;
    touchedRef.current = touched;
  }, [errors, values, touched]);

  const getValuePaths = useCallback(
    (basePath: (string | number)[] = []) => {
      const paths: (string | number)[][] = [];

      // Recursively gather all paths
      const traverse = (obj: unknown, currentPath: (string | number)[]) => {
        if (obj && typeof obj === 'object') {
          for (const [key, value] of Object.entries(obj)) {
            const newPath = [...currentPath, key];
            paths.push(newPath);
            traverse(value, newPath);
          }
        }
      };

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

    // Update lastValidated and canSubmit in state
    dispatch({
      type: 'BATCH_UPDATE',
      updates: {
        lastValidated: now,
        canSubmit: result.valid,
      },
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

      // Debounce the state update
      if (setTouchedTimeoutRef.current) {
        clearTimeout(setTouchedTimeoutRef.current);
      }

      setTouchedTimeoutRef.current = setTimeout(() => {
        dispatch({
          type: 'SET_TOUCHED',
          touched: touchedRef.current,
        });
      }, 0);
    },
    [markPathAsTouched]
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
          type: 'SET_ERRORS',
          errors: newErrors,
        });
      }
      return result.valid;
    },
    [getValuePaths, setFieldTouched, validateForm, dispatch]
  );

  // Function used for mount validation
  const performInitialValidation = useCallback(() => {
    // Get all paths for marking as touched
    const allPaths = getValuePaths();

    // Mark all paths as touched in the ref
    const newTouched: Record<string, boolean> = {};

    // Mark all paths as touched
    for (const path of allPaths) {
      const pathKey = serializePath(path);
      newTouched[pathKey] = true;

      // Also mark parent paths
      for (let i = 1; i <= path.length; i++) {
        const parentPath = path.slice(0, i);
        newTouched[serializePath(parentPath)] = true;
      }
    }

    // Update the touched ref
    touchedRef.current = newTouched;

    // Validate form directly
    const result = validateForm();
    const newErrors = result.valid ? [] : result.errors || [];

    // Update errors ref
    errorsRef.current = newErrors;

    // Combine everything into a single batch update
    dispatch({
      type: 'BATCH_UPDATE',
      updates: {
        touched: newTouched,
        errors: newErrors,
        lastValidated: Date.now(),
        canSubmit: result.valid,
      },
    });
  }, [getValuePaths, validateForm]);

  // Function to set isSubmitting status
  const setIsSubmitting = useCallback(
    (isSubmitting: boolean) => {
      dispatch({
        type: 'SET_SUBMITTING',
        isSubmitting,
      });
    },
    [dispatch]
  );

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
      // Prevent any pending batches from running after unmount
      if (setValueTimeoutRef.current) clearTimeout(setValueTimeoutRef.current);
      if (setTouchedTimeoutRef.current)
        clearTimeout(setTouchedTimeoutRef.current);
    };
  }, [validateOnMount, schema, performInitialValidation]);

  const getValue = useCallback(<V = unknown,>(path: (string | number)[]): V => {
    // Use the ref for immediate value access
    return getValueAtPath(valuesRef.current, path) as V;
  }, []);

  // Helper function removed since we now filter errors directly

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
          type: 'SET_ERRORS',
          errors: newErrors,
        });
      } else {
        // Update ref first
        errorsRef.current = errorsOrUpdater;
        // Then update state
        dispatch({
          type: 'SET_ERRORS',
          errors: errorsOrUpdater,
        });
      }
    },
    [dispatch]
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

      // Debounce the state update
      if (setValueTimeoutRef.current) {
        clearTimeout(setValueTimeoutRef.current);
      }

      setValueTimeoutRef.current = setTimeout(() => {
        // Create a validation result if needed
        let newCanSubmit = canSubmit;
        let newErrors = [...errorsRef.current];

        if (validateOnChange && schema) {
          const result = validate(schema, newValues);
          // Update canSubmit based on validation result
          newCanSubmit = result.valid;

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

        // Dispatch a single update with all changes
        dispatch({
          type: 'BATCH_UPDATE',
          updates: {
            values: newValues,
            touched: touchedRef.current,
            errors: newErrors,
            lastValidated: Date.now(),
            canSubmit: newCanSubmit,
          },
        });
      }, 0);
    },
    [validateOnChange, schema, canSubmit, markPathAsTouched]
  );

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
      dispatch({ type: 'SET_VALUE', path, value: emptyValue });
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

        // Create a new errors array with the deleted item's errors removed
        const newErrors = errorsRef.current
          .filter(
            (error) =>
              error.path.length < parentPath.length ||
              !error.path
                .slice(0, parentPath.length)
                .every((val, idx) => parentPath[idx] === val)
          )
          .map((error) => {
            // Adjust indices for errors on items after the deleted one
            if (
              error.path.length > parentPath.length &&
              error.path
                .slice(0, parentPath.length)
                .every((val, idx) => parentPath[idx] === val)
            ) {
              const errorIndex = Number(error.path[parentPath.length]);

              if (!isNaN(errorIndex) && errorIndex > arrayIndex) {
                return {
                  ...error,
                  path: [
                    ...parentPath,
                    errorIndex - 1,
                    ...error.path.slice(parentPath.length + 1),
                  ],
                };
              }
            }

            return error;
          });

        // Update errorsRef immediately
        errorsRef.current = newErrors;

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
          type: 'BATCH_UPDATE',
          updates: {
            values: newValues,
            touched: newTouched,
            errors: finalErrors,
            lastValidated: Date.now(),
            canSubmit: newCanSubmit,
          },
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
          type: 'BATCH_UPDATE',
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
    [canSubmit, validateOnChange, schema]
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

  const reset = useCallback(
    (force?: boolean): boolean => {
      // Prevent resetting while submitting unless forced
      if (isSubmitting && !force) {
        console.warn(
          'Attempted to reset form while submitting. Use force=true to reset anyway.'
        );
        return false;
      }

      // If we're forcing a reset while submitting, cancel the submission first
      if (isSubmitting && force) {
        setIsSubmitting(false);
        // Also clear the submission ID ref since the submission is being cancelled
        currentSubmissionIDRef.current = null;
        dispatch({ type: 'SET_SUBMISSION_ID', submissionId: null });
      }

      // Update refs first - this is critical for immediate access
      valuesRef.current = initialValues;
      touchedRef.current = {};
      errorsRef.current = [];
      serverErrorsRef.current = [];
      clientSubmissionErrorRef.current = [];

      // Then update state
      dispatch({ type: 'RESET', initialValues });
      return true;
    },
    [initialValues, dispatch, isSubmitting, setIsSubmitting]
  );

  // Type-safe resetWithValues function
  const resetWithValues = useCallback(
    (newValues: T, force?: boolean): boolean => {
      // Check if we're submitting and not forcing
      if (isSubmitting && !force) {
        console.warn(
          'Attempted to reset form while submitting. Use force=true to reset anyway.'
        );
        return false;
      }

      // If we're forcing a reset while submitting, cancel the submission first
      if (isSubmitting && force) {
        setIsSubmitting(false);
      }

      // Update refs first - this is critical for immediate access
      valuesRef.current = newValues;
      touchedRef.current = {};
      errorsRef.current = [];
      serverErrorsRef.current = [];
      clientSubmissionErrorRef.current = [];

      // Then update state
      dispatch({ type: 'RESET', initialValues: newValues });
      return true;
    },
    [dispatch, isSubmitting, setIsSubmitting]
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
        type: 'SET_SUBMISSION_ID',
        submissionId,
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
        type: 'SET_ERRORS',
        errors: newErrors,
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
      type: 'SET_ERRORS',
      errors: newErrors,
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
        type: 'SET_ERRORS',
        errors: combinedErrors,
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
        type: 'SET_ERRORS',
        errors: combinedErrors,
      });
    },
    [dispatch]
  );

  const submit = useCallback(async () => {
    if (!onSubmit) return;

    // Prevent multiple simultaneous submissions
    if (isSubmitting) {
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
    setErrors(errorsRef.current);

    // Mark all fields as touched on submit
    const allPaths = getValuePaths();
    for (const path of allPaths) {
      setFieldTouched(path, true);
    }

    // Generate a new submission ID to track this submission
    const submissionId = generateID();

    // Update state to indicate we're submitting and store the submission ID
    setIsSubmitting(true);
    setSubmissionId(submissionId); // This updates both ref and state

    try {
      const result = validateForm();
      if (!schema || result.valid) {
        // Pass only the values and a subset of helper functions
        // This avoids the circular dependency and ref usage
        const helpers: FormHelpers = {
          setErrors: (newErrors: ValidationError[]) => {
            if (isCurrentSubmission(submissionId)) {
              // Update ref first
              errorsRef.current = newErrors;
              // Then update state
              setErrors(newErrors);
            }
          },
          setServerErrors: (newErrors: ValidationError[]) => {
            if (isCurrentSubmission(submissionId)) {
              setServerErrors(newErrors);
            }
          },
          setServerError: (
            path: (string | number)[],
            message: string | string[] | null
          ) => {
            if (isCurrentSubmission(submissionId)) {
              setServerError(path, message);
            }
          },
          setValue: <V = unknown,>(path: (string | number)[], value: V) => {
            if (isCurrentSubmission(submissionId)) {
              setValue(path, value);
            }
          },
          clearValue: (path: (string | number)[]) => {
            if (isCurrentSubmission(submissionId)) {
              clearValue(path);
            }
          },
          deleteField: (path: (string | number)[]) => {
            if (isCurrentSubmission(submissionId)) {
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
            if (isCurrentSubmission(submissionId)) {
              setFieldTouched(path, value);
            }
          },
          reset: (force?: boolean): boolean => {
            if (isCurrentSubmission(submissionId)) {
              return reset(force);
            }
            return false;
          },
          resetWithValues: <V = unknown,>(
            newValues: V,
            force?: boolean
          ): boolean => {
            if (isCurrentSubmission(submissionId)) {
              return resetWithValues(newValues as unknown as T, force);
            }
            return false; // Or handle as per desired behavior for stale call
          },
          setClientSubmissionError: (message: string | string[] | null) => {
            if (isCurrentSubmission(submissionId)) {
              setClientSubmissionError(message);
            }
          },
          clearClientSubmissionError: () => {
            if (isCurrentSubmission(submissionId)) {
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
        if (isCurrentSubmission(submissionId)) {
          // Use our improved setErrors implementation
          const serverErrors = errorsRef.current.filter(
            (e) => e.source === 'server'
          );
          const newErrors = [...serverErrors, ...(result.errors || [])];

          // Update ref first
          errorsRef.current = newErrors;

          // Then update state
          dispatch({
            type: 'SET_ERRORS',
            errors: newErrors,
          });
        }
      }
    } catch (error: unknown) {
      // Only log unexpected errors and set client errors if this is still the current submission
      if (isCurrentSubmission(submissionId)) {
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
      // Only reset submitting state if this is still the current submission
      if (isCurrentSubmission(submissionId)) {
        setIsSubmitting(false);
      }
    }
  }, [
    onSubmit,
    isSubmitting,
    setErrors,
    getValuePaths,
    setIsSubmitting,
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
      errors,
      isSubmitting,
      isValid: mountedRef.current && errors.length === 0,
      canSubmit,
      lastValidated,
      currentSubmissionID: state.currentSubmissionID, // Use state for reactivity
      submit,
      reset,
      resetWithValues,
      validate: validateFunction,
      getValue,
      setValue,
      clearValue,
      deleteField,
      getValuePaths,
      getError,
      getErrorPaths,
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
      errors,
      isSubmitting,
      canSubmit,
      lastValidated,
      state.currentSubmissionID, // Use state for reactivity in dependency array
      submit,
      reset,
      resetWithValues,
      validateFunction,
      getValue,
      setValue,
      clearValue,
      deleteField,
      getValuePaths,
      getError,
      getErrorPaths,
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
    <FormContext.Provider
      value={
        contextValue as unknown as FormContextValue<
          Record<string | number, unknown>
        >
      }
    >
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
