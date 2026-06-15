import {
  View,
  Text,
  TextInput,
  StyleSheet,
  type TextInputProps,
} from 'react-native';

// The shape `useField(...).props` returns. Note `onChange` is value-based (it
// takes the new value, NOT a DOM/synthetic event) — which is exactly what RN's
// <TextInput onChangeText> gives us, so the web and native adapters differ only
// in this component, not in the hook.
export type FieldProps = {
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  errorText: string | string[] | null;
};

type Props = FieldProps & {
  label: string;
  placeholder?: string;
} & Pick<TextInputProps, 'keyboardType' | 'autoCapitalize' | 'secureTextEntry'>;

/**
 * A React Native input bound to a form field. Spread a field's props onto it:
 *
 *   const name = useField(['name']);
 *   <RNFormInput {...name.props} label="Name" />
 */
export function RNFormInput({
  value,
  onChange,
  onBlur,
  errorText,
  label,
  placeholder,
  ...textInputProps
}: Props) {
  const error = Array.isArray(errorText) ? errorText.join(', ') : errorText;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value == null ? '' : String(value)}
        onChangeText={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        {...textInputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
  inputError: { borderColor: '#ef4444' },
  error: { color: '#ef4444', fontSize: 13, marginTop: 4 },
});
