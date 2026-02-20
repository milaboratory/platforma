<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  canRun: boolean | undefined;
  statusText: string | undefined;
  isLoading?: boolean;
}>();

const badgeText = computed(() => {
  if (props.isLoading) {
    return "Updating...";
  }

  if (props.canRun) {
    return "Ready to run";
  }

  return "Cannot run";
});
</script>

<template>
  <div>
    <div :class="[{ [$style['can-run']]: canRun, [$style.loading]: isLoading }, $style.container]">
      <div :class="$style.badge">
        <i :class="$style.blob">
          <span>
            <span :class="$style.dot" />
          </span>
        </i>
        <span>{{ badgeText }}</span>
      </div>
      <slot />
    </div>
    <div v-if="statusText" :class="$style.statusText">{{ statusText }}</div>
  </div>
</template>

<style module>
.container {
  display: flex;
  align-items: center;
  gap: 8px;
  --blob-color: #ff5c5c;
  --badge-background: rgba(255, 92, 92, 0.12);

  &.can-run {
    --blob-color: #49cc49;
    --badge-background: rgba(99, 224, 36, 0.12);
  }

  &.loading {
    --blob-color: #ffad0a;
    --badge-background: rgba(255, 173, 10, 0.12);
  }
}

.statusText {
  margin-top: 6px;
  color: var(--txt-error);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}

.badge {
  display: flex;
  gap: 6px;
  height: 40px;
  padding: 6px 16px 6px 8px;
  align-items: center;
  border-radius: 6px;
  border: 1px solid var(--badge-background);
  background: var(--badge-background);
}

.blob {
  width: 24px;
  height: 24px;
  display: flex;
  place-items: center;
  place-content: center;

  > span {
    display: flex;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    place-content: center;
    place-items: center;
    background-color: rgb(from var(--blob-color) r g b / 0.24);
  }

  .dot {
    border-radius: 50%;
    height: 8px;
    width: 8px;
    transform: scale(1);

    background: var(--blob-color);
    box-shadow: 0 0 0 0 var(--blob-color);
    animation: pulse-glob 1s infinite;
  }
}
</style>
