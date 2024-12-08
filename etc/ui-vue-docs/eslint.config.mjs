import { vue } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['.vitepress/cache/*'],
  },
  ...vue];