<script lang="ts" setup>
import { PlBtnSecondary } from '@milaboratories/uikit';
import { useSdkPlugin } from '../defineApp';

const sdk = useSdkPlugin();

const app = sdk.useApp();

const goToMain = () => {
  app.navigateTo('/');
};
</script>

<template>
  <div class="block__not-found">
    <h1>Not found route: {{ app.snapshot.navigationState.href }}</h1>
    <PlBtnSecondary @click.stop="goToMain">Return to main page</PlBtnSecondary>
  </div>
</template>
