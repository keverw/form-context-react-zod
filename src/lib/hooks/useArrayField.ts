import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext } from './useFormContext';
import { deserializePath, generateID, serializePath } from '../utils';

/**
 * Ergonomic helpers for an array field. The reorder ops (move/swap/insert/
 * prepend/replace) delegate to the context's `reindexArray` primitive, which
 * atomically updates the values AND re-indexes the item metadata (touched,
 * validation + server errors) in a single dispatch. The hook's job is just to
 * compute the new array and the old->new index map for each operation.
 *
 * Also returns `arrayFieldIDs`: a stable key per item. Use it as the React `key`
 * instead of the array index so React keeps the right instance (input focus/cursor,
 * uncontrolled state) when items reorder. The ids stay correct no matter HOW the
 * array changes: the context broadcasts every structural change (with the old->new
 * index map for reorders/inserts/removes, or a re-mint signal for a wholesale
 * `setValue`/`reset`), and this hook applies it. So even a direct
 * `form.deleteField([...path, i])` from elsewhere keeps the ids aligned.
 */
export function useArrayField(path: (string | number)[]) {
  const form = useFormContext();
  const items = useMemo(() => {
    const value = form.getValue(path);
    return Array.isArray(value) ? value : [];
  }, [form, path]);
  const key = serializePath(path);

  // Stable ids parallel to `items`. Updated by the structural-change subscription
  // below; the render-time length check is a safety net (and how a `reset-all`
  // re-mints — it clears the ids, which this then refills for the new items).
  const [arrayFieldIDs, setArrayFieldIDs] = useState<string[]>(() =>
    items.map(() => generateID())
  );
  if (arrayFieldIDs.length !== items.length) {
    const next = arrayFieldIDs.slice(0, items.length);
    while (next.length < items.length) next.push(generateID());
    setArrayFieldIDs(next);
  }

  // Subscribe to structural array changes so ids follow items regardless of which
  // mutation path (hook op OR a direct context call) changed the array.
  const { subscribeArrayStructure } = form;
  useEffect(() => {
    // Derive our path from `key` (the stable dep) rather than closing over the
    // `path` array, whose reference changes every render.
    const myPath = deserializePath(key);
    return subscribeArrayStructure((change) => {
      if (change.kind === 'reset-all') {
        // Form-wide reset: drop the ids; the render-time check re-mints to fit.
        setArrayFieldIDs([]);
        return;
      }
      if (change.kind === 'reset-subtree') {
        // A wholesale setValue at `change.path`. If our array lives at or under it
        // (e.g. a parent object was replaced), its old ids no longer map — re-mint.
        const p = change.path;
        const atOrUnder =
          p.length <= myPath.length && p.every((val, i) => myPath[i] === val);
        if (atOrUnder) setArrayFieldIDs([]);
        return;
      }
      // From here it's a `reindex`. Two ways it can affect us:
      const cp = change.path;

      // (a) It's OUR array — re-index our ids precisely: each old id lands at its
      // new index (dropped if the map returns null); any new slot gets a fresh id.
      if (serializePath(cp) === key) {
        setArrayFieldIDs((prev) => {
          const next = new Array<string | undefined>(change.newLength);
          prev.forEach((id, j) => {
            const nj = change.indexMap(j);
            if (nj !== null && nj >= 0 && nj < change.newLength) next[nj] = id;
          });
          for (let k = 0; k < change.newLength; k++) {
            if (next[k] === undefined) next[k] = generateID();
          }
          return next as string[];
        });
        return;
      }

      // (b) It's an ANCESTOR array (our array is nested inside one of its items,
      // e.g. our ['sections', 2, 'questions'] under a reordered ['sections']). Our
      // path is pinned to a fixed item index; if a *different* item now occupies
      // that index, our items changed identity, so re-mint. The occupant is
      // unchanged iff the index maps to itself.
      const isAncestor =
        cp.length < myPath.length && cp.every((val, i) => myPath[i] === val);
      if (isAncestor) {
        const myIndex = Number(myPath[cp.length]);
        if (!Number.isNaN(myIndex) && change.indexMap(myIndex) !== myIndex) {
          setArrayFieldIDs([]);
        }
      }
    });
  }, [subscribeArrayStructure, key]);

  // Append an item. Routed through reindexArray (identity map) so the existing ids
  // are kept and the new tail slot gets a fresh one (a plain setValue on the array
  // path would signal a full re-mint).
  const add = useCallback(
    (item: unknown) => {
      form.reindexArray(path, [...items, item], (j) => j);
    },
    [form, items, path]
  );

  // Remove the item at `index`. deleteField handles the array splice + metadata
  // and broadcasts the removal so the ids follow.
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

  // Swap two items; their metadata (and ids) follow them.
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
  // the new items, so the index map drops everything (null) — which also re-mints
  // the ids — and validation regenerates errors as fields are touched.
  const replace = useCallback(
    (newItems: unknown[]) => {
      form.reindexArray(path, newItems, () => null);
    },
    [form, path]
  );

  // Replace a single item in place. Sugar for setValue at the item path — setValue
  // already clears that field's own errors and (with validateOnChange)
  // re-validates. The item keeps its id (same slot; not a structural change).
  const update = useCallback(
    (index: number, item: unknown) => {
      if (index < 0 || index >= items.length) return;
      form.setValue([...path, index], item);
    },
    [form, items, path]
  );

  return {
    items,
    arrayFieldIDs,
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
