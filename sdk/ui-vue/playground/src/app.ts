import { defineApp } from 'lib';
import MainPage from './MainPage.vue';
import SecondPage from './SecondPage.vue';
import ThirdPage from './ThirdPage.vue';
import { platforma } from './testApi';
import type { Platforma, ValueOrErrors } from '@milaboratory/sdk-ui';
import FileDialogsPage from './FileDialogsPage.vue';
import FormPage from './FormPage.vue';

type Outputs = {
  x: ValueOrErrors<number>;
  y: ValueOrErrors<number>;
};

export const sdkPlugin = defineApp<unknown, Outputs>(platforma as Platforma<unknown, Outputs>, () => {
  return {
    routes: {
      '/': MainPage,
      '/second': SecondPage,
      '/form': FormPage,
      '/third': ThirdPage,
      '/file-dialogs': FileDialogsPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;

// const app = useApp;
