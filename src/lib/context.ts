// Shared React contexts — DELIBERATELY isolated in their own module/entry.
//
// The library ships multiple entry points (`.`, `./devtools`, …). Both of the
// contexts below MUST be a single shared instance across every entry: if one
// bundle inlined its own `createContext()` call, a consumer reading the context
// (e.g. `FormState` via `useFormContext`, or `useField` via `FormFieldContext`)
// would read a *different* context object than the one `FormProvider` populated
// and resolve to `null` — even though the app rendered everything correctly.
//
// To guarantee one instance, the build marks every cross-entry import of this
// module as the external subpath `form-context-react-zod/context`, so all
// entries import the same singleton instead of inlining a copy. See
// tsup.config.ts. This is a runtime JS singleton concern, not a type concern —
// the type side is structural, so duplicated declarations stay compatible.
import { createContext } from 'react';
import type { FormContextValue, FormFieldContextValue } from './form-context';

// Reactive, whole-form context.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FormContext = createContext<FormContextValue<any> | null>(null);

// Stable, per-field subscription context.
export const FormFieldContext = createContext<FormFieldContextValue | null>(
  null
);
