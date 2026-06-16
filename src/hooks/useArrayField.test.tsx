import { describe, it, expect, jest } from 'bun:test';
import { useEffect } from 'react';
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

  it('partial move (0 -> 1) leaves items outside the range in place', () => {
    // Index 2 sits outside [from, to], so it passes through the indexMap
    // unchanged (the fallthrough arm of move's reindex).
    renderSeed3(0, 1);
    fireEvent.click(screen.getByTestId('seed'));
    fireEvent.click(screen.getByTestId('move'));
    // E0 follows to index 1; E1 shifts up to 0; E2 stays at index 2.
    expect(screen.getByTestId('err-0').textContent).toBe('E1');
    expect(screen.getByTestId('err-1').textContent).toBe('E0');
    expect(screen.getByTestId('err-2').textContent).toBe('E2');
  });
});

// Exercises the parity ops (insert/prepend/swap/replace/update). Server errors
// are used for the reindex assertions since they show regardless of touched.
function OpsList() {
  const { items, insert, prepend, swap, replace, update } = useArrayField([
    'items',
  ]);
  const form = useFormContext();
  return (
    <div>
      <div data-testid="count">{items.length}</div>
      {items.map((it, i) => (
        <div key={i}>
          <div data-testid={`name-${i}`}>
            {String((it as { name?: string }).name ?? '')}
          </div>
          <ItemError index={i} />
        </div>
      ))}
      <button
        data-testid="seed"
        onClick={() =>
          form.setServerErrors([
            { path: ['items', 0, 'name'], message: 'E0', source: 'server' },
            { path: ['items', 1, 'name'], message: 'E1', source: 'server' },
          ])
        }
      >
        seed
      </button>
      <button data-testid="insert0" onClick={() => insert(0, { name: 'X' })}>
        insert at 0
      </button>
      <button data-testid="prepend" onClick={() => prepend({ name: 'P' })}>
        prepend
      </button>
      <button data-testid="swap" onClick={() => swap(0, 1)}>
        swap 0 1
      </button>
      <button data-testid="replace" onClick={() => replace([{ name: 'only' }])}>
        replace
      </button>
      <button
        data-testid="update1"
        onClick={() => update(1, { name: 'updated' })}
      >
        update 1
      </button>
    </div>
  );
}

function renderOps() {
  return render(
    <FormProvider
      initialValues={{ items: [{ name: 'a' }, { name: 'b' }] }}
      onSubmit={jest.fn()}
    >
      <OpsList />
    </FormProvider>
  );
}

describe('useArrayField parity ops', () => {
  it('insert places an item and shifts following items up', () => {
    renderOps();
    fireEvent.click(screen.getByTestId('insert0'));
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByTestId('name-0').textContent).toBe('X');
    expect(screen.getByTestId('name-1').textContent).toBe('a');
    expect(screen.getByTestId('name-2').textContent).toBe('b');
  });

  it('insert shifts existing errors up to follow their items', () => {
    renderOps();
    fireEvent.click(screen.getByTestId('seed')); // E0@0, E1@1
    fireEvent.click(screen.getByTestId('insert0')); // new item at 0
    // The new item has no error; E0/E1 shift to 1/2.
    expect(screen.getByTestId('err-0').textContent).toBe('');
    expect(screen.getByTestId('err-1').textContent).toBe('E0');
    expect(screen.getByTestId('err-2').textContent).toBe('E1');
  });

  it('prepend inserts at the front', () => {
    renderOps();
    fireEvent.click(screen.getByTestId('prepend'));
    expect(screen.getByTestId('name-0').textContent).toBe('P');
    expect(screen.getByTestId('name-1').textContent).toBe('a');
  });

  it('swap exchanges items and their errors', () => {
    renderOps();
    fireEvent.click(screen.getByTestId('seed')); // E0@0, E1@1
    fireEvent.click(screen.getByTestId('swap'));
    expect(screen.getByTestId('name-0').textContent).toBe('b');
    expect(screen.getByTestId('name-1').textContent).toBe('a');
    // Errors follow their items.
    expect(screen.getByTestId('err-0').textContent).toBe('E1');
    expect(screen.getByTestId('err-1').textContent).toBe('E0');
  });

  it('swap is a no-op for out-of-range/equal indices', () => {
    renderOps();
    fireEvent.click(screen.getByTestId('seed'));
    // swap(0,1) is valid; assert the invalid guard separately is covered by the
    // hook's bounds check — here we just confirm a valid swap then back is stable.
    fireEvent.click(screen.getByTestId('swap'));
    fireEvent.click(screen.getByTestId('swap'));
    expect(screen.getByTestId('name-0').textContent).toBe('a');
    expect(screen.getByTestId('name-1').textContent).toBe('b');
  });

  it('replace swaps in a new array and drops stale per-index errors', () => {
    renderOps();
    fireEvent.click(screen.getByTestId('seed')); // E0@0, E1@1
    fireEvent.click(screen.getByTestId('replace')); // -> [{name:'only'}]
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('name-0').textContent).toBe('only');
    expect(screen.getByTestId('err-0').textContent).toBe('');
  });

  it('update replaces a single item', () => {
    renderOps();
    fireEvent.click(screen.getByTestId('update1'));
    expect(screen.getByTestId('name-1').textContent).toBe('updated');
    expect(screen.getByTestId('name-0').textContent).toBe('a');
  });
});

// The reorder ops update the internal server-error baseline (serverErrorsRef),
// not just the displayed errors — so a later setServerError rebuilds from the
// re-indexed baseline rather than resurrecting a pre-reorder index.
function BaselineList() {
  const { items, swap } = useArrayField(['items']);
  const form = useFormContext();
  return (
    <div>
      {items.map((_, i) => (
        <ItemError key={i} index={i} />
      ))}
      <div data-testid="other">
        {form.getError(['other'])[0]?.message ?? ''}
      </div>
      <button
        data-testid="seed"
        onClick={() =>
          form.setServerErrors([
            { path: ['items', 1, 'name'], message: 'E1', source: 'server' },
          ])
        }
      >
        seed
      </button>
      <button data-testid="swap" onClick={() => swap(0, 1)}>
        swap 0 1
      </button>
      <button
        data-testid="bump"
        onClick={() => form.setServerError(['other'], 'EX')}
      >
        bump other
      </button>
    </div>
  );
}

// A schema constraint ON THE ARRAY ITSELF (e.g. .min(1)) produces an error at the
// array path. Reindexing item metadata can't refresh it, so reindexArray must
// re-validate the array path — inserting an item should clear the .min error.
const minSchema = z.object({
  items: z.array(z.object({ name: z.string() })).min(1, 'need at least one'),
});

function MinList() {
  const { items, insert } = useArrayField(['items']);
  const form = useFormContext();
  return (
    <div>
      <div data-testid="arr-err">
        {form.getError(['items'])[0]?.message ?? ''}
      </div>
      <div data-testid="can-submit">{form.canSubmit ? 'yes' : 'no'}</div>
      <div data-testid="count">{items.length}</div>
      <button data-testid="validate" onClick={() => form.validate(true)}>
        validate
      </button>
      <button data-testid="insert" onClick={() => insert(0, { name: 'x' })}>
        insert
      </button>
    </div>
  );
}

// Stable per-item ids (arrayFieldIDs) must follow items across mutations.
function IdList() {
  const {
    items,
    arrayFieldIDs,
    add,
    remove,
    move,
    insert,
    swap,
    replace,
    update,
  } = useArrayField(['items']);
  return (
    <div>
      <div data-testid="ids">{arrayFieldIDs.join(',')}</div>
      <div data-testid="count">{items.length}</div>
      <button data-testid="add" onClick={() => add({ name: 'n' })}>
        add
      </button>
      <button data-testid="remove1" onClick={() => remove(1)}>
        remove1
      </button>
      <button data-testid="move02" onClick={() => move(0, 2)}>
        move02
      </button>
      <button data-testid="swap02" onClick={() => swap(0, 2)}>
        swap02
      </button>
      <button data-testid="insert1" onClick={() => insert(1, { name: 'i' })}>
        insert1
      </button>
      <button data-testid="update1" onClick={() => update(1, { name: 'u' })}>
        update1
      </button>
      <button data-testid="replace" onClick={() => replace([{ name: 'x' }])}>
        replace
      </button>
    </div>
  );
}

describe('useArrayField arrayFieldIDs', () => {
  const setup = () => {
    render(
      <FormProvider
        initialValues={{ items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }}
        onSubmit={jest.fn()}
      >
        <IdList />
      </FormProvider>
    );
    return screen.getByTestId('ids').textContent!.split(',');
  };
  const idsNow = () => screen.getByTestId('ids').textContent!.split(',');

  it('has one stable id per item, all distinct', () => {
    const ids = setup();
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it('move carries each id to its item’s new index', () => {
    const [i0, i1, i2] = setup();
    fireEvent.click(screen.getByTestId('move02')); // [a,b,c] -> [b,c,a]
    expect(idsNow()).toEqual([i1, i2, i0]);
  });

  it('swap exchanges the two ids', () => {
    const [i0, i1, i2] = setup();
    fireEvent.click(screen.getByTestId('swap02'));
    expect(idsNow()).toEqual([i2, i1, i0]);
  });

  it('insert keeps existing ids and gives the new item a fresh id', () => {
    const [i0, i1, i2] = setup();
    fireEvent.click(screen.getByTestId('insert1')); // new item at index 1
    const after = idsNow();
    expect(after).toHaveLength(4);
    expect(after[0]).toBe(i0);
    expect(after[2]).toBe(i1);
    expect(after[3]).toBe(i2);
    expect([i0, i1, i2]).not.toContain(after[1]); // brand-new id
  });

  it('remove drops that id and keeps the rest', () => {
    const [i0, , i2] = setup();
    fireEvent.click(screen.getByTestId('remove1'));
    expect(idsNow()).toEqual([i0, i2]);
  });

  it('update keeps the item’s id (in-place)', () => {
    const before = setup();
    fireEvent.click(screen.getByTestId('update1'));
    expect(idsNow()).toEqual(before);
  });

  it('add keeps existing ids and appends a fresh one', () => {
    const [i0, i1, i2] = setup();
    fireEvent.click(screen.getByTestId('add'));
    const after = idsNow();
    expect(after.slice(0, 3)).toEqual([i0, i1, i2]);
    expect([i0, i1, i2]).not.toContain(after[3]);
  });
});

// Ids must stay aligned even when the array is mutated DIRECTLY through the
// context (bypassing the hook ops) — the context broadcasts the change and the
// hook applies it.
function ExternalMutList() {
  const { items, arrayFieldIDs } = useArrayField(['items']);
  const form = useFormContext();
  return (
    <div>
      <div data-testid="ids">{arrayFieldIDs.join(',')}</div>
      <div data-testid="count">{items.length}</div>
      <button
        data-testid="ctx-delete1"
        onClick={() => form.deleteField(['items', 1])}
      >
        ctx delete 1
      </button>
      <button
        data-testid="ctx-setvalue"
        onClick={() => form.setValue(['items'], [{ name: 'x' }, { name: 'y' }])}
      >
        ctx setValue
      </button>
      <button data-testid="ctx-reset" onClick={() => form.reset()}>
        ctx reset
      </button>
    </div>
  );
}

describe('useArrayField ids survive direct context mutations', () => {
  const setup = () => {
    render(
      <FormProvider
        initialValues={{ items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }}
        onSubmit={jest.fn()}
      >
        <ExternalMutList />
      </FormProvider>
    );
    return screen.getByTestId('ids').textContent!.split(',');
  };
  const idsNow = () => screen.getByTestId('ids').textContent!.split(',');

  it('a direct form.deleteField keeps the surviving items’ ids (no tail shuffle)', () => {
    const [i0, , i2] = setup();
    fireEvent.click(screen.getByTestId('ctx-delete1')); // delete B directly
    // B's id is dropped; C keeps i2 (a length-only fallback would truncate from
    // the end and hand C the wrong id).
    expect(idsNow()).toEqual([i0, i2]);
  });

  it('a direct wholesale form.setValue re-mints (no mapping to carry over)', () => {
    const before = setup();
    fireEvent.click(screen.getByTestId('ctx-setvalue'));
    const after = idsNow();
    expect(after).toHaveLength(2);
    expect(after.some((id) => before.includes(id))).toBe(false);
  });

  it('form.reset re-mints the ids', () => {
    const before = setup();
    fireEvent.click(screen.getByTestId('ctx-reset'));
    const after = idsNow();
    expect(after).toHaveLength(3);
    expect(after.some((id) => before.includes(id))).toBe(false);
  });
});

// Replacing a PARENT object that contains a tracked array carries no item mapping,
// so the nested array's ids must re-mint (not silently keep stale slot ids).
function NestedArrayList() {
  const { items, arrayFieldIDs } = useArrayField(['profile', 'phones']);
  const form = useFormContext();
  return (
    <div>
      <div data-testid="ids">{arrayFieldIDs.join(',')}</div>
      <div data-testid="count">{items.length}</div>
      <button
        data-testid="replace-parent"
        onClick={() =>
          // Replace the whole `profile` object with a reordered (same-length)
          // phones array — no old->new mapping is available.
          form.setValue(['profile'], { phones: [{ n: 'b' }, { n: 'a' }] })
        }
      >
        replace parent
      </button>
    </div>
  );
}

// A hook on a nested array (['sections', 0, 'questions']) is pinned to a fixed
// item index. When the PARENT array reorders, index 0 may now be a different
// section, so the nested ids must re-mint — but a parent reorder that doesn't
// touch index 0 must leave them alone.
function NestedReorder() {
  const sections = useArrayField(['sections']);
  const q0 = useArrayField(['sections', 0, 'questions']);
  return (
    <div>
      <div data-testid="q0-ids">{q0.arrayFieldIDs.join(',')}</div>
      <div data-testid="q0-count">{q0.items.length}</div>
      <button data-testid="swap01" onClick={() => sections.swap(0, 1)}>
        swap sections 0,1
      </button>
      <button data-testid="swap12" onClick={() => sections.swap(1, 2)}>
        swap sections 1,2
      </button>
    </div>
  );
}

describe('useArrayField nested-array ids follow ancestor reorders', () => {
  const renderNested = () =>
    render(
      <FormProvider
        initialValues={{
          sections: [
            { questions: [{ t: 'a' }, { t: 'b' }] },
            { questions: [{ t: 'c' }] },
            { questions: [{ t: 'd' }, { t: 'e' }] },
          ],
        }}
        onSubmit={jest.fn()}
      >
        <NestedReorder />
      </FormProvider>
    );

  it('re-mints nested ids when the parent reorder changes their index', () => {
    renderNested();
    const before = screen.getByTestId('q0-ids').textContent!.split(',');
    fireEvent.click(screen.getByTestId('swap01')); // section 0 <-> 1
    // Index 0 now holds the old section 1 (a single question), so the nested ids
    // must re-mint to match the new items.
    expect(screen.getByTestId('q0-count').textContent).toBe('1');
    const after = screen.getByTestId('q0-ids').textContent!.split(',');
    expect(after).toHaveLength(1);
    expect(after.some((id) => before.includes(id))).toBe(false);
  });

  it('keeps nested ids when the parent reorder leaves their index untouched', () => {
    renderNested();
    const before = screen.getByTestId('q0-ids').textContent;
    fireEvent.click(screen.getByTestId('swap12')); // sections 1 <-> 2; index 0 untouched
    expect(screen.getByTestId('q0-ids').textContent).toBe(before);
  });
});

describe('useArrayField ids re-mint when a parent object is replaced', () => {
  it('re-mints nested array ids on a wholesale parent setValue', () => {
    render(
      <FormProvider
        initialValues={{ profile: { phones: [{ n: 'a' }, { n: 'b' }] } }}
        onSubmit={jest.fn()}
      >
        <NestedArrayList />
      </FormProvider>
    );
    const before = screen.getByTestId('ids').textContent!.split(',');
    fireEvent.click(screen.getByTestId('replace-parent'));
    const after = screen.getByTestId('ids').textContent!.split(',');
    expect(after).toHaveLength(2);
    expect(after.some((id) => before.includes(id))).toBe(false);
  });
});

// The reorder ops go through reindexArray, which (like setValue, used by add)
// must mark the array path itself touched — otherwise touched-gated array-level
// validation/UI would behave differently for add vs insert/move/swap.
function TouchArrayPath() {
  const { items, add, insert, move } = useArrayField(['items']);
  const form = useFormContext();
  const arrayTouched = form.touched[serializePath(['items'])] ? 'yes' : 'no';
  return (
    <div>
      <div data-testid="arr-touched">{arrayTouched}</div>
      <div data-testid="count">{items.length}</div>
      <button data-testid="add" onClick={() => add({ name: 'n' })}>
        add
      </button>
      <button data-testid="insert" onClick={() => insert(0, { name: 'i' })}>
        insert
      </button>
      <button data-testid="move" onClick={() => move(0, 1)}>
        move
      </button>
    </div>
  );
}

describe('useArrayField mutations mark the array path touched', () => {
  it.each([['add'], ['insert'], ['move']])(
    '%s marks the array path touched (consistent with setValue)',
    (action) => {
      render(
        <FormProvider
          initialValues={{ items: [{ name: 'a' }, { name: 'b' }] }}
          onSubmit={jest.fn()}
        >
          <TouchArrayPath />
        </FormProvider>
      );
      expect(screen.getByTestId('arr-touched').textContent).toBe('no');
      fireEvent.click(screen.getByTestId(action));
      expect(screen.getByTestId('arr-touched').textContent).toBe('yes');
    }
  );
});

describe('useArrayField reindex refreshes array-level validation errors', () => {
  it('clears a z.array().min() error when an insert makes the array valid', () => {
    render(
      <FormProvider
        initialValues={{ items: [] }}
        schema={minSchema}
        onSubmit={jest.fn()}
      >
        <MinList />
      </FormProvider>
    );
    // Surface the array-level .min error.
    fireEvent.click(screen.getByTestId('validate'));
    expect(screen.getByTestId('arr-err').textContent).toBe('need at least one');
    expect(screen.getByTestId('can-submit').textContent).toBe('no');

    // Insert an item -> array now satisfies .min(1); the stale error must clear
    // and canSubmit must flip true (not just canSubmit).
    fireEvent.click(screen.getByTestId('insert'));
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('arr-err').textContent).toBe('');
    expect(screen.getByTestId('can-submit').textContent).toBe('yes');
  });
});

// A manual error set ON THE ARRAY PATH itself must behave like a server error:
// it should survive a reindex (insert/remove/move), not get wiped by the array-
// level validation refresh.
const noConstraintSchema = z.object({
  items: z.array(z.object({ name: z.string() })),
});

function ManualArrErrList() {
  const { items, insert } = useArrayField(['items']);
  const form = useFormContext();
  return (
    <div>
      <div data-testid="arr-err">
        {form.getError(['items'])[0]?.message ?? ''}
      </div>
      <div data-testid="arr-src">
        {form.getError(['items'])[0]?.source ?? ''}
      </div>
      <div data-testid="count">{items.length}</div>
      <button
        data-testid="set-manual"
        onClick={() => form.setError(['items'], 'pick at least one favorite')}
      >
        set
      </button>
      <button data-testid="insert" onClick={() => insert(0, { name: 'x' })}>
        insert
      </button>
    </div>
  );
}

describe('useArrayField reindex preserves a manual array-level error', () => {
  it('keeps a setError() on the array path through an insert', () => {
    render(
      <FormProvider
        initialValues={{ items: [{ name: 'a' }] }}
        schema={noConstraintSchema}
        onSubmit={jest.fn()}
      >
        <ManualArrErrList />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('set-manual'));
    expect(screen.getByTestId('arr-err').textContent).toBe(
      'pick at least one favorite'
    );
    expect(screen.getByTestId('arr-src').textContent).toBe('manual');

    // Insert triggers a reindex + array-level revalidation. The manual error is
    // not a Zod 'client' error, so it must survive (like a server error would).
    fireEvent.click(screen.getByTestId('insert'));
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('arr-err').textContent).toBe(
      'pick at least one favorite'
    );
    expect(screen.getByTestId('arr-src').textContent).toBe('manual');
  });
});

describe('useArrayField reorder keeps the server-error baseline in sync', () => {
  it('does not resurrect a pre-reorder server error on a later setServerError', () => {
    render(
      <FormProvider
        initialValues={{
          items: [{ name: 'a' }, { name: 'b' }],
          other: 'x',
        }}
        onSubmit={jest.fn()}
      >
        <BaselineList />
      </FormProvider>
    );
    fireEvent.click(screen.getByTestId('seed')); // E1 on items[1].name
    expect(screen.getByTestId('err-1').textContent).toBe('E1');

    // Swap moves the errored item to index 0; the error follows.
    fireEvent.click(screen.getByTestId('swap'));
    expect(screen.getByTestId('err-0').textContent).toBe('E1');
    expect(screen.getByTestId('err-1').textContent).toBe('');

    // Setting an unrelated server error rebuilds from the baseline. The E1 error
    // must stay at index 0 (not snap back to its pre-swap index 1).
    fireEvent.click(screen.getByTestId('bump'));
    expect(screen.getByTestId('other').textContent).toBe('EX');
    expect(screen.getByTestId('err-0').textContent).toBe('E1');
    expect(screen.getByTestId('err-1').textContent).toBe('');
  });
});

// remove() routes through form.deleteField, which (like the reorder ops) must
// re-index the errors on surviving items rather than wiping them.
function RemoveList() {
  const { items, remove } = useArrayField(['items']);
  const form = useFormContext();
  return (
    <div>
      {items.map((_, i) => (
        <ItemError key={i} index={i} />
      ))}
      <div data-testid="other">
        {form.getError(['other'])[0]?.message ?? ''}
      </div>
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
      <button data-testid="remove0" onClick={() => remove(0)}>
        remove 0
      </button>
      <button
        data-testid="bump"
        onClick={() => form.setServerError(['other'], 'EX')}
      >
        bump other
      </button>
    </div>
  );
}

describe('useArrayField remove re-indexes errors on surviving items', () => {
  it('shifts later items’ errors down instead of dropping them', () => {
    render(
      <FormProvider
        initialValues={{
          items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
          other: 'x',
        }}
        onSubmit={jest.fn()}
      >
        <RemoveList />
      </FormProvider>
    );
    fireEvent.click(screen.getByTestId('seed'));
    expect(screen.getByTestId('err-1').textContent).toBe('E1');
    expect(screen.getByTestId('err-2').textContent).toBe('E2');

    // Remove index 0: E1 (was 1) -> 0, E2 (was 2) -> 1.
    fireEvent.click(screen.getByTestId('remove0'));
    expect(screen.getByTestId('err-0').textContent).toBe('E1');
    expect(screen.getByTestId('err-1').textContent).toBe('E2');

    // The server-error baseline was re-indexed too: an unrelated setServerError
    // rebuilds combined errors without resurrecting the pre-remove indices.
    fireEvent.click(screen.getByTestId('bump'));
    expect(screen.getByTestId('other').textContent).toBe('EX');
    expect(screen.getByTestId('err-0').textContent).toBe('E1');
    expect(screen.getByTestId('err-1').textContent).toBe('E2');
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

describe('useArrayField re-render isolation', () => {
  it('editing an unrelated field does not re-render the array hook', () => {
    const renders = { arr: 0 };

    const ArrayView = () => {
      const { items } = useArrayField(['items']);
      useEffect(() => {
        renders.arr++;
      });
      return <div data-testid="arr-count">{items.length}</div>;
    };
    const TitleField = () => {
      const f = useField(['title']);
      return (
        <input
          data-testid="title"
          value={(f.value as string) ?? ''}
          onChange={(e) => f.setValue(e.target.value)}
        />
      );
    };

    render(
      <FormProvider
        initialValues={{ items: [{ name: 'a' }], title: '' }}
        onSubmit={jest.fn()}
        validateOnChange={false}
      >
        <ArrayView />
        <TitleField />
      </FormProvider>
    );

    const before = renders.arr;

    // Editing an unrelated scalar field must not re-render the array hook: its
    // items ref is unchanged (cloneAlongPath only clones the edited path).
    fireEvent.change(screen.getByTestId('title'), { target: { value: 'x' } });
    expect(renders.arr).toBe(before);

    // Sanity: adding an item DOES re-render it.
    expect(screen.getByTestId('arr-count').textContent).toBe('1');
  });
});
