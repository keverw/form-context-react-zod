import { useState, useEffect } from 'react';
import { useFormContext } from '../lib/hooks/useFormContext';

function ValueDisplay({ value }: { value: unknown }) {
  if (value === undefined)
    return <span className="text-gray-400">undefined</span>;
  if (value === null) return <span className="text-gray-400">null</span>;
  if (typeof value === 'string')
    return <span className="text-green-600">"{value}"</span>;
  if (typeof value === 'number')
    return <span className="text-blue-600">{value}</span>;
  if (typeof value === 'boolean')
    return <span className="text-purple-600">{value.toString()}</span>;
  if (Array.isArray(value)) {
    return (
      <div className="pl-4">
        [
        {value.map((item, i) => (
          <div key={i} className="pl-4">
            <ValueDisplay value={item} />
            {i < value.length - 1 && ','}
          </div>
        ))}
        ]
      </div>
    );
  }
  if (typeof value === 'object') {
    return (
      <div className="pl-4">
        {'{'}
        {Object.entries(value).map(([key, val], i, arr) => (
          <div key={key} className="pl-4">
            <span className="text-gray-700">{key}</span>:{' '}
            <ValueDisplay value={val} />
            {i < arr.length - 1 && ','}
          </div>
        ))}
        {'}'}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="bg-gray-50 rounded-lg p-3 font-mono text-sm overflow-auto max-h-48">
        {children}
      </div>
    </div>
  );
}

export default function FormState() {
  const form = useFormContext();
  const validationErrors = form.errors.filter((e) => e.source !== 'server');
  const serverErrors = form.errors.filter((e) => e.source === 'server');
  const [timeAgo, setTimeAgo] = useState<string>('Never');

  // Update the time ago string every second
  useEffect(() => {
    if (!form.lastValidated) {
      setTimeAgo('Never');
      return;
    }

    const updateTimeAgo = () => {
      const now = Date.now();
      // Add null check to handle the case when lastValidated is null
      const lastValidatedTime = form.lastValidated || 0;
      const diff = now - lastValidatedTime;

      if (diff < 1000) {
        setTimeAgo('Just now');
      } else if (diff < 60000) {
        setTimeAgo(`${Math.floor(diff / 1000)}s ago`);
      } else if (diff < 3600000) {
        setTimeAgo(`${Math.floor(diff / 60000)}m ago`);
      } else {
        setTimeAgo(`${Math.floor(diff / 3600000)}h ago`);
      }
    };

    // Update immediately
    updateTimeAgo();

    // Then update every second
    const interval = setInterval(updateTimeAgo, 1000);

    return () => clearInterval(interval);
  }, [form.lastValidated]);

  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Form State</h2>
        <div className="space-x-4 text-sm">
          <span
            className={`inline-flex items-center ${form.isValid ? 'text-green-600' : 'text-red-600'}`}
          >
            {form.isValid ? '✓ Valid' : '✗ Invalid'}
          </span>
          <span
            className={`inline-flex items-center ${form.isSubmitting ? 'text-blue-600' : 'text-gray-600'}`}
          >
            {form.isSubmitting ? '⟳ Submitting' : '• Idle'}
          </span>
          <span className="inline-flex items-center text-purple-600">
            ⏱ Validated: {timeAgo}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Section title="Values">
            <ValueDisplay value={form.values} />
          </Section>

          <Section title="Touched State">
            <ValueDisplay value={form.touched} />
          </Section>
        </div>

        <div>
          <Section title="Validation Errors">
            {validationErrors.length > 0 ? (
              validationErrors.map((error, i) => (
                <div key={i} className="mb-1">
                  <span className="text-gray-500">
                    {error.path.join('.')}:{' '}
                  </span>
                  <span className="text-red-600">{error.message}</span>
                </div>
              ))
            ) : (
              <span className="text-gray-500">No validation errors</span>
            )}
          </Section>

          <Section title="Server Errors">
            {serverErrors.length > 0 ? (
              serverErrors.map((error, i) => (
                <div key={i} className="mb-1">
                  <span className="text-gray-500">
                    {error.path.join('.')}:{' '}
                  </span>
                  <span className="text-orange-600">{error.message}</span>
                </div>
              ))
            ) : (
              <span className="text-gray-500">No server errors</span>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
