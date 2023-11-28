import { createApp } from 'vue';
import router from './demo/router';
import './lib/assets/ui.scss';
import './demo/demo.scss';
import DemoApp from './demo/App.vue';

createApp(DemoApp).use(router).mount('#app')
