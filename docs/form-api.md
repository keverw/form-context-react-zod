# Form Library API Documentation

<!-- toc -->

- [Overview](#overview)
- [Core Components](#core-components)
  - [FormProvider](#formprovider)
  - [Dirty Tracking](#dirty-tracking)
    - [Baselines: `reset` vs `markPristine`](#baselines-reset-vs-markpristine)
  - [Focus Management](#focus-management)
    - [Error Sources](#error-sources)
      - [Form-Level Errors: `setError([])` vs `setClientSubmissionError`](#form-level-errors-seterror-vs-setclientsubmissionerror)
  - [FormSubmitHandler](#formsubmithandler)
  - [FormHelpers Interface](#formhelpers-interface)
  - [Error Types in the Form System](#error-types-in-the-form-system)
    - [Client Submission Error Handling](#client-submission-error-handling)
  - [Performance Optimizations](#performance-optimizations)
  - [Hooks](#hooks)
    - [useField](#usefield)
    - [useArrayField](#usearrayfield)
- [Form Submission](#form-submission)
  - [Error Clearing on Resubmission](#error-clearing-on-resubmission)
  - [Resetting the Form](#resetting-the-form)
  - [Resetting With New Values](#resetting-with-new-values)
  - [Submission ID Tracking](#submission-id-tracking)
- [Best Practices](#best-practices)
  - [Form Input Components](#form-input-components)
  - [Handling Async Validation](#handling-async-validation)
- [Validation](#validation)
  - [Schema Definition](#schema-definition)
  - [Server-Side Errors](#server-side-errors)
- [Form State Management](#form-state-management)
  - [Error Handling](#error-handling)
  - [Form Validation States](#form-validation-states)
    - [Error Priority](#error-priority)
  - [Strict Mode Validation](#strict-mode-validation)
- [Example Usage](#example-usage)
  - [Basic Form](#basic-form)
  - [Nested Objects](#nested-objects)
  - [Dynamic Arrays](#dynamic-arrays)
  - [Form With Server Validation](#form-with-server-validation)
  - [Using the Native HTML Form Tag](#using-the-native-html-form-tag)
  - [Multiple Children in FormProvider](#multiple-children-in-formprovider)

<!-- tocstop -->

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
  validateOnMount?: boolean; // Validate on mount; by default touches only populated fields (errors for loaded/prefilled data show; empty fields stay quiet). Requires a `schema` — a no-op without one. Default: false
  touchAllOnMount?: boolean; // With validateOnMount, mark ALL fields touched to reveal every error on load. Also requires `schema` + `validateOnMount` — a no-op otherwise. Default: false
  validateOnChange?: boolean; // Whether to run validation on every change. Default: true
  validateOnBlur?: boolean; // Whether leaving a field (blur) runs validation. Default: true
  children: React.ReactNode | React.ReactNode[]; // Required. Accepts a single child or multiple children.
}
```

> **Entry Points.** The core `FormProvider` above (`form-context-react-zod`)
> renders no host elements, so it works on web and React Native. The web entry
> `form-context-react-zod/web` exports **`WebFormProvider`**, the same provider
> plus two extra props for an HTML `<form>` element (on by default):

```ts
import { WebFormProvider } from 'form-context-react-zod/web';

interface WebFormProviderProps<T> extends FormProviderProps<T> {
  useFormTag?: boolean; // Wrap children in a <form> tag (preventDefault + Enter-to-submit). Default: true
  formProps?: React.FormHTMLAttributes<HTMLFormElement>; // Attributes for the <form>. Default: undefined
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
- `isValid`: Boolean. `true` when the form currently has **no errors at all** from any source, including Zod, server, manual, or client-submission errors, **and** a validation has run (`lastValidated !== null`, or there's no `schema`). It reflects the **whole** form, not just touched fields. Any error anywhere makes it `false`. It is _not_ the touched-gated "is what I've filled so far OK" signal. For that, read a field's own error via [`useField`](#usefield)/`getFieldState`. Note it stays `false` until the first validation runs (on a schema form with `validateOnChange`, that's the first edit). Use `canSubmit` to gate the submit button.
- `canSubmit`: Boolean indicating if the entire form passes Zod schema validation, regardless of which fields have been touched. A form with **no `schema`** is vacuously submittable, so `canSubmit` is `true` for it. **Caveat (schema forms): `canSubmit` starts `false` and only becomes accurate after the first validation pass runs.** Like `isValid`, it stays `false` until something triggers validation, such as the first edit/blur (with the default `validateOnChange`/`validateOnBlur`), a `submit()`, or a manual `validate()`. So a form rendered with **valid `initialValues` that the user hasn't touched yet** reads `canSubmit === false`, which means a submit button wired as `disabled={!form.canSubmit}` is disabled even though the data is valid. If you prefill a form and want the button enabled on load, pass [`validateOnMount`](#formprovider) (which runs a validation pass at mount) or call `form.validate()` yourself.
- `submitAttempted`: Boolean. `true` once the user has tried to submit at all, pass or fail. Stays `true` for the duration of the submission and after it settles, then cleared by `reset`/`resetWithValues`. Use it _alongside_ `touched` to reveal errors. Gate on `touched[serializePath(fieldPath)] || submitAttempted` so each field shows its error once the user has interacted with it **or** has hit submit, which surfaces errors on fields they skipped. (`touched` is keyed by the serialized path, even a single top-level field is `serializePath(['email'])`, i.e. `'["email"]'`, not the bare `'email'`, so always look it up through `serializePath`.) `submit()` also marks every field touched, so on its own `touched` covers this. `submitAttempted` is the cleaner signal if you'd rather key the "reveal everything" moment off the attempt itself.
- `submitSucceeded`: Boolean. `true` only if the **most recent** attempt completed cleanly: validation passed, `onSubmit` resolved without throwing, **and** no submission error is present when it settles. "Submission error" is defined by `source`. Any `server`, `manual`, or `client-form-handler` error left behind by the handler flips it `false`, regardless of which setter created it (`setServerError(s)`, `setError`, `setClientSubmissionError`, or a raw `setErrors` carrying one of those sources). It's `false` while a submit is in flight and flips to its final value when the attempt settles.
- `submitCount`: Number. Running count of submit attempts (bumped at the start of each `submit()`, including ones that fail validation). Reset to `0` by `reset`/`resetWithValues`.
- `currentSubmissionID`: `string | null`. The ID of the in-flight submission, or `null` when none is active (and after a `reset`/`resetWithValues`). Reactive, so it's readable straight off the context (`form.currentSubmissionID`) outside `onSubmit`, not just via the `helpers` object. Pair it with `isCurrentSubmission(id)` to detect a superseded submission. See [Submission ID Tracking](#submission-id-tracking).
- `errors`: Current validation/server errors
- `lastValidated`: Timestamp of the last validation
- `validateOnChange`: Boolean. Mirrors the `validateOnChange` FormProvider prop (default `true`), exposed on the context so a field wiring its own change handler can match the provider's configured behavior. It is read-only and set via the prop. (`setValue` already honors it internally, so you only need this if you bypass `useField`/`setValue` and run change-time validation yourself.)
- `validateOnBlur`: Boolean. Mirrors the `validateOnBlur` FormProvider prop (default `true`), exposed on the context so a field wiring its own blur handler can match the provider's configured behavior. It is read-only and set via the prop.
- `isDirty`: Boolean. `true` when the current values differ from the **dirty baseline**. See [Dirty Tracking](#dirty-tracking).
- `dirtyFields`: `Record<string, boolean>`. Per-field dirty map keyed by serialized path (same shape as `touched`). See [Dirty Tracking](#dirty-tracking).
- `isDirtyAt(path)`: Boolean. Group-level rollup. It is `true` when anything under `path` differs from the dirty baseline (works for object-container paths, leaves, or `[]` for the whole form). See [Dirty Tracking](#dirty-tracking).

- Form operations:

  - `submit(): Promise<boolean>`: Trigger form submission. Resolves to `true` if an attempt actually ran, or `false` if the call was a **no-op** (see below). A `true` only means an attempt ran, not that it passed. Read `submitSucceeded` for the outcome. **Requires an `onSubmit` prop:** with no `onSubmit`, `submit()` is a complete no-op (resolves `false`). It returns immediately and does **not** mark fields touched, run validation, clear server/manual/submission errors, set `submitAttempted`, or bump `submitCount`. So the submit-time behaviors documented for `submitAttempted` / `submitCount` / touched-on-submit all assume an `onSubmit` is set. `submit()` also resolves `false` (with a warning) if a submission is already in flight. If you handle submission yourself (e.g. your own button + `canSubmit`) and want `submit()` to reveal errors, either provide an `onSubmit` or call `validate(true)` directly.
  - `reset(force?: boolean): boolean`: Reset the form back to the original `initialValues` prop.
    Returns `true` if it ran.
  - `resetWithValues(newValues, force?): boolean`: Same as `reset`, but resets to a
    caller-supplied set of values instead of `initialValues`.
  - `validate(force?: boolean)`: Manually trigger form validation
  - `validateField(path): boolean`: Imperatively validate **one** field ("trigger").
    Marks **only that field** touched, so only its error is **revealed** (display is
    touch-gated), returning whether the field is now error-free. It runs the full
    schema and, like [`setValue`](#value-operations), recomputes **every** field's
    underlying Zod error from the result, not just this path's, so a cross-field
    `.refine()` whose error lands on a **sibling** stays current (e.g. fixing this
    field can clear a sibling's now-stale error). Other fields' errors stay
    **touch-gated** in the display, so refreshing them doesn't reveal anything the
    user hasn't interacted with. Running the full schema also refreshes the whole-form
    `canSubmit` and stamps `lastValidated` (so it can flip `canSubmit`/`isValid` as a
    side effect, e.g. enabling a submit button if fixing this field made the whole
    form valid). Only the **revealed (touched) field** is field-scoped. See the note
    below on how it differs from `handleBlur`.
  - `markPristine(path?, value?)`: Move the **dirty baseline** so the current (or an
    explicit) value reads clean. "This is the new saved-clean reference." Baseline-only,
    never touches values/errors/touched. Also accepts a server-returned partial record to
    re-baseline many fields at once. See [Dirty Tracking](#dirty-tracking).
  - `setFocus(path): boolean`: Imperatively focus a field by path. Returns whether a
    registered focusable field was found. See [Focus Management](#focus-management).
  - `focusFirstError(): path | null`: Focus the first registered field that currently has
    an error (registration order). Returns the focused path, or `null`. See
    [Focus Management](#focus-management).

**`reset` vs `resetWithValues`**: They're the same operation with a different target. Both clear
touched state, validation errors, and server errors, clear the submit-attempt tracking
(`submitAttempted`/`submitSucceeded` back to `false`, `submitCount` back to `0`), and set
`canSubmit=false` / `lastValidated=null`. (On a **schema-less** form `canSubmit` is always `true`.
There's nothing to validate, so it still reads `true` after a reset. The `false` here is the
internal flag that the schema-less getter overrides.) `reset()` restores the original `initialValues`, fixed at mount.
`resetWithValues(x)` adopts `x` instead. Use it to accept the server's canonical record after a
save, or to load a different record into the same form. Note: `resetWithValues` does **not** move
the `reset()` baseline. A later `reset()` still returns to the original `initialValues`.

**Resetting Mid-Submit**: While a submission is in flight (`isSubmitting === true`, e.g. inside
`onSubmit`), both `reset()` and `resetWithValues()` **no-op**: they log a warning and return
`false`. Pass `force: true` to reset anyway. This **invalidates the in-flight submission** first,
then resets. "Invalidates" means the bookkeeping: it flips `isSubmitting` off, clears the current
submission ID (so any `helpers.*` writes from the now-stale `onSubmit` become no-ops, guarded by
`isCurrentSubmission`), **and aborts `helpers.signal`**. So if you passed that signal to your request,
the force-reset actually cancels it:

```tsx
const onSubmit: FormSubmitHandler<FormValues> = async (values, helpers) => {
  // Real cancellation — fires on a force-reset (`reset(true)`) or provider unmount.
  const res = await fetch('/api/save', {
    method: 'POST',
    body: JSON.stringify(values),
    signal: helpers.signal,
  });
  // ...
};
```

A normal completion does **not** abort. For robust handling, use **both**, since they cover different
things: `signal` cancels the in-flight request, while `isCurrentSubmission(id)` guards against acting
on a result that landed _anyway_ (a request can resolve in the tiny window before the abort) and
against your **own** side effects that a signal can't cancel (navigation, a toast, non-`helpers` state):

```tsx
const onSubmit: FormSubmitHandler<FormValues> = async (values, helpers) => {
  const id = helpers.currentSubmissionID;
  const res = await fetch('/api/save', {
    method: 'POST',
    body: JSON.stringify(values),
    signal: helpers.signal, // (1) cancels the network request on force-reset/unmount
  });
  const data = await res.json();
  if (!helpers.isCurrentSubmission(id)) return; // (2) superseded? don't act on it
  helpers.resetWithValues(data); // safe — helpers.* are already guarded internally too
  showToast('Saved'); // your own side effect: only runs for the live submission
};
```

(`helpers.*` writes are already internally no-ops when stale, so the `isCurrentSubmission` check is
mainly for your own non-`helpers` side effects.) To re-baseline after a successful save without
invalidating anything, call reset **after** `submit()` resolves (when `isSubmitting` is already back
to `false`).

### Dirty Tracking

The form tracks "has the user changed anything since the last known-clean state?" against a **dirty
baseline**, a snapshot that starts at `initialValues` and moves only when you tell it to.

- `isDirty`: `true` when the current values differ from the baseline. Use it to disable a Save
  button until there's something to save: `disabled={!form.isDirty || form.isSubmitting}`.
- `dirtyFields`: a per-field map keyed by **serialized path** (same shape as `touched`). A leaf
  path maps to `true` when that leaf differs from the baseline. Read it with the `serializePath`
  helper: `form.dirtyFields[serializePath(['email'])]`. Absent keys are clean.
- `isDirtyAt(path)`: a **group-level rollup**. It is `true` when anything under `path` differs from
  the baseline. Unlike `dirtyFields` (which keys leaf/array paths but **not** object containers),
  this works for any path: pass an object-container path to ask "is this whole section unsaved?"
  (`form.isDirtyAt(['address'])`), a leaf path (matches its `dirtyFields` entry), or `[]` for the
  whole form (equivalent to `isDirty`). It's a deep compare of the subtree at `path` against the
  baseline, so an array path reads dirty on any content edit, add/remove, or reorder, and a
  missing path reads clean.

All three are **always derived** by comparing current values to the baseline. Nothing is ever force-flipped. So an edit that returns a field to its baseline value reads clean again on its own.
There is no latched "once dirty, always dirty."

**Objects Are Key-Precise, Arrays Cascade.** This is the one asymmetry to internalize:

- **Plain objects** are compared key by key. Editing `meta.a` marks only `["meta","a"]` dirty.
  `meta.b` and other siblings stay clean.
- **Arrays are compared as a unit.** If an array differs from the baseline in **any** way, whether a content
  edit, an add, a remove, **or a reorder**, then the array's own path **and every field underneath it**
  (recursively, through nested arrays and objects) are marked dirty. So a deep edit at
  `sections[0].questions[0].q` flips `["sections"]`, `["sections",0,"title"]`,
  `["sections",0,"questions"]`, and the edited leaf. That means the whole subtree under the outermost
  changed array is marked dirty. A pure reorder does the same.

  One thing to know about the keys: `dirtyFields` keys **array nodes and leaf values**, not the
  plain-object _containers_ between them. So in the example above `["sections",0]` (an array item,
  which is an object) is **not** keyed, even though its leaf `["sections",0,"title"]` and nested
  array `["sections",0,"questions"]` both are. This is a deliberate difference from `touched`
  (which also marks parent/container paths). It just means you look up a field's **own** leaf
  or array path, never an object-container path. (For a yes/no answer on a whole object section,
  use [`isDirtyAt(['sections', 0])`](#dirty-tracking).)

The practical upshot: a generic field component can always check **its own path** (`dirtyFields[serializePath(myPath)]`)
and get a sensible answer, even for fields nested inside arrays. The tradeoff is that array dirtiness is
all-or-nothing. It does **not** tell you _which_ item changed, since indices aren't stable identities. A
prepend would otherwise falsely flag every later row, so no per-item attribution is attempted. For
per-item change tracking, pair this with the stable item ids from [`useArrayField`](#usearrayfield).

#### Baselines: `reset` vs `markPristine`

There are two baselines and they can legitimately drift:

- `reset()` restores **values** to `initialValues` (the mount snapshot). Think "back to load." It moves
  the dirty baseline back to `initialValues` too, so a freshly reset form is clean. `resetWithValues(x)`
  is the same but to `x`.
- `markPristine(...)` moves **only the dirty baseline**. It never touches values, errors, or touched.
  It's "this is the new saved-clean reference." This is the piece you call after a successful save so
  the form goes clean **without** rewinding what's on screen.

`markPristine` has three forms:

```tsx
form.markPristine(); // baseline the WHOLE form to current values
form.markPristine([]); // same as above (empty path = whole form)
form.markPristine([], wholeObject); // replace the whole baseline with an explicit object
form.markPristine(['email']); // baseline one field to its current value
form.markPristine(['email'], 'a@b.com'); // baseline one field to an explicit (persisted) value
form.markPristine(['user']); // a subtree works too — baselines the whole `user` object
form.markPristine(serverResult); // batch: MERGE a partial record's leaves into the baseline
```

**Batch is a leaf-level merge, not a whole-baseline replace.** You pass only the fields you want
re-baselined. You do **not** need to include the whole containing object. The record is flattened to
its leaves and each one is merged into the baseline. **Everything you omit keeps its existing baseline**:

```tsx
// baseline before: { user: { name: 'old', age: 30 }, theme: 'dark' }
form.markPristine({ user: { name: 'new' } });
// baseline after:  { user: { name: 'new', age: 30 }, theme: 'dark' }
//                                        ^^^^^^^^ age and theme are untouched
```

So a partial record never "applies to the whole thing." It only moves the leaves it contains. (Arrays
are the one stop point: a record's array is merged as one whole value, per "Arrays baseline as a whole"
below.) If you actually want to **replace** the entire baseline, use the whole-form forms above
(`markPristine()` or `markPristine([], obj)`), not the batch. A non-object argument (a bare primitive)
is a safe no-op.

The **explicit value** and **batch** forms matter because a save often returns server-normalized data
(trimmed strings, coerced numbers, server-filled fields). Baseline to **what actually persisted**, not
to the raw input:

```tsx
const onSubmit: FormSubmitHandler<FormValues> = async (values, helpers) => {
  const res = await fetch('/api/save', {
    method: 'POST',
    body: JSON.stringify(values),
    signal: helpers.signal,
  });

  const saved = await res.json(); // the canonical record the server stored

  if (!helpers.isCurrentSubmission(helpers.currentSubmissionID)) return;
  helpers.markPristine(saved); // each returned leaf becomes that field's baseline
};
```

**Key consequence (intended):** a field whose current value doesn't match the new baseline **stays
dirty**. If the user kept typing past what was saved, those edits are real unsaved changes and remain
flagged, exactly right. The batch form only moves the baselines for the leaves present in the record.
Fields it doesn't mention keep their existing baseline (a field that was clean stays clean).

This is the split from `reset(savedValues)`: `reset` would **overwrite the on-screen values** with the
saved record, throwing away any in-progress edits. `markPristine(savedValues)` leaves the inputs alone
and just redefines "clean", letting the derived comparison decide what's still dirty.

**Arrays baseline as a whole.** Symmetric with the dirty check above: `markPristine` stores an array (or
any subtree) as a single value. `markPristine(['items'])` baselines the entire current `items` array,
and a record passed to the batch form applies each array as one unit. The array then reads clean only if
it deep-matches that baseline element-for-element and in order. Any later edit/add/remove/reorder dirties
the whole array subtree again.

### Focus Management

`setFocus(path)` and `focusFirstError()` let you move focus imperatively, most commonly to drop the
user on the first invalid field after a failed submit.

**Register the Field's Node.** `useField` returns an `inputRef` callback. Attach it to your input so the form can reach that field:

```tsx
function TextField({ path }: { path: (string | number)[] }) {
  const { value, setValue, error, inputRef } = useField(path);
  return (
    <>
      <input
        ref={inputRef}
        value={value as string}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && <span>{error}</span>}
    </>
  );
}
```

Then drive focus from anywhere with the context (or `helpers` inside `onSubmit`):

```tsx
const form = useFormContext();
form.setFocus(['email']); // focus one field; returns false if it has no registered ref
form.focusFirstError(); // focus the first errored field; returns the path or null
```

A natural pattern is focusing the first error after a submit attempt. `submit()` touches every field
first, so all errors are active by the time it resolves:

```tsx
await form.submit();
form.focusFirstError();
```

Or, when the **server** rejects fields, do it inside the handler via `helpers`:

```tsx
const onSubmit: FormSubmitHandler<FormValues> = async (values, helpers) => {
  const res = await fetch('/api/save', {
    method: 'POST',
    body: JSON.stringify(values),
  });

  if (res.status === 422) {
    const { fieldErrors } = await res.json();

    for (const [name, msg] of Object.entries(fieldErrors))
      helpers.setServerError([name], msg as string);
    helpers.focusFirstError(); // jump to the first server-rejected field
  }
};
```

**Notes:**

- **Platform-agnostic.** The registry stores any node exposing `focus()`, a DOM `<input>`, a React
  Native `<TextInput>` (`<TextInput ref={inputRef} />`), or any custom component with a `focus()` method.
  The core imports no DOM types. On the web, `setFocus` also calls `scrollIntoView()` when present
  (feature-detected, so it's a harmless no-op elsewhere).
- **Ordering.** `focusFirstError()` scans fields in **registration order** (≈ mount/source order), which
  is the usual top-to-bottom visual order. It intentionally does not use DOM position, so the behavior is
  identical on React Native.
- **Raw context.** Not using `useField`? Call `registerFieldRef(path, node)` from `FormFieldContext`
  directly (pass `null` on unmount to unregister).
- `setFocus` returns `false` (and `focusFirstError` returns `null`) when no matching registered,
  focusable field exists, for example when the field is unmounted or never attached an `inputRef`.

`WebFormProvider` (from `form-context-react-zod/web`) wraps the form content in a native HTML `<form>` tag, on by default (`useFormTag`), with automatic `preventDefault` handling on submit events, so you can use standard HTML submit buttons instead of manually calling `form.submit()`. Set `useFormTag={false}` to opt out. The core provider (`form-context-react-zod`) has no `<form>`. On React Native, trigger submission with a button's `onPress={() => form.submit()}`.

Value operations:

- `getValue(path)`: Get value at specific path
- `setValue(path, value)`: Set value at specific path. Marks the path **and its ancestor containers** touched (consistent with how `touched` keys parent paths) and clears stale server/manual errors at that path **and any descendant paths** (assigning a value replaces the whole subtree). When `validateOnChange` is on it re-runs the **whole** schema and refreshes every field's Zod error, not just the edited field's, so a cross-field rule (e.g. a `.refine()` "passwords must match" whose error lands on a sibling) updates **live** as you type. Display stays touch-gated, so an _untouched_ sibling still won't show its error until it's touched/blurred/submitted.
- `getValue<V = unknown>(path: (string|number)[]): V`: Get the value at any path.
  Paths are untyped, so the result is `unknown` unless you pass a type argument (`form.getValue<string>(['name'])`).
- `setValue<V = unknown>(path: (string|number)[], value: V): void`: Set the value at any path.
- `clearValue(path): boolean`: Reset field to an empty value based on its type. A thin wrapper over `setValue(path, <empty>)`, so it has the same side effects: marks touched, clears the field's errors (whole subtree, all sources), and re-validates (when `validateOnChange` is on, just like `setValue`). Returns `true` if a field existed at `path` and was cleared, `false` if the path doesn't exist (nothing to clear). The empty value is chosen by type:

  | Field type           | Cleared to                        |
  | -------------------- | --------------------------------- |
  | `string`             | `''`                              |
  | `number`             | `0`                               |
  | `boolean`            | `false`                           |
  | `array`              | `[]`                              |
  | `Date`               | `null`                            |
  | `null` / `undefined` | `null` (no runtime type to infer) |
  | plain `object`       | each property recursively emptied |

  > **Other non-plain objects:** a `Date` is treated as a terminal leaf and clears to `null` (consistent with how the library treats Dates elsewhere). Other non-plain objects (`Map`, `Set`, class instances, etc.) still fall through the recursive object rule, which walks enumerable own properties. They have none, so they come back as `{}`, **not** a cleared instance. `clearValue` is meant for primitive/collection (and `Date`) fields. For any other non-plain object, clear it yourself with `setValue(path, null)` (or whatever your schema's "empty" is) rather than relying on `clearValue`.

- `deleteField(path)`: Remove field at path. For an array item, later items' metadata (touched + errors, all sources) re-indexes down to follow them, instead of being wiped. Like `setValue`, when `validateOnChange` is on it re-runs the **whole** schema and refreshes every field's Zod error, so a cross-field rule (e.g. a `.refine()` on a sibling, or an array-level `z.array().min`) updates live when an item is removed.
- `reindexArray(arrayPath, newItems, indexMap)`: Low-level primitive that replaces an array and atomically re-indexes its item metadata (touched markers and errors of **every** source, including validation, server, and manual) via `indexMap` (old index to new index, or `null` to drop). Prefer the [`useArrayField`](#usearrayfield) helpers, which wrap it.
- `hasField(path)`: Check if field exists
- `getValuePaths(path?: (string|number)[]): (string|number)[][]`: Get all value paths under the given path, including every node and intermediate object/array-item container, not just leaf fields

Error operations:

- `getError(path)`: Get array of errors at specific path level
- `getErrorPaths(path?: (string|number)[]): (string|number)[][]`: Get all error paths under given path
- `getFieldState(path): FieldState`: Convenience snapshot of one field in a single call: `{ errors, error, isTouched, invalid, exists }`. A pure read over `getError(path)` + the `touched` lookup + `hasField(path)`. Note the errors here are **raw** (not gated on `touched`), so `invalid`/`error` reflect the field's real validation state. This is handy for raw-context fields that want a field's error/touched/validity without wiring up [`useField`](#usefield), whose display `error` _is_ touched-gated.
- `setErrors(errors)`: Set all errors (replaces existing errors). This is the
  low-level overwrite of the whole error list. Whether it marks a submit failed is
  decided by the **`source`** of the entries, not by which setter you called:
  `submitSucceeded` reads `false` if any `server`, `manual`, or
  `client-form-handler` error is still present after `onSubmit` resolves. So
  `setErrors([{ path, message, source: 'server' }])` inside `onSubmit` rejects the
  attempt just like `setServerErrors` would, while `setErrors` entries with
  `source: 'client'` (or no `source`) are treated as ordinary validation errors and
  do **not** flag a failure. When your intent is "reject this submit," prefer the
  source-specific setters (`setServerErrors`/`setServerError`/`setError`/
  `setClientSubmissionError`). They tag the `source` for you, so you can't forget.
  (There is no way to set `submitSucceeded` directly as it is computed based on the presence of certain error sources during the submit flow.)
  Because it's a wholesale replace, `setErrors` also **resyncs the per-source
  channel baselines** to match the new list: a `server` entry feeds the same
  internal store `setServerError(s)` merge from (so a later targeted
  `setServerError` won't drop it), and a `client-form-handler` entry is readable via
  `getClientSubmissionError()`. So a server/submission entry set this way behaves
  identically to the dedicated setter, not just for the failure flag.
- `setServerErrors(errors)`: Replace all server errors with new ones
- `setServerError(path, message)`: Set server error(s) for a specific path
- `setError(path, message)`: Set (or clear, with `null`) a **manual/client** error at one path, using the same `string | string[] | null` shape as `setServerError`. The error is tagged `source: 'manual'` and behaves exactly like a server error (see [Error Sources](#error-sources) below): it survives re-validation, shows regardless of `touched`, and clears when the field is edited or on submit/reset. Use it for client-owned checks Zod can't express (an async "username taken" surfaced client-side, a cross-field rule you'd rather run imperatively, etc.). Also available on the `onSubmit` helpers. Pass `[]` as the path for a form-level error. **Replaces, doesn't accumulate:** each call first drops any existing `manual` error(s) at that exact path, so calling it repeatedly leaves only the latest. Pass a `string[]` to set several messages at one path in a single call, and `null` to clear them. (Same per-path replace semantics as `setServerError`. `client`/`server` errors at the path are left untouched.)

#### Error Sources

Every `ValidationError` carries a `source` that controls its lifecycle:

| `source`              | Set by                     | Survives re-validation?      | Shown when untouched? | Cleared by                                        |
| --------------------- | -------------------------- | ---------------------------- | --------------------- | ------------------------------------------------- |
| `client`              | Zod schema validation      | No, recomputed each validate | No                    | recomputed every validate, edit clears path       |
| `server`              | `setServerError(s)`        | Yes                          | Yes                   | editing the field, submit start, reset            |
| `manual`              | `setError`                 | Yes                          | Yes                   | editing the field, submit start, reset            |
| `client-form-handler` | `setClientSubmissionError` | n/a (form-level)             | n/a                   | submit start, `clearClientSubmissionError`, reset |

**No `source`?** An error with `source` omitted (e.g. a raw `setErrors([{ path, message }])` with no `source`) is treated as `client` for its **whole lifecycle**. It's validation-owned, so every `validate()` / `setValue` / `deleteField` recomputes it (dropping it once the schema no longer flags that path), it does **not** survive re-validation, and it does not flag a submit as failed. In short: only `server` / `manual` / `client-form-handler` survive validation and reject a submit. `client` **and untagged** are ordinary validation errors. If you want an error to persist, give it a `source` (`setError` → `manual`, `setServerError` → `server`).

`manual` is deliberately parallel to `server`. Same rules, a different label so you can tell a server-reported error from a client-set one and own each channel independently. The only difference is plumbing: `server` errors also live in an internal canonical store (used by `setServerErrors` replace-all), whereas `manual` errors live only in the main error list. Like server errors, a `manual` error does **not** gate `canSubmit` (which is schema-only). But setting one from inside `onSubmit` **does** mark the attempt as failed. `submitSucceeded` stays `false`, the same as `setServerError`/`setClientSubmissionError`, so a client-side check that rejects a submit reads correctly.

##### Form-Level Errors: `setError([])` vs `setClientSubmissionError`

Both put an error at the form/root level, but they're **separate channels** with
different `source`, lifecycle, and a dedicated getter:

- `setError([], msg)` → a `source: 'manual'` error at path `[]`. It's a
  _field-style_ error that happens to live at the root, and it persists like other
  field errors, survives re-validation, and is cleared on submit start / reset.
  Note the "manual errors clear when the field is edited" rule (see the
  [Error Sources](#error-sources) table) is **per-path**: editing some field at
  `['name']` does not clear a root error at `[]` (its path isn't at or under the
  edited path). A root `manual` error clears on submit start / reset, or via
  `setError([], null)`.
- `setClientSubmissionError(msg)` → a `source: 'client-form-handler'` error,
  purpose-built for "the submission itself failed" (network/auth). It's also
  mirrored in a dedicated store so `getClientSubmissionError()` can return **just
  these messages** as a `string[]`, and it's cleared by
  `clearClientSubmissionError()` (and at submit start).

**Heads-up on reading them back.** Both ultimately live in the same flat `errors`
list at path `[]`, so `getError([])` returns **everything** at the root:
`manual` errors, root `client`/`server` validation errors, **and** the
`client-form-handler` submission errors, distinguishable only by their `source`.
The dedicated `getClientSubmissionError()` is what isolates the submission errors
on their own. So if you render a root banner from `getError([])`, expect
submission errors to show up there too. Filter by `source` (or use
`getClientSubmissionError()`) if you want to separate them.

Reach for `setClientSubmissionError` for submit-failure banners. Use `setError([])`
when you want a root-level error that sits in the same list as your field errors.

Touch state operations:

- `setFieldTouched(path, value?)`: Mark field as touched/untouched
- `handleBlur(path)`: Blur handler for a field. It marks it touched **and**, when
  `validateOnBlur` is enabled, runs validation so leaving a field invalid surfaces
  its error. `useField` wires this into its `props.onBlur` automatically. If you
  wire fields manually from the context, call `form.handleBlur(path)` on blur
  (instead of just `setFieldTouched`) so `validateOnBlur` works, and gate your
  error display on `touched` so only fields the user has interacted with show errors.
  `handleBlur` is a UI blur-event handler, so it lives on the context only. It is
  **not** mirrored onto the `onSubmit` `helpers` (inside a submit you're past field
  interaction, use `setFieldTouched` + `validate`/`validateField` if you need that effect).

**`validateField(path)` vs `handleBlur(path)`**: They overlap (both touch the field
and can surface its error), but they're for different jobs:

- `handleBlur` is the **blur event handler** you wire to `onBlur`. It marks touched and
  validates **only if the `validateOnBlur` prop is enabled** (otherwise it just marks
  touched), and it returns nothing. It's event-driven UI plumbing.
- `validateField` is an **imperative trigger** you call yourself, for example to validate a field
  before enabling a button, on a custom event, or inside an async flow. On a schema form it **always**
  validates regardless of `validateOnBlur`/`validateOnChange`, and **returns the field's
  validity** (`boolean`). (With no `schema` there's nothing to run, so it just marks the field
  touched and reports whether it has any existing error (e.g. a server/manual one).) Only that one field is **touched/revealed**, but validation always
  runs the whole schema and refreshes **every** field's underlying error (like `setValue`), so a
  cross-field `.refine()` on a sibling stays current while staying touch-gated in the display.
  Running the whole schema also refreshes the form-wide `canSubmit` and `lastValidated`. That's
  deliberate: clear the last invalid field with `validateField` and `canSubmit` flips to `true`,
  keeping the submit button in sync, even though you validated a single field.

In short: blur handler → `handleBlur`. "Validate this field now and tell me if it
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
  getValue: <V = unknown>(path: (string | number)[]) => V; // read the LIVE value (see note below)
  getError: (path: (string | number)[]) => ValidationError[]; // live reads, mirror the context methods
  getErrorPaths: (path?: (string | number)[]) => (string | number)[][];
  getFieldState: (path: (string | number)[]) => FieldState;
  getValuePaths: (path?: (string | number)[]) => (string | number)[][];
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  clearValue: (path: (string | number)[]) => boolean;
  deleteField: (path: (string | number)[]) => void;
  validate: (force?: boolean) => boolean; // mutation (writes errors/touched) — guarded, see note
  validateField: (path: (string | number)[]) => boolean; // trigger one field — guarded, see note
  hasField: (path: (string | number)[]) => boolean;
  touched: Record<string, boolean>; // snapshot at submit start, NOT live — see note below
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  reset: (force?: boolean) => boolean;
  resetWithValues: (newValues: T, force?: boolean) => boolean;
  currentSubmissionID: string | null;
  isCurrentSubmission: (submissionId: string) => boolean;
  signal: AbortSignal; // aborts on force-reset / unmount; pass to fetch(url, { signal })
  markPristine: MarkPristine<T>; // re-baseline after a save; see "Dirty tracking"
  setFocus: (path: (string | number)[]) => boolean; // focus a field; see "Focus management"
  focusFirstError: () => (string | number)[] | null; // focus first errored field
}
```

**Stale-submission guard (how `helpers` behaves when superseded).** Each `helpers`
member falls into one of three buckets, and the distinction only matters once a
submission is no longer the current one. A submission is invalidated by a
**force-reset** (`reset(true)` / `resetWithValues(_, true)`) or by the provider
**unmounting** while the handler is still in flight (see
[Resetting Mid-Submit](#resetting-the-form) and
[Submission ID Tracking](#submission-id-tracking)). (Concurrent submits can't cause
this: `submit()` is a no-op while another submission is in flight. It warns and
resolves `false` (rather than starting an attempt or minting a new submission ID)
until the current handler settles. It also resolves `false` when there's no
`onSubmit`. A `true` means an attempt actually ran.)

- **Mutations are guarded**. They **no-op when this submission is stale**, so a
  slow `await` in `onSubmit` can't write back over a form the user already
  force-reset (or that unmounted). This covers `setErrors`, `setServerErrors`, `setServerError`,
  `setError`, `setClientSubmissionError`, `clearClientSubmissionError`, `setValue`,
  `clearValue`, `deleteField`, `setFieldTouched`, `validate`, `validateField`,
  `reset`, `resetWithValues`, `markPristine`, `setFocus`, and `focusFirstError`.
  The ones that return a value report the no-op (`false` / `null`) when stale.
- **Reads are live and unguarded**. `getValue`, `getError`, `getErrorPaths`,
  `getFieldState`, `getValuePaths`, `hasField`, and `getClientSubmissionError`
  always reflect the current form state, including mutations you made earlier in the
  same handler. (A stale read is harmless because reads have no side effects.)
- **Snapshots / identity**. `touched` is a snapshot from submit start (not live),
  and `currentSubmissionID` / `isCurrentSubmission` / `signal` describe _this_
  submission so you can detect staleness yourself.

This is why `helpers.*` writes are "safe by default": you rarely need to wrap them
in `isCurrentSubmission` checks. That check is mainly for your **own** non-`helpers`
side effects (navigation, toasts, external state), which the guard can't cover.

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
- Seeds are **not** path-filtered. Unlike `setServerErrors` (which drops entries
  whose `path` doesn't exist in `values`), `initialServerErrors` seeds every entry
  verbatim, so a seed at a path not present in `initialValues` is still set, matching
  `setServerError`'s no-filter behavior.
- A `path` of `[]` is a root (form-level) error. Read it with `getError([])` and
  render it in a small banner component of your own, e.g.
  `getError([]).map((e) => <p key={e.message}>{e.message}</p>)`.
- These render **immediately and regardless of touched state** (unlike Zod
  validation errors, which gate on `touched`).
- Later `setServerError(path, msg)` calls merge from this seeded baseline:
  updating one path leaves the others intact. (`setServerErrors([...])` is a
  wholesale replace. It drops any seeds not in the new list.)
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

#### Client Submission Error Handling

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

Important Server Error Behaviors

1. `setServerErrors(errors: ValidationError[])`:

   - **Scope**: Affects _all_ server errors across the entire form.
   - **Action**: Replaces ALL existing server errors with the `errors` array you provide.
   - Preserves client-side Zod validation errors.
   - Ignores errors in the provided array that target non-existent paths (except for root-level errors, i.e., `path: []`, which are always allowed).
   - **Use Case**: Ideal for initializing or completely refreshing all server-side validation feedback after an API call.
   - To clear all server errors globally, call `form.setServerErrors([])`.

2. `setServerError(path: (string | number)[], message: string | string[] | null)`:

   - **Scope**: Affects only the server errors for the _exact_ `path` specified. Server errors at other paths, and all client/manual errors, are left untouched.
   - **Action with message(s)**: If `message` is a string or an array of strings, it replaces any existing server errors _only at that specific path_ with the new message(s).
   - **Action with `null`**: If `message` is `null`, it clears all server errors _only for that specific path_.
   - Accepts a single message or an array of messages for the path.
   - Unlike `setServerErrors`, it does **not** check path existence. The message is set at whatever `path` you pass. (`setServerErrors` filters out non-existent paths. `setServerError` does not.)
   - To clear a single path, pass `null`. To clear all server errors at once, use `setServerErrors([])` (which preserves validation errors).

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

// Get all value paths under todos. This includes the intermediate
// container nodes (each array item object), not just the leaves:
const todoPaths = form.getValuePaths(['todos']);
// Returns: [
//   ['todos', 0], ['todos', 0, 'text'], ['todos', 0, 'completed'],
//   ['todos', 1], ['todos', 1, 'text'], ['todos', 1, 'completed'], ...
// ]

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
  /** All errors at this exact path (any source — client/server/manual), unfiltered. */
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
untouched fields stay quiet), the errors in `FieldState` are **raw**. `invalid`
and `error` reflect the field's real validation state. Gate on `isTouched`
yourself if you only want to show errors after interaction.

`FieldState` is a snapshot read at call time, not a live object. Call
`getFieldState(path)` during render and it stays in sync because your component
re-renders when the form's touched or error state changes. Don't stash the
returned object and expect it to update on its own. Read it fresh each render.

A path that doesn't exist doesn't throw. Like `getError` and the `touched`
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

Each public mutator (e.g. `setValue`, `setFieldTouched`, `setServerError`) collects all its internal state tweaks into one dispatch() call, so one re-render happens per operation, no matter how many bits of state it changes.

2. Per-field re-render isolation:

   - `useField` and `useArrayField` subscribe to only their own field's slice
     (value/touched/errors) via `useSyncExternalStore`, so editing one field
     re-renders just that field instead of every field on the form. On a large
     form a keystroke re-renders one input, not all of them. (Whole-form
     consumers like `FormState` still read the reactive context and update on any
     change, as intended.)
   - Note that validation itself always runs the **whole** schema. There is no
     partial or field-scoped validation (Zod validates the whole object, so
     cross-field `.refine()` rules work). What's optimized is the _re-rendering_,
     not the validation pass.

3. Efficient state management:
   - Uses React's useReducer for state management
   - `lastValidated` timestamps each validation pass
   - Only rerenders when relevant state changes

### Hooks

#### useField

```tsx
const {
  value,
  setValue,
  error, // Display message(s), touch-gated for Zod errors. string | string[] | null
  errors, // Raw ValidationError[] at this path — all sources, NOT touch-gated
  isTouched, // Whether the field has been blurred or edited
  inputRef, // Ref callback — attach to your input so setFocus/focusFirstError can reach it
  props, // Props for a CUSTOM input component (value/onChange/onBlur/errorText) — see note
} = useField(path);
```

See [Focus Management](#focus-management) for `inputRef`.

**`props` is for your own input component, not a host element.** Its `onChange`
hands you the **value** (`(value) => void`), not a DOM/React Native event, and
`errorText` isn't a real `<input>`/`<TextInput>` attribute, so spreading `props`
onto a bare host element would store the event as the value (and warn on the unknown
props). Use it on a wrapper whose `onChange` takes a value (see the `FormInput`
pattern in [Form Input Components](#form-input-components)):

```tsx
function MyInput({ value, onChange, onBlur, errorText }) { … }

const field = useField(['email']);
<MyInput {...field.props} />; // ✅ custom component (web or React Native)
```

For a host element, wire the primitives yourself instead. **Web (`<input>`):**

```tsx
const { value, setValue } = useField(['email']);
<input
  value={(value as string) ?? ''}
  onChange={(e) => setValue(e.target.value)}
/>;
```

**React Native (`<TextInput>`)**: use `onChangeText` (it already hands you the
value) and `inputRef` for focus:

```tsx
const { value, setValue, inputRef } = useField(['email']);
<TextInput
  ref={inputRef}
  value={(value as string) ?? ''}
  onChangeText={(text) => setValue(text)}
/>;
```

**`error` vs `errors`.** `error` is the **display** value: Zod (`client`) messages are gated
on `isTouched`, server/manual messages always show. It's a single `string` for one message,
a `string[]` when a field has **several** messages (e.g. `setServerError(path, ['a', 'b'])`
or a multi-issue Zod field), and `null` when there's nothing to show. If you render it
directly, handle the array case. A custom input can map an array to a list (think a
password-rules checklist). `errors` is the **raw** `ValidationError[]` (every source, not
touch-gated), parallel to `getFieldState`'s `errors`. Reach for it when you want full control
over which messages to render and when. Gate on `isTouched` yourself if you only want to
reveal them after interaction.

Path can be specified using:

- Array notation: `['user', 'details', 'name']`
- Array with numbers for indices: `['todos', 0, 'text']`

Features:

- Value getting/setting
- Touch tracking, read via `isTouched`
- Error management (server errors automatically clear on edit), display `error` plus raw `errors`
- Ready-to-spread `props` for a **custom** input component (`value`/`onChange`/`onBlur`/`errorText`),
  where `onChange` receives the **value** (not a DOM event). See the note above, and don't spread these
  onto a native `<input>`. Note the values are untyped (`unknown`) since paths aren't typed against
  the schema. Pass a type argument to `getValue`/`setValue` on the context if you need the value narrowed.
- **Re-render isolation**: `useField` subscribes to only its own field's slice
  (value/touched/errors) via `useSyncExternalStore`, so editing one field doesn't
  re-render the others. This is internal and changes nothing about the API. On large
  forms it just means a keystroke re-renders one field instead of all of them.
  (Whole-form consumers like `FormState` still read the reactive context and update
  on any change, as intended.)

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

Like `useField`, `useArrayField` is **re-render isolated**. It subscribes to only
its own array's value (via the stable field context), so editing an unrelated field
elsewhere doesn't re-render the array. This is an internal optimization. The API is unchanged.

Array operations. The reordering ops re-index the errors and touched markers under
the array so they follow their items:

- `items`: the current array value (always an array, or `[]` if the path isn't one).
  Treat it as **read-only**. Change the array only through the ops below (or
  `setValue`/`replace`), never by mutating it in place. This is the same
  immutability contract React itself relies on: updates are driven by a **new**
  array reference plus a dispatch, so an in-place `items.push(...)` mutates the
  state invisibly, with no re-render, no validation, and (because the reference didn't
  change) the array won't even pick the change up later. The returned type is
  `readonly`, so TypeScript flags a direct mutation for you.
- `arrayFieldIDs`: a stable id per item, parallel to `items`. Use it as the React
  `key` instead of the array index. See "Stable Keys" below.
- `add(item)`: append an item to the end.
- `prepend(item)`: insert an item at the front (`insert(0, item)`). The index is
  clamped, so it always inserts.
- `insert(index, item)`: insert at `index` (clamped to `[0, length]`). Items at/after
  it shift up. The index is clamped rather than rejected, so it always inserts.
- `remove(index)`: remove the item at `index`. Later items shift down to fill the gap, and their errors/touched markers shift with them (the removed item's metadata is dropped).
- `move(from, to): boolean`: reorder one item. Intermediate items shift to fill the
  gap. Returns `false` (a no-op) if either index is out of range or `from === to`,
  `true` if it moved.
- `swap(a, b): boolean`: exchange two items. Their errors/touched follow them.
  Returns `false` (a no-op) if either index is out of range or `a === b`, `true` if
  it swapped.
- `replace(newItems)`: replace the whole array. Per-index errors/touched no longer
  correspond to the new items, so they're dropped (validation regenerates as fields
  are touched).
- `update(index, item): boolean`: replace an **existing** item in place. Sugar for
  `form.setValue([...path, index], item)`, but scoped to an in-range index: it
  returns `false` (a no-op) for an out-of-range index rather than
  creating/extending the array the way a raw `setValue` would, and `true` when it
  updated an item.

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
> metadata, including touched markers, validation errors, **and** the internal server-error
> baseline, in a single atomic update. `remove` goes through `deleteField`, which
> shares the same remap, so a removal shifts later items' metadata down by one
> rather than wiping it (a direct `form.deleteField([...path, i])` behaves the same).
> Because server/manual errors aren't touch-gated, they aren't cleared by a
> reorder/removal. They move with their item. A later
> `setServerError`/`setServerErrors` therefore rebuilds from the correct
> (re-indexed) baseline.
>
> **Mutating the array marks the array's own path touched.** Every op
> (`add`/`prepend`/`insert`/`move`/`swap`/`replace`/`remove` — and `update`) marks
> the array path (and its ancestor containers) touched, the same way `setValue`
> marks an edited field and its parents. So a touch-gated array-level Zod error,
> for example `z.array(...).min(1)`, can surface from the mutation alone, with no
> separate blur: adding an item past a `.max`, or removing the last item under a
> `.min(1)`, reveals that error immediately. (`update` reaches this via its
> underlying `setValue([...path, index], item)`, which marks the edited item **and**
> its ancestor containers, including the array path, touched.) Per-item touched
> markers still follow their items through reorders/removals as described above;
> this is specifically about the array **container** path.

**Stable Keys (`arrayFieldIDs`)**

When you render an array with `.map()`, keying by the array **index** makes React
reuse component instances _positionally_. On a reorder/insert, an input's focus,
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

The ids stay aligned no matter **how** the array changes, not just through the
`useArrayField` ops. The context broadcasts every structural change with its intent,
and the hook applies it:

- `move`/`swap`/`insert`/`remove` (and a direct `form.deleteField([...path, i])`):
  the change carries an old→new index map, so each id follows its item exactly.
- `update` keeps an item's id (same slot). `add` mints a fresh id for the new item.
- A **wholesale** replacement carries no old→new mapping, so the ids are **re-minted**
  (the honest result, since there's no way to know which new item is which old one). This
  covers `replace`, `form.setValue(path, newArray)`, replacing a **parent object** that
  contains the array (`form.setValue(['profile'], { phones })`), and a form-wide `reset()`.
- A **nested** array (e.g. `useArrayField(['sections', 0, 'questions'])`) is pinned to a
  fixed item index, so if its **ancestor** array reorders and a different item lands at
  that index, its ids re-mint. A reorder that doesn't touch that index leaves them alone.

So editing field values never disturbs the ids, and reshaping the array, through the
hook ops _or_ directly via the context, keeps them correct. (One minor note: the ids
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
- All manual errors (`source: 'manual'`, set via `setError`)
- All client submission errors (`source: 'client-form-handler'`)

This provides a clean slate for each submission attempt, ensuring old error messages don't persist when the user tries again. Validation errors (`source: 'client'`) are rechecked during submission and will still appear if validation fails.

```tsx
// This happens automatically on form submission:
// 1. Clear all server, manual, and client submission errors
// 2. Perform validation
// 3. Submit if valid
form.submit();
```

The `helpers` object (`FormHelpers<T>`, see the [full interface](#formhelpers-interface)) provides access to:

- `setErrors`: Set all errors
- `setServerErrors`: Replace all server errors
- `setServerError`: Set server error for specific path
- `setError`: Set (or clear, with `null`) a manual error at a path
- `setClientSubmissionError` / `clearClientSubmissionError` / `getClientSubmissionError`: Manage form-level client submission errors
- `getValue`: Read the current value at a path. Reads the **live** values, so it reflects any `helpers.setValue` you've already made in this handler, unlike the top-level `values` argument, which is the snapshot from when submission started.
- `getError` / `getErrorPaths` / `getFieldState` / `getValuePaths`: The read side of the form, available right on `helpers` (alongside `getValue`/`hasField`). They read **live** state, so a call right after a `helpers.setError`/`setValue`/`deleteField` reflects it with no re-render needed. Errors are raw (not touched-gated), the same behavior as the [context methods of the same name](#error-operations). You don't need to grab `useFormContext()` inside the handler to read errors.
- `setValue`: Update field value
- `clearValue`: Reset field to empty value (returns `true` if the field existed and was cleared, `false` otherwise)
- `deleteField`: Remove field
- `validate`: Manually trigger validation
- `validateField`: Imperatively validate one field (see [`validateField`](#core-components) on the context). A guarded mutation that no-ops if the submission is no longer current.
- `hasField`: Check if field exists
- `touched`: The touched state **as a snapshot taken when submission started**, not a live view. `submit()` marks every field touched before calling your handler, but this object reflects the touched state from the render before that, so it won't show those submit-time touches (or any `setFieldTouched` you call mid-handler). It's a read-only snapshot, not a live binding.
- `setFieldTouched`: Mark field as touched
- `reset`: Reset form to initial values. Returns `true` if successful, `false` otherwise (e.g., if submitting and not forced).
- `resetWithValues`: Reset form with new values
- `currentSubmissionID`: The ID of the current submission
- `isCurrentSubmission`: Function to check if a submission ID is current
- `signal`: `AbortSignal` for this submission, aborts on force-reset / unmount (pass to `fetch`)
- `markPristine`: Re-baseline the dirty state after a save (see [Dirty Tracking](#dirty-tracking))
- `setFocus` / `focusFirstError`: Move focus imperatively (see [Focus Management](#focus-management))

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

### Resetting With New Values

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
    // This submission was invalidated (force-reset or unmount) while it was in flight
    console.log('Submission was canceled');
  }
};
```

This helps prevent races between a slow in-flight submission and the form being
torn out from under it:

- A submission is canceled by a **forced reset** (`reset(true)` /
  `resetWithValues(_, true)`), which also aborts `helpers.signal`.
- The provider **unmounts** before an async `onSubmit` resolves.

Note that the system does **not** need to disambiguate _concurrent_ submissions:
`submit()` is a no-op while another submission is in flight (it warns and resolves
`false`), so two submissions can't overlap and complete out of order. The submission
ID exists to detect the force-reset / unmount cases above, most commonly so your
**own** non-`helpers` side effects (navigation, a toast, external state) can bail
when the submission they belong to is no longer current.

## Best Practices

> The `FormInput`, `EmailInput`, `PhoneInput`, etc. components in this section are
> **illustrative app-level components**, not exports of this library. The library
> ships the hooks (`useField`/`useArrayField`) and context. You build the input
> components yourself (see the [demos](../README.md#demos) for full versions examples).

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

The standalone helpers re-exported from the package root, `validate` /
`validateAsync` (run a schema outside the provider, e.g. server-side),
`withRootErrors`, and the path utilities (`getValueAtPath`, `setValueAtPath`,
`serializePath`, `deserializePath`), are documented in
[zod-helpers.md](./zod-helpers.md).

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
  // 'client' — Zod schema validation (recomputed each validate)
  // 'server' — setServerError(s)
  // 'manual' — setError
  // 'client-form-handler' — setClientSubmissionError (form-level)
  // See "Error Sources" for the full lifecycle of each.
  source?: 'client' | 'server' | 'manual' | 'client-form-handler';
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

1. `isValid`: Indicates the form currently has **no errors at all** (of any source) and a validation has run. This reflects the whole form, not just touched fields, so it flips `false` the moment any field is invalid. It's a coarse "everything is currently clean" signal, not a per-field, touch-gated one. For inline feedback as a user fills out a field, read that field's own error instead (`useField`/`getFieldState`).

2. `canSubmit`: Indicates if the entire form passes Zod schema validation, regardless of which fields have been touched. This is useful for controlling when to enable the submit button. (A form with no `schema` is vacuously valid, so `canSubmit` is `true`.) Note that on a schema form `canSubmit` starts `false` and only reflects validity after the first validation pass. A prefilled, untouched valid form reads `false` until an edit/blur, `submit()`, or `validate()` runs. Use [`validateOnMount`](#formprovider) (or call `validate()`) if you need the button enabled on load. See the [`canSubmit` state getter](#formprovider) for the full caveat.

Example usage with a submit button:

```tsx
function MyForm() {
  const form = useFormContext();

  return (
    // Raw <form> wiring: prevent the native submit (page reload) and call submit()
    // yourself. On web you can skip this entirely with WebFormProvider, which renders
    // the <form> and handles preventDefault for you.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
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

Errors differ in **when they show**, not in a ranked precedence. `getError(path)`
returns every error at a path regardless of source. The practical display rules
(see the [Error Sources](#error-sources) table for the full lifecycle) are:

- **Server (`server`) and manual (`manual`) errors** show immediately, regardless
  of `touched`, and clear when the field is edited (or on submit/reset).
- **Zod validation errors (`client`)** are recomputed on every validate and, via
  `useField`, display only once the field is touched or the form has been
  submitted. (Required-field errors are ordinary Zod `client` errors.)
- **Client submission errors (`client-form-handler`)** are form-level (path `[]`),
  read via `getClientSubmissionError()`, and cleared at submit start.

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
  message: 'Unrecognized key: "age"', // Zod 4's default text (illustrative)
};
```

## Example Usage

### Basic Form

```tsx
function BasicForm() {
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
      {/* `useFormContext` must be called from a component INSIDE the provider,
          so the <form> + submit live in their own child component. */}
      <BasicFormBody />
    </FormProvider>
  );
}

function BasicFormBody() {
  const form = useFormContext();

  return (
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
  );
}
```

(This is a **web** example. The `<form>` + `preventDefault` wiring is DOM-only.
on the web you can skip it entirely with [`WebFormProvider`](#formprovider) from
`form-context-react-zod/web`, which renders the `<form>` for you. On React Native
there is no `<form>`. Just call `form.submit()` from a button's `onPress`.)

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

### Form With Server Validation

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

Use `WebFormProvider` from the **web** entry to wrap your form in a native HTML `<form>` tag, handling the `preventDefault` behavior for you. The `<form>` is on by default. Pass `useFormTag={false}` to opt out:

```tsx
import { WebFormProvider } from 'form-context-react-zod/web';

function ContactForm() {
  return (
    <WebFormProvider
      initialValues={{ name: '', email: '' }}
      schema={contactSchema}
      onSubmit={handleSubmit}
      // useFormTag defaults to true here; set false to render no <form>.
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
    </WebFormProvider>
  );
}
```

Benefits of the `WebFormProvider` wrapper (native `<form>` tag):

- **Handles `preventDefault` for you**. The wrapper's `onSubmit` calls
  `e.preventDefault()` before `form.submit()`, so a submit button (or Enter) never
  triggers a native full-page reload. Nothing to wire up, nothing to forget.
- Works with browser's built-in form submission (Enter key submits the form)
- Allows using standard HTML form attributes
- Improves accessibility with proper form semantics

> The `<form>` is rendered with `noValidate`, so the browser's own constraint
> validation is **off** by default and Zod is the single source of truth (this
> avoids the two validators disagreeing). If you specifically want native
> constraint validation back, pass `formProps={{ noValidate: false }}`.

### Multiple Children in FormProvider

The FormProvider can accept multiple children, allowing you to split your form into separate components while sharing the same form context:

```tsx
import { useContext } from 'react';
import { FormContext, serializePath } from 'form-context-react-zod';

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

// `FormState` is an opt-in debug component (it dumps the live form state for development).
// It is NOT part of the core entry — import it from the devtools
// entry for your platform:
//
//   import { FormState } from 'form-context-react-zod/devtools/web';    // DOM
//   import { FormState } from 'form-context-react-zod/devtools/native'; // React Native

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
        // `touched` is keyed by the serialized path, so read it with serializePath
        // — `form.touched['firstName']` (a bare string key) would always be undefined.
        touched={!!form.touched[serializePath(['firstName'])]}
      />

      <FormInput
        label="Last Name"
        value={form.getValue(['lastName'])}
        onChange={(value) => form.setValue(['lastName'], value)}
        onBlur={() => form.setFieldTouched(['lastName'], true)}
        errorText={form.getError(['lastName'])[0]?.message}
        touched={!!form.touched[serializePath(['lastName'])]}
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
