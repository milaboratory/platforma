<script lang="ts" setup>
import '@milaboratory/platforma-uikit/styles';
import '../assets/block.scss';
import { computed } from 'vue';
import { useSdkPlugin } from '../defineApp';
import NotFound from './NotFound.vue';
import LoaderPage from './LoaderPage.vue';

const sdk = useSdkPlugin();

const parsePathname = (href: `/${string}`) => {
  try {
    return new URL(href, 'http://dummy').pathname as `/${string}`;
  } catch (err) {
    console.error('Invalid href', href);
    return undefined;
  }
};

const href = computed(() => (sdk.loaded ? sdk.useApp().href : undefined));

const CurrentView = computed(() => {
  if (sdk.loaded) {
    const app = sdk.useApp();
    const pathname = parsePathname(app.navigationState.href);
    return pathname ? app.routes[pathname] : undefined;
  }

  return undefined;
});
</script>

<template>
  <div class="block block__layout">
    <div v-if="sdk.error">{{ sdk.error }}</div>
    <LoaderPage v-else-if="!sdk.loaded">Loading...</LoaderPage>
    <component :is="CurrentView" v-else-if="CurrentView" :key="href" />
    <NotFound v-else />
  </div>
</template>
