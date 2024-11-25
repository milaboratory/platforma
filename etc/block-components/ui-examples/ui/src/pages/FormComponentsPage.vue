<script setup lang="ts">
import {
  PlBlockPage,
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
  PlAccordionSection
} from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  text: 'some text',
  single: 'A',
  multiple: ['A', 'B'],
  importHandles: [] as unknown[],
  currentTab: 'one',
  compactBtnGroup: false,
  multipleAccordion: false
});

const options = listToOptions(['A', 'B', 'C', 'D']);
</script>

<template>
  <PlBlockPage :class="$style.components" style="max-width: 100%">
    <template #title>Form components</template>
    <PlRow>
      <PlContainer width="400px">
        <PlBtnGroup
          v-model="data.single"
          label="PlBtnGroup"
          :options="options"
          :compact="data.compactBtnGroup"
        />
        <PlCheckbox v-model="data.compactBtnGroup">Compact btn group component</PlCheckbox>
        <PlTextField v-model="data.text" label="PlTextField" clearable />
        <PlDropdown v-model="data.single" label="PlDropdown" :options="options" />
        <PlSectionSeparator>Group name</PlSectionSeparator>
        <PlTextField v-model="data.text" label="PlTextField" />
        <PlDropdown v-model="data.single" label="PlDropdown" :options="options" />
        <PlCheckboxGroup v-model="data.multiple" label="PlCheckboxGroup" :options="options" />
        <PlSectionSeparator>
          <PlMaskIcon16 name="chevron-right" />Slot usage<PlMaskIcon16 name="chevron-left" />
        </PlSectionSeparator>
      </PlContainer>
      <PlContainer width="400px">
        <PlAccordionSection label="Section 1">
          <PlTextField v-model="data.text" label="Additional text field" clearable />
          <PlDropdown v-model="data.single" label="Additional PlDropdown" :options="options" />
        </PlAccordionSection>
        <PlAccordionSection label="Section 2">
          <PlTextField v-model="data.text" label="Additional text field" clearable />
          <PlDropdown v-model="data.single" label="Additional PlDropdown" :options="options" />
        </PlAccordionSection>
        <PlAccordionSection label="Section 3">
          <PlTextField v-model="data.text" label="Additional text field" clearable />
          <PlDropdown v-model="data.single" label="Additional PlDropdown" :options="options" />
        </PlAccordionSection>

        <PlCheckbox v-model="data.multipleAccordion"
          >Allow multiple accordion sections to be opened at the same time</PlCheckbox
        >
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
  </PlBlockPage>
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
