import { base } from '@milaboratories/eslint-config';

export default [{
  ignores: ['dist/*', 'eslint.config.mjs', 'vite.config.mts'],
}, ...base];
