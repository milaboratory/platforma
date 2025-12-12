<script lang="ts">
/** Root block page component */
export default {
  name: 'PlBlockPage',
};
</script>

<script lang="ts" setup>
import { computed, useSlots } from 'vue';
import { PlBlockPageTitleTeleportId } from './PlBlockPageTitleTeleportId';
import './pl-block-page.scss';
import { PlPlaceholder, type PlPlaceholderProps } from '../PlPlaceholder';

const slots = useSlots();

const props = defineProps<{
  /**
   * If `true` body gutters are removed
   */
  noBodyGutters?: boolean;
  /**
   * If defined, a loading overlay is displayed on the page body (over all default slot content)
   */
  bodyLoading?: PlPlaceholderProps['variant'] | PlPlaceholderProps;
}>();

const loadingPlaceholder = computed<PlPlaceholderProps | undefined>(() => {
  if (typeof props.bodyLoading === 'string') {
    return { variant: props.bodyLoading };
  }
  return props.bodyLoading;
});

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
        <div
          :id="PlBlockPageTitleTeleportId"
          class="pl-block-page__title__append__teleport"
        />
        <slot name="append" />
      </div>
    </div>
    <div v-else />
    <div class="pl-block-page__body">
      <PlPlaceholder v-show="loadingPlaceholder" v-bind="loadingPlaceholder" />
      <div :style="{ display: loadingPlaceholder ? 'none' : 'contents' }">
        <slot />
      </div>
    </div>
  </div>
</template>
