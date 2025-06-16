<script setup lang="ts">
import {
  maskIcons16,
  maskIcons24,
  PlBlockPage,
  PlBtnGhost,
  PlIcon,
  PlIcon16,
  PlIcon24,
  PlMaskIcon16,
  PlMaskIcon24,
  PlRow,
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

const filteredMaskIcons16 = computed(() => maskIcons16.filter((v) => v.includes(iconFilter.value)));
const filteredMaskIcons24 = computed(() => maskIcons24.filter((v) => v.includes(iconFilter.value)));
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
      <div v-if="filteredMaskIcons16.length === 0 && filteredMaskIcons24.length === 0">
        Cannot find Icons
      </div>

      <PlTooltip v-for="(name, i) of filteredMaskIcons16" :key="i">
        <PlIcon
          :name="`16_${name}`"
          :width="iconSize"
          :height="iconSize"
          :colors="[iconColor1, iconColor2]"
          :stroke="iconStroke"
        />
        <template #tooltip>{{ `16_${name}` }}</template>
      </PlTooltip>

      <PlTooltip v-for="(name, i) of filteredMaskIcons24" :key="i">
        <PlIcon
          :name="`24_${name}`"
          :width="iconSize"
          :height="iconSize"
          :colors="[iconColor1, iconColor2]"
          :stroke="iconStroke"
        />
        <template #tooltip>{{ `24_${name}` }}</template>
      </PlTooltip>
    </PlRow>

    <h4>PlIcon16</h4>

    <PlRow wrap>
      <PlTooltip v-for="(name, i) of maskIcons16" :key="i">
        <PlIcon16 :name="name" />
        <template #tooltip> icon-16 icon-{{ name }}</template>
      </PlTooltip>
    </PlRow>

    <h4>PlIcon24</h4>

    <PlRow wrap>
      <PlTooltip v-for="(name, i) of maskIcons24" :key="i">
        <PlIcon24 :name="name" />
        <template #tooltip> icon-24 icon-{{ name }}</template>
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
