import React, { createContext, useContext, useState, useCallback, useReducer } from 'react';
import { z } from 'zod';
import { validate, ValidationError } from './zod-helpers';

// Helper to get a value at a path
export function getValueAtPath(obj: any, path: (string | number)[]): any {
  return path.reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

// Helper to set a value at a path
export function setValueAtPath(
  obj: any,
  path: (string | number)[],
  value: any
): void {
  const lastKey = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const parent = parentPath.reduce((acc, key) => {
    if (acc[key] === undefined) {
      acc[key] = typeof key === 'number' ? [] : {};
    }
    return acc[key];
  }, obj);
  parent[lastKey] = value;
}

interface FormContextValue<T> {
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
  getValue: <V = any>(path: (string | number)[]) => V;
  setValue: <V = any>(path: (string | number)[], value: V) => void;
  deleteField: (path: (string | number)[]) => void;
  getValuePaths: (path?: (string | number)[]) => (string | number)[][];
  getError: (path: (string | number)[]) => ValidationError[];
  getErrorPaths: (path?: (string | number)[]) => (string | number)[][];
  setServerErrors: (errors: ValidationError[]) => void;
  setServerError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  hasField: (path: (string | number)[]) => boolean;
}

const FormContext = createContext<FormContextValue<any> | null>(null);

interface FormProviderProps<T> {
  initialValues: T;
  onSubmit?: (form: FormContextValue<T>, values: T) => Promise<void> | void;
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
  | { type: 'SET_VALUE'; path: (string | number)[]; value: any }
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
      }
    };

// Implement the reducer function
function formReducer<T>(state: FormState<T>, action: FormAction<T>): FormState<T> {
  switch (action.type) {
    case 'SET_VALUE': {
      const newValues = { ...state.values };
      setValueAtPath(newValues, action.path, action.value);
      return {
        ...state,
        values: newValues
      };
    }
    case 'SET_VALUES':
      return {
        ...state,
        values: action.values
      };
    case 'SET_TOUCHED':
      return {
        ...state,
        touched: action.touched
      };
    case 'SET_ERRORS':
      return {
        ...state,
        errors: action.errors
      };
    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.isSubmitting
      };
    case 'RESET':
      return {
        values: action.initialValues,
        touched: {},
        errors: [],
        isSubmitting: false,
        lastValidated: null
      };
    case 'BATCH_UPDATE':
      return {
        ...state,
        ...(action.updates.values ? { values: action.updates.values as T } : {}),
        ...(action.updates.touched ? { touched: action.updates.touched } : state.touched),
        ...(action.updates.errors !== undefined ? { errors: action.updates.errors } : {}),
        ...(action.updates.isSubmitting !== undefined ? { isSubmitting: action.updates.isSubmitting } : {}),
        ...(action.updates.lastValidated !== undefined ? { lastValidated: action.updates.lastValidated } : state.lastValidated)
      };
    default:
      return state;
  }
}

export function FormProvider<T>({
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
    lastValidated: null
  });
  
  // Destructure state for easier access
  const { values, touched, errors, isSubmitting, lastValidated } = state;
  
  // Using useRef instead of useState to avoid race conditions
  const mountedRef = React.useRef(false);
  
  // Keep track of pending setValue operations
  const pendingSetValueRef = React.useRef<Map<string, any>>(new Map());
  const setValueTimeoutRef = React.useRef<number | null>(null);

  const getValuePaths = useCallback(
    (basePath: (string | number)[] = []) => {
      const paths: (string | number)[][] = [];

      // Recursively gather all paths
      const traverse = (obj: any, currentPath: (string | number)[]) => {
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
        lastValidated: now
      }
    });
    
    return result;
  }, [schema, values, dispatch]);

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
  }, [getValuePaths, validateForm]);

  // Define wrapper functions for dispatch
  const setTouched = useCallback((touchedOrUpdater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => {
    if (typeof touchedOrUpdater === 'function') {
      const updater = touchedOrUpdater;
      dispatch({
        type: 'SET_TOUCHED',
        touched: updater(touched)
      });
    } else {
      dispatch({
        type: 'SET_TOUCHED',
        touched: touchedOrUpdater
      });
    }
  }, [touched, dispatch]);

  const setErrors = useCallback((errorsOrUpdater: ValidationError[] | ((prev: ValidationError[]) => ValidationError[])) => {
    if (typeof errorsOrUpdater === 'function') {
      const updater = errorsOrUpdater;
      dispatch({
        type: 'SET_ERRORS',
        errors: updater(errors)
      });
    } else {
      dispatch({
        type: 'SET_ERRORS',
        errors: errorsOrUpdater
      });
    }
  }, [errors, dispatch]);

  const setValues = useCallback((valuesOrUpdater: T | ((prev: T) => T)) => {
    if (typeof valuesOrUpdater === 'function') {
      const updater = valuesOrUpdater;
      dispatch({
        type: 'SET_VALUES',
        values: updater(values)
      });
    } else {
      dispatch({
        type: 'SET_VALUES',
        values: valuesOrUpdater
      });
    }
  }, [values, dispatch]);

  const setIsSubmitting = useCallback((isSubmitting: boolean) => {
    dispatch({
      type: 'SET_SUBMITTING',
      isSubmitting
    });
  }, [dispatch]);

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
    (path: (string | number)[]) => {
      return getValueAtPath(values, path);
    },
    [values]
  );

  // Helper function to create a new touched state with a path marked as touched
  const markPathAsTouched = useCallback((touched: Record<string, boolean>, path: (string | number)[]) => {
    const newTouched = { ...touched };
    // Mark the field itself
    newTouched[path.join('.')] = true;

    // Mark all parent paths
    for (let i = 1; i <= path.length; i++) {
      const parentPath = path.slice(0, i);
      newTouched[parentPath.join('.')] = true;
    }
    return newTouched;
  }, []);

  // Helper function to filter errors for a specific path
  const filterErrorsForPath = useCallback((errors: ValidationError[], path: (string | number)[]) => {
    return errors.filter(
      (error) =>
        error.path.length !== path.length ||
        !error.path.every((val, idx) => path[idx] === val)
    );
  }, []);

  // Helper function to validate a value at a path
  const validateValueAtPath = useCallback((newValues: T, path: (string | number)[]) => {
    if (!validateOnChange || !schema) return [];
    
    const result = validate(schema, newValues);
    if (!result.valid && result.errors) {
      // Only add new validation errors for this exact path
      return result.errors.filter(
        (error) =>
          error.path.length === path.length &&
          error.path.every((val, idx) => path[idx] === val)
      );
    }
    return [];
  }, [validateOnChange, schema]);

  // Queue setValue operations to be processed in a batch
  const queueSetValue = useCallback((path: (string | number)[], value: any) => {
    // Store the path as a string key
    const pathKey = path.join('.');
    pendingSetValueRef.current.set(pathKey, { path, value });
    
    // Clear any existing timeout
    if (setValueTimeoutRef.current) {
      clearTimeout(setValueTimeoutRef.current);
    }
    
    // Process all pending setValue operations in the next tick
    setValueTimeoutRef.current = setTimeout(() => {
      const pendingOperations = Array.from(pendingSetValueRef.current.values());
      pendingSetValueRef.current.clear();
      
      if (pendingOperations.length === 0) return;
      
      // Create a new values object with all updates
      const newValues = { ...values };
      let newTouched = { ...touched };
      let newErrors = [...errors];
      
      // Apply all pending setValue operations
      for (const { path, value } of pendingOperations) {
        // Update values
        setValueAtPath(newValues, path, value);
        
        // Mark path as touched
        newTouched = markPathAsTouched(newTouched, path);
        
        // Filter out errors for this path
        newErrors = filterErrorsForPath(newErrors, path);
      }
      
      // Validate the new values
      if (validateOnChange && schema) {
        const result = validate(schema, newValues);
        if (!result.valid && result.errors) {
          // Add validation errors for all updated paths
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
          lastValidated: Date.now()
        }
      });
    }, 0);
  }, [values, touched, errors, markPathAsTouched, filterErrorsForPath, validateOnChange, schema]);

  // The setValue function that users will call
  const setValue = useCallback(
    (path: (string | number)[], value: any) => {
      queueSetValue(path, value);
    },
    [queueSetValue]
  );

  // Helper to get all nested paths under a base path
  const getNestedPaths = useCallback(
    (basePath: (string | number)[]) => {
      const paths: (string | number)[][] = [];
      const traverse = (obj: any, currentPath: (string | number)[]) => {
        paths.push([...currentPath]);
        if (obj && typeof obj === 'object') {
          for (const [key, value] of Object.entries(obj)) {
            traverse(value, [...currentPath, key]);
          }
        }
      };
      const value = getValueAtPath(values, basePath);
      traverse(value, basePath);
      return paths;
    },
    [values]
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
        const array = parent as any[];
        
        // Create a new array without the deleted item
        const newItems = array.filter((_, i) => i !== arrayIndex);
        
        // Create a new values object with the updated array
        const newValues = { ...values };
        setValueAtPath(newValues, parentPath, newItems);
        
        // Create a new touched state with the deleted item removed
        const newTouched = { ...touched };
        
        // Remove touched states for the deleted item and its children
        // and adjust indices for items after the deleted one
        Object.keys(newTouched).forEach(key => {
          const keyPath = key.split('.');
          
          // Check if this key is related to the array we're modifying
          if (keyPath.length > parentPath.length && 
              parentPath.every((val, idx) => String(val) === keyPath[idx])) {
            
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
        const newErrors = errors.filter(error => {
          // Keep errors not related to this array
          if (!error.path.slice(0, parentPath.length).every((val, idx) => parentPath[idx] === val)) {
            return true;
          }
          
          // If this is an error for the array itself, keep it
          if (error.path.length <= parentPath.length) {
            return true;
          }
          
          const errorIndex = Number(error.path[parentPath.length]);
          
          // Remove errors for the deleted item
          if (!isNaN(errorIndex) && errorIndex === arrayIndex) {
            return false;
          }
          
          return true;
        }).map(error => {
          // Adjust indices for errors on items after the deleted one
          if (error.path.length > parentPath.length && 
              error.path.slice(0, parentPath.length).every((val, idx) => parentPath[idx] === val)) {
            
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
              error => 
                error.path.length >= parentPath.length &&
                error.path.slice(0, parentPath.length).every((val, idx) => parentPath[idx] === val)
            );
            
            // Merge with existing errors, avoiding duplicates
            const existingPaths = newErrors.map(e => e.path.join('.'));
            const newArrayErrors = arrayErrors.filter(
              e => !existingPaths.includes(e.path.join('.'))
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
            lastValidated: Date.now()
          }
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
          const parentObj = parentPath.reduce<Record<string | number, any>>(
            (acc, key) => {
              if (acc && typeof acc === 'object') {
                return acc[key] || {};
              }
              return {};
            },
            newValues as Record<string | number, any>
          );

          if (parentObj && typeof parentObj === 'object') {
            delete parentObj[lastKey];
          }
        }
        
        // Create a new touched state with all related touched states removed
        const newTouched = { ...touched };
        const pathPrefix = path.join('.') + '.';
        
        // Remove touched state for the deleted field and all its children
        Object.keys(newTouched).forEach(key => {
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
        const newErrors = errors.filter(error => {
          // Keep errors not related to this path
          if (error.path.length < path.length) {
            return true;
          }
          
          // Remove errors for the deleted field and its children
          return !error.path.slice(0, path.length).every(
            (val, idx) => path[idx] === val
          );
        });
        
        // Validate the form after deletion
        let finalErrors = newErrors;
        if (validateOnChange && schema) {
          const result = validate(schema, newValues);
          if (!result.valid && result.errors) {
            // Only add new validation errors for the parent path
            const parentErrors = result.errors.filter(
              error => 
                error.path.length >= parentPath.length &&
                error.path.slice(0, parentPath.length).every((val, idx) => parentPath[idx] === val)
            );
            
            // Merge with existing errors, avoiding duplicates
            const existingPaths = newErrors.map(e => e.path.join('.'));
            const newParentErrors = parentErrors.filter(
              e => !existingPaths.includes(e.path.join('.'))
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
            lastValidated: Date.now()
          }
        });
      }
    },
    [values, touched, errors, dispatch, validateOnChange, schema]
  );

  const hasField = useCallback(
    (path: (string | number)[]) => {
      // Use a more robust check to determine if a field exists
      let current = values;
      for (let i = 0; i < path.length; i++) {
        if (current === undefined || current === null) return false;
        if (typeof current !== 'object') return false;
        
        const key = path[i];
        // Check if the key exists in the object using hasOwnProperty
        if (!Object.prototype.hasOwnProperty.call(current, key)) {
          return false;
        }
        current = current[key];
      }
      return true;
    },
    [values]
  );

  const pathExists = useCallback(
    (path: (string | number)[]) => {
      let current = values;
      for (let i = 0; i < path.length; i++) {
        if (current === undefined || current === null) return false;
        if (typeof path[i] === 'number' && !Array.isArray(current))
          return false;
        current = current[path[i]];
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

  const submit = useCallback(async () => {
    if (!onSubmit) return;

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
        await onSubmit(contextValue, values);
      } else if (result.errors) {
        setErrors((prev) => {
          const serverErrors = prev.filter((e) => e.source === 'server');
          return [...serverErrors, ...result.errors];
        });
      }
    } catch (error: any) {
      // Only log unexpected errors
      console.error('Unexpected form submission error:', error);
      setErrors([
        {
          path: [],
          message: error.message || 'An unexpected error occurred',
          source: 'server',
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }, [onSubmit, values, validateForm, getValuePaths, schema]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setTouched({});
    setErrors([]);
  }, [initialValues]);

  const contextValue: FormContextValue<T> = {
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
      // If message is null, clear server errors at this path
      if (message === null) {
        setErrors((prev) =>
          prev.filter(
            (error) =>
              error.source !== 'server' ||
              error.path.length !== path.length ||
              !error.path.every((val, idx) => path[idx] === val)
          )
        );
        return;
      }

      const messages = Array.isArray(message) ? message : [message];

      // Only proceed if path exists (except for root errors)
      if (path.length > 0 && !pathExists(path)) return;

      setErrors((prev) => {
        // Remove existing server errors at the same exact path
        const otherErrors = prev.filter(
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

        return [...otherErrors, ...newErrors];
      });
    },
  };

  return (
    <FormContext.Provider value={contextValue}>{children}</FormContext.Provider>
  );
}

export function useFormContext<T>() {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context as FormContextValue<T>;
}

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
    setValue: (newValue: any) => {
      form.setValue(path, newValue);
      setTouched();
    },
    error,
    props: {
      value,
      onChange: (newValue: any) => form.setValue(path, newValue),
      errorText: error,
      onBlur: setTouched,
    },
  };
}

export function useArrayField(path: (string | number)[]) {
  const form = useFormContext();
  const items = form.getValue(path) || [];

  const add = useCallback(
    (item: any) => {
      const newItems = [...items, item];
      form.setValue(path, newItems);
    },
    [form, items, path]
  );

  const remove = useCallback(
    (index: number) => {
      // Use the shared deleteArrayItem helper function
      form.deleteField([...path, index]);
    },
    [form, path]
  );

  const move = useCallback(
    (from: number, to: number) => {
      // Validate indices
      if (
        from < 0 ||
        from >= items.length ||
        to < 0 ||
        to >= items.length ||
        from === to
      ) {
        return;
      }

      // Create new array with moved item
      const newItems = [...items];
      const [item] = newItems.splice(from, 1);
      newItems.splice(to, 0, item);

      // Update touched states
      form.setTouched((prev) => {
        const newTouched = { ...prev };

        // Get all touched paths under both indices
        const fromPaths = Object.keys(prev).filter((key) => {
          const keyPath = key.split('.');
          return keyPath.slice(0, path.length + 1).every((val, idx) => {
            if (idx === path.length) return val === String(from);
            return path[idx] === val;
          });
        });

        const toPaths = Object.keys(prev).filter((key) => {
          const keyPath = key.split('.');
          return keyPath.slice(0, path.length + 1).every((val, idx) => {
            if (idx === path.length) return val === String(to);
            return path[idx] === val;
          });
        });

        // Store the touched states we want to swap
        const fromTouched: Record<string, boolean> = {};
        const toTouched: Record<string, boolean> = {};

        // Save from paths
        for (const key of fromPaths) {
          const keyPath = key.split('.');
          const relativePath = keyPath.slice(path.length + 1);
          const newKey = [...path, to, ...relativePath].join('.');
          fromTouched[newKey] = prev[key];
          delete newTouched[key];
        }

        // Save to paths
        for (const key of toPaths) {
          const keyPath = key.split('.');
          const relativePath = keyPath.slice(path.length + 1);
          const newKey = [...path, from, ...relativePath].join('.');
          toTouched[newKey] = prev[key];
          delete newTouched[key];
        }

        // Add back the swapped touched states
        return {
          ...newTouched,
          ...fromTouched,
          ...toTouched,
        };
      });

      // Update values
      form.setValue(path, newItems);

      // Handle validation and server errors separately
      const validationErrors = form.errors.filter((e) => e.source !== 'server');
      const serverErrors = form.errors.filter((e) => e.source === 'server');

      // Helper to adjust error paths
      const adjustErrorPaths = (errors: ValidationError[]) =>
        errors.map((error) => {
          if (
            !error.path
              .slice(0, path.length)
              .every((val, idx) => path[idx] === val)
          ) {
            return error;
          }

          const itemIndex = Number(error.path[path.length]);
          if (isNaN(itemIndex)) return error;

          let newIndex = itemIndex;
          if (itemIndex === from) {
            newIndex = to;
          } else if (from < to && itemIndex > from && itemIndex <= to) {
            newIndex = itemIndex - 1;
          } else if (from > to && itemIndex >= to && itemIndex < from) {
            newIndex = itemIndex + 1;
          }

          return newIndex === itemIndex
            ? error
            : {
                ...error,
                path: [...path, newIndex, ...error.path.slice(path.length + 1)],
              };
        });

      // Update errors while preserving their sources
      const newValidationErrors = adjustErrorPaths(validationErrors);
      const newServerErrors = adjustErrorPaths(serverErrors);
      form.setErrors([...newValidationErrors, ...newServerErrors]);
    },
    [form, items, path]
  );

  return { items, add, remove, move };
}
