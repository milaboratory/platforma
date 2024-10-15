<script setup lang="ts">
import AppSubheader from './AppSubheader.vue';
</script>
<template>
  <div class="component-description text-m">
    <AppSubheader>
      <slot name="header" />
    </AppSubheader>
    <slot />
  </div>
</template>

<style lang="scss">
.component-description {
  margin-top: 16px;

  code {
    padding: 2px 8px;
    background-color: var(--bg-elevated-02);
    border-radius: 6px;
  }
}
</style>
