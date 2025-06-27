<script lang="ts" setup>
import { createPlTableFiltersStateV2, type PlTableFiltersStateV2 } from '@platforma-sdk/model';
import { useState } from './filters-state';
import type { PlTableFiltersSettingsV2 } from './types';
import { toRefs } from 'vue';

const state = defineModel<PlTableFiltersStateV2>({
  default: createPlTableFiltersStateV2(),
});
const props = defineProps<{
  settings: Readonly<PlTableFiltersSettingsV2>;
}>();
const { settings } = toRefs(props);

const _state = useState(state, settings);
</script>

<template>
  <div/>
</template>
