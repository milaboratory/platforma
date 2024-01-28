<script lang="ts" setup>
import { type InjectionKey, computed, provide } from 'vue';

const props = defineProps<{
  context: object;
  contextKey: InjectionKey<unknown>;
}>();

provide<unknown>(
  props.contextKey,
  computed(() => props.context),
);
</script>

<template>
  <slot />
</template>
