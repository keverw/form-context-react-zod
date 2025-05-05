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
    console.error('setValueAtPath called with empty path');
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
  } catch (error) {
    console.error('Failed to traverse path for setValueAtPath:', error);
    return; // Stop execution if path traversal fails
  }

  // Ensure parent is an object/array before assignment
  if (typeof parent === 'object' && parent !== null) {
    parent[lastKey] = value;
  } else {
    console.error(
      `Cannot set value at path '${path.join('.')}': parent element is not an object or array.`
    );
  }
}
