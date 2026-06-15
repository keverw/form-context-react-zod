import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import {
  FormProvider,
  useField,
  useFormContext,
  type FormSubmitHandler,
} from 'form-context-react-zod';
import { FormState } from 'form-context-react-zod/devtools/native';
import { RNFormInput } from '../RNFormInput';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
});

type Values = z.infer<typeof schema>;

const onSubmit: FormSubmitHandler<Values> = (values) => {
  Alert.alert('Submitted ✅', JSON.stringify(values, null, 2));
};

// Note: no `useFormTag` here — there is no <form> element on native. Submission
// is triggered by a button calling form.submit().
export function BasicScreen() {
  return (
    <FormProvider
      initialValues={{ name: '', email: '' }}
      schema={schema}
      onSubmit={onSubmit}
      validateOnBlur
    >
      <Fields />
      <FormState showToggle />
    </FormProvider>
  );
}

function Fields() {
  const form = useFormContext<Values>();
  const name = useField(['name']);
  const email = useField(['email']);

  return (
    <View>
      <RNFormInput {...name.props} label="Name" placeholder="Ada Lovelace" />
      <RNFormInput
        {...email.props}
        label="Email"
        placeholder="ada@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

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

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { backgroundColor: '#93c5fd' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
