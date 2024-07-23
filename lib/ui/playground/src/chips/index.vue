<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { Chip } from '@milaboratory/platforma-uikit.lib';
import Split from '@/Split.vue';
import ChipsExample from '@/figma/ChipsExample.vue';
import { faker } from '@faker-js/faker';

const longText = faker.lorem.sentence({ min: 10, max: 20 });
function onClose() {
  alert('Close action');
}
</script>

<template>
  <layout>
    <split name="Chips">
      <div class="flex-row gap-12">
        <chip closeable small @close="onClose">
          {{ longText }}
        </chip>
        <chip closeable small @close="onClose">Chips</chip>
      </div>
      <div class="flex-row gap-12">
        <chip closeable @close="onClose">
          {{ longText }}
        </chip>
        <chip closeable @close="onClose">Chips</chip>
      </div>
    </split>
    <div class="ground">
      <chips-example />
    </div>
  </layout>
</template>
