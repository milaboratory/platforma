<script lang="ts" setup>
import { provide, toRef } from 'vue';

const model = defineModel<string>();

const props = defineProps<{
  /**
   * Allow multiple accordion sections to be opened at the same time
   */
  multiple?: boolean;
}>();

provide('pl-accordion-model', model);
provide('pl-accordion-props', toRef(props));
</script>

<template>
  <slot name="header" />
  <slot />
</template>
