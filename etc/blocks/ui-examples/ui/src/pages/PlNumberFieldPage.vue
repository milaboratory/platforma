<script setup lang="ts">
import {
  PlRow,
  PlContainer,
  PlCheckbox,
  PlNumberField,
  PlBlockPage,
} from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  useIncrementButtons: true,
  updateOnEnterOrClickOutside: false,
  number: 100,
});
</script>

<template>
  <PlBlockPage>
    <template #title>PlNumberField</template>
    <pre>number: {{ data.number }} {{ typeof data.number }}</pre>
    <PlRow>
      <PlCheckbox v-model="data.useIncrementButtons">Use increment buttons</PlCheckbox>
      <PlCheckbox v-model="data.updateOnEnterOrClickOutside">Update on enter or click outside</PlCheckbox>
      <button @click="data.number += 1">Increment number</button>
      <button @click="data.number -= 1">Decrement number</button>
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
          :update-on-enter-or-click-outside="data.updateOnEnterOrClickOutside"
          :use-increment-buttons="data.useIncrementButtons"
        />
        <PlNumberField
          v-model="data.number"
          :min-value="-5"
          :max-value="200"
          label="PlNumberField (min: -5, max: 200)"
          :update-on-enter-or-click-outside="data.updateOnEnterOrClickOutside"
          :use-increment-buttons="data.useIncrementButtons"
        />
        <PlNumberField
          v-model="data.number"
          :max-value="100"
          label="PlNumberField (max: 100 and validate is even)"
          :validate="v => v % 2 === 0 ? undefined : 'Value must be even'"
          :update-on-enter-or-click-outside="data.updateOnEnterOrClickOutside"
          :use-increment-buttons="data.useIncrementButtons"
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
