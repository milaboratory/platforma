<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField, PlFileInput } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { computed, reactive } from 'vue';

const app = useApp();

const progress = computed(() => {
  if (!app.outputs.handle) return undefined;

  if (!app.outputs.handle.ok) return undefined;

  return app.outputs.handle.value;
});
</script>

<template>
    <PlBlockPage style="max-width: 100%">
        <PlFileInput v-model="app.model.args.inputHandle" label="Select file to import" :progress="progress" />

        <PlTextField v-model="app.model.args.readFileWithSleepArgs"
            label="Write arguments splitted by comma (no spaces)" />

        <PlAlert type="success"> Last Logs: {{ app.model.outputs.lastLogs }} </PlAlert>

        <PlAlert type="success"> Progress Log: {{ app.model.outputs.progressLog }} </PlAlert>

        <PlAlert type="success"> Log Handle: {{ app.model.outputs.logHandle }} </PlAlert>

        <PlAlert v-if="app.error" type="error">
            {{ app.error }}
        </PlAlert>
        <fieldset>
            <legend>Args (app.snapshot.args)</legend>
            {{ app.snapshot.args }}
        </fieldset>
        <fieldset>
            <legend>Args (app.model.args)</legend>
            {{ app.model.args }}
        </fieldset>
        <h3>app.model</h3>
        <code>{{ app.model }}</code>
        <PlAlert type="info" monospace>
            outputValues:
            {{ app.outputValues }}
        </PlAlert>
        <PlAlert type="info" monospace>
            outputs:
            {{ app.model.outputs }}
        </PlAlert>
        <PlAlert type="error" v-if="app.hasErrors">
            {{ app.outputErrors }}
        </PlAlert>
    </PlBlockPage>
</template>
