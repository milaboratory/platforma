<script setup lang="ts">
import StoreChild from './StoreChild.vue';
import { useStore } from '../stores';
import { onUnmounted } from 'vue';

const store = useStore();

onUnmounted(() => {
  console.log('unmounted in component');
});
</script>

<template>
  <h1>Store test</h1>

  <div class="card">
    <button type="button" @click="store.state.age++">Click to increase age</button>
    <StoreChild />
    <StoreChild />
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
