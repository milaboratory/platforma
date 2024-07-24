<script lang="ts" setup>
import '@milaboratory/platforma-uikit/styles';
import '../assets/block.scss';
import { computed } from 'vue';
import { useSdkPlugin } from '../defineApp';
import NotFound from './NotFound.vue';
import LoaderPage from './LoaderPage.vue';

const sdk = useSdkPlugin();

const CurrentView = computed(() => {
  if (sdk.loaded) {
    const app = sdk.useApp();
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
