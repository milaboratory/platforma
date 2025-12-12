import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['*.d.ts', 'vite.config.mts', '**/dist', '**/*.config.ts'] },
  ...node,
];

