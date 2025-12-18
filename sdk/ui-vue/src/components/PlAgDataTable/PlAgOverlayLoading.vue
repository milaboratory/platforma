<script setup lang="ts">
import { PlPlaceholder } from '@milaboratories/uikit';
import type { PlPlaceholderProps } from '@milaboratories/uikit';
import { computed, ref } from 'vue';
import style from './pl-ag-overlay-loading.module.scss';
import type { PlAgOverlayLoadingParams } from './types';

// @TODO move this component from this folder

const props = defineProps<{
  /** Required object that contains props from loadingOverlayComponentParams. */
  params: PlAgOverlayLoadingParams;
}>();

const params = ref(props.params);

const placeholderTexts = computed<
  Pick<PlPlaceholderProps, 'title' | 'subtitle'>
>(() => {
  const loadingText = params.value.loadingText;
  if (!loadingText) {
    return {};
  }
  if (typeof loadingText === 'string') {
    return { title: loadingText };
  }
  return loadingText;
});

defineExpose({
  refresh: (newParams: PlAgOverlayLoadingParams) => {
    params.value = newParams;
  },
});
</script>

<template>
  <div :class="style.container">
    <div v-if="params.notReady" :class="style.notReadyWrapper">
      <div :class="style.iconCatInBag" />
      <h3 :class="style.text">{{ params.notReadyText || 'No datasource' }}</h3>
    </div>
    <PlPlaceholder v-else v-bind="placeholderTexts" variant="table" />
  </div>
</template>
