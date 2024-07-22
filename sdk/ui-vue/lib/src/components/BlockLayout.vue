<script lang="ts" setup>
import '@milaboratory/platforma-uikit/dist/style.css';
import '../assets/block.scss';
import { computed } from 'vue';
import { useBlockApp } from '../defineApp';
import NotFound from './NotFound.vue';
import LoaderPage from './LoaderPage.vue';

const sdk = useBlockApp();

const CurrentView = computed(() => {
  if (sdk.loaded) {
    const app = sdk.use();
    return app.routes[app.navigationState.href];
  }

  return undefined;
});
</script>

<template>
  <div class="block block__layout">
    <div v-if="sdk.error">{{ sdk.error }}</div>
    <LoaderPage v-else-if="!sdk.loaded">Loading...</LoaderPage>
    <component :is="CurrentView" v-else-if="CurrentView" />
    <NotFound v-else />
  </div>
</template>
