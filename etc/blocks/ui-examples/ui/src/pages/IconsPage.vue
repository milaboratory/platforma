<script setup lang="ts">
import {
  icons16,
  icons24,
  PlBlockPage,
  PlIcon16,
  PlIcon24,
  PlRow,
  PlSvg,
  PlTooltip,
} from '@platforma-sdk/ui-vue';
import { computed, ref } from 'vue';

const iconFilter = ref('');
const iconSizeRaw = ref();
const iconSize = computed(() =>
  iconSizeRaw.value == null ? undefined : iconSizeRaw.value == 0 ? undefined : iconSizeRaw.value,
);
const iconColor1 = ref('');
const iconColor2 = ref('');
const iconStroke = ref('');

const filteredIcons16 = computed(() => icons16.filter((v) => v.includes(iconFilter.value)));
const filteredIcons24 = computed(() => icons24.filter((v) => v.includes(iconFilter.value)));
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>Icons/Masks page</template>

    <h4>Icons</h4>
    <input v-model="iconFilter" :class="$style.input" placeholder="icon filter" />
    <div :class="$style.inputs">
      <input
        v-model="iconSizeRaw"
        :class="$style.input"
        placeholder="size"
        type="number"
        min="8"
        max="50"
      />
      <input v-model="iconColor1" :class="$style.input" placeholder="first color" />
      <input v-model="iconColor2" :class="$style.input" placeholder="second color" />
      <input v-model="iconStroke" :class="$style.input" placeholder="stroke color" />
    </div>
    <PlRow wrap>
      <div v-if="filteredIcons16.length === 0 && filteredIcons24.length === 0">
        Cannot find Icons
      </div>

      <PlTooltip v-for="(name, i) of filteredIcons16" :key="i">
        <PlSvg
          :name="`16_${name}`"
          :width="iconSize"
          :height="iconSize"
          :color="[iconColor1, iconColor2]"
          :stroke="iconStroke"
        />
        <template #tooltip>{{ `16_${name}` }}</template>
      </PlTooltip>

      <PlTooltip v-for="(name, i) of filteredIcons24" :key="i">
        <PlSvg
          :name="`24_${name}`"
          :width="iconSize"
          :height="iconSize"
          :color="[iconColor1, iconColor2]"
          :stroke="iconStroke"
        />
        <template #tooltip>{{ `24_${name}` }}</template>
      </PlTooltip>
    </PlRow>

    <h4>PlIcon16</h4>

    <PlRow wrap>
      <PlTooltip v-for="(name, i) of icons16" :key="i">
        <PlIcon16 :name="name" />
        <template #tooltip> icon-16 icon-{{ name }}</template>
      </PlTooltip>
    </PlRow>

    <h4>PlIcon24</h4>

    <PlRow wrap>
      <PlTooltip v-for="(name, i) of icons24" :key="i">
        <PlIcon24 :name="name" />
        <template #tooltip> icon-24 icon-{{ name }}</template>
      </PlTooltip>
    </PlRow>
  </PlBlockPage>
</template>

<style module>
.inputs {
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.input {
  flex-grow: 1;
  min-width: 100px;
}
</style>
