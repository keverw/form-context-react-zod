# Form Library API Documentation

## Overview

A TypeScript-first form management library that handles complex nested forms with validation, server-side errors, and array fields. Built with Zod for type-safe schema validation.

## Core Components

### FormProvider

The FormProvider manages the form state and provides context for all form hooks. It accepts:

```tsx
interface FormProviderProps<T> {
  initialValues: T;
  onSubmit?: (values: T, helpers: FormHelpers) => Promise<void> | void;
  schema?: z.ZodType<T>;
  validateOnMount?: boolean; // Whether to run validation immediately
  validateOnChange?: boolean; // Whether to run validation on every change
  useFormTag?: boolean; // Whether to wrap children in a <form> HTML tag
  formProps?: React.FormHTMLAttributes<HTMLFormElement>; // HTML attributes for the form element
  children: React.ReactNode | React.ReactNode[]; // Accepts a single child or multiple children
}
```

Provides context with:

- Form values and touched state
- Validation state and errors
- Server-side error management
- Submission handling
- Form operations (submit, reset)

State getters:

- `isSubmitting`: Boolean indicating submission state
- `isValid`: Boolean indicating if form passes validation for touched fields
- `canSubmit`: Boolean indicating if the entire form passes Zod schema validation
- `errors`: Current validation/server errors
- `lastValidated`: Timestamp of the last validation

- Form operations:

  - `submit()`: Trigger form submission
  - `reset(force?: boolean): boolean`: Reset form to initial values, returns true if successful.
  - `resetWithValues(newValues, force?)`: Reset form with new values
  - `validate(force?: boolean)`: Manually trigger form validation

The `useFormTag` prop allows wrapping the form content in a native HTML `<form>` tag with automatic `preventDefault` handling on submit events. When enabled, you can use standard HTML submit buttons instead of manually calling `form.submit()`.

Value operations:

- `getValue(path)`: Get value at specific path
- `setValue(path, value)`: Set value at specific path (batched for performance)
- `clearValue(path)`: Reset field to empty value based on its type
- `deleteField(path)`: Remove field at path (handles arrays properly)
- `hasField(path)`: Check if field exists
- `getValuePaths(path?)`: Get all value paths under given path

Error operations:

- `getError(path)`: Get array of errors at specific path level
- `getErrorPaths(path?)`: Get all error paths under given path
- `setErrors(errors)`: Set all errors (replaces existing errors)
- `setServerErrors(errors)`: Replace all server errors with new ones
- `setServerError(path, message)`: Set server error(s) for a specific path

Touch state operations:

- `setFieldTouched(path, value?)`: Mark field as touched/untouched (batched for performance)

### FormHelpers Interface

```tsx
export interface FormHelpers {
  setErrors: (errors: ValidationError[]) => void;
  setServerErrors: (errors: ValidationError[]) => void;
  setServerError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  clearValue: (path: (string | number)[]) => void;
  deleteField: (path: (string | number)[]) => void;
  validate: (force?: boolean) => boolean;
  hasField: (path: (string | number)[]) => boolean;
  touched: Record<string, boolean>;
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  reset: (force?: boolean) => boolean;
  resetWithValues: <T = unknown>(newValues: T, force?: boolean) => boolean;
  currentSubmissionId: string | null;
  isCurrentSubmission: (submissionId: string) => boolean;
}
```

Server Error Handling:

```typescript
// Replace all server errors (validation errors are preserved)
form.setServerErrors([
  { path: ['email'], message: 'Email already taken' },
  { path: [], message: 'Account creation temporarily disabled' },
]);

// Set single server error (replaces existing server errors at same path)
form.setServerError(['username'], 'Username already taken');

// Set multiple server errors for same field
form.setServerError(
  ['password'],
  ['Password too weak', 'Contains forbidden characters']
);

// Clear server errors for a specific field
form.setServerError(['username'], null);
```

### Error Types in the Form System

The form library handles three distinct types of errors:

1. **Client Validation Errors**: Generated automatically by Zod schema validation. These are field-specific errors based on your schema rules (e.g., "Email must be valid", "Name is required").

2. **Server Validation Errors**: Set with `setServerErrors()` or `setServerError()`, these represent validation errors from your backend (e.g., "Username already taken", "Email domain is blocked").

3. **Client Submission Errors**: Set with `setClientSubmissionError()`, these are for general submission failures like network issues, authentication problems, or any other client-side issue preventing successful form submission.

#### Client Submission Error Handling:

```typescript
// Set a client submission error (network failures, auth issues, etc.)
// These appear at the root level and are independent of validation/server errors
form.setClientSubmissionError('Network connection failed, please try again');

// Set multiple client submission errors
form.setClientSubmissionError([
  'Your session has expired',
  'Please sign in again to continue',
]);

// Clear client submission errors
form.clearClientSubmissionError();

// Get current client submission errors
const clientErrors = form.getClientSubmissionError(); // Returns string[]

// Clear all server errors while preserving client validation errors
form.setServerErrors([]);
```

Client submission errors are always displayed at the root level of the form and are ideal for situations where the entire form submission fails for reasons unrelated to individual field validation.

Important Server Error Behaviors:

1. `setServerErrors`:

   - Replaces ALL existing server errors
   - Preserves validation errors
   - Ignores errors for non-existent paths
   - Root errors (empty path) always allowed

2. `setServerError`:
   - Replaces server errors at the SAME path level only
   - Accepts single message or array of messages
   - Ignores non-existent paths (except root)
   - Preserves server errors at other paths
   - Preserves all validation errors
   - Pass `null` to clear all server errors at the specified path
   - Use `setServerErrors([])` to clear all server errors while preserving validation errors
   - Operations are batched for performance

```tsx
// Direct value operations
const value = form.getValue(['todos', 0, 'text']);
form.setValue(['todos', 0, 'text'], 'New todo');
form.deleteField(['todos', 0]);

// Check field existence
const hasScore = form.hasField(['score']);

// Manual validation
const isValid = form.validate();
// Force validation and mark all fields as touched
const isValidForced = form.validate(true);

// Get all value paths under todos
const todoPaths = form.getValuePaths(['todos']);
// Returns: [['todos', 0, 'text'], ['todos', 0, 'completed'], ...]

// Get errors at specific level
const errors = form.getError(['todos', 0]);
// Returns: [{ message: 'Invalid todo' }]

// Get all error paths under todos
const errorPaths = form.getErrorPaths(['todos']);
// Returns: [['todos', 0, 'text'], ['todos', 1, 'completed'], ...]
```

### Performance Optimizations

The form library includes several performance optimizations:

1. Batched updates:

   - Multiple `setValue` calls are batched and processed together
   - Multiple `setFieldTouched` calls are batched
   - Multiple `setServerError` calls are batched

2. Optimized validation:

   - Validation only runs when needed
   - Cache timestamps of last validation
   - Only validate changed fields when possible

3. Efficient state management:
   - Uses React's useReducer for state management
   - Only rerenders when relevant state changes

### Hooks

#### useField

```tsx
const {
  value,
  setValue,
  error,
  props, // Typed props for input components
} = useField(path);
```

Path can be specified using:

- Array notation: `['user', 'details', 'name']`
- Array with numbers for indices: `['todos', 0, 'text']`

Features:

- Value getting/setting
- Touch tracking
- Error management (server errors automatically clear on edit)
- Type-safe props for input components

Example:

```tsx
// Simple field
const nameField = useField(['name']);

// Nested field
const ageField = useField(['details', 'age']);

// Array item field
const todoField = useField(['todos', 0, 'text']);

// Clear server errors by setting them to empty array
form.setServerErrors([]);

// Or clear server errors for a specific path
form.setServerError(['fieldName'], null);
```

#### useArrayField

```tsx
const { items, add, remove, move } = useArrayField(path);
```

Array operations:

- `add(item)`: Add new item
- `remove(index)`: Remove item at index
- `move(from, to)`: Reorder items with proper error handling

Example:

```tsx
const todos = useArrayField(['todos']);

// Add new todo
todos.add({ text: '', completed: false });

// Remove todo
todos.remove(0);

// Move todo (handles error repositioning)
todos.move(0, 1);
```

## Form Submission

When using the `onSubmit` prop, it receives the form values and a set of helper functions:

```tsx
<FormProvider
  initialValues={{ name: '', email: '' }}
  onSubmit={async (values, helpers) => {
    try {
      // The current submission ID is available in helpers
      const { currentSubmissionId } = helpers;

      // Attempt to submit the form
      const result = await submitToServer(values);

      // Check if this submission is still current before updating
      if (helpers.isCurrentSubmission(currentSubmissionId)) {
        // Safe to update form state
        console.log('Submission successful');
      } else {
        // This submission was canceled or replaced by a newer one
        console.log('Submission was canceled or replaced');
      }
    } catch (error) {
      // Set a server error
      helpers.setServerError([], 'Failed to submit form');
    }
  }}
>
  {/* Form components */}
</FormProvider>
```

### Error Clearing on Resubmission

When a form is submitted, the library automatically clears:

- All server errors (`source: 'server'`)
- All client error slot messages (`source: 'client-form-handler'`)

This provides a clean slate for each submission attempt, ensuring old error messages don't persist when the user tries again. Validation errors are rechecked during submission and will still appear if validation fails.

```tsx
// This happens automatically on form submission:
// 1. Clear all server errors
// 2. Clear client error slot
// 3. Perform validation
// 4. Submit if valid
form.submit();
```

The `helpers` object provides access to:

- `setErrors`: Set all errors
- `setServerErrors`: Replace all server errors
- `setServerError`: Set server error for specific path
- `setValue`: Update field value
- `clearValue`: Reset field to empty value
- `deleteField`: Remove field
- `validate`: Manually trigger validation
- `hasField`: Check if field exists
- `touched`: Current touched state
- `setFieldTouched`: Mark field as touched
- `reset`: Reset form to initial values. Returns `true` if successful, `false` otherwise (e.g., if submitting and not forced).
- `resetWithValues`: Reset form with new values
- `currentSubmissionId`: The ID of the current submission
- `isCurrentSubmission`: Function to check if a submission ID is current

### Resetting the Form

The `reset` function allows you to revert the form to its original `initialValues`. It now includes a `force` option and returns a boolean indicating success.

```tsx
// Basic usage - resets to initialValues
const wasReset = form.reset();

// Force reset even during submission
const wasForcedReset = form.reset(true); // force=true will cancel any ongoing submission

// Check if reset was successful
if (wasReset) {
  console.log('Form was reset successfully');
} else {
  console.log(
    'Form reset was not performed (e.g., due to ongoing submission without force)'
  );
}
```

The function returns:

- `true` if the reset was successfully performed.
- `false` if the reset was not performed (e.g., when the form is submitting and `force` is `false`).

This is useful for:

- Providing a standard "clear form" or "start over" functionality.
- Canceling an ongoing submission and reverting to the initial state.
- Knowing whether the reset was actually performed to take appropriate actions.

**Note:** The `reset` function, when forced during a submission or when resetting normally, also clears the `currentSubmissionID` to `null`.

### Resetting with New Values

The `resetWithValues` function allows you to reset the form with new values and returns a boolean indicating whether the reset was successful:

```tsx
// Basic usage
const wasReset = form.resetWithValues({
  name: 'New Name',
  email: 'new@example.com',
});

// Reset with new values even during submission
const wasReset = form.resetWithValues(
  {
    name: 'New Name',
    email: 'new@example.com',
  },
  true
); // force=true will cancel any ongoing submission

// Check if reset was successful
if (wasReset) {
  console.log('Form was reset successfully');
} else {
  console.log('Form reset was not performed');
}
```

The function returns:

- `true` if the reset was successfully performed
- `false` if the reset was not performed (e.g., when the form is submitting and `force` is false)

This is useful for:

- Updating the form with data from an API
- Implementing "Load Saved Data" functionality
- Resetting to a different state than the initial values
- Canceling an ongoing submission and starting fresh
- Knowing whether the reset was actually performed to take appropriate actions

**Note:** The `resetWithValues` function resets the submission ID to `null` upon success. This ensures that any ongoing submission tracking is cleared when the form is reset with new values.

### Submission ID Tracking

The form context includes a submission ID tracking system to help prevent race conditions:

```tsx
// In your onSubmit handler
const handleSubmit = async (values, helpers) => {
  // The submission ID is available in the helpers
  const { currentSubmissionId, isCurrentSubmission } = helpers;

  // Start an async operation
  const result = await someAsyncOperation();

  // Check if this submission is still current before updating
  if (isCurrentSubmission(currentSubmissionId)) {
    // Safe to update form state
    helpers.setValue(['result'], result);
  } else {
    // This submission was canceled or replaced by a newer one
    console.log('Submission was canceled or replaced');
  }
};
```

This helps prevent race conditions when:

- Multiple submissions happen in quick succession
- A submission is canceled by a forced reset
- Async operations complete out of order

## Best Practices

### Form Input Components

1. Create reusable form input components:

   - Encapsulate common input patterns
   - Handle accessibility attributes
   - Manage error states consistently
   - Apply consistent styling

2. Email input recommendations:

   ```tsx
   <FormInput
     type="text" // Use text type for better control
     inputMode="email" // Shows email keyboard on mobile
     autoCapitalize="off" // Prevents auto-capitalization
     autoComplete="email" // Enables browser autofill
   />
   ```

   Why not `type="email"`?

   - Browser validation can be inconsistent
   - Less control over validation timing
   - May interfere with custom validation
   - Mobile keyboards can be less user-friendly

3. Number input considerations:

   ```tsx
   <FormInput
     type="text"
     inputMode="numeric" // Shows number keyboard on mobile
     pattern="[0-9]*" // Allows only numbers
   />
   ```

   Why not always `type="number"`?

   - Prevents unwanted increment/decrement buttons
   - Better control over formatting
   - Avoids browser-specific quirks

4. General input attributes:

   ```tsx
   <FormInput
     aria-required={true} // Accessibility
     aria-invalid={!!error} // Error state for screen readers
     aria-describedby="error-id" // Links to error message
   />
   ```

5. Consider creating specialized components:

   ```tsx
   // Instead of raw FormInput
   <FormInput type="text" inputMode="email" ... />

   // Create purpose-built components
   <EmailInput />
   <PhoneInput />
   <CurrencyInput />
   ```

   Benefits:

   - Consistent behavior across forms
   - Encapsulated validation logic
   - Proper accessibility defaults
   - Standardized formatting

### Handling Async Validation

For operations like username availability checks, careful handling of race conditions and validation timing is crucial:

1. Basic Setup:

   ```tsx
   function UsernameAvailability({ username }: { username: string }) {
     const [checking, setChecking] = useState(false);
     const [available, setAvailable] = useState<boolean | null>(null);
     const timeoutRef = useRef<number>();
     const currentUsernameRef = useRef(username);
     const form = useFormContext();
   }
   ```

2. Race Condition Prevention:

   - Track current value with a ref
   - Clear pending checks when value changes
   - Verify validity at multiple points

   ```tsx
   useEffect(() => {
     currentUsernameRef.current = username;

     // Clear previous check
     if (timeoutRef.current) {
       clearTimeout(timeoutRef.current);
     }

     // Pre-check validation
     if (!isValid) return;

     timeoutRef.current = setTimeout(async () => {
       try {
         // Pre-request validation
         if (!isValid || currentUsernameRef.current !== username) return;

         await checkAvailability(username);

         // Post-request validation
         if (currentUsernameRef.current === username && isValid) {
           setAvailable(true);
         }
       } catch (error) {
         if (currentUsernameRef.current === username) {
           setAvailable(false);
         }
       }
     }, 500);

     return () => clearTimeout(timeoutRef.current);
   }, [username]);
   ```

3. Validation Timing:

   - Check before starting debounce timer
   - Check before making request
   - Check after receiving response
   - Only apply results if value unchanged

4. UX Considerations:

   - Show loading state during check
   - Clear results when value changes
   - Only show availability for valid values
   - Use appropriate icons/colors for status

5. Error Handling:
   - Handle network errors gracefully
   - Clear status on validation errors
   - Manage server-side errors appropriately

Example Implementation:

```tsx
function UsernameAvailability({ username }: { username: string }) {
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<number>();
  const currentUsernameRef = useRef(username);
  const form = useFormContext();

  useEffect(() => {
    currentUsernameRef.current = username;
    setAvailable(null);
    setError(null);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const errors = form.getError(['username']);
    if (!username || errors.length > 0) {
      setChecking(false);
      return;
    }

    setChecking(true);
    timeoutRef.current = window.setTimeout(async () => {
      try {
        // Pre-request check
        if (!isValid(username) || currentUsernameRef.current !== username) {
          return;
        }

        await checkAvailability(username);

        // Post-request check
        if (currentUsernameRef.current === username && isValid(username)) {
          setAvailable(true);
        }
      } catch (error) {
        if (currentUsernameRef.current === username) {
          // Check if it's an availability error vs network/server error
          if (error.type === 'taken') {
            setAvailable(false);
          } else {
            setError('Unable to check availability. Please try again.');
          }
        }
      } finally {
        setChecking(false);
      }
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [username]);

  if (!username || !isValid(username)) return null;

  return (
    <div className="mt-1 text-sm flex items-center">
      {checking ? (
        <>
          <LoadingSpinner className="w-4 h-4 mr-2" />
          <span className="text-gray-600">Checking availability...</span>
        </>
      ) : error ? (
        <>
          <AlertTriangle className="w-4 h-4 mr-2 text-yellow-600" />
          <span className="text-yellow-600">{error}</span>
        </>
      ) : available === true ? (
        <>
          <Check className="w-4 h-4 mr-2 text-green-600" />
          <span className="text-green-600">Username is available</span>
        </>
      ) : available === false ? (
        <>
          <X className="w-4 h-4 mr-2 text-red-600" />
          <span className="text-red-600">Username is already taken</span>
        </>
      ) : null}
    </div>
  );
}
```

## Validation

### Schema Definition

```tsx
import { z } from 'zod';

const userSchema = z.object({
  name: z.string().min(2),
  details: z.object({
    age: z.number().min(0),
    bio: z.string().optional(),
  }),
  todos: z.array(
    z.object({
      text: z.string(),
      completed: z.boolean(),
    })
  ),
});

type UserForm = z.infer<typeof userSchema>;
```

### Server-Side Errors

Server errors should be structured to match form fields and can be set using the form instance:

```typescript
interface ValidationError {
  path: (string | number)[];
  message: string;
  source?: 'client' | 'server';
}

// Example server errors
const errors = [
  { path: ['name'], message: 'Name already taken', source: 'server' },
  { path: ['details', 'age'], message: 'Must be over 18', source: 'server' },
  {
    path: ['todos', 0, 'text'],
    message: 'Invalid todo text',
    source: 'server',
  },
];

// Set server errors using the form instance
form.setServerErrors(errors);
```

## Form State Management

### Error Handling

- Client-side validation (Zod) runs immediately
- Manual validation available via `validate()`
- `setValue` automatically clears server errors and triggers validation
- Required field errors only show after touch or submit
- Server-side errors persist until field is edited
- Array field errors track by index
- Nested object errors maintain path structure
- Root level errors possible with .strict() schemas

### Form Validation States

The form provides two distinct validation states:

1. `isValid`: Indicates if there are no errors for fields that have been touched or interacted with. This is useful for showing validation feedback as users fill out the form.

2. `canSubmit`: Indicates if the entire form passes Zod schema validation, regardless of which fields have been touched. This is useful for controlling when to enable the submit button.

Example usage with a submit button:

```tsx
function MyForm() {
  const form = useFormContext();

  return (
    <form onSubmit={form.submit}>
      {/* Form fields */}

      <button
        type="submit"
        disabled={!form.canSubmit || form.isSubmitting}
        className="submit-button"
      >
        {form.isSubmitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
```

This pattern ensures the submit button is only enabled when the entire form is valid according to the Zod schema, providing a better user experience by preventing submission attempts with invalid data.

#### Error Priority

1. Server errors (cleared on edit)
2. Zod validation errors (if field touched or form submitted)
3. Required field errors (if field touched or form submitted)

### Strict Mode Validation

When using Zod's .strict(), unknown fields trigger root errors:

```tsx
const schema = z
  .object({
    name: z.string(),
  })
  .strict();

// If data has unknown field 'age':
const error = {
  path: [], // Empty path indicates root error
  message: "Unrecognized key(s) in object: 'age'",
};
```

## Example Usage

### Basic Form

```tsx
function BasicForm() {
  const form = useFormContext();

  return (
    <FormProvider
      initialValues={{ name: '', email: '' }}
      schema={z.object({
        name: z.string().min(2),
        email: z.string().email(),
      })}
      onSubmit={async (values, helpers) => {
        await submitToServer(values);
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.submit();
        }}
      >
        <NameField />
        <EmailField />
        <SubmitButton />
      </form>
    </FormProvider>
  );
}
```

### Nested Objects

```tsx
function NestedForm() {
  return (
    <FormProvider
      initialValues={{
        user: {
          profile: {
            name: '',
            bio: '',
          },
        },
      }}
      schema={z.object({
        user: z.object({
          profile: z.object({
            name: z.string(),
            bio: z.string(),
          }),
        }),
      })}
    >
      <ProfileSection />
    </FormProvider>
  );
}
```

### Dynamic Arrays

```tsx
function TodoForm() {
  const todos = useArrayField(['todos']);

  return (
    <div>
      {todos.items.map((_, index) => (
        <TodoItem
          key={index}
          index={index}
          onRemove={() => todos.remove(index)}
          onMoveUp={() => todos.move(index, index - 1)}
          onMoveDown={() => todos.move(index, index + 1)}
        />
      ))}
      <button onClick={() => todos.add({ text: '', completed: false })}>
        Add Todo
      </button>
    </div>
  );
}
```

### Form with Server Validation

```tsx
function UserForm({ onSubmit }) {
  return (
    <FormProvider
      initialValues={{ username: '', email: '' }}
      schema={userSchema}
      onSubmit={async (values, helpers) => {
        try {
          const errors = await checkServerValidation(values);
          if (errors.length > 0) {
            helpers.setServerErrors(errors);
            return;
          }
          await onSubmit(values);
        } catch (error) {
          helpers.setServerErrors([
            {
              path: [],
              message: 'An unexpected error occurred',
              source: 'server',
            },
          ]);
        }
      }}
    >
      <UserFormFields />
    </FormProvider>
  );
}
```

### Using the Native HTML Form Tag

The FormProvider can now automatically wrap your form in a native HTML `<form>` tag, handling the `preventDefault` behavior for you:

```tsx
function ContactForm() {
  return (
    <FormProvider
      initialValues={{ name: '', email: '' }}
      schema={contactSchema}
      onSubmit={handleSubmit}
      useFormTag={true} // Enable the form tag wrapper
      formProps={{
        className: 'my-form-styles',
        id: 'contact-form',
        'aria-label': 'Contact form',
      }}
    >
      <NameField />
      <EmailField />

      {/* Use a regular HTML submit button */}
      <button type="submit">Submit Form</button>
    </FormProvider>
  );
}
```

Benefits of using the native form tag:

- Works with browser's built-in form submission (Enter key submits the form)
- Allows using standard HTML form attributes
- Supports native HTML form validation alongside Zod validation
- Improves accessibility with proper form semantics

### Multiple Children in FormProvider

The FormProvider can accept multiple children, allowing you to split your form into separate components while sharing the same form context:

```tsx
function MultiSectionForm() {
  return (
    <FormProvider
      initialValues={{
        firstName: '',
        lastName: '',
        email: '',
        age: 0,
      }}
      schema={userSchema}
      onSubmit={handleSubmit}
    >
      {/* Each component can access the same form context */}
      <PersonalInfoSection />
      <ContactInfoSection />
      <FormState />
      <SubmitButton />
    </FormProvider>
  );
}

// Example of a component that accesses the form context
function PersonalInfoSection() {
  const form = useContext(FormContext);

  if (!form) {
    throw new Error('PersonalInfoSection must be used within a FormProvider');
  }

  return (
    <div className="section">
      <h3>Personal Information</h3>
      <FormInput
        label="First Name"
        value={form.getValue(['firstName'])}
        onChange={(value) => form.setValue(['firstName'], value)}
        onBlur={() => form.setFieldTouched(['firstName'], true)}
        errorText={form.getError(['firstName'])[0]?.message}
        touched={!!form.touched['firstName']}
      />

      <FormInput
        label="Last Name"
        value={form.getValue(['lastName'])}
        onChange={(value) => form.setValue(['lastName'], value)}
        onBlur={() => form.setFieldTouched(['lastName'], true)}
        errorText={form.getError(['lastName'])[0]?.message}
        touched={!!form.touched['lastName']}
      />
    </div>
  );
}

// Submit button component
function SubmitButton() {
  const form = useContext(FormContext);

  if (!form) {
    throw new Error('SubmitButton must be used within a FormProvider');
  }

  return (
    <button
      type="button"
      onClick={() => form.submit()}
      disabled={form.isSubmitting}
    >
      {form.isSubmitting ? 'Submitting...' : 'Submit Form'}
    </button>
  );
}
```

This pattern is useful for:

- Breaking large forms into logical sections
- Creating reusable form components
- Separating form UI from form logic
- Building wizard-like interfaces where different sections share state
