import { model } from '@platforma-sdk/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['*.d.ts', 'vite.config.mts', '**/dist'] },
  ...model,
];
