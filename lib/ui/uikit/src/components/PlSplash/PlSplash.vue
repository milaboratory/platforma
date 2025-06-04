<script setup lang="ts">
import style from './pl-splash.module.scss';
import { PlLoaderCircular } from '../../components/PlLoaderCircular';

withDefaults(defineProps<{
  /**
   * Optional string that sets text that will be shown below the PlLoaderCircular.
   */
  loadingText?: string;
  /**
   * If `true` the loading overlay is shown.
   */
  loading?: boolean;
  /**
   * @TODO
   */
  type?: 'table' | 'transparent';
}>(), { loadingText: undefined, loading: false, type: undefined });
</script>

<template>
  <div :class="[style.splash, {[style.table]: type === 'table', [style.transparent]: type === 'transparent'}]">
    <div v-if="loading" :class="[style.overlay]">
      <div>
        <!-- @TODO refactor PlLoaderCircular size property -->
        <PlLoaderCircular size="48" />
        <div v-if="loadingText" :class="style.text">{{ loadingText }}</div>
      </div>
    </div>
    <slot />
  </div>
</template>
