import { createVitestVueConfig } from '@milaboratories/build-configs';
import { defineProject } from 'vitest/config';

export default defineProject(createVitestVueConfig({
  test: {
    includeSource: ['src/**/*.{js,ts}'],
  },
}));
