import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import {
  FormProvider,
  useField,
  useArrayField,
  useFormContext,
  type FormSubmitHandler,
} from 'form-context-react-zod';
import { FormState } from 'form-context-react-zod/devtools/native';
import { RNFormInput } from '../RNFormInput';

const schema = z.object({
  todos: z
    .array(z.object({ text: z.string().min(1, 'Required') }))
    .min(1, 'Add at least one item'),
});

type Values = z.infer<typeof schema>;

const onSubmit: FormSubmitHandler<Values> = (values) => {
  Alert.alert('Submitted ✅', JSON.stringify(values, null, 2));
};

export function ArrayScreen() {
  return (
    <FormProvider
      initialValues={{ todos: [{ text: '' }] }}
      schema={schema}
      onSubmit={onSubmit}
      validateOnBlur
    >
      <Todos />
      <FormState showToggle />
    </FormProvider>
  );
}

function Todos() {
  const form = useFormContext<Values>();
  const todos = useArrayField(['todos']);

  return (
    <View>
      {todos.arrayFieldIDs.map((id, index) => (
        <TodoRow
          key={id}
          index={index}
          isFirst={index === 0}
          isLast={index === todos.items.length - 1}
          onRemove={() => todos.remove(index)}
          onMoveUp={() => todos.move(index, index - 1)}
          onMoveDown={() => todos.move(index, index + 1)}
        />
      ))}

      <Pressable
        style={styles.addButton}
        onPress={() => todos.add({ text: '' })}
      >
        <Text style={styles.addButtonText}>+ Add item</Text>
      </Pressable>

      <Pressable
        style={[styles.button, !form.canSubmit && styles.buttonDisabled]}
        onPress={() => form.submit()}
        disabled={!form.canSubmit}
      >
        <Text style={styles.buttonText}>
          {form.isSubmitting ? 'Submitting…' : 'Submit'}
        </Text>
      </Pressable>
    </View>
  );
}

function TodoRow({
  index,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const text = useField(['todos', index, 'text']);

  return (
    <View style={styles.row}>
      <View style={styles.rowInput}>
        <RNFormInput {...text.props} label={`Item ${index + 1}`} />
      </View>
      <View style={styles.rowActions}>
        <SmallButton label="↑" disabled={isFirst} onPress={onMoveUp} />
        <SmallButton label="↓" disabled={isLast} onPress={onMoveDown} />
        <SmallButton label="✕" onPress={onRemove} danger />
      </View>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.smallButton,
        danger && styles.smallButtonDanger,
        disabled && styles.smallButtonDisabled,
      ]}
    >
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowInput: { flex: 1 },
  rowActions: { flexDirection: 'row', gap: 4, paddingTop: 24 },
  smallButton: {
    width: 34,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonDanger: { backgroundColor: '#fee2e2' },
  smallButtonDisabled: { opacity: 0.4 },
  smallButtonText: { fontSize: 16, color: '#111827' },
  addButton: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 16,
  },
  addButtonText: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#93c5fd' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
