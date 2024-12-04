import { createApp } from 'vue';
import { sdkPlugin } from './app';
import '@platforma-sdk/ui-vue/styles';
import { BlockLayout } from '@platforma-sdk/ui-vue';

createApp(BlockLayout).use(sdkPlugin).mount('#app');
