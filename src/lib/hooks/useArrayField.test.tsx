import { describe, it, expect, jest } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { z } from 'zod';
import { FormProvider } from '../form-context';
import { useArrayField } from './useArrayField';
import { useField } from './useField';
import { useFormContext } from './useFormContext';
import { serializePath } from '../utils';

function TodoList() {
  const { items, add, remove, move } = useArrayField(['todos']);
  return (
    <div>
      <div data-testid="count">{items.length}</div>
      <ul>
        {items.map((item, i) => (
          <li key={i} data-testid={`item-${i}`}>
            {String(item)}
          </li>
        ))}
      </ul>
      <button data-testid="add" onClick={() => add('new')}>
        add
      </button>
      <button data-testid="remove-1" onClick={() => remove(1)}>
        remove index 1
      </button>
      <button data-testid="move-0-2" onClick={() => move(0, 2)}>
        move 0 to 2
      </button>
      <button data-testid="move-invalid" onClick={() => move(0, 99)}>
        move out of range
      </button>
    </div>
  );
}

function renderList(initialValues: Record<string, unknown>) {
  return render(
    <FormProvider initialValues={initialValues} onSubmit={jest.fn()}>
      <TodoList />
    </FormProvider>
  );
}

describe('useArrayField', () => {
  it('exposes the underlying array as items', () => {
    renderList({ todos: ['a', 'b', 'c'] });
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByTestId('item-0').textContent).toBe('a');
    expect(screen.getByTestId('item-2').textContent).toBe('c');
  });

  it('returns an empty array when the value is not an array', () => {
    renderList({ other: 1 });
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('add appends an item', () => {
    renderList({ todos: ['a'] });
    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('item-1').textContent).toBe('new');
  });

  it('remove deletes the item at the given index', () => {
    renderList({ todos: ['a', 'b', 'c'] });
    fireEvent.click(screen.getByTestId('remove-1'));
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('item-0').textContent).toBe('a');
    expect(screen.getByTestId('item-1').textContent).toBe('c');
  });

  it('move reorders items', () => {
    renderList({ todos: ['a', 'b', 'c'] });
    fireEvent.click(screen.getByTestId('move-0-2'));
    // 'a' (index 0) moved to index 2 -> ['b', 'c', 'a']
    expect(screen.getByTestId('item-0').textContent).toBe('b');
    expect(screen.getByTestId('item-1').textContent).toBe('c');
    expect(screen.getByTestId('item-2').textContent).toBe('a');
  });

  it('move is a no-op for out-of-range indices', () => {
    renderList({ todos: ['a', 'b', 'c'] });
    fireEvent.click(screen.getByTestId('move-invalid'));
    expect(screen.getByTestId('item-0').textContent).toBe('a');
    expect(screen.getByTestId('item-1').textContent).toBe('b');
    expect(screen.getByTestId('item-2').textContent).toBe('c');
  });
});

// Covers move()'s touched/error path re-indexing: when items reorder, the
// validation error attached to an item must follow it to its new index.
const objSchema = z.object({
  items: z.array(z.object({ name: z.string().min(2, 'too short') })),
});

function ItemError({ index }: { index: number }) {
  const field = useField(['items', index, 'name']);
  return (
    <div data-testid={`err-${index}`}>{(field.error as string) ?? ''}</div>
  );
}

function ObjList() {
  const { items, move } = useArrayField(['items']);
  const form = useFormContext();
  return (
    <div>
      {items.map((_, i) => (
        <ItemError key={i} index={i} />
      ))}
      <button
        data-testid="seed"
        onClick={() =>
          form.setServerErrors([
            {
              path: ['items', 1, 'name'],
              message: 'too short',
              source: 'server',
            },
          ])
        }
      >
        seed error on item 1
      </button>
      <button data-testid="move-0-1" onClick={() => move(0, 1)}>
        move 0 to 1
      </button>
    </div>
  );
}

function TouchList() {
  const { items, move } = useArrayField(['items']);
  const form = useFormContext();
  const touchedAt = (i: number) =>
    form.touched[serializePath(['items', i, 'name'])] ? 'yes' : 'no';
  return (
    <div>
      <div data-testid="touched-0">{touchedAt(0)}</div>
      <div data-testid="touched-1">{touchedAt(1)}</div>
      {items.map((_, i) => (
        <span key={i} />
      ))}
      <button
        data-testid="touch-0"
        onClick={() => form.setFieldTouched(['items', 0, 'name'], true)}
      >
        touch item 0
      </button>
      <button
        data-testid="touch-1"
        onClick={() => form.setFieldTouched(['items', 1, 'name'], true)}
      >
        touch item 1
      </button>
      <button data-testid="move-0-1" onClick={() => move(0, 1)}>
        move 0 to 1
      </button>
    </div>
  );
}

// Regression: getValuePaths used to emit string array indices ('1'), so
// validate(true)'s force-touch never matched number-indexed nested array paths
// and the error stayed hidden.
function NestedErrors() {
  const f0 = useField(['items', 0, 'name']);
  const f1 = useField(['items', 1, 'name']);
  const form = useFormContext();
  return (
    <div>
      <div data-testid="e0">{(f0.error as string) ?? ''}</div>
      <div data-testid="e1">{(f1.error as string) ?? ''}</div>
      <button data-testid="validate" onClick={() => form.validate(true)}>
        validate
      </button>
    </div>
  );
}

describe('validate(true) force-touch reaches nested array items (regression)', () => {
  it('surfaces a nested array-item error after force-validate', () => {
    const schema = z.object({
      items: z.array(z.object({ name: z.string().min(2, 'too short') })),
    });
    render(
      <FormProvider
        initialValues={{ items: [{ name: 'ok' }, { name: 'x' }] }}
        schema={schema}
        onSubmit={jest.fn()}
      >
        <NestedErrors />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('validate'));
    expect(screen.getByTestId('e0').textContent).toBe('');
    expect(screen.getByTestId('e1').textContent).toBe('too short');
  });
});

describe('useArrayField move (touched re-indexing)', () => {
  it('re-indexes touched fields at both the from and to positions', () => {
    render(
      <FormProvider
        initialValues={{ items: [{ name: 'a' }, { name: 'b' }] }}
        onSubmit={jest.fn()}
      >
        <TouchList />
      </FormProvider>
    );

    // Touch both items, then swap them via move(0 -> 1).
    fireEvent.click(screen.getByTestId('touch-0'));
    fireEvent.click(screen.getByTestId('touch-1'));
    fireEvent.click(screen.getByTestId('move-0-1'));

    // Both touched markers follow their items, so both stay touched.
    expect(screen.getByTestId('touched-0').textContent).toBe('yes');
    expect(screen.getByTestId('touched-1').textContent).toBe('yes');
  });
});

function Seed3List({ from, to }: { from: number; to: number }) {
  const { items, move } = useArrayField(['items']);
  const form = useFormContext();
  return (
    <div>
      {items.map((_, i) => (
        <ItemError key={i} index={i} />
      ))}
      <button
        data-testid="seed"
        onClick={() =>
          form.setServerErrors([
            { path: ['items', 0, 'name'], message: 'E0', source: 'server' },
            { path: ['items', 1, 'name'], message: 'E1', source: 'server' },
            { path: ['items', 2, 'name'], message: 'E2', source: 'server' },
            // An error outside the array path must pass through move() unchanged.
            { path: ['other'], message: 'EX', source: 'server' },
          ])
        }
      >
        seed
      </button>
      <button data-testid="move" onClick={() => move(from, to)}>
        move
      </button>
    </div>
  );
}

function renderSeed3(from: number, to: number) {
  return render(
    <FormProvider
      // `other` must exist as a field, else setServerErrors drops its error
      // (it only keeps errors for paths present in the form values).
      initialValues={{
        items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        other: 'x',
      }}
      onSubmit={jest.fn()}
    >
      <Seed3List from={from} to={to} />
    </FormProvider>
  );
}

describe('useArrayField move (error re-indexing, both directions)', () => {
  it('forward move (0 -> 2) shifts intermediate errors down by one', () => {
    renderSeed3(0, 2);
    fireEvent.click(screen.getByTestId('seed'));
    fireEvent.click(screen.getByTestId('move'));
    // E0 follows to index 2; E1, E2 shift down to 0, 1.
    expect(screen.getByTestId('err-0').textContent).toBe('E1');
    expect(screen.getByTestId('err-1').textContent).toBe('E2');
    expect(screen.getByTestId('err-2').textContent).toBe('E0');
  });

  it('reverse move (2 -> 0) shifts intermediate errors up by one', () => {
    renderSeed3(2, 0);
    fireEvent.click(screen.getByTestId('seed'));
    fireEvent.click(screen.getByTestId('move'));
    // E2 follows to index 0; E0, E1 shift up to 1, 2.
    expect(screen.getByTestId('err-0').textContent).toBe('E2');
    expect(screen.getByTestId('err-1').textContent).toBe('E0');
    expect(screen.getByTestId('err-2').textContent).toBe('E1');
  });
});

describe('useArrayField move (error re-indexing)', () => {
  it('moves an item’s error to its new index', () => {
    render(
      <FormProvider
        initialValues={{ items: [{ name: 'ok' }, { name: 'x' }] }}
        schema={objSchema}
        onSubmit={jest.fn()}
      >
        <ObjList />
      </FormProvider>
    );

    // Seed an error on items[1].name (server errors show regardless of touched).
    fireEvent.click(screen.getByTestId('seed'));
    expect(screen.getByTestId('err-0').textContent).toBe('');
    expect(screen.getByTestId('err-1').textContent).toBe('too short');

    // Move index 0 -> 1: the errored item shifts from index 1 to index 0,
    // and move() must re-index the error path to follow it.
    fireEvent.click(screen.getByTestId('move-0-1'));
    expect(screen.getByTestId('err-0').textContent).toBe('too short');
    expect(screen.getByTestId('err-1').textContent).toBe('');
  });
});
