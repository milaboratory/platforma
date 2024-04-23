<script lang="ts" setup>
import { reactive } from 'vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import AlphabetType from '@/lib/components/AlphabetType.vue';
import AbundanceMeasure from '@/lib/components/AbundanceMeasure.vue';

const data = reactive({
  alphabetType: 'AminoAcid' as const,
  abundance: 'UMI' as const,
});
</script>

<template>
  <layout>
    <split name="Mixcr components">
      <AlphabetType v-model="data.alphabetType" />
      <AbundanceMeasure v-model="data.abundance" />
    </split>
  </layout>
</template>
