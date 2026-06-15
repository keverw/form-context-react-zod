import { describe, it, expect, jest } from 'bun:test';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FormProvider, type FormHelpers } from '../form-context';
import { useFormContext } from './useFormContext';
import { serializePath } from '../utils';

// A probe that surfaces isDirty + a couple of dirtyFields keys, plus buttons to
// drive every baseline-moving path (edit, markPristine overloads, reset).
function Probe({ paths = [] as (string | number)[][] }) {
  const form = useFormContext();
  return (
    <div>
      <span data-testid="isDirty">{String(form.isDirty)}</span>
      {paths.map((p) => (
        <span key={serializePath(p)} data-testid={`dirty:${serializePath(p)}`}>
          {String(Boolean(form.dirtyFields[serializePath(p)]))}
        </span>
      ))}
    </div>
  );
}

describe('isDirty / dirtyFields', () => {
  it('starts clean and turns dirty on an edit, clean again when reverted', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => form.setValue(['name'], 'changed')}
          />
          <button
            data-testid="revert"
            onClick={() => form.setValue(['name'], 'init')}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: 'init' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <Controls />
      </FormProvider>
    );

    expect(screen.getByTestId('isDirty').textContent).toBe('false');
    fireEvent.click(screen.getByTestId('edit'));
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
    expect(screen.getByTestId('dirty:["name"]').textContent).toBe('true');
    // Reverting to the baseline value reads clean again (derived, not latched).
    fireEvent.click(screen.getByTestId('revert'));
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
    expect(screen.getByTestId('dirty:["name"]').textContent).toBe('false');
  });

  it('tracks dirty per field independently', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="edit-b"
          onClick={() => form.setValue(['b'], 'x')}
        />
      );
    };
    render(
      <FormProvider
        initialValues={{ a: '1', b: '2' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['a'], ['b']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit-b'));
    expect(screen.getByTestId('dirty:["a"]').textContent).toBe('false');
    expect(screen.getByTestId('dirty:["b"]').textContent).toBe('true');
  });

  it('marks the array path when its contents change', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="push"
          onClick={() =>
            form.setValue(['items'], [
              ...(form.getValue(['items']) as number[]),
              3,
            ])
          }
        />
      );
    };
    render(
      <FormProvider
        initialValues={{ items: [1, 2] }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['items']]} />
        <Controls />
      </FormProvider>
    );

    expect(screen.getByTestId('dirty:["items"]').textContent).toBe('false');
    fireEvent.click(screen.getByTestId('push'));
    expect(screen.getByTestId('dirty:["items"]').textContent).toBe('true');
  });

  it('recursively marks every field under a dirty array (incl. a deep nested edit)', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="edit-deep"
          // Edit the DEEPEST field: sections[0].questions[0].q
          onClick={() =>
            form.setValue(['sections', 0, 'questions', 0, 'q'], 'changed')
          }
        />
      );
    };
    render(
      <FormProvider
        initialValues={{
          sections: [{ title: 'Intro', questions: [{ q: 'Name?' }] }],
        }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe
          paths={[
            ['sections'],
            ['sections', 0, 'title'],
            ['sections', 0, 'questions'],
            ['sections', 0, 'questions', 0, 'q'],
          ]}
        />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit-deep'));
    // The whole subtree under the dirty array reads dirty — the array path, the
    // sibling `title` the user didn't touch, the nested array, and the edited leaf.
    expect(screen.getByTestId('dirty:["sections"]').textContent).toBe('true');
    expect(screen.getByTestId('dirty:["sections",0,"title"]').textContent).toBe(
      'true'
    );
    expect(
      screen.getByTestId('dirty:["sections",0,"questions"]').textContent
    ).toBe('true');
    expect(
      screen.getByTestId('dirty:["sections",0,"questions",0,"q"]').textContent
    ).toBe('true');
  });

  it('a reorder marks the whole array subtree dirty', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="reorder"
          // Same items, swapped order — content unchanged, position changed.
          onClick={() =>
            form.setValue(['rows'], [
              { label: 'b' },
              { label: 'a' },
            ])
          }
        />
      );
    };
    render(
      <FormProvider
        initialValues={{ rows: [{ label: 'a' }, { label: 'b' }] }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['rows'], ['rows', 0, 'label'], ['rows', 1, 'label']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('reorder'));
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
    expect(screen.getByTestId('dirty:["rows"]').textContent).toBe('true');
    expect(screen.getByTestId('dirty:["rows",0,"label"]').textContent).toBe(
      'true'
    );
    expect(screen.getByTestId('dirty:["rows",1,"label"]').textContent).toBe(
      'true'
    );
  });

  it('an object sibling OUTSIDE the array stays clean (objects are key-precise)', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="edit-list"
          onClick={() => form.setValue(['list', 0], 'x')}
        />
      );
    };
    render(
      <FormProvider
        initialValues={{ meta: { a: '1', b: '2' }, list: ['', ''] }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['list'], ['meta', 'a'], ['meta', 'b']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit-list'));
    // The array is dirty...
    expect(screen.getByTestId('dirty:["list"]').textContent).toBe('true');
    // ...but the unrelated object's fields are untouched (no over-marking).
    expect(screen.getByTestId('dirty:["meta","a"]').textContent).toBe('false');
    expect(screen.getByTestId('dirty:["meta","b"]').textContent).toBe('false');
  });

  it('reset() returns the dirty baseline to initialValues (clean)', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => form.setValue(['name'], 'changed')}
          />
          <button data-testid="reset" onClick={() => form.reset()} />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: 'init' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit'));
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
    fireEvent.click(screen.getByTestId('reset'));
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
  });

  it('resetWithValues() rebaselines to the new values (clean)', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="resetWith"
          onClick={() => form.resetWithValues({ name: 'fresh' })}
        />
      );
    };
    render(
      <FormProvider
        initialValues={{ name: 'init' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('resetWith'));
    // Values changed wholesale but the baseline followed — so it's clean, not dirty.
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
  });
});

describe('markPristine', () => {
  it('whole-form: bakes the current edits into the baseline (clean)', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => form.setValue(['name'], 'changed')}
          />
          <button data-testid="mark" onClick={() => form.markPristine()} />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: 'init' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit'));
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
    fireEvent.click(screen.getByTestId('mark'));
    // Baseline moved to current values -> clean, without touching values.
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
  });

  it('does NOT mutate values/errors/touched (baseline-only)', () => {
    const captured: Array<{
      value: unknown;
      touched: boolean;
      errCount: number;
    }> = [];
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => form.setValue(['name'], 'changed')}
          />
          <button
            data-testid="mark"
            onClick={() => {
              form.markPristine();
              captured.push({
                value: form.getValue(['name']),
                touched: form.getFieldState(['name']).isTouched,
                errCount: form.errors.length,
              });
            }}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: 'init' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit'));
    fireEvent.click(screen.getByTestId('mark'));
    // The edit already touched the field; markPristine leaves value/touched/errors
    // exactly as they were (it only moved the baseline) — touched stays true, the
    // value stays 'changed' (not reverted), no errors were introduced.
    expect(captured[0]).toEqual({
      value: 'changed',
      touched: true,
      errCount: 0,
    });
  });

  it('single field: scopes the baseline to one path', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit-both"
            onClick={() => {
              form.setValue(['a'], 'A');
              form.setValue(['b'], 'B');
            }}
          />
          <button
            data-testid="mark-a"
            onClick={() => form.markPristine(['a'])}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ a: '', b: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['a'], ['b']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit-both'));
    fireEvent.click(screen.getByTestId('mark-a'));
    // Only a's baseline moved; b is still dirty, form stays dirty overall.
    expect(screen.getByTestId('dirty:["a"]').textContent).toBe('false');
    expect(screen.getByTestId('dirty:["b"]').textContent).toBe('true');
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
  });

  it('explicit value: baselines to what persisted; later edits stay dirty', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="type"
            onClick={() => form.setValue(['name'], '  Bob  ')}
          />
          {/* Server persisted the trimmed value, so baseline to that. */}
          <button
            data-testid="mark-trimmed"
            onClick={() => form.markPristine(['name'], 'Bob')}
          />
          <button
            data-testid="keep-typing"
            onClick={() => form.setValue(['name'], 'Bobby')}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('type'));
    // The live value is '  Bob  ' but the baseline becomes 'Bob' -> still dirty
    // because the untrimmed input doesn't match what persisted.
    fireEvent.click(screen.getByTestId('mark-trimmed'));
    expect(screen.getByTestId('dirty:["name"]').textContent).toBe('true');
  });

  it('batch: rebaselines many fields from a server-returned partial', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => {
              form.setValue(['first'], 'jane');
              form.setValue(['last'], 'doe');
            }}
          />
          {/* The save returns the canonical record (normalized casing). */}
          <button
            data-testid="commit"
            onClick={() =>
              form.markPristine({ first: 'Jane', last: 'Doe' })
            }
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ first: '', last: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['first'], ['last']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit'));
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
    fireEvent.click(screen.getByTestId('commit'));
    // Both fields' live values differ from the server's normalized casing, so
    // both stay dirty — the user's lowercase input wasn't what persisted.
    expect(screen.getByTestId('dirty:["first"]').textContent).toBe('true');
    expect(screen.getByTestId('dirty:["last"]').textContent).toBe('true');
  });

  it('batch: fields matching the server record go clean, untouched edits stay dirty', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => {
              form.setValue(['first'], 'Jane');
              form.setValue(['last'], 'doe-WIP');
            }}
          />
          {/* Only `first` matches what came back; `last` was still being edited. */}
          <button
            data-testid="commit"
            onClick={() =>
              form.markPristine({ first: 'Jane', last: 'Doe' })
            }
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ first: '', last: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['first'], ['last']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit'));
    fireEvent.click(screen.getByTestId('commit'));
    expect(screen.getByTestId('dirty:["first"]').textContent).toBe('false');
    expect(screen.getByTestId('dirty:["last"]').textContent).toBe('true');
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
  });

  it('batch: only moves the named leaves, leaving sibling baselines intact', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit-name"
            onClick={() => form.setValue(['name'], 'typed')}
          />
          {/* Commit only `name`. `clean` was never edited and must STAY clean —
              a batch that replaced the whole baseline would drop clean's baseline
              and wrongly flag it dirty. `dirtyOther` was edited and stays dirty. */}
          <button
            data-testid="edit-dirty-other"
            onClick={() => form.setValue(['dirtyOther'], 'wip')}
          />
          <button
            data-testid="commit-name"
            onClick={() => form.markPristine({ name: 'typed' })}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: '', clean: 'untouched', dirtyOther: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['name'], ['clean'], ['dirtyOther']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit-name'));
    fireEvent.click(screen.getByTestId('edit-dirty-other'));
    fireEvent.click(screen.getByTestId('commit-name'));
    // name matches its new baseline -> clean.
    expect(screen.getByTestId('dirty:["name"]').textContent).toBe('false');
    // clean was never in the batch and never edited -> its baseline survived.
    expect(screen.getByTestId('dirty:["clean"]').textContent).toBe('false');
    // dirtyOther was edited and not committed -> still dirty.
    expect(screen.getByTestId('dirty:["dirtyOther"]').textContent).toBe('true');
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
  });

  it('exposed on FormHelpers: re-baselines from inside onSubmit', async () => {
    const onSubmit = async (
      _values: { name: string },
      helpers: FormHelpers<{ name: string }>
    ) => {
      // The save persisted the typed value; baseline to it so the form goes clean.
      helpers.markPristine({ name: 'typed' });
    };
    const App = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => form.setValue(['name'], 'typed')}
          />
          <button data-testid="submit" onClick={() => form.submit()} />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: '' }}
        onSubmit={onSubmit}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <App />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit'));
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
  });

  it('helper forwarding preserves argument count (path-only -> current value)', async () => {
    // helpers.markPristine(['name']) must default to the CURRENT value, not be
    // forwarded as markPristine(['name'], undefined) (which would baseline to
    // undefined and leave the field dirty). Guards the ...args forwarding.
    const onSubmit = async (
      _values: { name: string },
      helpers: FormHelpers<{ name: string }>
    ) => {
      helpers.markPristine(['name']);
    };
    const App = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => form.setValue(['name'], 'X')}
          />
          <button data-testid="submit" onClick={() => form.submit()} />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: '' }}
        onSubmit={onSubmit}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <App />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    // Baselined to current 'X' -> clean. If the count were lost, it'd baseline to
    // undefined and stay dirty.
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
  });
});

describe('markPristine — edge cases', () => {
  it('empty path baselines the whole form (same as no args)', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => {
              form.setValue(['a'], 'A');
              form.setValue(['b'], 'B');
            }}
          />
          <button
            data-testid="mark-empty"
            onClick={() => form.markPristine([])}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ a: '', b: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['a'], ['b']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit'));
    fireEvent.click(screen.getByTestId('mark-empty'));
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
  });

  it('explicit undefined value baselines to undefined (distinct from no value)', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="type"
            onClick={() => form.setValue(['name'], 'typed')}
          />
          {/* Explicit second arg: baseline to undefined, NOT the current value.
              The live 'typed' won't match undefined -> stays dirty. Guards the
              arguments.length distinction. */}
          <button
            data-testid="mark-undef"
            onClick={() => form.markPristine(['name'], undefined)}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('type'));
    fireEvent.click(screen.getByTestId('mark-undef'));
    expect(screen.getByTestId('dirty:["name"]').textContent).toBe('true');
  });

  it('baselines a subtree (object path) to its current value', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => form.setValue(['user', 'name'], 'Bob')}
          />
          <button
            data-testid="mark-user"
            onClick={() => form.markPristine(['user'])}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ user: { name: '', age: 0 } }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['user', 'name']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit'));
    expect(screen.getByTestId('dirty:["user","name"]').textContent).toBe('true');
    fireEvent.click(screen.getByTestId('mark-user'));
    expect(screen.getByTestId('dirty:["user","name"]').textContent).toBe(
      'false'
    );
  });

  it('batch accepts a NESTED partial mirroring the values shape', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="edit"
            onClick={() => form.setValue(['user', 'name'], 'Jane')}
          />
          <button
            data-testid="commit"
            onClick={() => form.markPristine({ user: { name: 'Jane' } })}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ user: { name: '', age: 0 } }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['user', 'name']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('edit'));
    fireEvent.click(screen.getByTestId('commit'));
    expect(screen.getByTestId('dirty:["user","name"]').textContent).toBe(
      'false'
    );
  });

  it('reset() returns to initialValues even after markPristine drifted the baseline', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="type-save"
            onClick={() => form.setValue(['name'], 'saved')}
          />
          <button data-testid="commit" onClick={() => form.markPristine()} />
          <button
            data-testid="type-more"
            onClick={() => form.setValue(['name'], 'more')}
          />
          <button data-testid="reset" onClick={() => form.reset()} />
          <span data-testid="val">{form.getValue(['name']) as string}</span>
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ name: 'init' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <Controls />
      </FormProvider>
    );

    // Save -> markPristine drifts the dirty baseline to 'saved'.
    fireEvent.click(screen.getByTestId('type-save'));
    fireEvent.click(screen.getByTestId('commit'));
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
    // Keep editing -> dirty against the drifted baseline.
    fireEvent.click(screen.getByTestId('type-more'));
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
    // reset() = "back to load": values return to initialValues ('init'), not the
    // drifted baseline ('saved'), and the form reads clean.
    fireEvent.click(screen.getByTestId('reset'));
    expect(screen.getByTestId('val').textContent).toBe('init');
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
  });
});

describe('dirty reflects other mutation paths', () => {
  it('clearValue makes a populated field dirty', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="clear"
          onClick={() => form.clearValue(['name'])}
        />
      );
    };
    render(
      <FormProvider
        initialValues={{ name: 'init' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['name']]} />
        <Controls />
      </FormProvider>
    );

    expect(screen.getByTestId('isDirty').textContent).toBe('false');
    fireEvent.click(screen.getByTestId('clear'));
    expect(screen.getByTestId('dirty:["name"]').textContent).toBe('true');
  });

  it('deleteField flags the removed key as dirty', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <button
          data-testid="del"
          onClick={() => form.deleteField(['b'])}
        />
      );
    };
    render(
      <FormProvider
        initialValues={{ a: '1', b: '2' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['a'], ['b']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('del'));
    expect(screen.getByTestId('dirty:["a"]').textContent).toBe('false');
    expect(screen.getByTestId('dirty:["b"]').textContent).toBe('true');
  });

  it('a nested deleteField reads dirty and does NOT corrupt the baseline (regression)', () => {
    // Before the cloneAlongPath fix, deleteField shallow-cloned only the root and
    // deleted from the SHARED nested object held by initialValues / the baseline.
    // That made isDirty miss the change (baseline lost the key too) and broke
    // reset() (initialValues was mutated).
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="del"
            onClick={() => form.deleteField(['user', 'name'])}
          />
          <button data-testid="reset" onClick={() => form.reset()} />
          <span data-testid="name">
            {String(form.getValue(['user', 'name']) ?? 'GONE')}
          </span>
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ user: { name: 'A', age: 30 } }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['user', 'name'], ['user', 'age']]} />
        <Controls />
      </FormProvider>
    );

    expect(screen.getByTestId('isDirty').textContent).toBe('false');
    fireEvent.click(screen.getByTestId('del'));
    // Detected as dirty (would stay false if the shared baseline were mutated).
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
    expect(screen.getByTestId('name').textContent).toBe('GONE');
    // The untouched sibling stays clean (objects are key-precise).
    expect(screen.getByTestId('dirty:["user","age"]').textContent).toBe('false');
    // reset() restores the deleted nested value — proving initialValues wasn't
    // mutated in place.
    fireEvent.click(screen.getByTestId('reset'));
    expect(screen.getByTestId('name').textContent).toBe('A');
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
  });

  it('a nested array-item deleteField reads dirty and reset restores the array (regression)', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          <button
            data-testid="del"
            onClick={() => form.deleteField(['group', 'todos', 0])}
          />
          <button data-testid="reset" onClick={() => form.reset()} />
          <span data-testid="len">
            {(form.getValue(['group', 'todos']) as unknown[]).length}
          </span>
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ group: { todos: ['a', 'b'] } }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['group', 'todos']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('del'));
    expect(screen.getByTestId('isDirty').textContent).toBe('true');
    expect(screen.getByTestId('len').textContent).toBe('1');
    fireEvent.click(screen.getByTestId('reset'));
    expect(screen.getByTestId('len').textContent).toBe('2');
    expect(screen.getByTestId('isDirty').textContent).toBe('false');
  });

  it('compares Date fields by value, not reference', () => {
    const Controls = () => {
      const form = useFormContext();
      return (
        <div>
          {/* A new Date object with the SAME timestamp -> not dirty. */}
          <button
            data-testid="same"
            onClick={() => form.setValue(['when'], new Date(0))}
          />
          <button
            data-testid="diff"
            onClick={() => form.setValue(['when'], new Date(1000))}
          />
        </div>
      );
    };
    render(
      <FormProvider
        initialValues={{ when: new Date(0) }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <Probe paths={[['when']]} />
        <Controls />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('same'));
    expect(screen.getByTestId('dirty:["when"]').textContent).toBe('false');
    fireEvent.click(screen.getByTestId('diff'));
    expect(screen.getByTestId('dirty:["when"]').textContent).toBe('true');
  });
});
