# Zod Helpers Documentation

<!-- toc -->

- [Overview](#overview)
- [Core Types](#core-types)
  - [ValidationError](#validationerror)
  - [ValidationResult](#validationresult)
  - [ValidationOptions](#validationoptions)
- [Core Functions](#core-functions)
  - [validate / validateAsync](#validate--validateasync)
    - [Options](#options)
  - [withRootErrors](#withrooterrors)
  - [Path Utilities](#path-utilities)
- [Usage Examples](#usage-examples)
  - [Basic Validation](#basic-validation)
  - [Server-Sourced Validation](#server-sourced-validation)
  - [Root Messages](#root-messages)
  - [Combined Options](#combined-options)
  - [withRootErrors After Validation](#withrooterrors-after-validation)
- [Integration With Form Library](#integration-with-form-library)

<!-- tocstop -->

## Overview

Validation helpers built on top of Zod that produce a consistent, JSON-friendly error format. Errors are flat arrays of `{ path, message, source }` objects rather than Zod's nested issue tree, making them easy to pass to the form context or serialize to an API.

## Core Types

### ValidationError

```typescript
interface ValidationError {
  path: (string | number)[]; // Path to the error field — [] means form-level
  message: string; // Error message
  source?: 'client' | 'server' | 'manual' | 'client-form-handler'; // Error source
}
```

The path array can contain:

- Strings for object properties
- Numbers for array indices

Example paths:

```typescript
['name']; // Simple field
['address', 'street']; // Nested object
['todos', 0, 'text']; // Array item field
[]; // Form-level error
```

### ValidationResult

```typescript
interface ValidationResult<T> {
  valid: boolean; // Whether validation passed
  value: T | null; // Parsed value if valid
  errors?: ValidationError[]; // Array of validation errors
}
```

### ValidationOptions

```typescript
interface ValidationOptions {
  isServer?: boolean; // Mark errors as server-sourced
  rootMessages?: string | string[]; // Add root-level error messages
}
```

## Core Functions

### validate / validateAsync

```typescript
function validate<T>(
  schema: ValidationSchema<T>,
  values: unknown,
  options?: ValidationOptions
): ValidationResult<T>;

async function validateAsync<T>(
  schema: ValidationSchema<T>,
  values: unknown,
  options?: ValidationOptions
): Promise<ValidationResult<T>>;
```

Run a Zod schema against values and return a `ValidationResult`. `validate` is synchronous, while `validateAsync` supports schemas with async refinements.

> **Note:** The form provider's built-in validation (`validateOnChange`,
> `validateOnBlur`, `submit()`, etc.) runs the **synchronous** `validate` only —
> it never awaits async refinements. So rather than baking async checks into the
> schema with `.refine(async …)`, the simplest pattern is two steps: validate the
> **shape/format synchronously** first, then — only if it passed — run any
> **async/business checks** (e.g. "is this username taken?", a DB lookup).
>
> - **Client:** do the async step in `onSubmit` (or an effect) and surface its
>   result through `helpers.setServerError` / `setError`. See
>   [Handling Async Validation](./form-api.md#handling-async-validation).
> - **Server:** re-validate before writing to your database — never trust the
>   client. Run the **same schema** with `validate` (the helpers are isomorphic,
>   so it's the exact schema you use on the client), then run the uniqueness/DB
>   checks only once it's valid. Pass `isServer: true` so the errors come back
>   tagged `source: 'server'`, ready to hand to the form.

#### Options

- `isServer`: Tag all errors as `source: 'server'` instead of `'client'`
- `rootMessages`: Attach one or more form-level errors (`path: []`) to the result, even if field validation passed. Useful for injecting a top-level rejection message upfront.

### withRootErrors

```typescript
function withRootErrors<T>(
  result: ValidationResult<T>,
  messages: string | string[]
): ValidationResult<T>;
```

Purely additive, appends one or more form-level errors (`path: []`) to an existing `ValidationResult` without touching the existing field errors. Use this when you need to attach a top-level message after validation has already run, such as after a server response or when you want to summarize multiple field errors with a banner message. Always returns `valid: false`.

### Path Utilities

```typescript
function getValueAtPath(obj: unknown, path: (string | number)[]): unknown;
function setValueAtPath(
  obj: Record<string | number, unknown>,
  path: (string | number)[],
  value: unknown
): void;
function serializePath(path: (string | number)[]): string;
function deserializePath(serialized: string): (string | number)[];
```

Utilities for reading and writing values at nested paths. `setValueAtPath` automatically creates intermediate objects or arrays as needed.

`serializePath` / `deserializePath` convert a path array to and from the stable string key the form uses internally. The form's `touched` and `dirtyFields` maps are keyed by this serialized path, so reach for `serializePath` when reading them directly:

```typescript
import { serializePath } from 'form-context-react-zod';

const emailDirty = form.dirtyFields[serializePath(['email'])];
const emailTouched = form.touched[serializePath(['email'])];
```

(It is `JSON.stringify` under the hood, but importing the helper keeps you decoupled from that detail.)

## Usage Examples

### Basic Validation

```typescript
const userSchema = z.object({
  name: z.string().min(2),
  age: z.number().min(0)
});

const result = validate(userSchema, {
  name: 'A',
  age: -1
});

// Result:
{
  valid: false,
  value: null,
  errors: [
    {
      path: ['name'],
      message: 'String must contain at least 2 character(s)',
      source: 'client'
    },
    {
      path: ['age'],
      message: 'Number must be greater than or equal to 0',
      source: 'client'
    }
  ]
}
```

### Server-Sourced Validation

```typescript
const result = validate(userSchema, values, { isServer: true });

// Result:
{
  valid: false,
  value: null,
  errors: [
    {
      path: ['name'],
      message: 'String must contain at least 2 character(s)',
      source: 'server'
    }
  ]
}
```

### Root Messages

```typescript
const result = validate(userSchema, values, {
  rootMessages: 'Account creation temporarily disabled'
});

// Result:
{
  valid: false,
  value: null,
  errors: [
    // ... validation errors ...
    {
      path: [],
      message: 'Account creation temporarily disabled',
      source: 'server'
    }
  ]
}

// Multiple root messages
const result = validate(userSchema, values, {
  rootMessages: [
    'System maintenance in progress',
    'Account creation temporarily disabled'
  ]
});
```

### Combined Options

```typescript
const result = validate(userSchema, values, {
  isServer: true,
  rootMessages: 'Account creation disabled'
});

// Result:
{
  valid: false,
  value: null,
  errors: [
    {
      path: ['name'],
      message: 'Invalid name',
      source: 'server'
    },
    {
      path: [],
      message: 'Account creation disabled',
      source: 'server'
    }
  ]
}
```

### withRootErrors After Validation

Append a root error after validation, preserving field errors:

```typescript
const result = validate(userSchema, values);
const withBanner = withRootErrors(result, 'Please fix all highlighted fields.');
// withBanner.errors = [...original field errors, { path: [], message: '...' }]
```

Works on valid results too. This is useful for injecting a server-level rejection after a passing schema:

```typescript
const result = validate(userSchema, values); // passes
const rejected = withRootErrors(result, 'Your account has been suspended.');
// rejected.valid === false
```

Multiple messages:

```typescript
const withMultiple = withRootErrors(result, [
  'Submission limit reached.',
  'Please contact support.',
]);
```

## Integration With Form Library

The error format produced by these helpers maps directly to the form context's error state, same path shape, same flat array. Inside `onSubmit`, pass errors straight to `helpers.setErrors`:

```typescript
onSubmit={async (values, helpers) => {
  const response = await api.save(values);

  if (!response.ok) {
    // Attach a top-level error and surface any field errors from the API
    const result = withRootErrors(
      { valid: false, value: null, errors: response.fieldErrors },
      response.message
    );

    helpers.setErrors(result.errors ?? []);
    return;
  }
}}
```

Root errors (`path: []`) are readable in components via `form.getError([])`:

```tsx
const rootErrors = form.getError([]);

return (
  <>
    {rootErrors.map((e, i) => (
      <p key={i} className="error-banner">
        {e.message}
      </p>
    ))}
  </>
);
```
