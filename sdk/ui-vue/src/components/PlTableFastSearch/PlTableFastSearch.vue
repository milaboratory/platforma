<script lang="ts" setup>
import { PlSearchField } from "@milaboratories/uikit";
import { ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";

const model = defineModel<string>({ required: true });

const localValue = ref(model.value ?? "");

const emitDebounced = useDebounceFn((value: string) => {
  model.value = value;
}, 300);

watch(localValue, (value) => {
  emitDebounced(value);
});

watch(model, (value) => {
  if (value !== localValue.value) {
    localValue.value = value ?? "";
  }
});
</script>

<template>
  <PlSearchField v-model="localValue" clearable placeholder="Search..." />
</template>
