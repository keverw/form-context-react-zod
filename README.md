# Form Context React Zod v2.0.0

[![npm version](https://badge.fury.io/js/form-context-react-zod.svg)](https://badge.fury.io/js/form-context-react-zod)

A powerful React form management library with Zod validation.

## Project Overview

This repository contains:

1. **React Form Library**: A TypeScript-first form management system that handles complex nested forms with validation, server-side errors, and array fields.
2. **Demo Application**: A Vite-powered React application showcasing the form library's capabilities.

## Features

- **Type-safe form handling** with Zod schemas
- **Nested form support** for complex data structures
- **Array field management** for dynamic form elements
- **Client and server-side validation**
- **React hooks** for form state management
- **Comprehensive error handling** with path-based errors

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Building the Demo

```bash
# Build the demo application
npm run build
```

### Using the Library

You can use this library in your projects by installing it from NPM:

```bash
npm install form-context-react-zod
```

> **Requires React 19 and Zod 4.** Need React 18 / Zod 3? Install `form-context-react-zod@^1`.

## Demos

Two runnable demos live in this repo:

- **Web** — a Vite app that exercises every feature: nested objects, array fields
  (add / remove / reorder), client + server validation, async validation, focus
  management, and the `FormState` debugger. Run it locally with `npm run dev`, or
  open the [live demo](https://keverw.github.io/form-context-react-zod/).
- **React Native** — an Expo app in [`examples/native`](./examples/native) that
  proves the **same** core runs on native: Zod validation, `useArrayField`, a
  `TextInput` adapter, and the published `devtools/native` `FormState` panel. It
  depends on the built package via a `file:` link, so it exercises the real
  published entry points. See its [README](./examples/native/README.md) to run it.

## Entry points

The package ships as conditional exports so you only pull in what you use:

| Import                                   | Contents                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `form-context-react-zod`                 | **Core** — `FormProvider`, `useFormContext`, `useField`, `useArrayField`, zod helpers. Renders **no host elements** (no `<form>`), so it works on web _and_ React Native. |
| `form-context-react-zod/web`             | Adds `WebFormProvider` — the core provider plus an HTML `<form>` wrapper (on by default) for native browser submit + Enter-to-submit.                                     |
| `form-context-react-zod/devtools/web`    | The `FormState` debug panel (web/DOM). Opt-in, keep it out of production bundles.                                                                                         |
| `form-context-react-zod/devtools/native` | The `FormState` debug panel for React Native (View/Text). Needs `react-native` (an optional peer).                                                                        |

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
Native you use the core `FormProvider`; see [`examples/native`](./examples/native)
for a runnable Expo demo.

The two React contexts are published as an internal `./context` subpath and shared
across every entry, so a `FormState` rendered from `/devtools/web` (or `/devtools/native`)
reads the same form state your `FormProvider` populated. Keeping the core DOM-free is also
what makes the React Native track possible.

## SSR / Hydration

The library is server-render safe — it works with `renderToString` (and the streaming
APIs), so it slots into Next.js, Remix, Unirend, etc. The per-field hooks supply a
`getServerSnapshot` to `useSyncExternalStore`, so a server render produces the initial-values
markup the client then hydrates.

The one rule: **pass identical `initialValues` on the server and the client.** Hydration assumes
the two renders start from the same state, so derive `initialValues` from the same source (loader
data, props) on both sides rather than regenerating it (e.g. avoid `Date.now()`/random defaults
that differ per render). The same applies to `initialServerErrors` if you seed them — hand the
server and client the same array.

## Documentation

- [Form API Documentation](./FORM-API.md)
- [Zod Helpers Documentation](./ZOD-HELPERS.md)

## Library Structure

The core library code is located in:

- `src/lib/form-context.tsx` - Form context and hooks
- `src/lib/zod-helpers.ts` - Zod validation utilities

## Commands

| Command               | Description                          |
| --------------------- | ------------------------------------ |
| `npm run dev`         | Start development server             |
| `npm run build`       | Build the demo application           |
| `npm run build:lib`   | Build the library for NPM            |
| `npm run publish:lib` | Build and publish the library to NPM |
| `npm run lint`        | Run ESLint                           |
| `npm run preview`     | Preview the built application        |

## License

MIT
