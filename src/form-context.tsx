import React, { useCallback, useMemo, useReducer } from 'react';
import { FormContext, FormFieldContext } from './context';
import { z } from 'zod';
import { validate, ValidationError, FieldState } from './zod-helpers';
import {
  getValueAtPath,
  setValueAtPath,
  getEmptyValue,
  serializePath,
  deserializePath,
  cloneAlongPath,
  generateID,
  isEmptyValue,
  flattenLeaves,
  diffDirtyFields,
} from './utils';

export interface FormHelpers<T> {
  setErrors: (errors: ValidationError[]) => void;
  setServerErrors: (errors: ValidationError[]) => void;
  setServerError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  /**
   * Sets (or clears) a manual/client error at one path. Same shape as
   * `setServerError`. Setting one from inside `onSubmit` marks the attempt as
   * failed (`submitSucceeded` stays `false`), the same as setting a server or
   * client-submission error. Pass `[]` as the path for a form-level error.
   */
  setError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  /**
   * Sets client submission errors (network failures, auth issues, etc.) at the form root level.
   * These are separate from field validation errors and server errors, and represent
   * issues preventing the entire form submission from completing.
   * @param message A string, array of strings, or null to clear all client submission errors
   */
  setClientSubmissionError: (message: string | string[] | null) => void;
  /**
   * Clears all client submission errors while preserving validation and server errors.
   */
  clearClientSubmissionError: () => void;
  /**
   * Returns the current client submission errors.
   * @returns An array of error message strings
   */
  getClientSubmissionError: () => string[];
  /**
   * Read the current value at `path`. Reads the live values (reflecting any
   * `helpers.setValue` you've already made in this handler), so it's the way to
   * inspect a field inside `onSubmit` — the top-level `values` argument is the
   * snapshot taken when submission started. Untyped paths return `unknown`; pass a
   * type argument to narrow (`helpers.getValue<string>(['name'])`).
   */
  getValue: <V = unknown>(path: (string | number)[]) => V;
  /**
   * The read side of the form, available mid-handler. These mirror the same-named
   * methods on {@link FormContextValue} and read the live form state, so a call
   * right after a `helpers.setError`/`setValue`/`deleteField` reflects it (no
   * re-render needed). Errors are raw (not touched-gated). With `getValue`/
   * `hasField`, the handler has the full read surface without grabbing the context
   * separately.
   */
  getError: (path: (string | number)[]) => ValidationError[];
  getErrorPaths: (path?: (string | number)[]) => (string | number)[][];
  getFieldState: (path: (string | number)[]) => FieldState;
  getValuePaths: (path?: (string | number)[]) => (string | number)[][];
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  /**
   * Clear a field to its type-appropriate empty value. Returns `true` if a field
   * existed at `path` and was cleared, `false` if the path doesn't exist.
   */
  clearValue: (path: (string | number)[]) => boolean;
  deleteField: (path: (string | number)[]) => void;
  validate: (force?: boolean) => boolean;
  /**
   * Imperatively validate one field ("trigger"); see {@link FormContextValue.validateField}.
   * Marks it touched, re-runs the schema, and returns whether the field is now
   * error-free. A guarded mutation: it no-ops if this submission is no longer current.
   */
  validateField: (path: (string | number)[]) => boolean;
  hasField: (path: (string | number)[]) => boolean;
  /**
   * Touched state as a SNAPSHOT taken when submission started — not a live view.
   * `submit()` marks every field touched before invoking the handler, but this
   * object reflects the touched state from the prior render, so it won't include
   * those submit-time touches (or any `setFieldTouched` made mid-handler).
   */
  touched: Record<string, boolean>;
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  reset: (force?: boolean) => boolean;
  resetWithValues: (newValues: T, force?: boolean) => boolean;
  currentSubmissionID: string | null;
  isCurrentSubmission: (submissionId: string) => boolean;
  /**
   * An `AbortSignal` tied to this submission. Pass it to `fetch(url, { signal })`
   * (or any abortable API) for real cancellation: it fires when the submission is
   * superseded by a force-reset (`reset(true)` / `resetWithValues(_, true)`) or the
   * provider unmounts. A normal completion does NOT abort.
   */
  signal: AbortSignal;
  /**
   * Move the dirty baseline so the saved values read clean — call it after a
   * successful save (typically with the server's returned record:
   * `helpers.markPristine(saved)`) so the form goes pristine without rewinding
   * the on-screen values. Baseline-only; never touches values/errors/touched.
   * See {@link FormContextValue.markPristine} for the overloads.
   */
  markPristine: MarkPristine<T>;
  /**
   * Focus a field by path. See {@link FormContextValue.setFocus}.
   */
  setFocus: (path: (string | number)[]) => boolean;
  /**
   * Focus the first errored field — call after validation fails inside
   * `onSubmit`. See {@link FormContextValue.focusFirstError}.
   */
  focusFirstError: () => (string | number)[] | null;
}

export interface FormContextValue<T> {
  values: T;
  touched: Record<string, boolean>;
  errors: ValidationError[];
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  /** Mark a field touched and run validation when validateOnBlur is enabled.
   *  useField wires this to onBlur; raw-context fields should call it too. */
  handleBlur: (path: (string | number)[]) => void;
  setErrors: (errors: ValidationError[]) => void;
  isSubmitting: boolean;
  isValid: boolean;
  canSubmit: boolean;
  /** True once the user has attempted to submit at all (pass or fail). Cleared by reset/resetWithValues. */
  submitAttempted: boolean;
  /** True only if the most recent submit attempt completed without throwing and the handler set no submission errors. */
  submitSucceeded: boolean;
  /** Running count of submit attempts. Reset to 0 by reset/resetWithValues. */
  submitCount: number;
  lastValidated: number | null;
  /** Whether editing a field runs validation. Mirrors the FormProvider prop
   *  (read-only). `setValue` already honors it internally; exposed so a field
   *  wiring its own onChange can match the provider's configured behavior. */
  validateOnChange: boolean;
  /** Whether leaving a field (blur) runs validation. Mirrors the FormProvider prop. */
  validateOnBlur: boolean;
  currentSubmissionID: string | null;
  submit: () => Promise<void>;
  reset: (force?: boolean) => boolean;
  resetWithValues: (newValues: T, force?: boolean) => boolean;
  validate: (force?: boolean) => boolean;
  /**
   * Imperatively validate one field ("trigger"). Marks it touched and re-runs the
   * schema, surfacing only that field's error. Returns whether the field is now
   * error-free (no error of any source at the path). Unlike `handleBlur`, this is
   * not gated on the `validateOnBlur` prop and it returns the field's validity.
   */
  validateField: (path: (string | number)[]) => boolean;
  getValue: <V = unknown>(path: (string | number)[]) => V;
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  /**
   * Clear a field to its type-appropriate empty value (string → `''`, number → `0`,
   * boolean → `false`, array → `[]`, object → recursively emptied). Marks the path
   * touched, clears the field's errors (whole subtree, all sources), and re-validates
   * (when `validateOnChange` is on — it delegates to `setValue`).
   * Returns `true` if a field existed at `path` and was cleared, `false` if the path
   * doesn't exist.
   */
  clearValue: (path: (string | number)[]) => boolean;
  deleteField: (path: (string | number)[]) => void;
  /**
   * Low-level primitive used by `useArrayField`'s reorder ops. Replaces the array
   * at `arrayPath` with `newItems` and re-indexes the item metadata (touched,
   * validation + server errors) via `indexMap` (old index -> new index, or null
   * to drop) in a single atomic update. Prefer the `useArrayField` helpers.
   */
  reindexArray: (
    arrayPath: (string | number)[],
    newItems: unknown[],
    indexMap: (oldIndex: number) => number | null
  ) => void;
  /**
   * @internal Advanced/internal plumbing — not part of the documented public API.
   * Subscribe to structural array changes (used by `useArrayField` to keep its
   * stable ids aligned no matter which mutation path changed the array). Returns
   * an unsubscribe function.
   */
  subscribeArrayStructure: (listener: ArrayStructureListener) => () => void;
  getValuePaths: (path?: (string | number)[]) => (string | number)[][];
  getError: (path: (string | number)[]) => ValidationError[];
  getErrorPaths: (path?: (string | number)[]) => (string | number)[][];
  /**
   * Convenience snapshot of one field's state in a single call:
   * `{ errors, error, isTouched, invalid, exists }`. A pure read over the existing
   * `getError(path)` + `touched` lookup + `hasField(path)` — handy for raw-context
   * fields that want a field's error/touched/validity/presence without wiring up
   * `useField`. Errors are raw (not touched-gated). `exists` reflects presence in
   * `values` only and is independent of `invalid`.
   */
  getFieldState: (path: (string | number)[]) => FieldState;
  hasField: (path: (string | number)[]) => boolean;
  setServerErrors: (errors: ValidationError[]) => void;
  setServerError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  /**
   * Sets (or clears) a manual/client error at one path. Same shape as
   * `setServerError` — a string or string[] sets the message(s), `null` clears.
   * The error is tagged `source: 'manual'` and behaves like a server error: it
   * survives re-validation, displays regardless of touched, and clears when the
   * field is edited or on submit/reset. For client-owned checks Zod can't express.
   */
  setError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  /**
   * Sets client submission errors (network failures, auth issues, etc.) at the form root level.
   * These are separate from field validation errors and server errors, and represent
   * issues preventing the entire form submission from completing.
   * @param message A string, array of strings, or null to clear all client submission errors
   */
  setClientSubmissionError: (message: string | string[] | null) => void;
  /**
   * Clears all client submission errors while preserving validation and server errors.
   */
  clearClientSubmissionError: () => void;
  /**
   * Returns the current client submission errors.
   * @returns An array of error message strings
   */
  getClientSubmissionError: () => string[];
  isCurrentSubmission: (submissionId: string) => boolean;
  /**
   * True when the current values differ from the dirty baseline (initially
   * `initialValues`, moved by `markPristine`/`reset`/`resetWithValues`). Always
   * derived — never force-flipped. Use it to disable a Save button until the user
   * actually changes something.
   */
  isDirty: boolean;
  /**
   * Per-field dirty map keyed by serialized path (same shape as `touched`): a
   * path maps to `true` when it differs from the baseline. Plain objects are
   * compared key-precise (only changed leaves appear); a dirty array marks its
   * own path AND every field underneath it recursively (a content edit, add,
   * remove, or reorder dirties the whole subtree — array indices aren't stable
   * identities, so no per-item attribution is attempted). Absent keys are clean.
   * Read with `dirtyFields[serializePath(path)]`.
   */
  dirtyFields: Record<string, boolean>;
  /**
   * Moves the dirty baseline so the current (or an explicitly provided) value
   * reads clean — "this is the new saved-clean reference." Unlike `reset`, it
   * NEVER touches values/errors/touched; it only changes what `isDirty`/`dirtyFields`
   * compare against and lets the comparison decide. Overloads:
   *
   * - `markPristine()` — baseline the whole form to the current values.
   * - `markPristine(path, value?)` — baseline one field/subtree. `value` defaults
   *   to the current value at `path`; pass an explicit value to baseline to what
   *   actually persisted (server-normalized data) rather than the live input.
   * - `markPristine(serverResult)` — batch: `serverResult` is a partial object
   *   mirroring the values shape (typically the API's returned record). Each leaf
   *   it contains moves that field's baseline to the provided value.
   *
   * Key consequence: a field whose current value doesn't match the new baseline
   * STAYS dirty — so anything the user kept editing past the save is still flagged.
   */
  markPristine: MarkPristine<T>;
  /**
   * Imperatively focus a field by path (calls the registered node's `focus()`,
   * and `scrollIntoView()` if the node has it). Requires the field to have
   * registered a ref — `useField`'s `ref`, or a direct `registerFieldRef` call.
   * Returns `true` if a focusable node was found and focused, `false` otherwise.
   * Platform-agnostic: works with any node exposing `focus()` (DOM or RN).
   */
  setFocus: (path: (string | number)[]) => boolean;
  /**
   * Focus the first registered field that currently has an error, scanning in
   * registration order (≈ mount/source order). Handy right after a failed submit
   * (`submit()` touches every field first, so all errors are active). Returns the
   * focused field's path, or `null` if no errored field had a registered ref.
   */
  focusFirstError: () => (string | number)[] | null;
}

/**
 * Signature for {@link FormContextValue.markPristine}. Either re-baselines a
 * single field/subtree (`path`, optional explicit `value`), a batch of fields
 * from a server-returned partial record, or — with no args — the whole form.
 */
export interface MarkPristine<T> {
  (): void;
  (path: (string | number)[], value?: unknown): void;
  (serverResult: Partial<T>): void;
}

/**
 * Broadcast describing a STRUCTURAL change to an array field, so subscribers
 * (useArrayField's stable-id tracking) can follow items to their new positions.
 * - `reindex`: items moved/inserted/removed under `path`; `indexMap` maps each old
 *   item index to its new one (or null to drop), and `newLength` is the new count.
 * - `reset-subtree`: a value was assigned at `path` with no old->new item mapping
 *   (a wholesale `setValue`). Any tracked array AT or UNDER `path` must re-mint —
 *   this covers both replacing the array itself and replacing a parent object that
 *   contains it.
 * - `reset-all`: a form-wide values reset; subscribers should re-derive from scratch.
 */
export type ArrayStructureChange =
  | {
      kind: 'reindex';
      path: (string | number)[];
      indexMap: (oldIndex: number) => number | null;
      newLength: number;
    }
  | { kind: 'reset-subtree'; path: (string | number)[] }
  | { kind: 'reset-all' };

export type ArrayStructureListener = (change: ArrayStructureChange) => void;

/**
 * A single field's reactive slice, returned by `getFieldSnapshot`. Kept stable by
 * reference (cached per path) so `useField`'s `useSyncExternalStore` only re-renders
 * the field when ITS slice changes — not on every unrelated keystroke elsewhere.
 */
export interface FieldSnapshot {
  value: unknown;
  isTouched: boolean;
  errors: ValidationError[];
}

/**
 * Stable, never-changing companion context consumed by `useField`. Because its
 * identity never changes, subscribing to it (unlike the reactive `FormContext`)
 * doesn't re-render the field on unrelated form changes; field reactivity instead
 * flows through `subscribeField` + `getFieldSnapshot` via `useSyncExternalStore`.
 * The reactive `FormContext` is kept for whole-form consumers (FormState, etc.).
 */
/**
 * The minimal shape `setFocus`/`focusFirstError` need from a registered field
 * node: anything with a `focus()` method. Deliberately structural and platform-
 * agnostic — a DOM element (`<input>`), a React Native `TextInput` instance, or
 * any custom component exposing `focus()` all satisfy it, so the core never
 * depends on DOM types. Web-only extras (e.g. `scrollIntoView`) are
 * feature-detected at call time, never required.
 */
export interface Focusable {
  focus?: () => void;
}

/**
 * @internal Advanced/internal plumbing — the per-field subscription surface that
 * `useField`/`useArrayField` consume. Apart from `registerFieldRef` (documented as
 * the raw-context focus escape hatch), these members are not part of the documented
 * public API; prefer the hooks and the `FormContext` (`useFormContext`) surface.
 */
export interface FormFieldContextValue {
  subscribeField: (listener: () => void) => () => void;
  getFieldSnapshot: (path: (string | number)[]) => FieldSnapshot;
  getValue: <V = unknown>(path: (string | number)[]) => V;
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  handleBlur: (path: (string | number)[]) => void;
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  // Also used by useArrayField so it, too, reads off the stable context.
  reindexArray: (
    arrayPath: (string | number)[],
    newItems: unknown[],
    indexMap: (oldIndex: number) => number | null
  ) => void;
  deleteField: (path: (string | number)[]) => void;
  subscribeArrayStructure: (listener: ArrayStructureListener) => () => void;
  /**
   * Register (or, with `null`, unregister) the focusable node for a field path,
   * powering `setFocus`/`focusFirstError`. `useField` wires this to its `ref`;
   * raw-context fields can call it directly. Registration order ≈ mount/source
   * order, which is the order `focusFirstError` scans.
   */
  registerFieldRef: (path: (string | number)[], node: Focusable | null) => void;
}

// Which errors does the validation pass "own" — i.e. recompute (and clear when no
// longer valid) on every validate/setValue/deleteField? Zod `client` errors AND
// UNTAGGED ones: the public contract treats a source-less error (e.g. a raw
// `setErrors([{ path, message }])`) as an ordinary validation error. `server`,
// `manual`, and `client-form-handler` are owned OUTSIDE validation and survive a
// re-validate — cleared only by their own setters / submit start / reset. Every
// full-form recompute site routes through this so the rule can't drift between them.
function isValidationOwnedError(e: ValidationError): boolean {
  return e.source === 'client' || e.source == null;
}

// Whether two error lists for the SAME path are equivalent (so a cached snapshot
// can be reused). Paths match by construction; compare message + source in order.
function sameErrors(a: ValidationError[], b: ValidationError[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].message !== b[i].message || a[i].source !== b[i].source) {
      return false;
    }
  }
  return true;
}

// The contexts live in their own module (./context) so the build can keep them
// a single shared instance across every entry point. Re-exported here so the
// public `.` entry still surfaces them and FormProvider can render the providers.
export { FormContext, FormFieldContext };

/**
 * Handler for FormProvider's `onSubmit`. Declare the value type once and both
 * `values` and `helpers` are inferred from it, e.g.
 * `const onSubmit: FormSubmitHandler<z.infer<typeof schema>> = (values, helpers) => {...}`.
 */
export type FormSubmitHandler<T> = (
  values: T,
  helpers: FormHelpers<T>
) => Promise<void> | void;

export interface FormProviderProps<T> {
  initialValues: T;
  /**
   * Server errors to seed at mount, before any submission. Each entry is
   * normalized to `source: 'server'`, so you can omit `source`. Use a path of
   * `[]` for a form-level (root) error. Unlike Zod validation errors, server
   * errors render regardless of whether the field is touched. Note that
   * `reset()`/`resetWithValues()` clear server errors (a clean slate) and do
   * not restore these.
   */
  initialServerErrors?: ValidationError[];
  onSubmit?: FormSubmitHandler<T>;
  schema?: z.ZodType<T>;
  validateOnMount?: boolean;
  /**
   * When `validateOnMount` runs, whether to mark ALL fields touched (revealing
   * every error on load) instead of only the populated ones. Defaults to false:
   * a prefilled form shows errors for the data it loaded, while empty fields the
   * user hasn't reached stay quiet.
   */
  touchAllOnMount?: boolean;
  validateOnChange?: boolean;
  /**
   * Whether leaving a field (blur) runs validation, surfacing errors for a field
   * the user interacted with but left invalid (e.g. a required field left empty).
   * Defaults to true.
   */
  validateOnBlur?: boolean;
  children: React.ReactNode | React.ReactNode[];
}

// Define the form state interface
interface FormState<T> {
  values: T;
  touched: Record<string, boolean>;
  errors: ValidationError[];
  isSubmitting: boolean;
  lastValidated: number | null;
  canSubmit: boolean;
  currentSubmissionID: string | null;
  // Submit-attempt tracking. Set at the start of each submit() attempt and
  // cleared by reset()/resetWithValues().
  submitAttempted: boolean;
  submitSucceeded: boolean;
  submitCount: number;
}

// Define action types
type FormAction<T> =
  | {
      type: 'UPDATE_STATE';
      updates: Partial<FormState<T>>;
    }
  | {
      type: 'UPDATE_STATE_FUNC';
      updater: (prevState: FormState<T>) => Partial<FormState<T>>;
    };

// Implement the reducer function
function formReducer<T extends Record<string | number, unknown>>(
  state: FormState<T>,
  action: FormAction<T>
): FormState<T> {
  switch (action.type) {
    case 'UPDATE_STATE': {
      return {
        ...state,
        ...action.updates,
      };
    }
    case 'UPDATE_STATE_FUNC': {
      const updates = action.updater(state);
      return {
        ...state,
        ...updates,
      };
    }
    default:
      return state;
  }
}

// Remap a single path that lives under `arrayPath` according to `indexMap` (old
// item index -> new index, or null to drop the item). Returns the rewritten path,
// `null` to drop, or the SAME reference when the path is unaffected (outside the
// array, a non-numeric index, or an unchanged index). Shared by reindexArray and
// deleteField so array reorders/removals re-index metadata identically.
function remapPathUnderArray(
  p: (string | number)[],
  arrayPath: (string | number)[],
  indexMap: (oldIndex: number) => number | null
): (string | number)[] | null {
  const underArray =
    p.length > arrayPath.length &&
    arrayPath.every((val, idx) => p[idx] === val);
  if (!underArray) return p;
  const oldIndex = Number(p[arrayPath.length]);
  if (Number.isNaN(oldIndex)) return p;
  const newIndex = indexMap(oldIndex);
  if (newIndex === null) return null;
  return newIndex === oldIndex
    ? p
    : [...arrayPath, newIndex, ...p.slice(arrayPath.length + 1)];
}

// Re-index a list of errors under `arrayPath` via `indexMap`, dropping any whose
// item was removed. Errors outside the array are returned unchanged (same ref).
function remapErrorsUnderArray(
  errs: ValidationError[],
  arrayPath: (string | number)[],
  indexMap: (oldIndex: number) => number | null
): ValidationError[] {
  const out: ValidationError[] = [];
  for (const e of errs) {
    const np = remapPathUnderArray(e.path, arrayPath, indexMap);
    if (np === null) continue;
    out.push(np === e.path ? e : { ...e, path: np });
  }
  return out;
}

export function FormProvider<T extends Record<string | number, unknown>>({
  initialValues,
  initialServerErrors = [],
  onSubmit,
  schema,
  validateOnMount = false,
  touchAllOnMount = false,
  validateOnChange = true,
  validateOnBlur = true,
  children,
}: FormProviderProps<T>) {
  // Normalize seeded server errors. We tag them `source: 'server'` so callers
  // can omit it, mirroring setServerErrors. Only the first render's value is
  // ever used (reducer + ref initializers below), so an unstable prop identity
  // on later renders is harmless — seeding is a mount-only concern (use the
  // setServerError(s) API to change them after).
  const normalizedInitialServerErrors = useMemo<ValidationError[]>(
    () =>
      initialServerErrors.map((error) => ({
        ...error,
        source: 'server' as const,
      })),
    [initialServerErrors]
  );

  // Use useReducer instead of multiple useState calls
  const [state, dispatch] = useReducer(formReducer<T>, {
    values: initialValues,
    touched: {},
    errors: normalizedInitialServerErrors,
    isSubmitting: false,
    lastValidated: null,
    canSubmit: false,
    currentSubmissionID: null,
    submitAttempted: false,
    submitSucceeded: false,
    submitCount: 0,
  });

  // Destructure state for easier access
  const {
    values,
    touched,
    errors,
    isSubmitting,
    lastValidated,
    canSubmit,
    submitAttempted,
    submitSucceeded,
    submitCount,
    // currentSubmissionID is accessed via state.currentSubmissionID in contextValue
  } = state;

  // Dirty-tracking baseline. Starts at initialValues and is moved by
  // markPristine() (after a save) and reset()/resetWithValues() (back to a known
  // state). It is intentionally SEPARATE from initialValues: reset() = "back to
  // load", markPristine() = "this is the new saved-clean reference", so the two
  // baselines can legitimately drift. Kept in reactive state so isDirty/dirtyFields
  // recompute when it moves; markPristine never touches values/errors/touched.
  const [baseline, setBaseline] = React.useState<T>(initialValues);

  /**
   * IMPLEMENTATION PATTERN:
   * This form context uses a hybrid approach combining refs and reducer state:
   *
   * 1. Refs (valuesRef, errorsRef, touchedRef, canSubmitRef, isSubmittingRef) provide immediate,
   *    synchronous access to the latest form data without waiting for React render cycles.
   *
   * 2. Reducer state triggers UI updates when values change.
   *
   * The core pattern used throughout this codebase is:
   *   - Update refs first for immediate access
   *   - Then dispatch state updates to trigger UI re-renders
   *
   * This approach prevents race conditions and ensures both immediate data access
   * and proper UI updates, eliminating the need for a complex operation queue.
   */

  // Using useRef instead of useState to avoid race conditions
  const mountedRef = React.useRef(false);
  const currentSubmissionIDRef = React.useRef<string | null>(null);
  // AbortController for the in-flight submission. Its signal is handed to onSubmit
  // via helpers.signal and aborted when the submission is force-reset or the
  // provider unmounts, so users can pass it to fetch() for real cancellation.
  const currentAbortControllerRef = React.useRef<AbortController | null>(null);

  // Remove queue refs and replace with direct value/touched refs
  const valuesRef = React.useRef<T>(initialValues);
  const touchedRef = React.useRef<Record<string, boolean>>({});
  const canSubmitRef = React.useRef<boolean>(false);
  const isSubmittingRef = React.useRef<boolean>(false);

  // Error handling refs
  // Keep track of client submission error messages for real-time access
  const clientSubmissionErrorRef = React.useRef<string[]>([]);

  // Keep all errors in a ref for immediate access/updates, syncing with state for UI.
  // Seeded with any initialServerErrors so they're available before first render's effects.
  const errorsRef = React.useRef<ValidationError[]>(
    normalizedInitialServerErrors
  );

  // Keep track of server errors separately to prevent race conditions.
  // Seeded so the first setServerError(s) call merges from the right baseline.
  const serverErrorsRef = React.useRef<ValidationError[]>(
    normalizedInitialServerErrors
  );

  // Subscribers (useArrayField instances) that track stable item ids and need to
  // be told when an array changes shape — so ids follow items no matter which
  // mutation path (reindexArray, deleteField, setValue, reset) caused the change.
  const arrayStructureListenersRef = React.useRef<Set<ArrayStructureListener>>(
    new Set()
  );
  const subscribeArrayStructure = useCallback(
    (listener: ArrayStructureListener) => {
      arrayStructureListenersRef.current.add(listener);
      return () => {
        arrayStructureListenersRef.current.delete(listener);
      };
    },
    []
  );
  const notifyArrayStructure = useCallback((change: ArrayStructureChange) => {
    for (const listener of arrayStructureListenersRef.current) listener(change);
  }, []);

  // Initialize refs with current state values
  React.useEffect(() => {
    errorsRef.current = errors;
    valuesRef.current = values;
    touchedRef.current = touched;
    canSubmitRef.current = canSubmit;
    isSubmittingRef.current = isSubmitting;
  }, [errors, values, touched, canSubmit, isSubmitting]);

  // Walks the values tree under `basePath` and returns a flat list of paths to
  // every node (every field, including nested objects/arrays). e.g. for
  // { a: { b: 1 }, list: [{ x: 2 }] } it returns:
  //   ['a'], ['a','b'], ['list'], ['list', 0], ['list', 0, 'x']
  // Used by validate(true) (to touch every field) and reset/clear traversals.
  const getValuePaths = useCallback((basePath: (string | number)[] = []) => {
    const paths: (string | number)[][] = [];

    const traverse = (obj: unknown, currentPath: (string | number)[]) => {
      // Only objects/arrays have children to descend into; primitives are leaves.
      if (obj && typeof obj === 'object') {
        const isArray = Array.isArray(obj);

        // Object.entries gives us BOTH halves we need at each node:
        //   key   -> the next path segment (the breadcrumb at this level)
        //   value -> the subtree to recurse into to find deeper paths
        for (const [key, value] of Object.entries(obj)) {
          // Object.entries always returns string keys, including array indices
          // ('0', '1', ...). Restore numeric indices for arrays so these paths
          // match the number-indexed paths used everywhere else (touched keys,
          // Zod error paths, getValue). Object keys stay strings — even
          // numeric-looking ones like { '5': ... } are real string keys.
          // Without this, e.g. validate(true)'s force-touch builds ['list','0']
          // while the field looks up ['list', 0] — different serializePath keys,
          // so the touch silently misses nested array fields.
          const segment = isArray ? Number(key) : key;
          const newPath = [...currentPath, segment];

          paths.push(newPath); // record this node's path
          traverse(value, newPath); // then descend for any deeper paths
        }
      }
    };

    // Start from the subtree at basePath (default: the whole values object).
    // Read the live ref (the synchronous source of truth), so an imperative call
    // mid-batch — e.g. inside onSubmit after a setValue/deleteField — sees the
    // current tree, matching getValue. State drives renders; refs drive reads.
    traverse(getValueAtPath(valuesRef.current, basePath), basePath);
    return paths;
  }, []);

  const validateForm = useCallback(() => {
    if (!schema) {
      return { valid: true, errors: [] };
    }

    // Set lastValidated timestamp
    const now = Date.now();

    // Validate the entire form
    const result = validate(schema, values);

    // Update canSubmitRef first
    canSubmitRef.current = result.valid;

    // Then update state using functional update pattern
    dispatch({
      type: 'UPDATE_STATE_FUNC',
      updater: () => ({
        lastValidated: now,
        canSubmit: result.valid,
      }),
    });

    return result;
  }, [schema, values, dispatch]);

  // Helper function to create a new touched state with a path marked as touched
  const markPathAsTouched = useCallback(
    (touched: Record<string, boolean>, path: (string | number)[]) => {
      const newTouched = { ...touched };
      // Mark the field itself
      newTouched[serializePath(path)] = true;

      // Mark all parent paths
      for (let i = 1; i <= path.length; i++) {
        const parentPath = path.slice(0, i);
        newTouched[serializePath(parentPath)] = true;
      }
      return newTouched;
    },
    []
  );

  // Simplified setValue function that uses refs
  const setValue = useCallback(
    <V = unknown,>(path: (string | number)[], value: V) => {
      // Update the values ref immediately
      const newValues = cloneAlongPath(valuesRef.current, path);
      setValueAtPath(
        newValues as Record<string | number, unknown>,
        path,
        value
      );
      valuesRef.current = newValues;

      // Update touched state to mark this path
      touchedRef.current = markPathAsTouched(touchedRef.current, path);

      // Assigning a value replaces the whole subtree, so a server/manual error at
      // the edited path (or under it) is stale. Drop those from the server-error
      // baseline so a later setServerError can't rebuild them from a stale baseline.
      const atOrUnderPath = (errorPath: (string | number)[]) =>
        errorPath.length >= path.length &&
        path.every((val, idx) => errorPath[idx] === val);
      serverErrorsRef.current = serverErrorsRef.current.filter(
        (error) => !atOrUnderPath(error.path)
      );

      let newCanSubmit = canSubmitRef.current;
      let newErrors: ValidationError[];

      if (validateOnChange && schema) {
        const result = validate(schema, newValues);
        newCanSubmit = result.valid;
        canSubmitRef.current = newCanSubmit;

        // Recompute ALL validation-owned errors (Zod 'client' + untagged) from the
        // full-form result — not just the edited path — so a cross-field refine that
        // flags a SIBLING updates live too. Keep externally-owned errors (server/
        // manual/client-form-handler), except any under the edited subtree, which are
        // now stale. Display stays touch-gated, so untouched siblings still don't
        // show an error.
        const preserved = errorsRef.current.filter(
          (e) => !isValidationOwnedError(e) && !atOrUnderPath(e.path)
        );
        const freshClient = result.valid ? [] : (result.errors ?? []);
        newErrors = [...preserved, ...freshClient];
      } else {
        // No revalidation: just drop the edited subtree's now-stale errors (any
        // source); other fields' errors are left untouched.
        newErrors = errorsRef.current.filter((e) => !atOrUnderPath(e.path));
      }
      errorsRef.current = newErrors;

      // Dispatch a single update with all changes using functional update
      dispatch({
        type: 'UPDATE_STATE_FUNC',
        updater: () => ({
          values: newValues,
          touched: touchedRef.current,
          errors: newErrors,
          // Only stamp lastValidated when a validation pass actually ran. With
          // validateOnChange off (or no schema) we recompute nothing, so bumping
          // the timestamp would falsely flip `isValid` true (it gates on
          // lastValidated !== null). Matches reindexArray.
          ...(validateOnChange && schema ? { lastValidated: Date.now() } : {}),
          canSubmit: newCanSubmit,
        }),
      });

      // A wholesale assignment carries no old->new item mapping, so any stable ids
      // tracked for an array AT or UNDER this path can't be preserved — signal a
      // re-mint for the subtree. This covers replacing the array itself AND
      // replacing a parent object that contains it. (A leaf value edit has no
      // tracked array under it, so subscribers leave their ids untouched.)
      notifyArrayStructure({ kind: 'reset-subtree', path });
    },
    [
      validateOnChange,
      schema,
      markPathAsTouched,
      dispatch,
      notifyArrayStructure,
    ]
  );

  // Function to set isSubmitting status - explicitly defined
  const getValue = useCallback(<V = unknown,>(path: (string | number)[]): V => {
    // Use the ref for immediate value access
    return getValueAtPath(valuesRef.current, path) as V;
  }, []);

  // Set errors with proper ref sync
  const setErrors = useCallback(
    (errors: ValidationError[]) => {
      // Update ref first, then state.
      errorsRef.current = errors;
      // Resync the per-source channel baselines from the full list. `setErrors` is a
      // wholesale replace, and `server` / `client-form-handler` errors each keep a
      // PARALLEL store (serverErrorsRef for setServerError(s)' merge/replace-all;
      // clientSubmissionErrorRef for getClientSubmissionError). Without this, a raw
      // setErrors([{ source: 'server', … }]) lands in errorsRef but not the baseline,
      // so a later setServerError(s) rebuilds from a stale baseline and silently
      // drops it (and getClientSubmissionError would under-report a raw cfh error).
      // 'manual'/'client' have no parallel store — they live solely in errorsRef.
      serverErrorsRef.current = errors.filter((e) => e.source === 'server');
      clientSubmissionErrorRef.current = errors
        .filter((e) => e.source === 'client-form-handler')
        .map((e) => e.message);
      dispatch({
        type: 'UPDATE_STATE',
        updates: { errors },
      });
    },
    [dispatch]
  );

  // Simplified setFieldTouched function that uses refs
  const setFieldTouched = useCallback(
    (path: (string | number)[], value: boolean = true) => {
      // Update the ref immediately
      if (value) {
        touchedRef.current = markPathAsTouched(touchedRef.current, path);
      } else {
        // If not touching, just set the specific path
        touchedRef.current = {
          ...touchedRef.current,
          [serializePath(path)]: value,
        };
      }

      // Directly dispatch the state update
      dispatch({
        type: 'UPDATE_STATE',
        updates: { touched: touchedRef.current },
      });
    },
    [markPathAsTouched, dispatch]
  );

  // Create a validate function that can be used by components
  const validateFunction = useCallback(
    (force?: boolean) => {
      if (force) {
        // Mark all fields as touched first
        const allPaths = getValuePaths();
        for (const path of allPaths) {
          setFieldTouched(path, true);
        }
      }
      const result = validateForm();
      if (!result.valid && result.errors) {
        // Update errors ref first. Validation owns the Zod ('client') + untagged
        // errors; externally-owned errors (server/manual/client-form-handler) are
        // preserved across re-validation.
        const preservedErrors = errorsRef.current.filter(
          (e) => !isValidationOwnedError(e)
        );
        const newErrors = [...preservedErrors, ...(result.errors || [])];
        errorsRef.current = newErrors;

        // When forcing (validate(true) / submit()), reveal EVERY validation error,
        // including ones for required fields absent from `values`. The force-touch
        // loop above walks the value tree, so a field that isn't in `values` has no
        // node to visit and stays untouched — its (touch-gated) error would stay
        // hidden in useField even though focusFirstError can already focus it. Touch
        // each error's path so the display matches "reveal all".
        if (force) {
          let nextTouched = touchedRef.current;
          for (const e of result.errors) {
            nextTouched = markPathAsTouched(nextTouched, e.path);
          }
          touchedRef.current = nextTouched;
        }

        // Then update state (fold in the revealed touches when forcing)
        dispatch({
          type: 'UPDATE_STATE',
          updates: force
            ? { errors: errorsRef.current, touched: touchedRef.current }
            : { errors: errorsRef.current },
        });
      } else if (result.valid) {
        // Form is now valid — clear any stale validation-owned errors (Zod 'client'
        // + untagged) left over from a previous invalid pass, so they don't linger
        // and keep `isValid` false on a clean form. Externally-owned errors
        // (server/manual/client-form-handler) are preserved. Only dispatch when
        // there's something to drop, so a no-op validate() of an already-clean form
        // doesn't trigger an extra render.
        if (errorsRef.current.some(isValidationOwnedError)) {
          const newErrors = errorsRef.current.filter(
            (e) => !isValidationOwnedError(e)
          );

          errorsRef.current = newErrors;

          dispatch({
            type: 'UPDATE_STATE',
            updates: { errors: errorsRef.current },
          });
        }
      }
      return result.valid;
    },
    [getValuePaths, setFieldTouched, validateForm, dispatch, markPathAsTouched]
  );

  // Imperatively validate a single field ("trigger"). Marks it touched (errors are
  // touch-gated) and reconciles just this field's Zod error: Zod validates the
  // whole object — a field can depend on others via .refine — so we run the full
  // schema, drop the field's stale 'client' error, and re-add a fresh one if it's
  // still invalid. Server/manual errors at the path are left as-is. Returns whether
  // the field is now error-free (no error of any source at the path).
  const validateField = useCallback(
    (path: (string | number)[]): boolean => {
      const atPath = (p: (string | number)[]) =>
        p.length === path.length && p.every((val, idx) => path[idx] === val);

      setFieldTouched(path, true);

      if (schema) {
        const result = validate(schema, valuesRef.current);
        const withoutStale = errorsRef.current.filter(
          (e) => !isValidationOwnedError(e) || !atPath(e.path)
        );
        const freshAtPath = result.valid
          ? []
          : (result.errors ?? []).filter((e) => atPath(e.path));
        errorsRef.current = [...withoutStale, ...freshAtPath];
        // validateField runs the full schema, so keep whole-form canSubmit in sync
        // with the result — matching validateForm/setValue. Otherwise the submit
        // button could read stale after validating through this imperative path.
        canSubmitRef.current = result.valid;
        dispatch({
          type: 'UPDATE_STATE',
          updates: {
            errors: errorsRef.current,
            lastValidated: Date.now(),
            canSubmit: result.valid,
          },
        });
      }

      return !errorsRef.current.some((e) => atPath(e.path));
    },
    [setFieldTouched, schema, dispatch]
  );

  // Field blur handler shared by useField and any raw-context consumer. Marks the
  // field touched and, when validateOnBlur is enabled, runs validation so leaving
  // a field invalid surfaces its error. Centralizing it here means validateOnBlur
  // works no matter how a field wires its onBlur (useField or raw context).
  const handleBlur = useCallback(
    (path: (string | number)[]) => {
      setFieldTouched(path, true);
      if (validateOnBlur) {
        validateFunction();
      }
    },
    [setFieldTouched, validateOnBlur, validateFunction]
  );

  // Function used for mount validation
  const performInitialValidation = useCallback(() => {
    const allPaths = getValuePaths();

    // By default only mark *populated* fields touched: a prefilled form surfaces
    // errors for the data it loaded, while empty fields the user hasn't reached
    // stay quiet (errors are gated on touched). touchAllOnMount touches everything.
    let newTouched: Record<string, boolean> = {};
    for (const path of allPaths) {
      if (touchAllOnMount || !isEmptyValue(getValueAtPath(values, path))) {
        newTouched[serializePath(path)] = true;
      }
    }

    // Validate form directly
    const result = validateForm();
    const validationErrors = result.valid ? [] : result.errors || [];

    // touchAllOnMount means "reveal every error on load." The value-tree walk above
    // can't touch a required field that's absent from `values` (it has no node to
    // visit), so fold in each error's path too — matching submit()/validate(true).
    if (touchAllOnMount) {
      for (const e of validationErrors) {
        newTouched = markPathAsTouched(newTouched, e.path);
      }
    }

    // Update the touched ref
    touchedRef.current = newTouched;

    // Preserve externally-owned errors (server/manual/client-form-handler, e.g.
    // seeded via initialServerErrors) — mount validation only owns the validation
    // errors (Zod 'client' + untagged).
    const preservedErrors = errorsRef.current.filter(
      (e) => !isValidationOwnedError(e)
    );
    const newErrors = [...preservedErrors, ...validationErrors];

    // Update errors ref
    errorsRef.current = newErrors;

    // Combine everything into a single batch update
    dispatch({
      type: 'UPDATE_STATE',
      updates: {
        touched: newTouched,
        errors: newErrors,
        lastValidated: Date.now(),
        canSubmit: result.valid,
      },
    });
  }, [getValuePaths, validateForm, values, touchAllOnMount, markPathAsTouched]);

  // Combined effect for mount tracking and validation
  React.useEffect(() => {
    mountedRef.current = true;

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (validateOnMount && schema) {
      // For testing purposes, we'll execute synchronously to avoid test timeouts
      if (process.env.NODE_ENV === 'test') {
        // In tests, execute synchronously
        performInitialValidation();
      } else {
        // In production, defer validation to next tick to ensure component mount cycle completes
        // This helps prevent potential React state update warnings during commit phase
        timer = setTimeout(performInitialValidation, 0);
      }
    }

    return () => {
      mountedRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [validateOnMount, schema, performInitialValidation]);

  // Abort any in-flight submission ONLY on a real unmount, so a fetch wired to
  // helpers.signal cancels. This is its own effect with empty deps — the
  // mount-validation effect above re-runs (and its cleanup fires) on ordinary value
  // changes, which must NOT abort an in-flight submit.
  React.useEffect(() => {
    return () => {
      currentAbortControllerRef.current?.abort();
      currentAbortControllerRef.current = null;
    };
  }, []);

  // Helper function removed since we now filter errors directly

  // Check if a field exists at the given path
  const hasField = useCallback((path: (string | number)[]) => {
    // Read the live ref so a mid-batch call (e.g. setServerErrors' path filter, or
    // hasField inside onSubmit after a setValue) sees the current values.
    let current: Record<string | number, unknown> | unknown = valuesRef.current;

    for (let i = 0; i < path.length; i++) {
      const segment = path[i];

      // If current becomes non-object/array prematurely, path is invalid
      if (typeof current !== 'object' || current === null) {
        return false;
      }

      // Check if the property/index exists before trying to access it
      if (!Object.prototype.hasOwnProperty.call(current, segment)) {
        // Special case for arrays: check if index is within bounds numerically
        // hasOwnProperty doesn't work reliably for array indices > length or sparse arrays
        if (Array.isArray(current) && typeof segment === 'number') {
          if (segment < 0 || segment >= current.length) {
            return false; // Index out of bounds
          }
          // If index is within bounds but potentially sparse (undefined),
          // we still consider the path "existing" up to this point. Let access proceed.
        } else {
          return false; // Property doesn't exist on object
        }
      }

      // Move to the next part of the path
      current = (current as Record<string | number, unknown>)[segment];
    }

    // If the loop completes, it means every segment existed and was traversable.
    return true;
  }, []);

  // Implement the clearValue function to set a field to an empty value.
  // Returns true if a field existed at `path` and was cleared, false if the path
  // doesn't exist (nothing to clear).
  const clearValue = useCallback(
    (path: (string | number)[]): boolean => {
      if (!hasField(path)) return false;

      // Clearing is just assigning the field its type-appropriate empty value, so
      // delegate to setValue. That keeps the behavior consistent: the field's
      // errors (whole subtree, all sources) are cleared, the path is marked
      // touched, and validation re-runs — instead of leaving stale errors behind.
      const emptyValue = getEmptyValue(getValue(path));
      setValue(path, emptyValue);
      return true;
    },
    [getValue, hasField, setValue]
  );

  // Helper function to handle array item deletion
  const deleteField = useCallback(
    (path: (string | number)[]) => {
      // Get parent path and last key
      const lastKey = path[path.length - 1];
      const parentPath = path.slice(0, -1);

      // Check if we're deleting from an array
      let isArrayItem = false;
      let arrayIndex = -1;

      // First, determine if this is an array item
      const parent = getValueAtPath(valuesRef.current, parentPath);

      if (parent && typeof parent === 'object' && Array.isArray(parent)) {
        isArrayItem = true;
        arrayIndex = Number(lastKey);
      }

      // If it's an array item, handle it directly here instead of using deleteArrayItem
      if (isArrayItem && arrayIndex >= 0) {
        // Get the current array
        const array = parent as unknown[];

        // Create a new array without the deleted item
        const newItems = array.filter((_, i) => i !== arrayIndex);

        // Create a new values object with the updated array - first update valuesRef.
        // Clone ALONG the parent path (not just the root) so the array's container
        // object is a fresh copy. initialValues / the dirty baseline may share that
        // reference, and setValueAtPath writes through it in place — a root-only
        // shallow clone would mutate the shared object and corrupt reset()/isDirty.
        const newValues = cloneAlongPath(valuesRef.current, parentPath);
        setValueAtPath(newValues, parentPath, newItems);
        valuesRef.current = newValues;

        // Index map for the removal: the removed item drops (null) and later items
        // shift down one. Shared by the touched and error re-index below — the same
        // remap reindexArray uses for move/swap/insert — so a delete shifts metadata
        // down rather than wiping it.
        const indexMap = (j: number): number | null =>
          j === arrayIndex ? null : j > arrayIndex ? j - 1 : j;

        // Re-index touched: rebuild the map with re-indexed keys (drop the dropped),
        // exactly as reindexArray does.
        const newTouched: Record<string, boolean> = {};
        for (const [key, val] of Object.entries(touchedRef.current)) {
          if (!val) continue;
          let keyPath: (string | number)[];
          try {
            keyPath = deserializePath(key);
          } catch {
            newTouched[key] = val; // not a path we created; leave it
            continue;
          }
          const np = remapPathUnderArray(keyPath, parentPath, indexMap);
          if (np === null) continue;
          newTouched[serializePath(np)] = true;
        }
        touchedRef.current = newTouched;

        // Re-index errors under the array instead of wiping them: the removed
        // item's errors drop and errors on items after it shift down one index.
        // This keeps server/manual errors (and any validation errors) attached to
        // their surviving items rather than being lost on a delete.
        const newErrors = remapErrorsUnderArray(
          errorsRef.current,
          parentPath,
          indexMap
        );
        errorsRef.current = newErrors;

        // Keep serverErrorsRef (its own baseline) in sync so a later
        // setServerError()/setServerErrors() rebuilds from correctly-indexed
        // server errors instead of resurrecting stale ones.
        serverErrorsRef.current = remapErrorsUnderArray(
          serverErrorsRef.current,
          parentPath,
          indexMap
        );

        // Recompute ALL validation-owned errors (Zod 'client' + untagged) from the new
        // full-form result, mirroring setValue: removing an item can change errors
        // anywhere (the array-level z.array().min, but also a cross-field .refine landing
        // on a sibling), and the remap above only moved item metadata, not the array's
        // own or cross-field errors. Keep the already-remapped externally-owned errors
        // (server/manual/client-form-handler).
        let finalErrors = newErrors;
        let newCanSubmit = canSubmit;

        if (validateOnChange && schema) {
          const result = validate(schema, newValues);
          newCanSubmit = result.valid;

          const preserved = newErrors.filter((e) => !isValidationOwnedError(e));
          const freshClient = result.valid ? [] : (result.errors ?? []);
          finalErrors = [...preserved, ...freshClient];
          errorsRef.current = finalErrors;
        }

        // Dispatch a single update with all changes
        dispatch({
          type: 'UPDATE_STATE',
          updates: {
            values: newValues,
            touched: newTouched,
            errors: finalErrors,
            // Only stamp lastValidated when a validation pass actually ran (see
            // setValue) — otherwise `isValid` would falsely flip true on a
            // validateOnChange-off / schema-less form. Matches reindexArray.
            ...(validateOnChange && schema ? { lastValidated: Date.now() } : {}),
            canSubmit: newCanSubmit,
          },
        });

        // Tell id-tracking subscribers an item was removed so their stable ids
        // follow (the deleted index drops; everything after it shifts down).
        notifyArrayStructure({
          kind: 'reindex',
          path: parentPath,
          indexMap: (j) =>
            j === arrayIndex ? null : j > arrayIndex ? j - 1 : j,
          newLength: newItems.length,
        });
      } else {
        // For non-array items, implement a comprehensive approach.
        // Clone ALONG the path (not just the root) so the parent object we delete
        // from is a fresh copy — never the shared reference held by initialValues
        // or the dirty baseline. A root-only shallow clone would `delete` from the
        // shared nested object in place, corrupting reset() and making isDirty
        // miss the change (the baseline would lose the key too).
        const newValues = cloneAlongPath(valuesRef.current, path);

        // Handle the case where we're deleting a top-level field
        if (parentPath.length === 0) {
          if (Object.prototype.hasOwnProperty.call(newValues, lastKey)) {
            delete newValues[lastKey as keyof typeof newValues];
          }
        } else {
          // For nested fields, navigate to the (now freshly cloned) parent object
          const parentObj = getValueAtPath(newValues, parentPath) as
            | Record<string | number, unknown>
            | undefined;

          if (parentObj && typeof parentObj === 'object') {
            delete parentObj[lastKey];
          }
        }

        // Update valuesRef immediately
        valuesRef.current = newValues;

        // Create a new touched state with all related touched states removed
        const newTouched = { ...touchedRef.current };
        const serializedPath = serializePath(path);

        // Remove touched state for the deleted field and all its children
        for (const key of Object.keys(newTouched)) {
          // Remove exact match
          if (key === serializedPath) {
            delete newTouched[key];
          }
          // For nested fields, we need to check if they're children of the deleted path
          // This is more complex with JSON serialization, so we'll deserialize and check
          else {
            try {
              const keyPath = JSON.parse(key);
              if (
                keyPath.length > path.length &&
                path.every((val, idx) => keyPath[idx] === val)
              ) {
                delete newTouched[key];
              }
            } catch {
              // If key isn't valid JSON, it's not a path we created with serializePath
              // so we can safely ignore it
            }
          }
        }

        // Update touchedRef immediately
        touchedRef.current = newTouched;

        // Create a new errors array with all related errors removed
        const newErrors = errorsRef.current.filter((error) => {
          // Keep errors not related to this path
          if (error.path.length < path.length) {
            return true;
          }

          // Remove errors for the deleted field and its children
          return !error.path
            .slice(0, path.length)
            .every((val, idx) => path[idx] === val);
        });

        // Update errorsRef immediately
        errorsRef.current = newErrors;

        // Keep serverErrorsRef in sync (see the array branch above): drop server
        // errors under the deleted path so a later setServerError() can't rebuild
        // them from a stale baseline.
        serverErrorsRef.current = serverErrorsRef.current.filter((error) => {
          if (error.path.length < path.length) {
            return true;
          }
          return !error.path
            .slice(0, path.length)
            .every((val, idx) => path[idx] === val);
        });

        // Validate the form after deletion. Recompute ALL validation-owned errors (Zod
        // 'client' + untagged) from the new full-form result, mirroring setValue — a
        // deletion can change a cross-field .refine error on an unrelated sibling, not
        // just errors under the deleted path. Keep the externally-owned errors
        // (server/manual/client-form-handler) already filtered above (the deleted
        // subtree's were dropped); only validation-owned errors are regenerated.
        let finalErrors = newErrors;
        let newCanSubmit = canSubmit;

        if (validateOnChange && schema) {
          const result = validate(schema, newValues);

          // Update canSubmit based on validation result
          newCanSubmit = result.valid;

          const preserved = newErrors.filter((e) => !isValidationOwnedError(e));
          const freshClient = result.valid ? [] : (result.errors ?? []);
          finalErrors = [...preserved, ...freshClient];
          errorsRef.current = finalErrors;
        }

        // Dispatch a single update with all changes
        dispatch({
          type: 'UPDATE_STATE',
          updates: {
            values: newValues,
            touched: newTouched,
            errors: finalErrors,
            // Only stamp lastValidated when a validation pass actually ran (see
            // setValue) — otherwise `isValid` would falsely flip true on a
            // validateOnChange-off / schema-less form. Matches reindexArray.
            ...(validateOnChange && schema ? { lastValidated: Date.now() } : {}),
            canSubmit: newCanSubmit,
          },
        });
      }
    },
    [canSubmit, validateOnChange, schema, notifyArrayStructure]
  );

  // Atomically reshape an array field and re-index the metadata attached to its
  // items. `newItems` is the replacement array; `indexMap` maps each OLD item
  // index to its new index (or null to drop). Used by useArrayField's reorder
  // ops (move/swap/insert/replace) so that values, touched, validation errors AND
  // the server-error baseline all stay in sync in a single dispatch — unlike
  // doing it from the hook via the public API, which can't reach serverErrorsRef.
  const reindexArray = useCallback(
    (
      arrayPath: (string | number)[],
      newItems: unknown[],
      indexMap: (oldIndex: number) => number | null
    ) => {
      // 1. Values — set the new array at arrayPath.
      const newValues = cloneAlongPath(valuesRef.current, arrayPath);
      setValueAtPath(
        newValues as Record<string | number, unknown>,
        arrayPath,
        newItems
      );
      valuesRef.current = newValues;

      // 2. Touched — rebuild the map with re-indexed keys (drop the dropped).
      const remappedTouched: Record<string, boolean> = {};
      for (const [key, val] of Object.entries(touchedRef.current)) {
        if (!val) continue;
        let keyPath: (string | number)[];
        try {
          keyPath = deserializePath(key);
        } catch {
          remappedTouched[key] = val; // not a path we created; leave it
          continue;
        }
        const np = remapPathUnderArray(keyPath, arrayPath, indexMap);
        if (np === null) continue;
        remappedTouched[serializePath(np)] = true;
      }
      // Mark the array path (and its parents) touched, matching setValue — which
      // is what add() and the other value mutations do. Changing the array is a
      // user interaction, so touched-gated array-level validation/UI (e.g. a
      // z.array().min error) stays consistent across add/insert/move/swap/replace.
      const newTouched = markPathAsTouched(remappedTouched, arrayPath);
      touchedRef.current = newTouched;

      // 3. Errors — re-index both the combined list and the server-only baseline
      // so a later setServerError can't rebuild stale (pre-reorder) indices.
      errorsRef.current = remapErrorsUnderArray(
        errorsRef.current,
        arrayPath,
        indexMap
      );
      serverErrorsRef.current = remapErrorsUnderArray(
        serverErrorsRef.current,
        arrayPath,
        indexMap
      );

      // 4. Re-validate (when validating on change). Recompute ALL validation-owned
      // errors (Zod 'client' + untagged) from the new full-form result, mirroring
      // setValue/deleteField — NOT just the array-path error. Reindexing only moved
      // the item-level metadata, but reshaping an array can change validation
      // anywhere: the array-level rule (`z.array(...).min(1)` at arrayPath), an
      // item's own error, AND a cross-field `.refine()` that lands on an unrelated
      // sibling. Keeping the already-remapped externally-owned errors (server/
      // manual/client-form-handler) preserved, regenerate the rest so any cross-
      // referencing refine updates live, the same as a plain setValue.
      let newCanSubmit = canSubmitRef.current;
      if (validateOnChange && schema) {
        const result = validate(schema, newValues);
        newCanSubmit = result.valid;
        canSubmitRef.current = newCanSubmit;

        const preserved = errorsRef.current.filter(
          (e) => !isValidationOwnedError(e)
        );

        const freshClient = result.valid ? [] : (result.errors ?? []);
        errorsRef.current = [...preserved, ...freshClient];
      }

      // 5. Single dispatch.
      dispatch({
        type: 'UPDATE_STATE',
        updates: {
          values: newValues,
          touched: newTouched,
          errors: errorsRef.current,
          canSubmit: newCanSubmit,
          ...(validateOnChange && schema ? { lastValidated: Date.now() } : {}),
        },
      });

      // Tell id-tracking subscribers how items moved so their stable ids follow.
      notifyArrayStructure({
        kind: 'reindex',
        path: arrayPath,
        indexMap,
        newLength: newItems.length,
      });
    },
    [
      validateOnChange,
      schema,
      dispatch,
      markPathAsTouched,
      notifyArrayStructure,
    ]
  );

  // Reads the live errors ref (the synchronous source of truth), so an imperative
  // call mid-batch — e.g. getError inside onSubmit right after setServerError — sees
  // the current errors, matching getValue/getFieldSnapshot. State still drives
  // renders: contextValue recomputes when `errors` changes, re-rendering consumers.
  const getError = useCallback((path: (string | number)[]) => {
    return errorsRef.current.filter(
      (error) =>
        error.path.length === path.length &&
        error.path.every((val, idx) => path[idx] === val)
    );
  }, []);

  const getErrorPaths = useCallback((basePath: (string | number)[] = []) => {
    return errorsRef.current
      .filter(
        (error) =>
          error.path.length >= basePath.length &&
          basePath.every((val, idx) => error.path[idx] === val)
      )
      .map((error) => error.path);
  }, []);

  // Convenience snapshot of one field's state. Pure read over getError + the touched
  // ref + hasField; errors are raw (not touched-gated) so callers see the real
  // validation state. All three read the live refs, so it's consistent with the
  // other readers when called imperatively (e.g. inside onSubmit).
  const getFieldState = useCallback(
    (path: (string | number)[]): FieldState => {
      const fieldErrors = getError(path);
      return {
        errors: fieldErrors,
        error: fieldErrors[0]?.message ?? null,
        isTouched: !!touchedRef.current[serializePath(path)],
        invalid: fieldErrors.length > 0,
        exists: hasField(path),
      };
    },
    [getError, hasField]
  );

  // --- Per-field subscriptions (re-render isolation) -----------------------
  // useField subscribes here instead of reading the reactive FormContext, so it
  // only re-renders when its own value/touched/errors change — not on every
  // unrelated keystroke. Reads come straight from the refs (the synchronous source
  // of truth); the notify effect below pings subscribers after each commit.
  const fieldSubscribersRef = React.useRef<Set<() => void>>(new Set());
  const subscribeField = useCallback((listener: () => void) => {
    fieldSubscribersRef.current.add(listener);
    return () => {
      fieldSubscribersRef.current.delete(listener);
    };
  }, []);

  // Registry of focusable field nodes for setFocus/focusFirstError. A Map keyed by
  // serialized path; it preserves insertion order, so iteration follows the order
  // fields registered (≈ mount/source order) — which is the order focusFirstError
  // scans. Stores a structural Focusable (DOM element OR RN TextInput OR any node
  // with focus()), never a DOM-typed reference, so the core stays platform-agnostic.
  const fieldRefsRef = React.useRef<Map<string, Focusable>>(new Map());
  const registerFieldRef = useCallback(
    (path: (string | number)[], node: Focusable | null) => {
      const key = serializePath(path);
      if (node) {
        fieldRefsRef.current.set(key, node);
      } else {
        fieldRefsRef.current.delete(key);
      }
    },
    []
  );

  const setFocus = useCallback((path: (string | number)[]): boolean => {
    const node = fieldRefsRef.current.get(serializePath(path));
    if (!node || typeof node.focus !== 'function') return false;
    node.focus();
    // Web nicety, feature-detected so it's a no-op on platforms without it (RN):
    // bring a focused field into view inside a scroll container.
    const scrollable = node as { scrollIntoView?: (arg?: unknown) => void };
    if (typeof scrollable.scrollIntoView === 'function') {
      scrollable.scrollIntoView({ block: 'center' });
    }
    return true;
  }, []);

  const focusFirstError = useCallback((): (string | number)[] | null => {
    // Scan registered fields in registration order; focus the first one that
    // currently has an error of any source. errorsRef is the synchronous source
    // of truth, so this is correct immediately after a submit/validate.
    for (const [key, node] of fieldRefsRef.current) {
      const hasError = errorsRef.current.some(
        (e) => serializePath(e.path) === key
      );
      if (!hasError || typeof node.focus !== 'function') continue;
      const path = deserializePath(key);
      setFocus(path);
      return path;
    }
    return null;
  }, [setFocus]);

  // Per-path snapshot cache: getFieldSnapshot must return a STABLE reference when a
  // field's slice is unchanged, or useSyncExternalStore would loop / always render.
  const fieldSnapshotCacheRef = React.useRef<Map<string, FieldSnapshot>>(
    new Map()
  );
  const getFieldSnapshot = useCallback(
    (path: (string | number)[]): FieldSnapshot => {
      const key = serializePath(path);
      const value = getValueAtPath(valuesRef.current, path);
      const isTouched = !!touchedRef.current[key];
      const errors = errorsRef.current.filter(
        (e) =>
          e.path.length === path.length &&
          e.path.every((val, idx) => path[idx] === val)
      );
      const cached = fieldSnapshotCacheRef.current.get(key);
      if (
        cached &&
        cached.value === value &&
        cached.isTouched === isTouched &&
        sameErrors(cached.errors, errors)
      ) {
        return cached;
      }
      const snap: FieldSnapshot = { value, isTouched, errors };
      fieldSnapshotCacheRef.current.set(key, snap);
      return snap;
    },
    []
  );

  // Notify field subscribers after each commit whose value/touched/errors changed.
  // The mutators update the refs synchronously (so getFieldSnapshot already sees the
  // new data); this effect just tells useSyncExternalStore consumers to re-read.
  // Driving it off the reactive state means we can't forget a mutation site.
  React.useEffect(() => {
    for (const listener of fieldSubscribersRef.current) listener();
  }, [values, touched, errors]);

  // Stable value for FormFieldContext: its identity must stay fixed (that's what
  // keeps subscribed fields from re-rendering). The reactive parts (subscribeField,
  // getFieldSnapshot) are themselves stable; the mutators are routed through a ref
  // refreshed in an effect, and read at call time (not during render).
  const liveFieldMethodsRef = React.useRef({
    getValue,
    setValue,
    handleBlur,
    setFieldTouched,
    reindexArray,
    deleteField,
  });
  React.useEffect(() => {
    liveFieldMethodsRef.current = {
      getValue,
      setValue,
      handleBlur,
      setFieldTouched,
      reindexArray,
      deleteField,
    };
  });
  const fieldContextValue = useMemo<FormFieldContextValue>(
    () => ({
      subscribeField,
      getFieldSnapshot,
      getValue<V = unknown>(path: (string | number)[]): V {
        return liveFieldMethodsRef.current.getValue<V>(path);
      },
      setValue<V = unknown>(path: (string | number)[], value: V): void {
        liveFieldMethodsRef.current.setValue<V>(path, value);
      },
      handleBlur(path: (string | number)[]): void {
        liveFieldMethodsRef.current.handleBlur(path);
      },
      setFieldTouched(path: (string | number)[], value?: boolean): void {
        liveFieldMethodsRef.current.setFieldTouched(path, value);
      },
      reindexArray(
        arrayPath: (string | number)[],
        newItems: unknown[],
        indexMap: (oldIndex: number) => number | null
      ): void {
        liveFieldMethodsRef.current.reindexArray(arrayPath, newItems, indexMap);
      },
      deleteField(path: (string | number)[]): void {
        liveFieldMethodsRef.current.deleteField(path);
      },
      subscribeArrayStructure,
      registerFieldRef,
    }),
    [
      subscribeField,
      getFieldSnapshot,
      subscribeArrayStructure,
      registerFieldRef,
    ]
  );

  const reset = useCallback(
    (force?: boolean): boolean => {
      // Prevent resetting while submitting unless forced
      if (isSubmittingRef.current && !force) {
        console.warn(
          'Attempted to reset form while submitting. Use force=true to reset anyway.'
        );
        return false;
      }

      // If we're forcing a reset while submitting, cancel the submission first
      if (isSubmittingRef.current && force) {
        isSubmittingRef.current = false;
        currentSubmissionIDRef.current = null;
        // Abort the in-flight request's signal so a fetch wired to helpers.signal
        // actually cancels (not just the helpers.* no-op'ing via isCurrentSubmission).
        currentAbortControllerRef.current?.abort();
        currentAbortControllerRef.current = null;
        // Dispatch updates for submission state if it was active
        dispatch({
          type: 'UPDATE_STATE',
          updates: { isSubmitting: false, currentSubmissionID: null },
        });
      }

      // Update refs first - this is critical for immediate access
      valuesRef.current = initialValues;
      touchedRef.current = {};
      errorsRef.current = [];
      serverErrorsRef.current = [];
      clientSubmissionErrorRef.current = [];
      canSubmitRef.current = false; // Typically, a reset form isn't immediately submittable until validated
      // A reset clears submission tracking — back to "never submitted" — so the
      // stale ID from a completed (or force-cancelled) submit doesn't linger and
      // make isCurrentSubmission report a dead submission as current.
      currentSubmissionIDRef.current = null;

      // reset() means "back to load" — the dirty baseline returns to initialValues
      // too, so a freshly reset form reads clean.
      setBaseline(initialValues);

      // Then update the main state to reflect the reset
      dispatch({
        type: 'UPDATE_STATE',
        updates: {
          values: initialValues,
          touched: {},
          errors: [],
          lastValidated: null,
          canSubmit: false, // Reflects canSubmitRef.current
          // Clear submit-attempt tracking — a reset form is back to "never submitted".
          submitAttempted: false,
          submitSucceeded: false,
          submitCount: 0,
          // Always clear the submission ID (the forced-mid-submit branch above also
          // flips isSubmitting off; isSubmitting is otherwise left as-is).
          currentSubmissionID: null,
        },
      });
      // Values were replaced wholesale — id-tracking subscribers re-derive.
      notifyArrayStructure({ kind: 'reset-all' });
      return true;
    },
    [initialValues, dispatch, notifyArrayStructure]
  );

  // Type-safe resetWithValues function
  const resetWithValues = useCallback(
    (newValues: T, force?: boolean): boolean => {
      // Check if we're submitting and not forcing
      if (isSubmittingRef.current && !force) {
        console.warn(
          'Attempted to reset form while submitting. Use force=true to reset anyway.'
        );
        return false;
      }

      // If we're forcing a reset while submitting, invalidate the submission first.
      // Clear the submission ID too (matching reset()) so any stale helpers.* writes
      // from the in-flight onSubmit no-op via isCurrentSubmission.
      if (isSubmittingRef.current && force) {
        isSubmittingRef.current = false;
        currentSubmissionIDRef.current = null;
        // Abort the in-flight request's signal (matching reset(true)) so a fetch
        // wired to helpers.signal actually cancels.
        currentAbortControllerRef.current?.abort();
        currentAbortControllerRef.current = null;
        dispatch({
          type: 'UPDATE_STATE',
          updates: { isSubmitting: false, currentSubmissionID: null },
        });
      }

      // Update refs first - this is critical for immediate access
      valuesRef.current = newValues;
      touchedRef.current = {};
      errorsRef.current = [];
      serverErrorsRef.current = [];
      clientSubmissionErrorRef.current = [];
      canSubmitRef.current = false; // Reset form isn't immediately submittable
      // Clear submission tracking — matching reset() — so a stale ID can't outlive
      // the reset and read as the current submission.
      currentSubmissionIDRef.current = null;

      // resetWithValues() establishes a new known state — the dirty baseline moves
      // to those values so the form reads clean immediately after.
      setBaseline(newValues);

      // Then update the main state to reflect the reset
      dispatch({
        type: 'UPDATE_STATE',
        updates: {
          values: newValues,
          touched: {},
          errors: [],
          lastValidated: null,
          canSubmit: false, // Reflects canSubmitRef.current
          // Clear submit-attempt tracking — a reset form is back to "never submitted".
          submitAttempted: false,
          submitSucceeded: false,
          submitCount: 0,
          // Always clear the submission ID (see reset()).
          currentSubmissionID: null,
        },
      });
      // Values were replaced wholesale — id-tracking subscribers re-derive.
      notifyArrayStructure({ kind: 'reset-all' });
      return true;
    },
    [dispatch, notifyArrayStructure] // initialValues is not needed here as newValues is passed
  );

  // Function to check if a submission ID is the current one
  const isCurrentSubmission = useCallback((submissionId: string) => {
    return currentSubmissionIDRef.current === submissionId;
  }, []);

  // Set the current submission ID
  const setSubmissionId = useCallback(
    (submissionId: string | null) => {
      currentSubmissionIDRef.current = submissionId;
      dispatch({
        type: 'UPDATE_STATE',
        updates: { currentSubmissionID: submissionId },
      });
    },
    [dispatch]
  );

  // Client submission error methods - improved with refs
  const setClientSubmissionError = useCallback(
    (message: string | string[] | null) => {
      // Directly update the client submission error ref
      if (message === null) {
        clientSubmissionErrorRef.current = [];
      } else {
        clientSubmissionErrorRef.current = Array.isArray(message)
          ? [...message]
          : [message];
      }

      // Update errors state to include client error messages while preserving server errors
      const filteredErrors = errorsRef.current.filter(
        (e) => e.source !== 'client-form-handler'
      );

      // Add new client submission error messages if they exist
      let newErrors = [...filteredErrors];
      if (clientSubmissionErrorRef.current.length > 0) {
        const clientErrors = clientSubmissionErrorRef.current.map((msg) => ({
          path: [],
          message: msg,
          source: 'client-form-handler' as const,
        }));
        newErrors = [...filteredErrors, ...clientErrors];
      }

      // Update ref first for immediate access
      errorsRef.current = newErrors;

      // Then update state
      dispatch({
        type: 'UPDATE_STATE',
        updates: { errors: errorsRef.current },
      });
    },
    [dispatch]
  );

  const clearClientSubmissionError = useCallback(() => {
    // Directly clear the ref
    clientSubmissionErrorRef.current = [];

    // Update errors state to remove client error messages while preserving others
    const newErrors = errorsRef.current.filter(
      (e) => e.source !== 'client-form-handler'
    );

    // Update ref first
    errorsRef.current = newErrors;

    // Then update state
    dispatch({
      type: 'UPDATE_STATE',
      updates: { errors: errorsRef.current },
    });
  }, [dispatch]);

  const getClientSubmissionError = useCallback(() => {
    return [...clientSubmissionErrorRef.current]; // Return a copy to prevent mutation
  }, []);

  // Updated server error methods
  const setServerErrors = useCallback(
    (newErrors: ValidationError[]) => {
      // Filter out invalid paths
      const validServerErrors = newErrors
        .filter((error) => error.path.length === 0 || hasField(error.path))
        .map((error) => ({ ...error, source: 'server' as const }));

      // Update server errors ref
      serverErrorsRef.current = validServerErrors;

      // Get current validation and client errors (using refs to avoid race conditions)
      const validationErrors = errorsRef.current.filter(
        (e) => e.source !== 'server'
      );

      // Combine all errors
      const combinedErrors = [...validationErrors, ...validServerErrors];

      // Update errors ref
      errorsRef.current = combinedErrors;

      // Update state
      dispatch({
        type: 'UPDATE_STATE',
        updates: { errors: errorsRef.current },
      });
    },
    [hasField, dispatch]
  );

  const setServerError = useCallback(
    (path: (string | number)[], message: string | string[] | null) => {
      // Get current server errors from ref
      const currentServerErrors = [...serverErrorsRef.current];

      // Filter out errors at this exact path
      const filteredServerErrors = currentServerErrors.filter(
        (e) =>
          e.path.length !== path.length ||
          !e.path.every((val, idx) => path[idx] === val)
      );

      // If message is null, we're just clearing errors for this path
      let newServerErrors = filteredServerErrors;

      // Otherwise add new server errors
      if (message !== null) {
        const messages = Array.isArray(message) ? message : [message];
        const pathErrors = messages.map((msg) => ({
          path,
          message: msg,
          source: 'server' as const,
        }));

        newServerErrors = [...filteredServerErrors, ...pathErrors];
      }

      // Update server errors ref
      serverErrorsRef.current = newServerErrors;

      // Get current non-server errors using ref
      const nonServerErrors = errorsRef.current.filter(
        (e) => e.source !== 'server'
      );

      // Combine all errors
      const combinedErrors = [...nonServerErrors, ...newServerErrors];

      // Update errors ref
      errorsRef.current = combinedErrors;

      // Update state
      dispatch({
        type: 'UPDATE_STATE',
        updates: { errors: errorsRef.current },
      });
    },
    [dispatch]
  );

  // Set (or clear) a manual/client error at a single path. Mirrors setServerError's
  // shape (string | string[] sets, null clears), but tags the error `source: 'manual'`
  // so it behaves like a server error — it survives re-validation, shows regardless of
  // touched, and clears when the user edits that field (setValue drops errors by path)
  // or on submit/reset. Use it for client-owned checks Zod can't express (e.g. async
  // "passwords don't match" surfaced client-side without going through the server).
  const setError = useCallback(
    (path: (string | number)[], message: string | string[] | null) => {
      // Drop any existing manual errors at this exact path. Other sources (Zod
      // 'client', 'server') at the path are left alone — they're owned elsewhere.
      const filtered = errorsRef.current.filter(
        (e) =>
          !(
            e.source === 'manual' &&
            e.path.length === path.length &&
            e.path.every((val, idx) => path[idx] === val)
          )
      );

      let newErrors = filtered;
      if (message !== null) {
        const messages = Array.isArray(message) ? message : [message];
        const pathErrors = messages.map((msg) => ({
          path,
          message: msg,
          source: 'manual' as const,
        }));
        newErrors = [...filtered, ...pathErrors];
      }

      errorsRef.current = newErrors;
      dispatch({ type: 'UPDATE_STATE', updates: { errors: newErrors } });
    },
    [dispatch]
  );

  // Move the dirty baseline (only) so current/explicit values read clean. Declared
  // as a named function expression so it can inspect `arguments.length` to tell
  // `markPristine(path)` (default to current value) from `markPristine(path, undefined)`
  // (explicitly baseline to undefined). See MarkPristine for the overloads. Defined
  // before submit() so it can be exposed on the FormHelpers passed to onSubmit.
  const markPristine = useCallback(function markPristine(
    arg?: (string | number)[] | Partial<T>,
    value?: unknown
  ): void {
    // No args: baseline the whole form to the current values.
    if (arg === undefined) {
      setBaseline(valuesRef.current);
      return;
    }

    // Path form: an array is a path; baseline that field/subtree.
    if (Array.isArray(arg)) {
      const path = arg;
      const explicitValue = arguments.length >= 2;
      const nextValue = explicitValue
        ? value
        : getValueAtPath(valuesRef.current, path);
      // An empty path means the whole form.
      if (path.length === 0) {
        setBaseline(nextValue as T);
        return;
      }
      setBaseline((prev) => {
        const next = cloneAlongPath(prev, path);
        setValueAtPath(next, path, nextValue);
        return next;
      });
      return;
    }

    // Batch form: a partial object mirroring the values shape (e.g. the API's
    // returned record). Move each provided leaf's baseline to its value.
    const leaves = flattenLeaves(arg);
    setBaseline((prev) => {
      let next = prev;
      for (const [path, leafValue] of leaves) {
        if (path.length === 0) continue;
        next = cloneAlongPath(next, path);
        setValueAtPath(next, path, leafValue);
      }
      return next;
    });
  }, []) as MarkPristine<T>;

  const submit = useCallback(async () => {
    if (!onSubmit) return;

    // Prevent multiple simultaneous submissions
    if (isSubmittingRef.current) {
      console.warn('Form submission prevented: already submitting.');
      return;
    }

    // Clear server, manual, and client submission errors before starting a new
    // submission — a fresh attempt re-derives them. Update refs first for immediate access.
    errorsRef.current = errorsRef.current.filter(
      (e) =>
        e.source !== 'server' &&
        e.source !== 'manual' &&
        e.source !== 'client-form-handler'
    );
    serverErrorsRef.current = []; // Clear server errors ref
    clientSubmissionErrorRef.current = []; // Clear client submission error ref

    // Then update state
    dispatch({ type: 'UPDATE_STATE', updates: { errors: errorsRef.current } });

    // Mark all fields as touched on submit
    const allPaths = getValuePaths();
    for (const path of allPaths) {
      setFieldTouched(path, true);
    }

    // Generate a new submission ID to track this submission
    const submissionId = generateID();

    // Fresh AbortController for this attempt. Aborted if the submission is
    // force-reset or the provider unmounts (see reset/resetWithValues + the unmount
    // cleanup); cleared in `finally` when this attempt settles as the current one.
    const abortController = new AbortController();
    currentAbortControllerRef.current = abortController;

    // Update state to indicate we're submitting and store the submission ID
    // Update ref first
    isSubmittingRef.current = true;
    setSubmissionId(submissionId); // This updates both ref and state

    // Then update state. Mark this as a submit attempt (pass or fail), bump the
    // running count, and clear the previous success flag for the duration of the
    // attempt — it flips back to true in `finally` only if this attempt succeeds.
    dispatch({
      type: 'UPDATE_STATE_FUNC',
      updater: (prev) => ({
        isSubmitting: true,
        submitAttempted: true,
        submitSucceeded: false,
        submitCount: prev.submitCount + 1,
      }),
    });

    // Tracks whether this attempt completed cleanly (validation passed, onSubmit
    // resolved without throwing, and the handler set no submission errors).
    let didSucceed = false;

    try {
      const result = validateForm();

      // Reveal every validation error on submit, including ones for required fields
      // absent from `values`. The force-touch loop above walks the value tree, so a
      // field missing from `values` has no node to touch and its (touch-gated) error
      // would stay hidden in useField. Touch each error's path so submit surfaces
      // them all (matching validate(true)).
      if (result.errors && result.errors.length > 0) {
        let nextTouched = touchedRef.current;
        for (const e of result.errors) {
          nextTouched = markPathAsTouched(nextTouched, e.path);
        }
        touchedRef.current = nextTouched;
        dispatch({
          type: 'UPDATE_STATE',
          updates: { touched: nextTouched },
        });
      }

      if (!schema || result.valid) {
        // Pass only the values and a subset of helper functions
        // This avoids the circular dependency and ref usage
        const helpers: FormHelpers<T> = {
          setErrors: (newErrors: ValidationError[]) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              // Update ref first
              errorsRef.current = newErrors;
              // Then update state
              setErrors(newErrors);
            }
          },
          setServerErrors: (newErrors: ValidationError[]) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setServerErrors(newErrors);
            }
          },
          setServerError: (
            path: (string | number)[],
            message: string | string[] | null
          ) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setServerError(path, message);
            }
          },
          setError: (
            path: (string | number)[],
            message: string | string[] | null
          ) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setError(path, message);
            }
          },
          // Reads — no submission guard needed; they read the live refs so a call
          // right after a setValue/setError/deleteField in this handler reflects it.
          getValue: <V = unknown,>(path: (string | number)[]): V =>
            getValue<V>(path),
          getError,
          getErrorPaths,
          getFieldState,
          getValuePaths,
          setValue: <V = unknown,>(path: (string | number)[], value: V) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setValue(path, value);
            }
          },
          clearValue: (path: (string | number)[]): boolean => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              return clearValue(path);
            }
            return false;
          },
          deleteField: (path: (string | number)[]) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              deleteField(path);
            }
          },
          // validate mutates too (marks touched with force, writes errors /
          // lastValidated / canSubmit), so guard it like the other mutators — a
          // stale call must not resurrect errors on a form that was force-reset.
          validate: (force?: boolean): boolean => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              return validateFunction(force);
            }
            return false;
          },
          // validateField mutates (marks touched, writes errors), so guard it like
          // the other mutators; a stale call no-ops and reports the field as invalid.
          validateField: (path: (string | number)[]): boolean => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              return validateField(path);
            }
            return false;
          },
          hasField, // HasField doesn't need the guard, it's a query
          touched, // Touched is a snapshot, not an action
          setFieldTouched: (
            path: (string | number)[],
            value: boolean = true
          ) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setFieldTouched(path, value);
            }
          },
          reset: (force?: boolean): boolean => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              return reset(force);
            }
            return false;
          },
          resetWithValues: (newValues: T, force?: boolean): boolean => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              return resetWithValues(newValues, force);
            }
            return false; // Or handle as per desired behavior for stale call
          },
          setClientSubmissionError: (message: string | string[] | null) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              setClientSubmissionError(message);
            }
          },
          clearClientSubmissionError: () => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              clearClientSubmissionError();
            }
          },
          // A read — unguarded, like getValue/getError. Returns the live submission
          // errors (a stale handler reading them is harmless; its writes are guarded).
          getClientSubmissionError,
          currentSubmissionID: submissionId, // Changed to use the submissionId from this closure
          isCurrentSubmission, // This function already uses the ref correctly
          signal: abortController.signal,
          // Forward via ...args (not (arg, value)) so the argument COUNT is
          // preserved — markPristine uses arguments.length to tell
          // markPristine(path) (default to current) from markPristine(path, undefined).
          markPristine: function (...args: unknown[]) {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              (markPristine as (...a: unknown[]) => void)(...args);
            }
          } as MarkPristine<T>,
          setFocus: (path: (string | number)[]) => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              return setFocus(path);
            }
            return false;
          },
          focusFirstError: () => {
            if (isCurrentSubmission(submissionId) && mountedRef.current) {
              return focusFirstError();
            }
            return null;
          },
        };

        await onSubmit(values, helpers);

        // The attempt succeeded only if it's still the current submission and the
        // handler left behind NO failure-sourced error. All server/manual/
        // client-submission errors were emptied at the start of submit(), so any
        // present now were set by the handler. We read them straight off the
        // combined error list (errorsRef) by source rather than the per-channel
        // refs, so it doesn't matter WHICH setter created them: setServerError(s),
        // setError, setClientSubmissionError, and a raw setErrors carrying one of
        // those sources all register as a rejected submit. (Only 'client'/untagged
        // entries — ordinary Zod-style validation errors — don't flag a failure.)
        if (isCurrentSubmission(submissionId) && mountedRef.current) {
          didSucceed = !errorsRef.current.some(
            (e) =>
              e.source === 'server' ||
              e.source === 'manual' ||
              e.source === 'client-form-handler'
          );
        }
      } else if (result.errors) {
        // Only set errors if this is still the current submission
        if (isCurrentSubmission(submissionId) && mountedRef.current) {
          // Preserve externally-owned errors (server/manual/client-form-handler) and
          // add the fresh Zod errors (same merge rule as validateFunction). Those
          // sources are cleared at submit start, so this is defensive — it keeps the
          // merge consistent across all sites.
          const preservedErrors = errorsRef.current.filter(
            (e) => !isValidationOwnedError(e)
          );
          const newErrors = [...preservedErrors, ...(result.errors || [])];

          // Update ref first
          errorsRef.current = newErrors;

          // Then update state
          dispatch({
            type: 'UPDATE_STATE',
            updates: { errors: errorsRef.current },
          });
        }
      }
    } catch (error: unknown) {
      // Only log unexpected errors and set client errors if this is still the current submission
      if (isCurrentSubmission(submissionId) && mountedRef.current) {
        console.error('Unexpected form submission error:', error);
        // Use setClientSubmissionError instead of setting server errors
        // This is more appropriate as these are client-side errors during submission
        setClientSubmissionError(
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred'
        );
      }
    } finally {
      // Only reset submitting state if this is still the current submission and component is mounted
      if (isCurrentSubmission(submissionId) && mountedRef.current) {
        // This attempt settled as the current one — drop its (now-finished)
        // controller so a later force-reset can't abort a completed request.
        currentAbortControllerRef.current = null;
        // Update ref first
        isSubmittingRef.current = false;
        // Then update state, recording whether this attempt succeeded.
        dispatch({
          type: 'UPDATE_STATE',
          updates: { isSubmitting: false, submitSucceeded: didSucceed },
        });
      }
    }
  }, [
    onSubmit,
    setErrors,
    getError,
    getErrorPaths,
    getFieldState,
    getValuePaths,
    setSubmissionId,
    setFieldTouched,
    markPathAsTouched,
    validateForm,
    validateField,
    schema,
    getValue,
    setValue,
    clearValue,
    deleteField,
    validateFunction,
    hasField,
    touched,
    reset,
    resetWithValues,
    isCurrentSubmission,
    values,
    clearClientSubmissionError,
    getClientSubmissionError,
    setClientSubmissionError,
    setServerErrors,
    setServerError,
    setError,
    markPristine,
    setFocus,
    focusFirstError,
    dispatch,
  ]);

  // Per-field dirty diff against the baseline, keyed by serialized path (same shape
  // as `touched`). Plain objects are compared key-precise; a dirty array marks its
  // own path plus every field under it recursively (see diffDirtyFields). Recomputes
  // only when values or the baseline change, and short-circuits unchanged subtrees
  // by reference.
  const dirtyFields = useMemo<Record<string, boolean>>(
    () => diffDirtyFields(values, baseline),
    [values, baseline]
  );

  // Derived from the diff so the two can never disagree.
  const isDirty = useMemo(
    () => Object.keys(dirtyFields).length > 0,
    [dirtyFields]
  );

  const contextValue = React.useMemo<FormContextValue<T>>(
    () => ({
      values,
      touched,
      setFieldTouched,
      handleBlur,
      errors,
      isSubmitting,
      // Valid when there are no errors AND either validation has run (lastValidated
      // is set) or there's no schema to validate against (a schema-less form is
      // vacuously valid). Uses reactive state, not refs, so consumers stay in sync.
      isValid: errors.length === 0 && (lastValidated !== null || !schema),
      // A form with no schema has nothing to fail, so it's vacuously submittable.
      // (With a schema, `canSubmit` reflects the last validation; the ref stays for
      // the synchronous submit logic, which already treats `!schema` as valid.)
      canSubmit: schema ? canSubmit : true,
      submitAttempted,
      submitSucceeded,
      submitCount,
      lastValidated,
      validateOnChange,
      validateOnBlur,
      currentSubmissionID: state.currentSubmissionID, // Use state for reactivity
      submit,
      reset,
      resetWithValues,
      validate: validateFunction,
      validateField,
      getValue,
      setValue,
      clearValue,
      deleteField,
      reindexArray,
      subscribeArrayStructure,
      getValuePaths,
      getError,
      getErrorPaths,
      getFieldState,
      hasField,
      setErrors: (newErrors: ValidationError[]) => {
        // Update ref first
        errorsRef.current = newErrors;
        // Then update state
        setErrors(newErrors);
      },
      setServerErrors,
      setServerError,
      setError,
      setClientSubmissionError,
      clearClientSubmissionError,
      getClientSubmissionError,
      isCurrentSubmission,
      isDirty,
      dirtyFields,
      markPristine,
      setFocus,
      focusFirstError,
    }),
    [
      values,
      touched,
      setFieldTouched,
      handleBlur,
      errors,
      isSubmitting,
      canSubmit,
      submitAttempted,
      submitSucceeded,
      submitCount,
      lastValidated,
      validateOnChange,
      validateOnBlur,
      schema,
      state.currentSubmissionID, // Use state for reactivity in dependency array
      submit,
      reset,
      resetWithValues,
      validateFunction,
      validateField,
      getValue,
      setValue,
      clearValue,
      deleteField,
      reindexArray,
      subscribeArrayStructure,
      getValuePaths,
      getError,
      getErrorPaths,
      getFieldState,
      hasField,
      setErrors,
      setServerErrors,
      setServerError,
      setError,
      setClientSubmissionError,
      clearClientSubmissionError,
      getClientSubmissionError,
      isCurrentSubmission,
      isDirty,
      dirtyFields,
      markPristine,
      setFocus,
      focusFirstError,
    ]
  );

  // DOM-free core: render only the context providers + children. No host
  // elements, so this works on web and React Native alike. The web entry
  // (./web) wraps this with a <form> element (`useFormTag`, on by default).
  return (
    <FormContext.Provider value={contextValue}>
      <FormFieldContext.Provider value={fieldContextValue}>
        {children}
      </FormFieldContext.Provider>
    </FormContext.Provider>
  );
}
