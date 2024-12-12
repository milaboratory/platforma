import { createRouter, createWebHistory } from 'vue-router';

import SumView from './blocks/sum/App.vue';
import OtherView from './blocks/old/App.vue';

const routes = [
  { path: '/', component: SumView },
  { path: '/old-examples', component: OtherView },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
