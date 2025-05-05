import { z } from 'zod';
import { FormProvider, FormHelpers } from '../../lib/form-context';
import FormInput, { FormCheckbox } from '../FormInput';
import { RootErrors, SubmitButton, FormNotice } from './shared';
import FormState from '../FormState';
import {
  X,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  ShieldCheck,
  FileX,
} from 'lucide-react';
import { simulateServer } from './utils';
import { useFormContext } from '../../lib/hooks/useFormContext';
import { useField } from '../../lib/hooks/useField';
import { useArrayField } from '../../lib/hooks/useArrayField';
import { useToast } from '../useToast';

interface TodoItemProps {
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

function TodoItem({ index, total, onMove, onRemove }: TodoItemProps) {
  const textField = useField(['todos', index, 'text']);
  const completedField = useField(['todos', index, 'completed']);

  return (
    <div className="flex items-start space-x-2">
      <div className="flex items-center space-x-2 flex-1 min-w-0">
        <FormCheckbox
          label=""
          value={!!completedField.value}
          onChange={completedField.props.onChange}
          errorText={completedField.props.errorText as string | null}
          onBlur={completedField.props.onBlur}
        />
        <div className="flex-1 min-w-0">
          <FormInput
            {...textField.props}
            placeholder="What needs to be done?"
            className={completedField.value ? 'line-through text-gray-500' : ''}
          />
        </div>
      </div>
      <div className="flex items-start space-x-1 shrink-0 ml-2">
        {index > 0 && (
          <button
            type="button"
            onClick={() => onMove(index, index - 1)}
            className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded"
            title="Move up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
        {index < total - 1 && (
          <button
            type="button"
            onClick={() => onMove(index, index + 1)}
            className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded"
            title="Move down"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
          title="Remove"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const todoSchema = z.object({
  todos: z
    .array(
      z.object({
        text: z.string().min(1, 'Todo text is required'),
        completed: z.boolean(),
      })
    )
    .min(1, 'At least one todo is required'),
});

function ArrayForm() {
  const form = useFormContext();
  const toast = useToast();
  const todos = useArrayField(['todos']);
  const { items, add, remove, move } = todos;

  const deleteIndex = (index: number) => {
    form.deleteField(['todos', index]);
  };

  const clearTodoItem = (index: number) => {
    form.clearValue(['todos', index]);
  };

  const validateForm = () => {
    const isValid = form.validate();
    if (isValid) {
      toast.success('Form is valid! (Only showing errors for touched fields)');
    } else {
      toast.error('Form has validation errors. Check touched fields above.');
    }
  };

  const validateFormForced = () => {
    const isValid = form.validate(true);
    if (isValid) {
      toast.success('Form is valid!');
    } else {
      toast.error(
        'Form has validation errors. All fields are now marked as touched.'
      );
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <FormNotice type="info">
        Try adding a todo with the word "bad" to see server validation
      </FormNotice>
      <RootErrors />
      <div className="space-y-4">
        {items.map((_, index) => (
          <TodoItem
            key={index}
            index={index}
            total={items.length}
            onMove={move}
            onRemove={remove}
          />
        ))}
        <button
          type="button"
          onClick={() => add({ text: '', completed: false })}
          className="flex items-center justify-center w-full p-2 text-gray-600 border-2 border-dashed rounded-lg hover:text-gray-700 hover:border-gray-400 hover:bg-gray-50"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Todo
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={validateForm}
            className="flex items-center justify-center px-4 py-2 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100"
          >
            <ShieldCheck className="w-4 h-4 mr-2" />
            Validate (Touched Only)
          </button>
          <button
            type="button"
            onClick={() => deleteIndex(1)}
            className="flex items-center px-4 py-2 text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
          >
            <Trash2 className="w-4 h-4 mr-2" /> Delete Index 1
          </button>
          <button
            type="button"
            onClick={() => clearTodoItem(0)}
            className="flex items-center px-4 py-2 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100"
          >
            <FileX className="w-4 h-4 mr-2" /> Clear Index 0
          </button>
          <button
            type="button"
            onClick={validateFormForced}
            className="flex items-center justify-center px-4 py-2 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100"
          >
            <ShieldCheck className="w-4 h-4 mr-2" />
            Validate (Force All)
          </button>
        </div>
        <SubmitButton />
        <FormState />
      </div>
    </form>
  );
}

export default function ArrayExample() {
  const toast = useToast();

  const onSubmit = async (
    values: z.infer<typeof todoSchema>,
    helpers: FormHelpers
  ) => {
    try {
      const errors = await simulateServer(values);
      if (errors.length > 0) {
        helpers.setServerErrors(errors);
        return;
      }
      toast.success('Form submitted successfully!');
    } catch (error) {
      // Handle unexpected errors
      console.error('Submission failed:', error);
      helpers.setServerErrors([
        {
          path: [],
          message: 'An unexpected error occurred. Please try again.',
        },
      ]);
    }
  };

  return (
    <FormProvider
      initialValues={{
        todos: [
          { text: 'Learn React', completed: true },
          { text: 'Build an app', completed: false },
        ],
      }}
      schema={todoSchema}
      onSubmit={onSubmit}
    >
      <ArrayForm />
    </FormProvider>
  );
}
