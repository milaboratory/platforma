<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  type: 'unique_launches' | 'volume_limit';
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

const computedLabel = computed(() => {
  if (props.type === 'unique_launches') return 'Runs Limits';
  if (props.type === 'volume_limit') return 'Volume Limits';
  return props.label;
});

const toGB = (v: number) => {
  return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB';
};

const formatUnit = (v: number) => {
  if (props.type === 'volume_limit') return toGB(v);
  return v;
};
</script>

<template>
  <div :class="$style.container">
    <span :class="$style.label">{{ computedLabel }}</span>
    <div :class="$style.content">
      <div :class="$style.contentAvailable">
        Available:
        <div style="flex: 1" />
        <span v-if="available !== null"><strong>{{ formatUnit(available) }}</strong> / {{ formatUnit(available + toSpend + used) }}</span>
        <span v-else>Unlimited</span>
      </div>
      <div :class="$style.progressBar">
        <span :class="$style.progressBarAvailable" :style="{ width: `${availablePercentage}%` }" />
        <span :class="$style.progressBarToSpend" :style="{ width: `${toSpendPercentage}%` }" />
        <span :class="$style.progressBarUsed" :style="{ width: `${usedPercentage}%` }" />
      </div>
      <div :class="$style.legends">
        <div :class="$style.usedLegend">
          <span/>
          Used: {{ formatUnit(used) }}
        </div>
        <div :class="$style.toSpendLegend">
          <span/>
          To spend: {{ formatUnit(toSpend) }}
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
  background-color: var(--bg-base-light);
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

  span {
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
  span {
    background: #FFCECC;
  }
}

.toSpendLegend {
  display: flex;
  align-items: center;
  gap: 8px;
  span {
    background: #FAF5AA;
  }
}
</style>
