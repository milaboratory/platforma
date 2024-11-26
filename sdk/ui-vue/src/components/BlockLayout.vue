<script lang="ts" setup>
import '@milaboratories/uikit/styles';
import '../assets/block.scss';
import { computed } from 'vue';
import { useSdkPlugin } from '../defineApp';
import NotFound from './NotFound.vue';
import LoaderPage from './LoaderPage.vue';
import { PlAppErrorNotificationAlert } from './PlAppErrorNotificationAlert';
import BlockLoader from './BlockLoader.vue';

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
    const pathname = parsePathname(app.snapshot.navigationState.href);
    return pathname ? app.getRoute(pathname) : undefined;
  }

  return undefined;
});

const app = computed(() => (sdk.loaded ? sdk.useApp() : undefined));

const errors = computed(() => (app.value ? app.value.model.outputErrors : {}));

const showErrorsNotification = computed(() => app.value?.showErrorsNotification ?? true);

const progress = computed(() => app.value?.progress?.());
</script>

<template>
  <div class="block block__layout">
    <BlockLoader :value="progress" />
    <div v-if="sdk.error">{{ sdk.error }}</div>
    <LoaderPage v-else-if="!sdk.loaded">Loading...</LoaderPage>
    <component :is="CurrentView" v-else-if="CurrentView" :key="href" />
    <NotFound v-else />
    <PlAppErrorNotificationAlert v-if="sdk.loaded && showErrorsNotification" :errors="errors" />
  </div>
</template>
