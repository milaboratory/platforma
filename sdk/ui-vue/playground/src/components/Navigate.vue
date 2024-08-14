<script lang="ts" setup>
import { BtnGroup } from '@milaboratory/platforma-uikit';
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
  <btn-group
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
        text: 'ValueOrError',
        value: '/third',
      },
    ]"
  />
</template>
