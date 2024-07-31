import { createRouter, createWebHistory } from 'vue-router';

export const routes = [
  {
    name: 'Data Table',
    path: '/',
    component: () => import('@/data-table/index.vue'),
  },
  {
    name: 'Data Table Simple',
    path: '/data-table-simple',
    component: () => import('@/data-table-simple/index.vue'),
  },
  {
    name: 'Data Table Raw',
    path: '/data-table-raw',
    component: () => import('@/data-table-raw/index.vue'),
  },
  {
    name: 'Data Table Async',
    path: '/data-table-async',
    component: () => import('@/data-table-async/index.vue'),
  },
  {
    name: 'Number field',
    path: '/number-input',
    component: () => import('@/number-input/index.vue'),
  },
  {
    name: 'Form',
    path: '/form',
    component: () => import('@/form/index.vue'),
  },
  {
    name: 'Mixcr',
    path: '/mixcr',
    component: () => import('@/mixcr/index.vue'),
  },
  {
    name: 'Layout',
    path: '/layout',
    component: () => import('@/layout/index.vue'),
  },
  {
    name: 'Add graph',
    path: '/add-graph',
    component: () => import('@/graph/add-graph/index.vue'),
  },
  {
    name: 'Long text',
    path: '/long-text',
    component: () => import('@/text-component/index.vue'),
  },
  {
    name: 'Dropdown list item',
    path: '/dropdownlistitem',
    component: () => import('@/dropdown-list-item/index.vue'),
  },
  {
    name: 'Typography',
    path: '/typography',
    component: () => import('@/typography/index.vue'),
  },
  {
    name: 'Line dropdown',
    path: '/line-dropdown',
    component: () => import('@/line-dropdown/index.vue'),
  },
  {
    name: 'Text Field',
    path: '/text-field',
    component: () => import('@/text-field/index.vue'),
  },
  {
    name: 'Buttons',
    path: '/buttons',
    component: () => import('@/buttons/index.vue'),
  },
  {
    name: 'Button Group',
    path: '/btn-group',
    component: () => import('@/btn-group/index.vue'),
  },
  {
    name: 'Slider',
    path: '/slider',
    component: () => import('@/slider/index.vue'),
  },
  {
    name: 'Chips',
    path: '/chips',
    component: () => import('@/chips/index.vue'),
  },
  {
    name: 'Dropdown',
    path: '/dropdown',
    component: () => import('@/dropdown/index.vue'),
  },
  {
    name: 'Multi Dropdown',
    path: '/multi-dropdown',
    component: () => import('@/multi-dropdown/index.vue'),
  },
  {
    name: 'Checkbox',
    path: '/checkbox',
    component: () => import('@/checkbox/index.vue'),
  },
  {
    name: 'Scroll',
    path: '/scroll',
    component: () => import('@/scroll/index.vue'),
  },
  {
    name: 'useDraggable',
    path: '/draggable',
    component: () => import('@/draggable/index.vue'),
  },
  {
    name: 'Tooltips',
    path: '/tooltips',
    component: () => import('@/Tooltips/index.vue'),
  },
  {
    name: 'Grid Table',
    path: '/grid-table',
    component: () => import('@/grid-table/index.vue'),
  },
  {
    name: 'Use Sortable',
    path: '/use-sortable',
    component: () => import('@/useSortable/index.vue'),
  },
  {
    name: 'Test',
    path: '/test',
    component: () => import('@/test/index.vue'),
  },
  {
    name: 'Test2',
    path: '/test2',
    component: () => import('@/test2/index.vue'),
  },
  {
    name: 'Context',
    path: '/context',
    component: () => import('@/context/index.vue'),
  },
  {
    name: 'Switch Theme',
    path: '/switch-theme',
    component: () => import('@/theme/index.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
