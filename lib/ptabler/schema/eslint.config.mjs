import { model } from '@platforma-sdk/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['**/dist', '**/*.test.ts'] },
  ...model
];
