import { useState, useEffect } from 'react';
import { useFormContext } from '../hooks/useFormContext';
import { serializePath } from '../utils';

interface Palette {
  bg: string;
  border: string;
  text: string;
  subtext: string;
  sectionBg: string;
  sectionTitle: string;
  code: string;
  valid: string;
  invalid: string;
  submitting: string;
  idle: string;
  time: string;
  error: string;
  serverError: string;
  valueString: string;
  valueNumber: string;
  valueBoolean: string;
  valueKey: string;
  undefined: string;
  null: string;
}

function ValueDisplay({
  value,
  palette,
}: {
  value: unknown;
  palette: Palette;
}) {
  if (value === undefined)
    return <span style={{ color: palette.undefined }}>undefined</span>;
  if (value === null) return <span style={{ color: palette.null }}>null</span>;
  if (typeof value === 'string')
    return (
      <span style={{ color: palette.valueString }}>{'"' + value + '"'}</span>
    );
  if (typeof value === 'number')
    return <span style={{ color: palette.valueNumber }}>{value}</span>;
  if (typeof value === 'boolean')
    return (
      <span style={{ color: palette.valueBoolean }}>{value.toString()}</span>
    );
  if (Array.isArray(value)) {
    return (
      <div style={{ paddingLeft: '1rem' }}>
        [
        {value.map((item, i) => (
          <div key={i} style={{ paddingLeft: '1rem' }}>
            <ValueDisplay value={item} palette={palette} />
            {i < value.length - 1 && ','}
          </div>
        ))}
        ]
      </div>
    );
  }
  if (typeof value === 'object') {
    return (
      <div style={{ paddingLeft: '1rem' }}>
        {'{'}
        {Object.entries(value).map(([key, val], i, arr) => (
          <div key={key} style={{ paddingLeft: '1rem' }}>
            <span style={{ color: palette.valueKey }}>{key}</span>:{' '}
            <ValueDisplay value={val} palette={palette} />
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
  palette,
}: {
  title: string;
  children: React.ReactNode;
  palette: Palette;
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h3
        style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: palette.sectionTitle,
          marginBottom: '0.5rem',
        }}
      >
        {title}
      </h3>
      <div
        style={{
          backgroundColor: palette.sectionBg,
          borderRadius: '0.5rem',
          padding: '0.75rem',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          overflow: 'auto',
          maxHeight: '12rem',
          color: palette.code,
        }}
      >
        {children}
      </div>
    </div>
  );
}

type FormStateProps = {
  mode?: 'light' | 'dark';
  showToggle?: boolean;
};

export function FormState({
  mode = 'light',
  showToggle = false,
}: FormStateProps) {
  const form = useFormContext();
  const validationErrors = form.errors.filter(
    (e) => e.source !== 'server' && e.source !== 'client-form-handler'
  );
  const serverErrors = form.errors.filter((e) => e.source === 'server');
  const clientSubmissionErrors = form.errors.filter(
    (e) => e.source === 'client-form-handler'
  );
  const [timeAgo, setTimeAgo] = useState<string>('Never');
  const [internalMode, setInternalMode] = useState<'light' | 'dark'>(mode);
  const effectiveMode = showToggle ? internalMode : mode;

  // Color palettes for light and dark mode
  const palette: Palette =
    effectiveMode === 'dark'
      ? {
          bg: '#18181b',
          border: '#27272a',
          text: '#f4f4f5',
          subtext: '#a1a1aa',
          sectionBg: '#27272a',
          sectionTitle: '#f4f4f5',
          code: '#d4d4d8',
          valid: '#22d3ee',
          invalid: '#f87171',
          submitting: '#60a5fa',
          idle: '#a1a1aa',
          time: '#c084fc',
          error: '#f87171',
          serverError: '#fb923c',
          valueString: '#67e8f9',
          valueNumber: '#60a5fa',
          valueBoolean: '#c084fc',
          valueKey: '#f4f4f5',
          undefined: '#71717a',
          null: '#71717a',
        }
      : {
          bg: '#fff',
          border: '#e5e7eb',
          text: '#111827',
          subtext: '#6b7280',
          sectionBg: '#f9fafb',
          sectionTitle: '#374151',
          code: '#374151',
          valid: '#059669',
          invalid: '#dc2626',
          submitting: '#2563eb',
          idle: '#4b5563',
          time: '#9333ea',
          error: '#dc2626',
          serverError: '#ea580c',
          valueString: '#059669',
          valueNumber: '#2563eb',
          valueBoolean: '#9333ea',
          valueKey: '#374151',
          undefined: '#9ca3af',
          null: '#9ca3af',
        };

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
    <div
      style={{
        marginTop: '2rem',
        border: `2px solid ${palette.border}`,
        borderRadius: '0.75rem',
        padding: '1.5rem',
        background: palette.bg,
        color: palette.text,
        boxShadow:
          effectiveMode === 'dark'
            ? '0 2px 8px rgba(0,0,0,0.35)'
            : '0 2px 8px rgba(0,0,0,0.10)',
        transition: 'background 0.2s, color 0.2s, border 0.2s',
      }}
    >
      <div
        style={{
          marginBottom: '1.25rem',
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          background: effectiveMode === 'dark' ? '#27272a' : '#f3f4f6',
          color: effectiveMode === 'dark' ? '#f4f4f5' : '#1e293b',
          fontWeight: 700,
          fontSize: '1rem',
          letterSpacing: '0.02em',
          border: `1.5px solid ${palette.border}`,
          display: 'inline-block',
          boxShadow:
            effectiveMode === 'dark'
              ? '0 1px 4px rgba(0,0,0,0.25)'
              : '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        🛠️ Form State{' '}
        <span style={{ fontWeight: 400, fontSize: '0.95em', opacity: 0.7 }}>
          (Debug Tool)
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        <h2
          style={{ fontSize: '1.125rem', fontWeight: 600, color: palette.text }}
        >
          Form State
        </h2>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: form.isValid ? palette.valid : palette.invalid,
            }}
          >
            {form.isValid ? '✓ Valid' : '✗ Invalid'}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: form.canSubmit ? palette.valid : palette.invalid,
            }}
          >
            {form.canSubmit ? '✓ Can Submit' : '✗ Cannot Submit'}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: form.isSubmitting ? palette.submitting : palette.idle,
            }}
          >
            {form.isSubmitting ? '⟳ Submitting' : '• Idle'}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: palette.time,
            }}
          >
            ⏱ Validated: {timeAgo}
          </span>
        </div>
      </div>
      {showToggle && (
        <div style={{ marginBottom: '1rem' }}>
          <label
            style={{
              color: palette.subtext,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={internalMode === 'dark'}
              onChange={(e) =>
                setInternalMode(e.target.checked ? 'dark' : 'light')
              }
              style={{ marginRight: 8 }}
            />
            Dark Mode
          </label>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
        <div>
          <Section title="Values" palette={palette}>
            <ValueDisplay value={form.values} palette={palette} />
          </Section>

          <Section title="Touched State" palette={palette}>
            <ValueDisplay value={form.touched} palette={palette} />
          </Section>
        </div>

        <div>
          <Section title="Validation Errors" palette={palette}>
            {validationErrors.length > 0 ? (
              validationErrors.map((error, i) => (
                <div key={i} style={{ marginBottom: '0.25rem' }}>
                  <span style={{ color: palette.subtext }}>
                    {/* Display path safely - for display purposes we can still use join but with a custom separator */}
                    {error.path.length > 0
                      ? JSON.parse(serializePath(error.path)).join(' → ')
                      : '(root)'}
                    :{' '}
                  </span>
                  <span style={{ color: palette.error }}>{error.message}</span>
                </div>
              ))
            ) : (
              <span style={{ color: palette.subtext }}>
                No validation errors
              </span>
            )}
          </Section>

          <Section title="Client Submission Error" palette={palette}>
            {clientSubmissionErrors.length > 0 ? (
              clientSubmissionErrors.map((error, i) => (
                <div key={i} style={{ marginBottom: '0.25rem' }}>
                  <span style={{ color: palette.subtext }}>
                    {/* Client submission errors are always at root */}
                    (root):{' '}
                  </span>
                  <span style={{ color: palette.error }}>{error.message}</span>
                </div>
              ))
            ) : (
              <span style={{ color: palette.subtext }}>
                No client submission error messages
              </span>
            )}
          </Section>

          <Section title="Server Errors" palette={palette}>
            {serverErrors.length > 0 ? (
              serverErrors.map((error, i) => (
                <div key={i} style={{ marginBottom: '0.25rem' }}>
                  <span style={{ color: palette.subtext }}>
                    {/* Display path safely - for display purposes we can still use join but with a custom separator */}
                    {error.path.length > 0
                      ? JSON.parse(serializePath(error.path)).join(' → ')
                      : '(root)'}
                    :{' '}
                  </span>
                  <span style={{ color: palette.serverError }}>
                    {error.message}
                  </span>
                </div>
              ))
            ) : (
              <span style={{ color: palette.subtext }}>No server errors</span>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
