<script setup lang="ts">
import type { DefaultTheme } from 'vitepress';
import PlSidebarItem from './PlSidebarItem.vue';

defineProps<{
  items: DefaultTheme.SidebarItem[];
}>();
</script>
<template>
  <ul class="pl-sb__group">
    <template v-for="item in items" :key="item.text">
      <li>
        <PlSidebarItem :item="item" />
        <PlSidebarGroup v-if="item.items" :items="item.items" />
      </li>
    </template>
  </ul>
</template>
