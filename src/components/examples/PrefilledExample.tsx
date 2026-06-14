import { useState } from 'react';
import { z } from 'zod';
import { FormProvider, FormHelpers } from '../../lib/form-context';
import type { ValidationError } from '../../lib/zod-helpers';
import FormInput from '../FormInput';
import { RootErrors, SubmitButton, FormNotice } from './shared';
import { FormState } from '../../lib/components/FormState';
import { useFormContext } from '../../lib/hooks/useFormContext';
import { useField } from '../../lib/hooks/useField';
import { useToast } from '../useToast';
import { simulateServer } from './utils';

// Define the schema
const prefilledSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.email('Invalid email address'),
  age: z.coerce.number().min(18, 'Must be at least 18 years old'),
  bio: z.string().min(10, 'Bio must be at least 10 characters'),
  website: z
    .string()
    .transform((val) => (val.trim() === '' ? undefined : val))
    .optional()
    .pipe(z.url({ message: 'Invalid URL' }).optional()), // If string, must be URL. If undefined, it's fine.
});

// Infer the form values type from the schema. FormValues.age will now be number.
type FormValues = z.infer<typeof prefilledSchema>;

type CaseKey = 'all' | 'partial' | 'touchAll' | 'serverPrefilled';

function CaseNotice({ caseKey }: { caseKey: CaseKey }) {
  if (caseKey === 'all') {
    return (
      <FormNotice type="info">
        <div>
          The server returned <strong>every field</strong>, so each one is
          populated on load. With <code>validateOnMount</code>, populated fields
          are touched, so all of their validation errors show immediately:
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>
              <code>username</code>: Valid
            </li>
            <li>
              <code>email</code>: Invalid format
            </li>
            <li>
              <code>age</code>: Below minimum
            </li>
            <li>
              <code>bio</code>: Too short
            </li>
            <li>
              <code>website</code>: Optional but invalid if provided
            </li>
          </ul>
        </div>
      </FormNotice>
    );
  }

  if (caseKey === 'serverPrefilled') {
    return (
      <FormNotice type="info">
        <div>
          All fields are valid against the schema, but the server rejected the
          record and sent back errors — seeded declaratively via the{' '}
          <code>initialServerErrors</code> prop (no submit needed). Server
          errors render <strong>regardless of touched state</strong>, so they
          show on load:
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>
              Root (form-level): &ldquo;This account is pending review&rdquo;
            </li>
            <li>
              <code>username</code>: &ldquo;Username already taken&rdquo;
            </li>
            <li>
              <code>email</code>: &ldquo;Email domain not allowed&rdquo;
            </li>
          </ul>
          Note that <code>canSubmit</code> is <strong>schema-only</strong> — it
          doesn&apos;t account for server errors — so even with these showing,
          the Submit button below is <strong>enabled</strong> (the values pass
          the schema). Server errors are feedback, not a submit gate; if you
          want them to block submission, disable your button while{' '}
          <code>getError([...])</code> is non-empty, or re-check in{' '}
          <code>onSubmit</code>. Editing a field replaces its server error; the
          others persist until cleared. <code>reset()</code> clears all server
          errors and does not restore these seeds.
        </div>
      </FormNotice>
    );
  }

  if (caseKey === 'touchAll') {
    return (
      <FormNotice type="info">
        <div>
          Same partial data as the previous tab, but with{' '}
          <code>touchAllOnMount</code> turned on. Now <strong>every</strong>{' '}
          field is marked touched on load, so the empty required fields surface
          their errors immediately instead of staying quiet:
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>
              <code>username</code>: Provided &amp; valid (no error)
            </li>
            <li>
              <code>email</code>: Provided &amp; valid (no error)
            </li>
            <li>
              <code>age</code>: Missing/empty —{' '}
              <strong>error shown on load</strong>
            </li>
            <li>
              <code>bio</code>: Missing/empty —{' '}
              <strong>error shown on load</strong>
            </li>
            <li>
              <code>website</code>: Missing/empty — optional, so still fine
            </li>
          </ul>
          Useful when you want the user to see the full checklist of what&apos;s
          required up front.
        </div>
      </FormNotice>
    );
  }

  return (
    <FormNotice type="info">
      <div>
        The server returned only <strong>some</strong> fields; the rest came
        back empty. With <code>validateOnMount</code>, only the populated fields
        are touched — empty required fields stay quiet until you interact with
        them, even though the form is <strong>not submittable</strong> (the
        Submit button stays disabled and <code>canSubmit</code> is{' '}
        <code>false</code>):
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>
            <code>username</code>: Provided &amp; valid (touched)
          </li>
          <li>
            <code>email</code>: Provided &amp; valid (touched)
          </li>
          <li>
            <code>age</code>: Missing/empty — required, but{' '}
            <strong>no error shown</strong> until touched
          </li>
          <li>
            <code>bio</code>: Missing/empty — required, but{' '}
            <strong>no error shown</strong> until touched
          </li>
          <li>
            <code>website</code>: Missing/empty — optional, so it&apos;s fine
          </li>
        </ul>
        Try blurring or typing in <code>age</code> / <code>bio</code> to surface
        their errors. Or flip on <code>touchAllOnMount</code> to reveal
        everything at once.
      </div>
    </FormNotice>
  );
}

function PrefilledForm({ caseKey }: { caseKey: CaseKey }) {
  const form = useFormContext();
  const usernameField = useField(['username']);
  const emailField = useField(['email']);
  const ageField = useField(['age']);
  const bioField = useField(['bio']);
  const websiteField = useField(['website']);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <CaseNotice caseKey={caseKey} />
      <RootErrors />
      <div className="space-y-4">
        <FormInput
          {...usernameField.props}
          label="Username"
          placeholder="johndoe"
        />
        <FormInput
          {...emailField.props}
          label="Email"
          placeholder="john@example.com"
          type="email"
        />
        <FormInput
          {...ageField.props}
          label="Age"
          type="number" // HTML input type remains number for UX
          placeholder="18"
        />
        <FormInput
          {...bioField.props}
          label="Bio"
          placeholder="Tell us about yourself..."
          multiline
        />
        <FormInput
          {...websiteField.props}
          label="Website (Optional)"
          placeholder="https://example.com"
        />
        <SubmitButton />
        <FormState />
      </div>
    </form>
  );
}

// Each sub-case seeds different `initialValues` to show how `validateOnMount`
// only touches populated fields.
const caseInitialValues: Record<CaseKey, FormValues> = {
  // Server returned everything; several values are invalid -> all errors show.
  all: {
    username: 'johndoe', // Valid
    email: 'invalid-email', // Invalid format
    age: 16, // Below minimum
    bio: 'Too short', // Too short
    website: 'not-a-url', // Invalid URL
  },
  // Server returned only username/email; age & bio came back empty (required,
  // but stay quiet), website empty (optional, fine).
  partial: {
    username: 'janedoe', // Valid
    email: 'jane@example.com', // Valid
    age: 0, // Empty -> not auto-touched, no error until interacted
    bio: '', // Empty -> not auto-touched, no error until interacted
    website: '', // Empty -> optional, fine
  },
  // Same partial data, but touchAllOnMount reveals the empty-required errors.
  touchAll: {
    username: 'janedoe',
    email: 'jane@example.com',
    age: 0,
    bio: '',
    website: '',
  },
  // Schema-valid values, but the server rejected them (see initialServerErrors).
  serverPrefilled: {
    username: 'janedoe',
    email: 'jane@example.com',
    age: 25,
    bio: 'A perfectly valid bio that is long enough.',
    website: 'https://example.com',
  },
};

// Server errors seeded at mount for the serverPrefilled case. A root error
// (path: []) plus two field-level errors, shown without any submit or touch.
const caseInitialServerErrors: Partial<Record<CaseKey, ValidationError[]>> = {
  serverPrefilled: [
    { path: [], message: 'This account is pending review.' },
    { path: ['username'], message: 'Username already taken' },
    { path: ['email'], message: 'Email domain not allowed' },
  ],
};

const subTabs: { key: CaseKey; label: string }[] = [
  { key: 'all', label: 'All fields prefilled' },
  { key: 'partial', label: 'Partial (some missing)' },
  { key: 'touchAll', label: 'Partial + touchAllOnMount' },
  { key: 'serverPrefilled', label: 'Server errors at mount' },
];

export default function PrefilledExample() {
  const toast = useToast();
  const [activeCase, setActiveCase] = useState<CaseKey>('all');

  const onSubmit = async (
    values: FormValues,
    helpers: FormHelpers<FormValues>
  ) => {
    try {
      await simulateServer(values);
      toast.success('Form submitted successfully!');
    } catch (error) {
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
    <div>
      {/* Sub-tabs: each switches the seeded values to demo a different case */}
      <div className="inline-flex rounded-lg bg-gray-100 p-1 mb-4">
        {subTabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveCase(key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              activeCase === key
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-gray-600 hover:text-blue-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <FormProvider
        // `key` forces a fresh provider (and a fresh mount-time validation)
        // whenever the case changes, so initialValues are re-seeded.
        key={activeCase}
        initialValues={caseInitialValues[activeCase]}
        initialServerErrors={caseInitialServerErrors[activeCase]} // Seeded at mount (serverPrefilled case)
        schema={prefilledSchema}
        validateOnMount={true} // Enable validation on mount
        touchAllOnMount={activeCase === 'touchAll'} // Reveal every error on load
        onSubmit={onSubmit}
      >
        <PrefilledForm caseKey={activeCase} />
      </FormProvider>
    </div>
  );
}
