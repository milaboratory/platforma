<script setup lang="ts">
import style from './pl-ag-overlay-loading.module.scss';
import { PlSplash } from '@milaboratories/uikit';
import type { PlAgOverlayLoadingParams } from './types';

// @TODO move this component from this folder

defineProps<{
  /**
   * Required object that contains props from loadingOverlayComponentParams.
   */
  params: PlAgOverlayLoadingParams;
}>();
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
