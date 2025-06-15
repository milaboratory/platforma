<script setup lang="ts">
import {
  PlMaskIcon24,
  PlMaskIcon16,
  PlIcon16,
  PlIcon24,
  PlBlockPage,
  PlBtnGhost,
  maskIcons16,
  maskIcons24,
  PlRow,
  PlTooltip,
} from '@platforma-sdk/ui-vue';
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>Icons/Masks page</template>

    <h4>PlIcon16</h4>

    <PlRow wrap>
      <PlTooltip v-for="(name, i) of maskIcons16" :key="i">
        <PlIcon16 :name="name" />
        <template #tooltip> icon-16 icon-{{ name }} </template>
      </PlTooltip>
    </PlRow>

    <h4>PlIcon24</h4>

    <PlRow wrap>
      <PlTooltip v-for="(name, i) of maskIcons24" :key="i">
        <PlIcon24 :name="name" />
        <template #tooltip> icon-24 icon-{{ name }} </template>
      </PlTooltip>
    </PlRow>

    <h4>PlMaskIcon16</h4>

    <PlRow wrap>
      <PlBtnGhost v-for="(name, i) of maskIcons16" :key="i">
        {{ name }}
        <template #append>
          <PlMaskIcon16 :name="name" />
        </template>
      </PlBtnGhost>
    </PlRow>

    <h4>PlMaskIcon24</h4>

    <PlRow wrap>
      <PlBtnGhost v-for="(name, i) of maskIcons24" :key="i">
        {{ name }}
        <template #append>
          <PlMaskIcon24 :name="name" />
        </template>
      </PlBtnGhost>
    </PlRow>
  </PlBlockPage>
</template>
