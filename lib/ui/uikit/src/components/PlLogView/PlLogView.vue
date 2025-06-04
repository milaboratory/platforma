<script lang="ts">
/**
 * Log Viewer Component
 */
export default {
  name: 'PlLogView',
};
</script>

<script lang="ts" setup>
import { computed, ref, useSlots, watch } from 'vue';
import { PlMaskIcon24 } from '../PlMaskIcon24';
import './pl-log-view.scss';
import { okOptional, tapIf } from '@milaboratories/helpers';
import type { AnyLogHandle, Platforma, ValueOrErrors } from '@platforma-sdk/model';
import { useLogHandle } from './useLogHandle';
import { useLabelNotch } from '../../utils/useLabelNotch';
import DoubleContour from '../../utils/DoubleContour.vue';
import { PlTooltip } from '../PlTooltip';

const getOutputError = <T>(o?: ValueOrErrors<T>) => {
  if (o && o.ok === false) {
    return o.errors.join('\n');
  }
};

const slots = useSlots();

const props = defineProps<{
  /**
   * String contents
   */
  value?: string;
  /**
   * The content to copy (Note: it takes precedence over value property)
   */
  valueToCopy?: string;
  /**
   * AnyLogHandle
   */
  logHandle?: AnyLogHandle;
  /**
   * Custom progress prefix (to filter logHandle results)
   */
  progressPrefix?: string;
  /**
   * String contents
   */
  error?: unknown;
  /**
   * Block output (Note: error and value take precedence over output property)
   */
  output?: ValueOrErrors<unknown>;
  /**
   * Max retries for AnyLogHandle fetch (with the same parameters)
   */
  maxRetries?: number;
  /**
   * @TODO
   */
  mockPlatforma?: Platforma;
  /**
   * The label to display above the texarea.
   */
  label?: string;
  /**
   * Do not scroll to bottom on content change. Default is false (scroll to bottom).
   */
  disableAutoScroll?: boolean;
}>();

const logState = useLogHandle(props);

const isAnchored = ref<boolean>(true);

const contentRef = ref<HTMLElement>();

const root = ref<HTMLInputElement>();

const computedError = computed(() => logState.value?.error ?? props.error ?? getOutputError(props.output));

const computedValue = computed(() => logState.value?.lines ?? props.value ?? okOptional(props.output));

const copyActive = ref(false);

useLabelNotch(root);

const iconName = computed(() => (copyActive.value ? 'clipboard-copied' : 'clipboard'));

const onClickCopy = () => {
  copyActive.value = true;
  setTimeout(() => {
    copyActive.value = false;
  }, 1200);

  let toCopy: string | undefined = undefined;
  if (props.valueToCopy) {
    toCopy = props.valueToCopy;
  } else if (computedValue.value && typeof computedValue.value === 'string') {
    toCopy = computedValue.value;
  }

  if (toCopy !== undefined) {
    navigator.clipboard.writeText(toCopy);
  }
};

const optionallyScrollDown = () => {
  if (props.disableAutoScroll) {
    return;
  }

  tapIf(contentRef.value, (el) => {
    if (isAnchored.value) {
      el.scrollTo(el.scrollLeft, el.scrollHeight);
    }
  });
};

watch(
  computedValue,
  () => {
    requestAnimationFrame(() => {
      optionallyScrollDown();
    });
  },
  { immediate: true },
);

const onContentScroll = (ev: Event) => {
  const el = ev.target as HTMLElement;
  isAnchored.value = el.scrollTop + 20 /* ~ 1 line height */ >= el.scrollHeight - el.offsetHeight;
};
</script>

<template>
  <div ref="root" class="pl-log-view" :class="{ 'has-error': computedError }">
    <label v-if="label">
      <span>{{ label }}</span>
      <PlTooltip v-if="slots.tooltip" class="info" position="top">
        <template #tooltip>
          <slot name="tooltip" />
        </template>
      </PlTooltip>
    </label>
    <DoubleContour class="pl-log-view__contour" />
    <div class="pl-log-view__copy">
      <PlTooltip :close-delay="800" position="top">
        <PlMaskIcon24 title="Copy content" :name="iconName" @click="onClickCopy" />
        <template #tooltip>{{ copyActive ? 'copied' : 'copy' }}</template>
      </PlTooltip>
    </div>
    <div v-if="computedError" class="pl-log-view__error">{{ computedError }}</div>
    <div v-else ref="contentRef" class="pl-log-view__content" @scroll="onContentScroll">{{ computedValue }}</div>
  </div>
</template>
