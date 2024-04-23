<script lang="ts" setup>
import { reactive } from 'vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import AlphabetType from '@/lib/components/AlphabetType.vue';

const data = reactive({
  value: 'AminoAcid' as const,
});
</script>

<template>
  <layout>
    <split name="Mixcr components">
      <AlphabetType v-model="data.value" />
    </split>
  </layout>
</template>
