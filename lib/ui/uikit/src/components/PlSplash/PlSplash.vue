<script setup lang="ts">
import style from "./pl-splash.module.scss";
import { PlLoaderCircular } from "../PlLoaderCircular";

withDefaults(
  defineProps<{
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
    type?: "table" | "transparent";
  }>(),
  { loadingText: undefined, loading: false, type: undefined },
);
</script>

<template>
  <div
    data-testid="pl-splash"
    :class="[
      style.splash,
      { [style.table]: type === 'table', [style.transparent]: type === 'transparent' },
    ]"
  >
    <div v-if="loading" data-testid="pl-splash-overlay" :class="[style.overlay]">
      <div>
        <!-- @TODO refactor PlLoaderCircular size property -->
        <PlLoaderCircular data-testid="pl-splash-loader" size="48" />
        <div v-if="loadingText" data-testid="pl-splash-text" :class="style.text">
          {{ loadingText }}
        </div>
      </div>
    </div>
    <slot />
  </div>
</template>
