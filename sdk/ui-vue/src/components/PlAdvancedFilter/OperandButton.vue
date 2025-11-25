<script lang="ts" setup>
import type { Operand } from './types';

const props = defineProps<{
  active: Operand;
  disabled: boolean;
  onSelect: (op: Operand) => void;
}>();

const OPTIONS: Operand[] = ['and', 'or'];
</script>
<template>
  <div v-bind="$attrs" :class="$style.block">
    <div
      v-for="op in OPTIONS"
      :key="op"
      :class="[$style.operand, {[$style.active]: op === props.active && !props.disabled}]"
      @click="!props.disabled && props.onSelect(op)"
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
  height: 30px;
  align-items: center;
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
