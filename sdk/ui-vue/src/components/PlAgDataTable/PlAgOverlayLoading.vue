<script setup lang="ts">
defineProps<{
  params: {
    notReady: Readonly<boolean>;
  };
}>();
</script>

<template>
  <div class="grid-overlay-container">
    <template v-if="params.notReady">
      <div class="grid-icon-cat-in-bag"></div>
      <span class="text-subtitle-m">No datasource</span>
    </template>
    <template v-else>
      <div class="mask-24 mask-loading grid-mask-loading"></div>
      <span class="text-subtitle-m">Loading</span>
    </template>
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
}
.grid-icon-cat-in-bag {
  background-image: url(./assets/loading-cat.png);
  background-repeat: no-repeat;
}
.grid-mask-loading {
  background-color: var(--txt-mask);
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
