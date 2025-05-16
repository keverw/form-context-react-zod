import { z } from 'zod';
import { FormProvider, FormHelpers } from '../../lib/form-context';
import FormInput from '../FormInput';
import { RootErrors, SubmitButton, FormNotice } from './shared';
import { FormState } from '../../lib/components/FormState';
import { useFormContext } from '../../lib/hooks/useFormContext';
import { useField } from '../../lib/hooks/useField';
import { useToast } from '../useToast';
import { simulateServer } from './utils';

// Define the schema
const prefilledSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  age: z.coerce.number().min(18, 'Must be at least 18 years old'),
  bio: z.string().min(10, 'Bio must be at least 10 characters'),
  website: z
    .string()
    .transform((val) => (val.trim() === '' ? undefined : val))
    .optional()
    .pipe(z.string().url({ message: 'Invalid URL' }).optional()), // If string, must be URL. If undefined, it's fine.
});

// Infer the form values type from the schema. FormValues.age will now be number.
type FormValues = z.infer<typeof prefilledSchema>;

function PrefilledForm() {
  const form = useFormContext();
  const usernameField = useField(['username']);
  const emailField = useField(['email']);
  const ageField = useField(['age']);
  const bioField = useField(['bio']);
  const websiteField = useField(['website']);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <FormNotice type="info">
        This form demonstrates validation on mount with prefilled values:
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>
            <code>username</code>: Valid
          </li>
          <li>
            <code>email</code>: Invalid format
          </li>
          <li>
            <code>age</code>: Below minimum
          </li>
          <li>
            <code>bio</code>: Too short
          </li>
          <li>
            <code>website</code>: Optional but invalid if provided
          </li>
        </ul>
      </FormNotice>
      <RootErrors />
      <div className="space-y-4">
        <FormInput
          {...usernameField.props}
          label="Username"
          placeholder="johndoe"
        />
        <FormInput
          {...emailField.props}
          label="Email"
          placeholder="john@example.com"
          type="email"
        />
        <FormInput
          {...ageField.props}
          label="Age"
          type="number" // HTML input type remains number for UX
          placeholder="18"
        />
        <FormInput
          {...bioField.props}
          label="Bio"
          placeholder="Tell us about yourself..."
          multiline
        />
        <FormInput
          {...websiteField.props}
          label="Website (Optional)"
          placeholder="https://example.com"
        />
        <SubmitButton />
        <FormState />
      </div>
    </form>
  );
}

export default function PrefilledExample() {
  const toast = useToast();

  const onSubmit = async (
    values: FormValues,
    helpers: FormHelpers<FormValues>
  ) => {
    try {
      await simulateServer(values);
      toast.success('Form submitted successfully!');
    } catch (error) {
      console.error('Submission failed:', error);
      helpers.setServerErrors([
        {
          path: [],
          message: 'An unexpected error occurred. Please try again.',
        },
      ]);
    }
  };

  return (
    <FormProvider
      initialValues={{
        username: 'johndoe', // Valid
        email: 'invalid-email', // Invalid format
        age: 16, // Initial value is a number, below minimum
        bio: 'Too short', // Too short
        website: 'not-a-url', // Invalid URL
      }}
      schema={prefilledSchema}
      validateOnMount={true} // Enable validation on mount
      onSubmit={onSubmit}
    >
      <PrefilledForm />
    </FormProvider>
  );
}
