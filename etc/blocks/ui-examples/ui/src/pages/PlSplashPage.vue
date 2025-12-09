<script setup lang="ts">
import { faker } from '@faker-js/faker';
import {
  PlBlockPage,
  PlBtnGroup,
  PlBtnPrimary,
  PlCheckbox,
  PlContainer,
  PlNumberField,
  PlRow,
  PlSplash,
  PlTextField,
} from '@platforma-sdk/ui-vue';
import type { Ref } from 'vue';
import { computed, reactive, ref } from 'vue';

const lorem1 = faker.lorem.paragraph(5);
const lorem2 = faker.lorem.paragraph(5);
const lorem3 = faker.lorem.paragraph(5);

const form = reactive({
  name: '',
  surname: '',
  agreed: false,
});

const isBodyLoading = ref(false);
const isDefaultLoadingText = ref(true);

const loadingPlaceholderOptions = [
  { label: 'Table', value: 'table' },
  { label: 'Graph', value: 'graph' },
] as const;
const bodyLoadingPlaceholderVariant = ref<
  typeof loadingPlaceholderOptions[number]['value']
>('table');

const isFormLoading = ref(false);

const isParagraphLoading = ref(false);

const loadingDuration = ref(3);

const useFakeLoading = (isLoading: Ref<boolean>) => {
  return () => {
    if (isLoading.value) {
      return;
    }

    isLoading.value = true;
    setTimeout(() => {
      isLoading.value = false;
    }, loadingDuration.value * 1000);
  };
};

const onReloadBody = useFakeLoading(isBodyLoading);
const onReloadForm = useFakeLoading(isFormLoading);
const onReloadParagraph = useFakeLoading(isParagraphLoading);

const bodyLoading = computed(() => {
  if (!isBodyLoading.value) {
    return;
  }
  if (isDefaultLoadingText.value) {
    return bodyLoadingPlaceholderVariant.value;
  }
  return {
    variant: bodyLoadingPlaceholderVariant.value,
    title: 'Loading Title',
    subtitle: Array.from(
      { length: 3 },
      (_, i) => `Loading Subtitle ${i}`,
    ),
  };
});
</script>

<template>
  <PlBlockPage :body-loading>
    <template #title>PlSplash Component</template>
    <template #append>
      <PlBtnGroup
        v-model="bodyLoadingPlaceholderVariant"
        :options="loadingPlaceholderOptions"
      />
      <PlNumberField v-model="loadingDuration" label="Loading Duration" />
      <PlBtnPrimary @click="onReloadBody">Reload page body</PlBtnPrimary>
      <PlCheckbox v-model="isDefaultLoadingText">
        Default loading text
      </PlCheckbox>
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
