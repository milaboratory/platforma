<script setup lang="ts">
import { reactive } from 'vue';
import { PlCheckbox } from '@platforma-sdk/ui-vue';

const data = reactive({
  disabled: false,
  checked: false,
});
</script>

<template>
  <!-- Without label -->
  <PlCheckbox v-model="data.checked" :disabled="data.disabled" />
  <PlCheckbox v-model="data.checked" :disabled="data.disabled">
    Checkbox with a clickable label
  </PlCheckbox>
  <PlCheckbox v-model="data.disabled">
    Disable other checkboxes
  </PlCheckbox>
  <h3>The same components arranged in a row</h3>
  <div class="d-flex gap-12">
    <!-- Without label -->
    <PlCheckbox v-model="data.checked" :disabled="data.disabled" />
    <PlCheckbox v-model="data.checked" :disabled="data.disabled">
      Checkbox with a clickable label
    </PlCheckbox>
    <PlCheckbox v-model="data.disabled">
      Disable other checkboxes
    </PlCheckbox>
  </div>
</template>
