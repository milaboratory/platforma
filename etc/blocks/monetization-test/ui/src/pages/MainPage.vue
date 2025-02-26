<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField } from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import { computed, reactive } from 'vue';

const app = useApp();

const commandToMonetize = computed({
  get: () => app.model.args.commandToMonetize.join(','),
  set: (val: string) => {
    console.log(val.split(","))
    app.model.args.commandToMonetize = val.split(',')
  }
})

const parsedToken = computed({
  get: () => {
    const splitted = app.model.outputs.stdout?.split('.') ?? [];
    const data = splitted[1];
    return JSON.parse(atob(data));
  },
  set: () => {}
})

</script>

<template>
  <PlBlockPage>

    <PlTextField v-model="app.model.args.productKey"
      label="Enter product key (keep MIFAKEMIFAKEMIFAKE for fake product)" clearable />

    <PlTextField v-model="commandToMonetize"
      label="Enter command to monetize (separate args by comma and use $PLATFORMA_MNZ_JWT for the token)" clearable />

    <!-- <PlFileInput v-model="app.model.args.inputHandle" label="Select file to import" /> -->

    <PlAlert label="pre-run info" v-if="app.model.outputs.info">
      <pre> {{ JSON.stringify(app.model.outputs.info, undefined, 2) }} </pre>
    </PlAlert>

    <PlAlert label="stdout of the command" v-if="app.model.outputs.stdout"> {{ app.model.outputs.stdout }}
    </PlAlert>

    <PlAlert label="trying to parse a token" v-if="app.model.outputs.stdout">
      <pre> {{ JSON.stringify(parsedToken, null, 2) }} </pre>
    </PlAlert>


    <!-- <PlAlert type="success" label="resulted token" v-if="app.model.outputs.token"> {{ app.model.outputs.token }}
    </PlAlert> -->

  </PlBlockPage>
</template>
