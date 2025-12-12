import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['*.d.ts', 'vite.config.mts', '**/dist', '**/*.test.ts', '**/*.spec.ts'] },
  ...node,
  {
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'n/global-require': 'off',
    },
  },
];

