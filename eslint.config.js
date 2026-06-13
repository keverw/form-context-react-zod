import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist_module', 'coverage'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      // Keep jsx-a11y's recommended set (the reason we added it).
      jsxA11y.flatConfigs.recommended,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      globals: globals.browser,
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React: cherry-pick a few rules (Unirend style) instead of the full
      // flat.recommended preset — keeps things lighter and avoids opinionated
      // rules like react/no-unescaped-entities.
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/react-in-jsx-scope': 'off', // new JSX transform: no React import needed
      // react-hooks recommended keeps refs / set-state-in-effect / hook rules.
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  }
);
