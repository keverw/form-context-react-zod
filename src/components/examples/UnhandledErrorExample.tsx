import { z } from 'zod';
import { FormProvider } from '../../lib/form-context';
import { RootErrors, SubmitButton } from './shared';
import FormState from '../FormState';
import { AlertTriangle } from 'lucide-react';
import { useFormContext } from '../../lib/hooks/useFormContext';
import { useField } from '../../lib/hooks/useField';
import { useToast } from '../useToast';

const errorSchema = z.object({
  mode: z.enum(['normal', 'error']),
});

function ErrorForm() {
  const form = useFormContext();
  const modeField = useField(['mode']);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <div className="space-y-4">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                This example demonstrates how unhandled errors are caught by the
                form library. Select "Trigger Error" to simulate an unhandled
                error during form submission.
              </p>
            </div>
          </div>
        </div>

        <RootErrors />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Submission Mode
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                checked={modeField.value === 'normal'}
                onChange={() => modeField.setValue('normal')}
              />
              <span className="ml-2 text-gray-700">Normal (Success)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                checked={modeField.value === 'error'}
                onChange={() => modeField.setValue('error')}
              />
              <span className="ml-2 text-gray-700">Trigger Error</span>
            </label>
          </div>
        </div>

        <SubmitButton />
        <FormState />
      </div>
    </form>
  );
}

export default function UnhandledErrorExample() {
  const toast = useToast();

  return (
    <FormProvider
      initialValues={{ mode: 'normal' as const }}
      schema={errorSchema}
      onSubmit={async (values) => {
        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        // If error mode is selected, throw an unhandled error
        if (values.mode === 'error') {
          throw new Error('Unhandled error occurred during form submission');
        }

        // Otherwise show success
        toast.success('Form submitted successfully!');
      }}
    >
      <ErrorForm />
    </FormProvider>
  );
}
