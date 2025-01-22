<script setup lang="ts">
import { PlAlert, PlBlockPage, PlFileInput } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { computed } from 'vue';

const app = useApp();

</script>

<template>
    <PlBlockPage style="max-width: 100%">
        <PlFileInput v-model="app.model.args.inputTgzHandle" label="Select tgz file to import" />
        <PlFileInput v-model="app.model.args.inputZipHandle" label="Select zip file to import" />

        <PlAlert type="success">
            Blob tgz content:
            {{ app.model.outputs.tgz_content }}
        </PlAlert>

        <PlAlert type="success">
            Blob zip content:
            {{ app.model.outputs.zip_content }}
        </PlAlert>

        <PlAlert v-if="app.error" type="error">
            {{ app.error }}
        </PlAlert>

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
        <PlAlert type="error" v-if="app.hasErrors">
            {{ app.model.outputErrors }}
        </PlAlert>

        <iframe title="Frame tgz Example" width="600" height="600" :src="app.model.outputs.tgz_content" />
        <iframe title="Frame zip Example" width="600" height="600" :src="app.model.outputs.zip_content" />
    </PlBlockPage>
</template>
