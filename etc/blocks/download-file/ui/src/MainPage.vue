<script setup lang="ts">
import { PlAlert, PlBlockPage, PlFileInput } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { computed } from 'vue';
import { computedAsync } from '@vueuse/core';
import { getRawPlatformaInstance } from '@platforma-sdk/model';

const app = useApp();

const progress = computed(() => {
  const handle = app.snapshot.outputs.handle;

  if (!handle)
    return undefined;

  if (!handle.ok)
    return undefined;

  return handle.value;
});

const onDemandContent = computedAsync(async () => {
  const handle = app.snapshot.outputs.onDemandBlobContent;
  if (!handle) {
    return undefined;
  }
  if (!handle.ok) {
    return undefined;
  }

  const content = await getRawPlatformaInstance().blobDriver.getContent(handle.value.handle);
  if (!content) {
    return undefined;
  }

  return new TextDecoder().decode(content);
});

const onDemandContent1 = computedAsync(async () => {
  const handle = app.snapshot.outputs.onDemandBlobContent1;
  if (!handle) {
    return undefined;
  }
  if (!handle.ok) {
    return undefined;
  }
  if (!handle.value) {
    return undefined;
  }

  const content = await getRawPlatformaInstance().blobDriver.getContent(handle.value.handle);
  if (!content) {
    return undefined;
  }

  return new TextDecoder().decode(content);
});

const onDemandRangeContent = computedAsync(async () => {
  const handle = app.snapshot.outputs.onDemandBlobContent;
  if (!handle) {
    return undefined;
  }
  if (!handle.ok) {
    return undefined;
  }
  if (!handle.value) {
    return undefined;
  }

  const content = await getRawPlatformaInstance().blobDriver.getContent(
    handle.value.handle, { from: 1, to: 2 },
  );
  if (!content) {
    return undefined;
  }

  return new TextDecoder().decode(content);
});

const onDemandRangeContent1 = computedAsync(async () => {
  const handle = app.snapshot.outputs.onDemandBlobContent1;
  if (!handle) {
    return undefined;
  }
  if (!handle.ok) {
    return undefined;
  }
  if (!handle.value) {
    return undefined;
  }

  const content = await getRawPlatformaInstance().blobDriver.getContent(
    handle.value.handle, { from: 1, to: 2 },
  );
  if (!content) {
    return undefined;
  }

  return new TextDecoder().decode(content);
});

</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlFileInput v-model="app.model.args.inputHandle" label="Select file to import" :progress="progress" />

    <PlAlert type="success">
      File content:
      {{ app.model.outputs.content }}
    </PlAlert>

    <PlAlert type="success">
      File content as string:
      {{ app.model.outputs.contentAsString }}
    </PlAlert>

    <PlAlert type="success">
      File content as string via QuickJS callback:
      {{ app.model.outputs.contentAsString1 }}
    </PlAlert>

    <PlAlert type="success">
      File content as json:
      {{ app.model.outputs.contentAsJson }}
    </PlAlert>

    <PlAlert type="success">
      File content as downloaded blob content:
      {{ app.model.outputs.downloadedBlobContent }}
    </PlAlert>

    <PlAlert type="success">
      File content as on demand blob content with Content:
      {{ onDemandContent }}
    </PlAlert>

    <PlAlert type="success">
      Get on demand blob content via QuickJS callback with Content:
      {{ onDemandContent1 }}
    </PlAlert>

    <PlAlert type="success">
      Get on demand blob content with Content Range:
      {{ onDemandRangeContent }}
    </PlAlert>

    <PlAlert type="success">
      Get on demand blob content via QuickJS callback with Content Range:
      {{ onDemandRangeContent1 }}
    </PlAlert>

    <PlAlert type="success">
      File content via QuickJS callback:
      {{ app.model.outputs.getFileHandle }}
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
    <PlAlert v-if="app.hasErrors" type="error">
      {{ app.model.outputErrors }}
    </PlAlert>
  </PlBlockPage>
</template>
