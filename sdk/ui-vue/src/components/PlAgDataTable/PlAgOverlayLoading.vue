<script setup lang="ts">
import { PlLoaderCircular } from '@milaboratories/uikit';

defineProps<{
  params: {
    notReady: Readonly<boolean>;
  };
}>();
</script>

<template>
  <div class="grid-overlay-container">
    <template v-if="params.notReady">
      <div class="grid-icon-cat-in-bag"/>
      <span class="text-subtitle-m">No datasource</span>
    </template>
    <PlLoaderCircular v-else size="48" />
  </div>
</template>

<style lang="css">
.grid-overlay-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-base-light)
}

.grid-icon-cat-in-bag {
  background-image: url(./assets/loading-cat.png);
  background-repeat: no-repeat;
}

.grid-overlay-container > div {
  height: 200px !important;
  width: 300px !important;
  mask-size: contain !important;
  mask-position: center !important;
  background-size: contain;
  background-position: center;
}
.grid-overlay-container > span {
  color: var(--txt-mask);
}
</style>
