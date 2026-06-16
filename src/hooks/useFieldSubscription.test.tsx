import { describe, it, expect, jest } from 'bun:test';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { z } from 'zod';
import { FormProvider } from '../form-context';
import { useField } from './useField';
import { useArrayField } from './useArrayField';
import { useFormContext } from './useFormContext';

// A field view that reflects exactly what the subscription delivers.
function NameView() {
  const f = useField(['name']);
  return (
    <>
      <span data-testid="val">{(f.value as string) ?? ''}</span>
      <span data-testid="err">{(f.error as string) ?? 'none'}</span>
    </>
  );
}

// The whole point of the suite: a missed notify on any mutation path would leave a
// subscribed field stale. Each test drives the field through one API and asserts the
// subscription reflected it.
describe('useField subscription reflects every mutation path', () => {
  function setup(schema?: z.ZodType<Record<string, unknown>>) {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="setValue"
            onClick={() => form.setValue(['name'], 'typed')}
          />
          <button
            data-testid="setError"
            onClick={() => form.setError(['name'], 'manual-msg')}
          />
          <button
            data-testid="setServerError"
            onClick={() => form.setServerError(['name'], 'server-msg')}
          />
          <button
            data-testid="setServerErrors"
            onClick={() =>
              form.setServerErrors([
                { path: ['name'], message: 'bulk-msg', source: 'server' },
              ])
            }
          />
          <button
            data-testid="clearValue"
            onClick={() => form.clearValue(['name'])}
          />
          <button
            data-testid="touch"
            onClick={() => form.setFieldTouched(['name'], true)}
          />
          <button
            data-testid="validateField"
            onClick={() => form.validateField(['name'])}
          />
          <button
            data-testid="deleteField"
            onClick={() => form.deleteField(['name'])}
          />
          <button data-testid="reset" onClick={() => form.reset()} />
          <button
            data-testid="resetWith"
            onClick={() => form.resetWithValues({ name: 'rewound' })}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: 'init' }}
        schema={schema}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <NameView />
        <Controls />
      </FormProvider>
    );
  }

  it('setValue', () => {
    setup();
    fireEvent.click(screen.getByTestId('setValue'));
    expect(screen.getByTestId('val').textContent).toBe('typed');
  });

  it('setError (manual)', () => {
    setup();
    fireEvent.click(screen.getByTestId('setError'));
    expect(screen.getByTestId('err').textContent).toBe('manual-msg');
  });

  it('setServerError', () => {
    setup();
    fireEvent.click(screen.getByTestId('setServerError'));
    expect(screen.getByTestId('err').textContent).toBe('server-msg');
  });

  it('setServerErrors (bulk)', () => {
    setup();
    fireEvent.click(screen.getByTestId('setServerErrors'));
    expect(screen.getByTestId('err').textContent).toBe('bulk-msg');
  });

  it('clearValue', () => {
    setup();
    fireEvent.click(screen.getByTestId('setValue'));
    fireEvent.click(screen.getByTestId('clearValue'));
    expect(screen.getByTestId('val').textContent).toBe('');
  });

  it('deleteField', () => {
    setup();
    fireEvent.click(screen.getByTestId('deleteField'));
    expect(screen.getByTestId('val').textContent).toBe('');
  });

  it('reset', () => {
    setup();
    fireEvent.click(screen.getByTestId('setValue'));
    fireEvent.click(screen.getByTestId('reset'));
    expect(screen.getByTestId('val').textContent).toBe('init');
  });

  it('resetWithValues', () => {
    setup();
    fireEvent.click(screen.getByTestId('resetWith'));
    expect(screen.getByTestId('val').textContent).toBe('rewound');
  });

  it('setFieldTouched reveals a touch-gated client error', () => {
    const schema = z.object({ name: z.string().min(10, 'too short') });
    setup(schema);
    // A client error exists but the field is untouched, so it's hidden...
    fireEvent.click(screen.getByTestId('validateField')); // also touches it
    expect(screen.getByTestId('err').textContent).toBe('too short');
  });

  it('setFieldTouched alone notifies (gated error appears on touch)', () => {
    const schema = z.object({ name: z.string().min(10, 'too short') });
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="validateNoTouch"
            onClick={() => form.validate(false)}
          />
          <button
            data-testid="touch"
            onClick={() => form.setFieldTouched(['name'], true)}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: 'short' }}
        schema={schema}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <NameView />
        <Controls />
      </FormProvider>
    );
    // validate(false) puts the error in state but doesn't touch -> still hidden.
    fireEvent.click(screen.getByTestId('validateNoTouch'));
    expect(screen.getByTestId('err').textContent).toBe('none');
    // Touching the field reveals it — proving setFieldTouched notifies the field.
    fireEvent.click(screen.getByTestId('touch'));
    expect(screen.getByTestId('err').textContent).toBe('too short');
  });
});

describe('useField subscription cleans up on unmount', () => {
  it('unsubscribes when a field unmounts; the rest keep updating', () => {
    const OtherView = () => {
      const f = useField(['other']);
      return <span data-testid="other">{(f.value as string) ?? ''}</span>;
    };
    const Harness = () => {
      const [showName, setShowName] = useState(true);
      const form = useFormContext();
      return (
        <div>
          {showName && <NameView />}
          <OtherView />
          <button data-testid="hide" onClick={() => setShowName(false)} />
          <button
            data-testid="edit-name"
            onClick={() => form.setValue(['name'], 'after-unmount')}
          />
          <button
            data-testid="edit-other"
            onClick={() => form.setValue(['other'], 'still-works')}
          />
        </div>
      );
    };

    render(
      <FormProvider
        initialValues={{ name: 'init', other: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Harness />
      </FormProvider>
    );

    expect(screen.getByTestId('val').textContent).toBe('init');

    // Unmount the name field, then keep mutating the form. The unmounted field's
    // subscriber must be gone (no stale update / no throw), and other fields work.
    fireEvent.click(screen.getByTestId('hide'));
    expect(screen.queryByTestId('val')).toBeNull();

    fireEvent.click(screen.getByTestId('edit-name')); // targets the gone field
    fireEvent.click(screen.getByTestId('edit-other'));
    expect(screen.getByTestId('other').textContent).toBe('still-works');
  });
});

describe('useArrayField subscription reflects structural mutations', () => {
  function ArrHarness() {
    const { items, add, remove, move, replace } = useArrayField(['items']);
    const form = useFormContext();
    return (
      <div>
        <span data-testid="len">{items.length}</span>
        <span data-testid="first">
          {String((items[0] as { v: string })?.v ?? '')}
        </span>
        <button data-testid="add" onClick={() => add({ v: 'x' })} />
        <button data-testid="remove0" onClick={() => remove(0)} />
        <button data-testid="move" onClick={() => move(0, 1)} />
        <button data-testid="replace" onClick={() => replace([{ v: 'z' }])} />
        <button
          data-testid="reset"
          onClick={() => form.resetWithValues({ items: [] })}
        />
      </div>
    );
  }

  function setupArr() {
    render(
      <FormProvider
        initialValues={{ items: [{ v: 'a' }, { v: 'b' }] }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <ArrHarness />
      </FormProvider>
    );
  }

  it('add', () => {
    setupArr();
    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByTestId('len').textContent).toBe('3');
  });

  it('remove', () => {
    setupArr();
    fireEvent.click(screen.getByTestId('remove0'));
    expect(screen.getByTestId('len').textContent).toBe('1');
    expect(screen.getByTestId('first').textContent).toBe('b');
  });

  it('move', () => {
    setupArr();
    fireEvent.click(screen.getByTestId('move'));
    expect(screen.getByTestId('first').textContent).toBe('b');
  });

  it('replace', () => {
    setupArr();
    fireEvent.click(screen.getByTestId('replace'));
    expect(screen.getByTestId('len').textContent).toBe('1');
    expect(screen.getByTestId('first').textContent).toBe('z');
  });

  it('resetWithValues', () => {
    setupArr();
    fireEvent.click(screen.getByTestId('reset'));
    expect(screen.getByTestId('len').textContent).toBe('0');
  });
});
