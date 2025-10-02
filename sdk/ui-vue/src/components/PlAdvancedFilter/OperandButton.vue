<script lang="ts" setup>
import type { Operand } from './types';

defineProps<{
  active: Operand;
  disabled: boolean;
}>();
defineEmits<{
  (e: 'select', op: Operand): void;
}>();

const OPTIONS: Operand[] = ['and', 'or'];
</script>
<template>
  <div :class="$style.block">
    <div
      v-for="op in OPTIONS"
      :key="op"
      :class="[$style.operand, {[$style.active]: op === active && !disabled}]"
      @click="!disabled && $emit('select', op)"
    >
      {{ op }}
    </div>
  </div>
</template>
<style module>
.block {
  width: 100%;
  display: flex;
  gap: 4px;
  justify-content: center;
}
.operand {
  border-radius: 16px;
  width: 64px;
  height: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  text-transform: uppercase;
  font-weight: 600;

  color: var(--txt-03);
  border: 1px solid var(--color-div-grey);
  background: transparent;
  cursor: pointer;
}
.operand.active {
  color: var(--txt-01);
  background: #fff;
  border: 1px solid var(--txt-01);
}
</style>
