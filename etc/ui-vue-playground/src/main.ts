import { createApp } from 'vue';
import './style.css';
import { BlockLayout } from '@platforma-sdk/ui-vue';
import '@platforma-sdk/ui-vue/styles';
import { sdkPlugin } from './app';

createApp(BlockLayout).use(sdkPlugin).mount('#app');
