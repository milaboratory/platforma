<script lang="ts" setup>
const props = defineProps<{
  type: 'primary' | 'secondary';
  id: number;
  name: string;
}>();
</script>

<template>
  <div>My props: {{ props }}</div>
</template>
