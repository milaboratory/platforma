<script setup lang="ts">
import { useStore } from '../stores';

const store = useStore();
</script>

<template>
  <span>My age: {{ store.state.age }}</span>
</template>
