<script lang="ts" setup>
import type { ManageModalTypes } from '@milaboratory/platforma-uikit.lib';
import { TextField, useFormState } from '@milaboratory/platforma-uikit.lib';
import { computed, toRef } from 'vue';
import type { SecondSpec } from '../domain';
import { utils } from '@milaboratory/helpers';

export type Spec = SecondSpec;

const emit = defineEmits<{
  (e: 'update:column', value: ManageModalTypes.Column<SecondSpec>): void;
}>();

const props = defineProps<{
  column: ManageModalTypes.Column<SecondSpec>;
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
