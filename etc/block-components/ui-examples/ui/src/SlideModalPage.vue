<script setup lang="ts">
import { faker } from '@faker-js/faker';
import { listToOptions } from '@milaboratories/helpers';
import { PlBlockPage, PlTextField, PlSlideModal, PlBtnPrimary, PlCheckbox, PlContainer, PlBtnSecondary, PlDropdown } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  text: '',
  item: '',
  isModalOpen: false,
  title: false,
  actions: false,
  shadow: false,
  closeOnOutsideClick: true,
});

const lorem = faker.lorem.paragraph();
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlSlideModal</template>
    <PlContainer width="200px" @click.stop>
      <PlBtnPrimary @click.stop="data.isModalOpen = true">Open modal</PlBtnPrimary>
      <PlCheckbox v-model="data.shadow">Show shadow</PlCheckbox>
      <PlCheckbox v-model="data.closeOnOutsideClick">Close on outside click</PlCheckbox>
      <template v-if="data.isModalOpen">
        <PlCheckbox v-model="data.title">Show title</PlCheckbox>
        <PlCheckbox v-model="data.actions">Show actions</PlCheckbox>
      </template>
    </PlContainer>
    <PlSlideModal :close-on-outside-click="data.closeOnOutsideClick" :shadow="data.shadow" v-model="data.isModalOpen">
      <template v-if="data.title" #title>My title</template>
      <PlTextField label="Text field" v-model="data.text" />
      <PlDropdown v-model="data.item" :options="listToOptions(['Item 1', 'Item 2', 'Item 3'])"></PlDropdown>
      <PlCheckbox v-model="data.isModalOpen">Also closes the modal window</PlCheckbox>
      <p>{{ lorem }}</p>
      <template v-if="data.actions" #actions>
        <PlBtnPrimary>Save</PlBtnPrimary>
        <PlBtnSecondary>Cancel</PlBtnSecondary>
      </template>
    </PlSlideModal>
  </PlBlockPage>
</template>
