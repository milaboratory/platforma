<script setup lang="ts">
import './pl-splash.scss';
import { PlLoaderCircular } from '@/components/PlLoaderCircular';

withDefaults(defineProps<{
  size?: '16' | '24' | '48' | string;
  text?: string;

}>(), { size: '48', text: 'Loading' });
</script>

<template>
  <div class="pl-splash">
    <PlLoaderCircular :size="size" />
    <h3 :class="$style.text">{{ text }}</h3>
  </div>
</template>

<style module>
.text {
  margin-top: 24px;
  color: var(--txt-mask);
}
</style>
