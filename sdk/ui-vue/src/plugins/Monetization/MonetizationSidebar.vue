<script setup lang="ts">
import { ref, computed } from 'vue';
import { PlSlideModal, PlBtnGhost, PlDropdown, PlAlert, PlIcon24 } from '@milaboratories/uikit';
import { useButtonTarget } from './useButtonTarget';
import { useInfo } from './useInfo';
import UserCabinetCard from './UserCabinetCard.vue';
import RunStatus from './RunStatus.vue';
import LimitCard from './LimitCard.vue';
const isOpen = ref(false);

const teleportTarget = useButtonTarget();

const { result, error, hasMonetization, canRun, status } = useInfo();

const productName = computed(() => result.value?.productName);

const userCabinetUrl = computed(() => {
  if (!result.value) return undefined;

  return `https://scientist.platforma.bio/product/${result.value.productKey}`;
});

const options = computed(() => {
  if (!result.value) return [];

  return [
    {
      label: result.value.productName,
      value: result.value.productName,
    },
  ];
});

// TODO: update api to return limits as list of objects

const used = computed(() => {
  return result.value?.mnz.details.spentRuns ?? 0;
});

const toSpend = computed(() => {
  return result.value?.mnz.details.runsToSpend ?? 0;
});

const available = computed(() => {
  return result.value?.mnz.details.willRemainAfterRun ?? null;
});

const statusText = computed(() => {
  if (status.value === 'limits_exceeded') return 'Limits exceeded for current billing period';
  if (status.value === 'payment_required') return 'Awaiting payment';
  if (status.value === 'select-tariff') return 'Select tariff in the scientist cabinet';
  return '';
});

const btnIcon = computed(() => {
  if (canRun.value) return 'monetization-on';
  return 'monetization-off';
});
</script>

<template>
  <PlSlideModal v-if="hasMonetization" v-model="isOpen">
    <template #title>
      Subscription
    </template>
    <PlDropdown label="Product" readonly :model-value="productName" :options="options" />
    <RunStatus :can-run="canRun" />
    <PlAlert v-if="error" type="error">
      {{ error }}
    </PlAlert>
    <PlAlert v-if="statusText" type="warn" :class="$style.statusText">{{ statusText }}</PlAlert>
    <UserCabinetCard v-if="userCabinetUrl" :user-cabinet-url="userCabinetUrl" />
    <LimitCard
      v-if="status === 'active' || status === 'limits_exceeded'"
      label="Runs Limit" :used="used"
      :to-spend="toSpend"
      :available="available"
    />
  </PlSlideModal>
  <!-- Teleport to the title slot -->
  <Teleport v-if="hasMonetization && teleportTarget" :to="teleportTarget">
    <PlBtnGhost @click.stop="isOpen = true">
      Subscription
      <template #append>
        <PlIcon24 :name="btnIcon" />
      </template>
    </PlBtnGhost>
  </Teleport>
</template>

<style module>
.mnzContainer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid #e0e0e0;
  padding: 20px;
  border-radius: 8px;
  position: relative;
  background-color: #fafafa;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  max-width: 600px;
}

.info {
  position: absolute;
  top: 10px;
  right: 10px;
  color: #666;
  cursor: pointer;
}

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.statusIndicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #ccc;
}

.statusActive {
  background-color: #4caf50;
}

.statusSelectTariff {
  background-color: #ff9800;
}

.statusPaymentRequired {
  background-color: #f44336;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.statusMessage {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 6px;
  background-color: #f5f5f5;
  border-left: 4px solid #ccc;
}

.warningIcon {
  color: #ff9800;
}

.successIcon {
  color: #4caf50;
}

.urlSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background-color: #f0f0f0;
  border-radius: 6px;
}

.urlLabel {
  font-weight: 500;
  color: #555;
}

.urlActions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.urlDisplay {
  font-family: monospace;
  font-size: 14px;
  color: #0066cc;
  background-color: #e6e6e6;
  padding: 6px 10px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.copyButton {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.copyButton:hover {
  background-color: #0b7dda;
}

.copyButton:active {
  background-color: #0a6bbd;
}

.copiedMessage {
  color: #4caf50;
  font-size: 14px;
  font-weight: 500;
}

.details {
  margin-top: 10px;
  padding: 16px;
  background-color: #f5f5f5;
  border-radius: 6px;
}

.detailsTitle {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 500;
  color: #444;
}

.detailsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.detailItem {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detailLabel {
  font-size: 14px;
  color: #666;
}

.detailValue {
  font-size: 16px;
  font-weight: 500;
  color: #333;
}
</style>
