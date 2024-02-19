<script setup lang="ts">
import LineDropdown from '@/lib/components/LineDropdown.vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';
import { generate } from '@/lib/helpers/functions';
import { reactive } from 'vue';

const options = generate(30, (id) => ({
  text: `Option ${id}`,
  value: {
    id,
  },
}));

const form = reactive({
  value: {
    id: 3,
  },
});
</script>

<template>
  <Layout>
    <Split name="Select input">
      <div>value: {{ form.value }}</div>
      <div style="display: flex">
        <LineDropdown v-model="form.value" :options="options" :prefix="'Option:'" :input-max-width="'200px'">
          <template #item="slotProps">
            <DropdownListItem v-bind="slotProps" :size="'medium'" />
          </template>
        </LineDropdown>
      </div>
    </Split>
  </Layout>
</template>

<style>
.ui-select-input-line {
  margin-right: 25px;
}
</style>
