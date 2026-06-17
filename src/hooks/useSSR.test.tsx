import { describe, it, expect, jest } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { z } from 'zod';
import { FormProvider } from '../form-context';
import { useField } from './useField';
import { useArrayField } from './useArrayField';
import { useFormContext } from './useFormContext';

// Server rendering drives useSyncExternalStore through getServerSnapshot (the 3rd
// arg). Without it, React throws "Missing getServerSnapshot, which is required for
// server-rendered content" on sight. These tests render to a string (exactly what a
// raw React SSR pipeline like renderToString/renderToPipeableStream does) and assert
// the initial-values HTML comes out — the value the client then hydrates against.

function TextField({ name }: { name: string }) {
  const { value } = useField([name]);
  return <span data-testid={name}>{value as string}</span>;
}

function List() {
  const { items } = useArrayField(['todos']);
  return (
    <ul>
      {items.map((t, i) => (
        <li key={i}>{String(t)}</li>
      ))}
    </ul>
  );
}

describe('SSR (renderToString)', () => {
  it('renders a useField value on the server without throwing', () => {
    const html = renderToString(
      <FormProvider
        initialValues={{ email: 'seed@example.com' }}
        onSubmit={jest.fn()}
      >
        <TextField name="email" />
      </FormProvider>
    );
    expect(html).toContain('seed@example.com');
  });

  it('renders a useArrayField on the server without throwing', () => {
    const html = renderToString(
      <FormProvider
        initialValues={{ todos: ['a', 'b', 'c'] }}
        onSubmit={jest.fn()}
      >
        <List />
      </FormProvider>
    );
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<li>c</li>');
  });

  it('renders with a schema (validateOnMount) on the server', () => {
    const schema = z.object({ name: z.string().min(2) });
    const html = renderToString(
      <FormProvider
        initialValues={{ name: 'Jo' }}
        schema={schema}
        validateOnMount
        onSubmit={jest.fn()}
      >
        <TextField name="name" />
      </FormProvider>
    );
    expect(html).toContain('Jo');
  });

  it('form-level state (isDirty/dirtyFields/canSubmit) renders pristine on the server', () => {
    // These live on the main FormContext (useReducer/useState), not on
    // useSyncExternalStore, so they render on the server unaffected by the
    // getServerSnapshot fix. A fresh server render is the pristine initial state:
    // values and the dirty baseline both start as the same initialValues ref, so
    // diffDirtyFields short-circuits to clean (the mount effect that could change
    // things doesn't run during SSR).
    const StateProbe = () => {
      const form = useFormContext();
      return (
        <div>
          <span data-testid="dirty">{String(form.isDirty)}</span>
          <span data-testid="dirty-count">
            {Object.keys(form.dirtyFields).length}
          </span>
        </div>
      );
    };
    const html = renderToString(
      <FormProvider
        initialValues={{ a: 'x', nested: { b: 'y' }, list: [1, 2] }}
        onSubmit={jest.fn()}
      >
        <StateProbe />
      </FormProvider>
    );
    expect(html).toContain('>false<'); // isDirty
    expect(html).toContain('>0<'); // dirtyFields is empty
  });
});
