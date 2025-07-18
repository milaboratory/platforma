import { PlViteStdNode } from '@milaboratories/build-configs/vite';
import { resolve } from 'node:path';

export default PlViteStdNode({
  build: {
    lib: {
      entry: {
        index: resolve('src', 'index.ts'),
        worker: resolve('src', 'worker/worker.ts'),
      },
    },
  },
  define: {
    WORKER_PATH: JSON.stringify(resolve(__dirname, 'dist/worker.js')),
  },
});
