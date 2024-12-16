<script setup lang="ts">
import './pl-loader-circular.scss';

withDefaults(defineProps<{
  size?: '16' | '24' | '48' | string;
}>(), { size: '16' });
</script>
<template>
  <div class="pl-loader-circular">
    <div :style="{height: `${size}px`, width: `${size}px`, '--main-color': `${+size < 48 ? 'var(--ic-01)' :'var(--ic-02)' }`}" class="pl-circle-loader__wrapper">
      <svg class="pl-loader-circular__svg" viewBox="25 25 50 50">
        <circle class="pl-loader-circular__svg-circle" cx="50" cy="50" r="20" fill="none" :stroke="`${+size < 48 ? 'var(--ic-01)' :'var(--ic-02)' }`" stroke-width="2" />
      </svg>
    </div>
  </div>
</template>
