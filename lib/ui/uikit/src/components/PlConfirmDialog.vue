<script setup lang="ts">
import { PlBtnPrimary } from './PlBtnPrimary';
import { PlBtnSecondary } from './PlBtnSecondary';
import { PlDialogModal } from './PlDialogModal';

const props = withDefaults(
  defineProps<{
    opened?: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>(), {
    opened: true,
    onCancel: undefined,
    onConfirm: undefined,
  },
);

const emits = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const handleConfirm = () => {
  emits('confirm');
  props.onConfirm?.();
};

const handleCancel = () => {
  emits('cancel');
  props.onCancel?.();
};
</script>

<template>
  <PlDialogModal v-model="props.opened" :closable="false" @click.stop>
    <template #title>
      {{ title }}
    </template>
    <template #default>
      {{ message }}
    </template>
    <template #actions>
      <PlBtnPrimary @click.stop="handleConfirm">
        {{ props.confirmLabel }}
      </PlBtnPrimary>
      <PlBtnSecondary @click.stop="handleCancel">
        {{ props.cancelLabel }}
      </PlBtnSecondary>
    </template>
  </PlDialogModal>
</template>
