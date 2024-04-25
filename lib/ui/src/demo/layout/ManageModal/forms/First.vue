<script lang="ts" setup>
import { toRef } from 'vue';
import { Checkbox } from '@/lib';
import type { FirstSpec } from '../domain';
import { useFormState } from '@/lib/composition/useFormState';
import type { Column } from '@/lib/components/ManageModal/types';

export type Spec = FirstSpec;

const emit = defineEmits<{
  (e: 'update:column', value: Column<FirstSpec>): void;
}>();

const props = defineProps<{
  column: Column<FirstSpec>;
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
