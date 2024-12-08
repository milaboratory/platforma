<script setup lang="ts">
import CodeExample from '@app-components/CodeExample.vue';
import ComponentProps from '@app-components/ComponentProps.vue';
import AppCodeBlock from '@app-components/AppCodeBlock.vue';
import {
  LinPlDropdownBasic,
  LinPlDropdownBasicRaw,
  LinPlDropdownBasicTabMode,
  LinPlDropdownBasicTabModeRaw,
} from './examples';
import { reactive } from 'vue';
import AppDocCodeContainer from '@app-components/AppDocCodeContainer.vue';

const data = reactive({
  props: {
    modelValue: {
      type: ': unknown',
      description:
        'Represents the currently selected value. This property is typically used for binding thePlDropdown`s selected value to a data model.',
    },
    disabled: {
      type: '?: boolean',
      description:
        'An optional property that, when set to true, disables thePlDropdown, preventing user interaction.',
    },
    prefix: {
      type: '?: string',
      description:
        'An optional prefix that can be displayed before thePlDropdown value, adding context or description.',
    },
    options: {
      type: ': Option[]',
      description:
        'An array of option objects that define the selectable items in thePlDropdown. Each option should include a value and a label to display.',
    },
    placeholder: {
      type: '?: string',
      description:
        'An optional placeholder text that is displayed when no option is selected, guiding the user on what to do.',
    },
    mode: {
      type: '?: "list" | "tabs"',
      description:
        'An optional property that determines the mode of thePlDropdown items. When set to "list", items are displayed in a standardPlDropdown list. When set to "tabs", items are displayed as tabs, providing a different visual and interaction style.',
    },
    tabsContainerStyles: {
      type: '?: StyleValue',
      description:
        'An optional property that allows custom styling for the tabs container when the mode is set to "tabs".',
    },
    clearable: {
      type: '?: boolean',
      description:
        'An optional property that, when set to true, allows the user to clear the selected value, resetting thePlDropdown to its placeholder state.',
    },
  },
});
</script>
<template>
  <AppDocCodeContainer>
    <CodeExample :code="LinPlDropdownBasicRaw">
      <template #name>Basic usage</template>
      <LinPlDropdownBasic />
    </CodeExample>
    <ComponentProps :data="data.props" />
    <AppCodeBlock>
      <CodeExample :code="LinPlDropdownBasicTabModeRaw">
        <template #name>Tab mode</template>
        <LinPlDropdownBasicTabMode />
      </CodeExample>
    </AppCodeBlock>
  </AppDocCodeContainer>
</template>
