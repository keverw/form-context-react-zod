import { describe, it, expect } from 'bun:test';
import {
  getValueAtPath,
  setValueAtPath,
  getEmptyValue,
  serializePath,
  deserializePath,
  cloneAlongPath,
  generateID,
  isEmptyValue,
  deepEqual,
  flattenLeaves,
  diffDirtyFields,
} from './utils';

describe('utils', () => {
  describe('getValueAtPath', () => {
    it('should get a value from a simple object path', () => {
      const obj = { name: 'John', age: 30 };
      expect(getValueAtPath(obj, ['name'])).toBe('John');
      expect(getValueAtPath(obj, ['age'])).toBe(30);
    });

    it('should get a value from a nested object path', () => {
      const obj = {
        user: {
          name: 'John',
          contact: {
            email: 'john@example.com',
          },
        },
      };
      expect(getValueAtPath(obj, ['user', 'name'])).toBe('John');
      expect(getValueAtPath(obj, ['user', 'contact', 'email'])).toBe(
        'john@example.com'
      );
    });

    it('should get a value from an array path', () => {
      const obj = { users: ['John', 'Jane', 'Bob'] };
      expect(getValueAtPath(obj, ['users', 0])).toBe('John');
      expect(getValueAtPath(obj, ['users', 2])).toBe('Bob');
    });

    it('should get a value from a complex nested path with arrays and objects', () => {
      const obj = {
        departments: [
          { name: 'Engineering', staff: ['Alice', 'Bob'] },
          { name: 'Marketing', staff: ['Charlie', 'Dave'] },
        ],
      };
      expect(getValueAtPath(obj, ['departments', 0, 'name'])).toBe(
        'Engineering'
      );
      expect(getValueAtPath(obj, ['departments', 1, 'staff', 0])).toBe(
        'Charlie'
      );
    });

    it('should return undefined for non-existent paths', () => {
      const obj = { user: { name: 'John' } };
      expect(getValueAtPath(obj, ['user', 'age'])).toBeUndefined();
      expect(getValueAtPath(obj, ['company'])).toBeUndefined();
    });

    it('should handle non-object values gracefully', () => {
      expect(getValueAtPath(null, ['key'])).toBeUndefined();
      expect(getValueAtPath(undefined, ['key'])).toBeUndefined();
      expect(getValueAtPath(42, ['key'])).toBeUndefined();
      expect(getValueAtPath('string', ['key'])).toBeUndefined();
    });

    it('should access object properties using number keys', () => {
      // Object with string keys that are numeric
      const obj = {
        '0': 'zero',
        '1': 'one',
        '2': 'two',
        other: 'value',
      };

      // Using number keys to access string properties
      expect(getValueAtPath(obj, [0])).toBe('zero');
      expect(getValueAtPath(obj, [1])).toBe('one');
      expect(getValueAtPath(obj, [2])).toBe('two');

      // Nested object with numeric keys
      const nestedObj = {
        users: {
          '42': { name: 'Douglas Adams' },
          '7': { name: 'Lucky Seven' },
        },
      };

      expect(getValueAtPath(nestedObj, ['users', 42, 'name'])).toBe(
        'Douglas Adams'
      );
      expect(getValueAtPath(nestedObj, ['users', 7, 'name'])).toBe(
        'Lucky Seven'
      );
    });
  });

  describe('setValueAtPath', () => {
    it('should set a value at a simple object path', () => {
      const obj: Record<string, unknown> = { name: 'John' };
      setValueAtPath(obj, ['age'], 30);
      expect(obj).toEqual({ name: 'John', age: 30 });
    });

    it('should set a value at a nested object path', () => {
      const obj: Record<string, unknown> = { user: { name: 'John' } };
      setValueAtPath(obj, ['user', 'age'], 30);
      expect(obj).toEqual({ user: { name: 'John', age: 30 } });
    });

    it('should overwrite existing values', () => {
      const obj: Record<string, unknown> = { user: { name: 'John' } };
      setValueAtPath(obj, ['user', 'name'], 'Jane');
      expect(obj).toEqual({ user: { name: 'Jane' } });
    });

    it('should create nested objects if they do not exist', () => {
      const obj: Record<string, unknown> = {};
      setValueAtPath(obj, ['user', 'contact', 'email'], 'john@example.com');
      expect(obj).toEqual({
        user: {
          contact: {
            email: 'john@example.com',
          },
        },
      });
    });

    it('should create arrays when numeric path elements are encountered', () => {
      const obj: Record<string, unknown> = {};
      setValueAtPath(obj, ['users', 0, 'name'], 'John');
      expect(obj).toEqual({
        users: [{ name: 'John' }],
      });
    });

    it('should handle complex nested paths with mixed arrays and objects', () => {
      const obj: Record<string, unknown> = {};
      setValueAtPath(obj, ['departments', 0, 'staff', 1], 'Bob');
      setValueAtPath(obj, ['departments', 0, 'name'], 'Engineering');

      expect(obj).toEqual({
        departments: [
          {
            name: 'Engineering',
            staff: {
              '1': 'Bob',
            },
          },
        ],
      });
    });

    it('should not modify the object if the path is empty', () => {
      const obj: Record<string, unknown> = { name: 'John' };
      setValueAtPath(obj, [], 'value');
      expect(obj).toEqual({ name: 'John' });
    });

    it('should handle edge cases gracefully', () => {
      // Test with malformed path that has null/undefined elements
      const obj: Record<string, unknown> = {};
      const path: (string | number)[] = ['user', 'settings'];
      path.push('theme' as string);

      setValueAtPath(obj, path, 'dark');
      expect(obj).toEqual({
        user: {
          settings: {
            theme: 'dark',
          },
        },
      });
    });

    it('should replace non-object values when traversing the path', () => {
      // Create an object with a string at a path we'll try to traverse deeper
      const obj: Record<string, unknown> = {
        user: {
          profile: 'string value instead of an object',
        },
      };

      // Try to set a property on the string value - it should replace the string with an object
      setValueAtPath(obj, ['user', 'profile', 'name'], 'John');

      // The string should be replaced with an object
      expect(obj).toEqual({
        user: {
          profile: {
            name: 'John',
          },
        },
      });

      // Test with a number value
      const obj2: Record<string, unknown> = {
        count: 42,
      };

      setValueAtPath(obj2, ['count', 'value'], 100);

      // Number should be replaced with an object
      expect(obj2).toEqual({
        count: {
          value: 100,
        },
      });
    });

    it('should handle traversal errors gracefully with catch block', () => {
      // Create an object where accessing a property throws an error
      const obj = {
        get problematic() {
          throw new Error('Simulated error accessing property');
        },
      };

      // This should trigger the catch block in the traversal
      setValueAtPath(obj, ['problematic', 'something'], 'value');

      // Object should remain unchanged
      expect(Object.keys(obj)).toHaveLength(1);
      expect('problematic' in obj).toBe(true);
    });

    it('should handle case where parent is not an object or array before assignment', () => {
      // Create an object to simulate the case where the final check fails
      const obj: Record<string, unknown> = {
        test: null,
      };

      // This triggers the case where typeof parent === 'object' fails
      // but the traversal itself succeeded
      setValueAtPath(obj, ['test', 'property'], 'value');

      // It turns out null values are also replaced with objects during traversal
      // The code still handles the "parent not being an object" case, but it happens
      // through the traversal logic not the final check
      expect(obj).toEqual({
        test: {
          property: 'value',
        },
      });

      // Let's try with a primitive value instead
      const primitiveObj = {
        value: 123,
      };

      // The primitive check fails in the traversal not at final parent check
      setValueAtPath(primitiveObj, ['value', 'nested'], 'test');

      // The primitive gets replaced with an object too
      expect(primitiveObj as Record<string, unknown>).toEqual({
        value: {
          nested: 'test',
        },
      });
    });

    it('should handle errors when path element cannot be converted to object', () => {
      // Create an object with a property that can't be modified
      const obj: Record<string, unknown> = {};

      // Define a property that looks like an object but isn't actually traversable
      Object.defineProperty(obj, 'tricky', {
        value: 'not an object',
        writable: false,
        configurable: false,
      });

      // When we call setValueAtPath, it should catch the error internally
      // and just return without modifying the object
      setValueAtPath(obj, ['tricky', 'nested'], 'value');

      // Verify the object hasn't been modified
      expect(obj.tricky).toBe('not an object');
    });
  });

  describe('getEmptyValue', () => {
    it('should return an empty array for array values', () => {
      expect(getEmptyValue([1, 2, 3])).toEqual([]);
      expect(getEmptyValue(['a', 'b', 'c'])).toEqual([]);
      expect(getEmptyValue([])).toEqual([]);
    });

    it('should return 0 for numeric values', () => {
      expect(getEmptyValue(42)).toBe(0);
      expect(getEmptyValue(0)).toBe(0);
      expect(getEmptyValue(-10)).toBe(0);
    });

    it('should return false for boolean values', () => {
      expect(getEmptyValue(true)).toBe(false);
      expect(getEmptyValue(false)).toBe(false);
    });

    it('should return empty string for string values', () => {
      expect(getEmptyValue('hello')).toBe('');
      expect(getEmptyValue('')).toBe('');
    });

    it('should return null for null and undefined (no runtime type to infer)', () => {
      expect(getEmptyValue(null)).toBe(null);
      expect(getEmptyValue(undefined)).toBe(null);
    });

    it('should return an empty object with the same structure for object values', () => {
      const obj = { name: 'John', age: 30 };
      expect(getEmptyValue(obj)).toEqual({ name: '', age: 0 });
    });

    it('should handle nested objects', () => {
      const obj = {
        user: {
          name: 'John',
          age: 30,
          active: true,
          scores: [85, 90, 95],
        },
      };

      expect(getEmptyValue(obj)).toEqual({
        user: {
          name: '',
          age: 0,
          active: false,
          scores: [],
        },
      });
    });

    it('should handle complex nested structures', () => {
      const complex = {
        departments: [
          {
            name: 'Engineering',
            budget: 100000,
            active: true,
            staff: [
              { name: 'Alice', role: 'Developer' },
              { name: 'Bob', role: 'Designer' },
            ],
          },
          {
            name: 'Marketing',
            budget: 80000,
            active: false,
          },
        ],
        metadata: {
          created: 'today',
          version: 1,
        },
      };

      // When we call getEmptyValue, each property is emptied based on its type
      const result = getEmptyValue(complex);

      expect(result).toEqual({
        departments: [], // Array is emptied
        metadata: {
          // Object structure preserved but values emptied
          created: '',
          version: 0,
        },
      });
    });

    it('clears a Date to null instead of recursing into its keys', () => {
      expect(getEmptyValue(new Date('2020-01-01'))).toBeNull();
    });

    it('clears a nested Date field to null', () => {
      const obj = { name: 'John', born: new Date('2020-01-01') };
      expect(getEmptyValue(obj)).toEqual({ name: '', born: null });
    });
  });

  describe('getValueAtPath (edge cases)', () => {
    it('reads a numeric key off a non-array object', () => {
      const obj = { user: { 7: { name: 'Seven' } } } as Record<string, unknown>;
      expect(getValueAtPath(obj, ['user', 7, 'name'])).toBe('Seven');
    });

    it('returns undefined for a numeric key missing on a non-array object', () => {
      const obj = { user: {} } as Record<string, unknown>;
      expect(getValueAtPath(obj, ['user', 7])).toBeUndefined();
    });
  });

  describe('setValueAtPath (edge cases)', () => {
    it('does nothing for an empty path', () => {
      const obj = { a: 1 };
      setValueAtPath(obj, [], 99);
      expect(obj).toEqual({ a: 1 });
    });
  });

  describe('serializePath / deserializePath', () => {
    it('round-trips a path array', () => {
      const path = ['user', 0, 'name'];
      const key = serializePath(path);
      expect(typeof key).toBe('string');
      expect(deserializePath(key)).toEqual(path);
    });

    it('produces distinct keys for ambiguous segments', () => {
      expect(serializePath(['a.b'])).not.toBe(serializePath(['a', 'b']));
    });
  });

  describe('cloneAlongPath', () => {
    it('returns the same object for an empty path', () => {
      const obj = { a: 1 };
      expect(cloneAlongPath(obj, [])).toBe(obj);
    });

    it('clones references along the path but shares untouched branches', () => {
      const obj = { a: { x: 1 }, b: { y: 2 } };
      const result = cloneAlongPath(obj, ['a', 'x']);
      expect(result).not.toBe(obj); // root cloned
      expect(result.a).not.toBe(obj.a); // path cloned
      expect(result.b).toBe(obj.b); // untouched branch shared
    });

    it('creates an object when a path segment is not traversable', () => {
      const obj = { a: 5 } as Record<string, unknown>;
      const result = cloneAlongPath(obj, ['a', 'b']);
      expect(typeof result.a).toBe('object');
    });
  });

  describe('generateID', () => {
    it('returns a non-empty, reasonably unique string', () => {
      const a = generateID();
      const b = generateID();
      expect(typeof a).toBe('string');
      expect(a.length).toBeGreaterThan(0);
      expect(a).not.toBe(b);
    });
  });

  describe('isEmptyValue', () => {
    it('treats type-empty values as empty', () => {
      for (const v of ['', 0, false, [], {}, undefined, null]) {
        expect(isEmptyValue(v)).toBe(true);
      }
    });

    it('treats populated values as non-empty', () => {
      for (const v of ['x', 5, true, [1], { a: 1 }]) {
        expect(isEmptyValue(v)).toBe(false);
      }
    });

    it('treats a Date as non-empty (terminal leaf, not an empty object)', () => {
      expect(isEmptyValue(new Date('2020-01-01'))).toBe(false);
    });
  });

  describe('deepEqual', () => {
    it('compares primitives', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('a', 'a')).toBe(true);
      expect(deepEqual(true, true)).toBe(true);
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual('a', 'b')).toBe(false);
      expect(deepEqual(1, '1')).toBe(false);
    });

    it('treats NaN as equal to NaN', () => {
      expect(deepEqual(NaN, NaN)).toBe(true);
      expect(deepEqual(NaN, 0)).toBe(false);
    });

    it('handles null/undefined distinctly', () => {
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(undefined, undefined)).toBe(true);
      expect(deepEqual(null, undefined)).toBe(false);
      expect(deepEqual(null, {})).toBe(false);
    });

    it('compares Dates by timestamp', () => {
      expect(deepEqual(new Date(0), new Date(0))).toBe(true);
      expect(deepEqual(new Date(0), new Date(1))).toBe(false);
      expect(deepEqual(new Date(0), 0)).toBe(false);
    });

    it('compares arrays element-wise', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
      expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
      expect(deepEqual([1, [2, 3]], [1, [2, 4]])).toBe(false);
      expect(deepEqual([1], { 0: 1 })).toBe(false);
    });

    it('compares plain objects key-wise (order-independent)', () => {
      expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
      // same key count, different keys
      expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
    });

    it('compares deeply nested structures', () => {
      const a = { user: { name: 'x', tags: ['a', 'b'], meta: { age: 1 } } };
      const b = { user: { name: 'x', tags: ['a', 'b'], meta: { age: 1 } } };
      expect(deepEqual(a, b)).toBe(true);
      const c = { user: { name: 'x', tags: ['a', 'c'], meta: { age: 1 } } };
      expect(deepEqual(a, c)).toBe(false);
    });
  });

  describe('flattenLeaves', () => {
    it('flattens nested objects to leaf path/value pairs', () => {
      const leaves = flattenLeaves({ a: 1, b: { c: 2, d: 3 } });
      expect(leaves).toEqual([
        [['a'], 1],
        [['b', 'c'], 2],
        [['b', 'd'], 3],
      ]);
    });

    it('treats arrays as a single leaf (no per-index descent)', () => {
      const leaves = flattenLeaves({ items: [1, 2, 3] });
      expect(leaves).toEqual([[['items'], [1, 2, 3]]]);
    });

    it('treats Date as a single leaf', () => {
      const d = new Date(0);
      const leaves = flattenLeaves({ when: d });
      expect(leaves).toEqual([[['when'], d]]);
    });

    it('keeps null/primitive leaves', () => {
      const leaves = flattenLeaves({ a: null, b: '', c: 0, d: false });
      expect(leaves).toEqual([
        [['a'], null],
        [['b'], ''],
        [['c'], 0],
        [['d'], false],
      ]);
    });
  });

  describe('diffDirtyFields', () => {
    const key = (...p: (string | number)[]) => serializePath(p);

    it('is empty when nothing changed', () => {
      const v = { a: 1, b: { c: 2 } };
      expect(diffDirtyFields(v, v)).toEqual({});
      // structurally equal but different references -> still clean
      expect(
        diffDirtyFields({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })
      ).toEqual({});
    });

    it('objects are key-precise (no sibling cascade)', () => {
      const base = { meta: { a: '1', b: '2' }, name: 'x' };
      const cur = { meta: { a: 'CHANGED', b: '2' }, name: 'x' };
      expect(diffDirtyFields(cur, base)).toEqual({ [key('meta', 'a')]: true });
    });

    it('flags added and removed object keys', () => {
      expect(diffDirtyFields({ a: 1, b: 2 }, { a: 1 })).toEqual({
        [key('b')]: true,
      });
      expect(diffDirtyFields({ a: 1 }, { a: 1, b: 2 })).toEqual({
        [key('b')]: true,
      });
    });

    it('a dirty array marks its path AND every descendant field recursively', () => {
      const base = {
        sections: [{ title: 'Intro', questions: [{ q: 'Name?' }] }],
      };
      const cur = {
        sections: [{ title: 'Intro', questions: [{ q: 'Your name?' }] }],
      };
      expect(diffDirtyFields(cur, base)).toEqual({
        [key('sections')]: true,
        [key('sections', 0, 'title')]: true,
        [key('sections', 0, 'questions')]: true,
        [key('sections', 0, 'questions', 0, 'q')]: true,
      });
    });

    it('a reorder marks the whole array subtree (content unchanged)', () => {
      const base = { rows: [{ label: 'a' }, { label: 'b' }] };
      const cur = { rows: [{ label: 'b' }, { label: 'a' }] };
      expect(diffDirtyFields(cur, base)).toEqual({
        [key('rows')]: true,
        [key('rows', 0, 'label')]: true,
        [key('rows', 1, 'label')]: true,
      });
    });

    it('does not leak array cascade into an unrelated object sibling', () => {
      const base = { meta: { a: '1' }, list: ['x'] };
      const cur = { meta: { a: '1' }, list: ['y'] };
      expect(diffDirtyFields(cur, base)).toEqual({
        [key('list')]: true,
        [key('list', 0)]: true,
      });
    });

    it('handles an emptied array (length change)', () => {
      expect(diffDirtyFields({ items: [] }, { items: [1, 2] })).toEqual({
        [key('items')]: true,
      });
    });
  });
});
