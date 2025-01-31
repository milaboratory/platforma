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
    notReady: Readonly<boolean>;
    /**
     * Optional prop that provide custom text message under catInBag icon.
     */
    message?: Readonly<string>;
  };
}>();
</script>

<template>
  <div :class="style.container">
    <div v-if="params.notReady" :class="style.wrapper">
      <div :class="style.iconCatInBag" />
      <h3 :class="style.text">{{ params.message || 'No datasource' }}</h3>
    </div>
    <PlSplash v-else size="48" text="Loading" />
  </div>
</template>
