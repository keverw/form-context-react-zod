import { z } from 'zod';
import { FormProvider, FormSubmitHandler } from 'form-context-react-zod';
import FormInput from '../FormInput';
import { RootErrors, SubmitButton } from './shared';
import { FormState } from 'form-context-react-zod/devtools/web';
import { simulateServer } from './utils';
import { useFormContext } from 'form-context-react-zod';
import { useField } from 'form-context-react-zod';
import { useToast } from '../useToast';

const basicSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.email('Invalid email address'),
});

function BasicForm() {
  const form = useFormContext();
  const nameField = useField(['name']);
  const emailField = useField(['email']);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        // submit() touches every field and validates, so by the time it resolves
        // all errors are active — then drop the user on the first invalid field.
        await form.submit();
        form.focusFirstError();
      }}
    >
      <RootErrors />
      <div className="space-y-4">
        <FormInput
          {...nameField.props}
          inputRef={nameField.inputRef}
          label="Name"
          placeholder="John Doe"
        />
        <FormInput
          {...emailField.props}
          inputRef={emailField.inputRef}
          label="Email"
          placeholder="john@example.com"
          type="text"
          inputMode="email"
          autoCapitalize="off"
          autoComplete="email"
        />
        <SubmitButton />
        {/* Deliberately always clickable — unlike SubmitButton (disabled until
            canSubmit), this stays active even while the form is INVALID, which is
            exactly when there are client validation errors to focus. submit()
            isn't gated by canSubmit: it marks every field touched, validates,
            surfaces errors, and only calls onSubmit when valid. focusFirstError()
            then jumps to the first invalid field (try it with both fields empty).
            We reflect isSubmitting in the label, but intentionally do NOT dim on
            !canSubmit — that would hide the very interaction this button exists to
            demonstrate. submit() no-ops a double-click while already in flight. */}
        <button
          type="button"
          onClick={async () => {
            await form.submit();
            form.focusFirstError();
          }}
          aria-busy={form.isSubmitting}
          className="w-full px-4 py-2 text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
        >
          {form.isSubmitting
            ? 'Submitting…'
            : form.canSubmit
              ? 'Submit & focus first error'
              : 'Submit anyway & focus first error'}
        </button>
        <FormState showToggle />
      </div>
    </form>
  );
}

export default function BasicExample() {
  const toast = useToast();

  const onSubmit: FormSubmitHandler<z.infer<typeof basicSchema>> = async (
    values,
    helpers
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
