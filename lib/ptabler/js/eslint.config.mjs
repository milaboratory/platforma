import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['tests/**/*', 'vitest.config.mjs'] },
  ...node,
];
