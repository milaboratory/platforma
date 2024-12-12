<script lang="ts">
/** Root block page component */
export default {
  name: 'PlBlockPage',
};
</script>

<script lang="ts" setup>
import { useSlots } from 'vue';
import './pl-block-page.scss';

const slots = useSlots();

defineProps<{
  noBodyGutters?: boolean;
}>();

const setTitleIfNeeded = (el: HTMLElement) => {
  el.removeAttribute('title');
  if (el.clientWidth < el.scrollWidth) {
    el.setAttribute('title', el.innerText);
  }
};

const vTextOverflownTitle = {
  mounted: setTitleIfNeeded,
  updated: setTitleIfNeeded,
};
</script>

<template>
  <div class="pl-layout-component pl-block-page" :class="{ noBodyGutters }">
    <div v-if="slots.title" class="pl-block-page__title">
      <div class="pl-block-page__title__default">
        <span v-text-overflown-title><slot name="title" /></span>
        <slot name="after-title" />
      </div>
      <div class="pl-block-page__title__append">
        <slot name="append" />
      </div>
    </div>
    <div v-else />
    <div class="pl-block-page__body">
      <slot />
    </div>
  </div>
</template>
