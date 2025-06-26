<script setup lang="ts">
import { PlBlockPage, PlFileInput } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const props = reactive({
  model: undefined,
});

</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <div class="d-flex flex-column gap-16" style="width: 400px">
      <h2>Errors</h2>
      <PlFileInput
        v-model="props.model"
        :extensions="['txt']"
        error="Error as string"
      />
      <PlFileInput
        v-model="props.model"
        :extensions="['txt']"
        :error="{ message: 'error as object' }"
      />
      <PlFileInput
        v-model="props.model"
        :extensions="['txt']"
        :error="new Error('error as class')"
      />
      <PlFileInput
        v-model="props.model"
        :extensions="['txt']"
        :error="{ unknown: 'error as unknown entity' }"
      />
    </div>
  </PlBlockPage>
</template>
