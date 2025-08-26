import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts()],
  build: {
    lib: {
      formats: ['es'],
      entry: {
        kalign: 'src/kalign.ts',
        rapidnj: 'src/rapidnj.ts',
      },
    },
  },
});
