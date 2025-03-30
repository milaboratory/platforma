<script setup lang="ts">
import { PlIcon24, PlTooltip } from '@milaboratories/uikit';

defineProps<{
  canRun: boolean | undefined;
}>();
</script>

<template>
  <div :class="[{ 'can-run': canRun }, $style.container]">
    <div :class="$style.badge">
      <i :class="$style.blob">
        <span>
          <span :class="$style.dot" />
        </span>
      </i>
      <span>Can run</span>
    </div>
    <PlTooltip>
      <template #tooltip>
        Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.
      </template>
      <PlIcon24 name="info" />
    </PlTooltip>
  </div>
</template>

<style module>
.container {
  display: flex;
  align-items: center;
  gap: 8px;
  --blob-color: #FF5C5C;
  --badge-background: rgba(255, 92, 92, 0.12);
  &.can-run {
    --blob-color: #49CC49;
    --badge-background: rgba(99, 224, 36, 0.12);
  }
}

.badge {
  display: flex;
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

  >span {
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
