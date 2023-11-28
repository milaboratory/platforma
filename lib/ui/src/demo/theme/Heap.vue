<script lang="ts" setup>
import {reactive} from 'vue';
import SelectInput from '@/lib/components/SelectInput.vue';
import {generate} from '@/lib/helpers/functions';

const data = reactive({
  value: 1
});

const options = generate(100, i => ({
  text: `Option ${i}`,
  value: i
}));
</script>

<template>
  <select-input label="Label" v-model="data.value" :options="options"/>
  <select-input label="Has tooltip" v-model="data.value" :options="options">
    <template #tooltip>
      Tooltip content
      Second line
      Third line
    </template>
  </select-input>
  <select-input label="Has error" v-model="data.value" :options="options" error="Some error description"/>
</template>
