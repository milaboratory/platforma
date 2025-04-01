import { base } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['**/dist', '**/*.test.ts'] },
  ...base,
  {
    rules: {
      // TODO: remove this rule after all usages of `any` are replaced with `unknown`
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
