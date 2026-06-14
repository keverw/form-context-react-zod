import { z } from 'zod';
import { FormProvider } from '../../lib/form-context';
import FormInput from '../FormInput';
import { FormState } from '../../lib/components/FormState';
import { useField } from '../../lib/hooks/useField';
import { useFormContext } from '../../lib/hooks/useFormContext';
import { useCallback } from 'react';

// Define a schema for our form
const schema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.email('Please enter a valid email address'),
  age: z.number().min(18, 'You must be at least 18 years old'),
});

// Define the form values type based on the schema
type FormValues = z.infer<typeof schema>;

// Each section is its own component that taps the SAME shared form context via
// useField — which handles value/error wiring (errors only show once a field is
// touched) and the validate-on-blur behavior for us.
function PersonalInfoSection() {
  const firstName = useField(['firstName']);
  const lastName = useField(['lastName']);

  return (
    <div className="mb-8 p-4 border border-blue-200 rounded-lg bg-blue-50">
      <h3 className="text-lg font-semibold text-blue-800 mb-4">
        Personal Information
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormInput
          {...firstName.props}
          label="First Name"
          placeholder="Enter your first name"
        />
        <FormInput
          {...lastName.props}
          label="Last Name"
          placeholder="Enter your last name"
        />
      </div>
    </div>
  );
}

// Second component that uses the same shared form context
function ContactInfoSection() {
  const form = useFormContext();
  const email = useField(['email']);
  const age = useField(['age']);

  return (
    <div className="mb-8 p-4 border border-green-200 rounded-lg bg-green-50">
      <h3 className="text-lg font-semibold text-green-800 mb-4">
        Contact Information
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormInput
          {...email.props}
          label="Email"
          placeholder="Enter your email"
          type="email"
        />
        <FormInput
          value={age.value}
          errorText={age.error}
          onBlur={age.props.onBlur}
          // `age` is a number field, so convert the input string before storing.
          onChange={(value) => form.setValue(['age'], Number(value))}
          label="Age"
          placeholder="Enter your age"
          type="number"
        />
      </div>
    </div>
  );
}

// Component for the submit button
function SubmitButton() {
  const form = useFormContext();

  const handleSubmit = useCallback(() => {
    form.submit();
  }, [form]);

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={handleSubmit}
        disabled={form.isSubmitting}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {form.isSubmitting ? 'Submitting...' : 'Submit Form'}
      </button>
    </div>
  );
}

// Main component that demonstrates multiple children in FormProvider
export default function MultipleChildrenExample() {
  const initialValues: FormValues = {
    firstName: '',
    lastName: '',
    email: '',
    age: 0,
  };

  const handleSubmit = async (values: FormValues) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('Form submitted:', values);
    alert(JSON.stringify(values, null, 2));
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Multiple Children Example</h2>
      <p className="mb-6 text-gray-600">
        This example demonstrates how multiple components can share the same
        form context. Each component can access and modify the form state
        independently.
      </p>

      <FormProvider
        initialValues={initialValues}
        schema={schema}
        onSubmit={handleSubmit}
      >
        <PersonalInfoSection />
        <ContactInfoSection />
        <FormState />
        <SubmitButton />
      </FormProvider>
    </div>
  );
}
