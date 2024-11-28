<script setup lang="ts">
import { PlAgDataTableToolsPanelId } from './PlAgDataTableToolsPanelId';
</script>

<template>
  <div :id="PlAgDataTableToolsPanelId" class="d-flex gap-6">
    <slot></slot>
  </div>
</template>
