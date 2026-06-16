// Core entry (`.`) — DOM-free, React Native friendly.
// The FormState debug component lives in the opt-in `./devtools/web` (DOM) and
// `./devtools/native` (React Native) entries.
export {
  getValueAtPath,
  setValueAtPath,
  serializePath,
  deserializePath,
} from './utils';
// Explicit named re-export (NOT `export *`) so the public core surface stays
// curated. The advanced / type-erased internals — `FormFieldContextValue`,
// `Focusable`, `FieldSnapshot`, `ArrayStructureChange`/`ArrayStructureListener`,
// and `MarkPristine` — are deliberately NOT surfaced here. They stay exported
// from ./form-context so sibling modules import them directly (context.ts and
// useField already do); the dts bundler inlines them wherever a public signature
// (the context values, `useField().inputRef`, `markPristine`) references them, so
// consumer type-checking is unaffected. Add a name here only if it becomes part
// of the documented public API.
export {
  FormProvider,
  FormContext,
  FormFieldContext,
  type FormHelpers,
  type FormContextValue,
  type FormProviderProps,
  type FormSubmitHandler,
} from './form-context';
export * from './zod-helpers';
export * from './hooks/useFormContext';
export * from './hooks/useField';
export * from './hooks/useArrayField';
