<script setup lang="ts">
import ComponentDescription from './ComponentDescription.vue';
</script>
<template>
  <div>
    <ComponentDescription
      v-if="$slots['description-header'] || $slots['description']"
      class="mb-10"
    >
      <template #header>
        <slot name="description-header" />
      </template>
      <slot name="description"></slot>
    </ComponentDescription>

    <slot />
  </div>
</template>
