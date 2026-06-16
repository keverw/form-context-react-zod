import { describe, it, expect, jest } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { z } from 'zod';
import { FormProvider } from '../form-context';
import { FormState } from './FormState';
import { useFormContext } from '../hooks/useFormContext';

function renderFormState(props?: { showToggle?: boolean }) {
  return render(
    <FormProvider
      initialValues={{ name: 'Ada' }}
      schema={z.object({ name: z.string().min(2) })}
      onSubmit={jest.fn()}
    >
      <FormState {...props} />
    </FormProvider>
  );
}

describe('FormState (debug panel)', () => {
  it('renders the core sections and the current values', () => {
    renderFormState();
    expect(screen.getByText('Values')).toBeInTheDocument();
    expect(screen.getByText('Touched State')).toBeInTheDocument();
    expect(screen.getByText('Validation Errors')).toBeInTheDocument();
    // The serialized value of the `name` field is shown.
    expect(screen.getByText(/"Ada"/)).toBeInTheDocument();
  });

  it('hides the dark-mode toggle by default', () => {
    renderFormState();
    expect(screen.queryByText('Dark Mode')).not.toBeInTheDocument();
  });

  it('shows a working dark-mode toggle when showToggle is set', () => {
    renderFormState({ showToggle: true });
    expect(screen.getByText('Dark Mode')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false); // starts in light mode
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true); // switched to dark
  });

  it('renders varied value types and all four error sections', () => {
    const schema = z.object({
      str: z.string().min(10, 'str too short'),
      num: z.number(),
      bool: z.boolean(),
      arr: z.array(z.number()),
      obj: z.object({ a: z.number() }),
      nul: z.null(),
    });

    function Seeder() {
      const form = useFormContext();
      return (
        <button
          data-testid="seed"
          onClick={() => {
            form.validate(true); // validation error on `str`
            form.setServerErrors([
              { path: ['num'], message: 'server boom', source: 'server' },
            ]);
            form.setError(['bool'], 'manual boom'); // manual error
            form.setClientSubmissionError('client boom');
          }}
        >
          seed
        </button>
      );
    }

    render(
      <FormProvider
        initialValues={{
          str: 'x',
          num: 5,
          bool: true,
          arr: [1, 2],
          obj: { a: 1 },
          nul: null,
        }}
        schema={schema}
        onSubmit={jest.fn()}
      >
        <FormState />
        <Seeder />
      </FormProvider>
    );

    // ValueDisplay covers the boolean and null branches. (null appears more than
    // once now — the Submission section also shows currentSubmissionID: null.)
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getAllByText('null').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('seed'));

    // Each error section renders its message.
    expect(screen.getByText('str too short')).toBeInTheDocument(); // validation
    expect(screen.getByText('client boom')).toBeInTheDocument(); // client submission
    expect(screen.getByText('server boom')).toBeInTheDocument(); // server
    expect(screen.getByText('manual boom')).toBeInTheDocument(); // manual

    // Submission section surfaces the submit-attempt flags.
    expect(screen.getByText('Submission')).toBeInTheDocument();
    expect(screen.getByText('submitAttempted')).toBeInTheDocument();
    expect(screen.getByText('submitCount')).toBeInTheDocument();
  });

  it('renders the String() fallback for non-standard value types (e.g. bigint)', () => {
    function Seeder() {
      const form = useFormContext();
      // bigint isn't one of the typed branches, so it hits the String() fallback.
      return (
        <button data-testid="seed" onClick={() => form.setValue(['big'], 42n)}>
          seed
        </button>
      );
    }
    render(
      <FormProvider initialValues={{ big: 0n }} onSubmit={jest.fn()}>
        <FormState />
        <Seeder />
      </FormProvider>
    );
    fireEvent.click(screen.getByTestId('seed'));
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
