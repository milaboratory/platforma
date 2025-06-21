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
  color?: string | string[];
  stroke?: string | string[];
}>();

const uri = computedAsync(async () => {
  if (typeof props.uri === 'string') return Promise.resolve(props.uri);
  if (typeof props.name === 'string') return import(`../../assets/icons/icon-assets-min/${props.name}.svg?raw`).then((m) => m.default);
  return undefined;
});
const svgMeta = computed(() => (uri.value == null ? undefined : registerSvg(uri.value, props.name)));
const styleSize = computed(() =>
  svgMeta.value == null
    ? undefined
    : `--svg-width: ${getSize(props.width, svgMeta.value.defaultWidth)}; --svg-height: ${getSize(props.height, svgMeta.value.defaultHeight)};`,
);
const styleColor = computed(() => getStyleColor('fill', props.color));
const styleStroke = computed(() => getStyleColor('stroke', props.stroke));

function getSize(propSize: undefined | number | string, svgSize: number): string {
  if (propSize != null) return typeof propSize === 'string' ? propSize : `${propSize}px`;
  return `${svgSize}px`;
}

function getStyleColor(prop: 'fill' | 'stroke', color: undefined | string | string[]): undefined | string {
  if (Array.isArray(color)) {
    return color.reduce((acc, color, i) => acc + `--svg-${prop}-${i}: ${color};`, '');
  }

  if (typeof color === 'string' && color.length > 0) {
    return `--svg-${prop}-0: ${color};`;
  }

  return undefined;
}
</script>

<template>
  <svg v-if="svgMeta" :style="[styleSize, styleColor, styleStroke]" :class="$style.svg">
    <use :href="`#${svgMeta.spriteId}`" />
  </svg>
</template>

<style module>
.svg {
  --svg-width: unset;
  --svg-height: unset;
  --svg-fill-0: unset; /* can be in any quantity, depends on the icon (--svg-fill-X) */
  --svg-fill-1: unset; /* can be in any quantity, depends on the icon (--svg-fill-X) */
  --svg-fill-2: unset; /* can be in any quantity, depends on the icon (--svg-fill-X) */
  --svg-stroke-0: unset; /* can be in any quantity, depends on the icon (--svg-stroke-X) */

  width: var(--svg-width);
  height: var(--svg-height);
}
</style>
