import { defineApp } from 'lib';
import MainPage from './MainPage.vue';
import SecondPage from './SecondPage.vue';
import { platforma } from './testApi';

export const sdkPlugin = defineApp(platforma, () => {
  return {
    routes: {
      '/': MainPage,
      '/second': SecondPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
