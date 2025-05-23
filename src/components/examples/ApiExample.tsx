import { z } from 'zod';
import { FormProvider } from '../../lib/form-context';
import FormInput from '../FormInput';
import { RootErrors, SubmitButton, FormNotice } from './shared';
import { FormState } from '../../lib/components/FormState';
import {
  Check,
  X,
  Trash2,
  RotateCcw,
  Pencil,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  XCircle,
  Eraser,
  Delete,
} from 'lucide-react';
import { useFormContext } from '../../lib/hooks/useFormContext';
import { useField } from '../../lib/hooks/useField';
import { useToast } from '../useToast';

const apiSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  status: z.enum(['active', 'inactive', 'pending']),
  score: z.number().min(0).max(100),
});

function ApiForm() {
  const form = useFormContext();
  const toast = useToast();
  const usernameField = useField(['username']);
  const statusField = useField(['status']);
  const scoreField = useField(['score']);
  const hasScore = form.hasField(['score']);

  // Direct API operations
  const setGoodValue = () => {
    form.setValue(['username'], 'gooduser');
    form.setValue(['status'], 'active');
    form.setValue(['score'], 85);
  };

  const setBadValue = () => {
    form.setValue(['username'], 'x'); // Too short
    form.setValue(['status'], 'unknown' as unknown as string); // Invalid enum
    form.setValue(['score'], 150); // Above max
  };

  const deleteScore = () => {
    form.deleteField(['score']);
  };

  const clearScore = () => {
    form.clearValue(['score']);
  };

  const resetForm = () => {
    form.reset();
  };

  const setServerError = () => {
    form.setServerError(['username'], 'Username is reserved');
    form.setServerError(['status'], 'Status cannot be changed');
  };

  const setSingleError = () => {
    form.setServerError(['username'], 'This username is not allowed');
  };

  const setMultipleErrors = () => {
    form.setServerError(
      ['username'],
      [
        'Username contains forbidden characters',
        'Username matches a reserved word',
        'Username violates naming policy',
      ]
    );
  };

  const clearServerError = () => {
    form.setServerError(['username'], null);
  };

  const clearAllServerErrors = () => {
    // Clear all server errors
    form.setServerErrors([]);
  };

  const validateForm = () => {
    const isValid = form.validate();
    if (isValid) {
      toast.success('Form is valid! (Only showing errors for touched fields)');
    } else {
      toast.error('Form has validation errors. Check touched fields above.');
    }
  };

  const validateFormForced = () => {
    const isValid = form.validate(true);
    if (isValid) {
      toast.success('Form is valid!');
    } else {
      toast.error(
        'Form has validation errors. All fields are now marked as touched.'
      );
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <FormNotice type="info">
        This example demonstrates direct form API operations:
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Set valid/invalid values directly</li>
          <li>Delete fields</li>
          <li>Reset form</li>
          <li>Set server errors</li>
          <li>Clear all server errors</li>
          <li>Clear server errors</li>
        </ul>
      </FormNotice>
      <RootErrors />
      <div className="space-y-4">
        <FormInput
          {...usernameField.props}
          label="Username"
          placeholder="Enter username"
        />
        <FormInput
          {...statusField.props}
          label="Status"
          placeholder="active, inactive, or pending"
        />
        {hasScore && (
          <FormInput
            {...scoreField.props}
            label="Score"
            type="number"
            placeholder="0-100"
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={setGoodValue}
            className="flex items-center justify-center px-4 py-2 text-green-700 bg-green-50 rounded-lg hover:bg-green-100"
          >
            <Check className="w-4 h-4 mr-2" />
            Set Valid Values
          </button>
          <button
            type="button"
            onClick={setBadValue}
            className="flex items-center justify-center px-4 py-2 text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
          >
            <X className="w-4 h-4 mr-2" />
            Set Invalid Values
          </button>
          <button
            type="button"
            onClick={deleteScore}
            disabled={!hasScore}
            className="flex items-center justify-center px-4 py-2 text-yellow-700 bg-yellow-50 rounded-lg hover:bg-yellow-100"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {hasScore ? 'Delete Score' : 'Score Deleted'}
          </button>
          <button
            type="button"
            onClick={clearScore}
            disabled={!hasScore}
            className="flex items-center justify-center px-4 py-2 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100"
          >
            <Delete className="w-4 h-4 mr-2" />
            Clear Score
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="flex items-center justify-center px-4 py-2 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Form
          </button>
          <button
            type="button"
            onClick={setServerError}
            className="flex items-center justify-center px-4 py-2 text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 col-span-2"
          >
            <Pencil className="w-4 h-4 mr-2" />
            Set Server Errors
          </button>
          <button
            type="button"
            onClick={setSingleError}
            className="flex items-center justify-center px-4 py-2 text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Set Single Error
          </button>
          <button
            type="button"
            onClick={setMultipleErrors}
            className="flex items-center justify-center px-4 py-2 text-rose-700 bg-rose-50 rounded-lg hover:bg-rose-100"
          >
            <AlertCircle className="w-4 h-4 mr-2" />
            Set Multiple Errors
          </button>
          <button
            type="button"
            onClick={clearServerError}
            className="flex items-center justify-center px-4 py-2 text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Clear Server Error - Username
          </button>
          <button
            type="button"
            onClick={clearAllServerErrors}
            className="flex items-center justify-center px-4 py-2 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100"
          >
            <Eraser className="w-4 h-4 mr-2" />
            Clear All Server Errors
          </button>
          <button
            type="button"
            onClick={validateForm}
            className="flex items-center px-4 py-2 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100"
          >
            <ShieldCheck className="w-4 h-4 mr-2" />
            Validate (Touched Only)
          </button>
          <button
            type="button"
            onClick={validateFormForced}
            className="flex items-center px-4 py-2 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100"
          >
            <ShieldCheck className="w-4 h-4 mr-2" />
            Validate (Force All)
          </button>
        </div>

        <SubmitButton />
        <FormState />
      </div>
    </form>
  );
}

export default function ApiExample() {
  const toast = useToast();

  return (
    <FormProvider
      initialValues={{
        username: '',
        status: 'pending',
        score: 50,
      }}
      schema={apiSchema}
      onSubmit={async (values, helpers) => {
        try {
          const json = JSON.stringify(values, null, 2);
          console.log('Submitting:', json);

          // Simulate API call
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (values.username.toLowerCase() === 'error') {
            // Simulate validation error from API
            helpers.setServerError(['username'], 'Username already exists');
            return;
          }

          // Simulate success
          console.log('Submitted successfully!');
          toast.success(`Form submitted successfully!\n\n${json}`);
        } catch (error) {
          console.error('Submission error:', error);
          helpers.setServerError(
            [],
            'An unexpected error occurred. Please try again.'
          );
        }
      }}
    >
      <ApiForm />
    </FormProvider>
  );
}
