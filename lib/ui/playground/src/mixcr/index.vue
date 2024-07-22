<script lang="ts" setup>
import { reactive } from 'vue';
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { AlphabetType, AbundanceMeasure, AbundanceType, GeneNameFormat, GeneType } from '@milaboratory/platforma-uikit.lib';

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
