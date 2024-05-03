import { createRouter, createWebHistory } from 'vue-router';

export const routes = [
  {
    name: 'Color slider',
    path: '/color-slider',
    component: () => import('@/demo/color-slider/index.vue'),
  },
  {
    name: 'Long text',
    path: '/long-text',
    component: () => import('@/demo/text-component/index.vue'),
  },
  {
    name: 'Dropdown list item',
    path: '/dropdownlistitem',
    component: () => import('@/demo/dropdown-list-item/index.vue'),
  },
  {
    name: 'Typography',
    path: '/typography',
    component: () => import('@/demo/typography/index.vue'),
  },
  {
    name: 'Line dropdown',
    path: '/line-dropdown',
    component: () => import('@/demo/line-dropdown/index.vue'),
  },
  {
    name: 'Form',
    path: '/',
    component: () => import('@/demo/form/index.vue'),
  },
  {
    name: 'Text Field',
    path: '/text-field',
    component: () => import('@/demo/text-field/index.vue'),
  },
  {
    name: 'Buttons',
    path: '/buttons',
    component: () => import('@/demo/buttons/index.vue'),
  },
  {
    name: 'Button Group',
    path: '/btn-group',
    component: () => import('@/demo/btn-group/index.vue'),
  },
  {
    name: 'Slider',
    path: '/slider',
    component: () => import('@/demo/slider/index.vue'),
  },
  {
    name: 'Chips',
    path: '/chips',
    component: () => import('@/demo/chips/index.vue'),
  },
  {
    name: 'Dropdown',
    path: '/dropdown',
    component: () => import('@/demo/dropdown/index.vue'),
  },
  {
    name: 'Multi Dropdown',
    path: '/multi-dropdown',
    component: () => import('@/demo/multi-dropdown/index.vue'),
  },
  {
    name: 'Checkbox',
    path: '/checkbox',
    component: () => import('@/demo/checkbox/index.vue'),
  },
  {
    name: 'Scroll',
    path: '/scroll',
    component: () => import('@/demo/scroll/index.vue'),
  },
  {
    name: 'useDraggable',
    path: '/draggable',
    component: () => import('@/demo/draggable/index.vue'),
  },
  {
    name: 'Tooltips',
    path: '/tooltips',
    component: () => import('@/demo/Tooltips/index.vue'),
  },
  {
    name: 'Grid Table',
    path: '/grid-table',
    component: () => import('@/demo/grid-table/index.vue'),
  },
  {
    name: 'Test',
    path: '/test',
    component: () => import('@/demo/test/index.vue'),
  },
  {
    name: 'Test2',
    path: '/test2',
    component: () => import('@/demo/test2/index.vue'),
  },
  {
    name: 'Context',
    path: '/context',
    component: () => import('@/demo/context/index.vue'),
  },
  {
    name: 'Switch Theme',
    path: '/switch-theme',
    component: () => import('@/demo/theme/index.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
