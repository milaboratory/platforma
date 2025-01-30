<script setup lang="ts">
import './pl-splash.module.scss';
import { PlLoaderCircular } from '@/components/PlLoaderCircular';

withDefaults(defineProps<{
  size?: '16' | '24' | '48' | string;
  text?: string;

}>(), { size: '48', text: 'Loading' });
</script>

<template>
  <PlLoaderCircular :size="size" />
  <h3 :class="$style.text">{{ text }}</h3>
</template>
