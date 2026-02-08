<script lang="ts" setup>
import BaseElement from "./BaseElement.vue";

const props = defineProps<{
  id: number;
  name: string;
}>();
</script>

<template>
  <BaseElement v-bind="props" type="primary" />
</template>
