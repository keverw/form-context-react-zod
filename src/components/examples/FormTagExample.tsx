import { z } from 'zod';
import { FormProvider } from '../../lib/form-context';
import { useField } from '../../lib/hooks/useField';
import FormInput from '../FormInput';

// Define the form schema
const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
});

// Define the form values type based on the schema
type FormValues = z.infer<typeof formSchema>;

// Form field component using the useField hook
function NameField() {
  const nameField = useField(['name']);

  return (
    <FormInput
      {...nameField.props}
      label="Name"
      id="name"
      placeholder="Your name"
    />
  );
}

function EmailField() {
  const emailField = useField(['email']);

  return (
    <FormInput
      {...emailField.props}
      label="Email"
      id="email"
      type="email"
      placeholder="your.email@example.com"
      autoCapitalize="off"
      autoComplete="email"
    />
  );
}

export default function FormTagExample() {
  const handleSubmit = async (values: FormValues) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log('Form submitted with values:', values);
    alert('Form submitted successfully! Check console for details.');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Form Tag Example</h2>
      <p className="text-gray-600 mb-6">
        This example demonstrates using the <code>useFormTag</code> prop to wrap
        the form in a native HTML form element with automatic preventDefault
        handling.
      </p>

      <div className="bg-gray-50 p-4 rounded-md mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Key Features:
        </h3>
        <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
          <li>
            Uses native HTML <code>&lt;form&gt;</code> element
          </li>
          <li>Automatic preventDefault on submit</li>
          <li>Works with regular submit buttons</li>
          <li>Can pass HTML form attributes via formProps</li>
        </ul>
      </div>

      <FormProvider
        initialValues={{
          name: '',
          email: '',
        }}
        schema={formSchema}
        onSubmit={handleSubmit}
        useFormTag={true}
        formProps={{
          className: 'space-y-4 border border-gray-200 rounded-md p-4',
          id: 'example-form',
          'aria-label': 'Contact form',
        }}
      >
        <NameField />
        <EmailField />

        <div className="flex items-center justify-between pt-2">
          <div className="text-sm text-gray-500">
            * Native HTML form submit button works
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Submit Form
          </button>
        </div>
      </FormProvider>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-md">
        <h3 className="text-sm font-medium text-blue-800 mb-2">
          Implementation Note:
        </h3>
        <p className="text-sm text-blue-700">
          Notice how we're using a regular HTML <code>type="submit"</code>{' '}
          button instead of calling <code>form.submit()</code> manually. The
          FormProvider handles the form submission automatically when the
          useFormTag prop is enabled.
        </p>
      </div>
    </div>
  );
}
