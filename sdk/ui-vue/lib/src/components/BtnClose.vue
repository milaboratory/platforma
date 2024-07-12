<script lang="ts" setup>
import { useSlots } from 'vue';

const slots = useSlots();
</script>

<template>
  <div tabindex="0" class="btn-close">
    <div />
    <div v-if="slots.default">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
@import '../assets/mixins.scss';

.btn-close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  height: 40px;
  min-width: 40px;
  user-select: none;
  padding: 0 8px;
  > div:first-child {
    background-color: var(--color-text);
    @include mask(url('@/lib/assets/images/24_close.svg'), 24px);
  }
  > div:last-child {
    padding-right: 7px;
  }
  border-radius: 6px;
  cursor: pointer;
  z-index: 3;
  &:hover {
    color: var(--color-text);
    background-color: var(--color-sec-hover-grey);
    [data-theme='dark'] & {
      --color-text: var(--color-focus);
    }
  }
  outline-color: var(--color-focus);
} //
</style>
