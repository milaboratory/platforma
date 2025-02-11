<script setup lang="ts">
import { faker } from '@faker-js/faker';
import { PlBlockPage, PlBtnPrimary, PlCheckbox, PlContainer, PlRow, PlSplash, PlTextField } from '@platforma-sdk/ui-vue';
import type { Ref } from 'vue';
import { reactive, ref } from 'vue';

const lorem1 = faker.lorem.paragraph(5);
const lorem2 = faker.lorem.paragraph(5);
const lorem3 = faker.lorem.paragraph(5);

const form = reactive({
  name: '',
  surname: '',
  agreed: false,
});

const isBodyLoading = ref(false);

const isFormLoading = ref(false);

const isParagraphLoading = ref(false);

const useFakeLoading = (isLoading: Ref<boolean>) => {
  return () => {
    if (isLoading.value) {
      return;
    }

    isLoading.value = true;
    setTimeout(() => {
      isLoading.value = false;
    }, 3000);
  };
};

const onReloadBody = useFakeLoading(isBodyLoading);
const onReloadForm = useFakeLoading(isFormLoading);
const onReloadParagraph = useFakeLoading(isParagraphLoading);
</script>

<template>
  <PlBlockPage :body-loading="isBodyLoading" body-loading-text="Page Loading">
    <template #title>PlSplash Component</template>
    <template #append>
      <PlBtnPrimary @click="onReloadBody">Reload page body</PlBtnPrimary>
    </template>
    <PlRow>
      <PlContainer width="50%">
        <PlContainer :loading="isFormLoading" loading-text="Form is loading" width="400px">
          <h3>Form</h3>
          <PlTextField v-model="form.name" label="Name" />
          <PlTextField v-model="form.surname" label="Surname" />
          <PlCheckbox v-model="form.agreed">I agreed to...</PlCheckbox>
          <PlBtnPrimary @click="onReloadForm">Submit form</PlBtnPrimary>
        </PlContainer>
      </PlContainer>
      <PlContainer width="50%">
        <h3>Title</h3>
        <p>{{ lorem1 }}</p>
        <PlSplash :loading="isParagraphLoading">
          <p>{{ lorem2 }}</p>
        </PlSplash>
        <PlBtnPrimary @click="onReloadParagraph">Reload the second paragraph</PlBtnPrimary>
        <p>{{ lorem3 }}</p>
      </PlContainer>
    </PlRow>
  </PlBlockPage>
</template>
