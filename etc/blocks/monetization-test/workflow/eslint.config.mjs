import { base } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['dist/**', 'index.js', 'index.d.ts'],
  },
  ...base,
];
