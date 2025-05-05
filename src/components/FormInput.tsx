import React from 'react';

interface FormInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  errorText?: string | string[] | null;
  touched?: boolean;
  label?: string;
  multiline?: boolean;
}

const FormInput: React.FC<FormInputProps> = ({
  value,
  onChange,
  onBlur,
  errorText,
  touched = false,
  required,
  'aria-required': ariaRequired,
  className = '',
  label,
  multiline,
  ...props
}) => {
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  // If value is undefined, use empty string to maintain controlled input state
  const inputValue = value === undefined ? '' : value;

  const handleTextArea = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const baseClasses =
    'w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 transition-colors';
  const stateClasses = errorText
    ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-200'
    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200';

  const renderError = () => {
    if (!errorText) return null;
    if (Array.isArray(errorText)) {
      return (
        <ul className="form-input__error-list">
          {errorText.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      );
    }
    return <span className="form-input__error-text">{errorText}</span>;
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      {multiline ? (
        <textarea
          {...(props as any)}
          value={inputValue}
          onChange={handleTextArea}
          onBlur={onBlur}
          className={`${baseClasses} ${stateClasses} ${className} min-h-[100px]`}
          aria-required={ariaRequired || required || undefined}
          aria-invalid={errorText ? true : undefined}
        />
      ) : (
        <input
          {...props}
          value={inputValue}
          onChange={handleInput}
          onBlur={onBlur}
          className={`${baseClasses} ${stateClasses} ${className}`}
          aria-required={ariaRequired || required || undefined}
          aria-invalid={errorText ? true : undefined}
        />
      )}
      {renderError()}
    </div>
  );
};

interface FormCheckboxProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'onChange' | 'type'
  > {
  value: boolean;
  onChange: (value: boolean) => void;
  onBlur?: () => void;
  errorText?: string | null;
  touched?: boolean;
  label?: string;
}

export const FormCheckbox: React.FC<FormCheckboxProps> = ({
  value,
  onChange,
  onBlur,
  errorText,
  touched = false,
  required,
  'aria-required': ariaRequired,
  className = '',
  label,
  ...props
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <div className="flex items-center space-x-2">
      <input
        {...props}
        type="checkbox"
        checked={value}
        onChange={handleChange}
        onBlur={onBlur}
        className={`w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 ${className}`}
        aria-required={ariaRequired || required || undefined}
        aria-invalid={errorText ? true : undefined}
      />
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      {errorText && (
        <div className="text-sm text-red-600" role="alert">
          {errorText}
        </div>
      )}
    </div>
  );
};

export default FormInput;
