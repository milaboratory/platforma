<script lang="ts" setup>
import { reactive } from 'vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import AlphabetType from '@/lib/components/mixcr/AlphabetType.vue';
import AbundanceMeasure from '@/lib/components/mixcr/AbundanceMeasure.vue';
import AbundanceType from '@/lib/components/mixcr/AbundanceType.vue';
import GeneNameFormat from '@/lib/components/mixcr/GeneNameFormat.vue';
import GeneType from '@/lib/components/mixcr/GeneType.vue';

const data = reactive({
  alphabetType: 'AminoAcid' as const,
  abundanceMeasure: 'UMI' as const,
  abundanceType: 'Absolute' as const,
  geneNameFormat: 'Allele' as const,
  geneType: 'V' as const,
});
</script>

<template>
  <layout>
    <split name="Mixcr components">
      <AlphabetType v-model="data.alphabetType" />
      <AbundanceMeasure v-model="data.abundanceMeasure" />
      <AbundanceType v-model="data.abundanceType" />
      <GeneNameFormat v-model="data.geneNameFormat" />
      <GeneType v-model="data.geneType" />
      <GeneType v-model="data.geneType" :only="['V', 'J', 'C']" />
    </split>
  </layout>
</template>
