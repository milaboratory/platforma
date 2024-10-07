<script setup lang="ts">
import { faker } from '@faker-js/faker';
import { listToOptions } from '@milaboratories/helpers';
import type { ImportFileHandle } from '@platforma-sdk/model';
import {
  PlBlockPage,
  PlTextField,
  PlSlideModal,
  PlBtnPrimary,
  PlCheckbox,
  PlContainer,
  PlBtnSecondary,
  PlDropdown,
  PlDialogModal,
  PlRow,
  PlFileInput
} from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  text: '',
  item: '',
  dialogModal: false,
  slideModal: false,
  title: false,
  actions: false,
  shadow: false,
  closeOnOutsideClick: true,
  fileHandle: undefined as ImportFileHandle | undefined,
  dialogWidth: '448px', // default
  sliderWidth: '368px' // default and min
});

const lorem = faker.lorem.paragraph();
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>Modals</template>
    <PlContainer width="200px" @click.stop>
      <PlRow>
        <PlBtnPrimary @click.stop="data.dialogModal = true">Open PlDialogModal</PlBtnPrimary>
        <PlBtnPrimary @click.stop="data.slideModal = true">Open PlSlideModal</PlBtnPrimary>
        <PlFileInput v-model="data.fileHandle" label="Click me" />
        <PlTextField :model-value="'aaaa'" />
        <PlDropdown :model-value="1" :options="[]" />
      </PlRow>
      <PlCheckbox v-model="data.shadow">Show shadow</PlCheckbox>
      <PlCheckbox v-model="data.closeOnOutsideClick">Close on outside click</PlCheckbox>
      <template v-if="data.slideModal">
        <PlCheckbox v-model="data.title">Show title</PlCheckbox>
        <PlCheckbox v-model="data.actions">Show actions</PlCheckbox>
      </template>
    </PlContainer>

    <!--Dialog modal-->
    <PlDialogModal v-model="data.dialogModal" :width="data.dialogWidth">
      <template v-if="data.title" #title>My title</template>
      <PlCheckbox v-model="data.title">Show title</PlCheckbox>
      <PlCheckbox v-model="data.actions">Show actions</PlCheckbox>
      <PlTextField v-model="data.dialogWidth" label="Dialog width (css format: px, %)" />
      <template v-if="data.actions" #actions>
        <PlBtnPrimary>Save</PlBtnPrimary>
        <PlBtnSecondary>Cancel</PlBtnSecondary>
      </template>
    </PlDialogModal>

    <!--Slide Modal-->
    <PlSlideModal
      v-model="data.slideModal"
      :close-on-outside-click="data.closeOnOutsideClick"
      :shadow="data.shadow"
      :width="data.sliderWidth"
    >
      <template v-if="data.title" #title>My title</template>
      <PlTextField v-model="data.text" label="Text field" />
      <PlDropdown
        v-model="data.item"
        :options="listToOptions(['Item 1', 'Item 2', 'Item 3'])"
      ></PlDropdown>
      <PlCheckbox v-model="data.slideModal">Also closes the modal window</PlCheckbox>
      <p>{{ lorem }}</p>
      <PlTextField v-model="data.sliderWidth" label="Slider width (css format: px, %)" />
      <template v-if="data.actions" #actions>
        <PlBtnPrimary>Save</PlBtnPrimary>
        <PlBtnSecondary>Cancel</PlBtnSecondary>
      </template>
    </PlSlideModal>
  </PlBlockPage>
</template>
