import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['**/*.test.ts', '**/__tests__/**', 'test/**'] },
  ...node,
];


