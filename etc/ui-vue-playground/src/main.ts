import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import '@platforma-sdk/ui-vue/styles';
import { router } from './router';

createApp(App).use(router).mount('#parent-app');
