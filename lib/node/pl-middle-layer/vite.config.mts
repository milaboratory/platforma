import { PlViteStdNode } from '@milaboratories/platforma-build-configs/vite';
import { resolve } from 'node:path';

export default PlViteStdNode({
  build: {
    lib: {
      entry: {
        index: resolve('src', 'index.ts'),
        worker: resolve('src', 'worker/worker.ts'),
      },
      formats: ['es', 'cjs']
    },
    sourcemap: true,
  },
});
