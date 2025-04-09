<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  used: number;
  toSpend: number;
  available: number | null; // If available is null it means Unlimited
  unit?: string;
}>();

const toSpendPercentage = computed(() => {
  if (props.available === null) return 0;
  return (props.toSpend / props.available) * 100;
});

const usedPercentage = computed(() => {
  if (props.available === null) return 0;
  return (props.used / props.available) * 100;
});

const availablePercentage = computed(() => {
  if (props.available === null) return 100;
  return 100 - usedPercentage.value - toSpendPercentage.value;
});
</script>

<template>
  <div :class="$style.container">
    <span :class="$style.label">{{ label }}</span>
    <div :class="$style.content">
      <div :class="$style.contentAvailable">
        Available:
        <div style="flex: 1" />
        <span v-if="available !== null"><strong>{{ available }}</strong> / {{ available + toSpend + used }}</span>
        <span v-else>Unlimited</span>
      </div>
      <div :class="$style.progressBar">
        <span :class="$style.progressBarAvailable" :style="{ width: `${availablePercentage}%` }" />
        <span :class="$style.progressBarToSpend" :style="{ width: `${toSpendPercentage}%` }" />
        <span :class="$style.progressBarUsed" :style="{ width: `${usedPercentage}%` }" />
      </div>
      <div v-if="available !== null" :class="$style.legends">
        <div :class="$style.usedLegend">
          <i/>
          Used: {{ used }}
        </div>
        <div :class="$style.toSpendLegend">
          <i/>
          To spend: {{ toSpend }}
        </div>
      </div>
    </div>
  </div>
</template>

<style module>
.container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: #F7F8FA;
  border-radius: 6px;
  padding: 10px 12px 16px 12px;
  color: var(--txt-01);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  border: 1px solid var(--border-color-div-grey);
}

.label {
  display: block;
  margin-bottom: 30px;
  color: var(--txt-01);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px; /* 142.857% */
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.contentAvailable {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  strong {
    font-size: 28px;
    font-weight: 500;
    line-height: 36px; /* 128.571% */
    letter-spacing: -0.56px;
  }
}

.progressBar {
  width: 100%;
  height: 8px;
  background-color: #E0E0E0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  border: 1px solid var(--border-color-default);
  > span {
    display: block;
    height: 100%;
  }
}

.progressBarAvailable {
  background-color: #49CC49;
  border-radius: 4px;
}

.progressBarUsed {
  background-color: #FFCECC;
  border-radius: 4px;
}

.progressBarToSpend {
  background-color: #FAF5AA;
  border-radius: 4px;
}

.legends {
  display: flex;
  gap: 8px;

  > div {
    flex: 1;
  }

  i {
    display: block;
    border-radius: 1px;
    border: 1px solid var(--border-color-default);
    width: 16px;
    height: 16px;
  }
}

.usedLegend {
  display: flex;
  align-items: center;
  gap: 8px;
  i {
    background: #FFCECC;
  }
}

.toSpendLegend {
  display: flex;
  align-items: center;
  gap: 8px;
  i {
    background: #FAF5AA;
  }
}
</style>
