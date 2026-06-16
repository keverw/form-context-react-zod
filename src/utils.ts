/**
 * Safely serializes a path array into a string that can be used as a map key
 * without risk of collisions even if path segments contain special characters.
 *
 * @param path An array of path segments (strings or numbers)
 * @returns A string representation of the path that can be safely used as a map key
 */

export function serializePath(path: (string | number)[]): string {
  return JSON.stringify(path);
}

/**
 * Deserializes a path string back into an array of path segments
 *
 * @param serialized The serialized path string
 * @returns The original path array
 */

export function deserializePath(serialized: string): (string | number)[] {
  return JSON.parse(serialized);
}

// Helper to get a value at a path
export function getValueAtPath(
  obj: unknown,
  path: (string | number)[]
): unknown {
  // Need to handle non-object types during reduction
  return path.reduce(
    (acc: unknown, key: string | number): unknown => {
      // Check if acc is indexable
      if (typeof acc === 'object' && acc !== null) {
        // Check if key is a valid index type for acc
        if (Array.isArray(acc) && typeof key === 'number') {
          return acc[key];
        } else if (!Array.isArray(acc) && typeof key === 'string') {
          // Use 'in' operator for safer access on potential objects
          return key in acc ? (acc as Record<string, unknown>)[key] : undefined;
        } else if (
          !Array.isArray(acc) &&
          typeof key === 'number'
          // Consider converting number key to string if needed: key = String(key)
        ) {
          // Allow number access on non-arrays? Use 'in' operator for safety.
          return String(key) in acc
            ? (acc as Record<string, unknown>)[String(key)]
            : undefined;
        }
      }
      // If acc is not an object or key is invalid type, return undefined
      return undefined;
    },
    obj // Start with the initial object
  );
}

// Helper to set a value at a path
export function setValueAtPath<T extends Record<string | number, unknown>>(
  obj: T,
  path: (string | number)[],
  value: unknown
): void {
  const keys = [...path]; // Clone path to avoid mutation issues if path is reused
  const lastKey = keys.pop();

  // If path is empty, cannot set value
  if (lastKey === undefined) {
    return;
  }

  // Need to assert the type of acc and parent
  let parent: Record<string | number, unknown> = obj;

  try {
    parent = keys.reduce(
      (acc: Record<string | number, unknown>, key: string | number, index) => {
        const currentVal = acc[key];
        if (
          currentVal === undefined ||
          currentVal === null ||
          typeof currentVal !== 'object'
        ) {
          // Determine if the next key implies an array or object
          const nextKey = keys[index + 1]; // Get the key *after* the current one
          // If the next key in the path is a number, we need an array here
          acc[key] = typeof nextKey === 'number' ? [] : {};
        }
        // Assert that acc[key] is now an object or array that can be indexed
        // Add a check to ensure it's not null before asserting
        const nextAcc = acc[key];
        if (typeof nextAcc === 'object' && nextAcc !== null) {
          return nextAcc as Record<string | number, unknown>;
        } else {
          // This case should ideally not be reached if the logic above is correct
          // but provides a safeguard.
          throw new Error(
            `Error setting deep value: path element '${key}' is not an object or array.`
          );
        }
      },
      obj
    ); // Start reduction with the original object
  } catch {
    // Failed to traverse path for setValueAtPath
    return; // Stop execution if path traversal fails
  }

  // Ensure parent is an object/array before assignment
  if (typeof parent === 'object' && parent !== null) {
    parent[lastKey] = value;
  } else {
    // Cannot set value at path as parent element is not an object or array.
    return;
  }
}

/**
 * Returns an appropriate empty value based on the type of the provided value
 * @param value The value to get an empty version of
 * @returns An empty version of the value with the same structure
 */
/**
 * Deep clones objects/arrays only along a specific path, creating new references
 * for each object in the path while leaving the rest of the object untouched.
 * This is more efficient than a full deep clone when you only need to modify
 * a specific nested property.
 *
 * @param obj The object to clone along a path
 * @param path The path to clone along
 * @returns The original object with new references created along the specified path
 */
export function cloneAlongPath<T extends Record<string | number, unknown>>(
  obj: T,
  path: (string | number)[]
): T {
  if (path.length === 0) return obj;

  // Create a shallow copy of the root object
  const result = { ...obj };

  // Clone each object along the path
  let cursor: Record<string | number, unknown> = result;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    const next = cursor[segment];

    // Only clone if next is an object or array
    if (next !== null && typeof next === 'object') {
      // Preserve arrays vs. objects
      cursor[segment] = Array.isArray(next)
        ? [...next]
        : { ...(next as Record<string | number, unknown>) };
    }

    // Move to the next level (ensuring it's an object)
    const nextObj = cursor[segment];
    if (nextObj !== null && typeof nextObj === 'object') {
      cursor = nextObj as Record<string | number, unknown>;
    } else {
      // If not an object, create one to continue the path
      cursor[segment] = {};
      cursor = cursor[segment] as Record<string | number, unknown>;
    }
  }

  return result;
}

export function getEmptyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    // For arrays, simply return an empty array
    return [];
  } else if (value instanceof Date) {
    // Terminal leaf: don't recurse into a Date's (zero) own keys, which would
    // wrongly yield {}. Clear to null, matching isPlainObject's treatment of Date.
    return null;
  } else if (typeof value === 'object' && value !== null) {
    // For objects, preserve the structure but set each property to its empty value
    const emptyObj: Record<string | number, unknown> = {};

    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const propValue = value[key as keyof typeof value];
        emptyObj[key] = getEmptyValue(propValue);
      }
    }

    return emptyObj;
  } else if (typeof value === 'number') {
    return 0;
  } else if (typeof value === 'boolean') {
    return false;
  } else {
    // For strings and any other types, return empty string
    return '';
  }
}

/**
 * Whether a value counts as "empty" for a field — equal to what getEmptyValue
 * would produce for its type (empty string, 0, false, [], {}). Used to decide
 * which fields to mark touched on mount (by default only populated ones).
 */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value === '';
  if (typeof value === 'number') return value === 0;
  if (typeof value === 'boolean') return value === false;
  if (Array.isArray(value)) return value.length === 0;
  // A Date is a terminal leaf, never "empty" — guard before the generic object
  // branch, whose Object.keys check would treat a populated Date as empty and
  // hide its validation error on validateOnMount.
  if (value instanceof Date) return false;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// Helper function to generate a identifier for the current submission
export function generateID(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Structural deep equality for form values (JSON-ish data plus Date). Used to
 * derive `isDirty`/`dirtyFields` by comparing current values against a baseline.
 * Treats `NaN === NaN` as equal and compares Dates by timestamp; arrays and plain
 * objects are compared element/key-wise. Not intended for class instances, Maps,
 * Sets, or functions (form values shouldn't contain them).
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Past the identity check, differing types can never be equal.
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (typeof a === 'number' && typeof b === 'number') {
    // a === b already failed above, so the only remaining equal case is NaN/NaN.
    return Number.isNaN(a) && Number.isNaN(b);
  }

  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Whether a value is a "plain object" we recurse INTO for path-based work:
 * a non-null object that isn't an array or a Date. Arrays and Dates are treated
 * as terminal field values, not containers to descend.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Flattens a values object into its leaf `[path, value]` pairs. A "leaf" is any
 * non-plain-object: primitives, null, Date, AND arrays (an array is treated as a
 * single leaf value, replaced wholesale rather than merged index-by-index). Used
 * to apply a server-returned record as a batch of baseline updates.
 */
export function flattenLeaves(
  obj: unknown,
  prefix: (string | number)[] = []
): Array<[(string | number)[], unknown]> {
  if (!isPlainObject(obj)) {
    return [[prefix, obj]];
  }

  const out: Array<[(string | number)[], unknown]> = [];
  for (const key of Object.keys(obj)) {
    out.push(...flattenLeaves(obj[key], [...prefix, key]));
  }
  return out;
}

/**
 * Computes the per-field dirty map between `values` and a `baseline`, keyed by
 * serialized path (same shape as `touched`). Semantics:
 *
 * - **Plain objects** are compared key-precise — only the leaf paths that
 *   actually differ appear, so editing `a.b` doesn't flag `a.c`.
 * - **Arrays are compared as a unit.** If an array differs from the baseline in
 *   ANY way — a content edit, an add/remove, or a **reorder** — the array's own
 *   path AND every field path beneath it (recursively, through nested
 *   arrays/objects) are marked dirty. No attempt is made to attribute the change
 *   to specific items, because array indices aren't stable identities (a prepend
 *   would otherwise falsely flag every later row).
 *
 * Unchanged subtrees short-circuit on reference equality, so typical edits cost
 * O(path depth) rather than O(form size): `setValue` clones only along the edited
 * path, leaving sibling subtrees referentially identical to the baseline.
 */
export function diffDirtyFields(
  values: unknown,
  baseline: unknown
): Record<string, boolean> {
  const result: Record<string, boolean> = {};

  // Mark `val` and everything under it dirty: array paths and primitive leaves
  // get a key; plain-object container paths don't (they're structure, not fields).
  const markAll = (val: unknown, path: (string | number)[]): void => {
    if (Array.isArray(val)) {
      if (path.length) result[serializePath(path)] = true;
      val.forEach((item, i) => markAll(item, [...path, i]));
    } else if (isPlainObject(val)) {
      for (const key of Object.keys(val)) markAll(val[key], [...path, key]);
    } else if (path.length) {
      result[serializePath(path)] = true;
    }
  };

  const walk = (
    cur: unknown,
    base: unknown,
    path: (string | number)[]
  ): void => {
    if (cur === base) return; // identical reference -> whole subtree is clean
    if (isPlainObject(cur) && isPlainObject(base)) {
      const keys = new Set([...Object.keys(cur), ...Object.keys(base)]);
      for (const key of keys) walk(cur[key], base[key], [...path, key]);
      return;
    }
    // A comparison unit: array, primitive, Date, or a type mismatch. If it differs,
    // mark it (and — for arrays — its whole subtree) dirty.
    if (!deepEqual(cur, base)) markAll(cur, path);
  };

  walk(values, baseline, []);
  return result;
}
