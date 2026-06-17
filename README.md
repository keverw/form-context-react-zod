# Form Context React Zod v2.0.0

[![npm version](https://badge.fury.io/js/form-context-react-zod.svg)](https://badge.fury.io/js/form-context-react-zod)

A powerful React form management library with Zod validation.

<!-- toc -->

- [Project Overview](#project-overview)
- [Features](#features)
- [What's New in 2.0](#whats-new-in-20)
- [Installation](#installation)
- [Quick Usage](#quick-usage)
  - [Web](#web)
  - [React Native](#react-native)
- [Debugging](#debugging)
- [Demos](#demos)
  - [Native Demo Details](#native-demo-details)
- [Development](#development)
- [Entry Points](#entry-points)
- [SSR / Hydration](#ssr--hydration)
- [Documentation](#documentation)
- [Library Structure](#library-structure)
- [License](#license)
- [Disclaimer](#disclaimer)

<!-- tocstop -->

## Project Overview

This repository contains:

1. **React Form Library** ([`src/`](./src)): A TypeScript-first form management system that handles complex nested forms with validation, server-side errors, and array fields. Works on both web (DOM) and React Native.
2. **Runnable demos** ([`examples/`](./examples)): a Vite web app ([`examples/web`](./examples/web)) and an Expo React Native app ([`examples/native`](./examples/native)), each a standalone package that consumes the built library. See [Demos](#demos).

## Features

- **Type-safe form handling** with Zod schemas
- **Nested form support** for complex data structures
- **Array field management** for dynamic form elements
- **Client and server-side validation**
- **React hooks** for form state management
- **Comprehensive error handling** with path-based errors

## What's New in 2.0

2.0 is a ground-up modernization. Highlights:

- **Requires React 19 and Zod 4.** Need React 18 / Zod 3? Stay on `form-context-react-zod@^1`.
- **React Native support.** The core is DOM-free and runs on web _and_ RN. The HTML `<form>` wrapper moved to the opt-in `form-context-react-zod/web` entry (`WebFormProvider`).
- **Multi-entry exports.** Conditional exports so you pull in only what you use: core (`.`), `web`, and `devtools/web` / `devtools/native` debug panels. See [Entry Points](#entry-points).
- **Array fields, leveled up.** `useArrayField` gains `insert`/`prepend`/`swap`/`replace`/`update`, plus **stable item IDs** (`arrayFieldIDs`) so focus/cursor survive reorders.
- **Dirty tracking.** `isDirty` / `dirtyFields` plus `markPristine(...)` to re-baseline after a save.
- **Focus management.** `setFocus(path)` / `focusFirstError()` (platform-agnostic, works on RN too).
- **Richer error & validation API.** Manual errors (`setError`), per-field validation (`validateField`), a one-call `getFieldState(path)`, submit-attempt flags (`submitAttempted` / `submitSucceeded` / `submitCount`), and an `AbortSignal` on the `onSubmit` helpers.
- **Per-field re-render isolation.** Editing one field no longer re-renders the whole form.
- **SSR-safe.** Works with `renderToString` and streaming. See [SSR / Hydration](#ssr--hydration).

## Installation

```bash
npm install form-context-react-zod
# or
bun add form-context-react-zod
# or
yarn add form-context-react-zod
```

> **Requires React 19 and Zod 4.** Need React 18 / Zod 3? Install `form-context-react-zod@^1`.

Peer dependencies:

```bash
npm install react zod
# or
bun add react zod
# or
yarn add react zod
```

Optional peers: web apps typically already include `react-dom`, and React
Native apps typically already include `react-native`. Install the relevant
package if it is not already present.

## Quick Usage

### Web

Use `WebFormProvider` when you want native browser form behavior (`<form>`,
submit buttons, and Enter-to-submit):

```tsx
import { WebFormProvider } from 'form-context-react-zod/web';
import { useField, type FormSubmitHandler } from 'form-context-react-zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2),
  email: z.email(),
});

type Values = z.infer<typeof schema>;

const onSubmit: FormSubmitHandler<Values> = (values) => {
  console.log(values);
};

export function ContactForm() {
  return (
    <WebFormProvider
      initialValues={{ name: '', email: '' }}
      schema={schema}
      onSubmit={onSubmit}
    >
      <ContactFormFields />
    </WebFormProvider>
  );
}

function ContactFormFields() {
  const name = useField(['name']);
  const email = useField(['email']);

  return (
    <>
      <TextField {...name.props} placeholder="Name" />
      <TextField {...email.props} placeholder="Email" />
      <button type="submit">Submit</button>
    </>
  );
}
```

`useField` is **value-based** by design: `field.props.onChange` hands you the new
**value**, not a DOM event (and `field.props.errorText` is the error, not a DOM
attribute). So you don't spread `{...field.props}` onto a raw `<input>`. The suggestion is that you
build one small **custom input** that speaks the value-based shape using your design system styles, then spread a
field onto it anywhere:

```tsx
function TextField({
  value,
  onChange,
  onBlur,
  errorText,
  placeholder,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  errorText?: string | string[] | null;
  placeholder?: string;
}) {
  return (
    <>
      <input
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
      />
      {errorText && <span>{errorText}</span>}
    </>
  );
}
```

Write that adapter once and every field is just `<TextField {...field.props} />`.
This is the intended pattern and what both [demos](#demos) use. See
[`examples/web/components/FormInput.tsx`](./examples/web/components/FormInput.tsx)
for a fuller version (labels, accessibility, textarea/checkbox variants). On
React Native the same value-based shape maps 1:1 onto `<TextInput onChangeText>`
(see [`examples/native/src/RNFormInput.tsx`](./examples/native/src/RNFormInput.tsx)).

`useField` also returns an `inputRef` callback (separate from `props`). Forwarding
it to your input — `<input ref={inputRef} />` (or `<TextInput ref={inputRef} />`
on RN) — is what opts a field into `setFocus(path)` / `focusFirstError()`; a field
that never attaches `inputRef` simply isn't focusable. See
[Focus Management](./docs/form-api.md#focus-management) for the full pattern.

### React Native

Use the core `FormProvider` on native. There is no `<form>`, so submit from a
button with `form.submit()`:

```tsx
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  FormProvider,
  useField,
  useFormContext,
  type FormSubmitHandler,
} from 'form-context-react-zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2),
});

type Values = z.infer<typeof schema>;

const onSubmit: FormSubmitHandler<Values> = (values) => {
  console.log(values);
};

export function NativeContactForm() {
  return (
    <FormProvider
      initialValues={{ name: '' }}
      schema={schema}
      onSubmit={onSubmit}
    >
      <NativeContactFormFields />
    </FormProvider>
  );
}

function NativeContactFormFields() {
  const form = useFormContext<Values>();
  const name = useField(['name']);

  return (
    <View>
      <TextInput
        // props.value is typed `unknown` (paths aren't typed against the schema),
        // so cast to the field's type here — or read it typed with
        // form.getValue<string>(['name']).
        value={name.props.value as string}
        onChangeText={name.props.onChange}
        onBlur={name.props.onBlur}
        placeholder="Name"
      />
      <Pressable onPress={() => form.submit()} disabled={!form.canSubmit}>
        <Text>Submit</Text>
      </Pressable>
    </View>
  );
}
```

There's no `<form>` on native, so the web's automatic Enter-to-submit doesn't
apply (that's an affordance of `WebFormProvider`'s `<form>`, not the core). The
suggested pattern is a small custom input adapter (the value-based one above),
and that adapter is a natural home for return-key submission too: forward
`onSubmitEditing` through to the underlying `TextInput` and pass
`onSubmitEditing={() => form.submit()}` at the call site, or read `submit` from
`useFormContext()` inside the adapter. The same wiring also catches the Enter key
from a hardware / Bluetooth keyboard on a focused single-line field; multi-line
inputs (where Enter inserts a newline) and any global/app-wide shortcuts stay
your call.

## Debugging

The `FormState` component is a developer tool for inspecting the current form
state, errors, and touched fields.

**Usage:**

```tsx
// Web
import { FormState } from 'form-context-react-zod/devtools/web';

// React Native
import { FormState } from 'form-context-react-zod/devtools/native';

<FormState showToggle />;
```

- Imported from the `form-context-react-zod/devtools/web` subpath (or
  `/devtools/native` on React Native) so the core entry stays DOM-free.
- Use the `showToggle` prop to render a light/dark toggle so you can switch at runtime.
- Use the `mode` prop (`'light' | 'dark'`, default `'light'`) to set the theme.
  `mode` always sets the **initial** theme. When `showToggle` is `false` it stays
  fixed at `mode`, and when the toggle is on it just seeds the starting state and
  the toggle takes over from there. Changing `mode` after mount has no effect once the toggle is active.
- Both variants accept an optional `style` prop applied to the outer container —
  `React.CSSProperties` on web, `StyleProp<ViewStyle>` on React Native. Caller styles
  are merged last, so they override the panel defaults.
- This component is intended for development and debugging purposes.

## Demos

Two runnable demos live in this repo:

- **Web**: A Vite app in [`examples/web`](./examples/web) that exercises every
  feature: nested objects, array fields (add / remove / reorder), client + server
  validation, async validation, focus management, and the `FormState` debugger.
  Run it locally with `bun run demo:web`, or open the
  [live demo](https://keverw.github.io/form-context-react-zod/).
- **React Native**: An Expo app in [`examples/native`](./examples/native) that
  proves the **same** core runs on native: Zod validation, `useArrayField`, a
  `TextInput` adapter, and the published `devtools/native` `FormState` panel.

Both demos are standalone packages that depend on the built library via a
`file:../../dist_module` link, so they exercise the **real published entry
points** rather than the source. The root `demo:*` commands run
`bun run build:lib` first, so the demo always picks up your latest library
changes. Vite's dev server still gives the web demo full HMR for its own UI.
After editing the **library**, re-run `bun run demo:web` to rebuild it.

First, install each demo's dependencies once (each is its own package). These
build the library first, so the `file:../../dist_module` link resolves even on a
fresh clone (`dist_module` is generated, not committed):

```bash
bun run demo:web:install
bun run demo:native:install
```

Then run either demo from the repo root:

```bash
# Web demo (Vite)
bun run demo:web         # builds the library, then starts the Vite dev server

# React Native / Expo demo
bun run demo:native:ios      # builds iOS, launches the app, and starts Metro
bun run demo:native:android  # builds Android, launches the app, and starts Metro
bun run demo:native          # starts Metro for Expo Go or an installed dev build
bun run demo:native:clear    # same as above, with a cleared Metro cache
```

The native demo defaults to a **development build** (it depends on `expo-dev-client`),
which mirrors how a real shipped Expo app runs. Expo Go is still available as a
fallback: run `bun run demo:native`, press `s` to switch to Expo Go, then press
`i` / `a` or scan the QR code.

You do not need to run `bun run demo:native` before `bun run demo:native:ios` or
`bun run demo:native:android`. The build commands start Metro themselves. Use
`bun run demo:native` after the first dev build is installed, or when using Expo
Go.

### Native Demo Details

The core is already platform-agnostic:

- `FormProvider` (the core entry) renders no host elements, including no `<form>`, so it's
  React-Native-safe as-is. The web `<form>` lives in `form-context-react-zod/web`.
- `useField(...).props.onChange` is value-based. It receives the new value, not
  a DOM event, which maps 1:1 onto `<TextInput onChangeText>`.

See [`examples/native/src/RNFormInput.tsx`](./examples/native/src/RNFormInput.tsx)
for the small input adapter. Each native tab renders the published `FormState`
from `form-context-react-zod/devtools/native`.

For iOS, install Xcode and CocoaPods, then run `bun run demo:native:ios`. A free
Apple ID can sign a real-device build for about 7 days. For Android, install
Android Studio, create or launch an emulator, ensure JDK 17 is available, then
run `bun run demo:native:android`.

This demo pins Expo SDK 54 / React Native 0.81 so it builds on Xcode 16.x.
[`examples/native/metro.config.js`](./examples/native/metro.config.js) lets SDK
54's Metro consume the `file:`-linked package, watch `dist_module`, resolve
package exports, and pin shared peers (`react`, `react-native`, and `zod`) to
the demo app's copies.

> Rebuilt the library? The root native demo commands run `bun run build:lib`
> first. If Metro still has stale output, restart it with `bun run demo:native:clear`.

## Development

This repo uses [Bun](https://bun.sh) as its toolchain. The test runner, build
scripts, and lockfile are all Bun-based. Install Bun, then:

```bash
# Install repo dependencies
bun install

# Check types, lint, and tests
bun run type-check
bun run lint
bun test

# Build the published package, and the web demo
bun run build:lib
bun run build:web

# Publish the web demo to GitHub Pages
bun run deploy
```

| Command               | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `bun run type-check`  | Run TypeScript without emitting                               |
| `bun run lint`        | Run ESLint                                                    |
| `bun test`            | Run the test suite                                            |
| `bun run build:lib`   | Build the package into `dist_module` (see note below)         |
| `bun run build:web`   | Build the library, then the web demo into `examples/web/dist` |
| `bun run preview`     | Preview the built web demo                                    |
| `bun run deploy`      | Build and publish the web demo to GitHub Pages                |
| `bun run publish:lib` | Publish `dist_module` to npm, then redeploy the demo to Pages |

> **Heads-up:** `bun run build:lib` does more than emit `dist_module`. It also
> regenerates the doc tables of contents (via `update-docs`) and re-stamps the
> demos' generated `version.ts` files (via `stamp-versions`), and every `demo:*` /
> `build:web` command runs it first. These regenerate in place, so on a clean tree
> at the same version they produce **no** diff — the version files only change when
> the library version actually changed, and the docs only when their content did.
> Just don't be surprised if starting a demo right after a version bump (or a doc
> edit) leaves a git diff in those generated files.

`bun run deploy` is manual. Bun runs the `predeploy` script first, so the actual
flow is `bun run build:web` followed by `gh-pages -d examples/web/dist`. The
`gh-pages` package pushes the built folder to the repository's `gh-pages` branch.
GitHub Pages updates from that branch when the repo is configured to serve it.

`bun run publish:lib` runs the checks + build, publishes `dist_module` to npm,
then runs `bun run deploy` so the live demo on GitHub Pages is refreshed for the
new release.

## Entry Points

The package ships as conditional exports so you only pull in what you use:

| Import                                   | Contents                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `form-context-react-zod`                 | **Core**: `FormProvider`, `useFormContext`, `useField`, `useArrayField`, zod helpers. Renders **no host elements** (no `<form>`), so it works on web _and_ React Native. |
| `form-context-react-zod/web`             | Adds `WebFormProvider`, the core provider plus an HTML `<form>` wrapper (on by default) for native browser submit + Enter-to-submit.                                     |
| `form-context-react-zod/devtools/web`    | The `FormState` debug panel (web/DOM). Opt-in, keep it out of production bundles.                                                                                        |
| `form-context-react-zod/devtools/native` | The `FormState` debug panel for React Native (View/Text). Needs `react-native` (an optional peer).                                                                       |

```tsx
// Cross-platform core (web or React Native):
import { FormProvider, useField } from 'form-context-react-zod';

// Web app that wants a real <form> element (renders <form> by default):
import { WebFormProvider } from 'form-context-react-zod/web';
import { FormState } from 'form-context-react-zod/devtools/web'; // web debug only

// React Native:
import { FormState } from 'form-context-react-zod/devtools/native'; // RN debug only
```

The core `FormProvider` is the shared base (no `<form>`). `WebFormProvider` is the
same provider plus the `<form>` wrapper (`useFormTag`, on by default). On React
Native you use the core `FormProvider`. See [`examples/native`](./examples/native)
for a runnable Expo demo.

The two React contexts are published as an internal `./context` subpath and shared
across every entry, so a `FormState` rendered from `/devtools/web` (or `/devtools/native`)
reads the same form state your `FormProvider` populated. Keeping the core DOM-free is also
what makes the React Native track possible.

## SSR / Hydration

The library is server-render safe. It works with `renderToString` (and the streaming
APIs), so it slots into Next.js, Remix, Unirend, etc. The per-field hooks supply a
`getServerSnapshot` to `useSyncExternalStore`, so a server render produces the initial-values
markup the client then hydrates.

The one rule: **pass identical `initialValues` on the server and the client.** Hydration assumes
the two renders start from the same state, so derive `initialValues` from the same source (loader
data, props) on both sides rather than regenerating it (e.g. avoid `Date.now()`/random defaults
that differ per render). The same applies to `initialServerErrors` if you seed them. Hand the
server and client the same array.

## Documentation

- [Form API Documentation](./docs/form-api.md)
- [Zod Helpers Documentation](./docs/zod-helpers.md)

## Library Structure

All library source lives under [`src/`](./src):

- [`src/form-context.tsx`](./src/form-context.tsx) - `FormProvider` and the form context
- [`src/hooks/`](./src/hooks) - `useFormContext`, `useField`, `useArrayField`
- [`src/zod-helpers.ts`](./src/zod-helpers.ts) - Zod validation helpers
- [`src/utils.ts`](./src/utils.ts) - path/value utilities (`getValueAtPath`, `serializePath`, …)
- [`src/web.ts`](./src/web.ts) / [`src/form-provider-web.tsx`](./src/form-provider-web.tsx) - the web entry and `WebFormProvider`
- [`src/devtools/`](./src/devtools) + [`src/components/`](./src/components) - the opt-in `FormState` panels

The published entry points are described under [Entry Points](#entry-points).

## License

MIT

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by React, Zod, or
Expo. All product names, logos, and brands are property of their respective
owners.
