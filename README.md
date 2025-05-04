# Form Context React Zod

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
