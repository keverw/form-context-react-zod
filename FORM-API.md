# Form Library API Documentation

## Overview

A TypeScript-first form management library that handles complex nested forms with validation, server-side errors, and array fields. Built with Zod for type-safe schema validation.

## Core Components

### FormProvider

The FormProvider manages the form state and provides context for all form hooks. It accepts:

```tsx
interface FormProviderProps<T> {
  initialValues: T; // Required. Starting form values.
  initialServerErrors?: ValidationError[]; // Server errors to seed at mount (normalized to source: 'server'). Use path [] for a root error. Touch-independent. Cleared by reset(). Default: []
  onSubmit?: FormSubmitHandler<T>; // (values: T, helpers: FormHelpers<T>) => Promise<void> | void. Default: undefined (no-op on submit)
  schema?: z.ZodType<T>; // Zod schema used for validation. Default: undefined (no validation)
  validateOnMount?: boolean; // Validate on mount; by default touches only populated fields (errors for loaded/prefilled data show; empty fields stay quiet). Default: false
  touchAllOnMount?: boolean; // With validateOnMount, mark ALL fields touched to reveal every error on load. Default: false
  validateOnChange?: boolean; // Whether to run validation on every change. Default: true
  validateOnBlur?: boolean; // Whether leaving a field (blur) runs validation. Default: true

  useFormTag?: boolean; // Whether to wrap children in a <form> HTML tag. Default: false
  formProps?: React.FormHTMLAttributes<HTMLFormElement>; // HTML attributes for the form element. Default: undefined
  children: React.ReactNode | React.ReactNode[]; // Required. Accepts a single child or multiple children.
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
- `submitAttempted`: Boolean — `true` once the user has tried to submit at all, pass or fail. Stays `true` for the duration of the submission and after it settles; cleared by `reset`/`resetWithValues`. Use it _alongside_ `touched` to reveal errors — gate on `touched[field] || submitAttempted` so each field shows its error once the user has interacted with it **or** has hit submit (which surfaces errors on fields they skipped). `submit()` also marks every field touched, so on its own `touched` covers this; `submitAttempted` is the cleaner signal if you'd rather key the "reveal everything" moment off the attempt itself.
- `submitSucceeded`: Boolean — `true` only if the **most recent** attempt completed cleanly: validation passed, `onSubmit` resolved without throwing, **and** the handler set no submission errors (no `setServerError(s)` / `setClientSubmissionError`). It's `false` while a submit is in flight and flips to its final value when the attempt settles.
- `submitCount`: Number — running count of submit attempts (bumped at the start of each `submit()`, including ones that fail validation). Reset to `0` by `reset`/`resetWithValues`.
- `errors`: Current validation/server errors
- `lastValidated`: Timestamp of the last validation

- Form operations:

  - `submit()`: Trigger form submission
  - `reset(force?: boolean): boolean`: Reset the form back to the original `initialValues` prop.
    Returns `true` if it ran.
  - `resetWithValues(newValues, force?): boolean`: Same as `reset`, but resets to a
    caller-supplied set of values instead of `initialValues`.
  - `validate(force?: boolean)`: Manually trigger form validation
  - `validateField(path): boolean`: Imperatively validate **one** field ("trigger").
    Marks it touched and re-runs the schema (Zod validates the whole object, but only
    this field's error is surfaced/reconciled), returning whether the field is now
    error-free. See the note below on how it differs from `handleBlur`.

**`reset` vs `resetWithValues`** — they're the same operation with a different target. Both clear
touched state, validation errors, and server errors, clear the submit-attempt tracking
(`submitAttempted`/`submitSucceeded` back to `false`, `submitCount` back to `0`), and set
`canSubmit=false` / `lastValidated=null`. `reset()` restores the original `initialValues` (fixed at mount);
`resetWithValues(x)` adopts `x` instead — use it to accept the server's canonical record after a
save, or to load a different record into the same form. Note: `resetWithValues` does **not** move
the `reset()` baseline — a later `reset()` still returns to the original `initialValues`.

**Resetting mid-submit** — while a submission is in flight (`isSubmitting === true`, e.g. inside
`onSubmit`), both `reset()` and `resetWithValues()` **no-op**: they log a warning and return
`false`. Pass `force: true` to reset anyway — this **invalidates the in-flight submission** first,
then resets. "Invalidates" means the bookkeeping only: it flips `isSubmitting` off and clears the
current submission ID, so any `helpers.*` writes from the now-stale `onSubmit` become no-ops (they're
all guarded by `isCurrentSubmission`). It does **not** abort your network request — there's no
`AbortSignal` passed to `onSubmit`. If you need to actually stop the fetch, bring your own
`AbortController`: capture `helpers.currentSubmissionID` at the top of `onSubmit`, and after each
`await` check `helpers.isCurrentSubmission(id)` to detect that you were superseded (then `abort()` /
bail). To re-baseline after a successful save without invalidating anything, call reset **after**
`submit()` resolves (when `isSubmitting` is already back to `false`).

The `useFormTag` prop allows wrapping the form content in a native HTML `<form>` tag with automatic `preventDefault` handling on submit events. When enabled, you can use standard HTML submit buttons instead of manually calling `form.submit()`.

Value operations:

- `getValue(path)`: Get value at specific path
- `setValue(path, value)`: Set value at specific path. Marks the path touched, clears existing errors at that path **and any descendant paths** (all sources — assigning a value replaces the whole subtree), and re-validates when `validateOnChange` is on.
- `getValue<K extends keyof T>([key]: [K]): T[K]`: Get value at a top-level key with type safety.
- `getValue(path: (string|number)[]): unknown`: Get value at any specific path.
- `setValue<K extends keyof T>([key]: [K], value: T[K])`: Set value at a top-level key with type safety.
- `setValue(path: (string|number)[], value: V)`: Set value at any specific path
- `clearValue(path)`: Reset field to an empty value based on its type. A thin wrapper over `setValue(path, <empty>)`, so it has the same side effects — marks touched, clears the field's errors (whole subtree, all sources), and re-validates.
- `deleteField(path)`: Remove field at path. For an array item, later items' metadata (touched + errors, all sources) re-indexes down to follow them, instead of being wiped.
- `reindexArray(arrayPath, newItems, indexMap)`: Low-level primitive that replaces an array and atomically re-indexes its item metadata (touched, validation + server errors) via `indexMap` (old index → new index, or `null` to drop). Prefer the [`useArrayField`](#usearrayfield) helpers, which wrap it.
- `hasField(path)`: Check if field exists
- `getValuePaths(path?: (string|number)[]): (string|number)[][]`: Get all value paths under given path

Error operations:

- `getError(path)`: Get array of errors at specific path level
- `getErrorPaths(path?: (string|number)[]): (string|number)[][]`: Get all error paths under given path
- `getFieldState(path): FieldState`: Convenience snapshot of one field in a single call — `{ errors, error, isTouched, invalid, exists }`. A pure read over `getError(path)` + the `touched` lookup + `hasField(path)`. Note the errors here are **raw** (not gated on `touched`), so `invalid`/`error` reflect the field's real validation state — handy for raw-context fields that want a field's error/touched/validity without wiring up [`useField`](#usefield) (whose display `error` _is_ touched-gated).
- `setErrors(errors)`: Set all errors (replaces existing errors)
- `setServerErrors(errors)`: Replace all server errors with new ones
- `setServerError(path, message)`: Set server error(s) for a specific path
- `setError(path, message)`: Set (or clear, with `null`) a **manual/client** error at one path — same `string | string[] | null` shape as `setServerError`. The error is tagged `source: 'manual'` and behaves exactly like a server error (see [Error sources](#error-sources) below): it survives re-validation, shows regardless of `touched`, and clears when the field is edited or on submit/reset. Use it for client-owned checks Zod can't express (an async "username taken" surfaced client-side, a cross-field rule you'd rather run imperatively, etc.). Also available on the `onSubmit` helpers; pass `[]` as the path for a form-level error.

#### Error sources

Every `ValidationError` carries a `source` that controls its lifecycle:

| `source`               | Set by                        | Survives re-validation? | Shown when untouched? | Cleared by                                  |
| ---------------------- | ----------------------------- | ----------------------- | --------------------- | ------------------------------------------- |
| `client`               | Zod schema validation         | No — recomputed each validate | No              | recomputed every validate; edit clears path |
| `server`               | `setServerError(s)`           | Yes                     | Yes                   | editing the field, submit start, reset      |
| `manual`               | `setError`                    | Yes                     | Yes                   | editing the field, submit start, reset      |
| `client-form-handler`  | `setClientSubmissionError`    | n/a (form-level)        | n/a                   | submit start, `clearClientSubmissionError`  |

`manual` is deliberately parallel to `server` — same rules, a different label so you can tell a server-reported error from a client-set one and own each channel independently. The only difference is plumbing: `server` errors also live in an internal canonical store (used by `setServerErrors` replace-all), whereas `manual` errors live only in the main error list. Like server errors, a `manual` error does **not** gate `canSubmit` (which is schema-only). But setting one from inside `onSubmit` **does** mark the attempt as failed — `submitSucceeded` stays `false`, the same as `setServerError`/`setClientSubmissionError` — so a client-side check that rejects a submit reads correctly.

##### Form-level errors: `setError([])` vs `setClientSubmissionError`

Both put an error at the form/root level, but they're **separate channels, not two names for the same thing** — different `source`, different storage, different retrieval:

- `setError([], msg)` → a `source: 'manual'` error at path `[]`, read back via `getError([])` (alongside any root validation errors). It's a _field-style_ error that happens to live at the root, and it persists like other field errors.
- `setClientSubmissionError(msg)` → a `source: 'client-form-handler'` error in a dedicated store, read back via `getClientSubmissionError()`. It's purpose-built for "the submission itself failed" (network/auth), kept apart from field/validation errors and cleared by `clearClientSubmissionError()`.

Reach for `setClientSubmissionError` for submit-failure banners; use `setError([])` when you want a root-level error that sits in the same list as your field errors.

Touch state operations:

- `setFieldTouched(path, value?)`: Mark field as touched/untouched
- `handleBlur(path)`: Blur handler for a field — marks it touched **and**, when
  `validateOnBlur` is enabled, runs validation so leaving a field invalid surfaces
  its error. `useField` wires this into its `props.onBlur` automatically. If you
  wire fields manually from the context, call `form.handleBlur(path)` on blur
  (instead of just `setFieldTouched`) so `validateOnBlur` works — and gate your
  error display on `touched` so only fields the user has interacted with show errors.

**`validateField(path)` vs `handleBlur(path)`** — they overlap (both touch the field
and can surface its error), but they're for different jobs:

- `handleBlur` is the **blur event handler** you wire to `onBlur`. It marks touched and
  validates **only if the `validateOnBlur` prop is enabled** (otherwise it just marks
  touched), and it returns nothing. It's event-driven UI plumbing.
- `validateField` is an **imperative trigger** you call yourself — e.g. validate a field
  before enabling a button, on a custom event, or inside an async flow. It **always**
  validates regardless of `validateOnBlur`/`validateOnChange`, and **returns the field's
  validity** (`boolean`). It also reconciles just that one field's error, so it's correct
  even when fixing the field made the whole form valid.

In short: blur handler → `handleBlur`; "validate this field now and tell me if it
passed" → `validateField`.

### FormSubmitHandler

`onSubmit` is typed as `FormSubmitHandler<T>`. Declare the value type once and both
`values` and `helpers` are inferred from it:

```tsx
export type FormSubmitHandler<T> = (
  values: T,
  helpers: FormHelpers<T>
) => Promise<void> | void;

// Usage — the value type is written only once:
const onSubmit: FormSubmitHandler<z.infer<typeof schema>> = async (
  values,
  helpers
) => {
  // `values` and `helpers` are fully typed
};
```

### FormHelpers Interface

```tsx
export interface FormHelpers<T> {
  setErrors: (errors: ValidationError[]) => void;
  setServerErrors: (errors: ValidationError[]) => void;
  setServerError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  setError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  setClientSubmissionError: (message: string | string[] | null) => void;
  clearClientSubmissionError: () => void;
  getClientSubmissionError: () => string[];
  setValue<K extends keyof T>(path: [K], value: T[K]): void;
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  clearValue: (path: (string | number)[]) => void;
  deleteField: (path: (string | number)[]) => void;
  validate: (force?: boolean) => boolean;
  hasField: (path: (string | number)[]) => boolean;
  touched: Record<string, boolean>;
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  reset: (force?: boolean) => boolean;
  resetWithValues: (newValues: T, force?: boolean) => boolean;
  currentSubmissionID: string | null;
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

**Seeding server errors at mount (`initialServerErrors`)**

When you render a form for a record the server has already flagged (e.g. SSR
hydrating a "pending review" account), you can seed server errors declaratively
instead of calling the API from an effect:

```tsx
<FormProvider
  initialValues={record}
  initialServerErrors={[
    { path: [], message: 'This account is pending review.' }, // root/form-level
    { path: ['username'], message: 'Username already taken' },
    { path: ['email'], message: 'Email domain not allowed' },
  ]}
  schema={schema}
  onSubmit={onSubmit}
>
  …
</FormProvider>
```

- Entries are normalized to `source: 'server'`, so you can omit `source`.
- A `path` of `[]` is a root (form-level) error — render it with `RootErrors` /
  `getError([])`.
- These render **immediately and regardless of touched state** (unlike Zod
  validation errors, which gate on `touched`).
- Later `setServerError(s)` calls merge from this seeded baseline: updating one
  path leaves the others intact.
- `reset()` / `resetWithValues()` **clear** server errors (clean slate) and do
  **not** restore the seeds. Re-seeding only happens on a fresh mount.

### Error Types in the Form System

The form library handles three distinct types of errors:

1. **Client Validation Errors**: Generated automatically by Zod schema validation. These are field-specific errors based on your schema rules (e.g., "Email must be valid", "Name is required").

2. **Server Validation Errors**: Set with `setServerErrors()` or `setServerError()`. These represent validation errors originating from your backend API after a submission attempt (e.g., "Username already taken", "Email domain is blocked").

   - `setServerErrors(errors: ValidationError[])`: This function **replaces all existing server errors** with the new array of errors provided. It effectively gives you a clean slate for server-side issues while preserving any client-side Zod validation errors. Use this when you want to set a complete new list of server errors, perhaps after an API response that details all current issues.
   - `setServerError(path: (string | number)[], message: string | string[] | null)`: This function targets errors for a **specific field path**.
     - If a `message` (or an array of messages) is provided, it **replaces any existing server errors at that exact path** with the new message(s).
     - If `null` is passed as the `message`, it **clears all server errors for that specific path only**.
     - This method is useful for granular control, like updating or clearing an error for a single field without affecting server errors on other fields.

3. **Client Submission Errors**: Set with `setClientSubmissionError()`. Each call to this function **replaces any previous client submission errors**. These are for general submission failures like network issues, authentication problems, or any other client-side issue preventing successful form submission. Use `null` to clear all client submission errors.

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
```

Client submission errors are always displayed at the root level of the form and are ideal for situations where the entire form submission fails for reasons unrelated to individual field validation.

Important Server Error Behaviors:

1. `setServerErrors(errors: ValidationError[])`:

   - **Scope**: Affects _all_ server errors across the entire form.
   - **Action**: Replaces ALL existing server errors with the `errors` array you provide.
   - Preserves client-side Zod validation errors.
   - Ignores errors in the provided array that target non-existent paths (except for root-level errors, i.e., `path: []`, which are always allowed).
   - **Use Case**: Ideal for initializing or completely refreshing all server-side validation feedback after an API call.
   - To clear all server errors globally, call `form.setServerErrors([])`.

2. `setServerError(path: (string | number)[], message: string | string[] | null)`:

   - **Scope**: Affects only the server errors for the _exact_ `path` specified.
   - **Action with message(s)**: If `message` is a string or an array of strings, it replaces any existing server errors _only at that specific path_ with the new message(s).
   - **Action with `null`**: If `message` is `null`, it clears all server errors _only for that specific path_.
   - Replaces ALL existing server errors
   - Preserves validation errors
   - Ignores errors for non-existent paths
   - Root errors (empty path) always allowed

3. `setServerError`:
   - Replaces server errors at the SAME path level only
   - Accepts single message or array of messages
   - Ignores non-existent paths (except root)
   - Preserves server errors at other paths
   - Preserves all validation errors
   - Pass `null` to clear all server errors at the specified path
   - Use `setServerErrors([])` to clear all server errors while preserving validation errors

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

// Snapshot one field's state in a single call
const state = form.getFieldState(['email']);
// state.errors   -> ValidationError[] (raw, all sources)
// state.error    -> 'Invalid email format' | null (first message)
// state.isTouched -> boolean
// state.invalid  -> boolean (state.errors.length > 0)
// state.exists   -> boolean (false for a missing/typo'd path)
```

`getFieldState` returns a `FieldState`:

```tsx
export interface FieldState {
  /** All errors at this exact path (validation + server), unfiltered. */
  errors: ValidationError[];
  /** The first error message, or null if the field has no errors. */
  error: string | null;
  /** Whether the field has been touched (blurred or edited). */
  isTouched: boolean;
  /** Whether the field currently has any error. */
  invalid: boolean;
  /** Whether the path is present in the form's `values` (a `hasField` read). */
  exists: boolean;
}
```

Unlike [`useField`](#usefield)'s display `error` (which is gated on `touched` so
untouched fields stay quiet), the errors in `FieldState` are **raw** — `invalid`
and `error` reflect the field's real validation state. Gate on `isTouched`
yourself if you only want to show errors after interaction.

`FieldState` is a snapshot read at call time, not a live object. Call
`getFieldState(path)` during render and it stays in sync because your component
re-renders when the form's touched or error state changes. Don't stash the
returned object and expect it to update on its own — read it fresh each render.

A path that doesn't exist doesn't throw — like `getError` and the `touched`
lookup it builds on, it reads as a clean state: `{ errors: [], error: null,
isTouched: false, invalid: false, exists: false }`. The `exists` flag is how you
tell a missing/typo'd field apart from a present one.

`exists` reflects presence in `values` only and is independent of the error
fields. A required schema field that hasn't been filled in is absent from
`values`, so once validation runs it can read `exists: false` **and**
`invalid: true` at the same time. Use `exists` to catch a typo'd or never-set
path, not to decide whether a field has errors.

### Performance Optimizations

The form library includes several performance optimizations:

1. Batched updates:

Each public mutator (e.g. `setValue`, `setFieldTouched`, `setServerError`) collects all its internal state tweaks into one dispatch() call—so one re-render per operation, no matter how many bits of state it changes.

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
const {
  items,
  arrayFieldIDs,
  add,
  remove,
  move,
  insert,
  prepend,
  swap,
  replace,
  update,
} = useArrayField(path);
```

Array operations. The reordering ops re-index the errors and touched markers under
the array so they follow their items:

- `items`: the current array value (always an array; `[]` if the path isn't one).
- `arrayFieldIDs`: a stable id per item, parallel to `items`. Use it as the React
  `key` instead of the array index — see "Stable keys" below.
- `add(item)`: append an item to the end.
- `prepend(item)`: insert an item at the front (`insert(0, item)`).
- `insert(index, item)`: insert at `index` (clamped to `[0, length]`); items at/after it shift up.
- `remove(index)`: remove the item at `index`; later items shift down to fill the gap, and their errors/touched markers shift with them (the removed item's are dropped).
- `move(from, to)`: reorder one item; intermediate items shift to fill the gap.
- `swap(a, b)`: exchange two items; their errors/touched follow them.
- `replace(newItems)`: replace the whole array. Per-index errors/touched no longer
  correspond to the new items, so they're dropped (validation regenerates as fields
  are touched).
- `update(index, item)`: replace a single item. Convenience for
  `form.setValue([...path, index], item)`.

Example:

```tsx
const todos = useArrayField(['todos']);

todos.add({ text: '', completed: false }); // append
todos.prepend({ text: '', completed: false }); // front
todos.insert(2, { text: '', completed: false }); // at index 2
todos.remove(0); // remove (later items' errors shift down)
todos.move(0, 1); // reorder (errors follow)
todos.swap(0, 2); // exchange (errors follow)
todos.update(1, { text: 'done', completed: true }); // replace one
todos.replace([{ text: 'fresh', completed: false }]); // replace all
```

> How re-indexing works: `move`/`swap`/`insert`/`replace` delegate to the context's
> `reindexArray` primitive, which updates the values and re-indexes the item
> metadata — touched markers, validation errors, **and** the internal server-error
> baseline — in a single atomic update. `remove` goes through `deleteField`, which
> shares the same remap, so a removal shifts later items' metadata down by one
> rather than wiping it (a direct `form.deleteField([...path, i])` behaves the same).
> Because server/manual errors aren't touch-gated, they aren't cleared by a
> reorder/removal; they move with their item. A later
> `setServerError`/`setServerErrors` therefore rebuilds from the correct
> (re-indexed) baseline.

**Stable keys (`arrayFieldIDs`)**

When you render an array with `.map()`, keying by the array **index** makes React
reuse component instances _positionally_ — so on a reorder/insert, an input's focus,
cursor position, and uncontrolled state stay pinned to the slot instead of following
the item. `arrayFieldIDs` gives each item a stable id that moves with it, so keying by
it preserves the right instance:

```tsx
const { items, arrayFieldIDs, move } = useArrayField(['todos']);

return items.map((_, index) => (
  <TodoRow
    key={arrayFieldIDs[index]}
    index={index}
    onMoveUp={() => move(index, index - 1)}
  />
));
```

The ids stay aligned no matter **how** the array changes — not just through the
`useArrayField` ops. The context broadcasts every structural change with its intent,
and the hook applies it:

- `move`/`swap`/`insert`/`remove` (and a direct `form.deleteField([...path, i])`):
  the change carries an old→new index map, so each id follows its item exactly.
- `update` keeps an item's id (same slot); `add` mints a fresh id for the new item.
- A **wholesale** replacement carries no old→new mapping, so the ids are **re-minted**
  (the honest result — there's no way to know which new item is which old one). This
  covers `replace`, `form.setValue(path, newArray)`, replacing a **parent object** that
  contains the array (`form.setValue(['profile'], { phones })`), and a form-wide `reset()`.
- A **nested** array (e.g. `useArrayField(['sections', 0, 'questions'])`) is pinned to a
  fixed item index, so if its **ancestor** array reorders and a different item lands at
  that index, its ids re-mint; a reorder that doesn't touch that index leaves them alone.

So editing field values never disturbs the ids, and reshaping the array — through the
hook ops _or_ directly via the context — keeps them correct. (One minor note: the ids
are per-hook-instance, so two `useArrayField` on the same path generate independent
id sets.)

## Form Submission

When using the `onSubmit` prop, it receives the form values and a set of helper functions:

```tsx
<FormProvider
  initialValues={{ name: '', email: '' }}
  onSubmit={async (values, helpers) => {
    try {
      // The current submission ID is available in helpers
      const { currentSubmissionID } = helpers;

      // Attempt to submit the form
      const result = await submitToServer(values);

      // Check if this submission is still current before updating
      if (helpers.isCurrentSubmission(currentSubmissionID)) {
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
- `currentSubmissionID`: The ID of the current submission
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
  const { currentSubmissionID, isCurrentSubmission } = helpers;

  // Start an async operation
  const result = await someAsyncOperation();

  // Check if this submission is still current before updating
  if (isCurrentSubmission(currentSubmissionID)) {
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
// This is the "async validation, done app-side" pattern: the library core stays
// synchronous (Zod), and you run the async check yourself and feed the result back.
// Here the status lives in local state; you can ALSO surface it in the form via
// `form.setServerError(['username'], taken ? 'Taken' : null)` — server errors are
// touch-independent feedback, so they show immediately. Note this does NOT block
// submission: submit() is gated only by Zod schema validity, and it CLEARS server
// errors at the start of each attempt. To actually prevent submitting an unavailable
// username, disable your submit button while the check is pending/failed (or while
// `form.getError(['username'])` is non-empty), or re-run the check inside `onSubmit`.
function UsernameAvailability({ username }: { username: string }) {
  const [checking, setChecking] = useState(false); // request in flight (show spinner)
  const [available, setAvailable] = useState<boolean | null>(null); // null = unknown yet
  const [error, setError] = useState<string | null>(null); // network/server failure (not "taken")
  const timeoutRef = useRef<number>(); // debounce timer handle
  // Tracks the LATEST username so async callbacks can tell if they're stale (race guard).
  const currentUsernameRef = useRef(username);
  const form = useFormContext();

  useEffect(() => {
    // Runs on every keystroke. Record the latest value and clear any prior result.
    currentUsernameRef.current = username;
    setAvailable(null);
    setError(null);

    // Debounce: cancel the previous pending check so we only hit the network once
    // the user pauses typing (see the 500ms timeout below).
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Don't bother checking an empty value or one Zod already rejects — let the
    // schema's own error show first. (getError gates the network call on validity.)
    const errors = form.getError(['username']);
    if (!username || errors.length > 0) {
      setChecking(false);
      return;
    }

    setChecking(true);
    timeoutRef.current = window.setTimeout(async () => {
      try {
        // Pre-request guard: the value may have changed (or gone invalid) during the
        // 500ms debounce window — if so, skip the request entirely.
        if (!isValid(username) || currentUsernameRef.current !== username) {
          return;
        }

        // This ignores a stale response but doesn't actually abort the request.
        // To truly cancel the in-flight call, create an `AbortController` in the
        // effect, pass `controller.signal` here, and `controller.abort()` in the
        // cleanup below (catch the resulting `AbortError` and ignore it). Purely
        // user-side — no framework change needed.
        await checkAvailability(username);

        // Post-request guard (the important race fix): by the time the request
        // resolves the user may have typed more. Only apply the result if this is
        // STILL the current value — otherwise we'd show a stale "available" answer.
        if (currentUsernameRef.current === username && isValid(username)) {
          setAvailable(true);
        }
      } catch (error) {
        // Same staleness guard on the error path.
        if (currentUsernameRef.current === username) {
          // Distinguish a real "username taken" rejection from a transient
          // network/server failure — only the former means "not available".
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

    // Cleanup: if username changes (or the component unmounts) before the timer
    // fires, cancel it so we never run a check for a value that's already gone.
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [username]);

  // Nothing to show until there's a schema-valid value to check.
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
        email: z.email(),
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
