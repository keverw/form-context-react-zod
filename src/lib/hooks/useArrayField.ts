import { useCallback, useMemo } from 'react';
import { useFormContext } from './useFormContext';

/**
 * Ergonomic helpers for an array field. The reorder ops (move/swap/insert/
 * prepend/replace) delegate to the context's `reindexArray` primitive, which
 * atomically updates the values AND re-indexes the item metadata (touched,
 * validation + server errors) in a single dispatch. The hook's job is just to
 * compute the new array and the old->new index map for each operation.
 */
export function useArrayField(path: (string | number)[]) {
  const form = useFormContext();
  const items = useMemo(() => {
    const value = form.getValue(path);
    return Array.isArray(value) ? value : [];
  }, [form, path]);

  // Append an item. Nothing shifts, so no metadata re-indexing is needed.
  const add = useCallback(
    (item: unknown) => {
      form.setValue(path, [...items, item]);
    },
    [form, items, path]
  );

  // Remove the item at `index`. deleteField handles the array splice + metadata.
  const remove = useCallback(
    (index: number) => {
      form.deleteField([...path, index]);
    },
    [form, path]
  );

  // Move one item; intermediate items shift to fill the gap.
  const move = useCallback(
    (from: number, to: number) => {
      if (
        from < 0 ||
        from >= items.length ||
        to < 0 ||
        to >= items.length ||
        from === to
      ) {
        return;
      }
      const newItems = [...items];
      const [item] = newItems.splice(from, 1);
      newItems.splice(to, 0, item);
      form.reindexArray(path, newItems, (j) => {
        if (j === from) return to;
        if (from < to && j > from && j <= to) return j - 1;
        if (from > to && j >= to && j < from) return j + 1;
        return j;
      });
    },
    [form, items, path]
  );

  // Insert at `index` (clamped to [0, length]); items at/after it shift up.
  const insert = useCallback(
    (index: number, item: unknown) => {
      const i = Math.max(0, Math.min(index, items.length));
      const newItems = [...items.slice(0, i), item, ...items.slice(i)];
      form.reindexArray(path, newItems, (j) => (j >= i ? j + 1 : j));
    },
    [form, items, path]
  );

  // Insert at the front.
  const prepend = useCallback((item: unknown) => insert(0, item), [insert]);

  // Swap two items; their metadata follows them.
  const swap = useCallback(
    (a: number, b: number) => {
      if (a === b || a < 0 || b < 0 || a >= items.length || b >= items.length) {
        return;
      }
      const newItems = [...items];
      [newItems[a], newItems[b]] = [newItems[b], newItems[a]];
      form.reindexArray(path, newItems, (j) => (j === a ? b : j === b ? a : j));
    },
    [form, items, path]
  );

  // Replace the whole array. The old per-index metadata no longer corresponds to
  // the new items, so the index map drops everything (null); validation
  // regenerates errors as fields are touched.
  const replace = useCallback(
    (newItems: unknown[]) => {
      form.reindexArray(path, newItems, () => null);
    },
    [form, path]
  );

  // Replace a single item. Sugar for setValue at the item path — setValue already
  // clears that field's own errors and (with validateOnChange) re-validates.
  const update = useCallback(
    (index: number, item: unknown) => {
      if (index < 0 || index >= items.length) return;
      form.setValue([...path, index], item);
    },
    [form, items, path]
  );

  return {
    items,
    add,
    remove,
    move,
    insert,
    prepend,
    swap,
    replace,
    update,
  };
}
