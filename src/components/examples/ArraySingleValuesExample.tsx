import React from 'react';
import { z } from 'zod';
import {
  FormProvider,
  useFormContext,
  useArrayField,
  useField,
} from '../../lib/form-context';
import FormInput from '../FormInput';
import { RootErrors, SubmitButton, FormNotice } from './shared';
import FormState from '../FormState';
import { Plus, Equal, X, ArrowUp, ArrowDown } from 'lucide-react';

interface NumberItemProps {
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

function NumberItem({ index, total, onMove, onRemove }: NumberItemProps) {
  const field = useField<number>(['numbers', index]);

  return (
    <div className="flex items-center space-x-2">
      <div className="flex-1">
        <FormInput
          {...field.props}
          type="number"
          step="any"
          placeholder="Enter a number"
        />
      </div>
      <div className="flex items-center space-x-1 shrink-0">
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

const calculatorSchema = z.object({
  numbers: z.array(
    z
      .string()
      .regex(/^-?\d*\.?\d*$/, 'Must be a valid number')
      .refine(
        (val) => {
          const num = Number(val);
          return !isNaN(num) && num >= -1000 && num <= 1000;
        },
        { message: 'Must be between -1000 and 1000' }
      )
  ),
});

function ArraySingleValuesForm() {
  const form = useFormContext();
  const numbers = useArrayField(['numbers']);
  const { items, add, remove, move } = numbers;

  // Calculate total
  const total = items
    .map((v) => Number(v) || 0)
    .reduce((sum, num) => sum + num, 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <FormNotice type="info">
        Add numbers to calculate their sum. Each number can be moved up/down or
        removed.
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Numbers between -1000 and 1000 are allowed</li>
          <li>The total updates automatically</li>
          <li>Try moving numbers around to see how array operations work</li>
        </ul>
      </FormNotice>
      <RootErrors />
      <div className="space-y-4">
        {items.map((_, index) => (
          <div key={index} className="flex items-center space-x-3">
            {index > 0 && <Plus className="w-5 h-5 text-blue-500 shrink-0" />}
            <NumberItem
              index={index}
              total={items.length}
              onMove={move}
              onRemove={remove}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() => add('')}
          className="flex items-center justify-center w-full p-2 text-gray-600 border-2 border-dashed rounded-lg hover:text-gray-700 hover:border-gray-400 hover:bg-gray-50"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Number
        </button>

        <div className="flex items-center space-x-3 mt-6">
          <Equal className="w-5 h-5 text-emerald-500 shrink-0" />
          <div className="flex-1 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg font-medium text-lg">
            {total.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>

        <SubmitButton />
        <FormState />
      </div>
    </form>
  );
}

export default function ArraySingleValuesExample() {
  return (
    <FormProvider
      initialValues={{
        numbers: [''],
      }}
      schema={calculatorSchema}
      onSubmit={async (form, values) => {
        alert(
          'Form submitted successfully!\nTotal: ' +
            values.numbers
              .reduce((sum, str) => sum + (Number(str) || 0), 0)
              .toLocaleString()
        );
      }}
    >
      <ArraySingleValuesForm />
    </FormProvider>
  );
}
