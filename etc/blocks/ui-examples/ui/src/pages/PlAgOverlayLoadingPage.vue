<script setup lang="ts">
import {
  PlBlockPage,
  PlAgOverlayLoading,
} from '@platforma-sdk/ui-vue';
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlAgOverlayLoading :params="{ notReady: false, message: 'Test' }" />
  </PlBlockPage>
</template>
