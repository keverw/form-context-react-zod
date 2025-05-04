import { SafeParseError, ZodError, z } from 'zod';

export interface ValidationError {
  path: (string | number)[];
  message: string;
  source?: 'client' | 'server';
}

export interface ValidationResult<T> {
  valid: boolean;
  value: T | null;
  errors?: ValidationError[];
}

export type ValidationSchema<T> = z.ZodType<T, unknown>;

interface ValidationOptions {
  isServer?: boolean;
  rootMessages?: string | string[];
}

function formatZodError(error: ZodError, isServer = false): ValidationError[] {
  return error.errors.map(err => ({
    path: err.path,
    message: err.message,
    source: isServer ? 'server' : 'client'
  }));
}

function addRootMessages(errors: ValidationError[], messages?: string | string[]): ValidationError[] {
  if (!messages) return errors;
  
  const rootMessages = Array.isArray(messages) ? messages : [messages];
  const rootErrors = rootMessages.map(message => ({
    path: [] as (string | number)[],
    message,
    source: 'server' as const
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
        value: result.data,
        errors: addRootMessages([], options.rootMessages)
      };
    }
    return {
      valid: true,
      value: result.data
    };
  }

  const errors = formatZodError((result as SafeParseError<unknown>).error, options.isServer);
  return {
    valid: false,
    value: null,
    errors: options.rootMessages ? addRootMessages(errors, options.rootMessages) : errors
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
        value: result.data,
        errors: addRootMessages([], options.rootMessages)
      };
    }
    return {
      valid: true,
      value: result.data
    };
  }

  const errors = formatZodError((result as SafeParseError<unknown>).error, options.isServer);
  return {
    valid: false,
    value: null,
    errors: options.rootMessages ? addRootMessages(errors, options.rootMessages) : errors
  };
}