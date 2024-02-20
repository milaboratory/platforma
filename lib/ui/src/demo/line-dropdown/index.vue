<script setup lang="ts">
import LineDropdown from '@/lib/components/LineDropdown.vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import { generate } from '@/lib/helpers/functions';
import { ref } from 'vue';
import PropsDisplay from '@/demo/PropsDisplay.vue';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';

const items0 = generate(40, (i) => ({
  text: `Option ${i}`,
  value: {
    i,
  },
}));

const items1 = generate(40, (i) => ({
  text: `List item ${i}`,
  value: {
    i,
  },
}));

const items2 = generate(300, (i) => ({
  text: `Tab ${i}`,
  value: {
    i,
  },
}));

const model0 = ref([]);
const model1 = ref({ i: 35 });
const model2 = ref({ i: 2 });

const propsDescription = {
  modelValue: {
    type: 'Option;',
    description: 'Model for component v-model',
  },
  disabled: {
    type: '?boolean;',
    description: 'Is component disable or not',
  },
  prefix: {
    type: '?string;',
    description: 'Prefix in UI',
  },
  options: {
    type: 'Option[];',
    description: 'Items for component',
  },
  placeholder: {
    type: '?string;',
    description: 'UI placeholder',
  },
  mode: {
    type: '"list" | "?tabs";',
    description: 'Component has two types of list "tabs" view and "list" view',
  },
  tabsContainerStyles: {
    type: '?Record<string, any>',
    description: 'Styles for "tabs" view',
  },
};
</script>

<template>
  <Layout>
    <Split name="Select input">
      <div style="display: flex">
        <LineDropdown v-model="model0" :options="items0" :prefix="'Option:'" :input-max-width="'400px'">
          <template #item="slotProps">
            <DropdownListItem v-bind="slotProps" :size="'small'" />
          </template>
        </LineDropdown>
        <LineDropdown v-model="model0" :options="items0" :prefix="'Option:'" :input-max-width="'400px'" :input-width="'150px'"> </LineDropdown>
        <LineDropdown v-model="model1" :options="items1" :prefix="'List:'" :disabled="true" />
        <LineDropdown v-model="model1" :options="items1" :prefix="'List:'" />
        <LineDropdown v-model="model2" :mode="'tabs'" :options="items2" :prefix="'Tab:'" :tabs-container-styles="{ maxWidth: '700px' }" />
      </div>
      {{ model0 }}
      <template #props>
        <PropsDisplay :data="propsDescription" />
      </template>
    </Split>
  </Layout>
</template>

<style>
.ui-select-input-line {
  margin-right: 25px;
}
</style>
