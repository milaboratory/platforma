<script lang="ts" setup>
import { PlTextField } from '@milaboratories/uikit';
import { computed } from 'vue';

type Model = {
  name: string;
};

const emit = defineEmits<{
  (e: 'update:modelValue', value: Model): void;
}>();

const props = defineProps<{
  modelValue: Model;
}>();

const nameModel = computed({
  get() {
    return props.modelValue.name;
  },
  set(name) {
    emit('update:modelValue', {
      ...props.modelValue,
      name,
    });
  },
});
</script>

<template>
  <div class="p-12 d-flex gap-6" style="width: 100%">
    <PlTextField v-model="nameModel" label="Name" />
  </div>
</template>
