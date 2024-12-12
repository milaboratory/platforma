<script setup lang="ts">
import { RouterView, RouterLink } from 'vue-router';
</script>

<template>
  <div style="display: flex; gap: 24px; padding: 24px;">
    <RouterLink to="/">Sum</RouterLink>
    <RouterLink to="/old-examples">Old</RouterLink>
  </div>
  <div style="overflow: auto; max-height: 100%;">
    <RouterView />
  </div>
</template>
