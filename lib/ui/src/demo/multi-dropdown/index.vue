<script lang="ts" setup>
import {reactive} from 'vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import MultiDropdown from '@/lib/components/MultiDropdown.vue';
import {generate} from '@/lib/helpers/functions';

const data = reactive({
  value: []
});

const options = generate(100, i => ({
  text: `Option ${i}`,
  value: i
}));
</script>

<template>
  <layout>
    <split name="Multi Dropdown" style="min-height: 600px">
      {{ data.value }}
      <multi-dropdown placeholder="Hello" label="Placeholder" v-model="data.value" :options="options"/>
      <multi-dropdown label="Label" v-model="data.value" :options="options"/>
      <multi-dropdown label="Has tooltip" v-model="data.value" :options="options">
        <template #tooltip>
          Tooltip content
          Second line
          Third line
        </template>
      </multi-dropdown>
      <multi-dropdown label="Has error" v-model="data.value" :options="options" error="Some error description"/>
      <multi-dropdown label="Disabled" :disabled="true" v-model="data.value" :options="options"/>
    </split>
  </layout>
</template>
