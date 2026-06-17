import { z } from 'zod';
import { FormProvider, FormSubmitHandler } from 'form-context-react-zod';
import FormInput from '../FormInput';
import { RootErrors, SubmitButton } from './shared';
import { FormState } from 'form-context-react-zod/devtools/web';
import { useFormContext } from 'form-context-react-zod';
import { useField } from 'form-context-react-zod';
import { useToast } from '../useToast';
import { simulateServer } from './utils';

const nestedSchema = z.object({
  user: z.object({
    profile: z.object({
      name: z.string().min(2, 'Name must be at least 2 characters'),
      bio: z.string().min(10, 'Bio must be at least 10 characters'),
    }),
  }),
});

function NestedForm() {
  const form = useFormContext();
  const nameField = useField(['user', 'profile', 'name']);
  const bioField = useField(['user', 'profile', 'bio']);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <RootErrors />
      <div className="space-y-4">
        <FormInput
          {...nameField.props}
          label="Username"
          placeholder="johndoe"
        />
        <FormInput
          {...bioField.props}
          label="Bio"
          placeholder="Tell us about yourself..."
          multiline
        />
        <SubmitButton />
        <FormState />
      </div>
    </form>
  );
}

export default function NestedExample() {
  const toast = useToast();

  const onSubmit: FormSubmitHandler<z.infer<typeof nestedSchema>> = async (
    values,
    helpers
  ) => {
    try {
      const errors = await simulateServer(values);
      if (errors.length > 0) {
        helpers.setServerErrors(errors);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log('Submitted values:', values);
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
        user: {
          profile: {
            name: '',
            bio: '',
          },
        },
      }}
      schema={nestedSchema}
      onSubmit={onSubmit}
    >
      <NestedForm />
    </FormProvider>
  );
}
