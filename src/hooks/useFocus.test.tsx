import { describe, it, expect, jest } from 'bun:test';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { z } from 'zod';
import { FormProvider, type FormHelpers } from '../form-context';
import { useField } from './useField';
import { useFormContext } from './useFormContext';

// A field that registers its <input> via useField's ref.
function Field({ name }: { name: string }) {
  const { value, setValue, inputRef } = useField([name]);
  return (
    <input
      data-testid={name}
      ref={inputRef}
      value={(value as string) ?? ''}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

describe('setFocus', () => {
  it('focuses a registered field by path', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <button data-testid="focus-b" onClick={() => form.setFocus(['b'])} />
      );
    };
    render(
      <FormProvider
        initialValues={{ a: '', b: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Field name="a" />
        <Field name="b" />
        <Controls />
      </FormProvider>
    );

    expect(document.activeElement).not.toBe(screen.getByTestId('b'));
    fireEvent.click(screen.getByTestId('focus-b'));
    expect(document.activeElement).toBe(screen.getByTestId('b'));
  });

  it('returns false for an unregistered path', () => {
    const results: boolean[] = [];
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="focus-missing"
          onClick={() => results.push(form.setFocus(['nope']))}
        />
      );
    };
    render(
      <FormProvider
        initialValues={{ a: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Field name="a" />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('focus-missing'));
    expect(results).toEqual([false]);
  });

  it('unregisters on unmount (focusing a gone field returns false)', () => {
    const results: boolean[] = [];
    const Harness = () => {
      const [show, setShow] = useState(true);
      const form = useFormContext();
      return (
        <div>
          {show && <Field name="a" />}
          <button data-testid="hide" onClick={() => setShow(false)} />
          <button
            data-testid="focus-a"
            onClick={() => results.push(form.setFocus(['a']))}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ a: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Harness />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('focus-a'));
    fireEvent.click(screen.getByTestId('hide'));
    fireEvent.click(screen.getByTestId('focus-a'));
    expect(results).toEqual([true, false]);
  });
});

describe('focusFirstError', () => {
  const schema = z.object({
    a: z.string().min(1, 'a required'),
    b: z.string().min(1, 'b required'),
    c: z.string().min(1, 'c required'),
  });

  it('focuses the first errored field in registration order', () => {
    const paths: Array<(string | number)[] | null> = [];
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="focus-err"
          onClick={() => {
            form.validate(true); // populate errors + touch all
            paths.push(form.focusFirstError());
          }}
        />
      );
    };
    render(
      <FormProvider
        initialValues={{ a: '', b: '', c: '' }}
        schema={schema}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Field name="a" />
        <Field name="b" />
        <Field name="c" />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('focus-err'));
    expect(document.activeElement).toBe(screen.getByTestId('a'));
    expect(paths).toEqual([['a']]);
  });

  it('skips valid fields and focuses the first one that actually errors', () => {
    const paths: Array<(string | number)[] | null> = [];
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="focus-err"
          onClick={() => {
            form.validate(true);
            paths.push(form.focusFirstError());
          }}
        />
      );
    };
    render(
      <FormProvider
        // a and c are valid; only b is empty -> only b errors.
        initialValues={{ a: 'ok', b: '', c: 'ok' }}
        schema={schema}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Field name="a" />
        <Field name="b" />
        <Field name="c" />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('focus-err'));
    expect(document.activeElement).toBe(screen.getByTestId('b'));
    expect(paths).toEqual([['b']]);
  });

  it('returns null when nothing errors', () => {
    const paths: Array<(string | number)[] | null> = [];
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="focus-err"
          onClick={() => {
            form.validate(true);
            paths.push(form.focusFirstError());
          }}
        />
      );
    };
    render(
      <FormProvider
        initialValues={{ a: 'ok', b: 'ok', c: 'ok' }}
        schema={schema}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Field name="a" />
        <Field name="b" />
        <Field name="c" />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('focus-err'));
    expect(paths).toEqual([null]);
  });

  it('is available on FormHelpers (focus after a handler sets a server error)', async () => {
    const onSubmit = async (
      _values: { a: string; b: string },
      helpers: FormHelpers<{ a: string; b: string }>
    ) => {
      helpers.setServerError(['b'], 'taken');
      helpers.focusFirstError();
    };
    const Controls = () => {
      const form = useFormContext();
      return <button data-testid="submit" onClick={() => form.submit()} />;
    };
    render(
      <FormProvider
        initialValues={{ a: 'ok', b: 'ok' }}
        onSubmit={onSubmit}
        validateOnChange={false}
      >
        <Field name="a" />
        <Field name="b" />
        <Controls />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    expect(document.activeElement).toBe(screen.getByTestId('b'));
  });
});
