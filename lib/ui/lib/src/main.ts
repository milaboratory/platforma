import { createApp } from 'vue';
import router from './demo/router';
import './lib/assets/ui.scss';
import './demo/demo.scss';
import DemoApp from '@/demo/App.vue';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore @TODO (after vue update)
createApp(DemoApp).use(router).mount('#app');
