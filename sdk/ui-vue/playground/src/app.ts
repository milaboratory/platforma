import { defineApp } from 'lib';
import MainPage from './MainPage.vue';
import SecondPage from './SecondPage.vue';
import { platforma } from './testApi';

export const blockApp = defineApp(platforma, () => {
  return {
    routes: {
      '/': MainPage,
      '/second': SecondPage,
    },
  };
});
