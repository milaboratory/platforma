<script lang="ts" setup>
import { TextField } from '@/lib';
import { computed, toRef } from 'vue';
import type { SecondSpec } from '../domain';
import { utils } from '@milaboratory/helpers';
import { useFormState } from '@/lib/composition/useFormState';
import type { Column } from '@/lib/components/ManageModal/types';

export type Spec = SecondSpec;

const emit = defineEmits<{
  (e: 'update:column', value: Column<SecondSpec>): void;
}>();

const props = defineProps<{
  column: Column<SecondSpec>;
}>();

const placeholder = computed(() => props.column.columnSettings?.title ?? '');

const form = useFormState(
  toRef(props, 'column'),
  (v) => v,
  (column) => {
    emit('update:column', column);
  },
);

const age = computed({
  get() {
    return String(form.data.spec.age);
  },
  set(v) {
    utils.tap(Number(v), (n) => {
      if (Number.isFinite(n)) {
        form.data.spec.age = n;
      }
    });
  },
});
</script>

<template>
  <div class="filter-form">
    <TextField v-model="age" label="Age" />
    <TextField v-model="form.data.spec.label" label="Label" />
    <TextField v-model="form.data.spec.title" label="Title" :placeholder="placeholder" />
  </div>
</template>

<style scoped></style>
