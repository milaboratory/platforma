import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['src/proto-grpc/*', 'src/proto-rest/*', 'src/drivers/*', 'src/**/*.test.ts'] },
  ...node,
];
