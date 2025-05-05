import { useContext } from 'react';
import { FormContext, FormContextValue } from '../form-context';

export function useFormContext<T>() {
  const context = useContext(FormContext);

  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }

  return context as FormContextValue<T>;
}
