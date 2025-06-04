<script lang="ts">
export default {
  name: 'PlErrorAlert',
};
</script>

<script lang="ts" setup>
import { PlIcon16 } from '@/components/PlIcon16';
import { PlClipboard } from '@/components/PlClipboard';

const props = defineProps<{
  title?: string;
  message?: string;
  maxHeight?: string;
  copyMessage?: string;
}>();

function onCopy() {
  const value = props.copyMessage ?? props.message;
  if (typeof value === 'string') {
    navigator.clipboard.writeText(value);
  }
}
</script>

<template>
  <div :style="{ maxHeight: props.maxHeight }" class="root">
    <PlClipboard class="copy" @copy="onCopy" />
    <slot name="title">
      <div class="title">
        <PlIcon16 name="warning" />
        <div class="title-text">{{ props.title }}</div>
      </div>
    </slot>
    <slot name="message">
      <div class="message">
        {{ props.message }}
      </div>
    </slot>
  </div>
</template>

<style scoped>
.root {
  position: relative;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--bg-error);
  border: 2px red solid;
  border-radius: var(--border-radius-control);
  color: var(--txt-error);
}

.copy {
  position: absolute;
  right: 12px;
  top: 12px;
}

.title {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 20px);
  line-height: 20px;
  font-weight: bold;
  overflow: hidden;
}

.title-text {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
