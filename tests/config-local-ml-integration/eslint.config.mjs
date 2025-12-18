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
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
];
