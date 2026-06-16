import { describe, it, expect, jest } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { z } from 'zod';
import { FormProvider } from '../form-context';
import { useField } from './useField';
import { useFormContext } from './useFormContext';
import { serializePath } from '../utils';

const schema = z.object({ name: z.string().min(2, 'Too short') });

function Probe() {
  const field = useField(['name']);
  const { touched } = useFormContext();
  return (
    <div>
      <input
        data-testid="input"
        value={(field.value as string) ?? ''}
        onChange={(e) => field.props.onChange(e.target.value)}
        onBlur={field.props.onBlur}
      />
      <div data-testid="value">{String(field.value ?? '')}</div>
      <div data-testid="error">{(field.error as string) ?? ''}</div>
      <div data-testid="touched">
        {touched[serializePath(['name'])] ? 'yes' : 'no'}
      </div>
      {/* setValue (unlike props.onChange) also marks the field touched */}
      <button data-testid="set-invalid" onClick={() => field.setValue('A')}>
        set invalid
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <FormProvider
      initialValues={{ name: 'Ada' }}
      schema={schema}
      onSubmit={jest.fn()}
    >
      <Probe />
    </FormProvider>
  );
}

describe('useField', () => {
  it('exposes the current value, no error, untouched initially', () => {
    renderProbe();
    expect(screen.getByTestId('value').textContent).toBe('Ada');
    expect(screen.getByTestId('error').textContent).toBe('');
    expect(screen.getByTestId('touched').textContent).toBe('no');
  });

  it('props.onChange updates the value', () => {
    renderProbe();
    fireEvent.change(screen.getByTestId('input'), { target: { value: 'Bob' } });
    expect(screen.getByTestId('value').textContent).toBe('Bob');
  });

  it('setValue marks the field touched and surfaces validation errors', () => {
    renderProbe();
    fireEvent.click(screen.getByTestId('set-invalid'));
    expect(screen.getByTestId('value').textContent).toBe('A');
    expect(screen.getByTestId('touched').textContent).toBe('yes');
    expect(screen.getByTestId('error').textContent).toBe('Too short');
  });
});

describe('useFormContext', () => {
  it('throws when used outside a FormProvider', () => {
    function Orphan() {
      useFormContext();
      return null;
    }
    // React logs the thrown render error; silence it for clean output.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(
      'useFormContext must be used within a FormProvider'
    );
    spy.mockRestore();
  });
});
