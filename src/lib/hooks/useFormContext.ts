import { useContext } from 'react';
import { FormContext, FormContextValue } from '../form-context';

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
 * // Using strongly typed form hook
 * const form = useFormContext<UserForm>();
 *
 * // Now you get type checking and auto-completion:
 * form.getValue(['name']); // returns string
 * form.getValue(['address', 'city']); // returns string
 * form.getValue(['invalid']); // TypeScript error
 * ```
 */
export function useFormContext<TForm = Record<string, unknown>>() {
  const context = useContext(FormContext);

  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }

  return context as FormContextValue<TForm>;
}
