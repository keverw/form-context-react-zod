import { useContext } from 'react';
import { FormContext } from '../context';
import type { FormContextValue } from '../form-context';

/**
 * Hook for accessing form context with strong type inference.
 *
 * Example:
 * ```
 * interface UserForm {
 *   name: string;
 *   email: string;
 *   address: {
 *     street: string;
 *     city: string;
 *   }
 * }
 *
 * // Pass your form's value type for typed helpers/state:
 * const form = useFormContext<UserForm>();
 *
 * // Paths are untyped (string|number)[], so reads are `unknown` by default —
 * // pass a type argument (or annotate the destination) for a concrete type:
 * form.getValue<string>(['name']); // string
 * form.getValue<string>(['address', 'city']); // string
 * form.getValue(['name']); // unknown
 * ```
 */
export function useFormContext<TForm = Record<string, unknown>>() {
  const context = useContext(FormContext);

  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }

  return context as FormContextValue<TForm>;
}
