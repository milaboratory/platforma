<script setup lang="ts">
import { reactive } from 'vue';
import { PlTextField } from '@platforma-sdk/ui-vue';

const data = reactive({
  stringOrNull: 'value' as string | null,
  stringOrUndefined: 'value' as string | undefined,
});
</script>

<template>
  <!--
    You can pass a callback that returns null | undefined | string
    to the `clearable` property
  -->
  <PlTextField
    v-model="data.stringOrNull"
    label="Click the Clear button to set the stringOrNull data field to null."
    :clearable="() => null"
    :helper="'stringOrNull: ' + data.stringOrNull"
  />
  <PlTextField
    v-model="data.stringOrUndefined"
    label="Click the Clear button to set the stringOrUndefined data field to undefined."
    :clearable="() => undefined"
    :helper="'stringOrUndefined: ' + data.stringOrUndefined"
  />
</template>
