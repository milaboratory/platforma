<script setup lang="ts">
import { PlAlert, PlBlockPage, PlFileInput } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { computed } from 'vue';

const app = useApp();

const progress = computed(() => {
    const handle = app.snapshot.outputs.handle;

    if (!handle) return undefined;

    if (!handle.ok) return undefined;

    return handle.value;
})
</script>

<template>
    <PlBlockPage style="max-width: 100%">
        <PlFileInput v-model="app.model.args.inputHandle" label="Select file to import" :progress="progress" />

        <PlAlert type="success">
            Blob content:
            {{ app.model.outputs.blob }}
        </PlAlert>

        <PlAlert type="success">
            Blob content:
            {{ app.model.outputs.blob }}
        </PlAlert>

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
            {{ app.model.outputs }}
        </PlAlert>
        <PlAlert type="info" monospace>
            outputs:
            {{ app.model.outputs }}
        </PlAlert>
        <PlAlert type="error" v-if="app.hasErrors">
            {{ app.model.outputErrors }}
        </PlAlert>
    </PlBlockPage>
</template>
