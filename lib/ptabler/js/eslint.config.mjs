import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['vitest.config.mjs'] },
  ...node,
];
