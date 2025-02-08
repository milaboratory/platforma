import { ui } from '@platforma-sdk/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [...ui, {
  files: ['src/pages/DraftsPage.vue'],
  rules: {
    '@stylistic/quotes': 'off' // overriding example
  }
}];