<script setup lang="ts">
import { faker } from '@faker-js/faker';
import { PlBlockPage, PlBtnPrimary, PlCheckbox, PlContainer, PlRow, PlSplash, PlTextField } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const lorem1 = faker.lorem.paragraph(5);
const lorem2 = faker.lorem.paragraph(5);
const lorem3 = faker.lorem.paragraph(5);

const form = reactive({
  name: '',
  surname: '',
  agreed: false,
});

</script>

<template>
  <PlBlockPage>
    <template #title>PlSplash Component</template>
    <template #append>
      <PlBtnPrimary>Reload page</PlBtnPrimary>
    </template>
    <PlRow>
      <PlContainer width="50%">
        <h3>Form</h3>
        <PlContainer width="400px">
          <PlTextField v-model="form.name" label="Name" />
          <PlTextField v-model="form.surname" label="Surname" />
          <PlCheckbox v-model="form.agreed">I agreed to...</PlCheckbox>
          <PlBtnPrimary>Submit form</PlBtnPrimary>
        </PlContainer>
      </PlContainer>
      <PlContainer width="50%">
        <h3>Title</h3>
        <p>{{ lorem1 }}</p>
        <p>{{ lorem2 }}</p>
        <PlBtnPrimary>Reload the second paragraph</PlBtnPrimary>
        <p>{{ lorem3 }}</p>
      </PlContainer>
    </PlRow>
  </PlBlockPage>
</template>
