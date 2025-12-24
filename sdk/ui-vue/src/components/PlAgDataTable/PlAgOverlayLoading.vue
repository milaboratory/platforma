<script setup lang="ts">
import { PL_PLACEHOLDER_TEXTS, PlPlaceholder } from '@milaboratories/uikit';
import type { PlPlaceholderProps } from '@milaboratories/uikit';
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

function normalizePlaceholderText(
  text: string | Pick<PlPlaceholderProps, 'title' | 'subtitle'>,
): Pick<PlPlaceholderProps, 'title' | 'subtitle'> {
  if (typeof text === 'string') return { title: text };
  return text;
}
</script>

<template>
  <div :class="style.container">
    <div
      v-if="params.variant === 'data-not-ready'"
      :class="style.notReadyWrapper"
    >
      <div :class="style.iconCatInBag" />
      <h3 :class="style.text">
        {{ params.dataNotReadyText || 'No datasource' }}
      </h3>
    </div>
    <PlPlaceholder
      v-else
      variant="table"
      v-bind="normalizePlaceholderText(
        {
          'data-loading': params.dataLoadingText ?? PL_PLACEHOLDER_TEXTS.LOADING,
          'block-running': params.blockRunningText ?? PL_PLACEHOLDER_TEXTS.RUNNING,
        }[params.variant],
      )"
    />
  </div>
</template>
