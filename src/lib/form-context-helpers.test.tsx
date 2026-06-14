import { describe, it, expect, jest, afterEach } from 'bun:test';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { z } from 'zod';
import { FormProvider, FormHelpers } from './form-context';
import { useFormContext } from './hooks/useFormContext';
import { useField } from './hooks/useField';
import { serializePath } from './utils';

/**
 * Exercises the `helpers` object passed to `onSubmit` — a large surface that is
 * only reached when a submit handler actually calls each helper.
 */
describe('FormProvider onSubmit helpers', () => {
  afterEach(() => jest.restoreAllMocks());

  it('exposes a working helpers surface to onSubmit', async () => {
    // reset/resetWithValues warn when called mid-submit; silence the noise.
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const captured: {
      ran?: boolean;
      isCurrent?: boolean;
      hasField?: boolean;
      valid?: boolean;
      id?: string | null;
    } = {};

    const onSubmit = (
      _values: Record<string, unknown>,
      helpers: FormHelpers<Record<string, unknown>>
    ) => {
      helpers.setValue(['name'], 'changed');
      helpers.setFieldTouched(['name'], true);
      helpers.setErrors([{ path: ['name'], message: 'e', source: 'client' }]);
      helpers.setServerErrors([
        { path: ['name'], message: 's', source: 'server' },
      ]);
      helpers.setServerError(['name'], 'one');
      helpers.clearValue(['name']);
      helpers.deleteField(['extra']);
      helpers.setClientSubmissionError('cse');
      helpers.clearClientSubmissionError();
      helpers.getClientSubmissionError();
      helpers.reset();
      helpers.resetWithValues({ name: 'x' });

      captured.hasField = helpers.hasField(['name']);
      captured.valid = helpers.validate();
      captured.id = helpers.currentSubmissionID;
      captured.isCurrent = helpers.isCurrentSubmission(
        helpers.currentSubmissionID as string
      );
      captured.ran = true;
    };

    function Probe() {
      const form = useFormContext();
      return (
        <button data-testid="submit" onClick={() => form.submit()}>
          submit
        </button>
      );
    }

    render(
      <FormProvider initialValues={{ name: 'a', extra: 1 }} onSubmit={onSubmit}>
        <Probe />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('submit'));

    await waitFor(() => expect(captured.ran).toBe(true));
    expect(captured.isCurrent).toBe(true);
    expect(captured.hasField).toBe(true);
    expect(typeof captured.id).toBe('string');
  });
});

describe('deleteField', () => {
  it('drops/re-indexes errors on later array items when one is removed', () => {
    function Probe() {
      const form = useFormContext();
      const e0 = useField(['items', 0, 'name']);
      const e1 = useField(['items', 1, 'name']);
      return (
        <div>
          <div data-testid="e0">{(e0.error as string) ?? ''}</div>
          <div data-testid="e1">{(e1.error as string) ?? ''}</div>
          <button
            data-testid="seed"
            onClick={() =>
              form.setServerErrors([
                { path: ['items', 1, 'name'], message: 'E1', source: 'server' },
                { path: ['items', 2, 'name'], message: 'E2', source: 'server' },
              ])
            }
          >
            seed
          </button>
          <button
            data-testid="del0"
            onClick={() => form.deleteField(['items', 0])}
          >
            delete index 0
          </button>
        </div>
      );
    }
    render(
      <FormProvider
        initialValues={{ items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    fireEvent.click(screen.getByTestId('seed'));
    expect(screen.getByTestId('e1').textContent).toBe('E1');

    fireEvent.click(screen.getByTestId('del0'));
    // Deleting an array item clears existing errors under that array (a schema,
    // if present, regenerates them via re-validation). Without a schema here,
    // they simply drop.
    expect(screen.getByTestId('e0').textContent).toBe('');
    expect(screen.getByTestId('e1').textContent).toBe('');
  });

  it('re-validates and surfaces a new error after deleting a required field', () => {
    const schema = z.object({
      keep: z.string().min(1),
      drop: z.string().min(1),
    });
    function Probe() {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="count">{form.getError(['drop']).length}</div>
          <button data-testid="del" onClick={() => form.deleteField(['drop'])}>
            delete drop
          </button>
        </div>
      );
    }
    render(
      <FormProvider
        initialValues={{ keep: 'x', drop: 'y' }}
        schema={schema}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    expect(screen.getByTestId('count').textContent).toBe('0');
    fireEvent.click(screen.getByTestId('del'));
    expect(Number(screen.getByTestId('count').textContent)).toBeGreaterThan(0);
  });

  it("does not resurrect a deleted item's server error on a later setServerError", () => {
    // Regression: deleteField filtered errorsRef but left serverErrorsRef stale, so
    // the next setServerError() rebuilt combined errors from that stale baseline and
    // brought the removed item's server error back.
    function Probe() {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="i0">
            {form.getError(['items', 0, 'name'])[0]?.message ?? ''}
          </div>
          <div data-testid="other">
            {form.getError(['other'])[0]?.message ?? ''}
          </div>
          <button
            data-testid="seed"
            onClick={() =>
              form.setServerErrors([
                {
                  path: ['items', 0, 'name'],
                  message: 'item0 srv',
                  source: 'server',
                },
                { path: ['other'], message: 'other srv', source: 'server' },
              ])
            }
          >
            seed
          </button>
          <button
            data-testid="del"
            onClick={() => form.deleteField(['items', 0])}
          >
            delete item 0
          </button>
          <button
            data-testid="bump"
            onClick={() => form.setServerError(['other'], 'other srv2')}
          >
            bump other
          </button>
        </div>
      );
    }
    render(
      <FormProvider
        initialValues={{ items: [{ name: 'a' }, { name: 'b' }], other: 'x' }}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    fireEvent.click(screen.getByTestId('seed'));
    expect(screen.getByTestId('i0').textContent).toBe('item0 srv');

    // Deleting item 0 drops its error from the display immediately.
    fireEvent.click(screen.getByTestId('del'));
    expect(screen.getByTestId('i0').textContent).toBe('');

    // Updating an UNRELATED server error rebuilds from the server-error baseline.
    // The deleted item's error must NOT come back.
    fireEvent.click(screen.getByTestId('bump'));
    expect(screen.getByTestId('other').textContent).toBe('other srv2');
    expect(screen.getByTestId('i0').textContent).toBe('');
  });
});

describe('validateOnMount touch behavior', () => {
  const schema = z.object({
    filled: z.string().min(2, 'too short'),
    empty: z.string().min(2, 'required'),
  });

  function Probe() {
    const form = useFormContext();
    const touched = (key: string) =>
      form.touched[serializePath([key])] ? 'yes' : 'no';
    return (
      <div>
        <div data-testid="filled">{touched('filled')}</div>
        <div data-testid="empty">{touched('empty')}</div>
        <div data-testid="canSubmit">{form.canSubmit ? 'yes' : 'no'}</div>
      </div>
    );
  }

  it('touches only populated fields by default (and still validates)', () => {
    render(
      <FormProvider
        initialValues={{ filled: 'x', empty: '' }}
        schema={schema}
        validateOnMount
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    expect(screen.getByTestId('filled').textContent).toBe('yes'); // populated -> touched
    expect(screen.getByTestId('empty').textContent).toBe('no'); // empty -> untouched
    expect(screen.getByTestId('canSubmit').textContent).toBe('no'); // still validated
  });

  it('touchAllOnMount marks every field touched', () => {
    render(
      <FormProvider
        initialValues={{ filled: 'x', empty: '' }}
        schema={schema}
        validateOnMount
        touchAllOnMount
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    expect(screen.getByTestId('filled').textContent).toBe('yes');
    expect(screen.getByTestId('empty').textContent).toBe('yes');
  });
});

describe('resetWithValues(force) mid-submit', () => {
  it('invalidates the in-flight submission (clears the ID; stale helper writes no-op)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const captured: { id?: string | null; stillCurrent?: boolean } = {};

    const onSubmit = async (
      _v: Record<string, unknown>,
      helpers: FormHelpers<Record<string, unknown>>
    ) => {
      captured.id = helpers.currentSubmissionID;
      await gate; // pause mid-flight so the test can force-reset
      // After the force-reset below, this submission is no longer current...
      captured.stillCurrent = helpers.isCurrentSubmission(
        captured.id as string
      );
      // ...so this stale write must no-op.
      helpers.setServerError(['name'], 'stale');
    };

    function Probe() {
      const form = useFormContext();
      return (
        <div>
          <div data-testid="err">
            {form.getError(['name'])[0]?.message ?? ''}
          </div>
          <div data-testid="subid">{String(form.currentSubmissionID)}</div>
          <button data-testid="submit" onClick={() => form.submit()}>
            submit
          </button>
          <button
            data-testid="reset"
            onClick={() => form.resetWithValues({ name: 'fresh' }, true)}
          >
            reset
          </button>
        </div>
      );
    }

    render(
      <FormProvider initialValues={{ name: 'a' }} onSubmit={onSubmit}>
        <Probe />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('submit'));
    // Submission has started and is paused at the gate.
    await waitFor(() => expect(captured.id).toBeTruthy());
    expect(screen.getByTestId('subid').textContent).not.toBe('null');

    // Force-reset mid-flight -> should clear currentSubmissionID (matching reset()).
    fireEvent.click(screen.getByTestId('reset'));
    expect(screen.getByTestId('subid').textContent).toBe('null');

    // Let onSubmit finish; its post-await writes should be ignored as stale.
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(captured.stillCurrent).toBe(false));
    expect(screen.getByTestId('err').textContent).toBe('');
  });
});

describe('initialServerErrors', () => {
  function Probe() {
    const form = useFormContext();
    return (
      <div>
        <div data-testid="root">{form.getError([])[0]?.message ?? ''}</div>
        <div data-testid="name">
          {form.getError(['name'])[0]?.message ?? ''}
        </div>
        <button
          data-testid="replace"
          onClick={() => form.setServerError(['name'], 'replaced')}
        >
          replace
        </button>
        <button data-testid="reset" onClick={() => form.reset()}>
          reset
        </button>
      </div>
    );
  }

  it('seeds server errors at mount (touch-independent) and normalizes source', () => {
    render(
      <FormProvider
        initialValues={{ name: 'a' }}
        initialServerErrors={[
          { path: [], message: 'root boom' },
          { path: ['name'], message: 'name boom' },
        ]}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    // Shown immediately without any field being touched.
    expect(screen.getByTestId('root').textContent).toBe('root boom');
    expect(screen.getByTestId('name').textContent).toBe('name boom');
  });

  it('merges from the seeded baseline when the API updates a field later', () => {
    render(
      <FormProvider
        initialValues={{ name: 'a' }}
        initialServerErrors={[
          { path: [], message: 'root boom' },
          { path: ['name'], message: 'name boom' },
        ]}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    fireEvent.click(screen.getByTestId('replace'));
    // The targeted path is replaced; the untouched seeded root error survives.
    expect(screen.getByTestId('name').textContent).toBe('replaced');
    expect(screen.getByTestId('root').textContent).toBe('root boom');
  });

  it('survives validateOnMount even when all values are schema-valid', () => {
    // Regression: performInitialValidation used to overwrite errors with only
    // the (empty) validation result, wiping seeded server errors on mount.
    const schema = z.object({ name: z.string().min(1) });
    render(
      <FormProvider
        initialValues={{ name: 'valid' }} // passes schema -> no validation errors
        schema={schema}
        validateOnMount
        initialServerErrors={[
          { path: [], message: 'root boom' },
          { path: ['name'], message: 'name boom' },
        ]}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    expect(screen.getByTestId('root').textContent).toBe('root boom');
    expect(screen.getByTestId('name').textContent).toBe('name boom');
  });

  it('does not restore seeded server errors after reset()', () => {
    render(
      <FormProvider
        initialValues={{ name: 'a' }}
        initialServerErrors={[{ path: ['name'], message: 'name boom' }]}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    expect(screen.getByTestId('name').textContent).toBe('name boom');
    fireEvent.click(screen.getByTestId('reset'));
    expect(screen.getByTestId('name').textContent).toBe('');
  });
});

describe('setFieldTouched(path, false)', () => {
  it('explicitly untouches a previously-touched field', () => {
    function Probe() {
      const form = useFormContext();
      const key = serializePath(['name']);
      return (
        <div>
          <div data-testid="touched">{form.touched[key] ? 'yes' : 'no'}</div>
          <button
            data-testid="touch"
            onClick={() => form.setFieldTouched(['name'], true)}
          >
            touch
          </button>
          <button
            data-testid="untouch"
            onClick={() => form.setFieldTouched(['name'], false)}
          >
            untouch
          </button>
        </div>
      );
    }
    render(
      <FormProvider initialValues={{ name: 'a' }} onSubmit={jest.fn()}>
        <Probe />
      </FormProvider>
    );
    fireEvent.click(screen.getByTestId('touch'));
    expect(screen.getByTestId('touched').textContent).toBe('yes');
    fireEvent.click(screen.getByTestId('untouch'));
    expect(screen.getByTestId('touched').textContent).toBe('no');
  });
});

describe('hasField path edge cases', () => {
  it('returns false for invalid, out-of-bounds, and primitive-traversal paths', () => {
    const captured: Record<string, boolean> = {};
    function Probe() {
      const form = useFormContext();
      captured.exists = form.hasField(['name']);
      captured.missingKey = form.hasField(['nope']);
      captured.throughPrimitive = form.hasField(['name', 'sub']); // 590: descend into a string
      captured.outOfBounds = form.hasField(['items', 5]); // 600: array index past length
      captured.inBounds = form.hasField(['items', 0]);
      return null;
    }
    render(
      <FormProvider
        initialValues={{ name: 'a', items: [1, 2] }}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    expect(captured.exists).toBe(true);
    expect(captured.missingKey).toBe(false);
    expect(captured.throughPrimitive).toBe(false);
    expect(captured.outOfBounds).toBe(false);
    expect(captured.inBounds).toBe(true);
  });
});

describe('useFormTag native submit', () => {
  it('preventDefaults and submits when the form element fires submit', async () => {
    const onSubmit = jest.fn();
    render(
      <FormProvider
        initialValues={{ name: 'a' }}
        useFormTag
        formProps={{ 'data-testid': 'form' } as Record<string, unknown>}
        onSubmit={onSubmit}
      >
        <button type="submit">go</button>
      </FormProvider>
    );
    fireEvent.submit(screen.getByTestId('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});

describe('handleBlur (raw-context blur)', () => {
  const schema = z.object({ name: z.string().min(2, 'too short') });

  function Probe() {
    const form = useFormContext();
    return (
      <div>
        <div data-testid="err">{form.getError(['name'])[0]?.message ?? ''}</div>
        <div data-testid="touched">
          {form.touched[serializePath(['name'])] ? 'yes' : 'no'}
        </div>
        <input data-testid="input" onBlur={() => form.handleBlur(['name'])} />
      </div>
    );
  }

  it('marks touched and validates on blur when validateOnBlur is on', () => {
    render(
      <FormProvider
        initialValues={{ name: '' }}
        schema={schema}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    fireEvent.blur(screen.getByTestId('input'));
    expect(screen.getByTestId('touched').textContent).toBe('yes');
    expect(screen.getByTestId('err').textContent).toBe('too short');
  });

  it('marks touched but does NOT validate when validateOnBlur is false', () => {
    render(
      <FormProvider
        initialValues={{ name: '' }}
        schema={schema}
        validateOnBlur={false}
        onSubmit={jest.fn()}
      >
        <Probe />
      </FormProvider>
    );
    fireEvent.blur(screen.getByTestId('input'));
    expect(screen.getByTestId('touched').textContent).toBe('yes');
    expect(screen.getByTestId('err').textContent).toBe('');
  });
});
