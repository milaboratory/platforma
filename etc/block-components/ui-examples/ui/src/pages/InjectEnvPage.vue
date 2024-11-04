<script setup lang="ts">
import { getEnvironmentValue } from '@platforma-sdk/model';
import { MaskIcon24, PlBlockPage, PlBtnGhost } from '@platforma-sdk/ui-vue';

const VITE_PLATFORMA_TEST_ENV = getEnvironmentValue('VITE_PLATFORMA_TEST_ENV');
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>Inject env</template>
    <p>
      Launch the desktop application as follows:
      <code>VITE_PLATFORMA_TEST_ENV=some-content npm run dev</code>
    </p>
    <p>Note that all injected variables should start with prefix `VITE_PLATFORMA_`</p>
    VITE_PLATFORMA_TEST_ENV1: {{ VITE_PLATFORMA_TEST_ENV }}
    <PlBtnGhost>
      My filter button
      <template #append>
        <MaskIcon24 name="filter" />
      </template>
    </PlBtnGhost>
  </PlBlockPage>
</template>
