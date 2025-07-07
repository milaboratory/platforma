<script setup lang="ts">
import { PlBtnGhost, PlBtnPrimary, PlDialogModal, PlRadioGroup, PlTextField } from '@milaboratories/uikit';
import { computed, ref } from 'vue';

// Models
const opened = defineModel<boolean>({ required: true });
// Emits
const emits = defineEmits<{
  (e: 'submit', props: { type: 'byClonotype' | 'bySampleAndClonotype'; name: string }): void;
}>();

const annotationSchemaTypes = [
  { label: 'Global', value: 'byClonotype' },
  { label: 'Per sample', value: 'bySampleAndClonotype' },
];

const modalState = ref<{
  type: 'byClonotype' | 'bySampleAndClonotype';
  name: string;
}>({
  type: 'byClonotype',
  name: '',
});

const isValidForm = computed(() => {
  return modalState.value.name.length > 3;
});

const handleSubmit = () => {
  if (isValidForm.value) {
    emits('submit', modalState.value);
  }
};

const handleCancel = () => {
  opened.value = false;
};
</script>

<template>
  <PlDialogModal v-model="opened" width="600px">
    <template #title>
      Choose the Annotation Scheme type
    </template>
    <template #default>
      <PlRadioGroup v-model="modalState.type" :options="annotationSchemaTypes" />
      <PlTextField
        v-model="modalState.name"
        label="Name your Scheme"
        min-length="3"
        max-length="40"
        placeholder="Annotation Name"
        autofocus
        required
      />
    </template>
    <template #actions>
      <PlBtnPrimary :disabled="!isValidForm" @click.stop="handleSubmit">Apply</PlBtnPrimary>
      <PlBtnGhost @click.stop="handleCancel">Cancel</PlBtnGhost>
    </template>
  </PlDialogModal>
</template>
