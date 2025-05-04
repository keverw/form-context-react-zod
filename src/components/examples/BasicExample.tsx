import React from 'react';
import { z } from 'zod';
import { FormProvider, useFormContext, useField } from '../../lib/form-context';
import FormInput from '../FormInput';
import { RootErrors, SubmitButton } from './shared';
import FormState from '../FormState';
import { simulateServer } from './utils';

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
        <FormState />
      </div>
    </form>
  );
}

export default function BasicExample() {
  const onSubmit = async (form, values: z.infer<typeof basicSchema>) => {
    try {
      const errors = await simulateServer(values);
      if (errors.length > 0) {
        form.setServerErrors(errors);
        return;
      }
      alert('Form submitted successfully!');
    } catch (error) {
      console.error('Submission failed:', error);
      form.setServerErrors([
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
