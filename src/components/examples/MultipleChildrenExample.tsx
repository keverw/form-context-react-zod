import { z } from 'zod';
import { FormProvider, FormContext } from '../../lib/form-context';
import FormInput from '../FormInput';
import { FormState } from '../../lib/components/FormState';
import { useContext, useCallback } from 'react';

// Define a schema for our form
const schema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  age: z.number().min(18, 'You must be at least 18 years old'),
});

// Define the form values type based on the schema
type FormValues = z.infer<typeof schema>;

// First component that will use the form context
function PersonalInfoSection() {
  const form = useContext(FormContext);

  if (!form) {
    throw new Error('PersonalInfoSection must be used within a FormProvider');
  }

  return (
    <div className="mb-8 p-4 border border-blue-200 rounded-lg bg-blue-50">
      <h3 className="text-lg font-semibold text-blue-800 mb-4">
        Personal Information
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormInput
          label="First Name"
          value={form.getValue(['firstName'])}
          onChange={(value) => form.setValue(['firstName'], value)}
          onBlur={() => form.setFieldTouched(['firstName'], true)}
          errorText={form.getError(['firstName'])[0]?.message}
          touched={!!form.touched['firstName']}
          placeholder="Enter your first name"
        />

        <FormInput
          label="Last Name"
          value={form.getValue(['lastName'])}
          onChange={(value) => form.setValue(['lastName'], value)}
          onBlur={() => form.setFieldTouched(['lastName'], true)}
          errorText={form.getError(['lastName'])[0]?.message}
          touched={!!form.touched['lastName']}
          placeholder="Enter your last name"
        />
      </div>
    </div>
  );
}

// Second component that will use the same form context
function ContactInfoSection() {
  const form = useContext(FormContext);

  if (!form) {
    throw new Error('ContactInfoSection must be used within a FormProvider');
  }

  return (
    <div className="mb-8 p-4 border border-green-200 rounded-lg bg-green-50">
      <h3 className="text-lg font-semibold text-green-800 mb-4">
        Contact Information
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormInput
          label="Email"
          value={form.getValue(['email'])}
          onChange={(value) => form.setValue(['email'], value)}
          onBlur={() => form.setFieldTouched(['email'], true)}
          errorText={form.getError(['email'])[0]?.message}
          touched={!!form.touched['email']}
          placeholder="Enter your email"
          type="email"
        />

        <FormInput
          label="Age"
          value={form.getValue(['age'])}
          onChange={(value) => form.setValue(['age'], Number(value))}
          onBlur={() => form.setFieldTouched(['age'], true)}
          errorText={form.getError(['age'])[0]?.message}
          touched={!!form.touched['age']}
          placeholder="Enter your age"
          type="number"
        />
      </div>
    </div>
  );
}

// Component for the submit button
function SubmitButton() {
  const form = useContext(FormContext);

  if (!form) {
    throw new Error('SubmitButton must be used within a FormProvider');
  }

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
