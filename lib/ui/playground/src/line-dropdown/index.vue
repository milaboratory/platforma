<script setup lang="ts">
import { LineDropdown, DropdownListItem } from '@milaboratory/platforma-uikit.lib';
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { generate } from '@/imports';
import { ref } from 'vue';
import PropsDisplay from '@/PropsDisplay.vue';

const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';

const items0 = generate(40, (i) => {
  if (i % 2 === 0) {
    return {
      text: `Option ${i} ${lorem}`,
      value: {
        i,
      },
    };
  }
  return {
    text: `Option ${i}`,
    value: {
      i,
    },
  };
});

const items1 = generate(40, (i) => ({
  text: `List item ${i}`,
  value: {
    i,
  },
}));

const items2 = generate(300, (i) => {
  if (i % 2 === 0) {
    return {
      text: `Tab ${i}`,
      value: {
        i,
      },
    };
  }
  return {
    text: `Tab Option ${i}`,
    value: {
      i,
    },
  };
});

const itemsLong = generate(300, (i) => ({
  text: `Tab ${i} ${lorem}`,
  value: {
    i,
  },
}));

const itemsTitleAndDescription = generate(300, (i) => ({
  text: `Title ${i}`,
  description: `${lorem}`,
  value: {
    i,
  },
}));

const model0 = ref({ i: 0 });
const model1 = ref({ i: 35 });
const model2 = ref({ i: 2 });

const propsDescription = {
  modelValue: {
    type: 'unknown',
    description: 'Model for component v-model',
  },
  'disabled?': {
    type: 'boolean;',
    description: 'Is component disabled or not',
  },
  'prefix?': {
    type: 'string;',
    description: 'Prefix in UI',
  },
  options: {
    type: 'Option<unknown>[];',
    description: 'Items for component',
  },
  'placeholder?': {
    type: 'string;',
    description: 'UI placeholder',
  },
  'mode?': {
    type: '"list" | "tabs";',
    description: 'Component has two types of list "tabs" view and "list" view',
  },
  'tabsContainerStyles?': {
    type: 'StyleValue (vue)',
    description: 'Styles for "tabs" view',
  },
  'clearable?': {
    type: 'boolean;',
    description: 'Allows you show or hide clear icon. Button will be shown whe you have selected item and you opened list.',
  },
};
</script>

<template>
  <Layout>
    <Split name="Line Dropdown">
      <div>
        <LineDropdown v-model="model0" :options="itemsTitleAndDescription" prefix="Option:" />
      </div>
      <div style="display: flex">
        <LineDropdown v-model="model0" :options="items0" prefix="Option:" :input-max-width="'400px'" clearable>
          <template #option="slotProps">
            <DropdownListItem v-bind="slotProps" :size="'small'" />
          </template>
        </LineDropdown>
        <LineDropdown v-model="model0" :options="itemsLong" prefix="Option:" />
        <LineDropdown v-model="model1" :options="items1" prefix="List:" :disabled="true" />
        <LineDropdown v-model="model1" :options="items1" prefix="List:" clearable />
        <LineDropdown v-model="model2" mode="tabs" :options="items2" prefix="Tab:" :tabs-container-styles="{ maxWidth: '700px' }" clearable />
      </div>
      {{ model0 }} {{ typeof model0 }}
      <template #props>
        <PropsDisplay :data="propsDescription" />
      </template>
    </Split>
  </Layout>
</template>

<style>
.ui-line-dropdown {
  margin-right: 25px;
}
</style>
