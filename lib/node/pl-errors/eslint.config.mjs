import { common } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['**/dist', '**/*.test.ts'] },
  ...common,
  {
    rules: {
      // TODO: remove this rule after all usages of `any` are replaced with `unknown`
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
