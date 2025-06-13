<script lang="ts" setup>
import { computed } from 'vue';
import { registerSvg } from './registry.ts';

const props = defineProps<{
  uri: string;
  size?: string;
  color?: string;
}>();
const refId = computed(() => registerSvg(props.uri));

const styleSize = computed(() => (props.size ? `width: ${props.size}; height: ${props.size};` : ''));
const styleColor = computed(() => (props.color ? `fill: ${props.color}` : ''));
</script>

<template>
  <svg :style="[styleSize, styleColor]" :class="$style.icon" >
    <use :href="`#${refId}`" />
  </svg>
</template>

<style module>
  .icon {
    width: 16px;
    height: 16px;
    fill: black;
  }
</style>
