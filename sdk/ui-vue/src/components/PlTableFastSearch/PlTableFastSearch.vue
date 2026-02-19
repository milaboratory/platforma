<script lang="ts" setup>
import { PlSearchField } from "@milaboratories/uikit";

const model = defineModel<string>({ required: true });
</script>

<template>
  <PlSearchField v-model="model" clearable placeholder="Search..." />
</template>
