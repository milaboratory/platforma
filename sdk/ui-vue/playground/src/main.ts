import { createApp } from 'vue';
import './style.css';
import { BlockLayout } from 'lib';
import { blockApp } from './app';
import 'lib/dist/style.css';

createApp(BlockLayout).use(blockApp).mount('#app');
