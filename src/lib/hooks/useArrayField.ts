import { useCallback, useMemo } from 'react';
import { useFormContext } from './useFormContext';
import { ValidationError } from '../zod-helpers';

export function useArrayField(path: (string | number)[]) {
  const form = useFormContext();
  const items = useMemo(() => {
    const value = form.getValue(path);
    return Array.isArray(value) ? value : [];
  }, [form, path]);

  const add = useCallback(
    (item: unknown) => {
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

      // First update values
      form.setValue(path, newItems);

      // Get all touched paths under both indices to determine what needs to be updated
      const currentTouched = form.touched;

      // Find all touched paths for the 'from' index
      const fromTouchedPaths: Array<{
        originalPath: (string | number)[];
        relativePath: (string | number)[];
      }> = [];

      // Find all touched paths for the 'to' index
      const toTouchedPaths: Array<{
        originalPath: (string | number)[];
        relativePath: (string | number)[];
      }> = [];

      // Collect all paths we need to process
      Object.keys(currentTouched).forEach((touchedKey) => {
        const keyPath = touchedKey
          .split('.')
          .map((part) => (!isNaN(Number(part)) ? Number(part) : part));

        if (
          keyPath.length > path.length &&
          keyPath
            .slice(0, path.length)
            .every((val, idx) => String(val) === String(path[idx]))
        ) {
          // This is a touched path under our array
          const itemIndex = keyPath[path.length];
          const relativePath = keyPath.slice(path.length + 1);

          if (itemIndex === from) {
            fromTouchedPaths.push({
              originalPath: keyPath,
              relativePath,
            });
          } else if (itemIndex === to) {
            toTouchedPaths.push({
              originalPath: keyPath,
              relativePath,
            });
          }
        }
      });

      // Now mark paths as touched using the new API
      // From paths should be marked at the 'to' position
      fromTouchedPaths.forEach(({ relativePath }) => {
        const newPath = [...path, to, ...relativePath];
        form.setFieldTouched(newPath, true);
      });

      // To paths should be marked at the 'from' position
      toTouchedPaths.forEach(({ relativePath }) => {
        const newPath = [...path, from, ...relativePath];
        form.setFieldTouched(newPath, true);
      });

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
