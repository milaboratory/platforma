import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['src/proto/*', 'src/drivers/*', 'src/**/*.test.ts'] },
  ...node,
];
