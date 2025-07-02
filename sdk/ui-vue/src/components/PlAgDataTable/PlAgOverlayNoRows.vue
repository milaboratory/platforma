<script lang="ts" setup>
import { ref } from 'vue';
import type { PlAgOverlayNoRowsParams } from './types';

const props = defineProps<{
  params: PlAgOverlayNoRowsParams;
}>();

const params = ref(props.params);

defineExpose({
  refresh: (newParams: PlAgOverlayNoRowsParams) => {
    params.value = newParams;
  },
});
</script>

<template>
  <div class="grid-overlay-container">
    <div class="grid-icon-sad-cat" />
    <span class="text-subtitle-m">{{ params.text || 'Empty' }}</span>
  </div>
</template>

<style lang="css">
.grid-overlay-container {
  height: calc(100% - 1px);
  margin-top: 1px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-base-light);
}
.grid-icon-sad-cat {
  background-image: url(./assets/no-data-cat.png);
  background-repeat: no-repeat;
}
.grid-overlay-container > div {
  height: 300px;
  width: 300px;
  background-size: contain;
  background-position: center;
}
.grid-overlay-container > span {
  color: var(--txt-mask);
}
</style>
