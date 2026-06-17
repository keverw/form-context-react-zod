import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from 'bun:test';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { z } from 'zod';
import { FormProvider, FormContext } from './form-context';
import { useField } from './hooks/useField';
import { ValidationError } from './zod-helpers';
import { serializePath } from './utils';

// Helper function to advance timers and settle promises.
// bun:test has no advanceTimersToNextTimerAsync, so we drain pending timers and
// flush the microtask queue a few times to let chained async work settle
// (debounced validation -> promise -> a newly scheduled timer).
const advanceTimers = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      jest.runAllTimers();
      // let promise callbacks queued by the timer callbacks run before re-draining
      await Promise.resolve();
    }
  });
};

// Custom hook to access form context for testing
function useFormContext() {
  const context = React.useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context;
}

// Test component that uses form context
interface TestFormProps {
  initialValues?: Record<string, unknown>;
  onSubmit?: (
    values: Record<string, unknown>,
    helpers: FormHelpers
  ) => Promise<void> | void;
  schema?: z.ZodType<Record<string, unknown>>;
  validateOnMount?: boolean;
  validateOnChange?: boolean;
  children: React.ReactNode;
}

// Add a simplified FormHelpers type definition that matches the actual helpers provided
interface FormHelpers {
  setErrors: (errors: ValidationError[]) => void;
  setServerErrors: (errors: ValidationError[]) => void;
  setServerError: (
    path: (string | number)[],
    message: string | string[] | null
  ) => void;
  setClientSubmissionError: (message: string | string[] | null) => void;
  clearClientSubmissionError: () => void;
  getClientSubmissionError: () => string[];
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  clearValue: (path: (string | number)[]) => boolean;
  deleteField: (path: (string | number)[]) => void;
  validate: (force?: boolean) => boolean;
  hasField: (path: (string | number)[]) => boolean;
  touched: Record<string, boolean>;
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  reset: (force?: boolean) => boolean;
  signal: AbortSignal;
}

function TestForm({
  initialValues = {},
  onSubmit = jest.fn(),
  schema = z.object({}),
  validateOnMount = false,
  validateOnChange = true,
  children,
}: TestFormProps) {
  return (
    <FormProvider
      initialValues={initialValues}
      onSubmit={onSubmit}
      schema={schema}
      validateOnMount={validateOnMount}
      validateOnChange={validateOnChange}
    >
      {children}
    </FormProvider>
  );
}

// Test field component
interface TestFieldProps {
  name: string;
}

function TestField({ name }: TestFieldProps) {
  const form = useFormContext();
  const path = name
    .split('.')
    .map((part) => (isNaN(Number(part)) ? part : Number(part)));

  const value = form.getValue(path);
  const errors = form.getError(path);
  const hasError = errors.length > 0;

  // Use serializePath for accessing touched state
  const pathKey = serializePath(path);
  const isTouched = form.touched[pathKey];

  return (
    <div>
      <input
        data-testid={`input-${name}`}
        value={value !== undefined && value !== null ? String(value) : ''}
        onChange={(e) => form.setValue(path, e.target.value)}
        aria-invalid={hasError}
        // Add a class when the field is touched
        className={isTouched ? 'touched' : ''}
      />
      {hasError && (
        <span data-testid={`error-${name}`}>{errors[0].message}</span>
      )}
      {/* Display touched state for debugging */}
      <span data-testid={`touched-${name}`} style={{ display: 'none' }}>
        {isTouched ? 'touched' : 'untouched'}
      </span>
    </div>
  );
}

// Test submit button component
function SubmitButton() {
  const form = useFormContext();
  return (
    <button
      data-testid="submit-button"
      onClick={form.submit}
      disabled={form.isSubmitting}
    >
      Submit
    </button>
  );
}

describe('useField re-render isolation', () => {
  it('editing one field does not re-render another field', () => {
    const renders = { a: 0, b: 0 };

    // Count via an effect (runs once per committed render) — a field that doesn't
    // re-render never re-runs, so its effect doesn't fire.
    const FieldA = () => {
      const f = useField(['a']);
      React.useEffect(() => {
        renders.a++;
      });
      return (
        <input
          data-testid="a"
          value={(f.value as string) ?? ''}
          onChange={(e) => f.setValue(e.target.value)}
        />
      );
    };
    const FieldB = () => {
      const f = useField(['b']);
      React.useEffect(() => {
        renders.b++;
      });
      return (
        <input
          data-testid="b"
          value={(f.value as string) ?? ''}
          onChange={(e) => f.setValue(e.target.value)}
        />
      );
    };

    render(
      <FormProvider
        initialValues={{ a: '', b: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <FieldA />
        <FieldB />
      </FormProvider>
    );

    const aBefore = renders.a;
    const bBefore = renders.b;

    fireEvent.change(screen.getByTestId('a'), { target: { value: 'x' } });

    // A re-rendered (its own value changed); B did NOT (its slice is unchanged, and
    // it subscribes to the stable FormFieldContext rather than the reactive one).
    expect(renders.a).toBeGreaterThan(aBefore);
    expect(renders.b).toBe(bBefore);

    // Sanity: the edit actually took effect.
    expect((screen.getByTestId('a') as HTMLInputElement).value).toBe('x');
  });
});

describe('FormProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('initializes with correct initial values', () => {
    // This test doesn't need timer advancement since it's synchronous
    const initialValues = { name: 'John', email: 'john@example.com' };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="name">{form.getValue(['name'])}</div>
          <div data-testid="email">{form.getValue(['email'])}</div>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    expect(screen.getByTestId('name').textContent).toBe('John');
    expect(screen.getByTestId('email').textContent).toBe('john@example.com');
  });

  it('updates values when setValue is called', async () => {
    const initialValues = { name: '' };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <input
            data-testid="input"
            value={form.getValue(['name']) || ''}
            onChange={(e) => form.setValue(['name'], e.target.value)}
          />
          <div data-testid="display">{form.getValue(['name'])}</div>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    const input = screen.getByTestId('input');
    fireEvent.change(input, { target: { value: 'Jane Doe' } });

    await advanceTimers();

    expect(screen.getByTestId('display').textContent).toBe('Jane Doe');
  });

  it('validates form using schema', async () => {
    const initialValues = { name: '', email: '' };
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      email: z.email('Invalid email format'),
    });

    render(
      <TestForm initialValues={initialValues} schema={schema}>
        <TestField name="name" />
        <TestField name="email" />
        <SubmitButton />
      </TestForm>
    );

    // Submit the form to trigger validation - Wrap in act
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });

    await advanceTimers();

    expect(screen.getByTestId('error-name')).toBeInTheDocument();
    expect(screen.getByTestId('error-email')).toBeInTheDocument();
    expect(screen.getByTestId('error-name').textContent).toBe(
      'Name is required'
    );

    // Update fields with valid values
    fireEvent.change(screen.getByTestId('input-name'), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByTestId('input-email'), {
      target: { value: 'jane@example.com' },
    });

    await advanceTimers();

    // Submit again - Wrap in act
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });

    await advanceTimers();

    // Errors should be gone
    expect(screen.queryByTestId('error-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-email')).not.toBeInTheDocument();
  });

  it('calls onSubmit with current values and helpers', async () => {
    const initialValues = { name: 'John', email: 'john@example.com' };
    const onSubmit = jest.fn();

    render(
      <TestForm initialValues={initialValues} onSubmit={onSubmit}>
        <SubmitButton />
      </TestForm>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });

    await advanceTimers();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      initialValues,
      expect.objectContaining({
        setErrors: expect.any(Function),
        setServerErrors: expect.any(Function),
        setServerError: expect.any(Function),
        setValue: expect.any(Function),
        clearValue: expect.any(Function),
        deleteField: expect.any(Function),
        validate: expect.any(Function),
        hasField: expect.any(Function),
        reset: expect.any(Function),
      })
    );
  });

  it('resets form state when reset is called', async () => {
    const initialValues = { name: 'John', email: 'john@example.com' };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <input
            data-testid="input-name"
            value={form.getValue(['name']) || ''}
            onChange={(e) => form.setValue(['name'], e.target.value)}
          />
          <button data-testid="reset-button" onClick={() => form.reset()}>
            Reset
          </button>
          <div data-testid="display-name">{form.getValue(['name'])}</div>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Change the name
    fireEvent.change(screen.getByTestId('input-name'), {
      target: { value: 'Jane Doe' },
    });

    await advanceTimers();

    expect(screen.getByTestId('display-name').textContent).toBe('Jane Doe');

    // Reset the form
    fireEvent.click(screen.getByTestId('reset-button'));

    await advanceTimers();

    expect(screen.getByTestId('display-name').textContent).toBe('John');
  });

  it('handles nested values correctly', async () => {
    const initialValues = {
      user: {
        personal: {
          name: 'John',
          age: 30,
        },
        contact: {
          email: 'john@example.com',
        },
      },
    };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <input
            data-testid="input-name"
            value={form.getValue(['user', 'personal', 'name']) || ''}
            onChange={(e) =>
              form.setValue(['user', 'personal', 'name'], e.target.value)
            }
          />
          <div data-testid="display-name">
            {form.getValue(['user', 'personal', 'name'])}
          </div>
          <div data-testid="display-email">
            {form.getValue(['user', 'contact', 'email'])}
          </div>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Check initial values
    expect(screen.getByTestId('display-name').textContent).toBe('John');
    expect(screen.getByTestId('display-email').textContent).toBe(
      'john@example.com'
    );

    // Change the name
    fireEvent.change(screen.getByTestId('input-name'), {
      target: { value: 'Jane Doe' },
    });

    await advanceTimers();

    expect(screen.getByTestId('display-name').textContent).toBe('Jane Doe');
    // Email should remain unchanged
    expect(screen.getByTestId('display-email').textContent).toBe(
      'john@example.com'
    );
  });

  it('handles array values correctly', async () => {
    const initialValues = {
      items: ['apple', 'banana', 'cherry'],
    };

    const TestComponent = () => {
      const form = useFormContext();
      const items = (form.getValue(['items']) as string[]) || [];

      return (
        <div>
          <div>
            {items.map((item: string, index: number) => (
              <div key={index} data-testid={`item-${index}`}>
                <input
                  data-testid={`input-${index}`}
                  value={item}
                  onChange={(e) =>
                    form.setValue(['items', index], e.target.value)
                  }
                />
                <button
                  data-testid={`delete-${index}`}
                  onClick={() => form.deleteField(['items', index])}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
          <button
            data-testid="add-item"
            onClick={() => {
              const newItems = [...items, ''];
              form.setValue(['items'], newItems);
            }}
          >
            Add Item
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Check initial array items
    expect(screen.getByTestId('item-0')).toBeInTheDocument();
    expect(screen.getByTestId('item-1')).toBeInTheDocument();
    expect(screen.getByTestId('item-2')).toBeInTheDocument();
    expect(screen.getByTestId('input-0') as HTMLInputElement).toHaveValue(
      'apple'
    );
    expect(screen.getByTestId('input-1') as HTMLInputElement).toHaveValue(
      'banana'
    );
    expect(screen.getByTestId('input-2') as HTMLInputElement).toHaveValue(
      'cherry'
    );

    // Update an item
    fireEvent.change(screen.getByTestId('input-1'), {
      target: { value: 'orange' },
    });

    await advanceTimers();

    expect(screen.getByTestId('input-1') as HTMLInputElement).toHaveValue(
      'orange'
    );

    // Delete an item
    fireEvent.click(screen.getByTestId('delete-0'));

    await advanceTimers();

    // After deletion, the array should be reindexed
    // So what was at index 1 (orange) should now be at index 0
    expect(screen.getByTestId('input-0') as HTMLInputElement).toHaveValue(
      'orange'
    );
    expect(screen.getByTestId('input-1') as HTMLInputElement).toHaveValue(
      'cherry'
    );
    // There should only be 2 items now
    expect(screen.queryByTestId('item-2')).not.toBeInTheDocument();

    // Add a new item
    fireEvent.click(screen.getByTestId('add-item'));

    await advanceTimers();

    expect(screen.getByTestId('item-2')).toBeInTheDocument();
    expect(screen.getByTestId('input-2') as HTMLInputElement).toHaveValue('');
  });

  it('tests hasField function correctly identifies existing and non-existing fields', async () => {
    const initialValues = {
      name: 'John',
      address: {
        street: '123 Main St',
        city: 'New York',
      },
      preferences: null,
      tags: ['personal', 'important'],
    };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="has-name">{form.hasField(['name']).toString()}</div>
          <div data-testid="has-street">
            {form.hasField(['address', 'street']).toString()}
          </div>
          <div data-testid="has-country">
            {form.hasField(['address', 'country']).toString()}
          </div>
          <div data-testid="has-preferences">
            {form.hasField(['preferences']).toString()}
          </div>
          <div data-testid="has-tags">{form.hasField(['tags']).toString()}</div>
          <div data-testid="has-tag-0">
            {form.hasField(['tags', 0]).toString()}
          </div>
          <div data-testid="has-tag-2">
            {form.hasField(['tags', 2]).toString()}
          </div>
          <div data-testid="has-nonexistent">
            {form.hasField(['nonexistent']).toString()}
          </div>

          <button
            data-testid="add-country"
            onClick={() => form.setValue(['address', 'country'], 'USA')}
          >
            Add Country
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Check existing fields
    expect(screen.getByTestId('has-name').textContent).toBe('true');
    expect(screen.getByTestId('has-street').textContent).toBe('true');
    expect(screen.getByTestId('has-tags').textContent).toBe('true');
    expect(screen.getByTestId('has-tag-0').textContent).toBe('true');

    // Check non-existing fields
    expect(screen.getByTestId('has-country').textContent).toBe('false');
    expect(screen.getByTestId('has-tag-2').textContent).toBe('false');
    expect(screen.getByTestId('has-nonexistent').textContent).toBe('false');

    // Null fields should still return true
    expect(screen.getByTestId('has-preferences').textContent).toBe('true');

    // Add a new field and check again
    fireEvent.click(screen.getByTestId('add-country'));

    await advanceTimers();

    expect(screen.getByTestId('has-country').textContent).toBe('true');
  });

  it('tests deleteField removes fields from form state', async () => {
    const initialValues = {
      user: {
        name: 'John',
        address: {
          street: '123 Main St',
          city: 'New York',
          zip: '10001',
        },
      },
      items: ['apple', 'banana', 'cherry'],
    };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          {/* Display field existence status */}
          <div data-testid="has-name">
            {form.hasField(['user', 'name']).toString()}
          </div>
          <div data-testid="has-street">
            {form.hasField(['user', 'address', 'street']).toString()}
          </div>
          <div data-testid="has-items">
            {form.hasField(['items']).toString()}
          </div>
          <div data-testid="items-length">
            {((form.getValue(['items']) as string[]) || []).length.toString()}
          </div>

          {/* Display field values */}
          <div data-testid="name-value">
            {form.getValue(['user', 'name']) || '[deleted]'}
          </div>
          <div data-testid="address-value">
            {form.hasField(['user', 'address'])
              ? 'Address exists'
              : 'Address deleted'}
          </div>

          {/* Buttons to delete fields */}
          <button
            data-testid="delete-name"
            onClick={() => form.deleteField(['user', 'name'])}
          >
            Delete Name
          </button>
          <button
            data-testid="delete-address"
            onClick={() => form.deleteField(['user', 'address'])}
          >
            Delete Address
          </button>
          <button
            data-testid="delete-item"
            onClick={() => form.deleteField(['items', 1])}
          >
            Delete Item at Index 1
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Check initial state
    expect(screen.getByTestId('has-name').textContent).toBe('true');
    expect(screen.getByTestId('has-street').textContent).toBe('true');
    expect(screen.getByTestId('has-items').textContent).toBe('true');
    expect(screen.getByTestId('items-length').textContent).toBe('3');
    expect(screen.getByTestId('name-value').textContent).toBe('John');
    expect(screen.getByTestId('address-value').textContent).toBe(
      'Address exists'
    );

    // Delete a primitive field
    fireEvent.click(screen.getByTestId('delete-name'));

    await advanceTimers();

    expect(screen.getByTestId('has-name').textContent).toBe('false');
    expect(screen.getByTestId('name-value').textContent).toBe('[deleted]');

    // Delete an object field
    fireEvent.click(screen.getByTestId('delete-address'));

    await advanceTimers();

    expect(screen.getByTestId('has-street').textContent).toBe('false');
    expect(screen.getByTestId('address-value').textContent).toBe(
      'Address deleted'
    );

    // Delete an array item
    fireEvent.click(screen.getByTestId('delete-item'));

    await advanceTimers();

    expect(screen.getByTestId('items-length').textContent).toBe('2');
  });

  it('deleteField drops client and server errors under the deleted path', async () => {
    // Covers the error-cleanup branches in deleteField: client errors and the
    // serverErrorsRef baseline are both filtered so the deleted subtree's errors
    // are removed, while errors on shorter/unrelated paths survive — and a later
    // setServerError can't rebuild the dropped child errors from a stale baseline.
    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <span data-testid="street-err">
            {form.getError(['user', 'address', 'street'])[0]?.message ?? 'none'}
          </span>
          <span data-testid="city-err">
            {form.getError(['user', 'address', 'city'])[0]?.message ?? 'none'}
          </span>
          <span data-testid="name-err">
            {form.getError(['user', 'name'])[0]?.message ?? 'none'}
          </span>
          <span data-testid="account-err">
            {form.getError(['account'])[0]?.message ?? 'none'}
          </span>
          <button
            data-testid="seed"
            onClick={() => {
              // Under the delete target — should be removed.
              form.setError(['user', 'address', 'street'], 'street bad');
              form.setServerError(['user', 'address', 'city'], 'city taken');
              // Sibling under the same parent, NOT under the delete target — kept.
              form.setError(['user', 'name'], 'name bad');
              // Shorter, unrelated path (length 1 < delete path length 2) — kept.
              form.setServerError(['account'], 'account locked');
            }}
          >
            seed
          </button>
          <button
            data-testid="delete"
            onClick={() => form.deleteField(['user', 'address'])}
          >
            delete address
          </button>
          <button
            data-testid="bump"
            onClick={() => form.setServerError(['other'], 'EX')}
          >
            bump
          </button>
        </div>
      );
    };

    render(
      <TestForm
        initialValues={{
          user: { name: 'John', address: { street: '123 Main', city: 'NYC' } },
          account: 'acct-1',
          other: 'x',
        }}
        validateOnChange={false}
      >
        <TestComponent />
      </TestForm>
    );

    fireEvent.click(screen.getByTestId('seed'));
    await advanceTimers();
    expect(screen.getByTestId('street-err').textContent).toBe('street bad');
    expect(screen.getByTestId('city-err').textContent).toBe('city taken');
    expect(screen.getByTestId('name-err').textContent).toBe('name bad');
    expect(screen.getByTestId('account-err').textContent).toBe(
      'account locked'
    );

    // Delete the parent: errors under user.address drop; the sibling and the
    // shorter unrelated error are kept.
    fireEvent.click(screen.getByTestId('delete'));
    await advanceTimers();
    expect(screen.getByTestId('street-err').textContent).toBe('none');
    expect(screen.getByTestId('city-err').textContent).toBe('none');
    expect(screen.getByTestId('name-err').textContent).toBe('name bad');
    expect(screen.getByTestId('account-err').textContent).toBe(
      'account locked'
    );

    // An unrelated setServerError rebuilds combined errors from the baseline —
    // the dropped child server error must NOT come back.
    fireEvent.click(screen.getByTestId('bump'));
    await advanceTimers();
    expect(screen.getByTestId('city-err').textContent).toBe('none');
    expect(screen.getByTestId('account-err').textContent).toBe(
      'account locked'
    );
  });

  it('handles server errors correctly', async () => {
    const initialValues = { username: 'testuser', password: 'password' };

    // Mock onSubmit that sets a server error
    const onSubmit = jest.fn(async (_values, helpers) => {
      helpers.setServerError(['username'], 'Username already taken');
    });

    render(
      <TestForm initialValues={initialValues} onSubmit={onSubmit}>
        <TestField name="username" />
        <TestField name="password" />
        <SubmitButton />
      </TestForm>
    );

    // Submit the form - Wrap in act
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });

    await advanceTimers();

    // Verify server error is displayed
    expect(screen.getByTestId('error-username')).toBeInTheDocument();
    expect(screen.getByTestId('error-username').textContent).toBe(
      'Username already taken'
    );

    // Change the field with error
    fireEvent.change(screen.getByTestId('input-username'), {
      target: { value: 'newuser' },
    });

    await advanceTimers();

    // Server error should be cleared after value change
    expect(screen.queryByTestId('error-username')).not.toBeInTheDocument();
  });

  it('clears values correctly', async () => {
    const initialValues = {
      name: 'John',
      address: {
        street: '123 Main St',
        city: 'New York',
      },
      tags: ['personal', 'important'],
    };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="name">{form.getValue(['name']) || '[empty]'}</div>
          <div data-testid="street">
            {form.getValue(['address', 'street']) || '[empty]'}
          </div>
          <div data-testid="tags-length">
            {((form.getValue(['tags']) as string[]) || []).length}
          </div>

          <button
            data-testid="clear-name"
            onClick={() => form.clearValue(['name'])}
          >
            Clear Name
          </button>
          <button
            data-testid="clear-address"
            onClick={() => form.clearValue(['address'])}
          >
            Clear Address
          </button>
          <button
            data-testid="clear-tags"
            onClick={() => form.clearValue(['tags'])}
          >
            Clear Tags
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Check initial values
    expect(screen.getByTestId('name').textContent).toBe('John');
    expect(screen.getByTestId('street').textContent).toBe('123 Main St');
    expect(screen.getByTestId('tags-length').textContent).toBe('2');

    // Clear name (string value)
    fireEvent.click(screen.getByTestId('clear-name'));

    await advanceTimers();

    expect(screen.getByTestId('name').textContent).toBe('[empty]');

    // Clear address (object value)
    fireEvent.click(screen.getByTestId('clear-address'));

    await advanceTimers();

    expect(screen.getByTestId('street').textContent).toBe('[empty]');

    // Clear tags (array value)
    fireEvent.click(screen.getByTestId('clear-tags'));

    await advanceTimers();

    expect(screen.getByTestId('tags-length').textContent).toBe('0');
  });

  it('clearValue clears errors at the path (server/manual included)', async () => {
    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <span data-testid="val">{String(form.getValue(['name']) ?? '')}</span>
          <span data-testid="err">
            {form.getError(['name'])[0]?.message ?? 'none'}
          </span>
          <button
            data-testid="set-err"
            onClick={() => form.setError(['name'], 'manual problem')}
          >
            set error
          </button>
          <button data-testid="clear" onClick={() => form.clearValue(['name'])}>
            clear
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={{ name: 'John' }}>
        <TestComponent />
      </TestForm>
    );

    fireEvent.click(screen.getByTestId('set-err'));
    await advanceTimers();
    expect(screen.getByTestId('err').textContent).toBe('manual problem');

    // Clearing the value also clears its error (previously the error lingered).
    fireEvent.click(screen.getByTestId('clear'));
    await advanceTimers();
    expect(screen.getByTestId('val').textContent).toBe('');
    expect(screen.getByTestId('err').textContent).toBe('none');
  });

  it('clearValue returns true when the field exists, false when it does not', async () => {
    const results: { existing?: boolean; missing?: boolean } = {};

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="clear"
          onClick={() => {
            results.existing = form.clearValue(['name']);
            results.missing = form.clearValue(['nope']);
          }}
        >
          clear
        </button>
      );
    };

    render(
      <TestForm initialValues={{ name: 'John' }}>
        <TestComponent />
      </TestForm>
    );

    fireEvent.click(screen.getByTestId('clear'));
    await advanceTimers();

    expect(results.existing).toBe(true);
    expect(results.missing).toBe(false);
  });

  it('setValue does not resurrect a cleared server error on a later setServerError', async () => {
    // Regression: setValue cleared a descendant server error from errorsRef but left
    // it in serverErrorsRef, so a later unrelated setServerError() rebuilt the
    // combined errors from the stale baseline and brought the cleared error back.
    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <span data-testid="child-err">
            {form.getError(['profile', 'email'])[0]?.message ?? 'none'}
          </span>
          <span data-testid="other-err">
            {form.getError(['other'])[0]?.message ?? 'none'}
          </span>
          <button
            data-testid="seed"
            onClick={() => form.setServerError(['profile', 'email'], 'taken')}
          >
            seed
          </button>
          <button
            data-testid="replace"
            onClick={() =>
              form.setValue(['profile'], { email: 'fresh@example.com' })
            }
          >
            replace parent
          </button>
          <button
            data-testid="bump"
            onClick={() => form.setServerError(['other'], 'EX')}
          >
            bump other
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={{ profile: { email: 'a@b.com' }, other: 'x' }}>
        <TestComponent />
      </TestForm>
    );

    fireEvent.click(screen.getByTestId('seed'));
    await advanceTimers();
    expect(screen.getByTestId('child-err').textContent).toBe('taken');

    // Replace the parent: the child server error clears from both errorsRef and the
    // serverErrorsRef baseline.
    fireEvent.click(screen.getByTestId('replace'));
    await advanceTimers();
    expect(screen.getByTestId('child-err').textContent).toBe('none');

    // An unrelated setServerError rebuilds combined errors — the cleared child
    // error must NOT come back.
    fireEvent.click(screen.getByTestId('bump'));
    await advanceTimers();
    expect(screen.getByTestId('other-err').textContent).toBe('EX');
    expect(screen.getByTestId('child-err').textContent).toBe('none');
  });

  it('setValue on a parent object clears stale child errors', async () => {
    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <span data-testid="child-err">
            {form.getError(['profile', 'email'])[0]?.message ?? 'none'}
          </span>
          <button
            data-testid="set-err"
            onClick={() => form.setError(['profile', 'email'], 'taken')}
          >
            set error
          </button>
          <button
            data-testid="replace"
            onClick={() =>
              form.setValue(['profile'], { email: 'fresh@example.com' })
            }
          >
            replace parent
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={{ profile: { email: 'a@b.com' } }}>
        <TestComponent />
      </TestForm>
    );

    fireEvent.click(screen.getByTestId('set-err'));
    await advanceTimers();
    expect(screen.getByTestId('child-err').textContent).toBe('taken');

    // Replacing the whole parent object clears the now-stale child-field error.
    fireEvent.click(screen.getByTestId('replace'));
    await advanceTimers();
    expect(screen.getByTestId('child-err').textContent).toBe('none');
  });

  it('tests setErrors function for setting validation errors', async () => {
    const initialValues = {
      username: 'testuser',
      email: 'test@example.com',
      profile: {
        bio: 'Test bio',
      },
    };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="username-field">
            <input
              data-testid="username-input"
              value={form.getValue(['username']) || ''}
              onChange={(e) => form.setValue(['username'], e.target.value)}
            />
            {form.getError(['username']).length > 0 && (
              <div data-testid="username-error">
                {form.getError(['username'])[0].message}
              </div>
            )}
          </div>

          <div data-testid="email-field">
            <input
              data-testid="email-input"
              value={form.getValue(['email']) || ''}
              onChange={(e) => form.setValue(['email'], e.target.value)}
            />
            {form.getError(['email']).length > 0 && (
              <div data-testid="email-error">
                {form.getError(['email'])[0].message}
              </div>
            )}
          </div>

          <div data-testid="bio-field">
            <textarea
              data-testid="bio-input"
              value={form.getValue(['profile', 'bio']) || ''}
              onChange={(e) =>
                form.setValue(['profile', 'bio'], e.target.value)
              }
            />
            {form.getError(['profile', 'bio']).length > 0 && (
              <div data-testid="bio-error">
                {form.getError(['profile', 'bio'])[0].message}
              </div>
            )}
          </div>

          <button
            data-testid="set-errors"
            onClick={() => {
              form.setErrors([
                { path: ['username'], message: 'Username is too short' },
                { path: ['email'], message: 'Invalid email format' },
                { path: ['profile', 'bio'], message: 'Bio is too long' },
              ]);
            }}
          >
            Set Validation Errors
          </button>

          <button
            data-testid="clear-errors"
            onClick={() => {
              form.setErrors([]);
            }}
          >
            Clear All Errors
          </button>

          <button
            data-testid="change-username"
            onClick={() => {
              form.setValue(['username'], 'newuser');
            }}
          >
            Change Username
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Initially, there should be no errors
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bio-error')).not.toBeInTheDocument();

    // Set validation errors
    fireEvent.click(screen.getByTestId('set-errors'));

    await advanceTimers();

    // Errors should now be displayed
    expect(screen.getByTestId('username-error')).toBeInTheDocument();
    expect(screen.getByTestId('username-error').textContent).toBe(
      'Username is too short'
    );
    expect(screen.getByTestId('email-error')).toBeInTheDocument();
    expect(screen.getByTestId('email-error').textContent).toBe(
      'Invalid email format'
    );
    expect(screen.getByTestId('bio-error')).toBeInTheDocument();
    expect(screen.getByTestId('bio-error').textContent).toBe('Bio is too long');

    // Change a field value, which triggers a full revalidation. These errors were
    // set UNTAGGED (no `source`) via setErrors — i.e. ordinary validation-style
    // errors per the contract — and the schema finds nothing wrong, so the recompute
    // clears ALL of them, not just the edited field's. (Reach for setError/
    // setServerError when you want an error that survives a sibling edit.)
    fireEvent.click(screen.getByTestId('change-username'));

    await advanceTimers();

    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bio-error')).not.toBeInTheDocument();

    // Clear all errors
    fireEvent.click(screen.getByTestId('clear-errors'));

    await advanceTimers();

    // All errors should be gone
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bio-error')).not.toBeInTheDocument();
  });

  it('setErrors syncs the per-source baselines (server + client-submission channels)', async () => {
    // Regression: setErrors is a wholesale replace, and server / client-form-handler
    // errors each keep a parallel store. A raw setErrors([{ source: 'server', … }])
    // must update serverErrorsRef too — otherwise a later targeted setServerError
    // rebuilds from a stale baseline and silently drops the raw server error. The
    // client-submission channel must likewise be readable via getClientSubmissionError.
    function Probe() {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="email-errs">{form.getError(['email']).length}</div>
          <div data-testid="name-errs">{form.getError(['name']).length}</div>
          <div data-testid="submission-errs">
            {form.getClientSubmissionError().join(',')}
          </div>
          <button
            data-testid="raw-set"
            onClick={() =>
              form.setErrors([
                { path: ['email'], message: 'Email taken', source: 'server' },
                {
                  path: [],
                  message: 'Network down',
                  source: 'client-form-handler',
                },
              ])
            }
          />
          <button
            data-testid="set-other-server"
            // Targeted server error at a DIFFERENT path — rebuilds from serverErrorsRef.
            onClick={() => form.setServerError(['name'], 'Name bad')}
          />
        </div>
      );
    }

    render(
      <TestForm initialValues={{ email: 'a@b.c', name: 'x' }}>
        <Probe />
      </TestForm>
    );

    // Raw setErrors with a server + a client-submission entry.
    fireEvent.click(screen.getByTestId('raw-set'));
    await advanceTimers();
    expect(screen.getByTestId('email-errs').textContent).toBe('1');
    // The client-submission channel reflects the raw entry (synced baseline).
    expect(screen.getByTestId('submission-errs').textContent).toBe(
      'Network down'
    );

    // A later targeted setServerError must NOT drop the raw server error at ['email'].
    fireEvent.click(screen.getByTestId('set-other-server'));
    await advanceTimers();
    expect(screen.getByTestId('email-errs').textContent).toBe('1'); // survived
    expect(screen.getByTestId('name-errs').textContent).toBe('1'); // added
  });

  it('tests setServerErrors function for setting multiple server-side errors', async () => {
    const initialValues = {
      username: 'testuser',
      password: 'password123',
      confirmPassword: 'password123',
    };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          {/* Form field display */}
          <div data-testid="username-field">
            <input
              data-testid="username-input"
              value={form.getValue(['username']) || ''}
              onChange={(e) => form.setValue(['username'], e.target.value)}
            />
            {form.getError(['username']).length > 0 && (
              <div data-testid="username-error">
                {form.getError(['username'])[0].message}
              </div>
            )}
          </div>

          <div data-testid="password-field">
            <input
              data-testid="password-input"
              type="password"
              value={form.getValue(['password']) || ''}
              onChange={(e) => form.setValue(['password'], e.target.value)}
            />
            {form.getError(['password']).length > 0 && (
              <div data-testid="password-error">
                {form.getError(['password'])[0].message}
              </div>
            )}
          </div>

          {/* Form-level errors */}
          <div data-testid="form-errors">
            {form.getError([]).map((error, index) => (
              <div key={index} data-testid={`form-error-${index}`}>
                {error.message}
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <button
            data-testid="set-server-errors"
            onClick={() => {
              form.setServerErrors([
                { path: [], message: 'Authentication failed' },
                { path: ['username'], message: 'Username already exists' },
                { path: ['password'], message: 'Password too weak' },
              ]);
            }}
          >
            Set Server Errors
          </button>

          <button
            data-testid="change-username"
            onClick={() => {
              form.setValue(['username'], 'newuser');
            }}
          >
            Change Username
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Initially no errors
    expect(screen.queryByTestId('form-error-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('password-error')).not.toBeInTheDocument();

    // Set server errors
    fireEvent.click(screen.getByTestId('set-server-errors'));

    await advanceTimers();

    // Verify all errors are displayed
    expect(screen.getByTestId('form-error-0')).toBeInTheDocument();
    expect(screen.getByTestId('form-error-0').textContent).toBe(
      'Authentication failed'
    );
    expect(screen.getByTestId('username-error')).toBeInTheDocument();
    expect(screen.getByTestId('username-error').textContent).toBe(
      'Username already exists'
    );
    expect(screen.getByTestId('password-error')).toBeInTheDocument();
    expect(screen.getByTestId('password-error').textContent).toBe(
      'Password too weak'
    );

    // Change a field value to verify server error is cleared for that field
    fireEvent.click(screen.getByTestId('change-username'));

    await advanceTimers();

    // Username error should be cleared because value changed
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    // Other errors should still exist
    expect(screen.getByTestId('form-error-0')).toBeInTheDocument();
    expect(screen.getByTestId('password-error')).toBeInTheDocument();
  });

  it('tests setServerError function for setting individual server errors', async () => {
    const initialValues = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          {/* Form fields */}
          <div data-testid="email-field">
            <input
              data-testid="email-input"
              value={form.getValue(['email']) || ''}
              onChange={(e) => form.setValue(['email'], e.target.value)}
            />
            {form.getError(['email']).length > 0 && (
              <div data-testid="email-error">
                {form.getError(['email'])[0].message}
              </div>
            )}
          </div>

          <div data-testid="name-field">
            <input
              data-testid="firstname-input"
              value={form.getValue(['firstName']) || ''}
              onChange={(e) => form.setValue(['firstName'], e.target.value)}
            />
            {form.getError(['firstName']).length > 0 && (
              <div data-testid="firstname-error">
                {form.getError(['firstName'])[0].message}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <button
            data-testid="set-email-error"
            onClick={() => {
              form.setServerError(['email'], 'Email already registered');
            }}
          >
            Set Email Error
          </button>

          <button
            data-testid="set-firstname-error"
            onClick={() => {
              form.setServerError(
                ['firstName'],
                'First name contains invalid characters'
              );
            }}
          >
            Set First Name Error
          </button>

          <button
            data-testid="clear-email-error"
            onClick={() => {
              form.setServerError(['email'], null);
            }}
          >
            Clear Email Error
          </button>

          <button
            data-testid="set-multiple-errors"
            onClick={() => {
              form.setServerError(
                ['email'],
                ['Email is invalid', 'Email is required']
              );
            }}
          >
            Set Multiple Email Errors
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Initially no errors
    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('firstname-error')).not.toBeInTheDocument();

    // Set email error
    fireEvent.click(screen.getByTestId('set-email-error'));

    await advanceTimers();

    expect(screen.getByTestId('email-error')).toBeInTheDocument();
    expect(screen.getByTestId('email-error').textContent).toBe(
      'Email already registered'
    );

    // Set first name error
    fireEvent.click(screen.getByTestId('set-firstname-error'));

    await advanceTimers();

    expect(screen.getByTestId('firstname-error')).toBeInTheDocument();
    expect(screen.getByTestId('firstname-error').textContent).toBe(
      'First name contains invalid characters'
    );

    // Clear email error
    fireEvent.click(screen.getByTestId('clear-email-error'));

    await advanceTimers();

    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
    // First name error should still exist
    expect(screen.getByTestId('firstname-error')).toBeInTheDocument();

    // Test multiple error messages
    fireEvent.click(screen.getByTestId('set-multiple-errors'));

    await advanceTimers();

    expect(screen.getByTestId('email-error')).toBeInTheDocument();
    expect(screen.getByTestId('email-error').textContent).toBe(
      'Email is invalid'
    );
  });

  it('tests client submission error functionality', async () => {
    const initialValues = { username: 'testuser', email: 'test@example.com' };

    const TestComponent = () => {
      const form = useFormContext();

      // Get root-level errors for displaying client submission errors
      const rootErrors = form.getError([]);

      // Track current client submission errors for testing
      const clientErrors = form.getClientSubmissionError();

      return (
        <div>
          {/* Form fields */}
          <div data-testid="form-fields">
            <input
              data-testid="username-input"
              value={form.getValue(['username']) || ''}
              onChange={(e) => form.setValue(['username'], e.target.value)}
            />

            <input
              data-testid="email-input"
              value={form.getValue(['email']) || ''}
              onChange={(e) => form.setValue(['email'], e.target.value)}
            />
          </div>

          {/* Display client submission errors */}
          {rootErrors.length > 0 &&
            rootErrors.some((e) => e.source === 'client-form-handler') && (
              <div data-testid="client-errors">
                {rootErrors
                  .filter((e) => e.source === 'client-form-handler')
                  .map((error, idx) => (
                    <div key={idx} data-testid={`client-error-${idx}`}>
                      {error.message}
                    </div>
                  ))}
              </div>
            )}

          {/* Display current client submission errors array content for direct testing */}
          <div data-testid="client-errors-count">{clientErrors.length}</div>
          {clientErrors.map((message, idx) => (
            <div key={idx} data-testid={`raw-client-error-${idx}`}>
              {message}
            </div>
          ))}

          {/* Error source tracking for testing */}
          <div data-testid="error-sources">
            {form.errors
              .filter((e) => e.source === 'client-form-handler')
              .map((e, idx) => (
                <div key={idx} data-testid={`error-${idx}-source`}>
                  {e.source}
                </div>
              ))}
          </div>

          {/* Action buttons for testing client submission error API */}
          <button
            data-testid="set-single-error"
            onClick={() => {
              form.setClientSubmissionError('Network connection failed');
            }}
          >
            Set Single Error
          </button>

          <button
            data-testid="set-multiple-errors"
            onClick={() => {
              form.setClientSubmissionError([
                'Your session has expired',
                'Please sign in again',
              ]);
            }}
          >
            Set Multiple Errors
          </button>

          <button
            data-testid="clear-errors"
            onClick={() => {
              form.clearClientSubmissionError();
            }}
          >
            Clear Errors
          </button>

          <button
            data-testid="set-null-errors"
            onClick={() => {
              form.setClientSubmissionError(null);
            }}
          >
            Set Null (Clear)
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Initially no client submission errors
    expect(screen.getByTestId('client-errors-count').textContent).toBe('0');
    expect(screen.queryByTestId('client-errors')).not.toBeInTheDocument();

    // Set a single client submission error
    fireEvent.click(screen.getByTestId('set-single-error'));

    await advanceTimers();

    // Check if the error is correctly displayed and in the array
    expect(screen.getByTestId('client-errors')).toBeInTheDocument();
    expect(screen.getByTestId('client-error-0').textContent).toBe(
      'Network connection failed'
    );
    expect(screen.getByTestId('client-errors-count').textContent).toBe('1');
    expect(screen.getByTestId('raw-client-error-0').textContent).toBe(
      'Network connection failed'
    );

    // Verify error source is correctly set
    expect(screen.getByTestId('error-0-source').textContent).toBe(
      'client-form-handler'
    );

    // Clear client submission errors
    fireEvent.click(screen.getByTestId('clear-errors'));

    await advanceTimers();

    // Verify errors are cleared
    expect(screen.queryByTestId('client-errors')).not.toBeInTheDocument();
    expect(screen.getByTestId('client-errors-count').textContent).toBe('0');

    // Set multiple client submission errors
    fireEvent.click(screen.getByTestId('set-multiple-errors'));

    await advanceTimers();

    // Verify multiple errors are displayed
    expect(screen.getByTestId('client-errors')).toBeInTheDocument();
    expect(screen.getByTestId('client-error-0').textContent).toBe(
      'Your session has expired'
    );
    expect(screen.getByTestId('client-error-1').textContent).toBe(
      'Please sign in again'
    );
    expect(screen.getByTestId('client-errors-count').textContent).toBe('2');
    expect(screen.getByTestId('raw-client-error-0').textContent).toBe(
      'Your session has expired'
    );
    expect(screen.getByTestId('raw-client-error-1').textContent).toBe(
      'Please sign in again'
    );

    // Test clearing via null
    fireEvent.click(screen.getByTestId('set-null-errors'));

    await advanceTimers();

    // Verify errors are cleared
    expect(screen.queryByTestId('client-errors')).not.toBeInTheDocument();
    expect(screen.getByTestId('client-errors-count').textContent).toBe('0');
  });

  it('tests that client submission errors are automatically cleared on submit', async () => {
    const initialValues = { username: 'testuser' };
    const onSubmit = jest.fn();

    const TestComponent = () => {
      const form = useFormContext();

      // Get client errors
      const clientErrors = form.getClientSubmissionError();

      return (
        <div>
          <input
            data-testid="username-input"
            value={form.getValue(['username']) || ''}
            onChange={(e) => form.setValue(['username'], e.target.value)}
          />

          {/* Display client submission errors count for testing */}
          <div data-testid="client-errors-count">{clientErrors.length}</div>

          {/* Display all client submission errors */}
          {clientErrors.length > 0 && (
            <div data-testid="client-errors">
              {clientErrors.map((message, idx) => (
                <div key={idx} data-testid={`client-error-${idx}`}>
                  {message}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <button
            data-testid="set-client-error"
            onClick={() => {
              form.setClientSubmissionError('Authentication failed');
            }}
          >
            Set Client Error
          </button>

          <button data-testid="submit-button" onClick={form.submit}>
            Submit
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues} onSubmit={onSubmit}>
        <TestComponent />
      </TestForm>
    );

    // Set a client submission error
    fireEvent.click(screen.getByTestId('set-client-error'));

    await advanceTimers();

    // Verify error is set
    expect(screen.getByTestId('client-errors-count').textContent).toBe('1');
    expect(screen.getByTestId('client-errors')).toBeInTheDocument();
    expect(screen.getByTestId('client-error-0').textContent).toBe(
      'Authentication failed'
    );

    // Submit the form - this should clear client submission errors
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });

    await advanceTimers();

    // Verify client submission errors are cleared after submit
    expect(screen.getByTestId('client-errors-count').textContent).toBe('0');
    expect(screen.queryByTestId('client-errors')).not.toBeInTheDocument();

    // Verify that onSubmit was called
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('tests getErrorPaths correctly returns error paths with filtering', async () => {
    // Create a schema with multiple validation points across a complex structure
    const schema = z.object({
      user: z.object({
        name: z.string().min(1, 'Name is required'),
        contact: z.object({
          email: z.email('Invalid email format'),
          phone: z.string().min(10, 'Phone number is too short'),
        }),
      }),
      preferences: z.object({
        notifications: z.boolean(),
        theme: z.enum(['light', 'dark', 'system'], {
          error: () => 'Invalid theme',
        }),
      }),
      addresses: z
        .array(
          z.object({
            street: z.string().min(1, 'Street is required'),
            city: z.string().min(1, 'City is required'),
            zipCode: z.string().min(5, 'Invalid zip code'),
          })
        )
        .min(1, 'At least one address is required'),
    });

    // Create initial values with validation errors
    const initialValues = {
      user: {
        name: '', // Error
        contact: {
          email: 'not-an-email', // Error
          phone: '123', // Error
        },
      },
      preferences: {
        notifications: true,
        theme: 'custom', // Error
      },
      addresses: [
        {
          street: '123 Main St',
          city: '', // Error
          zipCode: '123', // Error
        },
      ],
    };

    // Component to test getErrorPaths function
    const TestComponent = () => {
      const form = useFormContext();

      // Get error paths with different base paths for testing
      const allErrorPaths = form.getErrorPaths();
      const userErrorPaths = form.getErrorPaths(['user']);
      const contactErrorPaths = form.getErrorPaths(['user', 'contact']);
      const addressesErrorPaths = form.getErrorPaths(['addresses']);
      const address0ErrorPaths = form.getErrorPaths(['addresses', 0]);

      return (
        <div>
          {/* Display all error paths */}
          <div data-testid="all-errors">
            {allErrorPaths.map((path, idx) => (
              <div key={idx} data-testid={`all-error-${idx}`}>
                {path.join('.')}
              </div>
            ))}
          </div>

          {/* Display user error paths */}
          <div data-testid="user-errors">
            {userErrorPaths.map((path, idx) => (
              <div key={idx} data-testid={`user-error-${idx}`}>
                {path.join('.')}
              </div>
            ))}
          </div>

          {/* Display contact error paths */}
          <div data-testid="contact-errors">
            {contactErrorPaths.map((path, idx) => (
              <div key={idx} data-testid={`contact-error-${idx}`}>
                {path.join('.')}
              </div>
            ))}
          </div>

          {/* Display addresses error paths */}
          <div data-testid="addresses-errors">
            {addressesErrorPaths.map((path, idx) => (
              <div key={idx} data-testid={`addresses-error-${idx}`}>
                {path.join('.')}
              </div>
            ))}
          </div>

          {/* Display address[0] error paths */}
          <div data-testid="address0-errors">
            {address0ErrorPaths.map((path, idx) => (
              <div key={idx} data-testid={`address0-error-${idx}`}>
                {path.join('.')}
              </div>
            ))}
          </div>

          {/* Add button to trigger form validation */}
          <button
            data-testid="validate-button"
            onClick={() => form.validate(true)}
          >
            Validate
          </button>
        </div>
      );
    };

    render(
      <TestForm
        initialValues={initialValues}
        schema={schema}
        validateOnMount={false}
      >
        <TestComponent />
      </TestForm>
    );

    // Trigger validation
    fireEvent.click(screen.getByTestId('validate-button'));
    await advanceTimers();

    // Helper function to get all error paths for a specific category
    const getErrorTexts = (category: string, count: number) => {
      return Array.from(
        { length: count },
        (_, i) => screen.getByTestId(`${category}-error-${i}`).textContent
      );
    };

    // Check all error paths
    const allErrors = getErrorTexts('all', 6); // We expect 6 validation errors total

    // Verify that all expected error paths are present
    expect(allErrors).toContain('user.name');
    expect(allErrors).toContain('user.contact.email');
    expect(allErrors).toContain('user.contact.phone');
    expect(allErrors).toContain('preferences.theme');
    expect(allErrors).toContain('addresses.0.city');
    expect(allErrors).toContain('addresses.0.zipCode');

    // Check user error paths
    const userErrors = getErrorTexts('user', 3); // name, contact.email, contact.phone
    expect(userErrors).toContain('user.name');
    expect(userErrors).toContain('user.contact.email');
    expect(userErrors).toContain('user.contact.phone');
    expect(userErrors).not.toContain('preferences.theme'); // Should not include preferences

    // Check contact error paths
    const contactErrors = getErrorTexts('contact', 2); // email, phone
    expect(contactErrors).toContain('user.contact.email');
    expect(contactErrors).toContain('user.contact.phone');
    expect(contactErrors).not.toContain('user.name'); // Should not include parent field

    // Check addresses error paths
    const addressesErrors = getErrorTexts('addresses', 2); // city, zipCode
    expect(addressesErrors).toContain('addresses.0.city');
    expect(addressesErrors).toContain('addresses.0.zipCode');

    // Check address[0] error paths
    const address0Errors = getErrorTexts('address0', 2); // city, zipCode for address[0]
    expect(address0Errors).toContain('addresses.0.city');
    expect(address0Errors).toContain('addresses.0.zipCode');

    // Verify the counts
    expect(allErrors.length).toBe(6);
    expect(userErrors.length).toBe(3);
    expect(contactErrors.length).toBe(2);
    expect(addressesErrors.length).toBe(2);
    expect(address0Errors.length).toBe(2);
  });

  it('getFieldState returns errors, touched and invalid for a field', async () => {
    const schema = z.object({
      username: z.string().min(3, 'Username must be at least 3 characters'),
      email: z.email('Invalid email format'),
    });

    const TestComponent = () => {
      const form = useFormContext();
      const state = form.getFieldState(['username']);
      const emailState = form.getFieldState(['email']);
      return (
        <div>
          <input
            data-testid="username-input"
            onChange={(e) => form.setValue(['username'], e.target.value)}
            onBlur={() => form.handleBlur(['username'])}
          />
          <span data-testid="u-error">{state.error ?? 'none'}</span>
          <span data-testid="u-touched">
            {state.isTouched ? 'touched' : 'untouched'}
          </span>
          <span data-testid="u-invalid">
            {state.invalid ? 'invalid' : 'valid'}
          </span>
          <span data-testid="u-count">{state.errors.length}</span>
          <span data-testid="u-exists">
            {state.exists ? 'exists' : 'missing'}
          </span>
          {/* email is never edited: stays untouched + valid (no error yet) */}
          <span data-testid="e-touched">
            {emailState.isTouched ? 'touched' : 'untouched'}
          </span>
          <span data-testid="e-invalid">
            {emailState.invalid ? 'invalid' : 'valid'}
          </span>
        </div>
      );
    };

    render(
      <TestForm schema={schema} validateOnMount={false}>
        <TestComponent />
      </TestForm>
    );

    // Initially: no validation has run, nothing touched, and the field isn't in
    // values yet (no initialValues), so exists is false.
    expect(screen.getByTestId('u-error').textContent).toBe('none');
    expect(screen.getByTestId('u-touched').textContent).toBe('untouched');
    expect(screen.getByTestId('u-invalid').textContent).toBe('valid');
    expect(screen.getByTestId('u-count').textContent).toBe('0');
    expect(screen.getByTestId('u-exists').textContent).toBe('missing');

    // Type an invalid value and blur -> field becomes touched + invalid, error set.
    fireEvent.change(screen.getByTestId('username-input'), {
      target: { value: 'ab' },
    });
    fireEvent.blur(screen.getByTestId('username-input'));
    await advanceTimers();

    expect(screen.getByTestId('u-touched').textContent).toBe('touched');
    expect(screen.getByTestId('u-invalid').textContent).toBe('invalid');
    expect(screen.getByTestId('u-error').textContent).toBe(
      'Username must be at least 3 characters'
    );
    expect(screen.getByTestId('u-count').textContent).toBe('1');
    // setValue put the field into values, so exists is now true.
    expect(screen.getByTestId('u-exists').textContent).toBe('exists');

    // email was never touched, but whole-form validation produced an error for it
    // (it's empty/required). getFieldState reports it as invalid anyway: invalid is
    // raw error presence, NOT touched-gated.
    expect(screen.getByTestId('e-touched').textContent).toBe('untouched');
    expect(screen.getByTestId('e-invalid').textContent).toBe('invalid');

    // Fix the value -> error clears, field stays touched but becomes valid.
    fireEvent.change(screen.getByTestId('username-input'), {
      target: { value: 'abcd' },
    });
    await advanceTimers();

    expect(screen.getByTestId('u-touched').textContent).toBe('touched');
    expect(screen.getByTestId('u-invalid').textContent).toBe('valid');
    expect(screen.getByTestId('u-error').textContent).toBe('none');
    expect(screen.getByTestId('u-count').textContent).toBe('0');
  });

  it('getFieldState reports invalid regardless of touched state (raw errors)', async () => {
    const schema = z.object({
      username: z.string().min(3, 'Username must be at least 3 characters'),
    });

    const TestComponent = () => {
      const form = useFormContext();
      const state = form.getFieldState(['username']);
      return (
        <div>
          <span data-testid="invalid">
            {state.invalid ? 'invalid' : 'valid'}
          </span>
          <span data-testid="touched">
            {state.isTouched ? 'touched' : 'untouched'}
          </span>
          <span data-testid="error">{state.error ?? 'none'}</span>
          <button
            data-testid="set-server-error"
            onClick={() => form.setServerError(['username'], 'Already taken')}
          >
            Set server error
          </button>
        </div>
      );
    };

    render(
      <TestForm
        schema={schema}
        initialValues={{ username: 'abcd' }}
        validateOnMount={false}
      >
        <TestComponent />
      </TestForm>
    );

    // A server error is set on a field the user never touched. getFieldState
    // surfaces it (invalid + error message) without requiring touched — it is not
    // gated on touched, unlike useField's display error.
    fireEvent.click(screen.getByTestId('set-server-error'));
    await advanceTimers();

    expect(screen.getByTestId('invalid').textContent).toBe('invalid');
    expect(screen.getByTestId('touched').textContent).toBe('untouched');
    expect(screen.getByTestId('error').textContent).toBe('Already taken');
  });

  it('getFieldState returns a clean snapshot for a non-existent field', async () => {
    const schema = z.object({
      username: z.string().min(3, 'Username must be at least 3 characters'),
    });

    const TestComponent = () => {
      const form = useFormContext();
      // A path that isn't in values or the schema: should not throw, just read
      // as untouched / no errors / valid (same as getError + touched lookups),
      // and exists === false to mark it as missing.
      const state = form.getFieldState(['does', 'not', 'exist']);
      return (
        <div>
          <span data-testid="error">{state.error ?? 'none'}</span>
          <span data-testid="touched">
            {state.isTouched ? 'touched' : 'untouched'}
          </span>
          <span data-testid="invalid">
            {state.invalid ? 'invalid' : 'valid'}
          </span>
          <span data-testid="count">{state.errors.length}</span>
          <span data-testid="exists">
            {state.exists ? 'exists' : 'missing'}
          </span>
        </div>
      );
    };

    render(
      <TestForm schema={schema} initialValues={{ username: 'ab' }}>
        <TestComponent />
      </TestForm>
    );

    expect(screen.getByTestId('error').textContent).toBe('none');
    expect(screen.getByTestId('touched').textContent).toBe('untouched');
    expect(screen.getByTestId('invalid').textContent).toBe('valid');
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('exists').textContent).toBe('missing');
  });

  // Shared status readout for the submit-attempt flag tests.
  const SubmitStatus = () => {
    const form = useFormContext();
    return (
      <div>
        <span data-testid="attempted">
          {form.submitAttempted ? 'attempted' : 'untried'}
        </span>
        <span data-testid="succeeded">
          {form.submitSucceeded ? 'succeeded' : 'not-succeeded'}
        </span>
        <span data-testid="count">{form.submitCount}</span>
        <button data-testid="submit-button" onClick={form.submit}>
          Submit
        </button>
        <button data-testid="reset-button" onClick={() => form.reset()}>
          Reset
        </button>
      </div>
    );
  };

  it('tracks submit attempts: attempted, succeeded and count on a clean submit', async () => {
    const onSubmit = jest.fn();

    render(
      <TestForm initialValues={{ name: 'John' }} onSubmit={onSubmit}>
        <SubmitStatus />
      </TestForm>
    );

    // Initially: never attempted.
    expect(screen.getByTestId('attempted').textContent).toBe('untried');
    expect(screen.getByTestId('succeeded').textContent).toBe('not-succeeded');
    expect(screen.getByTestId('count').textContent).toBe('0');

    // First submit resolves cleanly.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });
    await advanceTimers();

    expect(screen.getByTestId('attempted').textContent).toBe('attempted');
    expect(screen.getByTestId('succeeded').textContent).toBe('succeeded');
    expect(screen.getByTestId('count').textContent).toBe('1');

    // Second submit bumps the count and stays successful.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });
    await advanceTimers();

    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('succeeded').textContent).toBe('succeeded');

    // reset() clears the attempt tracking back to "never submitted".
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-button'));
    });
    await advanceTimers();

    expect(screen.getByTestId('attempted').textContent).toBe('untried');
    expect(screen.getByTestId('succeeded').textContent).toBe('not-succeeded');
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('failed validation counts as an attempt but not a success', async () => {
    const schema = z.object({
      name: z.string().min(3, 'Name must be at least 3 characters'),
    });
    const onSubmit = jest.fn();

    render(
      <TestForm
        schema={schema}
        initialValues={{ name: 'ab' }}
        onSubmit={onSubmit}
      >
        <SubmitStatus />
      </TestForm>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });
    await advanceTimers();

    // The schema is invalid, so onSubmit never runs — but it's still an attempt.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('attempted').textContent).toBe('attempted');
    expect(screen.getByTestId('succeeded').textContent).toBe('not-succeeded');
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('a handler that reports a submission error is not counted as a success', async () => {
    // onSubmit resolves without throwing, but reports a server error — so the
    // attempt did not succeed even though no exception was raised.
    const onSubmit = jest.fn(async (_values, helpers) => {
      helpers.setServerError(['name'], 'Name already taken');
    });

    render(
      <TestForm initialValues={{ name: 'John' }} onSubmit={onSubmit}>
        <SubmitStatus />
      </TestForm>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });
    await advanceTimers();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('attempted').textContent).toBe('attempted');
    expect(screen.getByTestId('succeeded').textContent).toBe('not-succeeded');
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('a handler that sets a manual error via helpers.setError is not a success', async () => {
    // onSubmit resolves cleanly but flags a field with a client-side check —
    // setting a manual error counts as a failed attempt, same as a server error.
    const onSubmit = jest.fn(async (_values, helpers) => {
      helpers.setError(['name'], 'That name is reserved');
    });

    const ErrorView = () => {
      const form = useFormContext();
      const errs = form.getError(['name']);
      return (
        <div>
          <span data-testid="name-error">{errs[0]?.message ?? 'none'}</span>
          <span data-testid="name-source">{errs[0]?.source ?? 'none'}</span>
        </div>
      );
    };

    render(
      <TestForm initialValues={{ name: 'John' }} onSubmit={onSubmit}>
        <SubmitStatus />
        <ErrorView />
      </TestForm>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });
    await advanceTimers();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('attempted').textContent).toBe('attempted');
    expect(screen.getByTestId('succeeded').textContent).toBe('not-succeeded');
    // The manual error set by the handler persisted past submit.
    expect(screen.getByTestId('name-error').textContent).toBe(
      'That name is reserved'
    );
    expect(screen.getByTestId('name-source').textContent).toBe('manual');
  });

  it('a handler that rejects via raw setErrors (server source) is not a success', async () => {
    // setErrors is the low-level whole-list overwrite, but the failure flag keys
    // off the error `source`, not the setter — so a server-sourced error set this
    // way still marks the attempt as failed, just like setServerError would.
    const onSubmit = jest.fn(async (_values, helpers) => {
      helpers.setErrors([
        { path: ['name'], message: 'Name already taken', source: 'server' },
      ]);
    });

    render(
      <TestForm initialValues={{ name: 'John' }} onSubmit={onSubmit}>
        <SubmitStatus />
      </TestForm>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });
    await advanceTimers();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('attempted').textContent).toBe('attempted');
    expect(screen.getByTestId('succeeded').textContent).toBe('not-succeeded');
  });

  it('a handler that sets only client-sourced errors via setErrors still succeeds', async () => {
    // Boundary: a 'client' (or untagged) error is an ordinary validation-style
    // entry, not a submission rejection, so it does NOT flag a failed attempt.
    const onSubmit = jest.fn(async (_values, helpers) => {
      helpers.setErrors([
        { path: ['name'], message: 'looks off', source: 'client' },
      ]);
    });

    render(
      <TestForm initialValues={{ name: 'John' }} onSubmit={onSubmit}>
        <SubmitStatus />
      </TestForm>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });
    await advanceTimers();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('attempted').textContent).toBe('attempted');
    expect(screen.getByTestId('succeeded').textContent).toBe('succeeded');
  });

  it('a handler that throws is an attempt but not a success', async () => {
    const onSubmit = jest.fn(() => {
      throw new Error('boom');
    });

    render(
      <TestForm initialValues={{ name: 'John' }} onSubmit={onSubmit}>
        <SubmitStatus />
      </TestForm>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });
    await advanceTimers();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('attempted').textContent).toBe('attempted');
    expect(screen.getByTestId('succeeded').textContent).toBe('not-succeeded');
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('setError sets a manual error that survives validation and clears on edit', async () => {
    const schema = z.object({
      username: z.string().min(3, 'Username must be at least 3 characters'),
    });

    const TestComponent = () => {
      const form = useFormContext();
      const errs = form.getError(['username']);
      return (
        <div>
          <span data-testid="msg">{errs[0]?.message ?? 'none'}</span>
          <span data-testid="source">{errs[0]?.source ?? 'none'}</span>
          <input
            data-testid="input"
            onChange={(e) => form.setValue(['username'], e.target.value)}
          />
          <button
            data-testid="set"
            onClick={() => form.setError(['username'], 'Already taken')}
          >
            Set
          </button>
          <button
            data-testid="clear"
            onClick={() => form.setError(['username'], null)}
          >
            Clear
          </button>
          <button data-testid="validate" onClick={() => form.validate(true)}>
            Validate
          </button>
        </div>
      );
    };

    render(
      <TestForm schema={schema} initialValues={{ username: 'abcd' }}>
        <TestComponent />
      </TestForm>
    );

    // Set a manual error — tagged source 'manual'.
    fireEvent.click(screen.getByTestId('set'));
    await advanceTimers();
    expect(screen.getByTestId('msg').textContent).toBe('Already taken');
    expect(screen.getByTestId('source').textContent).toBe('manual');

    // It survives a full re-validation (username 'abcd' is schema-valid, so Zod
    // adds nothing, and the merge preserves the manual error).
    fireEvent.click(screen.getByTestId('validate'));
    await advanceTimers();
    expect(screen.getByTestId('msg').textContent).toBe('Already taken');
    expect(screen.getByTestId('source').textContent).toBe('manual');

    // Editing the field clears it (setValue drops errors at the path).
    fireEvent.change(screen.getByTestId('input'), {
      target: { value: 'abcde' },
    });
    await advanceTimers();
    expect(screen.getByTestId('msg').textContent).toBe('none');

    // Set again, then clear explicitly with null.
    fireEvent.click(screen.getByTestId('set'));
    await advanceTimers();
    expect(screen.getByTestId('msg').textContent).toBe('Already taken');
    fireEvent.click(screen.getByTestId('clear'));
    await advanceTimers();
    expect(screen.getByTestId('msg').textContent).toBe('none');
  });

  it('setError accepts multiple messages and is cleared by reset', async () => {
    const TestComponent = () => {
      const form = useFormContext();
      const errs = form.getError(['code']);
      return (
        <div>
          <span data-testid="count">{errs.length}</span>
          <span data-testid="first">{errs[0]?.message ?? 'none'}</span>
          <button
            data-testid="set"
            onClick={() =>
              form.setError(['code'], ['Too short', 'Already used'])
            }
          >
            Set
          </button>
          <button data-testid="reset" onClick={() => form.reset()}>
            Reset
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={{ code: 'x' }}>
        <TestComponent />
      </TestForm>
    );

    fireEvent.click(screen.getByTestId('set'));
    await advanceTimers();
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('first').textContent).toBe('Too short');

    fireEvent.click(screen.getByTestId('reset'));
    await advanceTimers();
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('setError supports a form-level error at the root path', async () => {
    const TestComponent = () => {
      const form = useFormContext();
      const rootErrors = form.getError([]);
      return (
        <div>
          <span data-testid="root-count">{rootErrors.length}</span>
          <span data-testid="root-msg">{rootErrors[0]?.message ?? 'none'}</span>
          <button
            data-testid="set-root"
            onClick={() => form.setError([], 'This form has a problem')}
          >
            Set root
          </button>
          <button
            data-testid="clear-root"
            onClick={() => form.setError([], null)}
          >
            Clear root
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={{ name: 'x' }}>
        <TestComponent />
      </TestForm>
    );

    fireEvent.click(screen.getByTestId('set-root'));
    await advanceTimers();
    expect(screen.getByTestId('root-count').textContent).toBe('1');
    expect(screen.getByTestId('root-msg').textContent).toBe(
      'This form has a problem'
    );

    fireEvent.click(screen.getByTestId('clear-root'));
    await advanceTimers();
    expect(screen.getByTestId('root-count').textContent).toBe('0');
  });

  it('useField surfaces a manual error even when the field is untouched', async () => {
    const FieldView = ({ name }: { name: string }) => {
      const field = useField([name]);
      return <span data-testid={`error-${name}`}>{field.error ?? 'none'}</span>;
    };
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="set"
          onClick={() => form.setError(['nickname'], 'That one is reserved')}
        >
          Set
        </button>
      );
    };

    render(
      <TestForm initialValues={{ nickname: 'ada' }}>
        <FieldView name="nickname" />
        <Controls />
      </TestForm>
    );

    // Untouched field shows nothing yet.
    expect(screen.getByTestId('error-nickname').textContent).toBe('none');

    // A manual error shows immediately, without the field being touched.
    fireEvent.click(screen.getByTestId('set'));
    await advanceTimers();
    expect(screen.getByTestId('error-nickname').textContent).toBe(
      'That one is reserved'
    );
  });

  it('editing one field live-updates a cross-field (.refine) error on a touched sibling', async () => {
    const schema = z
      .object({ password: z.string(), confirm: z.string() })
      .refine((d) => d.password === d.confirm, {
        path: ['confirm'],
        message: 'must match',
      });

    const TestComponent = () => {
      const form = useFormContext();
      const pw = useField(['password']);
      const confirm = useField(['confirm']);
      return (
        <div>
          <input
            data-testid="pw"
            value={(pw.value as string) ?? ''}
            onChange={(e) => pw.setValue(e.target.value)}
          />
          <span data-testid="confirm-err">
            {(confirm.error as string) ?? 'none'}
          </span>
          <button
            data-testid="touch-confirm"
            onClick={() => form.handleBlur(['confirm'])}
          >
            touch confirm
          </button>
        </div>
      );
    };

    render(
      <TestForm
        schema={schema as unknown as z.ZodType<Record<string, unknown>>}
        initialValues={{ password: 'secret', confirm: 'secret' }}
      >
        <TestComponent />
      </TestForm>
    );

    // confirm is touched and currently matches -> no error.
    fireEvent.click(screen.getByTestId('touch-confirm'));
    await advanceTimers();
    expect(screen.getByTestId('confirm-err').textContent).toBe('none');

    // Editing PASSWORD (not confirm) now makes them mismatch. The cross-field
    // error lives on `confirm`, which is touched, so it surfaces live.
    fireEvent.change(screen.getByTestId('pw'), {
      target: { value: 'changed' },
    });
    await advanceTimers();
    expect(screen.getByTestId('confirm-err').textContent).toBe('must match');

    // Fixing password back clears confirm's error live too.
    fireEvent.change(screen.getByTestId('pw'), {
      target: { value: 'secret' },
    });
    await advanceTimers();
    expect(screen.getByTestId('confirm-err').textContent).toBe('none');
  });

  it('a cross-field error stays hidden on an UNtouched sibling (touch-gated)', async () => {
    const schema = z
      .object({ password: z.string(), confirm: z.string() })
      .refine((d) => d.password === d.confirm, {
        path: ['confirm'],
        message: 'must match',
      });

    const TestComponent = () => {
      const pw = useField(['password']);
      const confirm = useField(['confirm']);
      return (
        <div>
          <input
            data-testid="pw"
            value={(pw.value as string) ?? ''}
            onChange={(e) => pw.setValue(e.target.value)}
          />
          <span data-testid="confirm-err">
            {(confirm.error as string) ?? 'none'}
          </span>
        </div>
      );
    };

    render(
      <TestForm
        schema={schema as unknown as z.ZodType<Record<string, unknown>>}
        initialValues={{ password: 'secret', confirm: 'secret' }}
      >
        <TestComponent />
      </TestForm>
    );

    // confirm is never touched: even though editing password makes the form
    // invalid, confirm's error stays hidden (display is touch-gated).
    fireEvent.change(screen.getByTestId('pw'), {
      target: { value: 'changed' },
    });
    await advanceTimers();
    expect(screen.getByTestId('confirm-err').textContent).toBe('none');
  });

  it('deleteField live-updates a cross-field (.refine) error on a sibling', async () => {
    // The refine lands its error on `minCount`, but depends on `items.length`.
    // Removing an array item must refresh that sibling error — deleteField now
    // recomputes the whole schema like setValue, not just errors under the path.
    const schema = z
      .object({ items: z.array(z.string()), minCount: z.string() })
      .refine((d) => d.items.length >= 2, {
        path: ['minCount'],
        message: 'need 2+',
      });

    const TestComponent = () => {
      const form = useFormContext();
      // Raw read (not touch-gated) so we assert the underlying error list refreshes.
      const minCountErr = form.getError(['minCount'])[0]?.message ?? 'none';
      return (
        <div>
          <span data-testid="min-err">{minCountErr}</span>
          <button
            data-testid="del-item"
            onClick={() => form.deleteField(['items', 0])}
          >
            delete item 0
          </button>
        </div>
      );
    };

    render(
      <TestForm
        schema={schema as unknown as z.ZodType<Record<string, unknown>>}
        initialValues={{ items: ['a', 'b'], minCount: '' }}
      >
        <TestComponent />
      </TestForm>
    );

    // Two items -> refine passes -> no sibling error.
    await advanceTimers();
    expect(screen.getByTestId('min-err').textContent).toBe('none');

    // Removing an item drops length to 1 -> the cross-field error on `minCount`
    // surfaces live, even though it's nowhere near the deleted path.
    fireEvent.click(screen.getByTestId('del-item'));
    await advanceTimers();
    expect(screen.getByTestId('min-err').textContent).toBe('need 2+');
  });

  it('validateField surfaces only that field and returns its validity', async () => {
    const schema = z.object({
      a: z.string().min(3, 'a too short'),
      b: z.string().min(3, 'b too short'),
    });

    const results: Record<string, boolean> = {};
    const TestComponent = () => {
      const form = useFormContext();
      const fa = useField(['a']);
      const fb = useField(['b']);
      return (
        <div>
          <span data-testid="a-err">{(fa.error as string) ?? 'none'}</span>
          <span data-testid="b-err">{(fb.error as string) ?? 'none'}</span>
          <button
            data-testid="vf-a"
            onClick={() => {
              results.a = form.validateField(['a']);
            }}
          >
            validate a
          </button>
          <button
            data-testid="vf-b"
            onClick={() => {
              results.b = form.validateField(['b']);
            }}
          >
            validate b
          </button>
        </div>
      );
    };

    render(
      <TestForm
        schema={schema}
        initialValues={{ a: 'x', b: 'bbb' }}
        validateOnChange={false}
      >
        <TestComponent />
      </TestForm>
    );

    // Nothing validated yet.
    expect(screen.getByTestId('a-err').textContent).toBe('none');
    expect(screen.getByTestId('b-err').textContent).toBe('none');

    // Validate only `a` (invalid): its error surfaces, returns false, and `b`
    // stays quiet even though the whole schema ran.
    fireEvent.click(screen.getByTestId('vf-a'));
    await advanceTimers();
    expect(results.a).toBe(false);
    expect(screen.getByTestId('a-err').textContent).toBe('a too short');
    expect(screen.getByTestId('b-err').textContent).toBe('none');

    // Validate `b` (valid): returns true, no error surfaces.
    fireEvent.click(screen.getByTestId('vf-b'));
    await advanceTimers();
    expect(results.b).toBe(true);
    expect(screen.getByTestId('b-err').textContent).toBe('none');
  });

  it('validateField keeps canSubmit in sync with whole-form validity', async () => {
    const schema = z.object({ a: z.string().min(3, 'a too short') });

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <span data-testid="can-submit">{form.canSubmit ? 'yes' : 'no'}</span>
          <button data-testid="vf" onClick={() => form.validateField(['a'])}>
            validate
          </button>
        </div>
      );
    };

    render(
      <TestForm
        schema={schema}
        initialValues={{ a: 'abc' }}
        validateOnChange={false}
      >
        <TestComponent />
      </TestForm>
    );

    // No validation has run yet, so canSubmit starts false.
    expect(screen.getByTestId('can-submit').textContent).toBe('no');

    // validateField runs the full schema (valid), so canSubmit must flip true —
    // not stay stale.
    fireEvent.click(screen.getByTestId('vf'));
    await advanceTimers();
    expect(screen.getByTestId('can-submit').textContent).toBe('yes');
  });

  it('validateField runs regardless of the validateOnBlur prop', async () => {
    const schema = z.object({ a: z.string().min(3, 'a too short') });

    const out: { result?: boolean } = {};
    const TestComponent = () => {
      const form = useFormContext();
      const fa = useField(['a']);
      return (
        <div>
          <span data-testid="a-err">{(fa.error as string) ?? 'none'}</span>
          <button data-testid="blur" onClick={() => form.handleBlur(['a'])}>
            blur
          </button>
          <button
            data-testid="vf"
            onClick={() => {
              out.result = form.validateField(['a']);
            }}
          >
            validate
          </button>
        </div>
      );
    };

    render(
      <FormProvider
        initialValues={{ a: 'x' }}
        schema={schema}
        onSubmit={jest.fn()}
        validateOnBlur={false}
        validateOnChange={false}
      >
        <TestComponent />
      </FormProvider>
    );

    // handleBlur with validateOnBlur=false only marks touched — no error surfaces.
    fireEvent.click(screen.getByTestId('blur'));
    await advanceTimers();
    expect(screen.getByTestId('a-err').textContent).toBe('none');

    // validateField is not gated on validateOnBlur: it validates and surfaces.
    fireEvent.click(screen.getByTestId('vf'));
    await advanceTimers();
    expect(out.result).toBe(false);
    expect(screen.getByTestId('a-err').textContent).toBe('a too short');
  });

  it('tests validate function with and without force parameter', async () => {
    const schema = z.object({
      username: z.string().min(3, 'Username must be at least 3 characters'),
      email: z.email('Invalid email format'),
      age: z.number().min(18, 'Must be at least 18 years old'),
    });

    const initialValues = {
      username: 'ab', // Invalid: too short
      email: 'not-an-email', // Invalid: not an email
      age: 16, // Invalid: too young
    };

    const TestComponent = () => {
      const form = useFormContext();
      const [validationResult, setValidationResult] =
        React.useState<string>('Not validated yet');

      return (
        <div>
          {/* Input fields */}
          <div data-testid="username-field">
            <input
              data-testid="username-input"
              value={form.getValue(['username']) || ''}
              onChange={(e) => form.setValue(['username'], e.target.value)}
            />
            {form.getError(['username']).length > 0 && (
              <div data-testid="username-error">
                {form.getError(['username'])[0].message}
              </div>
            )}
          </div>

          <div data-testid="email-field">
            <input
              data-testid="email-input"
              value={form.getValue(['email']) || ''}
              onChange={(e) => form.setValue(['email'], e.target.value)}
            />
            {form.getError(['email']).length > 0 && (
              <div data-testid="email-error">
                {form.getError(['email'])[0].message}
              </div>
            )}
          </div>

          <div data-testid="age-field">
            <input
              data-testid="age-input"
              type="number"
              value={
                form.getValue(['age']) !== undefined
                  ? String(form.getValue(['age']))
                  : ''
              }
              onChange={(e) => form.setValue(['age'], Number(e.target.value))}
            />
            {form.getError(['age']).length > 0 && (
              <div data-testid="age-error">
                {form.getError(['age'])[0].message}
              </div>
            )}
          </div>

          {/* Display validation result */}
          <div data-testid="validation-result">{validationResult}</div>

          {/* Action buttons */}
          <button
            data-testid="validate-without-force"
            onClick={() => {
              const result = form.validate();
              setValidationResult(`Validate without force: ${result}`);
            }}
          >
            Validate Without Force
          </button>

          <button
            data-testid="validate-with-force"
            onClick={() => {
              const result = form.validate(true);
              setValidationResult(`Validate with force: ${result}`);
            }}
          >
            Validate With Force
          </button>

          <button
            data-testid="fix-username"
            onClick={() => {
              form.setValue(['username'], 'validusername');
            }}
          >
            Fix Username
          </button>

          <button
            data-testid="fix-all-fields"
            onClick={() => {
              form.setValue(['username'], 'validusername');
              form.setValue(['email'], 'valid@example.com');
              form.setValue(['age'], 21);
            }}
          >
            Fix All Fields
          </button>
        </div>
      );
    };

    // Test with validateOnChange=false to better control when validation occurs
    render(
      <TestForm
        initialValues={initialValues}
        schema={schema}
        validateOnMount={false}
        validateOnChange={false}
      >
        <TestComponent />
      </TestForm>
    );

    // Initially, no errors should be shown since validateOnMount is false
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('age-error')).not.toBeInTheDocument();

    // Test validate without force - initially this might not validate
    // because the form is considered "untouched"
    fireEvent.click(screen.getByTestId('validate-without-force'));

    await advanceTimers();

    // Check result - it should return false because validation failed
    expect(screen.getByTestId('validation-result').textContent).toContain(
      'Validate without force: false'
    );

    // Errors might not be shown if the fields haven't been "touched"
    // Let's now validate with force
    fireEvent.click(screen.getByTestId('validate-with-force'));

    await advanceTimers();

    // Check result again - should still be false
    expect(screen.getByTestId('validation-result').textContent).toContain(
      'Validate with force: false'
    );

    // Now errors should definitely be shown because of force validation
    expect(screen.getByTestId('username-error')).toBeInTheDocument();
    expect(screen.getByTestId('email-error')).toBeInTheDocument();
    expect(screen.getByTestId('age-error')).toBeInTheDocument();

    // Fix one field
    fireEvent.click(screen.getByTestId('fix-username'));

    await advanceTimers();

    // Validate again with force
    fireEvent.click(screen.getByTestId('validate-with-force'));

    await advanceTimers();

    // Should still fail validation because other fields are invalid
    expect(screen.getByTestId('validation-result').textContent).toContain(
      'Validate with force: false'
    );

    // Username error should be gone, but other errors remain
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('email-error')).toBeInTheDocument();
    expect(screen.getByTestId('age-error')).toBeInTheDocument();

    // Fix all fields
    fireEvent.click(screen.getByTestId('fix-all-fields'));

    await advanceTimers();

    // Validate once more without force
    fireEvent.click(screen.getByTestId('validate-without-force'));

    await advanceTimers();

    // Now validation should pass
    expect(screen.getByTestId('validation-result').textContent).toContain(
      'Validate without force: true'
    );

    // No errors should be shown
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('age-error')).not.toBeInTheDocument();
  });

  it('validate() clears a stale cross-field client error once the form becomes valid', async () => {
    // A cross-field refine reports its error on ['confirm']. With validateOnChange
    // off, fixing the mismatch by editing ['password'] only clears ['password']'s
    // own errors — the stale ['confirm'] error survives until the next validation.
    // A standalone validate() that now passes must drop it (regression: it used to
    // leave the stale 'client' error behind because the valid branch was a no-op).
    const schema = z
      .object({
        password: z.string(),
        confirm: z.string(),
      })
      .refine((d) => d.password === d.confirm, {
        message: 'Passwords must match',
        path: ['confirm'],
      });

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="confirm-error">
            {form.getError(['confirm'])[0]?.message ?? 'none'}
          </div>
          <button
            data-testid="force-validate"
            onClick={() => form.validate(true)}
          >
            Force validate
          </button>
          <button
            data-testid="fix-password"
            onClick={() => form.setValue(['password'], 'xyz')}
          >
            Fix password
          </button>
          <button data-testid="validate" onClick={() => form.validate()}>
            Validate
          </button>
        </div>
      );
    };

    render(
      <TestForm
        initialValues={{ password: 'abc', confirm: 'xyz' }}
        schema={schema}
        validateOnMount={false}
        validateOnChange={false}
      >
        <TestComponent />
      </TestForm>
    );

    // Surface the mismatch error on ['confirm'].
    fireEvent.click(screen.getByTestId('force-validate'));
    await advanceTimers();
    expect(screen.getByTestId('confirm-error').textContent).toBe(
      'Passwords must match'
    );

    // Make the two fields match by editing ['password']. With validateOnChange off,
    // this clears only ['password']'s errors and leaves ['confirm']'s stale one.
    fireEvent.click(screen.getByTestId('fix-password'));
    await advanceTimers();
    expect(screen.getByTestId('confirm-error').textContent).toBe(
      'Passwords must match'
    );

    // A standalone validate() now passes and must clear the stale client error.
    fireEvent.click(screen.getByTestId('validate'));
    await advanceTimers();
    expect(screen.getByTestId('confirm-error').textContent).toBe('none');
  });

  it('handles errors thrown in onSubmit by setting them as client submission errors', async () => {
    const initialValues = { username: 'testuser' };
    const errorMessage = 'Test submission error';

    // Create an onSubmit handler that throws an error
    const onSubmit = jest.fn().mockImplementation(() => {
      throw new Error(errorMessage);
    });

    const TestComponent = () => {
      const form = useFormContext();
      // Get form-level errors (root errors with empty path)
      const rootErrors = form.getError([]);

      return (
        <div>
          <input
            data-testid="username-input"
            value={form.getValue(['username']) || ''}
            onChange={(e) => form.setValue(['username'], e.target.value)}
          />
          <button data-testid="submit-button" onClick={form.submit}>
            Submit
          </button>

          {/* Display root errors if any */}
          {rootErrors.length > 0 && (
            <div data-testid="root-error">{rootErrors[0].message}</div>
          )}

          <div data-testid="error-source">
            {rootErrors.length > 0 ? rootErrors[0].source : 'none'}
          </div>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues} onSubmit={onSubmit}>
        <TestComponent />
      </TestForm>
    );

    // Initially no errors
    expect(screen.queryByTestId('root-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('error-source').textContent).toBe('none');

    // Submit the form - Wrap in act
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });

    await advanceTimers();

    // Verify the error was caught and set as a client submission error
    expect(screen.getByTestId('root-error')).toBeInTheDocument();
    expect(screen.getByTestId('root-error').textContent).toBe(errorMessage);
    expect(screen.getByTestId('error-source').textContent).toBe(
      'client-form-handler'
    );

    // Verify onSubmit was called
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('handles rejected promises in onSubmit by setting them as client submission errors', async () => {
    const initialValues = { username: 'testuser' };
    const errorMessage = 'Async submission error';

    // Create an onSubmit handler that returns a rejected promise
    const onSubmit = jest.fn().mockImplementation(() => {
      return Promise.reject(new Error(errorMessage));
    });

    const TestComponent = () => {
      const form = useFormContext();
      // Get form-level errors (root errors with empty path)
      const rootErrors = form.getError([]);

      return (
        <div>
          <input
            data-testid="username-input"
            value={form.getValue(['username']) || ''}
            onChange={(e) => form.setValue(['username'], e.target.value)}
          />
          <button data-testid="submit-button" onClick={form.submit}>
            Submit
          </button>

          {/* Display root errors if any */}
          {rootErrors.length > 0 && (
            <div data-testid="root-error">{rootErrors[0].message}</div>
          )}

          <div data-testid="error-source">
            {rootErrors.length > 0 ? rootErrors[0].source : 'none'}
          </div>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues} onSubmit={onSubmit}>
        <TestComponent />
      </TestForm>
    );

    // Initially no errors
    expect(screen.queryByTestId('root-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('error-source').textContent).toBe('none');

    // Submit the form - Wrap in act
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });

    await advanceTimers();

    // Verify the error was caught and set as a client submission error
    expect(screen.getByTestId('root-error')).toBeInTheDocument();
    expect(screen.getByTestId('root-error').textContent).toBe(errorMessage);
    expect(screen.getByTestId('error-source').textContent).toBe(
      'client-form-handler'
    );

    // Verify onSubmit was called
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('validates form on mount when validateOnMount is true', async () => {
    // Schema with validation rules
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      email: z.email('Invalid email format'),
    });

    // Initial values that will fail validation
    const initialValues = { name: '', email: 'not-an-email' };

    render(
      <TestForm
        initialValues={initialValues}
        schema={schema}
        validateOnMount={true}
      >
        <TestField name="name" />
        <TestField name="email" />
      </TestForm>
    );

    // Explicitly wrap the timer advancement and promise resolution
    await act(async () => {
      await advanceTimers();
    });

    // Verify validation errors appear without any user interaction
    expect(screen.getByTestId('error-name')).toBeInTheDocument();
    expect(screen.getByTestId('error-name').textContent).toBe(
      'Name is required'
    );
    expect(screen.getByTestId('error-email')).toBeInTheDocument();
    expect(screen.getByTestId('error-email').textContent).toBe(
      'Invalid email format'
    );
  });

  it('validates correctly after deleting array items with validation errors', async () => {
    // Create a schema with array validation
    const schema = z.object({
      items: z.array(z.string().min(3, 'Item must be at least 3 characters')),
    });

    // Initial values with validation errors
    const initialValues = {
      items: ['ab', 'valid item', 'cd', 'another valid item'],
    };

    const TestArrayComponent = () => {
      const form = useFormContext();
      const items = (form.getValue(['items']) as string[]) || [];

      return (
        <div>
          {items.map((item, index) => (
            <div key={index} data-testid={`item-${index}`}>
              <input
                data-testid={`input-${index}`}
                value={item}
                onChange={(e) =>
                  form.setValue(['items', index], e.target.value)
                }
              />
              {form.getError(['items', index]).length > 0 && (
                <div data-testid={`error-${index}`}>
                  {form.getError(['items', index])[0].message}
                </div>
              )}
              <button
                data-testid={`delete-${index}`}
                onClick={() => form.deleteField(['items', index])}
              >
                Delete
              </button>
            </div>
          ))}
          <div data-testid="item-count">{items.length}</div>
        </div>
      );
    };

    // Render with validateOnMount to check initial errors
    render(
      <TestForm
        initialValues={initialValues}
        schema={schema}
        validateOnMount={true}
        validateOnChange={true}
      >
        <TestArrayComponent />
      </TestForm>
    );

    await advanceTimers();

    // Check initial state - should have errors on the short items
    expect(screen.getByTestId('error-0')).toBeInTheDocument();
    expect(screen.getByTestId('error-2')).toBeInTheDocument();
    expect(screen.queryByTestId('error-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('item-count').textContent).toBe('4');

    // Delete the first invalid item
    fireEvent.click(screen.getByTestId('delete-0'));
    await advanceTimers();

    // Now the array has shifted, so:
    // - Original index 1 (valid) is now index 0
    // - Original index 2 (invalid) is now index 1
    // - Original index 3 (valid) is now index 2
    expect(screen.queryByTestId('error-0')).not.toBeInTheDocument(); // Was valid
    expect(screen.getByTestId('error-1')).toBeInTheDocument(); // Was index 2, now index 1
    expect(screen.queryByTestId('error-2')).not.toBeInTheDocument(); // Was valid
    expect(screen.getByTestId('item-count').textContent).toBe('3');

    // Delete the remaining invalid item (now at index 1)
    fireEvent.click(screen.getByTestId('delete-1'));
    await advanceTimers();

    // Now we should have no errors and only 2 items
    expect(screen.queryByTestId('error-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('item-count').textContent).toBe('2');

    // Verify the remaining items are the valid ones
    expect(screen.getByTestId('input-0') as HTMLInputElement).toHaveValue(
      'valid item'
    );
    expect(screen.getByTestId('input-1') as HTMLInputElement).toHaveValue(
      'another valid item'
    );
  });

  it('correctly adjusts error paths when deleting array items', async () => {
    // Create a schema with multiple validation rules for array items
    const schema = z.object({
      tasks: z.array(
        z.object({
          title: z.string().min(3, 'Title too short'),
          priority: z.number().min(1, 'Invalid priority'),
        })
      ),
    });

    // Create initial values with validation errors in different positions
    const initialValues = {
      tasks: [
        { title: 'Task 1', priority: 0 }, // Error in priority
        { title: 'T2', priority: 2 }, // Error in title
        { title: 'Task 3', priority: 3 }, // No errors
        { title: 'T4', priority: 0 }, // Error in both
      ],
    };

    const TestComponent = () => {
      const form = useFormContext();

      // Get all errors and their paths for testing
      const allErrors = form.errors;

      // Safely type the tasks array
      type Task = { title: string; priority: number };
      const tasks = (form.getValue(['tasks']) as Task[]) || [];

      return (
        <div>
          <div data-testid="error-count">{allErrors.length}</div>

          {/* Display all error paths for testing */}
          <div data-testid="error-paths">
            {allErrors.map((error, idx) => (
              <div key={idx} data-testid={`error-path-${idx}`}>
                {error.path.join('.')}
              </div>
            ))}
          </div>

          {/* Button to delete the first item */}
          <button
            data-testid="delete-first"
            onClick={() => form.deleteField(['tasks', 0])}
          >
            Delete First
          </button>

          {/* Display each task title for verification */}
          {tasks.map((task: Task, idx: number) => (
            <div key={idx} data-testid={`task-${idx}-title`}>
              {task.title}
            </div>
          ))}
        </div>
      );
    };

    render(
      <TestForm
        initialValues={initialValues}
        schema={schema}
        validateOnMount={true}
      >
        <TestComponent />
      </TestForm>
    );

    await advanceTimers();

    // Verify initial error count
    expect(screen.getByTestId('error-count').textContent).toBe('4'); // 4 validation errors

    // Check initial error paths
    const initialErrorPaths = Array.from(
      { length: 4 },
      (_, i) => screen.getByTestId(`error-path-${i}`).textContent
    );

    // Expected paths should include errors for all the invalid fields
    // We're not asserting specific order as it may vary based on validation implementation
    expect(initialErrorPaths).toContain('tasks.0.priority');
    expect(initialErrorPaths).toContain('tasks.1.title');
    expect(initialErrorPaths).toContain('tasks.3.title');
    expect(initialErrorPaths).toContain('tasks.3.priority');

    // Delete the first item
    fireEvent.click(screen.getByTestId('delete-first'));

    await advanceTimers();

    // Check updated error paths
    const updatedErrorPaths = Array.from(
      { length: 3 }, // Should now be 3 errors after deletion
      (_, i) => screen.getByTestId(`error-path-${i}`)?.textContent || ''
    );

    // Verify error paths have been properly adjusted:
    // 1. Previous tasks.0.priority error should be gone
    // 2. Previous tasks.1.* errors should now be tasks.0.*
    // 3. Previous tasks.3.* errors should now be tasks.2.*
    expect(updatedErrorPaths).not.toContain('tasks.0.priority'); // First item's error is gone
    expect(updatedErrorPaths).toContain('tasks.0.title'); // Previous tasks.1.title
    expect(updatedErrorPaths).toContain('tasks.2.title'); // Previous tasks.3.title
    expect(updatedErrorPaths).toContain('tasks.2.priority'); // Previous tasks.3.priority

    // Verify the task array contents are correct after deletion
    expect(screen.getByTestId('task-0-title').textContent).toBe('T2');
    expect(screen.getByTestId('task-1-title').textContent).toBe('Task 3');
    expect(screen.getByTestId('task-2-title').textContent).toBe('T4');
  });

  it('allows setting server errors from onSubmit via helpers.setServerErrors', async () => {
    // Define a schema and initial values
    const schema = z.object({
      username: z.string().min(3, 'Username too short'),
      profile: z.object({
        bio: z.string(),
      }),
      preferences: z.object({
        theme: z.string(),
      }),
    });

    const initialValues = {
      username: 'testuser',
      profile: {
        bio: 'Test bio',
      },
      preferences: {
        theme: 'light',
      },
    };

    // Mock onSubmit function that sets server errors
    const onSubmit = jest.fn(async (_values, helpers) => {
      // Simulate server validation with multiple errors
      helpers.setServerErrors([
        { path: ['username'], message: 'Username already exists' },
        {
          path: ['profile', 'bio'],
          message: 'Bio contains inappropriate content',
        },
        { path: [], message: 'General server error' }, // Root level error
      ]);
    });

    // Test component to display form values and errors
    const TestComponent = () => {
      const form = useFormContext();

      // Get root-level errors
      const rootErrors = form.getError([]);

      return (
        <div>
          <div>
            <input
              data-testid="username-input"
              value={form.getValue(['username']) || ''}
              onChange={(e) => form.setValue(['username'], e.target.value)}
            />
            {form.getError(['username']).length > 0 && (
              <div data-testid="username-error">
                {form.getError(['username'])[0].message}
              </div>
            )}
          </div>

          <div>
            <textarea
              data-testid="bio-input"
              value={form.getValue(['profile', 'bio']) || ''}
              onChange={(e) =>
                form.setValue(['profile', 'bio'], e.target.value)
              }
            />
            {form.getError(['profile', 'bio']).length > 0 && (
              <div data-testid="bio-error">
                {form.getError(['profile', 'bio'])[0].message}
              </div>
            )}
          </div>

          {/* Display root errors */}
          {rootErrors.length > 0 && (
            <div data-testid="root-error">{rootErrors[0].message}</div>
          )}

          {/* Display error sources for verification */}
          <div data-testid="error-sources">
            {form.errors.map((error, idx) => (
              <div key={idx} data-testid={`error-${idx}-source`}>
                {error.source || 'unknown'}
              </div>
            ))}
          </div>

          <button data-testid="submit-button" onClick={form.submit}>
            Submit
          </button>
        </div>
      );
    };

    render(
      <TestForm
        initialValues={initialValues}
        schema={schema}
        onSubmit={onSubmit}
      >
        <TestComponent />
      </TestForm>
    );

    await advanceTimers();

    // Initially, there should be no errors
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bio-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('root-error')).not.toBeInTheDocument();

    // Submit the form
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'));
    });

    await advanceTimers();

    // Verify that server errors are displayed
    expect(screen.getByTestId('username-error')).toBeInTheDocument();
    expect(screen.getByTestId('username-error').textContent).toBe(
      'Username already exists'
    );

    expect(screen.getByTestId('bio-error')).toBeInTheDocument();
    expect(screen.getByTestId('bio-error').textContent).toBe(
      'Bio contains inappropriate content'
    );

    expect(screen.getByTestId('root-error')).toBeInTheDocument();
    expect(screen.getByTestId('root-error').textContent).toBe(
      'General server error'
    );

    // Verify that onSubmit was called
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Verify that all errors are marked as server source
    const errorSourceElements = screen.getAllByTestId(/error-\d+-source/);
    expect(errorSourceElements.length).toBeGreaterThan(0);

    // Check that all found error sources are 'server'
    errorSourceElements.forEach((element) => {
      expect(element.textContent).toBe('server');
    });

    // Update a field to verify server error is cleared
    fireEvent.change(screen.getByTestId('username-input'), {
      target: { value: 'newusername' },
    });

    await advanceTimers();

    // Username error should be cleared because the value changed
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();

    // Other server errors should remain
    expect(screen.getByTestId('bio-error')).toBeInTheDocument();
    expect(screen.getByTestId('root-error')).toBeInTheDocument();
  });

  it('tests resetWithValues function correctly resets form with new values', async () => {
    const initialValues = { name: 'John', email: 'john@example.com' };
    const newValues = { name: 'Jane', email: 'jane@example.com', age: 30 };

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="name">{form.getValue(['name'])}</div>
          <div data-testid="email">{form.getValue(['email'])}</div>
          <div data-testid="age">{form.getValue(['age'])}</div>
          <div data-testid="touched-state">
            {Object.keys(form.touched).length > 0 ? 'touched' : 'untouched'}
          </div>
          <button
            data-testid="change-values"
            onClick={() => {
              form.setValue(['name'], 'Changed');
              form.setFieldTouched(['name'], true);
            }}
          >
            Change Values
          </button>
          <button
            data-testid="reset-with-values"
            onClick={() => form.resetWithValues(newValues)}
          >
            Reset With New Values
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues}>
        <TestComponent />
      </TestForm>
    );

    // Verify initial values
    expect(screen.getByTestId('name').textContent).toBe('John');
    expect(screen.getByTestId('email').textContent).toBe('john@example.com');
    expect(screen.getByTestId('age').textContent).toBe('');

    // Change some values and mark as touched
    fireEvent.click(screen.getByTestId('change-values'));

    await advanceTimers();

    expect(screen.getByTestId('name').textContent).toBe('Changed');
    expect(screen.getByTestId('touched-state').textContent).toBe('touched');

    // Reset with new values
    fireEvent.click(screen.getByTestId('reset-with-values'));

    await advanceTimers();

    // Verify values are reset to new values, not original values
    expect(screen.getByTestId('name').textContent).toBe('Jane');
    expect(screen.getByTestId('email').textContent).toBe('jane@example.com');
    expect(screen.getByTestId('age').textContent).toBe('30');

    // Verify touched state is cleared
    expect(screen.getByTestId('touched-state').textContent).toBe('untouched');
  });

  it('clears currentSubmissionID on a normal reset after a completed submission', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    const TestComponent = () => {
      const form = useFormContext();
      // Remember the last non-null submission ID so we can ask whether it's still
      // current after a reset.
      const [lastId, setLastId] = React.useState<string | null>(null);
      React.useEffect(() => {
        if (form.currentSubmissionID) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- test helper: remembers the last non-null submission ID across clears
          setLastId(form.currentSubmissionID);
        }
      }, [form.currentSubmissionID]);

      return (
        <div>
          <div data-testid="current-submission-id">
            {form.currentSubmissionID || 'none'}
          </div>
          <div data-testid="last-id-current">
            {lastId ? form.isCurrentSubmission(lastId).toString() : 'no-id'}
          </div>
          <button data-testid="submit" onClick={form.submit}>
            Submit
          </button>
          <button data-testid="reset" onClick={() => form.reset()}>
            Reset
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={{ name: 'John' }} onSubmit={onSubmit}>
        <TestComponent />
      </TestForm>
    );

    // Submit and let it settle — currentSubmissionID stays set after completion.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await advanceTimers();

    expect(screen.getByTestId('current-submission-id').textContent).not.toBe(
      'none'
    );
    expect(screen.getByTestId('last-id-current').textContent).toBe('true');

    // A normal (unforced) reset clears the submission tracking.
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset'));
    });
    await advanceTimers();

    expect(screen.getByTestId('current-submission-id').textContent).toBe(
      'none'
    );
    expect(screen.getByTestId('last-id-current').textContent).toBe('false');
  });

  it('exposes helpers.getValue reading the live value inside onSubmit', async () => {
    let snapshotName: unknown;
    let liveBeforeName: unknown;
    let liveAfterName: unknown;

    const onSubmit = jest.fn().mockImplementation((values, helpers) => {
      snapshotName = values.name; // top-level argument: snapshot at submit start
      liveBeforeName = helpers.getValue(['name']); // live read, matches snapshot
      helpers.setValue(['name'], 'Edited in handler');
      liveAfterName = helpers.getValue(['name']); // reflects the setValue above
    });

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <button data-testid="submit" onClick={form.submit}>
          Submit
        </button>
      );
    };

    render(
      <TestForm initialValues={{ name: 'Initial' }} onSubmit={onSubmit}>
        <TestComponent />
      </TestForm>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await advanceTimers();

    expect(snapshotName).toBe('Initial');
    expect(liveBeforeName).toBe('Initial');
    expect(liveAfterName).toBe('Edited in handler');
  });

  it('exposes the live read surface (getError/getErrorPaths/getFieldState/getValuePaths/hasField) on helpers', async () => {
    const seen: Record<string, unknown> = {};

    const onSubmit = jest.fn().mockImplementation((_values, helpers) => {
      // Before any mutation: no error, field present, value paths include it.
      seen.errorBefore = helpers.getError(['name']).length;
      seen.stateBefore = helpers.getFieldState(['name']);
      seen.hadFieldBefore = helpers.hasField(['name']);
      seen.valuePathsBefore = helpers
        .getValuePaths()
        .map((p: (string | number)[]) => JSON.stringify(p));

      // Mutate via helpers, then read back synchronously — no re-render in between.
      helpers.setServerError(['name'], 'Taken');
      seen.errorAfter = helpers.getError(['name']).length;
      seen.errorPathsAfter = helpers
        .getErrorPaths()
        .map((p: (string | number)[]) => JSON.stringify(p));
      seen.stateAfter = helpers.getFieldState(['name']);

      helpers.deleteField(['name']);
      seen.hadFieldAfter = helpers.hasField(['name']);
    });

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <button data-testid="submit" onClick={form.submit}>
          Submit
        </button>
      );
    };

    render(
      <TestForm initialValues={{ name: 'Initial' }} onSubmit={onSubmit}>
        <TestComponent />
      </TestForm>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await advanceTimers();

    expect(seen.errorBefore).toBe(0);
    expect((seen.stateBefore as { invalid: boolean }).invalid).toBe(false);
    expect((seen.stateBefore as { exists: boolean }).exists).toBe(true);
    expect(seen.hadFieldBefore).toBe(true);
    expect(seen.valuePathsBefore).toContain(JSON.stringify(['name']));

    // The point: every read reflects the in-handler mutations immediately, rather
    // than lagging behind a not-yet-committed render.
    expect(seen.errorAfter).toBe(1);
    expect(seen.errorPathsAfter).toContain(JSON.stringify(['name']));
    expect((seen.stateAfter as { invalid: boolean }).invalid).toBe(true);
    expect((seen.stateAfter as { error: string | null }).error).toBe('Taken');
    expect(seen.hadFieldAfter).toBe(false);
  });

  it('exposes helpers.validateField, validating one field live inside onSubmit', async () => {
    let validInvalid: boolean | undefined;
    let validFixed: boolean | undefined;
    let errorAfterFix: number | undefined;

    const schema = z.object({ name: z.string().min(3) });

    // Start valid ('abcd') so submit() passes its gate and onSubmit runs.
    const onSubmit = jest.fn().mockImplementation((_values, helpers) => {
      // Make the field invalid, then trigger: validateField reports false.
      helpers.setValue(['name'], 'ab');
      validInvalid = helpers.validateField(['name']);
      // Fix it, re-trigger: now it passes and the field's error clears — all live.
      helpers.setValue(['name'], 'wxyz');
      validFixed = helpers.validateField(['name']);
      errorAfterFix = helpers.getError(['name']).length;
    });

    const TestComponent = () => {
      const form = useFormContext();
      return (
        <button data-testid="submit" onClick={form.submit}>
          Submit
        </button>
      );
    };

    render(
      <TestForm
        initialValues={{ name: 'abcd' }}
        schema={schema}
        onSubmit={onSubmit}
      >
        <TestComponent />
      </TestForm>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await advanceTimers();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(validInvalid).toBe(false);
    expect(validFixed).toBe(true);
    expect(errorAfterFix).toBe(0);
  });

  it('tracks currentSubmissionID and handles concurrent submissions properly', async () => {
    const initialValues = { name: 'John' };

    // Create a controlled onSubmit handler that we can manipulate for testing
    let resolveFirstSubmission: () => void;
    let resolveSecondSubmission: () => void;

    const firstSubmissionPromise = new Promise<void>((resolve) => {
      resolveFirstSubmission = resolve;
    });

    const secondSubmissionPromise = new Promise<void>((resolve) => {
      resolveSecondSubmission = resolve;
    });

    let submissionCount = 0;

    const onSubmit = jest.fn().mockImplementation(() => {
      submissionCount++;
      if (submissionCount === 1) {
        return firstSubmissionPromise;
      } else {
        return secondSubmissionPromise;
      }
    });

    const TestComponent = () => {
      const form = useFormContext();
      const [lastSubmissionId, setLastSubmissionId] = React.useState<
        string | null
      >(null);
      const [isLastSubmissionCurrent, setIsLastSubmissionCurrent] =
        React.useState<boolean | null>(null);

      // Track current submission ID for testing
      React.useEffect(() => {
        if (form.currentSubmissionID) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- test helper: intentionally remembers the last non-null submission ID across clears
          setLastSubmissionId(form.currentSubmissionID);
        }
      }, [form.currentSubmissionID]);

      return (
        <div>
          <div data-testid="is-submitting">{form.isSubmitting.toString()}</div>
          <div data-testid="current-submission-id">
            {form.currentSubmissionID || 'none'}
          </div>
          <button
            data-testid="submit"
            onClick={form.submit}
            disabled={form.isSubmitting}
          >
            Submit
          </button>
          <button
            data-testid="check-current"
            onClick={() => {
              if (lastSubmissionId) {
                setIsLastSubmissionCurrent(
                  form.isCurrentSubmission(lastSubmissionId)
                );
              }
            }}
          >
            Check Is Current
          </button>
          <div data-testid="is-current-submission">
            {isLastSubmissionCurrent === null
              ? 'not-checked'
              : isLastSubmissionCurrent.toString()}
          </div>
          <div data-testid="last-submission-id">
            {lastSubmissionId || 'none'}
          </div>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues} onSubmit={onSubmit}>
        <TestComponent />
      </TestForm>
    );

    // Initially no submission is active
    expect(screen.getByTestId('is-submitting').textContent).toBe('false');
    expect(screen.getByTestId('current-submission-id').textContent).toBe(
      'none'
    );

    // Start first submission
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await advanceTimers();

    // Check that submission is active and ID exists
    expect(screen.getByTestId('is-submitting').textContent).toBe('true');
    expect(screen.getByTestId('current-submission-id').textContent).not.toBe(
      'none'
    );

    const firstSubmissionId = screen.getByTestId(
      'current-submission-id'
    ).textContent;

    // Check if this submission is current (should be)
    fireEvent.click(screen.getByTestId('check-current'));

    await advanceTimers();

    expect(screen.getByTestId('is-current-submission').textContent).toBe(
      'true'
    );

    // Complete first submission
    await act(async () => {
      resolveFirstSubmission();
    });

    await advanceTimers();

    // Verify submission is complete
    expect(screen.getByTestId('is-submitting').textContent).toBe('false');

    // Start second submission
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await advanceTimers();

    // Check that new submission has different ID
    const secondSubmissionId = screen.getByTestId(
      'current-submission-id'
    ).textContent;
    expect(secondSubmissionId).not.toBe(firstSubmissionId);
    expect(secondSubmissionId).not.toBe('none');

    // Need to store the first submission ID separately since lastSubmissionId
    // has been updated to the second submission ID in our component
    const storedFirstSubmissionId = firstSubmissionId;

    // Store the first submission ID in a variable for testing
    // Check that the rendered lastSubmissionId has changed
    expect(screen.getByTestId('last-submission-id').textContent).toBe(
      secondSubmissionId
    );

    // We need to manually check isCurrentSubmission with the old ID
    const isFirstStillCurrent = onSubmit.mock.calls[0][1].isCurrentSubmission(
      storedFirstSubmissionId
    );
    expect(isFirstStillCurrent).toBe(false);

    // Complete second submission
    await act(async () => {
      resolveSecondSubmission();
    });

    await advanceTimers();

    // Verify submission is complete
    expect(screen.getByTestId('is-submitting').textContent).toBe('false');

    // Verify onSubmit was called twice
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('prevents duplicate submissions while form is already submitting', async () => {
    const initialValues = { name: 'John' };

    // Create a submission that won't resolve immediately
    let resolveSubmission: () => void;
    const submissionPromise = new Promise<void>((resolve) => {
      resolveSubmission = resolve;
    });

    const onSubmit = jest.fn().mockImplementation(() => submissionPromise);
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const TestComponent = () => {
      const form = useFormContext();
      const [submitAttempts, setSubmitAttempts] = React.useState(0);

      return (
        <div>
          <div data-testid="is-submitting">{form.isSubmitting.toString()}</div>
          <div data-testid="submit-attempts">{submitAttempts}</div>
          <button
            data-testid="submit"
            onClick={() => {
              setSubmitAttempts((prev) => prev + 1);
              form.submit();
            }}
          >
            Submit
          </button>
          <button
            data-testid="resolve-submission"
            onClick={() => {
              resolveSubmission();
            }}
          >
            Resolve Submission
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues} onSubmit={onSubmit}>
        <TestComponent />
      </TestForm>
    );

    // First submission
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await advanceTimers();

    expect(screen.getByTestId('is-submitting').textContent).toBe('true');
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Try submitting again while already submitting
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await advanceTimers();

    // Submit attempts is 2, but onSubmit should still only be called once
    expect(screen.getByTestId('submit-attempts').textContent).toBe('2');
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Verify that a warning was logged
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Form submission prevented: already submitting')
    );

    // Resolve the submission
    await act(async () => {
      fireEvent.click(screen.getByTestId('resolve-submission'));
    });

    await advanceTimers();

    // Verify submission completed
    expect(screen.getByTestId('is-submitting').textContent).toBe('false');

    // Clean up
    consoleWarnSpy.mockRestore();
  });

  it('allows force reset during submission', async () => {
    const initialValues = { name: 'John', email: 'john@example.com' };

    // Create a submission that won't resolve immediately
    let resolveSubmission: () => void;
    const submissionPromise = new Promise<void>((resolve) => {
      resolveSubmission = resolve;
    });

    const onSubmit = jest.fn().mockImplementation(() => submissionPromise);
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const TestComponent = () => {
      const form = useFormContext();
      const [resetResult, setResetResult] = React.useState<string>('');

      return (
        <div>
          <div data-testid="name">{form.getValue(['name'])}</div>
          <div data-testid="is-submitting">{form.isSubmitting.toString()}</div>
          <div data-testid="reset-result">{resetResult}</div>
          <button data-testid="submit" onClick={form.submit}>
            Submit
          </button>
          <button
            data-testid="normal-reset"
            onClick={() => {
              const result = form.reset();
              setResetResult(`normal: ${result}`);
            }}
          >
            Normal Reset
          </button>
          <button
            data-testid="force-reset"
            onClick={() => {
              const result = form.reset(true);
              setResetResult(`force: ${result}`);
            }}
          >
            Force Reset
          </button>
          <button
            data-testid="change-name"
            onClick={() => {
              form.setValue(['name'], 'Changed');
            }}
          >
            Change Name
          </button>
          <button
            data-testid="resolve-submission"
            onClick={() => {
              resolveSubmission();
            }}
          >
            Resolve Submission
          </button>
        </div>
      );
    };

    render(
      <TestForm initialValues={initialValues} onSubmit={onSubmit}>
        <TestComponent />
      </TestForm>
    );

    // Change a value first
    fireEvent.click(screen.getByTestId('change-name'));

    await advanceTimers();

    expect(screen.getByTestId('name').textContent).toBe('Changed');

    // Start submission
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await advanceTimers();

    expect(screen.getByTestId('is-submitting').textContent).toBe('true');

    // Try normal reset during submission
    fireEvent.click(screen.getByTestId('normal-reset'));

    await advanceTimers();

    // Normal reset should fail and warn
    expect(screen.getByTestId('reset-result').textContent).toBe(
      'normal: false'
    );
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(screen.getByTestId('name').textContent).toBe('Changed'); // Name should not change
    expect(screen.getByTestId('is-submitting').textContent).toBe('true'); // Still submitting

    // Try force reset during submission
    fireEvent.click(screen.getByTestId('force-reset'));

    await advanceTimers();

    // Force reset should succeed
    expect(screen.getByTestId('reset-result').textContent).toBe('force: true');
    expect(screen.getByTestId('name').textContent).toBe('John'); // Name should reset
    expect(screen.getByTestId('is-submitting').textContent).toBe('false'); // Submission should cancel

    // Clean up
    consoleWarnSpy.mockRestore();
  });

  it('properly manages canSubmit state after various operations', async () => {
    // Create a schema with validation rules
    const schema = z.object({
      username: z.string().min(3, 'Username must be at least 3 characters'),
      email: z.email('Invalid email format'),
    });

    // Initial values that will pass validation
    const initialValues = { username: 'validuser', email: 'valid@example.com' };

    const TestComponent = () => {
      const form = useFormContext();

      return (
        <div>
          <div data-testid="can-submit">{form.canSubmit.toString()}</div>
          <div data-testid="is-valid">{form.isValid.toString()}</div>

          <input
            data-testid="username-input"
            value={form.getValue(['username']) || ''}
            onChange={(e) => form.setValue(['username'], e.target.value)}
          />

          <input
            data-testid="email-input"
            value={form.getValue(['email']) || ''}
            onChange={(e) => form.setValue(['email'], e.target.value)}
          />

          <button data-testid="validate" onClick={() => form.validate()}>
            Validate
          </button>

          <button
            data-testid="set-invalid-username"
            onClick={() => form.setValue(['username'], 'x')}
          >
            Set Invalid Username
          </button>

          <button
            data-testid="set-invalid-email"
            onClick={() => form.setValue(['email'], 'not-an-email')}
          >
            Set Invalid Email
          </button>

          <button
            data-testid="fix-all"
            onClick={() => {
              form.setValue(['username'], 'validuser');
              form.setValue(['email'], 'valid@example.com');
            }}
          >
            Fix All
          </button>

          <button data-testid="reset" onClick={() => form.reset()}>
            Reset
          </button>
        </div>
      );
    };

    render(
      <TestForm
        initialValues={initialValues}
        schema={schema}
        validateOnMount={true}
        validateOnChange={true}
      >
        <TestComponent />
      </TestForm>
    );

    await advanceTimers();

    // Initially should be valid and submittable
    expect(screen.getByTestId('can-submit').textContent).toBe('true');
    expect(screen.getByTestId('is-valid').textContent).toBe('true');

    // Set invalid username
    fireEvent.click(screen.getByTestId('set-invalid-username'));

    await advanceTimers();

    // Should not be submittable now
    expect(screen.getByTestId('can-submit').textContent).toBe('false');
    expect(screen.getByTestId('is-valid').textContent).toBe('false');

    // Reset form to initial (valid) values
    fireEvent.click(screen.getByTestId('reset'));

    await advanceTimers();

    // After reset, should reset canSubmit to false initially before validation
    // However, the implementation appears to preserve validation state from initial values
    // which were valid, so canSubmit might still be true
    expect(screen.getByTestId('can-submit').textContent).toBe('true');

    // Set invalid username to verify canSubmit changes properly
    fireEvent.click(screen.getByTestId('set-invalid-username'));

    await advanceTimers();

    // Should not be submittable now
    expect(screen.getByTestId('can-submit').textContent).toBe('false');

    // Fix all fields
    fireEvent.click(screen.getByTestId('fix-all'));

    await advanceTimers();

    // Run validation explicitly after all fixes
    fireEvent.click(screen.getByTestId('validate'));

    await advanceTimers();

    // After validation with valid values it should be submittable
    expect(screen.getByTestId('can-submit').textContent).toBe('true');
    expect(screen.getByTestId('is-valid').textContent).toBe('true');
  });

  it('properly updates form state after server validation errors', async () => {
    const initialValues = { username: 'testuser', password: 'password' };
    const schema = z.object({
      username: z.string().min(3, 'Username must be at least 3 characters'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    });

    // Create a controlled onSubmit handler
    const onSubmit = jest.fn().mockImplementation(async (_values, helpers) => {
      // Simulate server validation errors
      helpers.setServerErrors([
        { path: ['username'], message: 'Username already exists' },
        { path: ['password'], message: 'Password too weak' },
      ]);
    });

    const TestComponent = () => {
      const form = useFormContext();
      const [validationState, setValidationState] = React.useState<string>('');

      // Store the form validation state at key points for testing
      const recordState = (label: string) => {
        setValidationState(
          `${label}: isValid=${form.isValid}, canSubmit=${form.canSubmit}, errors=${form.errors.length}`
        );
      };

      return (
        <div>
          <div data-testid="username-value">{form.getValue(['username'])}</div>
          <div data-testid="password-value">{form.getValue(['password'])}</div>

          {form.getError(['username']).length > 0 && (
            <div data-testid="username-error">
              {form.getError(['username'])[0].message}
            </div>
          )}

          {form.getError(['password']).length > 0 && (
            <div data-testid="password-error">
              {form.getError(['password'])[0].message}
            </div>
          )}

          <div data-testid="validation-state">{validationState}</div>

          <button
            data-testid="submit"
            onClick={() => {
              recordState('before-submit');
              form.submit();
            }}
          >
            Submit
          </button>

          <button
            data-testid="record-after-submit"
            onClick={() => recordState('after-submit')}
          >
            Record After Submit
          </button>

          <button
            data-testid="fix-username"
            onClick={() => {
              form.setValue(['username'], 'newusername');
              recordState('after-username-change');
            }}
          >
            Fix Username
          </button>

          <button
            data-testid="fix-password"
            onClick={() => {
              form.setValue(['password'], 'strongerpassword');
              recordState('after-password-change');
            }}
          >
            Fix Password
          </button>

          <button
            data-testid="validate-again"
            onClick={() => {
              const isValid = form.validate();
              recordState(`after-validate-${isValid}`);
            }}
          >
            Validate Again
          </button>
        </div>
      );
    };

    render(
      <TestForm
        initialValues={initialValues}
        schema={schema}
        onSubmit={onSubmit}
        validateOnMount={true}
      >
        <TestComponent />
      </TestForm>
    );

    await advanceTimers();

    // Submit the form to trigger server validation errors
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await advanceTimers();

    // Record state after submission completed
    fireEvent.click(screen.getByTestId('record-after-submit'));

    // Server errors should be present
    expect(screen.getByTestId('username-error')).toBeInTheDocument();
    expect(screen.getByTestId('username-error').textContent).toBe(
      'Username already exists'
    );
    expect(screen.getByTestId('password-error')).toBeInTheDocument();
    expect(screen.getByTestId('password-error').textContent).toBe(
      'Password too weak'
    );

    // Validation state should indicate invalid with errors
    expect(screen.getByTestId('validation-state').textContent).toContain(
      'isValid=false'
    );
    // Note: The FormProvider implementation leave canSubmit=true even with server errors
    // This is deliberate since server errors don't invalidate the form schema validation
    expect(screen.getByTestId('validation-state').textContent).toContain(
      'canSubmit=true'
    );
    expect(screen.getByTestId('validation-state').textContent).toContain(
      'errors=2'
    );

    // Editing a field clears ITS OWN server error (the standard pattern — the
    // user fixed that field, so its server complaint no longer applies). Other
    // fields' server errors persist until they're edited or the form resubmits.
    fireEvent.click(screen.getByTestId('fix-username'));

    await advanceTimers();

    // Username error is gone; the unrelated password server error remains.
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('password-error')).toBeInTheDocument();
    expect(screen.getByTestId('password-error').textContent).toBe(
      'Password too weak'
    );

    expect(screen.getByTestId('validation-state').textContent).toContain(
      'after-username-change'
    );

    // Now edit password too — that clears the last remaining server error.
    fireEvent.click(screen.getByTestId('fix-password'));

    await advanceTimers();

    // Both field errors are now gone (each cleared by editing its own field).
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('password-error')).not.toBeInTheDocument();

    // Run validation again to confirm form state
    fireEvent.click(screen.getByTestId('validate-again'));

    await advanceTimers();

    // Form should now be valid with no errors left.
    expect(screen.getByTestId('validation-state').textContent).toContain(
      'after-validate-true'
    );
    expect(screen.getByTestId('validation-state').textContent).toContain(
      'isValid=true'
    );
    expect(screen.getByTestId('validation-state').textContent).toContain(
      'errors=0'
    );

    // onSubmit was called once (the initial submission that produced the errors).
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('works correctly without a schema', async () => {
    const initialValues = { name: 'John', email: 'john@example.com' };
    const onSubmit = jest.fn();

    const TestComponent = () => {
      const form = useFormContext();

      return (
        <div>
          <div data-testid="is-valid">{form.isValid.toString()}</div>
          <div data-testid="can-submit">{form.canSubmit.toString()}</div>
          <div data-testid="name-value">{form.getValue(['name'])}</div>
          <div data-testid="email-value">{form.getValue(['email'])}</div>

          <button data-testid="submit" onClick={form.submit}>
            Submit
          </button>

          <button
            data-testid="change-name"
            onClick={() => form.setValue(['name'], 'Changed')}
          >
            Change Name
          </button>

          <button
            data-testid="validate"
            onClick={() => {
              const result = form.validate();
              return result;
            }}
          >
            Validate
          </button>

          <button
            data-testid="set-errors"
            onClick={() => {
              form.setErrors([{ path: ['name'], message: 'Invalid name' }]);
            }}
          >
            Set Errors
          </button>

          <div>
            {form.getError(['name']).length > 0 && (
              <div data-testid="name-error">
                {form.getError(['name'])[0].message}
              </div>
            )}
          </div>
        </div>
      );
    };

    render(
      <TestForm
        initialValues={initialValues}
        onSubmit={onSubmit}
        // No schema provided
      >
        <TestComponent />
      </TestForm>
    );

    await advanceTimers();

    // Without a schema, form is initially considered invalid until validated
    expect(screen.getByTestId('is-valid').textContent).toBe('false');

    // But canSubmit may be false initially until validation runs

    // Run validation explicitly
    fireEvent.click(screen.getByTestId('validate'));

    await advanceTimers();

    // After validation without a schema, form should be valid and submittable
    expect(screen.getByTestId('is-valid').textContent).toBe('true');
    expect(screen.getByTestId('can-submit').textContent).toBe('true');

    // Change a field
    fireEvent.click(screen.getByTestId('change-name'));

    await advanceTimers();

    expect(screen.getByTestId('name-value').textContent).toBe('Changed');

    // Form should still be valid after field changes
    expect(screen.getByTestId('is-valid').textContent).toBe('true');

    // Submit the form
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await advanceTimers();

    // Verify onSubmit was called with current values
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      { name: 'Changed', email: 'john@example.com' },
      expect.anything()
    );

    // Manually set some errors
    fireEvent.click(screen.getByTestId('set-errors'));

    await advanceTimers();

    // Error should be displayed
    expect(screen.getByTestId('name-error')).toBeInTheDocument();
    expect(screen.getByTestId('name-error').textContent).toBe('Invalid name');

    // Form should no longer be valid
    expect(screen.getByTestId('is-valid').textContent).toBe('false');

    // The setErrors entry above is UNTAGGED (no `source`) — an ordinary
    // validation-style error per the contract. With no schema, validate() passes,
    // so it recomputes validation-owned errors (Zod 'client' AND untagged) away:
    // the error clears and the form reads valid again. (A 'manual'/'server' error
    // would survive instead — use setError/setServerError for persistent errors.)
    fireEvent.click(screen.getByTestId('validate'));

    await advanceTimers();

    expect(screen.getByTestId('is-valid').textContent).toBe('true');
    expect(screen.queryByTestId('name-error')).not.toBeInTheDocument();
  });

  // A field built on the real useField hook (which wires onBlur -> validateOnBlur),
  // unlike TestField which reads the context directly.
  function BlurField() {
    const field = useField(['name']);
    return (
      <div>
        <input
          data-testid="name"
          value={(field.value as string) ?? ''}
          onChange={(e) => field.props.onChange(e.target.value)}
          onBlur={field.props.onBlur}
        />
        {field.error && (
          <span data-testid="name-error">{field.error as string}</span>
        )}
      </div>
    );
  }

  it('validateOnBlur (default on): blurring an empty required field surfaces its error', async () => {
    const schema = z.object({ name: z.string().min(1, 'Name is required') });

    render(
      <FormProvider
        initialValues={{ name: '' }}
        schema={schema}
        onSubmit={jest.fn()}
      >
        <BlurField />
      </FormProvider>
    );

    await advanceTimers();
    // No interaction yet -> no error shown.
    expect(screen.queryByTestId('name-error')).not.toBeInTheDocument();

    // Blur without typing -> validateOnBlur runs validation; required error appears.
    fireEvent.blur(screen.getByTestId('name'));
    await advanceTimers();

    expect(screen.getByTestId('name-error')).toBeInTheDocument();
    expect(screen.getByTestId('name-error').textContent).toBe(
      'Name is required'
    );
  });

  it('validateOnBlur={false}: blurring an empty required field does NOT surface its error', async () => {
    const schema = z.object({ name: z.string().min(1, 'Name is required') });

    render(
      <FormProvider
        initialValues={{ name: '' }}
        schema={schema}
        onSubmit={jest.fn()}
        validateOnBlur={false}
      >
        <BlurField />
      </FormProvider>
    );

    await advanceTimers();
    fireEvent.blur(screen.getByTestId('name'));
    await advanceTimers();

    // Touched but not validated, so no error is shown.
    expect(screen.queryByTestId('name-error')).not.toBeInTheDocument();
  });

  it('reports isValid=true for a genuinely schema-less form with no errors', async () => {
    // Regression guard: a form rendered without a `schema` prop never sets
    // `lastValidated`, so gating isValid solely on `lastValidated !== null` would
    // leave it stuck false. A schema-less form is vacuously valid when error-free.
    function ValidProbe() {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="is-valid">{form.isValid.toString()}</div>
          <button
            data-testid="set-error"
            onClick={() => form.setErrors([{ path: ['name'], message: 'bad' }])}
          />
        </div>
      );
    }

    render(
      // No `schema` prop at all.
      <FormProvider initialValues={{ name: 'a' }} onSubmit={jest.fn()}>
        <ValidProbe />
      </FormProvider>
    );

    await advanceTimers();
    expect(screen.getByTestId('is-valid').textContent).toBe('true');

    // A manually-set error flips it to invalid.
    fireEvent.click(screen.getByTestId('set-error'));
    await advanceTimers();
    expect(screen.getByTestId('is-valid').textContent).toBe('false');
  });

  it('validateOnChange={false}: editing a field does NOT stamp lastValidated or flip isValid', async () => {
    // Regression: setValue/deleteField used to dispatch lastValidated=Date.now()
    // unconditionally, even when no validation pass ran (validateOnChange off or no
    // schema). Because isValid gates on `lastValidated !== null`, the first edit
    // would falsely flip isValid true without ever validating. Only a real
    // validation pass (validate(), submit(), or validateOnChange) should stamp it.
    function Probe() {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="is-valid">{form.isValid.toString()}</div>
          <div data-testid="last-validated">
            {String(form.lastValidated === null)}
          </div>
          <button
            data-testid="edit"
            // 'ab' satisfies min(2): the values become valid, but with
            // validateOnChange off no validation runs, so isValid must stay false.
            onClick={() => form.setValue(['name'], 'ab')}
          />
          <button data-testid="run-validate" onClick={() => form.validate()} />
        </div>
      );
    }

    render(
      <FormProvider
        initialValues={{ name: '' }}
        schema={z.object({ name: z.string().min(2) })}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe />
      </FormProvider>
    );

    await advanceTimers();
    // No validation has run yet on a schema form.
    expect(screen.getByTestId('last-validated').textContent).toBe('true');
    expect(screen.getByTestId('is-valid').textContent).toBe('false');

    // Edit to a valid value. Without a validation pass this must NOT stamp
    // lastValidated, so isValid stays false.
    fireEvent.click(screen.getByTestId('edit'));
    await advanceTimers();
    expect(screen.getByTestId('last-validated').textContent).toBe('true');
    expect(screen.getByTestId('is-valid').textContent).toBe('false');

    // An explicit validate() finally runs the pass: lastValidated is set and the
    // (now valid) form reads valid.
    fireEvent.click(screen.getByTestId('run-validate'));
    await advanceTimers();
    expect(screen.getByTestId('last-validated').textContent).toBe('false');
    expect(screen.getByTestId('is-valid').textContent).toBe('true');
  });

  it('validate() clears stale UNTAGGED errors when the form is valid', async () => {
    // Regression: untagged errors (raw setErrors with no `source`) are documented
    // as ordinary validation-style errors. A validate() pass on an otherwise-valid
    // form must drop them like 'client' errors — otherwise they linger and keep
    // isValid stuck false.
    function Probe() {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="is-valid">{form.isValid.toString()}</div>
          <div data-testid="err-count">{form.getError(['name']).length}</div>
          <button
            data-testid="set-untagged"
            // No `source` — an untagged error, i.e. validation-style per the docs.
            onClick={() =>
              form.setErrors([{ path: ['name'], message: 'stale untagged' }])
            }
          />
          <button data-testid="run-validate" onClick={() => form.validate()} />
        </div>
      );
    }

    render(
      // 'ab' satisfies min(2), so the schema validates clean.
      <FormProvider
        initialValues={{ name: 'ab' }}
        schema={z.object({ name: z.string().min(2) })}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );

    await advanceTimers();

    // Seed an untagged error, then validate a form whose values are actually valid.
    fireEvent.click(screen.getByTestId('set-untagged'));
    await advanceTimers();
    expect(screen.getByTestId('err-count').textContent).toBe('1');

    fireEvent.click(screen.getByTestId('run-validate'));
    await advanceTimers();

    // The untagged error is recomputed away, and the form reads valid again.
    expect(screen.getByTestId('err-count').textContent).toBe('0');
    expect(screen.getByTestId('is-valid').textContent).toBe('true');
  });

  it('validate() on an INVALID form preserves client-submission errors', async () => {
    // Regression: client-form-handler errors are cleared only by submit start /
    // clearClientSubmissionError / reset — NOT by validate(). The invalid-branch
    // merge must preserve them (it previously kept only server/manual, wiping a
    // submission banner on any validate while the form was invalid).
    function Probe() {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="submission-errs">
            {form.getClientSubmissionError().length}
          </div>
          <button
            data-testid="set-client-error"
            onClick={() => form.setClientSubmissionError('Network failed')}
          />
          <button
            data-testid="run-validate"
            onClick={() => form.validate(true)}
          />
        </div>
      );
    }

    render(
      // name '' fails min(2), so the form is invalid → validate() hits the invalid branch.
      <FormProvider
        initialValues={{ name: '' }}
        schema={z.object({ name: z.string().min(2) })}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );

    await advanceTimers();

    fireEvent.click(screen.getByTestId('set-client-error'));
    await advanceTimers();
    expect(screen.getByTestId('submission-errs').textContent).toBe('1');

    // Validate the (still-invalid) form — the submission error must survive.
    fireEvent.click(screen.getByTestId('run-validate'));
    await advanceTimers();
    expect(screen.getByTestId('submission-errs').textContent).toBe('1');
  });
});

describe('onSubmit helpers.signal (AbortSignal)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const SignalControls = () => {
    const form = useFormContext();
    return (
      <div>
        <button data-testid="submit" onClick={form.submit}>
          submit
        </button>
        <button data-testid="force-reset" onClick={() => form.reset(true)}>
          force reset
        </button>
        <button
          data-testid="force-reset-with"
          onClick={() => form.resetWithValues({ name: 'z' }, true)}
        >
          force resetWithValues
        </button>
        <button
          data-testid="change"
          onClick={() => form.setValue(['name'], 'edited')}
        >
          change value
        </button>
      </div>
    );
  };

  function HangingForm({
    onSubmit,
  }: {
    onSubmit: (v: Record<string, unknown>, h: FormHelpers) => Promise<void>;
  }) {
    return (
      <TestForm initialValues={{ name: 'a' }} onSubmit={onSubmit}>
        <SignalControls />
      </TestForm>
    );
  }

  it('aborts the in-flight signal on a force reset', async () => {
    const captured: { signal?: AbortSignal } = {};
    let resolve: () => void = () => {};
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const onSubmit = jest.fn((_v: unknown, helpers: FormHelpers) => {
      captured.signal = helpers.signal;
      return pending;
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    render(<HangingForm onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await advanceTimers();
    expect(captured.signal).toBeDefined();
    expect(captured.signal!.aborted).toBe(false);

    // Force-reset mid-submit aborts the signal so a wired fetch cancels.
    fireEvent.click(screen.getByTestId('force-reset'));
    await advanceTimers();
    expect(captured.signal!.aborted).toBe(true);

    await act(async () => {
      resolve();
    });
    await advanceTimers();
    warn.mockRestore();
  });

  it('aborts the in-flight signal when the provider unmounts', async () => {
    const captured: { signal?: AbortSignal } = {};
    let resolve: () => void = () => {};
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const onSubmit = jest.fn((_v: unknown, helpers: FormHelpers) => {
      captured.signal = helpers.signal;
      return pending;
    });

    const { unmount } = render(<HangingForm onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await advanceTimers();
    expect(captured.signal!.aborted).toBe(false);

    unmount();
    expect(captured.signal!.aborted).toBe(true);

    await act(async () => {
      resolve();
    });
    await advanceTimers();
  });

  it('aborts the in-flight signal on a force resetWithValues', async () => {
    const captured: { signal?: AbortSignal } = {};
    let resolve: () => void = () => {};
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const onSubmit = jest.fn((_v: unknown, helpers: FormHelpers) => {
      captured.signal = helpers.signal;
      return pending;
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    render(<HangingForm onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await advanceTimers();
    expect(captured.signal!.aborted).toBe(false);

    fireEvent.click(screen.getByTestId('force-reset-with'));
    await advanceTimers();
    expect(captured.signal!.aborted).toBe(true);

    await act(async () => {
      resolve();
    });
    await advanceTimers();
    warn.mockRestore();
  });

  it('does NOT abort the signal on a value change during an in-flight submit', async () => {
    const captured: { signal?: AbortSignal } = {};
    let resolve: () => void = () => {};
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const onSubmit = jest.fn((_v: unknown, helpers: FormHelpers) => {
      captured.signal = helpers.signal;
      return pending;
    });

    render(<HangingForm onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await advanceTimers();
    expect(captured.signal!.aborted).toBe(false);

    // An ordinary edit re-renders the provider; its mount-validation effect cleanup
    // must NOT abort the in-flight submission.
    fireEvent.click(screen.getByTestId('change'));
    await advanceTimers();
    expect(captured.signal!.aborted).toBe(false);

    await act(async () => {
      resolve();
    });
    await advanceTimers();
  });

  it('does NOT abort the signal on a normal successful submit', async () => {
    const captured: { signal?: AbortSignal } = {};
    const onSubmit = jest.fn(async (_v: unknown, helpers: FormHelpers) => {
      captured.signal = helpers.signal;
    });

    render(<HangingForm onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await advanceTimers();

    expect(captured.signal).toBeDefined();
    expect(captured.signal!.aborted).toBe(false);
  });
});

describe('reveal errors for fields absent from values', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().min(1, 'Email is required'),
  });

  // Uses the real useField (touch-gated display error). `email` is intentionally
  // omitted from initialValues, so the value-tree touch walk on submit can't reach
  // it — the fix touches the error's path instead so its error still surfaces.
  function FieldRow({ name }: { name: string }) {
    const field = useField([name]);
    const display = Array.isArray(field.error) ? field.error[0] : field.error;
    return <span data-testid={`err-${name}`}>{display ?? 'none'}</span>;
  }

  it('submit() reveals the touch-gated error for a field missing from initialValues', async () => {
    const Trigger = () => {
      const form = useFormContext();
      return (
        <button data-testid="submit" onClick={() => form.submit()}>
          submit
        </button>
      );
    };

    render(
      <FormProvider
        // Deliberately omit the `email` key to exercise the absent-field path; the
        // cast lets us hand the provider a partial of the schema's value type.
        initialValues={{ name: '' } as { name: string; email: string }}
        schema={schema}
        onSubmit={jest.fn()}
      >
        <FieldRow name="name" />
        <FieldRow name="email" />
        <Trigger />
      </FormProvider>
    );

    await advanceTimers();

    // Before any interaction, both errors are hidden (untouched).
    expect(screen.getByTestId('err-name').textContent).toBe('none');
    expect(screen.getByTestId('err-email').textContent).toBe('none');

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await advanceTimers();

    // Both errors are revealed — including `email`, which isn't in `values` (its
    // exact Zod message is the undefined-type error, so just assert it's shown).
    expect(screen.getByTestId('err-name').textContent).toBe('Name is required');
    expect(screen.getByTestId('err-email').textContent).not.toBe('none');
  });

  it('validate(true) reveals the touch-gated error for a field missing from initialValues', async () => {
    const Trigger = () => {
      const form = useFormContext();
      return (
        <button data-testid="validate" onClick={() => form.validate(true)}>
          validate
        </button>
      );
    };

    render(
      <FormProvider
        initialValues={{ name: '' } as { name: string; email: string }}
        schema={schema}
      >
        <FieldRow name="name" />
        <FieldRow name="email" />
        <Trigger />
      </FormProvider>
    );

    await advanceTimers();
    expect(screen.getByTestId('err-email').textContent).toBe('none');

    await act(async () => {
      fireEvent.click(screen.getByTestId('validate'));
    });
    await advanceTimers();

    expect(screen.getByTestId('err-name').textContent).toBe('Name is required');
    expect(screen.getByTestId('err-email').textContent).not.toBe('none');
  });

  it('validateOnMount + touchAllOnMount reveals the error for a field missing from initialValues', async () => {
    render(
      <FormProvider
        // No `email` key — see the cast rationale above.
        initialValues={{ name: '' } as { name: string; email: string }}
        schema={schema}
        validateOnMount
        touchAllOnMount
      >
        <FieldRow name="name" />
        <FieldRow name="email" />
      </FormProvider>
    );

    await advanceTimers();

    // touchAllOnMount means "reveal every error on load" — including `email`,
    // which isn't present in `values`.
    expect(screen.getByTestId('err-name').textContent).toBe('Name is required');
    expect(screen.getByTestId('err-email').textContent).not.toBe('none');
  });
});
