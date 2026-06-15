import { useEffect, useState, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFormContext } from '../hooks/useFormContext';
import { deserializePath } from '../utils';

export interface FormStateProps {
  /** Color scheme. Defaults to 'light'. */
  mode?: 'light' | 'dark';
  /** Render an in-panel switch to toggle light/dark. Defaults to false. */
  showToggle?: boolean;
  /** Optional style applied to the outer container. */
  style?: StyleProp<ViewStyle>;
}

interface Palette {
  panelBg: string;
  border: string;
  heading: string;
  sectionTitle: string;
  codeBg: string;
  codeBorder: string;
  code: string;
  muted: string;
  errorLine: string;
  okBg: string;
  okText: string;
  badBg: string;
  badText: string;
  neutralBg: string;
  neutralText: string;
}

const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    panelBg: '#f9fafb',
    border: '#e5e7eb',
    heading: '#111827',
    sectionTitle: '#374151',
    codeBg: '#ffffff',
    codeBorder: '#e5e7eb',
    code: '#111827',
    muted: '#9ca3af',
    errorLine: '#991b1b',
    okBg: '#dcfce7',
    okText: '#166534',
    badBg: '#fee2e2',
    badText: '#991b1b',
    neutralBg: '#ede9fe',
    neutralText: '#5b21b6',
  },
  dark: {
    panelBg: '#18181b',
    border: '#27272a',
    heading: '#f4f4f5',
    sectionTitle: '#e4e4e7',
    codeBg: '#27272a',
    codeBorder: '#3f3f46',
    code: '#d4d4d8',
    muted: '#71717a',
    errorLine: '#fca5a5',
    okBg: '#14532d',
    okText: '#86efac',
    badBg: '#7f1d1d',
    badText: '#fca5a5',
    neutralBg: '#3730a3',
    neutralText: '#c7d2fe',
  },
};

/**
 * React Native debug panel — the native equivalent of the web `FormState`.
 * Import from `form-context-react-zod/devtools/native`. Renders the live form
 * state (values, touched, dirty fields, errors by source, submit flags) with RN
 * primitives, in light or dark `mode`. Intended for development only.
 */
export function FormState({
  mode = 'light',
  showToggle = false,
  style,
}: FormStateProps) {
  const form = useFormContext();
  const [internalMode, setInternalMode] = useState<'light' | 'dark'>(mode);
  const effectiveMode = showToggle ? internalMode : mode;
  const p = PALETTES[effectiveMode];

  const validation = form.errors.filter(
    (e) => e.source === 'client' || e.source === undefined
  );
  const server = form.errors.filter((e) => e.source === 'server');
  const manual = form.errors.filter((e) => e.source === 'manual');
  const clientSubmission = form.errors.filter(
    (e) => e.source === 'client-form-handler'
  );

  // Tick once a second so the relative "validated … ago" line stays current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!form.lastValidated) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [form.lastValidated]);

  const dirtyCount = Object.keys(form.dirtyFields).length;

  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: p.panelBg, borderColor: p.border },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.heading, { color: p.heading }]}>🛠️ Form State</Text>
        {showToggle && (
          <View style={styles.toggle}>
            <Text style={[styles.toggleLabel, { color: p.muted }]}>Dark</Text>
            <Switch
              value={internalMode === 'dark'}
              onValueChange={(v) => setInternalMode(v ? 'dark' : 'light')}
            />
          </View>
        )}
      </View>

      <View style={styles.chips}>
        <Chip label={form.isValid ? '✓ Valid' : '✗ Invalid'} ok={form.isValid} p={p} />
        <Chip
          label={form.canSubmit ? '✓ Can Submit' : '✗ Cannot Submit'}
          ok={form.canSubmit}
          p={p}
        />
        <Chip
          label={form.isDirty ? '● Dirty' : '○ Pristine'}
          ok={!form.isDirty}
          p={p}
        />
        <Chip
          label={form.isSubmitting ? '⟳ Submitting' : '• Idle'}
          ok={!form.isSubmitting}
          p={p}
        />
        <Chip
          label={`⏱ ${relativeTime(form.lastValidated, now)}`}
          tone="neutral"
          p={p}
        />
      </View>

      <Section title="Values" p={p}>
        <Code value={form.values} p={p} />
      </Section>

      <Section title="Touched" p={p}>
        <Code value={prettyPaths(form.touched)} p={p} />
      </Section>

      <Section title={`Dirty Fields (${dirtyCount})`} p={p}>
        {dirtyCount > 0 ? (
          <Code value={prettyPaths(form.dirtyFields)} p={p} />
        ) : (
          <Text style={[styles.muted, { color: p.muted }]}>No dirty fields</Text>
        )}
      </Section>

      <Section title="Submission" p={p}>
        <Code
          value={{
            submitAttempted: form.submitAttempted,
            submitSucceeded: form.submitSucceeded,
            submitCount: form.submitCount,
            currentSubmissionID: form.currentSubmissionID,
          }}
          p={p}
        />
      </Section>

      <Section title={`Validation Errors (${validation.length})`} p={p}>
        <Errors list={validation} p={p} />
      </Section>
      <Section title={`Client Submission Errors (${clientSubmission.length})`} p={p}>
        <Errors list={clientSubmission} p={p} />
      </Section>
      <Section title={`Server Errors (${server.length})`} p={p}>
        <Errors list={server} p={p} />
      </Section>
      <Section title={`Manual Errors (${manual.length})`} p={p}>
        <Errors list={manual} p={p} />
      </Section>
    </View>
  );
}

function Section({
  title,
  children,
  p,
}: {
  title: string;
  children: ReactNode;
  p: Palette;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: p.sectionTitle }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  ok,
  tone,
  p,
}: {
  label: string;
  ok?: boolean;
  tone?: 'neutral';
  p: Palette;
}) {
  const bg = tone === 'neutral' ? p.neutralBg : ok ? p.okBg : p.badBg;
  const color = tone === 'neutral' ? p.neutralText : ok ? p.okText : p.badText;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

function Code({ value, p }: { value: unknown; p: Palette }) {
  return (
    <ScrollView
      horizontal
      style={[styles.codeWrap, { backgroundColor: p.codeBg, borderColor: p.codeBorder }]}
    >
      <Text style={[styles.code, { color: p.code }]}>{safeStringify(value)}</Text>
    </ScrollView>
  );
}

function Errors({
  list,
  p,
}: {
  list: { path: (string | number)[]; message: string }[];
  p: Palette;
}) {
  if (list.length === 0)
    return <Text style={[styles.muted, { color: p.muted }]}>none</Text>;
  return (
    <View>
      {list.map((e, i) => (
        <Text key={i} style={[styles.errorLine, { color: p.errorLine }]}>
          • {e.path.join('.') || '(root)'}: {e.message}
        </Text>
      ))}
    </View>
  );
}

// `touched`/`dirtyFields` are keyed by serialized JSON paths (e.g. `["a",0]`).
// Re-key them to readable dotted paths so the display doesn't show escaped
// quotes (`"[\"a\",0]"`) from re-stringifying an already-JSON key.
function prettyPaths(record: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(record)) {
    out[deserializePath(key).join('.') || '(root)'] = val;
  }
  return out;
}

function relativeTime(ts: number | null | undefined, now: number): string {
  if (!ts) return 'never';
  const diff = now - ts;
  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, v) => (typeof v === 'bigint' ? String(v) : v),
      2
    );
  } catch {
    return String(value);
  }
}

// Structural styles only — colors come from the active Palette (see above).
const styles = StyleSheet.create({
  panel: {
    marginTop: 24,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  heading: { fontSize: 16, fontWeight: '700' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { fontSize: 12, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '600' },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  codeWrap: { borderRadius: 6, borderWidth: 1 },
  code: { fontFamily: 'Courier', fontSize: 12, padding: 8 },
  errorLine: { fontSize: 12 },
  muted: { fontSize: 12 },
});
