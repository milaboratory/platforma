<script lang="ts" setup>
import { TextField, Checkbox } from '@/lib';
import { toRef } from 'vue';
import type { ThirdSpec } from '../domain';
import { useFormState } from '@/lib/composition/useFormState';
import type { Column } from '@/lib/components/ManageModal/types';

export type Spec = ThirdSpec;

const emit = defineEmits<{
  (e: 'update:column', value: Column<Spec>): void;
}>();

const props = defineProps<{
  column: Column<Spec>;
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
    <Checkbox v-model="form.data.spec.check">Check</Checkbox>
    <TextField v-model="form.data.spec.title1" label="Title1" />
    <TextField v-model="form.data.spec.title2" label="Title2" />
    <TextField v-model="form.data.spec.title3" label="Title3" />
    <TextField v-model="form.data.spec.title4" label="Title4" />
    <TextField v-model="form.data.spec.title5" label="Title5" />
    <TextField v-model="form.data.spec.title6" label="Title6" />
    <TextField v-model="form.data.spec.title7" label="Title7" />
    <TextField v-model="form.data.spec.title8" label="Title8" />
  </div>
</template>

<style scoped></style>
