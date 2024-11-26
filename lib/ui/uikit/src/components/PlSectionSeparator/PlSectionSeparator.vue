<script lang="ts" setup>
defineProps<{
  /**
   * If `true`, remove top padding
   */
  compact?: boolean;
}>();
</script>

<template>
  <div class="pl-section-separator" :class="{ [$style.compact]: compact }">
    <div :class="$style.content"><slot /></div>
  </div>
</template>

<style module>
:global(.pl-section-separator) {
  --pl-separator-padding: 20px 0 4px 0;
  --pl-separator-txt-color: var(--txt-03);
  --pl-separador-divider-color: var(--border-color-div-grey);
  --mask-icon-bg-color: var(--ic-02);
  display: flex;
  flex-direction: column;
  padding: var(--pl-separator-padding);
}

:global(.pl-section-separator):first-child {
  --pl-separator-padding: 4px 0 4px 0;
}

.compact {
  --pl-separator-padding: 0 0 4px 0;
}

.content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--pl-separator-txt-color);
  font-size: 13px;
  font-weight: 600;
  line-height: 14px;
  min-height: 16px;
  letter-spacing: 0.52px;
  text-transform: uppercase;
  user-select: none;
}

.content::after {
  flex: 1;
  content: '';
  height: 1px;
  background-color: var(--pl-separador-divider-color);
  margin-left: 4px;
}
</style>
