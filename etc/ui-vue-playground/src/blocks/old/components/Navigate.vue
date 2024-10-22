<script lang="ts" setup>
import { PlBtnGroup } from '@milaboratories/uikit';
import { useApp } from '../app';
import { computed } from 'vue';

const app = useApp();

const href = computed({
  get() {
    return app.snapshot.navigationState.href;
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
        value: '/outputs-basics',
      },
      {
        text: 'Form',
        value: '/form',
      },
      {
        text: 'ValueOrError',
        value: '/value-or-error-page',
      },
      {
        text: 'File Dialogs',
        value: '/file-dialogs',
      },
    ]"
  />
</template>
