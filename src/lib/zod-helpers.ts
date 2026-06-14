import { ZodError, z } from 'zod';

export interface ValidationError {
  path: (string | number)[];
  message: string;
  source?: 'client' | 'server' | 'client-form-handler';
}

export interface ValidationResult<T> {
  valid: boolean;
  value: T | null;
  errors?: ValidationError[];
}

export type ValidationSchema<T> = z.ZodType<T>;

interface ValidationOptions {
  isServer?: boolean;
  rootMessages?: string | string[];
}

function formatZodError(error: ZodError, isServer = false): ValidationError[] {
  // Zod 4 renamed `error.errors` -> `error.issues`. Issue paths are PropertyKey[]
  // in v4; form paths are always string/number, so narrow the type here.
  return error.issues.map((err) => ({
    path: err.path as (string | number)[],
    message: err.message,
    source: isServer ? 'server' : 'client',
  }));
}

function addRootMessages(
  errors: ValidationError[],
  messages?: string | string[]
): ValidationError[] {
  if (!messages) return errors;

  const rootMessages = Array.isArray(messages) ? messages : [messages];
  const rootErrors = rootMessages.map((message) => ({
    path: [] as (string | number)[],
    message,
    source: 'server' as const,
  }));

  return [...errors, ...rootErrors];
}

export function validate<T>(
  schema: ValidationSchema<T>,
  values: unknown,
  options: ValidationOptions = {}
): ValidationResult<T> {
  const result = schema.safeParse(values);

  if (result.success) {
    // If we have root messages, add them even if validation passed
    if (options.rootMessages) {
      return {
        valid: false,
        value: null, // Set to null to be consistent with other error cases
        errors: addRootMessages([], options.rootMessages),
      };
    }

    return {
      valid: true,
      value: result.data,
    };
  }

  const errors = formatZodError(result.error, options.isServer);

  return {
    valid: false,
    value: null,
    errors: options.rootMessages
      ? addRootMessages(errors, options.rootMessages)
      : errors,
  };
}

export async function validateAsync<T>(
  schema: ValidationSchema<T>,
  values: unknown,
  options: ValidationOptions = {}
): Promise<ValidationResult<T>> {
  const result = await schema.safeParseAsync(values);

  if (result.success) {
    // If we have root messages, add them even if validation passed
    if (options.rootMessages) {
      return {
        valid: false,
        value: null, // Set to null to be consistent with other error cases
        errors: addRootMessages([], options.rootMessages),
      };
    }

    return {
      valid: true,
      value: result.data,
    };
  }

  const errors = formatZodError(result.error, options.isServer);

  return {
    valid: false,
    value: null,
    errors: options.rootMessages
      ? addRootMessages(errors, options.rootMessages)
      : errors,
  };
}
