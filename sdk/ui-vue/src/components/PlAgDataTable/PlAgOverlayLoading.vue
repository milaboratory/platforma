<script setup lang="ts">
import { PlSplash } from '@milaboratories/uikit';
import { ref } from 'vue';
import style from './pl-ag-overlay-loading.module.scss';
import type { PlAgOverlayLoadingParams } from './types';

// @TODO move this component from this folder

const props = defineProps<{
  /** Required object that contains props from loadingOverlayComponentParams. */
  params: PlAgOverlayLoadingParams;
}>();

const params = ref(props.params);

defineExpose({
  refresh: (newParams: PlAgOverlayLoadingParams) => {
    params.value = newParams;
  },
});
</script>

<template>
  <PlSplash
    :loading="!params.notReady"
    :type="params.overlayType ?? 'table'"
    :loading-text="params.loadingText ?? 'Loading'"
    :class="style.container"
  >
    <div v-if="params.notReady" :class="style.notReadyWrapper">
      <div :class="style.iconCatInBag" />
      <h3 :class="style.text">{{ params.notReadyText || 'No datasource' }}</h3>
    </div>
  </PlSplash>
</template>
