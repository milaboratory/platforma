<script lang="ts">
export default {
  name: 'PlErrorAlert',
};
</script>

<script lang="ts" setup>
import { PlClipboard } from '@/components/PlClipboard';
import { PlMaskIcon16 } from '@/components/PlMaskIcon16';

const props = withDefaults(
  defineProps<{
    title?: string;
    message?: string;
    maxHeight?: string;
    copyMessage?: string;
  }>(),
  {
    title: undefined,
    message: undefined,
    maxHeight: '300px',
    copyMessage: undefined,
  },
);

function onCopy() {
  const value = props.copyMessage ?? props.message;
  if (typeof value === 'string') {
    navigator.clipboard.writeText(value);
  }
}
</script>

<template>
  <div :style="{ maxHeight: props.maxHeight }" :class="$style.root">
    <PlClipboard :class="$style.copy" @copy="onCopy" />
    <slot name="title">
      <div :class="$style.title">
        <PlMaskIcon16 :class="$style.titleIcon" name="warning" />
        <div :class="$style.titleText">{{ props.title }}</div>
      </div>
    </slot>
    <slot name="message">
      <div :class="$style.message">
        {{ props.message }}
      </div>
    </slot>
  </div>
</template>

<style module>
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
  opacity: 0.4;
  transition: opacity 0.3s;

  &:hover {
    opacity: 1;
  }
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

.titleIcon {
  background-color: var(--txt-error);
}

.titleText {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message {
  overflow: auto;
  max-height: 100%;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
