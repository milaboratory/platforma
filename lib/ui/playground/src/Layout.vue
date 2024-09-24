<script lang="ts" setup>
import Sidebar from '@/Sidebar/index.vue';

defineProps<{
  mainClass?: string;
}>();
</script>

<template>
  <header>
    <slot name="header" />
  </header>
  <div class="layout">
    <Sidebar v-once />
    <main>
      <slot />
    </main>
  </div>
</template>
