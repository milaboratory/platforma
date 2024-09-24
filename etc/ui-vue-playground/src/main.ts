import { createApp } from 'vue';
import './style.css';
import { BlockLayout } from '@milaboratories/ui-vue';
import '@milaboratories/ui-vue/styles';
import { sdkPlugin } from './app';

createApp(BlockLayout).use(sdkPlugin).mount('#app');
