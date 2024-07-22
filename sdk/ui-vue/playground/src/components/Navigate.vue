<script lang="ts" setup>
import { BtnGroup } from '@milaboratory/platforma-uikit';
import { blockApp } from '../app';
import { computed } from 'vue';

const app = blockApp.use();

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
  <btn-group
    v-model="href"
    :options="[
      {
        text: 'Main page',
        value: '/',
      },
      {
        text: 'Second Page',
        value: '/second',
      },
      {
        text: 'Third Page',
        value: '/third',
      },
    ]"
  />
</template>
