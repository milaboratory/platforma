import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...node,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.ts'],
        },
      },
    },
    rules: {
      'n/no-unsupported-features/node-builtins': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
];
