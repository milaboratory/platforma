<script lang="ts" setup>
import { toRef } from 'vue';
import { Checkbox } from '@milaboratory/platforma-uikit.lib';
import type { FirstSpec } from '../domain';
import type { ManageModalTypes } from '@milaboratory/platforma-uikit.lib';
import { useFormState } from '@milaboratory/platforma-uikit.lib';

export type Spec = FirstSpec;

const emit = defineEmits<{
  (e: 'update:column', value: ManageModalTypes.Column<FirstSpec>): void;
}>();

const props = defineProps<{
  column: ManageModalTypes.Column<FirstSpec>;
}>();

const form = useFormState(
  toRef(props, 'column'),
  (v) => v,
  (column) => {
    emit('update:column', column);
  },
);
</script>

<template>
  <div class="filter-form">
    <Checkbox v-model="form.data.spec.value">On</Checkbox>
  </div>
</template>

<style scoped></style>
