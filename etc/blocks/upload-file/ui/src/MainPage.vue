<script setup lang="ts">
import { PlAlert, PlBlockPage, PlFileInput } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { computed } from 'vue';

const app = useApp();
</script>

<template>
    <PlBlockPage style="max-width: 100%">
        inputHandle: {{ app.model.args.inputHandle }}
        <PlFileInput v-model="app.model.args.inputHandle" label="Select file to import" />

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
