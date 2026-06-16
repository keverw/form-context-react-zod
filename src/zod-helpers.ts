import { ZodError, z } from 'zod';

export interface ValidationError {
  path: (string | number)[];
  message: string;
  // 'client'  — produced by Zod schema validation (recomputed every validate)
  // 'server'  — set via setServerError(s); survives validation, clears on edit/submit/reset
  // 'manual'  — set via setError; a client-owned error that behaves like 'server'
  //             (survives validation) but is semantically dev-set, not server-reported
  // 'client-form-handler' — form-level submission error (setClientSubmissionError)
  source?: 'client' | 'server' | 'client-form-handler' | 'manual';
}

/**
 * A snapshot of a single field's state, returned by `getFieldState(path)`.
 * Unlike `useField`'s display-oriented `error`, the errors here are NOT gated on
 * touched — they reflect the field's real validation state for programmatic
 * inspection (e.g. "is this field currently valid?").
 *
 * This is a snapshot read at call time, not a live object: call `getFieldState`
 * during render and it stays in sync because the component re-renders on form
 * state changes. Don't stash the returned object expecting it to update itself.
 */
export interface FieldState {
  /** All errors at this exact path (validation + server), unfiltered. */
  errors: ValidationError[];
  /** The first error message, or null if the field has no errors. */
  error: string | null;
  /** Whether the field has been touched (blurred or edited). */
  isTouched: boolean;
  /** Whether the field currently has any error. */
  invalid: boolean;
  /**
   * Whether the path is present in the form's `values` (a `hasField(path)` read).
   * This reflects presence only — it is independent of `errors`/`invalid`. A
   * required schema field that hasn't been filled in is absent from `values`, so
   * it can be `exists: false` AND `invalid: true` once validation runs. Use this
   * to catch a typo'd/never-set path, not to decide whether a field has errors.
   */
  exists: boolean;
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
