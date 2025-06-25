import { createApp } from 'vue';
import { BlockLayout } from '@platforma-sdk/ui-vue';
import { sdkPlugin } from './app';

export function createBlock() {
  createApp(BlockLayout).use(sdkPlugin).mount('#block-app');
}
