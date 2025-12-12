import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['*.d.ts', 'vite.config.mts', '**/dist', 'postinstall.js', 'postinstsall.js'] },
  ...node,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      'no-case-declarations': 'off',
    },
  },
];
