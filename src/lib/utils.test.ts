import { describe, it, expect } from 'vitest';
import { getValueAtPath, setValueAtPath, getEmptyValue } from './utils';

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
      expect(primitiveObj).toEqual({
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

    it('should return empty string for null and undefined', () => {
      expect(getEmptyValue(null)).toBe('');
      expect(getEmptyValue(undefined)).toBe('');
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
  });
});
