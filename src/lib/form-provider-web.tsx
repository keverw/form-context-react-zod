import React from 'react';
import { FormProvider as FormProviderBase } from './form-context';
import type { FormProviderProps } from './form-context';
import { useFormContext } from './hooks/useFormContext';

export interface WebFormProviderProps<T> extends FormProviderProps<T> {
  /**
   * Wrap the form in a real <form> HTML tag element so the browser gives you native
   * submit + Enter-to-submit behavior. **Defaults to true** for this web provider
   * — set `false` to render no <form> (or just use the core `FormProvider`).
   */
  useFormTag?: boolean;
  /** HTML attributes passed to the <form> HTML tag element when `useFormTag` is true. */
  formProps?: React.FormHTMLAttributes<HTMLFormElement>;
}

// Lives inside the provider so it can read `submit` from context. Kept here (the
// web entry) rather than the DOM-free core so the core never references a <form>.
function FormElement({
  formProps,
  children,
}: {
  formProps?: React.FormHTMLAttributes<HTMLFormElement>;
  children: React.ReactNode;
}) {
  const form = useFormContext();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
      noValidate
      {...formProps}
    >
      {children}
    </form>
  );
}

/**
 * Web form provider. The core `FormProvider` plus an HTML <form> wrapper
 * (`useFormTag`, on by default / `formProps`). Import from
 * `form-context-react-zod/web`. On React Native, use the core `FormProvider`.
 */
export function WebFormProvider<T extends Record<string | number, unknown>>({
  useFormTag = true,
  formProps,
  children,
  ...rest
}: WebFormProviderProps<T>) {
  return (
    <FormProviderBase {...(rest as FormProviderProps<T>)}>
      {useFormTag ? (
        <FormElement formProps={formProps}>{children}</FormElement>
      ) : (
        children
      )}
    </FormProviderBase>
  );
}
