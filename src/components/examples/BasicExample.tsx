import { z } from 'zod';
import { FormProvider, FormHelpers } from '../../lib/form-context';
import FormInput from '../FormInput';
import { RootErrors, SubmitButton } from './shared';
import { FormState } from '../../lib/components/FormState';
import { simulateServer } from './utils';
import { useFormContext } from '../../lib/hooks/useFormContext';
import { useField } from '../../lib/hooks/useField';
import { useToast } from '../useToast';

const basicSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
});

function BasicForm() {
  const form = useFormContext();
  const nameField = useField(['name']);
  const emailField = useField(['email']);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <RootErrors />
      <div className="space-y-4">
        <FormInput {...nameField.props} label="Name" placeholder="John Doe" />
        <FormInput
          {...emailField.props}
          label="Email"
          placeholder="john@example.com"
          type="text"
          inputMode="email"
          autoCapitalize="off"
          autoComplete="email"
        />
        <SubmitButton />
        <FormState showToggle />
      </div>
    </form>
  );
}

export default function BasicExample() {
  const toast = useToast();

  const onSubmit = async (
    values: z.infer<typeof basicSchema>,
    helpers: FormHelpers
  ) => {
    try {
      const errors = await simulateServer(values);
      if (errors.length > 0) {
        helpers.setServerErrors(errors);
        return;
      }
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
      initialValues={{ name: '', email: '' }}
      schema={basicSchema}
      onSubmit={onSubmit}
    >
      <BasicForm />
    </FormProvider>
  );
}
