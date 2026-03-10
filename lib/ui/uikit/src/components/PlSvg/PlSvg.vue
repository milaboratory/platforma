<script lang="ts" setup>
import { computed } from "vue";
import { computedAsync } from "@vueuse/core";
import { registerSvg } from "./registry.ts";
import type { MaskIconName16, MaskIconName24 } from "../../types";

const props = defineProps<{
  uri?: string;
  name?: `16_${MaskIconName16}` | `24_${MaskIconName24}`;
  width?: number | string;
  height?: number | string;
  color?: string | string[];
  stroke?: string | string[];
}>();

const uri = computedAsync(async () => {
  if (typeof props.uri === "string") return Promise.resolve(props.uri);
  if (typeof props.name === "string")
    return import(`../../assets/icons/icon-assets-min/${props.name}.svg?raw`).then(
      (m) => m.default,
    );
  return undefined;
});

const svgMeta = computed(() =>
  uri.value == null ? undefined : registerSvg(uri.value, props.name),
);

const toPx = (value: undefined | number | string) => {
  if (typeof value === "number") return `${value}px`;
  if (typeof value === "string") return value;
  return;
};

const styleSize = computed(() => ({
  "--svg-width": toPx(props.width ?? svgMeta.value?.defaultWidth),
  "--svg-height": toPx(props.height ?? svgMeta.value?.defaultHeight),
}));

const styleColor = computed(() => getStyleColor("fill", props.color));
const styleStroke = computed(() => getStyleColor("stroke", props.stroke));

function getStyleColor(
  prop: "fill" | "stroke",
  color: undefined | string | string[],
): undefined | string {
  if (Array.isArray(color)) {
    return color.reduce((acc, color, i) => acc + `--svg-${prop}-${i}: ${color};`, "");
  }

  if (typeof color === "string" && color.length > 0) {
    return `--svg-${prop}-0: ${color};`;
  }

  return undefined;
}
</script>

<template>
  <svg :style="[styleSize, styleColor, styleStroke]" :class="$style.svg">
    <use :href="`#${svgMeta?.spriteId}`" />
  </svg>
</template>

<style module>
.svg {
  --svg-width: unset;
  --svg-height: unset;
  --svg-fill-0: unset; /* can be in any quantity, depends on the icon (--svg-fill-X) */
  --svg-fill-1: unset; /* can be in any quantity, depends on the icon (--svg-fill-X) */
  --svg-fill-2: unset; /* can be in any quantity, depends on the icon (--svg-fill-X) */
  --svg-fill-3: unset; /* can be in any quantity, depends on the icon (--svg-fill-X) */
  --svg-fill-4: unset; /* can be in any quantity, depends on the icon (--svg-fill-X) */
  --svg-fill-5: unset; /* can be in any quantity, depends on the icon (--svg-fill-X) */
  --svg-fill-6: unset; /* can be in any quantity, depends on the icon (--svg-fill-X) */
  --svg-stroke-0: unset; /* can be in any quantity, depends on the icon (--svg-stroke-X) */

  width: var(--svg-width);
  height: var(--svg-height);
}
</style>
