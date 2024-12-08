<script lang="ts" setup>
import { Basic, BasicRaw } from './examples';
import CodeExample from '@app-components/CodeExample.vue';
import ComponentProps from '@app-components/ComponentProps.vue';
import AppCodeBlock from '@app-components/AppCodeBlock.vue';
import { reactive } from 'vue';
import AppDocCodeContainer from '@app-components/AppDocCodeContainer.vue';

const propsData = reactive({
  props: {
    modelValue: {
      type: 'boolean',
      description: 'The current boolean value of the checkbox.',
    },
    disabled: {
      type: 'boolean',
      description: 'If `true`, the checkbox is disabled and cannot be interacted with.',
    },
  },

  events: {
    'update:modelValue': 'A boolean is emitted when the model value is updated',
  },

  slots: {
    default: 'The default slot is intended for label text.',
  },
});
</script>

<template>
  <AppDocCodeContainer>
    <AppCodeBlock>
      <template #description> It is a component for manipulating a boolean value </template>
      <CodeExample :code="BasicRaw">
        <template #name>Basic usage</template>
        <Basic />
      </CodeExample>
    </AppCodeBlock>
    <ComponentProps :data="propsData.props" :events="propsData.events" :slots="propsData.slots" />
  </AppDocCodeContainer>
</template>
