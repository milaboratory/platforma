<script setup lang="ts">
import { PlRow, PlContainer, PlCheckbox, PlNumberField, PlBlockPage } from "@platforma-sdk/ui-vue";
import { reactive } from "vue";

const data = reactive({
  number: 100,
  disableSteps: false,
});

function updateNumber(value: number) {
  if (data.number == null || Number.isNaN(data.number)) {
    data.number = 0;
  }
  data.number += value;
}
</script>

<template>
  <PlBlockPage>
    <template #title>PlNumberField</template>
    <pre>number: {{ data.number }} {{ typeof data.number }}</pre>
    <PlRow>
      <PlCheckbox v-model="data.disableSteps">Disable increment buttons</PlCheckbox>
      <button @click="updateNumber(1)">Increment number</button>
      <button @click="updateNumber(-1)">Decrement number</button>
      <button @click="data.number = NaN">Set NaN</button>
      <button @click="data.number = 102">Set 102</button>
      <button @click="data.number = '102.2aaaa' as unknown as number">Set '102.2aaaa'</button>
    </PlRow>
    <PlRow no-gap>
      <PlContainer width="400px">
        <PlNumberField
          v-model="data.number"
          :min-value="10"
          :max-value="100"
          label="PlNumberField (min: 10, max: 100)"
          clearable
          :disable-steps="data.disableSteps"
        />
        <PlNumberField
          v-model="data.number"
          :min-value="-5"
          :max-value="200"
          label="PlNumberField (min: -5, max: 200)"
          :clearable="() => undefined"
          :disable-steps="data.disableSteps"
        />
        <PlNumberField
          v-model="data.number"
          :max-value="100"
          label="PlNumberField (max: 100 and validate is even)"
          :validate="(v) => (v % 2 === 0 ? undefined : 'Value must be even')"
          :clearable="() => 33"
          :disable-steps="data.disableSteps"
        />
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
