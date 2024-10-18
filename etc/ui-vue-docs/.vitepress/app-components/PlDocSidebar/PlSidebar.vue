<script setup lang="ts">
import { DefaultTheme } from 'vitepress';
import PlSidebarGroup from './PlSidebarGroup.vue';
import PlSidebarItem from './PlSidebarItem.vue';

defineProps<{
  items: DefaultTheme.SidebarItem[];
}>();
</script>

<template>
  <div class="pl-sb">
    <div v-for="group in items" :key="group.text">
      <PlSidebarItem :item="group" root-group />
      <PlSidebarGroup v-if="group.items" :items="group.items" />
    </div>
  </div>
</template>

<style lang="scss">
.pl-sb {
  &__item {
    padding: 6px 12px !important;
    color: var(--txt-01) !important;
    font-family: Manrope !important;
    font-size: 14px !important;
    font-style: normal !important;
    font-weight: 500 !important;
    line-height: 20px !important;
    display: block;
    cursor: pointer;
    border-left: 1px solid rgba(255, 0, 0, 0);
  }
  &__item:hover {
    border-radius: 6px;
    background: var(--btn-sec-hover-white, rgba(255, 255, 255, 0.5));
    border-left: 1px solid rgba(255, 0, 0, 0);
  }
  &__group {
    padding-left: 12px;
    .pl-sb__group {
      border-left: 1px solid rgba(255, 255, 255, 0.5);
    }
  }
  &__link {
    border-left: 1px solid rgba(255, 255, 255, 0.5);
  }
  &__item.active {
    background-color: var(--bg-elevated-01);
    border-radius: 6px;
  }
}
</style>
