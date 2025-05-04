import React, { createContext, useContext, useState, useCallback } from 'react';
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
  submit: () => Promise<void>;
  reset: () => void;
  validate: (force?: boolean) => boolean;
  getValue: <V = any>(path: (string | number)[]) => V;
  setValue: <V = any>(path: (string | number)[], value: V) => void;
  deleteValue: (path: (string | number)[]) => void;
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

export function FormProvider<T>({
  initialValues,
  onSubmit,
  schema,
  validateOnMount = false,
  validateOnChange = true,
  children,
}: FormProviderProps<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Using useRef instead of useState to avoid race conditions
  const mountedRef = React.useRef(false);

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
    if (!schema) return { valid: true, value: values };
    return validate(schema, values);
  }, [schema, values]);

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

  const setValue = useCallback(
    (path: (string | number)[], value: any) => {
      const newValues = { ...values };
      setValueAtPath(newValues, path, value);
      setValues(newValues);

      // Mark field and all parent paths as touched when set via API
      setTouched((prev) => {
        const newTouched = { ...prev };
        // Mark the field itself
        newTouched[path.join('.')] = true;

        // Mark all parent paths
        for (let i = 1; i <= path.length; i++) {
          const parentPath = path.slice(0, i);
          newTouched[parentPath.join('.')] = true;
        }
        return newTouched;
      });

      // Keep all errors except those for this exact path
      const newErrors = errors.filter(
        (error) =>
          error.path.length !== path.length ||
          !error.path.every((val, idx) => path[idx] === val)
      );

      // Run validation if enabled
      if (validateOnChange && schema) {
        const result = validate(schema, newValues);
        if (!result.valid && result.errors) {
          // Only add new validation errors for this exact path
          const newValidationErrors = result.errors.filter(
            (error) =>
              error.path.length === path.length &&
              error.path.every((val, idx) => path[idx] === val)
          );

          setErrors([...newErrors, ...newValidationErrors]);
        } else {
          setErrors(newErrors);
        }
      } else {
        setErrors(newErrors);
      }
    },
    [validateOnChange, schema, values, errors]
  );

  const deleteValue = useCallback(
    (path: (string | number)[]) => {
      // Remove from touched state
      const pathKey = path.join('.');
      setTouched((prev) => {
        const newTouched = { ...prev };
        delete newTouched[pathKey];
        return newTouched;
      });

      // Get parent path and last key
      const lastKey = path[path.length - 1];
      const parentPath = path.slice(0, -1);

      // Check if we're deleting from an array
      let isArrayItem = false;
      let arrayIndex = -1;

      setValues((prev) => {
        const newValues = { ...prev };
        const parent = parentPath.reduce((acc, key) => acc?.[key], newValues);

        if (parent && typeof parent === 'object') {
          if (Array.isArray(parent)) {
            isArrayItem = true;
            arrayIndex = Number(lastKey);
            parent.splice(arrayIndex, 1);
          } else {
            delete parent[lastKey];
          }
        }
        return newValues;
      });

      // Handle errors - need to adjust indices for array items
      setErrors((prev) => {
        if (isArrayItem && arrayIndex >= 0) {
          // For array items, we need to adjust indices for items after the deleted one
          return prev
            .filter((error) => {
              // Keep errors not related to this path
              if (
                !error.path
                  .slice(0, parentPath.length)
                  .every((val, idx) => parentPath[idx] === val)
              ) {
                return true;
              }

              // If this is an error for the array itself or a different index, keep it
              if (
                error.path.length <= parentPath.length ||
                error.path[parentPath.length] !== arrayIndex
              ) {
                return true;
              }

              // Otherwise, this is an error for the deleted item, so remove it
              return false;
            })
            .map((error) => {
              // If this error is for an item after the deleted one, adjust its index
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
        } else {
          // For non-array items, just filter out errors for this path
          return prev.filter(
            (error) => !error.path.every((val, idx) => path[idx] === val)
          );
        }
      });

      // Validate if needed
      if (validateOnChange) {
        const result = validateForm();
        if (!result.valid && result.errors) {
          setErrors((prev) => {
            const serverErrors = prev.filter((e) => e.source === 'server');
            return [...serverErrors, ...result.errors];
          });
        }
      }
    },
    [validateOnChange, validateForm]
  );

  // Add hasField method to check field existence
  const hasField = useCallback(
    (path: (string | number)[]) => {
      const value = getValueAtPath(values, path);
      return value !== undefined;
    },
    [values]
  );

  // Helper to check if a path exists in the form values
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
          return [...serverErrors, ...result.errors];
        });
      }
      return result.valid;
    },
    getValue,
    setValue,
    deleteValue,
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
  const { setTouched, validate: validateForm } = form;

  // Helper to get all nested paths under a base path
  const getNestedPaths = useCallback(
    (basePath: (string | number)[]) => {
      const paths: (string | number)[][] = [];
      const traverse = (obj: any, currentPath: (string | number)[]) => {
        paths.push(currentPath);
        if (obj && typeof obj === 'object') {
          for (const [key, value] of Object.entries(obj)) {
            traverse(value, [...currentPath, key]);
          }
        }
      };
      const value = form.getValue(basePath);
      traverse(value, basePath);
      return paths;
    },
    [form]
  );

  const add = useCallback(
    (item: any) => {
      const newItems = [...items, item];
      form.setValue(path, newItems);
    },
    [form, items, path]
  );

  const remove = useCallback(
    (index: number) => {
      const newItems = items.filter((_: any, i: number) => i !== index);
      const removedPath = [...path, index];

      // Get all nested paths for the removed item
      const pathsToRemove = getNestedPaths(removedPath);

      // Clear touched state for all removed paths
      form.setTouched((prev) => {
        const newTouched = { ...prev };

        // Remove touched states for the deleted item and its children
        for (const removePath of pathsToRemove) {
          delete newTouched[removePath.join('.')];
        }

        // Adjust touched states for remaining items
        for (const [key, value] of Object.entries(prev)) {
          const keyPath = key.split('.');
          if (
            !keyPath
              .slice(0, path.length)
              .every((val, idx) => path[idx] === val)
          ) {
            continue;
          }
          const arrayIndex = Number(keyPath[path.length]);
          if (!isNaN(arrayIndex) && arrayIndex > index) {
            const newKey = [
              ...keyPath.slice(0, path.length),
              String(arrayIndex - 1),
              ...keyPath.slice(path.length + 1),
            ].join('.');
            newTouched[newKey] = value;
            delete newTouched[key];
          }
        }
        return newTouched;
      });

      // Update values and trigger validation
      form.setValue(path, newItems);

      // Handle errors separately for validation and server errors
      const validationErrors = form.errors.filter((e) => e.source !== 'server');
      const serverErrors = form.errors.filter((e) => e.source === 'server');

      // Process validation errors
      const newValidationErrors = validationErrors
        .filter((error) => {
          const errorPath = error.path;
          // Keep errors not related to this array
          if (
            !errorPath
              .slice(0, path.length)
              .every((val, idx) => path[idx] === val)
          ) {
            return true;
          }
          const errorIndex = Number(errorPath[path.length]);
          // Remove errors for deleted item
          return isNaN(errorIndex) || errorIndex !== index;
        })
        .map((error) => {
          const errorIndex = Number(error.path[path.length]);
          if (!isNaN(errorIndex) && errorIndex > index) {
            // Adjust index for remaining items
            return {
              ...error,
              path: [
                ...path,
                errorIndex - 1,
                ...error.path.slice(path.length + 1),
              ],
            };
          }
          return error;
        });

      // Process server errors
      const newServerErrors = serverErrors
        .filter((error) => {
          const errorPath = error.path;
          // Keep root errors and errors not related to this array
          if (
            errorPath.length === 0 ||
            !errorPath
              .slice(0, path.length)
              .every((val, idx) => path[idx] === val)
          ) {
            return true;
          }
          const errorIndex = Number(errorPath[path.length]);
          // Remove errors for deleted item
          return isNaN(errorIndex) || errorIndex !== index;
        })
        .map((error) => {
          const errorIndex = Number(error.path[path.length]);
          if (!isNaN(errorIndex) && errorIndex > index) {
            // Adjust index for remaining items
            return {
              ...error,
              path: [
                ...path,
                errorIndex - 1,
                ...error.path.slice(path.length + 1),
              ],
            };
          }
          return error;
        });

      // Update errors while preserving their sources
      form.setErrors([...newValidationErrors, ...newServerErrors]);
    },
    [form, getNestedPaths, items, path]
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
