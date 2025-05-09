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

// Helper function to generate a identifier for the current submission
export function generateID(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
