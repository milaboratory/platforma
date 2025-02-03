<script lang="ts" setup>
import type { ICellRendererParams, RowSelectionOptions } from 'ag-grid-enterprise';
import { PlCheckbox } from '@milaboratories/uikit';
import { ref, computed } from 'vue';
import $styles from './pl-ag-row-num-checkbox.module.scss';

const props = defineProps<{ params: ICellRendererParams }>();

const api = props.params.api;
const isChecked = ref(!!props.params.node.isSelected());
const forceShowCheckbox = computed(() => isChecked.value || api.getGridOption('rowSelection'));
const allowedSelection = ref(api.getGridOption('rowSelection'));

if ((api.getGridOption('rowSelection') as RowSelectionOptions).mode === 'singleRow') {
  props.params.node.addEventListener('rowSelected', (val) => {
    isChecked.value = !!val.node.isSelected();
  });
}

const updateSelection = () => {
  isChecked.value = !!props.params.node.isSelected();
};

const setSelection = (val: boolean) => {
  if (api.getGridOption('rowSelection')) {
    props.params.node.setSelected(val);
    updateSelection();
  }
};
</script>

<template>
  <div :class="[$styles.container, { [$styles['allowed-selection']]: allowedSelection }, 'd-flex', 'justify-center', 'align-center']">
    <div v-if="!isChecked" :class="[$styles.text]">{{ params.value }}</div>
    <PlCheckbox
      v-if="forceShowCheckbox"
      v-model="isChecked"
      :class="[$styles.checkbox, isChecked && $styles.checked]"
      @update:modelValue="setSelection"
    />
  </div>
</template>
