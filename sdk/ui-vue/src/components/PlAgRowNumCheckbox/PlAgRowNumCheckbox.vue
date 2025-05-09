<script lang="ts" setup>
import type { ICellRendererParams } from 'ag-grid-enterprise';
import { PlCheckbox } from '@milaboratories/uikit';
import { ref, computed, onBeforeMount, onBeforeUnmount } from 'vue';
import $styles from './pl-ag-row-num-checkbox.module.scss';

const props = defineProps<{ params: ICellRendererParams }>();

const api = props.params.api;
const isChecked = ref(!!props.params.node.isSelected());
const forceShowCheckbox = computed(() => isChecked.value || api.getGridOption('rowSelection'));
const allowedSelection = ref(api.getGridOption('rowSelection'));

const updateSelection = () => {
  isChecked.value = !!props.params.node.isSelected();
};

const setSelection = (val: boolean) => {
  if (api.getGridOption('rowSelection')) {
    props.params.node.setSelected(val);
    updateSelection();
  }
};

onBeforeMount(() => {
  props.params.node.addEventListener('rowSelected', updateSelection);
});

onBeforeUnmount(() => {
  props.params.node.removeEventListener('rowSelected', updateSelection);
});
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
