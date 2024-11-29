<script lang="ts" setup>
import { onMounted, unref, ref, reactive } from 'vue';
import { PlTooltip } from '../PlTooltip';
import type { TabOption } from './types';

const rootRef = ref<{ $el: HTMLElement }>();

defineProps<{
  option: TabOption;
}>();

const data = reactive({
  isOverflown: false,
});

onMounted(() => {
  const root = unref(rootRef);

  if (!root) {
    return;
  }

  const el = root.$el.querySelector('span') as HTMLElement | null;

  if (!el) {
    return;
  }

  requestAnimationFrame(() => {
    if (el.offsetWidth < el.scrollWidth) {
      data.isOverflown = true;
    }
  });
});
</script>

<template>
  <PlTooltip
    ref="rootRef"
    element="div"
    position="top"
    :hide="!data.isOverflown"
    :close-delay="300"
    :data-is-overflown="data.isOverflown ? 'true' : 'false'"
  >
    <slot />
    <template #tooltip>
      {{ option.label }}
    </template>
  </PlTooltip>
</template>
