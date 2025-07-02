import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['src/**/*.test.ts', 'test-assets/**'] },
  ...node,
  {
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
];
