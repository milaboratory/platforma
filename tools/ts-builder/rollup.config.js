import { createRollupNodeConfig } from '@milaboratories/build-configs';
import copy from 'rollup-plugin-copy';

const baseConfigs = createRollupNodeConfig({
  entry: ['./src/cli.ts'],
  formats: ['es']
});

const cliConfig = {
  ...baseConfigs[0],
  plugins: [
    ...baseConfigs[0].plugins,
    copy({
      targets: [
        { src: 'src/configs/*', dest: 'dist/configs' }
      ]
    })
  ],
  output: baseConfigs[0].output.filter(output => output).map(output => ({
    ...output,
    banner: '#!/usr/bin/env node',
  }))
};

export default [cliConfig];
