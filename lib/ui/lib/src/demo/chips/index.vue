<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import Chip from '@/lib/components/Chip.vue';
import Split from '@/demo/Split.vue';
import ChipsExample from '@/demo/figma/ChipsExample.vue';
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
