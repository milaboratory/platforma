import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  './etc/blocks/*/*',
  './etc/ui-vue-playground',
  './etc/uikit-playground',
  './lib/model/*',
  './lib/node/*',
  './lib/ui/*',
  './sdk/*',
  './tests/*',
  './tools/*',
]);
