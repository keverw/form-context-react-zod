import React from 'react';
import { z } from 'zod';
import { FormProvider } from '../../lib/form-context';
import FormInput from '../FormInput';
import { FormNotice, SubmitButton } from './shared';
import FormState from '../FormState';
import { AlertTriangle } from 'lucide-react';
import { useFormContext } from '../../lib/hooks/useFormContext';
import { useField } from '../../lib/hooks/useField';
import { showToast } from '../Toast';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  crashMode: z.enum(['none', 'throw', 'reject']),
});

function ErrorDemoForm() {
  const form = useFormContext();
  const nameField = useField<string>(['name']);
  const crashModeField = useField<'none' | 'throw' | 'reject'>(['crashMode']);

  console.log('Current crash mode:', crashModeField.value);

  const rootErrors = form.errors.filter((error) => error.path.length === 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <FormNotice type="info">
        This example demonstrates how the form context handles uncaught errors
        in the onSubmit function.
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>
            Select <code>None</code> for normal form submission
          </li>
          <li>
            Select <code>Throw Error</code> to simulate an uncaught error being
            thrown
          </li>
          <li>
            Select <code>Reject Promise</code> to simulate an uncaught promise
            rejection
          </li>
        </ul>
      </FormNotice>

      {rootErrors.length > 0 && (
        <div className="p-4 my-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <AlertTriangle className="text-red-600 mr-2 h-5 w-5" />
            <h3 className="text-red-800 font-medium">Error</h3>
          </div>
          <div className="mt-2 text-red-700">
            {rootErrors.map((error, index) => (
              <div key={index}>{error.message}</div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <FormInput
          {...nameField.props}
          label="Your Name"
          type="text"
          placeholder="Enter your name"
        />

        <div>
          <label className="block mb-2 font-medium text-gray-700">
            Error Mode
          </label>
          <div className="space-y-2">
            <div className="flex items-center">
              <input
                type="radio"
                id="crashMode-none"
                value="none"
                checked={crashModeField.value === 'none'}
                onChange={() => form.setValue(['crashMode'], 'none')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="crashMode-none"
                className="ml-2 block text-gray-700"
              >
                None (normal submission)
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="radio"
                id="crashMode-throw"
                value="throw"
                checked={crashModeField.value === 'throw'}
                onChange={() => form.setValue(['crashMode'], 'throw')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="crashMode-throw"
                className="ml-2 block text-gray-700"
              >
                Throw Error (synchronous)
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="radio"
                id="crashMode-reject"
                value="reject"
                checked={crashModeField.value === 'reject'}
                onChange={() => form.setValue(['crashMode'], 'reject')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="crashMode-reject"
                className="ml-2 block text-gray-700"
              >
                Reject Promise (asynchronous)
              </label>
            </div>
          </div>
        </div>

        <SubmitButton />
      </div>
      <FormState />
    </form>
  );
}

export default function UncaughtErrorExample() {
  return (
    <FormProvider
      initialValues={{
        name: '',
        crashMode: 'none' as const,
      }}
      schema={schema}
      onSubmit={async (values) => {
        // DO NOT add try/catch here
        // This  to demonstrate how uncaught errors are handled by the underlying form context

        if (values.crashMode === 'throw') {
          // Synchronous error
          throw new Error(`Uncaught error in onSubmit for ${values.name}`);
        } else if (values.crashMode === 'reject') {
          // Asynchronous error (rejected promise)
          return new Promise((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(`Rejected promise in onSubmit for ${values.name}`)
              );
            }, 500);
          });
        } else {
          // Normal flow
          return new Promise((resolve) => {
            setTimeout(() => {
              showToast.success(
                `Form submitted successfully for ${values.name}`
              );

              resolve();
            }, 500);
          });
        }
      }}
    >
      <ErrorDemoForm />
    </FormProvider>
  );
}
