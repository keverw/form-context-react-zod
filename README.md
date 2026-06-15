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
