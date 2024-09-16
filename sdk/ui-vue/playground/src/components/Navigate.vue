<script lang="ts" setup>
import { PlBtnGroup } from '@milaboratory/platforma-uikit';
import { useApp } from '../app';
import { computed } from 'vue';

const app = useApp();

const href = computed({
  get() {
    return app.navigationState.href;
  },
  set(href) {
    app.updateNavigationState((state) => {
      state.href = href;
    });
  },
});
</script>

<template>
  <PlBtnGroup
    v-model="href"
    :options="[
      {
        text: 'Main page',
        value: '/',
      },
      {
        text: 'Outputs basics',
        value: '/second',
      },
      {
        text: 'Form',
        value: '/form',
      },
      {
        text: 'ValueOrError',
        value: '/third',
      },
      {
        text: 'File Dialogs',
        value: '/file-dialogs',
      },
    ]"
  />
</template>
