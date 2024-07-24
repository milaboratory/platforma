<script lang="ts" setup>
import { BtnSecondary } from '@milaboratory/platforma-uikit';
import { useSdkPlugin } from '../defineApp';

const sdk = useSdkPlugin();

const app = sdk.useApp();

const goToMain = () => {
  app.updateNavigationState((state) => {
    state.href = '/';
  });
};
</script>

<template>
  <div class="block__not-found">
    <h1>Not found route: {{ app.navigationState.href }}</h1>
    <BtnSecondary @click.stop="goToMain">Return to main page</BtnSecondary>
  </div>
</template>
