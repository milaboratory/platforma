<script lang="ts" setup>
import BaseElement from '@/demo/test/BaseElement.vue';

const props = defineProps<{
  id: number;
  name: string;
}>();
</script>

<template>
  <base-element v-bind="props" type="primary"/>
</template>
