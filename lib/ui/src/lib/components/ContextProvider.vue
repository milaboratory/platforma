<script lang="ts" setup>
import {computed, provide} from 'vue';

const props = defineProps<{
  context: object
  contextKey: Symbol
}>();

provide<unknown>(props.contextKey, computed(() => props.context));
</script>

<template>
  <slot/>
</template>
