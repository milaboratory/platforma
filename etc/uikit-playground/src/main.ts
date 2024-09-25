import { createApp } from 'vue';
import router from './router';
import '@milaboratories/uikit/dist/style.css';
import './demo.scss';
import DemoApp from '@/App.vue';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore @TODO (after vue update)
createApp(DemoApp).use(router).mount('#app');
