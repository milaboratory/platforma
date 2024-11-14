<script setup lang="ts">
import { reactive, ref } from 'vue';
import { PlDropdown, PlCheckbox, PlDropdownRef, PlBtnPrimary } from '@platforma-sdk/ui-vue';

// It can be static or reactive, depending on your goals.
// Note that if the parameter value is not primitive, deep equality is used to determine the selected parameter.
// const options = ref(undefined);
// const optionsForRef = ref(undefined);
const loadingBtn = ref(false);

const data = reactive({
  model: 1 as number | undefined,
  refModel: {
    __isRef: true as const,
    blockId: '2',
    name: 'Ref to block 2',
  },
  required: false,
  disabled: false,
  showError: false,
  showHelper: false,
  clearable: false,
  options: undefined,
  optionsForRef: undefined,
});

function loadItems() {
  data.options = undefined;
  data.optionsForRef = undefined;
  loadingBtn.value = true;
  setTimeout(() => {
    data.options = [
      { text: 'Item text 1', value: 1 },
      { text: 'Item text 2', value: 2 },
      { text: 'Item text 3', value: 3 },
      { text: 'Item text 4', value: 4 },
    ];
    data.optionsForRef = [
      {
        label: 'Ref 1',
        ref: {
          __isRef: true as const,
          blockId: '1',
          name: 'Ref to block 1',
        },
      },
      {
        label: 'Ref 2',
        ref: {
          __isRef: true as const,
          blockId: '2',
          name: 'Ref to block 2',
        },
      },
    ];
    loadingBtn.value = false;

    setTimeout(() => {
      data.options = undefined;
      data.optionsForRef = undefined;
    }, 10000)
  }, 1000)
}
</script>

<template>
  <PlDropdown v-model="data.model" :options="data.options" label="Dropdown Label" placeholder="Select an option"
    :clearable="data.clearable" :required="data.required" :disabled="data.disabled"
    :error="data.showError ? 'An error example' : undefined"
    :helper="data.showHelper ? 'A helper example' : undefined" />

  <PlDropdownRef v-model="data.refModel" :options="data.optionsForRef" label="Dropdown Label"
    placeholder="Select an option" :clearable="data.clearable" :required="data.required" :disabled="data.disabled"
    :error="data.showError ? 'An error example' : undefined"
    :helper="data.showHelper ? 'A helper example' : undefined" />

  <div class="d-flex gap-12">
    <PlBtnPrimary :loading="loadingBtn" @click="loadItems">Load items</PlBtnPrimary>
    <PlCheckbox v-model="data.required">Required</PlCheckbox>
    <PlCheckbox v-model="data.disabled">Disabled</PlCheckbox>
    <PlCheckbox v-model="data.showError">Show error</PlCheckbox>
    <PlCheckbox v-model="data.showHelper">Show helper</PlCheckbox>
    <PlCheckbox v-model="data.clearable">Clearable</PlCheckbox>
  </div>
</template>
