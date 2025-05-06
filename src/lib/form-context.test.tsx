import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { z } from 'zod';
import { FormProvider, FormContext } from './form-context';
import { ValidationError } from './zod-helpers';

// Helper function to advance timers and settle promises
const advanceTimers = async () => {
  // Run all immediate timers
  act(() => {
    vi.runAllTimers();
  });

  // Wait for promises to resolve
  await vi.advanceTimersToNextTimerAsync();

  // Final tick to ensure everything is processed
  await Promise.resolve();
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
  setValue: <V = unknown>(path: (string | number)[], value: V) => void;
  clearValue: (path: (string | number)[]) => void;
  deleteField: (path: (string | number)[]) => void;
  validate: (force?: boolean) => boolean;
  hasField: (path: (string | number)[]) => boolean;
  touched: Record<string, boolean>;
  setFieldTouched: (path: (string | number)[], value?: boolean) => void;
  reset: () => void;
}

function TestForm({
  initialValues = {},
  onSubmit = vi.fn(),
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

  return (
    <div>
      <input
        data-testid={`input-${name}`}
        value={value !== undefined && value !== null ? String(value) : ''}
        onChange={(e) => form.setValue(path, e.target.value)}
        aria-invalid={hasError}
      />
      {hasError && (
        <span data-testid={`error-${name}`}>{errors[0].message}</span>
      )}
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

describe('FormProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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
      email: z.string().email('Invalid email format'),
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
    const onSubmit = vi.fn();

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
          <button data-testid="reset-button" onClick={form.reset}>
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

  it('handles server errors correctly', async () => {
    const initialValues = { username: 'testuser', password: 'password' };

    // Mock onSubmit that sets a server error
    const onSubmit = vi.fn(async (values, helpers) => {
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

    // Change a field value to verify error is cleared
    fireEvent.click(screen.getByTestId('change-username'));

    await advanceTimers();

    // Username error should be cleared because the field value changed
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    // Other errors should remain
    expect(screen.getByTestId('email-error')).toBeInTheDocument();
    expect(screen.getByTestId('bio-error')).toBeInTheDocument();

    // Clear all errors
    fireEvent.click(screen.getByTestId('clear-errors'));

    await advanceTimers();

    // All errors should be gone
    expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bio-error')).not.toBeInTheDocument();
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

  it('tests validate function with and without force parameter', async () => {
    const schema = z.object({
      username: z.string().min(3, 'Username must be at least 3 characters'),
      email: z.string().email('Invalid email format'),
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

  it('handles errors thrown in onSubmit by setting them as server errors', async () => {
    const initialValues = { username: 'testuser' };
    const errorMessage = 'Test submission error';

    // Create an onSubmit handler that throws an error
    const onSubmit = vi.fn().mockImplementation(() => {
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

    // Verify the error was caught and set as a server error
    expect(screen.getByTestId('root-error')).toBeInTheDocument();
    expect(screen.getByTestId('root-error').textContent).toBe(errorMessage);
    expect(screen.getByTestId('error-source').textContent).toBe('server');

    // Verify onSubmit was called
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('handles rejected promises in onSubmit by setting them as server errors', async () => {
    const initialValues = { username: 'testuser' };
    const errorMessage = 'Async submission error';

    // Create an onSubmit handler that returns a rejected promise
    const onSubmit = vi.fn().mockImplementation(() => {
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

    // Verify the error was caught and set as a server error
    expect(screen.getByTestId('root-error')).toBeInTheDocument();
    expect(screen.getByTestId('root-error').textContent).toBe(errorMessage);
    expect(screen.getByTestId('error-source').textContent).toBe('server');

    // Verify onSubmit was called
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('validates form on mount when validateOnMount is true', async () => {
    // Schema with validation rules
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      email: z.string().email('Invalid email format'),
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
    const onSubmit = vi.fn(async (values, helpers) => {
      // Simulate server validation with multiple errors
      helpers.setServerErrors([
        { path: ['username'], message: 'Username already taken' },
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
      'Username already taken'
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
    const errorSources = Array.from(
      { length: 3 },
      (_, i) => screen.getByTestId(`error-${i}-source`).textContent
    );

    errorSources.forEach((source) => {
      expect(source).toBe('server');
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

  it('tests getErrorPaths correctly returns error paths with filtering', async () => {
    // Create a schema with multiple validation points across a complex structure
    const schema = z.object({
      user: z.object({
        name: z.string().min(1, 'Name is required'),
        contact: z.object({
          email: z.string().email('Invalid email format'),
          phone: z.string().min(10, 'Phone number is too short'),
        }),
      }),
      preferences: z.object({
        notifications: z.boolean(),
        theme: z.enum(['light', 'dark', 'system'], {
          errorMap: () => ({ message: 'Invalid theme' }),
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
});
