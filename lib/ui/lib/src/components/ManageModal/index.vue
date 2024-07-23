<script lang="ts" setup>
import './style.scss';
import DialogModal from '@/components/DialogModal.vue';
import type { ManageModalSettings, Column } from './types';
import BasePane from './BasePane.vue';

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:columns', value: Column[]): void;
}>();

defineProps<{
  modelValue: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: ManageModalSettings<any>; // @TODO generic component
}>();
</script>

<template>
  <dialog-modal :model-value="modelValue" class="split" width="720px" height="640px" @update:model-value="$emit('update:modelValue', !!$event)">
    <base-pane :settings="settings" @update:columns="$emit('update:columns', $event)" @close="$emit('update:modelValue', false)" />
  </dialog-modal>
</template>
