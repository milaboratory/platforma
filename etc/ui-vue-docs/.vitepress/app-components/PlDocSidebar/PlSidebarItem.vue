<script setup lang="ts">
import { DefaultTheme } from 'vitepress';
import { computed } from 'vue';
import { useActiveLink } from './useActiveLink';

const props = defineProps<{
  item: DefaultTheme.SidebarItem;
  rootGroup?: boolean;
}>();
const activePat = useActiveLink();
const active = computed(() => {
  return props.item.link && props.item.link === `${activePat.value}`;
});
</script>
<template>
  <a
    v-if="item.link"
    :href="item.link"
    :class="{ 'pl-sb__link': !rootGroup, active: active }"
    class="pl-sb__item"
  >
    {{ item.text }}
  </a>
  <span
    v-else
    :class="!rootGroup ? 'pl-sb__link' : undefined"
    class="pl-sb__item"
  >
    {{ item.text }}
  </span>
</template>
