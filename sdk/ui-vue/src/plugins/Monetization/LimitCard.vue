<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  type: "unique_launches" | "volume_limit";
  label: string;
  used: number;
  toSpend: number;
  available: number | null; // If available is null it means Unlimited
  unit?: string;
}>();

const total = computed(() => {
  if (props.available === null) return null;
  return props.available + props.toSpend + props.used;
});

const exceeded = computed(() => {
  if (props.available === null) return false;
  return props.available < 0;
});

const availableNow = computed(() => {
  if (props.available === null) return null;
  return props.available + props.toSpend;
});

const clampPercentage = (n: number) => Math.max(0, Math.min(100, n));

const toSpendPercentage = computed(() => {
  if (total.value === null) return 0;
  if (total.value === 0) return 0;
  if (exceeded.value) return 0;
  return clampPercentage((props.toSpend / total.value) * 100);
});

const usedPercentage = computed(() => {
  if (total.value === null) return 0;
  if (total.value === 0) return 0;
  return clampPercentage((props.used / total.value) * 100);
});

const availablePercentage = computed(() => {
  if (props.available === null) return 100;
  if (total.value === null) return 100;
  if (total.value === 0) return 100;
  if (exceeded.value) return 0;
  return clampPercentage((props.available / total.value) * 100);
});

const computedLabel = computed(() => {
  if (props.type === "unique_launches") return "Runs Limits";
  if (props.type === "volume_limit") return "Volume Limits";
  return props.label;
});

const toGB = (v: number) => {
  return (v / 1024 / 1024 / 1024).toFixed(2) + " GB";
};

const formatUnit = (v: number) => {
  if (props.type === "volume_limit") return toGB(v);
  return v;
};

const showBar = (n: number) => {
  return Number(n.toFixed(2)) > 0;
};
</script>

<template>
  <div :class="$style.container">
    <span :class="$style.label">{{ computedLabel }}</span>
    <div :class="$style.content">
      <div :class="$style.contentAvailable">
        <div>
          Available:
          <div style="flex: 1" />
          <span v-if="availableNow !== null"
            ><strong>{{ formatUnit(availableNow) }}</strong> /
            {{ formatUnit(available! + toSpend + used) }}</span
          >
          <span v-else>Unlimited</span>
        </div>
        <div :class="[$style.afterRun, { [$style.exceeded]: exceeded }]">
          <span v-if="exceeded">Too many files selected</span>
          <span style="flex: 1" />
          <span>After run:</span>
          <span v-if="available !== null"
            >{{ formatUnit(available) }} / {{ formatUnit(available + toSpend + used) }}</span
          >
        </div>
        <div :class="[$style.progressBar, { [$style.exceeded]: exceeded }]">
          <span
            v-if="showBar(availablePercentage)"
            :class="$style.progressBarAvailable"
            :style="{ width: `${availablePercentage.toFixed(2)}%` }"
          />
          <span
            v-if="showBar(toSpendPercentage)"
            :class="$style.progressBarToSpend"
            :style="{ width: `${toSpendPercentage.toFixed(2)}%` }"
          />
          <span
            v-if="showBar(usedPercentage)"
            :class="$style.progressBarUsed"
            :style="{ width: `${usedPercentage.toFixed(2)}%` }"
          />
        </div>
      </div>
      <div :class="$style.legends">
        <div :class="$style.toSpendLegend">
          <span />
          To spend: {{ formatUnit(toSpend) }}
        </div>
        <div :class="$style.usedLegend">
          <span />
          Used: {{ formatUnit(used) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style module>
.container {
  display: flex;
  flex-direction: column;
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
  min-height: 36px;
  margin-bottom: 8px;
  color: var(--txt-01);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px; /* 142.857% */
}

.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.contentAvailable {
  display: flex;
  flex-direction: column;
  gap: 6px;
  > div {
    display: flex;
    align-items: flex-start;
  }
  > div:first-child {
    gap: 8px;
    strong {
      font-size: 28px;
      font-weight: 500;
      line-height: 36px; /* 128.571% */
      letter-spacing: -0.56px;
    }
  }
}

.afterRun {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 12px;
  font-style: normal;
  font-weight: 500;
  line-height: 16px;
  color: var(--txt-03);
  &.exceeded {
    color: var(--txt-error);
  }
}

.progressBar {
  width: 100%;
  height: 12px;
  background-color: #e0e0e0;
  display: flex;
  align-items: center;
  border: 1px solid var(--border-color-default);
  > span {
    display: block;
    height: 100%;
    outline: 1px solid var(--border-color-default);
  }
  &.exceeded {
    opacity: 0.2;
  }
}

.progressBarAvailable {
  background: linear-gradient(270deg, #a1e59c 0%, #d0f5b0 98.81%);
}

.progressBarUsed {
  background-color: #ffcecc;
}

.progressBarToSpend {
  background-color: #faf5aa;
}

.legends {
  display: flex;
  justify-content: space-between;
  gap: 8px;

  span {
    display: block;
    border-radius: 1px;
    border: 1px solid var(--border-color-default);
    width: 12px;
    height: 12px;
  }
}

.usedLegend {
  display: flex;
  align-items: center;
  gap: 8px;
  span {
    background: #ffcecc;
  }
}

.toSpendLegend {
  display: flex;
  align-items: center;
  gap: 8px;
  span {
    background: #faf5aa;
  }
}
</style>
