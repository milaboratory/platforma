<script lang="ts">
/**
 * Log Viewer Component
 */
export default {
  name: 'PlLogView',
};
</script>

<script lang="ts" setup>
import { computed, onMounted, onUpdated, ref } from 'vue';
import MaskIcon24 from '../MaskIcon24.vue';
import './pl-log-view.scss';
import { okOptional, tapIf } from '@milaboratories/helpers';
import type { ValueOrErrors } from '@platforma-sdk/model';

const getOutputError = <T,>(o?: ValueOrErrors<T>) => {
  if (o && o.ok === false) {
    return o.errors.join('\n');
  }
};

const props = defineProps<{
  /**
   * String contents
   */
  value?: string;
  /**
   * String contents
   */
  error?: unknown;
  /**
   * Block output (Note: error and value take precedence over output property)
   */
  output?: ValueOrErrors<unknown>;
}>();

const contentRef = ref<HTMLElement>();

const computedError = computed(() => props.error ?? getOutputError(props.output));

const computedValue = computed(() => props.value ?? okOptional(props.output));

const onClickCopy = () => {
  if (props.value) {
    navigator.clipboard.writeText(props.value);
  }
};

const scrollDown = () => {
  tapIf(contentRef.value, (el) => {
    // 100px from bottom (temp)
    if (el.clientHeight + el.scrollTop + 100 > el.scrollHeight) {
      el.scrollTo(el.scrollLeft, el.scrollHeight);
    }
  });
};

onMounted(scrollDown);

onUpdated(scrollDown);
</script>

<template>
  <div class="pl-log-view" :class="{ 'has-error': computedError }">
    <MaskIcon24 title="Copy content" class="pl-log-view__copy" name="clipboard" @click="onClickCopy" />
    <div v-if="computedError" class="pl-log-view__error">{{ computedError }}</div>
    <div v-else ref="contentRef" class="pl-log-view__content">{{ computedValue }}</div>
  </div>
</template>
