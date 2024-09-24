<script lang="ts" setup>
import BaseElement from '@/test/BaseElement.vue';

const props = defineProps<{
  id: number;
  name: string;
}>();
</script>

<template>
  <BaseElement v-bind="props" type="primary" />
</template>
