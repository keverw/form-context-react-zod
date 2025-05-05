import { useCallback } from 'react';
import { useFormContext } from './useFormContext';
import { ValidationError } from '../zod-helpers';

export function useArrayField(path: (string | number)[]) {
  const form = useFormContext();
  const items = form.getValue(path) || [];

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
