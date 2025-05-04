# ZOD Helpers Documentation

## Overview

Enhanced ZOD validation helpers that provide a more JSON-friendly error format and utility functions for working with nested paths.

## Core Types

### ValidationError

```typescript
interface ValidationError {
  path: (string | number)[]; // Path to the error field
  message: string; // Error message
  source?: 'client' | 'server'; // Error source
}
```

The path array can contain:

- Strings for object properties
- Numbers for array indices

Example paths:

```typescript
['name'][('address', 'street')][('todos', 0, 'text')]; // Simple field // Nested object // Array item field
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

These functions:

- Take a ZOD schema and values
- Optionally accept validation options
- Return a ValidationResult
- Convert ZOD errors to the simplified format

#### Options

- `isServer`: Mark validation errors as server-sourced
- `rootMessages`: Add root-level error messages (empty path)

### Path Utilities

```typescript
function getValueAtPath(obj: any, path: (string | number)[]): any;
function setValueAtPath(obj: any, path: (string | number)[], value: any): void;
```

Helper functions for:

- Getting values at nested paths
- Setting values at nested paths
- Automatically creating intermediate objects/arrays

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

## Integration with Form Library

The validation helpers are designed to work seamlessly with the form library:

1. Path format matches form field paths
2. Error structure maps directly to form error state
3. Server error source helps with error handling

Example integration:

```typescript
const form = useForm({
  schema: userSchema,
  onSubmit: async (values) => {
    try {
      await submitToServer(values);
    } catch (error) {
      // Handle API errors
      const result = validate(userSchema, values, {
        isServer: true,
        rootMessages: error.message,
      });
      form.setErrors(result.errors);
    }
  },
});
```
