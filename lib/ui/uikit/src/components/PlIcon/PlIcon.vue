<script lang="ts" setup>
import { computed } from 'vue';
import { computedAsync } from '@vueuse/core';
import { registerSvg } from './registry.ts';
import type { MaskIconName16, MaskIconName24 } from '../../types';

const props = defineProps<{
  uri?: string;
  name?: `16_${MaskIconName16}` | `24_${MaskIconName24}`;
  width?: number | string;
  height?: number | string;
  color?: string;
  colors?: string[];
  stroke?: string;
  strokes?: string[];
}>();

const uri = computedAsync(async () => {
  if (typeof props.uri === 'string') return Promise.resolve(props.uri);
  if (typeof props.name === 'string') return import(`../../assets/icons/icon-assets-min/${props.name}.svg?raw`).then((m) => m.default);
  return undefined;
});
const svgMeta = computed(() => (uri.value == null ? undefined : registerSvg(uri.value)));
const styleSize = computed(() =>
  svgMeta.value == null
    ? undefined
    : `--svg-width: ${getSize(props.width, svgMeta.value.defaultWidth)}; --svg-height: ${getSize(props.width, svgMeta.value.defaultWidth)};`,
);
const styleColor = computed(() => getStyleColor('fill', props.colors, props.color));
const styleStroke = computed(() => getStyleColor('stroke', props.strokes, props.stroke));

function getSize(propSize: undefined | number | string, svgSize: number): string {
  if (propSize != null) return typeof propSize === 'string' ? propSize : `${propSize}px`;
  return `${svgSize}px`;
}

function getStyleColor(prop: 'fill' | 'stroke', colors: undefined | string[], color: undefined | string): undefined | string {
  if (Array.isArray(colors)) {
    return colors.reduce((acc, color, i) => acc + `--${prop}-${i}: ${color};`, '');
  }

  if (typeof color === 'string' && color.length > 0) {
    return `--${prop}-0: ${color};`;
  }

  return undefined;
}
</script>

<template>
  <svg v-if="svgMeta" :style="[styleSize, styleColor, styleStroke]" :class="$style.icon">
    <use :href="`#${svgMeta.spriteId}`" />
  </svg>
</template>

<style module>
:root {
  --svg-width: unset;
  --svg-height: unset;
}

.icon {
  width: var(--svg-width);
  height: var(--svg-height);
  fill: black;
}
</style>
