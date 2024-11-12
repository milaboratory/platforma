<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';
const data = reactive({
  text: '',
  optionalText: '' as string | undefined,
  num: 0,
  optionalNum: 0 as number | undefined
});

const $ = {
  number: (v: string) => {
    const parsed = Number(v);

    if (!Number.isFinite(parsed)) {
      throw Error('Not a number');
    }

    return parsed;
  },
  optionalNumber: (v: string): string | undefined => {
    return v;
  }
};

const clearableUndefined = () => undefined;

const clearableZero = () => 0;
</script>
<template>
  <PlBlockPage style="max-width: 100%">
    <div class="d-flex flex-column gap-16" style="width: 300px">
      <div>Text</div>
      <PlTextField v-model="data.text" placeholder="Text" />

      <div>Optional text (string | undefined)</div>
      <PlTextField v-model="data.optionalText" placeholder="Text" :clearable="clearableUndefined" />

      <div>Password</div>
      <PlTextField v-model="data.text" placeholder="Password" type="password" />

      <div>Number (see focusout effect) + clearable to zero</div>
      <!-- Note: you cannot pass text -->
      <!-- <PlTextField v-model="data.text" placeholder="Number" :parse="$.number" /> -->
      <PlTextField
        v-model="data.num"
        placeholder="Number"
        :parse="$.number"
        :clearable="clearableZero"
      />

      <div>Optional number (number | undefined)</div>
      <PlTextField
        v-model="data.optionalNum"
        placeholder="Number"
        :parse="$.number"
        :clearable="clearableUndefined"
      />

      <PlAlert white-space-pre label="Data">
        {{ JSON.stringify(data, null, 2) }}
      </PlAlert>
    </div>
  </PlBlockPage>
</template>
