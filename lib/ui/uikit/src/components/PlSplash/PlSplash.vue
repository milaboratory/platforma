<script setup lang="ts">
import style from './pl-splash.module.scss';
import { PlLoaderCircular } from '@/components/PlLoaderCircular';

withDefaults(defineProps<{
  /**
   * Optional string that sets size for PlLoaderCircular.
   */
  size?: '16' | '24' | '48' | string;
  /**
   * Optional string that sets text that will be shown below the PlLoaderCircular.
   */
  text?: string;

}>(), { size: '48', text: 'Loading' });
</script>

<template>
  <div :class="style.container">
    <PlLoaderCircular :size="size" />
    <h3 :class="style.text">{{ text }}</h3>
  </div>
</template>
