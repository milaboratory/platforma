<script setup lang="ts">
import { PlIcon16 } from "../PlIcon16";
import { PlTooltip } from "../PlTooltip";

/**
 * A column's name as every table and dropdown shows it. A column reached through a link to
 * another dataset gets a link icon in front, with `linkHint` on hover.
 */
defineProps<{
  label?: string;
  linkHint?: string;
}>();
</script>

<template>
  <span :class="$style.root" data-testid="pl-column-label">
    <PlTooltip v-if="linkHint" :class="$style.link" data-testid="pl-column-label-link">
      <template #tooltip>{{ linkHint }}</template>
      <PlIcon16 name="link" />
    </PlTooltip>
    <!-- For a label the caller renders itself, e.g. with search matches highlighted. -->
    <slot>{{ label }}</slot>
  </span>
</template>

<style module>
.root {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}

/* Lets a long label shrink, so it can truncate. */
.root > * {
  min-width: 0;
}

/* PlTooltip's inline-block wrapper would lift the icon above the text's centre. */
.root > .link {
  display: flex;
  flex-shrink: 0;
}
</style>
