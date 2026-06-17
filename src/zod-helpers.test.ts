import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { validate, validateAsync, withRootErrors } from './zod-helpers';

describe('zod-helpers', () => {
  // Test schema
  const testSchema = z.object({
    name: z.string().min(2),
    email: z.email(),
    age: z.number().int().positive(),
  });

  describe('validate', () => {
    it('should return valid result for valid data', () => {
      const validData = {
        name: 'John',
        email: 'john@example.com',
        age: 30,
      };

      const result = validate(testSchema, validData);

      expect(result.valid).toBe(true);
      expect(result.value).toEqual(validData);
      expect(result.errors).toBeUndefined();
    });

    it('should return invalid result with errors for invalid data', () => {
      const invalidData = {
        name: 'J', // too short
        email: 'not-an-email',
        age: -5, // negative
      };

      const result = validate(testSchema, invalidData);

      expect(result.valid).toBe(false);
      expect(result.value).toBeNull();
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);

      // Check error paths
      const paths = result.errors?.map((err) => err.path.join('.'));
      expect(paths).toContain('name');
      expect(paths).toContain('email');
      expect(paths).toContain('age');
    });

    it('should include source in errors based on isServer option', () => {
      const invalidData = { name: '' };

      const clientResult = validate(testSchema, invalidData);
      const serverResult = validate(testSchema, invalidData, {
        isServer: true,
      });

      expect(clientResult.errors?.[0].source).toBe('client');
      expect(serverResult.errors?.[0].source).toBe('server');
    });

    it('should add root messages when provided', () => {
      const validData = {
        name: 'John',
        email: 'john@example.com',
        age: 30,
      };

      const rootMessage = 'Authentication required';
      const result = validate(testSchema, validData, {
        rootMessages: rootMessage,
      });

      expect(result.valid).toBe(false);
      expect(result.value).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].path).toEqual([]);
      expect(result.errors?.[0].message).toBe(rootMessage);
    });

    it('should support multiple root messages', () => {
      const invalidData = { name: 'J' };
      const rootMessages = ['Error 1', 'Error 2'];

      const result = validate(testSchema, invalidData, { rootMessages });

      const rootErrors = result.errors?.filter((err) => err.path.length === 0);
      expect(rootErrors).toHaveLength(2);
      expect(rootErrors?.map((err) => err.message)).toEqual(rootMessages);
    });

    it('tags root messages client by default (matching the validation pass)', () => {
      const result = validate(
        testSchema,
        { name: 'J' },
        { rootMessages: 'Banner' }
      );

      const rootError = result.errors?.find((err) => err.path.length === 0);
      const fieldError = result.errors?.find((err) => err.path.length > 0);
      // No mixed sources within one result: root and field errors are both client.
      expect(rootError?.source).toBe('client');
      expect(fieldError?.source).toBe('client');
    });

    it('tags root messages server when isServer is set', () => {
      const result = validate(
        testSchema,
        { name: 'J' },
        { rootMessages: 'Banner', isServer: true }
      );

      const rootError = result.errors?.find((err) => err.path.length === 0);
      const fieldError = result.errors?.find((err) => err.path.length > 0);
      expect(rootError?.source).toBe('server');
      expect(fieldError?.source).toBe('server');
    });
  });

  describe('withRootErrors', () => {
    it('should append a single root message to an invalid result', () => {
      const invalidResult = validate(testSchema, { name: 'J' });
      const result = withRootErrors(invalidResult, 'Something went wrong');

      expect(result.valid).toBe(false);
      expect(result.value).toBeNull();

      const rootErrors = result.errors?.filter((e) => e.path.length === 0);
      expect(rootErrors).toHaveLength(1);
      expect(rootErrors?.[0].message).toBe('Something went wrong');
      // Defaults to client, matching validate() — "client unless tagged server".
      expect(rootErrors?.[0].source).toBe('client');
    });

    it('tags root messages server when isServer is true', () => {
      const invalidResult = validate(testSchema, { name: 'J' });
      const result = withRootErrors(invalidResult, 'Server rejection', {
        isServer: true,
      });

      const rootErrors = result.errors?.filter((e) => e.path.length === 0);
      expect(rootErrors?.[0].source).toBe('server');
    });

    it('should append multiple root messages', () => {
      const invalidResult = validate(testSchema, { name: 'J' });
      const result = withRootErrors(invalidResult, ['Error A', 'Error B']);

      const rootErrors = result.errors?.filter((e) => e.path.length === 0);
      expect(rootErrors).toHaveLength(2);
      expect(rootErrors?.map((e) => e.message)).toEqual(['Error A', 'Error B']);
    });

    it('should preserve existing field errors', () => {
      const invalidResult = validate(testSchema, { name: 'J' });
      const fieldErrors = invalidResult.errors?.filter(
        (e) => e.path.length > 0
      );
      const result = withRootErrors(invalidResult, 'Root error');

      const preserved = result.errors?.filter((e) => e.path.length > 0);
      expect(preserved?.length).toBe(fieldErrors?.length);
    });

    it('should work on a valid result, making it invalid', () => {
      const validResult = validate(testSchema, {
        name: 'John',
        email: 'john@example.com',
        age: 30,
      });
      expect(validResult.valid).toBe(true);

      const result = withRootErrors(validResult, 'Account suspended');

      expect(result.valid).toBe(false);
      expect(result.value).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].path).toEqual([]);
      expect(result.errors?.[0].message).toBe('Account suspended');
    });
  });

  describe('validateAsync', () => {
    it('should handle async validation correctly', async () => {
      const asyncSchema = z.object({
        id: z.string(),
        data: z.string().refine(async (val) => val.length > 3, {
          message: 'String must be longer than 3 characters',
        }),
      });

      const validData = { id: '123', data: 'valid' };
      const invalidData = { id: '123', data: 'no' };

      const validResult = await validateAsync(asyncSchema, validData);
      const invalidResult = await validateAsync(asyncSchema, invalidData);

      expect(validResult.valid).toBe(true);
      expect(validResult.value).toEqual(validData);

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors?.some((e) => e.path.includes('data'))).toBe(
        true
      );
    });

    it('should add root messages when provided in async validation', async () => {
      const asyncSchema = z.object({
        id: z.string(),
        data: z.string(),
      });

      const validData = { id: '123', data: 'valid' };
      const rootMessage = 'Async validation failed';

      // Test with valid data but root message
      const result = await validateAsync(asyncSchema, validData, {
        rootMessages: rootMessage,
      });

      expect(result.valid).toBe(false);
      expect(result.value).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].path).toEqual([]);
      expect(result.errors?.[0].message).toBe(rootMessage);

      // Test with multiple root messages
      const multipleMessages = ['Error 1', 'Error 2'];
      const multiResult = await validateAsync(asyncSchema, validData, {
        rootMessages: multipleMessages,
      });

      const rootErrors = multiResult.errors?.filter(
        (err) => err.path.length === 0
      );
      expect(rootErrors).toHaveLength(2);
      expect(rootErrors?.map((err) => err.message)).toEqual(multipleMessages);
    });

    it('should combine validation errors with root messages in async validation', async () => {
      const asyncSchema = z.object({
        id: z.string(),
        data: z.string().refine(async (val) => val.length > 3, {
          message: 'String must be longer than 3 characters',
        }),
      });

      // Data that will fail validation
      const invalidData = { id: '123', data: 'no' };
      const rootMessages = ['Root error 1', 'Root error 2'];

      const result = await validateAsync(asyncSchema, invalidData, {
        rootMessages,
      });

      // Should be invalid
      expect(result.valid).toBe(false);
      expect(result.value).toBeNull();

      // Should contain both validation errors and root messages
      const validationErrors = result.errors?.filter(
        (err) => err.path.length > 0
      );
      const rootErrors = result.errors?.filter((err) => err.path.length === 0);

      // Verify validation errors exist
      expect(validationErrors?.length).toBeGreaterThan(0);
      expect(validationErrors?.some((e) => e.path.includes('data'))).toBe(true);

      // Verify root messages exist
      expect(rootErrors).toHaveLength(2);
      expect(rootErrors?.map((err) => err.message)).toEqual(rootMessages);

      // Verify total error count is the sum of both types
      expect(result.errors?.length).toBe(
        (validationErrors?.length || 0) + (rootErrors?.length || 0)
      );
    });
  });
});
