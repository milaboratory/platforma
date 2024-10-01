import { createApp } from 'vue';
import { BlockLayout } from '@platforma-sdk/ui-vue';
import '@platforma-sdk/ui-vue/styles';
import { sdkPlugin } from './app';

export function createBlock() {
  createApp(BlockLayout).use(sdkPlugin).mount('#block-app');
}
