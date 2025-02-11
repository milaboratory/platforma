<script setup lang="ts">
import style from './pl-ag-overlay-loading.module.scss';
import { PlSplash } from '@milaboratories/uikit';

defineProps<{
  /**
   * Required object that contains props from loadingOverlayComponentParams.
   */
  params: {
    /**
     * Required flag, that shows catInBag icon with message if `true`, shows PlSplash component if `false`.
     */
    notReady: boolean;
    /**
     * Prop to override default "Loading" text
     */
    loadingText?: string;
    /**
     * Prop to override default "No datasource" text (So why props name is notReady? Good question)
     */
    notReadyText?: string;
    /**
     * @deprecated
     * Use notReadyText
     */
    message?: string;
    /**
     * Use "transparent" to make table headers visible below the loading layer
     */
    overlayType?: 'transparent';
  };
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
      <h3 :class="style.text">{{ params.notReadyText || params.message || 'No datasource' }}</h3>
    </div>
  </PlSplash>
</template>
