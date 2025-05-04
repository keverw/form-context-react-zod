import React from 'react';
import { z } from 'zod';
import { FormProvider, useFormContext, useField } from '../../lib/form-context';
import FormInput from '../FormInput';
import { RootErrors, SubmitButton, FormNotice } from './shared';
import FormState from '../FormState';

const prefilledSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  age: z.number().min(18, 'Must be at least 18 years old'),
  bio: z.string().min(10, 'Bio must be at least 10 characters'),
  website: z.string().url('Invalid URL').optional(),
});

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
          type="number"
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
  const onSubmit = async (form, values: z.infer<typeof prefilledSchema>) => {
    try {
      await simulateServer(values);
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
      initialValues={{
        username: 'johndoe', // Valid
        email: 'invalid-email', // Invalid format
        age: 16, // Below minimum
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
