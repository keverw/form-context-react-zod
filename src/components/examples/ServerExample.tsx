import { z } from 'zod';
import { FormProvider } from '../../lib/form-context';
import FormInput from '../FormInput';
import { FormNotice, SubmitButton, LoadingSpinner } from './shared';
import { FormState } from '../../lib/components/FormState';
import { Bug, Trash2, Check, X, WifiOff, AlertTriangle } from 'lucide-react';
import { simulateServer } from './utils';
import { useFormContext } from '../../lib/hooks/useFormContext';
import { useField } from '../../lib/hooks/useField';
import { useToast } from '../useToast';
import { useEffect, useRef, useState } from 'react';

interface UsernameAvailabilityProps {
  username: string;
}

function UsernameAvailability({ username }: UsernameAvailabilityProps) {
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useFormContext();
  const timeoutRef = useRef<number | null>(null);
  const currentUsernameRef = useRef(username);
  const networkErrorEnabled =
    form.getValue<boolean>(['simulateNetworkError']) ?? false;
  const networkErrorRef = useRef(networkErrorEnabled);

  // Update network error ref without triggering availability check
  useEffect(() => {
    networkErrorRef.current = networkErrorEnabled;
  }, [networkErrorEnabled]);

  useEffect(() => {
    currentUsernameRef.current = username;

    // Only reset states if username actually changed
    if (username !== currentUsernameRef.current) {
      setAvailable(null);
      setError(null);
    }

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Only check if username is valid (pre-check)
    const usernameErrors = form.getError(['username']);
    if (!username || usernameErrors.length > 0) {
      setChecking(false);
      setAvailable(null);
      return;
    }

    // Debounce the check
    setChecking(true);
    timeoutRef.current = window.setTimeout(async () => {
      try {
        if (networkErrorRef.current) {
          throw new Error('Network Error');
        }

        // Verify username is still valid before checking (pre-request check)
        const preRequestErrors = form.getError(['username']);
        if (
          !username ||
          preRequestErrors.length > 0 ||
          currentUsernameRef.current !== username
        ) {
          return;
        }

        // Simulate API call
        const errors = await simulateServer({ username });
        const usernameErrors = errors.filter(
          (error) => error.path.length === 1 && error.path[0] === 'username'
        );

        // Verify username hasn't changed and is still valid (post-request check)
        const postRequestErrors = form.getError(['username']);
        if (
          currentUsernameRef.current === username &&
          postRequestErrors.length === 0 &&
          usernameErrors.length === 0
        ) {
          setAvailable(true);
        } else if (usernameErrors.length > 0) {
          setAvailable(false);
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error: unknown) {
        if (currentUsernameRef.current === username) {
          setError('Unable to check availability. Please try again.');
        }
      } finally {
        setChecking(false);
      }
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [username, form]); // Add form to dependencies

  // Don't show anything if the field is empty or invalid
  const usernameErrors = form.getError(['username']);
  if (!username || usernameErrors.length > 0) return null;

  return (
    <div className="mt-1 text-sm flex items-center">
      {checking ? (
        <>
          <LoadingSpinner className="w-4 h-4 mr-2" />
          <span className="text-gray-600">Checking availability...</span>
        </>
      ) : error ? (
        <>
          <AlertTriangle className="w-4 h-4 mr-2 text-yellow-600" />
          <span className="text-yellow-600">{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setChecking(true);
              timeoutRef.current = window.setTimeout(async () => {
                try {
                  if (networkErrorRef.current) {
                    throw new Error('Network Error');
                  }
                  const errors = await simulateServer({ username });
                  const usernameErrors = errors.filter(
                    (error) =>
                      error.path.length === 1 && error.path[0] === 'username'
                  );

                  if (
                    currentUsernameRef.current === username &&
                    usernameErrors.length === 0
                  ) {
                    setAvailable(true);
                  } else if (usernameErrors.length > 0) {
                    setAvailable(false);
                  }
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (error: unknown) {
                  if (currentUsernameRef.current === username) {
                    setError('Unable to check availability. Please try again.');
                  }
                } finally {
                  setChecking(false);
                }
              }, 500);
            }}
            className="ml-2 text-yellow-600 hover:text-yellow-700 underline text-sm"
          >
            Retry
          </button>
        </>
      ) : available === true ? (
        <>
          <Check className="w-4 h-4 mr-2 text-green-600" />
          <span className="text-green-600">Username is available</span>
        </>
      ) : available === false ? (
        <>
          <X className="w-4 h-4 mr-2 text-red-600" />
          <span className="text-red-600">Username is already taken</span>
        </>
      ) : null}
    </div>
  );
}

const serverSchema = z
  .object({
    firstName: z.string().min(2, 'First name must be at least 2 characters'),
    username: z.string().min(3, 'Username must be at least 3 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    simulateNetworkError: z.boolean().optional(),
  })
  .strict();

function ServerForm() {
  const form = useFormContext();
  const firstNameField = useField(['firstName']);
  const usernameField = useField(['username']);
  const emailField = useField(['email']);
  const passwordField = useField(['password']);
  const simulateNetworkError =
    form.getValue<boolean>(['simulateNetworkError']) ?? false;
  const hasExtraField = form.hasField(['extraField']);
  const rootErrors = form.getError([]);

  const addExtraField = () => {
    form.setValue(['extraField'], 'This will trigger a schema error');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <FormNotice type="info">
        Try these examples:
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>
            Type <code>magic</code> in first name - Shows multiple server errors
          </li>
          <li>
            <code>taken@example.com</code> - Shows email taken error
          </li>
          <li>
            Click "Add Invalid Field" below - Shows root-level schema error
          </li>
          <li>
            Type <code>admin@example.com</code> - Shows root-level server error
          </li>
        </ul>
      </FormNotice>

      {rootErrors.length > 0 && (
        <FormNotice type="warning">
          {rootErrors.map((error, index) => (
            <div key={index}>{error.message}</div>
          ))}
        </FormNotice>
      )}

      <div className="space-y-4">
        <FormInput
          {...firstNameField.props}
          label="First Name"
          type="text"
          placeholder="John"
        />
        <div>
          <FormInput
            {...usernameField.props}
            label="Username"
            type="text"
            autoCapitalize="off"
            placeholder="johndoe"
          />
          <UsernameAvailability username={String(usernameField.value || '')} />
        </div>
        <FormInput
          {...emailField.props}
          label="Email"
          type="text"
          inputMode="email"
          autoCapitalize="off"
          autoComplete="email"
          placeholder="email@example.com"
        />
        <FormInput
          {...passwordField.props}
          label="Password"
          type="password"
          placeholder="••••••••"
        />
        <SubmitButton />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              form.setValue(['simulateNetworkError'], !simulateNetworkError)
            }
            className="flex items-center px-4 py-2 text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100"
          >
            <WifiOff
              className={`w-4 h-4 mr-2 ${simulateNetworkError ? 'text-red-600' : 'text-gray-600'}`}
            />
            {simulateNetworkError
              ? 'Disable Network Error'
              : 'Enable Network Error'}
          </button>
          <button
            type="button"
            onClick={addExtraField}
            disabled={hasExtraField}
            className="flex items-center px-4 py-2 text-yellow-700 bg-yellow-50 rounded-lg hover:bg-yellow-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Bug className="w-4 h-4 mr-2" />
            Add Invalid Field
          </button>
          {hasExtraField && (
            <button
              type="button"
              onClick={() => form.deleteField(['extraField'])}
              className="flex items-center px-4 py-2 text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Remove Invalid Field
            </button>
          )}
        </div>
      </div>
      <FormState />
    </form>
  );
}

export default function ServerExample() {
  const toast = useToast();

  return (
    <FormProvider
      initialValues={{
        firstName: '',
        username: '',
        email: '',
        password: '',
        simulateNetworkError: false,
      }}
      schema={serverSchema}
      onSubmit={async (values, helpers) => {
        try {
          const errors = await simulateServer(values);
          if (errors.length > 0) {
            helpers.setServerErrors(errors);
            return;
          }
          toast.success('Form submitted successfully!');
        } catch (error: unknown) {
          console.error('Submission failed:', error);
          helpers.setServerErrors([
            {
              path: [],
              message: 'An unexpected error occurred. Please try again.',
            },
          ]);
        }
      }}
    >
      <ServerForm />
    </FormProvider>
  );
}
