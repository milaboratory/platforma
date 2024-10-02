<script lang="ts">
/**
 * Log Viewer Component
 */
export default {
  name: 'PlLogView',
};
</script>

<script lang="ts" setup>
import { onMounted, onUpdated, ref } from 'vue';
import MaskIcon24 from '../MaskIcon24.vue';
import './pl-log-view.scss';
import { tapIf } from '@milaboratories/helpers';

const props = defineProps<{
  /**
   * String contents
   */
  value?: string;
}>();

const contentRef = ref<HTMLElement>();

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
  <div class="pl-log-view">
    <MaskIcon24 title="Copy content" class="pl-log-view__copy" name="clipboard" @click="onClickCopy" />
    <div ref="contentRef" class="pl-log-view__content">{{ value }}</div>
  </div>
</template>
