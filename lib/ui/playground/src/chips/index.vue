<script lang="ts" setup>
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { PlChip } from '@milaboratory/platforma-uikit.lib';
import ChipsExample from '@/figma/ChipsExample.vue';
import { faker } from '@faker-js/faker';

const longText = faker.lorem.sentence({ min: 10, max: 20 });
function onClose() {
  alert('Close action');
}
</script>

<template>
  <Layout>
    <Split name="Chips">
      <div class="flex-row gap-12">
        <PlChip closeable small @close="onClose">
          {{ longText }}
        </PlChip>
        <PlChip closeable small @close="onClose">Chips</PlChip>
      </div>
      <div class="flex-row gap-12">
        <PlChip closeable @close="onClose">
          {{ longText }}
        </PlChip>
        <PlChip closeable @close="onClose">Chips</PlChip>
      </div>
    </Split>
    <div class="ground">
      <ChipsExample />
    </div>
  </Layout>
</template>
