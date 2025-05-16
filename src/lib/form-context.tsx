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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FormContext = createContext<FormContextValue<any> | null>(null);

interface FormProviderProps<T> {
  initialValues: T;
  onSubmit?: (values: T, helpers: FormHelpers<T>) => Promise<void> | void;
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

  // Keep all errors in a ref for immediate access/updates, syncing with state for UI
  const errorsRef = React.useRef<ValidationError[]>([]);

  // Keep track of server errors separately to prevent race conditions
  const serverErrorsRef = React.useRef<ValidationError[]>([]);

  // Initialize refs with current state values
  React.useEffect(() => {
    errorsRef.current = errors;
    valuesRef.current = values;
    touchedRef.current = touched;
    canSubmitRef.current = canSubmit;
    isSubmittingRef.current = isSubmitting;
  }, [errors, values, touched, canSubmit, isSubmitting]);

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
    },
    [validateOnChange, schema, markPathAsTouched, dispatch]
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
      type: 'UPDATE_STATE',
      updates: {
        touched: newTouched,
        errors: newErrors,
        lastValidated: Date.now(),
        canSubmit: result.valid,
      },
    });
  }, [getValuePaths, validateForm]);

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
          type: 'UPDATE_STATE',
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
      return true;
    },
    [initialValues, dispatch]
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

      // If we're forcing a reset while submitting, cancel the submission first
      if (isSubmittingRef.current && force) {
        isSubmittingRef.current = false;
        // currentSubmissionIDRef is not explicitly cleared here, but usually a reset implies a new context
        // We'll let the general UPDATE_STATE handle isSubmitting, and if a new submission ID is needed, it'll be set by submit().
        dispatch({ type: 'UPDATE_STATE', updates: { isSubmitting: false } });
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
      return true;
    },
    [dispatch] // initialValues is not needed here as newValues is passed
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
      errors,
      isSubmitting,
      isValid: mountedRef.current && errors.length === 0,
      canSubmit: canSubmitRef.current, // Use the ref value directly
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
