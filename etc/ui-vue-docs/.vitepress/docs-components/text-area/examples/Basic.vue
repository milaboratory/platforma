<script setup lang="ts">
import { faker } from '@faker-js/faker';
import { PlTextArea } from '@platforma-sdk/ui-vue';
import { ref } from 'vue';

const model = ref(faker.lorem.paragraph());
</script>

<template>
  <PlTextArea
    v-model="model"
    :rows="3"
    label="Basic"
    required
    placeholder="Enter text"
  />

  <PlTextArea
    v-model="model"
    :rows="3"
    label="Disabled"
    disabled
    placeholder="Enter text"
  />

  <PlTextArea
    v-model="model"
    :rows="3"
    label="Readonly"
    readonly
    placeholder="Enter text"
  />

  <PlTextArea
    v-model="model"
    :rows="3"
    label="Auto grow"
    autogrow
    placeholder="Enter text"
  />
</template>
