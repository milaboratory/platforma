import { createApp } from 'vue';
import './style.css';
import { BlockLayout } from 'lib';
import 'lib/dist/style.css';
import { sdkPlugin } from './app';

createApp(BlockLayout).use(sdkPlugin).mount('#app');
