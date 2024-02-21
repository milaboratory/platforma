<script setup lang="ts">
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import PropsDisplay from '@/demo/PropsDisplay.vue';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';

const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';

const propsDescription = {
  item: {
    type: 'Option;',
    description: 'Item',
  },
  isSelected: {
    type: 'boolean;',
    description: 'Is component list item selected or not',
  },
  size: {
    type: '"small" | "medium";',
    description: 'List item size',
  },
  isHovered: {
    type: 'boolean;',
    description: 'Is component component hovered or not',
  },
  useCheckbox: {
    type: '?:boolean;',
    description: 'Use checkbox for displaing selection',
  },
};
</script>

<template>
  <Layout>
    <Split name="DropdownListItem">
      <div>
        <h3 class="text-h3 h3">Examles</h3>
        <div class="container">
          <h3 class="text-h3 h3">Small size</h3>
          <div style="border-radius: 6px; border: 1px solid var(--color-div-grey)">
            <DropdownListItem :item="{ text: 'Just item', value: 'any value' }" />
            <DropdownListItem :item="{ text: 'Selected item', value: 'any value' }" is-selected />
            <DropdownListItem :item="{ text: 'Hovered item (using keyboard)', value: 'any value' }" is-hovered />
            <DropdownListItem :item="{ text: 'Checkbox', value: 'any value' }" use-checkbox />
            <DropdownListItem :item="{ text: 'Checkbox selected', value: 'any value' }" use-checkbox is-selected />
            <DropdownListItem :item="{ text: `Long text ${lorem} ${lorem}`, value: 'any value' }" use-checkbox />
            <DropdownListItem :item="{ text: `Long text ${lorem} ${lorem}`, value: 'any value' }" is-selected />
          </div>
        </div>

        <div class="container">
          <h3 class="text-h3 h3">Medium size</h3>
          <div style="border-radius: 6px; border: 1px solid var(--color-div-grey)">
            <DropdownListItem :item="{ text: 'Just item', value: 'any value' }" size="medium" />
            <DropdownListItem :item="{ text: 'Selected item', value: 'any value' }" is-selected size="medium" />
            <DropdownListItem :item="{ text: 'Hovered item (using keyboard)', value: 'any value' }" is-hovered size="medium" />
            <DropdownListItem :item="{ text: 'Checkbox', value: 'any value' }" use-checkbox size="medium" />
            <DropdownListItem :item="{ text: 'Checkbox selected', value: 'any value' }" use-checkbox size="medium" is-selected />
            <DropdownListItem :item="{ text: `Long text ${lorem} ${lorem}`, value: 'any value' }" use-checkbox size="medium" />
            <DropdownListItem :item="{ text: `Long text ${lorem} ${lorem}`, value: 'any value' }" size="medium" is-selected />
          </div>
        </div>
      </div>
      <template #props>
        <PropsDisplay :data="propsDescription" />
      </template>
    </Split>
  </Layout>
</template>

<style scoped>
.ui-select-input-line {
  margin-right: 25px;
}

.h3 {
  margin: 0;
  margin-bottom: 16px;
  font-size: 24px;
  line-height: 24px;
}

.container {
  border-radius: 6px;
  border: 1px solid var(--color-div-grey);
  padding: 16px;
  margin-bottom: 16px;
}
</style>
