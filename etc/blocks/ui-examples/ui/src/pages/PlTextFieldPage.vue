<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  text: 'lorem ipsum',
  optionalText: 'optional' as string | undefined,
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
  }
};

const clearableUndefined = () => undefined;

const clearableZero = () => 0;
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <div class="d-flex flex-column gap-16" style="width: 400px">
      <PlTextField v-model="data.text" label="Text" placeholder="Text" />

      <PlTextField
        v-model="data.optionalText"
        label="Optional text (string | undefined)"
        placeholder="Now value is undefined"
        :clearable="clearableUndefined"
      />

      <PlTextField v-model="data.text" label="Password" placeholder="Password" type="password" />

      <PlTextField v-model="data.text" label="Disabled" disabled placeholder="Text" />

      <PlTextField
        v-model="data.text"
        label="Disabled Password"
        disabled
        placeholder="Password"
        type="password"
      />

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
