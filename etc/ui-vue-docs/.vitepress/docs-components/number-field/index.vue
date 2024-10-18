<script setup lang="ts">
import CodeExample from '@app-components/CodeExample.vue';
import ComponentProps from '@app-components/ComponentProps.vue';
import {
  NumberFieldExemple,
  NumberFieldExempleRaw,
  NumberFieldDisabled,
  NumberFieldDisabledRaw,
  NumberFieldMinMax,
  NumberFieldMinMaxRaw,
  NumberFieldStep,
  NumberFieldStepRaw
} from './examples';
import { reactive } from 'vue';
import AppDocCodeContainer from '@app-components/AppDocCodeContainer.vue';

const data = reactive({
  props: {
    modelValue: {
      type: ': number | undefined',
      description:
        'The modelValue property represents the numeric value of the input field. It can be bound to a variable in the parent component using v-model for two-way data binding. If undefined, the field will be empty.'
    },
    disabled: {
      type: '?: boolean',
      description:
        'The disabled property is a boolean that, when set to true, disables the input field, preventing user interaction. This is useful for read-only scenarios or when a field should not be editable under certain conditions.'
    },
    label: {
      type: '?: string',
      description:
        'The label property specifies a text label for the input field, providing context and improving accessibility. This label is typically displayed above or beside the input field.'
    },
    placeholder: {
      type: '?: string',
      description:
        'The placeholder property defines a short hint displayed in the input field before the user enters a value. It guides the user on what type of data is expected.'
    },
    step: {
      type: '?: number',
      description:
        'The step property specifies the interval between valid values in the input field. It is useful for incrementing or decrementing the value in fixed steps, such as 1, 0.1, or any other interval.'
    },
    minValue: {
      type: '?: number',
      description:
        'The minValue property sets the minimum acceptable value for the input field. This restricts the user from entering a number lower than the specified minimum.'
    },
    maxValue: {
      type: '?: number',
      description:
        'The maxValue property sets the maximum acceptable value for the input field. This restricts the user from entering a number higher than the specified maximum.'
    },
    errorMessage: {
      type: '?: string',
      description:
        // eslint-disable-next-line quotes
        "The errorMessage property allows displaying a custom error message when the input value is invalid or doesn't meet specific criteria. This enhances user feedback and validation."
    }
  }
});
</script>
<template>
  <AppDocCodeContainer>
    <CodeExample :code="NumberFieldExempleRaw">
      <template #name>Basic usage</template>
      <NumberFieldExemple />
    </CodeExample>

    <ComponentProps :data="data.props" />

    <CodeExample :code="NumberFieldDisabledRaw">
      <template #name>Disabled</template>
      <NumberFieldDisabled />
    </CodeExample>

    <CodeExample :code="NumberFieldMinMaxRaw">
      <template #name>Min and max values</template>
      <NumberFieldMinMax />
    </CodeExample>

    <CodeExample :code="NumberFieldStepRaw">
      <template #name>Step</template>
      <NumberFieldStep />
    </CodeExample>
  </AppDocCodeContainer>
</template>
