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
    <span class="pl-spash__text">{{ text }}</span>
  </div>
</template>
