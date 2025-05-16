import { useState } from 'react';
import { z } from 'zod';
import { FormProvider, FormHelpers } from '../../lib/form-context';
import { useFormContext } from '../../lib/hooks/useFormContext';
import FormInput from '../FormInput';
import { RootErrors, SubmitButton } from './shared';
import { useField } from '../../lib/hooks/useField';
import { FormState } from '../../lib/components/FormState';

// Define the form schema with Zod
const formSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email format'),
});

type FormValues = z.infer<typeof formSchema>;

function ClientErrorForm() {
  const form = useFormContext();
  const usernameField = useField(['username']);
  const emailField = useField(['email']);

  // This simulates different types of errors that might occur client-side
  const getErrorMessage = (type: string): string | string[] => {
    switch (type) {
      case 'network':
        return 'Network connection failed. Please check your internet connection and try again.';
      case 'auth':
        return 'Your session has expired. Please sign in again.';
      case 'multiple':
        return [
          'Multiple issues detected:',
          'Authentication required',
          'Network connection unstable',
        ];
      default:
        return 'An error occurred';
    }
  };

  // The form's error system already integrates client submission error messages
  // so they will appear automatically in the RootErrors component

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
      className="space-y-5"
    >
      {/* RootErrors shows all errors at the root level, including both server errors and client submission errors */}
      <RootErrors />

      <div className="space-y-4">
        <FormInput
          {...usernameField.props}
          label="Username"
          placeholder="Enter username"
        />

        <FormInput
          {...emailField.props}
          label="Email"
          placeholder="Enter email"
          type="email"
          autoCapitalize="off"
          autoComplete="email"
        />
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <SubmitButton />

          <button
            type="button"
            onClick={() => form.reset()}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            Reset Form
          </button>
        </div>

        <FormState showToggle />

        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Simulate different error types:
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                form.setClientSubmissionError(getErrorMessage('network'));
              }}
              className="px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100"
            >
              Network Error
            </button>

            <button
              type="button"
              onClick={() => {
                form.setClientSubmissionError(getErrorMessage('auth'));
              }}
              className="px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100"
            >
              Auth Error
            </button>

            <button
              type="button"
              onClick={() => {
                form.setClientSubmissionError(getErrorMessage('multiple'));
              }}
              className="px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100"
            >
              Multiple Errors
            </button>

            <button
              type="button"
              onClick={() => {
                form.clearClientSubmissionError();
              }}
              className="px-3 py-2 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100"
            >
              Clear Errors
            </button>
          </div>
        </div>

        <div className="mt-2">
          <p className="text-sm font-medium text-gray-700 mb-1">
            Current client error messages:
          </p>
          <div className="p-2 bg-gray-50 rounded-md min-h-10 text-sm">
            {form.getClientSubmissionError().length > 0 ? (
              <ul className="list-disc pl-5">
                {form
                  .getClientSubmissionError()
                  .map((error: string, index: number) => (
                    <li key={index} className="text-red-600">
                      {error}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-gray-500 italic">No client errors set</p>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

// Define the types of error scenarios we can demonstrate
type ErrorScenario = 'none' | 'client' | 'server' | 'both';

export default function ClientSubmissionErrorExample() {
  const [submissionResult, setSubmissionResult] = useState<string | null>(null);
  const [errorScenario, setErrorScenario] = useState<ErrorScenario>('client');

  // This handles form submission
  const handleSubmit = async (_values: FormValues, helpers: FormHelpers) => {
    console.log('errorScenario', errorScenario);
    setSubmissionResult('Processing...');

    console.log('---- Starting new submission ----');
    console.log(
      'Before clearing - Client errors:',
      helpers.getClientSubmissionError()
    );

    // Explicitly clear both types of errors before proceeding
    // This ensures we start with a clean slate for each scenario
    helpers.clearClientSubmissionError();
    helpers.setServerErrors([]);

    console.log(
      'After clearing - Client errors:',
      helpers.getClientSubmissionError()
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Handle the selected error scenario
    switch (errorScenario) {
      case 'none':
        // No errors, submission successful
        setSubmissionResult('Form submitted successfully!');
        break;

      case 'client':
        console.log('Setting client error...');
        // Set client submission error only
        helpers.setClientSubmissionError(
          'Network connection failed. Please check your internet connection and try again.'
        );
        console.log(
          'After setting client error - Client errors:',
          helpers.getClientSubmissionError()
        );
        setSubmissionResult('Submission failed with client error');
        break;

      case 'server':
        // Set server errors only
        helpers.setServerErrors([
          {
            path: ['username'],
            message: 'Username already taken',
            source: 'server',
          },
          {
            path: [],
            message: 'Service temporarily unavailable',
            source: 'server',
          },
        ]);
        setSubmissionResult('Submission failed with server validation errors');
        break;

      case 'both':
        // Set both client submission error and server errors
        helpers.setClientSubmissionError(
          'Your session has expired. Please sign in again to continue.'
        );

        helpers.setServerErrors([
          {
            path: [],
            message: 'Request failed due to server issue',
            source: 'server',
          },
          {
            path: ['email'],
            message: 'Email domain is blocked',
            source: 'server',
          },
        ]);
        setSubmissionResult(
          'Submission failed with both client and server errors'
        );
        break;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Client Submission Error Example
        </h2>
        <p className="text-gray-600 mb-4">
          Demonstrates handling client-side errors with the
          setClientSubmissionError API. This is useful for network errors,
          session timeouts, and other client-side issues.
        </p>
      </div>

      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Select error scenario for form submission:
        </h3>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="radio"
              name="errorScenario"
              value="none"
              checked={errorScenario === 'none'}
              onChange={() => setErrorScenario('none')}
              className="mr-2"
            />
            <span>Success (No errors)</span>
          </label>

          <label className="flex items-center">
            <input
              type="radio"
              name="errorScenario"
              value="client"
              checked={errorScenario === 'client'}
              onChange={() => setErrorScenario('client')}
              className="mr-2"
            />
            <span>Client Submission Error Only</span>
          </label>

          <label className="flex items-center">
            <input
              type="radio"
              name="errorScenario"
              value="server"
              checked={errorScenario === 'server'}
              onChange={() => setErrorScenario('server')}
              className="mr-2"
            />
            <span>Server Errors Only</span>
          </label>

          <label className="flex items-center">
            <input
              type="radio"
              name="errorScenario"
              value="both"
              checked={errorScenario === 'both'}
              onChange={() => setErrorScenario('both')}
              className="mr-2"
            />
            <span>Both Client & Server Errors</span>
          </label>
        </div>

        <div className="mt-3">
          <p className="text-sm text-gray-500 italic">
            Selected scenario will be applied when form is submitted
          </p>
        </div>
      </div>

      <FormProvider
        initialValues={{
          username: '',
          email: '',
        }}
        schema={formSchema}
        onSubmit={handleSubmit}
      >
        <ClientErrorForm />
      </FormProvider>

      {submissionResult && (
        <div className="mt-4 p-3 bg-gray-100 rounded-md">
          <p className="text-sm">
            <span className="font-semibold">Result:</span> {submissionResult}
          </p>
        </div>
      )}
    </div>
  );
}
