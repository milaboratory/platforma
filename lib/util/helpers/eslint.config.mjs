import { node } from '@milaboratories/eslint-config';

export default [{
  ignores: ['dist/*', 'eslint.config.mjs', 'vite.config.mts'],
}, ...node];
