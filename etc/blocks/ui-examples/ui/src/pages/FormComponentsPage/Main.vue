<script setup lang="ts">
import {
  PlRow,
  PlContainer,
  PlBtnGroup,
  PlCheckboxGroup,
  PlCheckbox,
  PlTextField,
  PlSectionSeparator,
  PlDropdown,
  listToOptions,
  PlMaskIcon16,
  PlAccordion,
  PlAccordionSection,
  PlDropdownMulti,
} from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  text: 'some text',
  single: 'A',
  multiple: ['A', 'B'],
  multiple2: ['B', 'A', 'D'],
  importHandles: [] as unknown[],
  currentTab: 'one',
  compactBtnGroup: false,
  multipleAccordion: false,
  indeterminateCheckboxValue: false,
  indeterminateCheckboxIsIndeterminate: true,
});

const shortOptions = listToOptions(['A', 'B', 'C', 'D']);
const options = listToOptions(['A', 'B', 'C', 'D', 'Lorem ipsum', 'Lorem ipsum dolor sit amet', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.']);

</script>

<template>
  <PlRow no-gap>
    <PlContainer width="400px">
      <PlBtnGroup
        v-model="data.single"
        label="PlBtnGroup"
        :options="shortOptions"
        :compact="data.compactBtnGroup"
      />
      <PlCheckbox v-model="data.compactBtnGroup">Compact btn group component</PlCheckbox>
      <PlTextField v-model="data.text" label="PlTextField" clearable />
      <PlTextField v-model="data.text" label="PlTextField (password)" type="password" clearable />
      <PlDropdown v-model="data.single" label="PlDropdown" :options="options" />
      <PlDropdownMulti v-model="data.multiple" label="PlDropdownMulti" :options="options" />
      <PlDropdownMulti v-model="data.multiple2" label="PlDropdownMulti (multiple2)" :options="options" />
      <PlSectionSeparator>Group name</PlSectionSeparator>
      <PlTextField v-model="data.text" label="PlTextField" />
      <PlDropdown v-model="data.single" label="PlDropdown" :options="options" />
      <PlCheckbox v-model="data.indeterminateCheckboxIsIndeterminate">Make checkbox below indeterminate</PlCheckbox>
      <PlCheckbox
        :model-value="data.indeterminateCheckboxValue"
        :indeterminate="data.indeterminateCheckboxIsIndeterminate"
        @update:model-value="() => {
          data.indeterminateCheckboxValue = !data.indeterminateCheckboxValue;
          data.indeterminateCheckboxIsIndeterminate = false;
        }"
      >
        Indeterminate checkbox demo (checked: {{ data.indeterminateCheckboxValue }})
      </PlCheckbox>
      <PlCheckboxGroup v-model="data.multiple" label="PlCheckboxGroup" :options="options" />
      <PlSectionSeparator>
        <PlMaskIcon16 name="chevron-right" />Slot usage<PlMaskIcon16 name="chevron-left" />
      </PlSectionSeparator>
    </PlContainer>
    <div style="width: 1px; background-color: var(--border-color-div-grey)" />
    <PlContainer width="400px" style="margin: 0 24px 0 24px">
      <PlAccordionSection label="Section 1">
        <span>Section content</span>
      </PlAccordionSection>
      <PlAccordionSection label="Section 2">
        <PlTextField v-model="data.text" label="Additional text field" clearable />
        <PlDropdown v-model="data.single" label="Additional PlDropdown" :options="options" />
      </PlAccordionSection>
      <PlAccordionSection label="Section 3">
        <PlTextField v-model="data.text" label="Additional text field" clearable />
        <PlDropdown v-model="data.single" label="Additional PlDropdown" :options="options" />
      </PlAccordionSection>

      <PlCheckbox v-model="data.multipleAccordion">
        Allow multiple accordion sections to be opened at the same time
      </PlCheckbox>
      <PlSectionSeparator>Accordion group</PlSectionSeparator>
      <PlAccordion :multiple="data.multipleAccordion">
        <PlAccordionSection label="Section 1">
          <PlTextField v-model="data.text" label="Additional text field" clearable />
          <PlDropdown v-model="data.single" label="Additional PlDropdown" :options="options" />
        </PlAccordionSection>
        <PlAccordionSection label="Section 2">
          <PlTextField v-model="data.text" label="Additional text field" clearable />
          <PlDropdown v-model="data.single" label="Additional PlDropdown" :options="options" />
        </PlAccordionSection>
      </PlAccordion>
    </PlContainer>
  </PlRow>
</template>

<style module>
/* :global(.pl-container) {
  outline: 1px dotted #eee;
}

:global(.pl-section-separator) {
  outline: 1px dashed #eee;
} */

.components pre {
  border: 1px solid var(--txt-01);
  padding: 12px;
  font-weight: bolder;
  overflow: auto;
  max-width: 50vw;
  background-color: #eeeeee55;
}
</style>
