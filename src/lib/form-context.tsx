import React, { createContext, useCallback, useReducer } from 'react';
import { z } from 'zod';
import { validate, ValidationError } from './zod-helpers';
import { getValueAtPath, setValueAtPath } from './utils';

export interface FormHelpers {
  setErrors: (errors: ValidationError[]) => void;
  setServerErrors: (errors: ValidationError[]) => void;
  setServerError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  clearValue: (path: (string | number)[]) => void;
  deleteField: (path: (string | number)[]) => void;
  validate: (force?: boolean) => boolean;
  hasField: (path: (string | number)[]) => boolean;
  touched: Record<string, boolean>;
  setTouched: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  reset: () => void;
}

export interface FormContextValue<T> {
  values: T;
  touched: Record<string, boolean>;
  errors: ValidationError[];
  setTouched: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setErrors: (errors: ValidationError[]) => void;
  isSubmitting: boolean;
  isValid: boolean;
  lastValidated: number | null;
  submit: () => Promise<void>;
  reset: () => void;
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
}

export const FormContext = createContext<FormContextValue<unknown> | null>(
  null
);

interface FormProviderProps<T> {
  initialValues: T;
  onSubmit?: (values: T, helpers: FormHelpers) => Promise<void> | void;
  schema?: z.ZodType<T>;
  validateOnMount?: boolean;
  validateOnChange?: boolean;
  children: React.ReactNode;
}

// Define the form state interface
interface FormState<T> {
  values: T;
  touched: Record<string, boolean>;
  errors: ValidationError[];
  isSubmitting: boolean;
  lastValidated: number | null;
}

// Define action types
type FormAction<T> =
  | { type: 'SET_VALUE'; path: (string | number)[]; value: unknown }
  | { type: 'SET_VALUES'; values: T }
  | { type: 'SET_TOUCHED'; touched: Record<string, boolean> }
  | { type: 'SET_ERRORS'; errors: ValidationError[] }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'RESET'; initialValues: T }
  | {
      type: 'BATCH_UPDATE';
      updates: {
        values?: T;
        touched?: Record<string, boolean>;
        errors?: ValidationError[];
        isSubmitting?: boolean;
        lastValidated?: number | null;
      };
    };

// Implement the reducer function
function formReducer<T extends Record<string | number, unknown>>(
  state: FormState<T>,
  action: FormAction<T>
): FormState<T> {
  switch (action.type) {
    case 'SET_VALUE': {
      const newValues = { ...state.values };
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
    case 'SET_VALUES':
      return {
        ...state,
        values: action.values,
      };
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
    case 'RESET':
      return {
        values: action.initialValues,
        touched: {},
        errors: [],
        isSubmitting: false,
        lastValidated: null,
      };
    case 'BATCH_UPDATE':
      return {
        ...state,
        ...(action.updates.values ? { values: action.updates.values } : {}),
        ...(action.updates.touched ? { touched: action.updates.touched } : {}),
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
      } as FormState<T>;
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
  children,
}: FormProviderProps<T>) {
  // Use useReducer instead of multiple useState calls
  const [state, dispatch] = useReducer(formReducer<T>, {
    values: initialValues,
    touched: {},
    errors: [],
    isSubmitting: false,
    lastValidated: null,
  });

  // Destructure state for easier access
  const { values, touched, errors, isSubmitting, lastValidated } = state;

  // Using useRef instead of useState to avoid race conditions
  const mountedRef = React.useRef(false);

  // Keep track of pending setValue operations
  const pendingSetValueRef = React.useRef<
    Map<string, { path: (string | number)[]; value: unknown }>
  >(new Map());
  const setValueTimeoutRef = React.useRef<number | null>(null);

  // Keep track of pending setServerError operations
  const pendingServerErrorsRef = React.useRef<
    Map<string, { path: (string | number)[]; messages: string[] | null }>
  >(new Map());
  const setServerErrorTimeoutRef = React.useRef<number | null>(null);

  const getValuePaths = useCallback(
    (basePath: (string | number)[] = []) => {
      const paths: (string | number)[][] = [];

      // Recursively gather all paths
      const traverse = (obj: unknown, currentPath: (string | number)[]) => {
        if (obj && typeof obj === 'object') {
          // Using for...of instead of .forEach
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

    // Update lastValidated in state
    dispatch({
      type: 'BATCH_UPDATE',
      updates: {
        lastValidated: now,
      },
    });

    return result;
  }, [schema, values, dispatch]);

  // Define wrapper functions for dispatch
  const setTouched = useCallback(
    (
      touchedOrUpdater:
        | Record<string, boolean>
        | ((prev: Record<string, boolean>) => Record<string, boolean>)
    ) => {
      if (typeof touchedOrUpdater === 'function') {
        const updater = touchedOrUpdater;
        dispatch({
          type: 'SET_TOUCHED',
          touched: updater(touched),
        });
      } else {
        dispatch({
          type: 'SET_TOUCHED',
          touched: touchedOrUpdater,
        });
      }
    },
    [touched, dispatch]
  );

  const setErrors = useCallback(
    (
      errorsOrUpdater:
        | ValidationError[]
        | ((prev: ValidationError[]) => ValidationError[])
    ) => {
      if (typeof errorsOrUpdater === 'function') {
        const updater = errorsOrUpdater;
        dispatch({
          type: 'SET_ERRORS',
          errors: updater(errors),
        });
      } else {
        dispatch({
          type: 'SET_ERRORS',
          errors: errorsOrUpdater,
        });
      }
    },
    [errors, dispatch]
  );

  const validateAndMarkTouched = useCallback(() => {
    // Mark all fields as touched when validating on mount with prefilled values
    const allPaths = getValuePaths();
    setTouched((prev) => {
      const newTouched = { ...prev };
      // Using for...of instead of .forEach
      for (const path of allPaths) {
        newTouched[path.join('.')] = true;
      }
      return newTouched;
    });

    const result = validateForm();
    if (!result.valid && result.errors) {
      setErrors(result.errors);
    }
  }, [getValuePaths, validateForm, setErrors, setTouched]);

  const setValues = useCallback(
    (valuesOrUpdater: T | ((prev: T) => T)) => {
      if (typeof valuesOrUpdater === 'function') {
        const updater = valuesOrUpdater as (prev: T) => T;
        dispatch({
          type: 'SET_VALUES',
          values: updater(values),
        });
      } else {
        dispatch({
          type: 'SET_VALUES',
          values: valuesOrUpdater,
        });
      }
    },
    [values, dispatch]
  );

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
      validateAndMarkTouched();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [validateOnMount, schema, validateAndMarkTouched]);

  const getValue = useCallback(
    <V = unknown,>(path: (string | number)[]): V => {
      return getValueAtPath(values, path) as V;
    },
    [values]
  );

  // Helper function to create a new touched state with a path marked as touched
  const markPathAsTouched = useCallback(
    (touched: Record<string, boolean>, path: (string | number)[]) => {
      const newTouched = { ...touched };
      // Mark the field itself
      newTouched[path.join('.')] = true;

      // Mark all parent paths
      for (let i = 1; i <= path.length; i++) {
        const parentPath = path.slice(0, i);
        newTouched[parentPath.join('.')] = true;
      }
      return newTouched;
    },
    []
  );

  // Helper function to filter errors for a specific path
  const filterErrorsForPath = useCallback(
    (errors: ValidationError[], path: (string | number)[]) => {
      return errors.filter(
        (error) =>
          error.path.length !== path.length ||
          !error.path.every((val, idx) => path[idx] === val)
      );
    },
    []
  );

  // Queue setValue operations to be processed in a batch
  const queueSetValue = useCallback(
    (path: (string | number)[], value: unknown) => {
      // Store the path as a string key
      const pathKey = path.join('.');
      pendingSetValueRef.current.set(pathKey, { path, value });

      // Clear any existing timeout
      if (setValueTimeoutRef.current) {
        clearTimeout(setValueTimeoutRef.current);
      }

      // Process all pending setValue operations in the next tick
      setValueTimeoutRef.current = setTimeout(() => {
        const pendingOperations = Array.from(
          pendingSetValueRef.current.values()
        );
        pendingSetValueRef.current.clear();

        if (pendingOperations.length === 0) return;

        // Create a new values object with all updates
        const newValues = { ...values };
        let newTouched = { ...touched };
        let newErrors = [...errors];

        // Apply all pending setValue operations
        for (const { path, value } of pendingOperations) {
          // Update values
          setValueAtPath(
            newValues as Record<string | number, unknown>,
            path,
            value
          );

          // Mark path as touched
          newTouched = markPathAsTouched(newTouched, path);

          // Filter out errors for this path
          newErrors = filterErrorsForPath(newErrors, path);
        }

        // Validate the new values
        if (validateOnChange && schema) {
          const result = validate(schema, newValues);
          if (!result.valid && result.errors) {
            // Only add new validation errors for all updated paths
            for (const { path } of pendingOperations) {
              const pathErrors = result.errors.filter(
                (error) =>
                  error.path.length === path.length &&
                  error.path.every((val, idx) => path[idx] === val)
              );
              newErrors = [...newErrors, ...pathErrors];
            }
          }
        }

        // Dispatch a single update with all changes
        dispatch({
          type: 'BATCH_UPDATE',
          updates: {
            values: newValues,
            touched: newTouched,
            errors: newErrors,
            lastValidated: Date.now(),
          },
        });
      }, 0);
    },
    [
      values,
      touched,
      errors,
      markPathAsTouched,
      filterErrorsForPath,
      validateOnChange,
      schema,
    ]
  );

  // The setValue function that users will call
  const setValue = useCallback(
    <V = unknown,>(path: (string | number)[], value: V) => {
      queueSetValue(path, value);
    },
    [queueSetValue]
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
      let emptyValue:
        | Record<string | number, unknown>
        | unknown[]
        | string
        | number
        | boolean;

      if (Array.isArray(currentValue)) {
        // For arrays, simply empty the array
        emptyValue = [];
      } else if (typeof currentValue === 'object' && currentValue !== null) {
        // For objects, preserve the structure but set each property to its empty value
        const typedEmptyValue: Record<string | number, unknown> = {};

        for (const key in currentValue) {
          if (Object.prototype.hasOwnProperty.call(currentValue, key)) {
            const propValue = currentValue[key as keyof typeof currentValue];

            if (Array.isArray(propValue)) {
              typedEmptyValue[key] = [];
            } else if (typeof propValue === 'object' && propValue !== null) {
              typedEmptyValue[key] = {};
            } else if (typeof propValue === 'number') {
              typedEmptyValue[key] = 0;
            } else if (typeof propValue === 'boolean') {
              typedEmptyValue[key] = false;
            } else {
              typedEmptyValue[key] = '';
            }
          }
        }

        emptyValue = typedEmptyValue;
      } else if (typeof currentValue === 'number') {
        emptyValue = 0;
      } else if (typeof currentValue === 'boolean') {
        emptyValue = false;
      } else {
        emptyValue = '';
      }

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
      const parent = getValueAtPath(values, parentPath);

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

        // Create a new values object with the updated array
        const newValues = { ...values };
        setValueAtPath(newValues, parentPath, newItems);

        // Create a new touched state with the deleted item removed
        const newTouched = { ...touched };

        // Remove touched states for the deleted item and its children
        // and adjust indices for items after the deleted one
        Object.keys(newTouched).forEach((key) => {
          const keyPath = key.split('.');

          // Check if this key is related to the array we're modifying
          if (
            keyPath.length > parentPath.length &&
            parentPath.every((val, idx) => String(val) === keyPath[idx])
          ) {
            const itemIndex = Number(keyPath[parentPath.length]);

            // If this is for the deleted item or its children, remove it
            if (!isNaN(itemIndex) && itemIndex === arrayIndex) {
              delete newTouched[key];
            }
            // If this is for an item after the deleted one, adjust its index
            else if (!isNaN(itemIndex) && itemIndex > arrayIndex) {
              const newKey = [
                ...keyPath.slice(0, parentPath.length),
                String(itemIndex - 1),
                ...keyPath.slice(parentPath.length + 1),
              ].join('.');
              newTouched[newKey] = newTouched[key];
              delete newTouched[key];
            }
          }
        });

        // Create a new errors array with the deleted item's errors removed
        const newErrors = errors
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

        // Validate the new array after deletion
        let finalErrors = newErrors;
        if (validateOnChange && schema) {
          const result = validate(schema, newValues);
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
            const existingPaths = newErrors.map((e) => e.path.join('.'));
            const newArrayErrors = arrayErrors.filter(
              (e) => !existingPaths.includes(e.path.join('.'))
            );

            finalErrors = [...newErrors, ...newArrayErrors];
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
          },
        });
      } else {
        // For non-array items, implement a comprehensive approach
        // Create a new values object with the item removed
        const newValues = { ...values };

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

        // Create a new touched state with all related touched states removed
        const newTouched = { ...touched };
        const pathPrefix = path.join('.') + '.';

        // Remove touched state for the deleted field and all its children
        Object.keys(newTouched).forEach((key) => {
          // Remove exact match
          if (key === path.join('.')) {
            delete newTouched[key];
          }
          // Remove all nested fields
          else if (key.startsWith(pathPrefix)) {
            delete newTouched[key];
          }
        });

        // Create a new errors array with all related errors removed
        const newErrors = errors.filter((error) => {
          // Keep errors not related to this path
          if (error.path.length < path.length) {
            return true;
          }

          // Remove errors for the deleted field and its children
          return !error.path
            .slice(0, path.length)
            .every((val, idx) => path[idx] === val);
        });

        // Validate the form after deletion
        let finalErrors = newErrors;
        if (validateOnChange && schema) {
          const result = validate(schema, newValues);
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
            const existingPaths = newErrors.map((e) => e.path.join('.'));
            const newParentErrors = parentErrors.filter(
              (e) => !existingPaths.includes(e.path.join('.'))
            );

            finalErrors = [...newErrors, ...newParentErrors];
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
          },
        });
      }
    },
    [values, touched, errors, dispatch, validateOnChange, schema]
  );

  const pathExists = useCallback(
    (path: (string | number)[]) => {
      let current: Record<string | number, unknown> | unknown = values;
      for (let i = 0; i < path.length; i++) {
        if (current === undefined || current === null) return false;
        if (typeof path[i] === 'number' && !Array.isArray(current))
          return false;
        current = (current as Record<string | number, unknown>)[path[i]];
      }
      return true;
    },
    [values]
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

  const reset = useCallback(() => {
    setValues(initialValues);
    setTouched({});
    setErrors([]);
  }, [initialValues, setErrors, setTouched, setValues]);

  // Queue setServerError operations to be processed in a batch
  const queueSetServerError = useCallback(
    (path: (string | number)[], message: string | string[] | null) => {
      // Store the path as a string key
      const pathKey = path.join('.');
      const messages =
        message === null ? null : Array.isArray(message) ? message : [message];

      pendingServerErrorsRef.current.set(pathKey, { path, messages });

      // Clear any existing timeout
      if (setServerErrorTimeoutRef.current) {
        clearTimeout(setServerErrorTimeoutRef.current);
      }

      // Process all pending setServerError operations in the next tick
      setServerErrorTimeoutRef.current = setTimeout(() => {
        const pendingOperations = Array.from(
          pendingServerErrorsRef.current.values()
        );
        pendingServerErrorsRef.current.clear();

        if (pendingOperations.length === 0) return;

        // Apply all pending setServerError operations at once
        setErrors((prev) => {
          let updatedErrors = [...prev];

          for (const { path, messages } of pendingOperations) {
            // If messages is null, clear server errors at this path
            if (messages === null) {
              updatedErrors = updatedErrors.filter(
                (error) =>
                  error.source !== 'server' ||
                  error.path.length !== path.length ||
                  !error.path.every((val, idx) => path[idx] === val)
              );
            } else {
              // Only proceed if path exists (except for root errors)
              if (path.length > 0 && !pathExists(path)) continue;

              // Remove existing server errors at the same exact path
              updatedErrors = updatedErrors.filter(
                (error) =>
                  error.source !== 'server' ||
                  error.path.length !== path.length ||
                  !error.path.every((val, idx) => path[idx] === val)
              );

              // Add new server errors
              const newErrors = messages.map((msg) => ({
                path,
                message: msg,
                source: 'server' as const,
              }));

              updatedErrors = [...updatedErrors, ...newErrors];
            }
          }

          return updatedErrors;
        });
      }, 0);
    },
    [setErrors, pathExists]
  );

  const submit = useCallback(async () => {
    if (!onSubmit) return;

    // Clear any server errors before starting a new submission
    setErrors((prev) => prev.filter((e) => e.source !== 'server'));

    // Mark all fields as touched on submit
    const allPaths = getValuePaths();
    setTouched((prev) => {
      const newTouched = { ...prev };
      // Using for...of instead of .forEach
      for (const path of allPaths) {
        newTouched[path.join('.')] = true;
      }
      return newTouched;
    });

    setIsSubmitting(true);
    try {
      const result = validateForm();
      if (!schema || result.valid) {
        // Pass only the values and a subset of helper functions
        // This avoids the circular dependency and ref usage
        const helpers: FormHelpers = {
          setErrors,
          setServerErrors: (newErrors: ValidationError[]) => {
            // Filter out validation errors and invalid paths
            const validationErrors = errors.filter(
              (e) => e.source !== 'server'
            );
            const validServerErrors = newErrors
              .filter(
                (error) => error.path.length === 0 || pathExists(error.path)
              )
              .map((error) => ({ ...error, source: 'server' as const }));

            setErrors([...validationErrors, ...validServerErrors]);
          },
          setServerError: (
            path: (string | number)[],
            message: string | string[] | null
          ) => {
            queueSetServerError(path, message);
          },
          setValue,
          clearValue,
          deleteField,
          validate: (force?: boolean) => {
            if (force) {
              // Mark all fields as touched first
              const allPaths = getValuePaths();
              setTouched((prev) => {
                const newTouched = { ...prev };
                for (const path of allPaths) {
                  newTouched[path.join('.')] = true;
                }
                return newTouched;
              });
            }
            const result = validateForm();
            if (!result.valid && result.errors) {
              setErrors((prev) => {
                const serverErrors = prev.filter((e) => e.source === 'server');
                return [...serverErrors, ...(result.errors || [])];
              });
            }
            return result.valid;
          },
          hasField,
          touched,
          setTouched,
          reset,
        };

        await onSubmit(values, helpers);
      } else if (result.errors) {
        setErrors((prev) => {
          const serverErrors = prev.filter((e) => e.source === 'server');
          return [...serverErrors, ...(result.errors || [])];
        });
      }
    } catch (error: unknown) {
      // Only log unexpected errors
      console.error('Unexpected form submission error:', error);
      setErrors([
        {
          path: [],
          message:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
          source: 'server',
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    onSubmit,
    setErrors,
    getValuePaths,
    setTouched,
    setIsSubmitting,
    validateForm,
    schema,
    values,
    errors,
    pathExists,
    queueSetServerError,
    reset,
    setValue,
    clearValue,
    deleteField,
    hasField,
    touched,
  ]);

  const contextValue = React.useMemo<FormContextValue<T>>(
    () => ({
      values,
      touched,
      setTouched,
      errors,
      isSubmitting,
      isValid: mountedRef.current && errors.length === 0,
      lastValidated,
      submit,
      reset,
      validate: (force?: boolean) => {
        if (force) {
          // Mark all fields as touched first
          const allPaths = getValuePaths();
          setTouched((prev) => {
            const newTouched = { ...prev };
            for (const path of allPaths) {
              newTouched[path.join('.')] = true;
            }
            return newTouched;
          });
        }
        const result = validateForm();
        if (!result.valid && result.errors) {
          setErrors((prev) => {
            const serverErrors = prev.filter((e) => e.source === 'server');
            return [...serverErrors, ...(result.errors || [])];
          });
        }
        return result.valid;
      },
      getValue,
      setValue,
      clearValue,
      deleteField,
      getValuePaths,
      getError,
      getErrorPaths,
      hasField,
      setErrors: (newErrors: ValidationError[]) => {
        setErrors(newErrors);
      },
      setServerErrors: (newErrors: ValidationError[]) => {
        // Filter out validation errors and invalid paths
        const validationErrors = errors.filter((e) => e.source !== 'server');
        const validServerErrors = newErrors
          .filter((error) => error.path.length === 0 || pathExists(error.path))
          .map((error) => ({ ...error, source: 'server' as const }));

        setErrors([...validationErrors, ...validServerErrors]);
      },
      setServerError: (
        path: (string | number)[],
        message: string | string[] | null
      ) => {
        queueSetServerError(path, message);
      },
    }),
    [
      values,
      touched,
      setTouched,
      errors,
      isSubmitting,
      lastValidated,
      submit,
      reset,
      validateForm,
      getValuePaths,
      getValue,
      setValue,
      clearValue,
      deleteField,
      getError,
      getErrorPaths,
      hasField,
      setErrors,
      pathExists,
      queueSetServerError,
    ]
  );

  return (
    <FormContext.Provider value={contextValue}>{children}</FormContext.Provider>
  );
}
