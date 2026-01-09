<script lang="ts">
/** Root block page component */
export default {
  name: 'PlBlockPage',
};
</script>

<script lang="ts" setup>
import { computed, useCssModule, useSlots, useTemplateRef, watchEffect } from 'vue';
import { PlBlockPageTitleTeleportTarget } from './PlBlockPageTitleTeleportTarget';
import './pl-block-page.scss';
import { PlIcon24 } from '../../components/PlIcon24';
import { type PlPlaceholderProps, PL_PLACEHOLDER_TEXTS, PlPlaceholder } from '../PlPlaceholder';

const slots = useSlots();

const props = defineProps<{
  /**
   * Page title (won't be displayed if `title` slot is also provided)
   */
  title?: string;
  /**
   * Text to display when subtitle is empty
   */
  subtitlePlaceholder?: string;
  /**
   * If `true` body gutters are removed
   */
  noBodyGutters?: boolean;
  /**
   * If defined, a loading overlay is displayed on the page body (over all default slot content)
   */
  bodyLoading?: PlPlaceholderProps['variant'] | PlPlaceholderProps;
}>();

/** Page subtitle (editable) */
const subtitle = defineModel<string>('subtitle');

const styles = useCssModule();

const loadingPlaceholder = computed<PlPlaceholderProps | undefined>(() => {
  if (typeof props.bodyLoading === 'string') {
    return { variant: props.bodyLoading, ...PL_PLACEHOLDER_TEXTS.LOADING };
  }
  return props.bodyLoading;
});

const teleportTarget = useTemplateRef('teleportTarget');

watchEffect(() => {
  PlBlockPageTitleTeleportTarget.value = teleportTarget.value;
});
</script>

<template>
  <div class="pl-layout-component pl-block-page" :class="{ noBodyGutters: props.noBodyGutters }">
    <div v-if="slots.title || props.title" :class="styles.header">
      <div class="pl-block-page__title">
        <div class="pl-block-page__title__default">
          <span v-if="slots.title"><slot name="title" /></span>
          <span v-else>{{ props.title }}</span>
          <slot name="after-title" />
        </div>
        <div class="pl-block-page__title__append">
          <div
            ref="teleportTarget"
            class="pl-block-page__title__append__teleport"
          />
          <slot name="append" />
        </div>
      </div>
      <div v-if="subtitle !== undefined" :class="styles.subtitle">
        <input
          v-model.lazy.trim="subtitle"
          :placeholder="props.subtitlePlaceholder"
        />
        <PlIcon24 :class="styles.editIcon" name="edit" color="var(--ic-02)" />
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

<style module>
.header {
  display: flex;
  flex-direction: column;
  padding: 12px 24px;
  margin-block-end: -8px;
  gap: 2px;
  overflow: hidden;
}

.subtitle {
  display: flex;
  padding-inline-end: 28px;

  input {
    anchor-name: --pl-block-page-subtitle;
    field-sizing: content;
    padding: 0;
    border: none;
    outline: none;
    caret-color: var(--border-color-focus);
    color: var(--txt-01);
    font-family: Manrope;
    font-size: 20px;
    font-weight: 500;
    line-height: 28px;
    letter-spacing: -0.2px;
    margin-block-end: -4px;
    max-inline-size: 100%;
    text-overflow: ellipsis;

    &::placeholder {
      color: var(--txt-03);
    }
  }

  .editIcon {
    visibility: hidden;
    position: fixed;
    position-anchor: --pl-block-page-subtitle;
    position-area: center inline-end;
    inset-inline-start: 4px;
  }
  &:hover, &:focus-within {
    .editIcon {
      visibility: visible;
    }
  }
}
</style>
